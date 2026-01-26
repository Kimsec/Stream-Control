from flask import Flask, render_template, jsonify, session, redirect, url_for, request, send_from_directory, make_response, abort
from obsws_python import ReqClient
from datetime import timedelta, datetime, timezone
from dotenv import load_dotenv
import os, subprocess, requests, json, time
import fcntl
from threading import Lock, Thread, Event  # added Thread & Event for token maint
from ipaddress import ip_address
from flask_sock import Sock
from werkzeug.security import check_password_hash
from werkzeug.middleware.proxy_fix import ProxyFix

app = Flask(__name__)           # OPPRETT APP FØRST

# Configure proxy middleware for Cloudflare Tunnel
# Trust 1 proxy for X-Forwarded-For, X-Forwarded-Proto, X-Forwarded-Host
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=0, x_prefix=0)

sock = Sock(app)                # så initialiser Sock

load_dotenv()

FLASK_SECRET_KEY       = os.getenv("FLASK_SECRET_KEY")
CONFIG_PATH            = os.getenv("CONFIG_PATH")
NGINX_CONF_OUT         = os.getenv("NGINX_CONF_OUT")

MINI_PC_USER           = os.getenv("MINI_PC_USER")
MINI_PC_IP             = os.getenv("MINI_PC_IP")
MAC_ADDRESS            = os.getenv("MAC_ADDRESS")

OBS_HOST               = os.getenv("OBS_HOST")
OBS_PORT               = int(os.getenv("OBS_PORT"))
OBS_PASSWORD           = os.getenv("OBS_PASSWORD")

TWITCH_CLIENT_ID       = os.getenv("TWITCH_CLIENT_ID")
TWITCH_OAUTH_TOKEN     = os.getenv("TWITCH_OAUTH_TOKEN")
TWITCH_BROADCASTER_ID  = os.getenv("TWITCH_BROADCASTER_ID")
TWITCH_CLIENT_SECRET   = os.getenv("TWITCH_CLIENT_SECRET")
TWITCH_REFRESH_TOKEN   = os.getenv("TWITCH_REFRESH_TOKEN", "")
TWITCH_TOKENS_PATH     = os.getenv("TWITCH_TOKENS_PATH", os.path.join(os.path.dirname(__file__), "twitch_tokens.json"))

LOGIN_PASSWORD_HASH    = os.getenv("LOGIN_PASSWORD_HASH")
HLS_ROOT               = os.getenv("HLS_ROOT", "/tmp/hls")
CHATBOT_PREF_PATH      = os.getenv("CHATBOT_PREF_PATH", os.path.join(os.path.dirname(__file__), "chatbot_autostart.json"))

# Chatbot moderation (add-only via Stream-Control UI)
CHATBOT_BANNED_WORDS_PATH = os.getenv(
    "CHATBOT_BANNED_WORDS_PATH",
    "/home/kim3k/chatbot/banned_words.txt",
)


BAN_MAX_ATTEMPTS       = int(os.getenv("BAN_MAX_ATTEMPTS", "3"))
BAN_DATA_PATH          = os.getenv("BAN_DATA_PATH", os.path.join(os.path.dirname(__file__), "bans.json"))
_ban_lock = Lock()
_ban_cache = {"attempts": {}, "bans": {}}  # structure: attempts[ip] = {count:int, first_ts, last_ts, agents:set}; bans[ip] = {...}

def _load_ban_file():
    global _ban_cache
    try:
        with open(BAN_DATA_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if isinstance(data, dict):
            # normalize sets
            for ip, rec in data.get('attempts', {}).items():
                if isinstance(rec.get('agents'), list):
                    rec['agents'] = set(rec['agents'])
            _ban_cache = data
            # ensure keys
            _ban_cache.setdefault('attempts', {})
            _ban_cache.setdefault('bans', {})
        else:
            _ban_cache = {"attempts": {}, "bans": {}}
    except Exception:
        _ban_cache = {"attempts": {}, "bans": {}}

def _save_ban_file():
    tmp = {"attempts": {}, "bans": {}}
    for ip, rec in _ban_cache.get('attempts', {}).items():
        tmp['attempts'][ip] = {**rec, 'agents': sorted(list(rec.get('agents', [])))[:10]}
    tmp['bans'] = _ban_cache.get('bans', {})
    try:
        with open(BAN_DATA_PATH, 'w', encoding='utf-8') as f:
            json.dump(tmp, f, indent=2)
        try:
            os.chmod(BAN_DATA_PATH, 0o600)
        except Exception:
            pass
    except Exception:
        pass

_load_ban_file()

_chatbot_pref_lock = Lock()
_chatbot_autostart_enabled = True


def _append_banned_word(entry: str) -> bool:
    s = (entry or "").strip()
    if not s:
        raise ValueError("Missing word")
    if "\n" in s or "\r" in s:
        raise ValueError("Newlines are not allowed")
    if len(s) > 200:
        raise ValueError("Too long (max 200 chars)")

    path = CHATBOT_BANNED_WORDS_PATH
    dirpath = os.path.dirname(path) or "."
    os.makedirs(dirpath, exist_ok=True)

    # Minimal behavior: lock the target file and append one line.
    # This does not change file permissions.
    with open(path, "a+", encoding="utf-8") as f:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX)
        f.seek(0)
        raw = f.read()
        existing_lines = raw.splitlines()

        norm_existing = set()
        for line in existing_lines:
            t = (line or "").strip()
            if not t or t.startswith("#"):
                continue
            norm_existing.add(t.casefold())

        if s.casefold() in norm_existing:
            return False

        # Keep one-entry-per-line; if file doesn't end with newline, add one first.
        f.seek(0, os.SEEK_END)
        if raw and not raw.endswith("\n"):
            f.write("\n")
        f.write(s + "\n")
        f.flush()
        os.fsync(f.fileno())
        return True

def _load_chatbot_pref_file():
    global _chatbot_autostart_enabled
    with _chatbot_pref_lock:
        try:
            with open(CHATBOT_PREF_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
            _chatbot_autostart_enabled = bool(data.get('enabled', True))
        except Exception:
            _chatbot_autostart_enabled = True

def _persist_chatbot_pref(value: bool):
    global _chatbot_autostart_enabled
    with _chatbot_pref_lock:
        _chatbot_autostart_enabled = bool(value)
        try:
            with open(CHATBOT_PREF_PATH, 'w', encoding='utf-8') as f:
                json.dump({'enabled': _chatbot_autostart_enabled}, f, indent=2)
            try:
                os.chmod(CHATBOT_PREF_PATH, 0o600)
            except Exception:
                pass
        except Exception:
            pass

def _get_chatbot_pref() -> bool:
    with _chatbot_pref_lock:
        return _chatbot_autostart_enabled

_load_chatbot_pref_file()

def _client_ip() -> str:
    # Cloudflare tunnel: prefer CF-Connecting-IP header
    hdrs = request.headers
    ip = hdrs.get('CF-Connecting-IP') or hdrs.get('X-Forwarded-For', '').split(',')[0].strip() or request.remote_addr or '0.0.0.0'
    # basic sanitation
    try:
        ip_obj = ip_address(ip)
        return str(ip_obj)
    except Exception:
        return '0.0.0.0'

def _is_ip_banned(ip: str) -> bool:
    with _ban_lock:
        return ip in _ban_cache['bans']

def _register_failed_attempt(ip: str, user_agent: str):
    now = time.time()
    with _ban_lock:
        attempts = _ban_cache['attempts'].setdefault(ip, {"count":0, "first_ts":now, "last_ts":now, "agents": set()})
        attempts['count'] += 1
        attempts['last_ts'] = now
        attempts['agents'].add(user_agent[:160])  # truncate UA
        if attempts['count'] >= BAN_MAX_ATTEMPTS and ip not in _ban_cache['bans']:
            _ban_cache['bans'][ip] = {
                "banned_ts": now,
                "reason": f"Exceeded {BAN_MAX_ATTEMPTS} failed login attempts",
                "attempts": attempts['count'],
                "agents": sorted(list(attempts['agents']))[:10]
            }
        _save_ban_file()

def _register_success(ip: str):
    with _ban_lock:
        if ip in _ban_cache['attempts']:
            del _ban_cache['attempts'][ip]
            _save_ban_file()

def _list_bans():
    with _ban_lock:
        return _ban_cache['bans'].copy()

def _unban_ip(ip: str) -> bool:
    with _ban_lock:
        if ip in _ban_cache['bans']:
            del _ban_cache['bans'][ip]
        if ip in _ban_cache['attempts']:
            del _ban_cache['attempts'][ip]
        _save_ban_file()
        return True
    return False

app.secret_key = FLASK_SECRET_KEY
app.permanent_session_lifetime = timedelta(days=7)

# Secure session cookies when behind HTTPS proxy (Cloudflare Tunnel)
app.config['SESSION_COOKIE_SECURE'] = True
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

# Dekoratør for å beskytte sensitive ruter
def login_required(f):
    from functools import wraps
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('authenticated'):
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    ip = _client_ip()
    if _is_ip_banned(ip):
        # Return 403 with generic message (avoid enumerating policy)
        return render_template('login.html', error="Access denied. Too many attempts.", banned=True), 403
    if request.method == 'POST':
        entered_password = request.form.get('password', '')
        if LOGIN_PASSWORD_HASH and check_password_hash(LOGIN_PASSWORD_HASH, entered_password):
            session.permanent = True
            session['authenticated'] = True
            _register_success(ip)
            return redirect(url_for('home'))
        else:
            _register_failed_attempt(ip, request.headers.get('User-Agent','?'))
            # Optional: do not indicate remaining attempts to prevent probing
            banned_now = _is_ip_banned(ip)
            error = "Incorrect password." if not banned_now else "Access denied. Too many attempts."
            if banned_now:
                return render_template('login.html', error=error, banned=True), 403
    return render_template('login.html', error=error, banned=False)


@app.route('/')
@login_required
def home():
    return render_template('control.html')

@app.route('/bans')
@login_required
def bans_page():
    return render_template('bans.html')

@app.get('/api/bans')
@login_required
def api_bans():
    data = _list_bans()
    return jsonify({"bans": data, "count": len(data)})

@app.post('/api/unban')
@login_required
def api_unban():
    js = request.get_json(silent=True) or {}
    ip = (js.get('ip') or '').strip()
    if not ip:
        return jsonify({"ok": False, "error": "Missing ip"}), 400
    ok = _unban_ip(ip)
    return jsonify({"ok": ok})

@app.route('/logout')
def logout():
    session.pop('authenticated', None)
    return redirect(url_for('login'))

@app.route('/status')
@login_required
def get_status():
    response = subprocess.run(["ping", "-c", "1", MINI_PC_IP], stdout=subprocess.DEVNULL)
    if response.returncode == 0:
        return jsonify({"status": "on"})
    else:
        return jsonify({"status": "off"})

@app.route('/poweron', methods=['POST'])
@login_required
def poweron():
    result = os.system(f'wakeonlan {MAC_ADDRESS}')
    if result == 0:
        return 'Turning on Mini-PC', 200
    else:
        return 'Failed to send Wake-on-LAN packet', 500

@app.route('/shutdown', methods=['POST'])
@login_required
def shutdown():
    r = subprocess.run(['ssh', f'{MINI_PC_USER}@{MINI_PC_IP}', 'sudo', 'shutdown', '-h', 'now'])
    return ('Turning off Mini-PC', 200) if r.returncode == 0 else ('Failed to send shutdown command', 500)

@app.route('/restart', methods=['POST'])
@login_required
def restart():
    r = subprocess.run(['ssh', f'{MINI_PC_USER}@{MINI_PC_IP}', 'sudo', 'reboot', 'now'])
    return ('Rebooting Mini-PC', 200) if r.returncode == 0 else ('Failed to send restart command', 500)


def connect_obs():
    return ReqClient(
        host=OBS_HOST,
        port=OBS_PORT,
        password=OBS_PASSWORD,
        timeout=5
    )


@app.route('/obs/start_stream', methods=['POST'])
@login_required
def start_stream():
    try:
        cl = connect_obs()
        cl.start_stream()
        cl.set_current_program_scene("Starting soon")
        return "Stream started and switched to 'Starting soon' scene", 200
    except Exception as e:
        return f"Error starting stream: {e}", 500


@app.route('/obs/stop_stream', methods=['POST'])
@login_required
def stop_stream():
    try:
        cl = connect_obs()
        cl.stop_stream()
        cl.set_current_program_scene("Offline")
        return "Stream stopped successfully", 200
    except Exception as e:
        return f"Error stopping stream: {e}", 500


@app.route('/obs/stream_status')
@login_required
def obs_stream_status():
    try:
        cl = connect_obs()
        resp_s = cl.get_stream_status()
        # Bruk kun 'output_active' uten å sjekke data
        is_streaming = resp_s.output_active

        server_now_unix = int(time.time())

        obs_uptime_seconds = None
        if is_streaming:
            # OBS WebSocket v5: GetStreamStatus returns either outputTimecode or outputDuration.
            # obsws_python maps these to snake_case attributes.
            tc = getattr(resp_s, 'output_timecode', None) or getattr(resp_s, 'outputTimecode', None)
            if isinstance(tc, str) and tc:
                try:
                    # "HH:MM:SS.mmm" (or "HH:MM:SS")
                    parts = tc.split(':')
                    if len(parts) == 3:
                        hh = int(parts[0] or 0)
                        mm = int(parts[1] or 0)
                        ss_part = parts[2]
                        ss = int((ss_part.split('.', 1)[0] or '0'))
                        obs_uptime_seconds = max(0, hh * 3600 + mm * 60 + ss)
                except Exception:
                    obs_uptime_seconds = None

            if obs_uptime_seconds is None:
                dur_ms = getattr(resp_s, 'output_duration', None) or getattr(resp_s, 'outputDuration', None)
                if dur_ms is not None:
                    try:
                        obs_uptime_seconds = max(0, int(float(dur_ms) / 1000.0))
                    except Exception:
                        obs_uptime_seconds = None

        resp_sc = cl.get_current_program_scene()
        current_scene = resp_sc.current_program_scene_name

        # Removed verbose logging - enable for debugging if needed
        # print(f"[OBS] Streaming: {is_streaming}; Scene: {current_scene}")
        out = {
            "isStreaming": is_streaming,
            "currentScene": current_scene,
            "server_now_unix": server_now_unix,
        }
        if obs_uptime_seconds is not None:
            out["obs_uptime_seconds"] = obs_uptime_seconds
        return jsonify(out)
    except Exception as e:
        print("OBS ws error:", e)
        return jsonify({"error": str(e)}), 500


@app.route('/obs/switch_scene', methods=['POST'])
@login_required
def switch_scene():
    try:
        data = request.get_json()
        scene_name = data.get('scene')

        if not scene_name:
            return "Scene name is required", 400

        cl = connect_obs()
        cl.set_current_program_scene(scene_name) 
        return f"Switched to {scene_name} scene", 200
    except Exception as e:
        return f"Error switching scene: {e}", 500


@app.route('/obs/update_title', methods=['POST'])
@login_required
def update_title():
    data = request.get_json()
    new_title = data.get('title')
    if not new_title:
        return "Title is required", 400
    token = ensure_user_token()
    if not token:
        return "Missing Twitch user token", 400
    url = f"https://api.twitch.tv/helix/channels?broadcaster_id={TWITCH_BROADCASTER_ID}"
    headers = {
        "Client-ID": TWITCH_CLIENT_ID,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    payload = {"title": new_title}

    try:
        resp = requests.patch(url, headers=headers, json=payload)
        if resp.status_code == 204:
            return "Stream title updated successfully on Twitch", 200
        else:
            print(f"Error from Twitch API: {resp.status_code} - {resp.text}")
            return f"Error updating Twitch title: {resp.text}", resp.status_code
    except Exception as e:
        print(f"Exception while updating Twitch title: {e}")
        return f"An error occurred: {e}", 500


@app.route('/twitch/search_categories', methods=['GET'])
@login_required
def search_categories():
    try:
        query = request.args.get('query')
        if not query:
            return "Query parameter is required", 400
        token = ensure_user_token()
        if not token:
            return "Missing Twitch user token", 400
        url = f"https://api.twitch.tv/helix/search/categories?query={query}"
        headers = {
            "Client-ID": TWITCH_CLIENT_ID,
            "Authorization": f"Bearer {token}"
        }

        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            return response.json(), 200
        else:
            return f"Error searching categories: {response.text}", response.status_code
    except Exception as e:
        return f"Error: {e}", 500


@app.route('/twitch/update_category', methods=['POST'])
@login_required
def update_category():
    try:
        data = request.get_json()
        category_id = data.get('category_id')
        new_title = data.get('title')
        if not category_id or not new_title:
            return "Both category ID and title are required", 400
        token = ensure_user_token()
        if not token:
            return "Missing Twitch user token", 400
        url = f"https://api.twitch.tv/helix/channels?broadcaster_id={TWITCH_BROADCASTER_ID}"
        headers = {
            "Client-ID": TWITCH_CLIENT_ID,
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        payload = {
            "game_id": category_id,  # Oppdaterer kategorien med ID
            "title": new_title       # Oppdaterer tittelen
        }

        response = requests.patch(url, headers=headers, json=payload)
        if response.status_code == 204:
            return "Category and title updated successfully", 200
        else:
            return f"Error updating category and title: {response.text}", response.status_code
    except Exception as e:
        return f"Error: {e}", 500


@app.route('/twitch/channel_info')
@login_required
def get_channel_info():
    try:
        token = ensure_user_token()
        if not token:
            return jsonify({"error": "Missing Twitch user token"}), 400
        url = f"https://api.twitch.tv/helix/channels?broadcaster_id={TWITCH_BROADCASTER_ID}"
        headers = {
            "Client-ID": TWITCH_CLIENT_ID,
            "Authorization": f"Bearer {token}"
        }
        resp = requests.get(url, headers=headers)
        resp.raise_for_status()  # Kaster feil for dårlig status (4xx eller 5xx)
        
        data = resp.json().get('data')
        if data:
            channel_data = data[0]
            title = channel_data.get('title', '')
            category = channel_data.get('game_name', '')  # Legg til kategorinavnet
            category_id = channel_data.get('game_id', '')  # Legg til kategori-ID
            broadcaster_name = channel_data.get('broadcaster_name', '')
            return jsonify({
                "title": title,
                "category": {"name": category, "id": category_id},  # Returner kategori som objekt
                "broadcaster_name": broadcaster_name
            })
        else:
            return jsonify({"error": "Could not find channel data"}), 404
    except requests.exceptions.RequestException as e:
        print(f"Error fetching Twitch channel info: {e}")
        error_text = f"Twitch API error: {e.response.text}" if e.response else str(e)
        return jsonify({"error": error_text}), 500


@app.route('/twitch/stream_info')
@login_required
def twitch_stream_info():
    try:
        server_now_unix = int(time.time())
        token = ensure_user_token()
        if not token:
            return jsonify({"error": "Missing Twitch user token"}), 400
        url = f"https://api.twitch.tv/helix/streams?user_id={TWITCH_BROADCASTER_ID}"
        headers = {
            "Client-ID": TWITCH_CLIENT_ID,
            "Authorization": f"Bearer {token}"
        }
        resp = requests.get(url, headers=headers, timeout=8)
        if resp.status_code == 401:
            # token may have just expired; try one on-demand refresh
            token2 = ensure_user_token()
            if token2 and token2 != token:
                headers["Authorization"] = f"Bearer {token2}"
                resp = requests.get(url, headers=headers, timeout=8)
        resp.raise_for_status()

        js = resp.json()
        data = (js.get('data') or [])
        if not data:
            return jsonify({"is_live": False, "viewer_count": 0, "server_now_unix": server_now_unix})
        s = data[0]

        started_at = s.get("started_at", "")
        started_at_unix = None
        uptime_seconds = None
        if started_at:
            try:
                # Twitch returns UTC timestamps with Z suffix.
                dt = datetime.fromisoformat(started_at.replace('Z', '+00:00'))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                started_at_unix = int(dt.timestamp())
                uptime_seconds = max(0, int(server_now_unix - started_at_unix))
            except Exception:
                started_at_unix = None
                uptime_seconds = None

        out = {
            "is_live": True,
            "viewer_count": int(s.get("viewer_count", 0) or 0),
            "title": s.get("title", ""),
            "game_name": s.get("game_name", ""),
            "started_at": started_at,
            "server_now_unix": server_now_unix,
        }
        if started_at_unix is not None:
            out["started_at_unix"] = started_at_unix
        if uptime_seconds is not None:
            out["uptime_seconds"] = uptime_seconds
        return jsonify(out)
    except requests.exceptions.RequestException as e:
        resp_obj = getattr(e, 'response', None)
        err = f"Twitch API error: {resp_obj.text}" if resp_obj is not None else str(e)
        return jsonify({"error": err}), 502


@app.route('/twitch/raid', methods=['POST'])
@login_required
def raid_channel():
    data = request.get_json()
    to_channel_name = data.get('channel_name')
    if not to_channel_name:
        return "Channel name is required", 400
    token = ensure_user_token()
    if not token:
        return "Missing Twitch user token", 400
    try:
        url_user = f"https://api.twitch.tv/helix/users?login={to_channel_name}"
        headers_user = {
            "Client-ID": TWITCH_CLIENT_ID,
            "Authorization": f"Bearer {token}"
        }
        resp_user = requests.get(url_user, headers=headers_user)
        if resp_user.status_code != 200 or not resp_user.json().get('data'):
            return f"Could not find Twitch user '{to_channel_name}'", 404
        
        to_broadcaster_id = resp_user.json()['data'][0]['id']
    except Exception as e:
        return f"Error looking up user: {e}", 500

    # Step 2: Start the raid
    try:
        url_raid = f"https://api.twitch.tv/helix/raids?from_broadcaster_id={TWITCH_BROADCASTER_ID}&to_broadcaster_id={to_broadcaster_id}"
        headers_raid = {
            "Client-ID": TWITCH_CLIENT_ID,
            "Authorization": f"Bearer {token}"
        }
        resp_raid = requests.post(url_raid, headers=headers_raid)

        if resp_raid.status_code == 200:
            return f"Successfully started raid to {to_channel_name}!", 200
        else:
            return f"Failed to start raid: {resp_raid.text}", resp_raid.status_code
    except Exception as e:
        return f"Error starting raid: {e}", 500
    
@app.route('/rtmp_endpoints.json')
@login_required
def get_endpoints():
    return send_from_directory(
        os.path.dirname(CONFIG_PATH),
        os.path.basename(CONFIG_PATH),
        mimetype='application/json'
    )

@app.route('/api/update_push', methods=['POST'])
@login_required
def update_push():
    try:
        data = request.get_json()
        if not data or 'push_endpoints' not in data:
            return jsonify({"error": "Payload må inneholde push_endpoints"}), 400

        # 1) Oppdater JSON-fila
        with open(CONFIG_PATH, 'w') as f:
            json.dump({"push_endpoints": data['push_endpoints']}, f, indent=2)

        # 2) Rendre nginx-konfig fra Jinja2-malen
        rendered = render_template('nginx.conf.j2', push_endpoints=data['push_endpoints'])

        # 3) Skriv direkte til nginx.conf
        with open(NGINX_CONF_OUT, 'w') as f:
            f.write(rendered)

        try:
            subprocess.run(
                ['sudo', '-n', '/usr/sbin/nginx', '-t'],
                check=True, capture_output=True, text=True
            )
            subprocess.run(
                ['sudo', '-n', '/usr/sbin/nginx', '-s', 'reload'],
                check=True, capture_output=True, text=True
            )
        except subprocess.CalledProcessError as e:
            return jsonify({
                "error": "nginx-kommando feilet",
                "details": e.stderr.strip()
            }), 500

        return jsonify({"status": "ok"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    

# --- Chatbot via systemd ---
SERVICE_NAME = "chatbot"  # tilsvarer `systemctl start chatbot`
STREAM_GUARD_SERVICE_NAME = os.getenv("STREAM_GUARD_SERVICE_NAME", "stream-guard")  # systemd navn for StreamGuard
LOG_ALLOWED_SERVICES = {
    "streamguard": STREAM_GUARD_SERVICE_NAME,
    "chatbot": SERVICE_NAME,
    "nginx": "nginx",
    "stunnel": "stunnel-kick",
    "streamcontrol": "stream-control"
}

def _systemctl(cmd: str):
    r = subprocess.run(["sudo", "-n", "systemctl", cmd, SERVICE_NAME],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout).strip())
    return (r.stdout or "").strip()

@app.route('/bot/start', methods=['POST'])
@login_required
def bot_start():
    try:
        _systemctl("restart")  # restart = "start if not running, else reload"
        return jsonify({"ok": True})
    except Exception as e:
        return (f"start error: {e}", 500)

@app.route('/bot/stop', methods=['POST'])
@login_required
def bot_stop():
    try:
        _systemctl("stop")
        return jsonify({"ok": True})
    except Exception as e:
        return (f"stop error: {e}", 500)

@app.route('/bot/status')
@login_required
def bot_status():
    running = subprocess.run(["systemctl", "is-active", "--quiet", SERVICE_NAME]).returncode == 0
    return jsonify({"running": running})


@app.route('/api/chatbot_autostart', methods=['GET'])
@login_required
def get_chatbot_autostart():
    return jsonify({"enabled": _get_chatbot_pref()})


@app.route('/api/chatbot_autostart', methods=['POST'])
@login_required
def set_chatbot_autostart():
    payload = request.get_json(silent=True) or {}
    if 'enabled' not in payload or not isinstance(payload['enabled'], bool):
        return jsonify({"error": "enabled must be boolean"}), 400
    _persist_chatbot_pref(payload['enabled'])
    return jsonify({"enabled": payload['enabled']})


@app.post('/api/banned_words')
@login_required
def api_banned_words_add():
    payload = request.get_json(silent=True) or {}
    word = (payload.get('word') or '').strip()
    try:
        added = _append_banned_word(word)
        return jsonify({"ok": True, "added": bool(added), "already": (not added)})
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception as e:
        return jsonify({"ok": False, "error": f"write failed: {e}"}), 500


# --- Nginx via systemd ---
@app.route('/nginx/start', methods=['POST'])
@login_required
def nginx_start():
    try:
        subprocess.run(["sudo", "-n", "systemctl", "start", "nginx"], check=True)
        return jsonify({"ok": True})
    except Exception as e:
        return (f"start error: {e}", 500)

@app.route('/nginx/stop', methods=['POST'])
@login_required
def nginx_stop():
    try:
        subprocess.run(["sudo", "-n", "systemctl", "stop", "nginx"], check=True)
        return jsonify({"ok": True})
    except Exception as e:
        return (f"stop error: {e}", 500)

@app.route('/nginx/status')
@login_required
def nginx_status():
    running = subprocess.run(["systemctl", "is-active", "--quiet", "nginx"]).returncode == 0
    return jsonify({"running": running})


# --- Local preview (HLS pass-through via Flask) ---
def _safe_hls_path(subpath: str) -> str:
    # Constrain to HLS_ROOT and prevent directory traversal
    # send_from_directory will also protect, but we ensure we only ever serve under HLS_ROOT
    subpath = (subpath or '').lstrip('/')
    base = os.path.abspath(HLS_ROOT)
    full = os.path.abspath(os.path.join(base, subpath))
    if not full.startswith(base + os.sep) and full != base:
        raise FileNotFoundError('invalid path')
    return full

@app.get('/preview/list')
@login_required
def preview_list():
    try:
        live_dir = _safe_hls_path('live')
        if not os.path.isdir(live_dir):
            return jsonify({"playlists": []})
        items = []
        for name in os.listdir(live_dir):
            if not name.endswith('.m3u8'):
                continue
            p = os.path.join(live_dir, name)
            try:
                st = os.stat(p)
            except Exception:
                continue
            # keep even small files; client will probe contents
            items.append((st.st_mtime, f"live/{name}"))
        # newest first for convenience
        items.sort(key=lambda x: x[0], reverse=True)
        out = [path for _, path in items]
        return jsonify({"playlists": out})
    except Exception:
        return jsonify({"playlists": []})

@app.get('/preview/hls/<path:subpath>')
@login_required
def preview_hls(subpath: str):
    """Serve HLS playlists and segments from HLS_ROOT.
    Paths are resolved relative to HLS_ROOT and constrained to prevent traversal."""
    try:
        # Only allow under HLS_ROOT
        # Use send_from_directory with directory=HLS_ROOT and file=subpath
        # Set appropriate MIME types and disable caching
        # Infer mimetype by extension
        lower = subpath.lower()
        if lower.endswith('.m3u8'):
            mimetype = 'application/vnd.apple.mpegurl'
        elif lower.endswith('.ts'):
            mimetype = 'video/mp2t'
        else:
            mimetype = None  # let Flask guess

        # Ensure path is safe; will raise if invalid
        _safe_hls_path(subpath)
        resp = send_from_directory(HLS_ROOT, subpath, mimetype=mimetype, conditional=True)
        # No cache for live content
        resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        resp.headers['Pragma'] = 'no-cache'
        resp.headers['Expires'] = '0'
        return resp
    except FileNotFoundError:
        return abort(404)
    except Exception:
        return abort(404)


# --- Logs API & WebSocket ---
def _journalctl_unit_lines(unit: str, lines: int = 200):
    """Return last N lines from journal for unit. Safe: restrict unit to allowed list."""
    try:
        cmd = ["journalctl", "-u", unit, "-n", str(lines), "--no-pager", "-o", "short-iso"]
        # If root needed, attempt sudo -n (non-interactive) but only if not root already
        if os.geteuid() != 0:
            cmd = ["sudo", "-n"] + cmd
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
        if r.returncode != 0:
            out = (r.stderr or r.stdout).strip()
            return False, out.splitlines()[-15:]
        return True, r.stdout.rstrip().splitlines()
    except Exception as e:
        return False, [f"error: {e}"]

@app.get('/api/logs')
@login_required
def api_logs():
    svc = (request.args.get('service') or '').lower()
    lines = request.args.get('lines', '200')
    if not lines.isdigit():
        return jsonify({"error": "invalid lines"}), 400
    lines_i = max(10, min(1000, int(lines)))
    if svc not in LOG_ALLOWED_SERVICES:
        return jsonify({"error": "unknown service"}), 400
    ok, data = _journalctl_unit_lines(LOG_ALLOWED_SERVICES[svc], lines_i)
    return jsonify({"ok": ok, "service": svc, "unit": LOG_ALLOWED_SERVICES[svc], "lines": data})

@sock.route('/ws/logs')
def ws_logs(ws):
    # simple stream of journalctl -f
    # Expect query part: ...?service=streamguard
    try:
        # flask_sock doesn't parse query automatically; access environ
        q = ws.environ.get('QUERY_STRING') or ''
        params = dict(p.split('=',1) for p in q.split('&') if '=' in p)
        svc = (params.get('service') or '').lower()
        if svc not in LOG_ALLOWED_SERVICES:
            ws.send(json.dumps({"type": "error", "message": "unknown service"}))
            return
        unit = LOG_ALLOWED_SERVICES[svc]
        # Use -n 0 to avoid sending an extra backlog (we already fetched the initial lines via /api/logs)
        # This prevents duplicate lines and makes the selected initial line count (e.g. 25) accurate immediately.
        base_cmd = ["journalctl", "-u", unit, "-f", "-n", "0", "-o", "short-iso"]
        if os.geteuid() != 0:
            base_cmd = ["sudo", "-n"] + base_cmd
        proc = subprocess.Popen(base_cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        ws.send(json.dumps({"type": "info", "message": f"following {unit}"}))
        for line in proc.stdout:
            line = line.rstrip('\n')
            # basic size guard
            if len(line) > 2000:
                line = line[:2000] + '…'
            try:
                ws.send(json.dumps({"type": "line", "data": line}))
            except Exception:
                break
        try:
            proc.terminate()
        except Exception:
            pass
    except Exception as e:
        try:
            ws.send(json.dumps({"type": "error", "message": str(e)}))
        except Exception:
            pass


@app.route('/repair', methods=['POST'])
@login_required
def repair_backend():
    try:
        # Stop nginx.service
        subprocess.run(["sudo", "-n", "systemctl", "stop", "nginx"], check=True)
        time.sleep(1)
        # Start nginx.service
        subprocess.run(["sudo", "-n", "systemctl", "start", "nginx"], check=True)
        time.sleep(1)
        # Stop stream-guard.service
        subprocess.run(["sudo", "-n", "systemctl", "stop", STREAM_GUARD_SERVICE_NAME], check=True)
        time.sleep(1)
        # Start stream-guard.service
        subprocess.run(["sudo", "-n", "systemctl", "start", STREAM_GUARD_SERVICE_NAME], check=True)
        return "Backend repair completed successfully", 200
    except subprocess.CalledProcessError as e:
        return f"Repair failed: {e}", 500


@app.route('/manifest.json')
def manifest():
    return send_from_directory('.', 'manifest.json')

# --- Alerts API ---
_alert_lock = Lock()
_alert_seq = 0
_last_alert = None  # {"id": int, "type": "low|restored", "message": str, "ts": float}

_ws_lock = Lock()
_ws_clients = set()

def _ws_broadcast(payload: dict) -> None:
    dead = []
    with _ws_lock:
        for ws in list(_ws_clients):
            try:
                ws.send(json.dumps(payload))
            except Exception:
                dead.append(ws)
        for ws in dead:
            _ws_clients.discard(ws)

@sock.route('/ws/alerts')
def ws_alerts(ws):
    with _ws_lock:
        _ws_clients.add(ws)
    try:
        while True:
            msg = ws.receive()
            if msg is None:
                break
    finally:
        with _ws_lock:
            _ws_clients.discard(ws)

@app.post("/api/alert")
def api_alert():
    data = request.get_json(force=True, silent=True) or {}
    typ = (data.get("type") or "").strip().lower()
    msg = (data.get("message") or "").strip()
    if typ not in ("low", "restored"):
        return jsonify({"ok": False, "message": "invalid type"}), 400
    _ws_broadcast({"type": typ, "message": msg, "ts": time.time()})
    return jsonify({"ok": True}), 200

@app.get("/overlay")
def overlay():
    return render_template("overlay.html")


_TOKENS_PATH = TWITCH_TOKENS_PATH
_TOKENS = {
    "access": TWITCH_OAUTH_TOKEN or "",
    "refresh": TWITCH_REFRESH_TOKEN or ""
}
_token_lock = Lock()
_stop_token_maint = Event()  # Event to signal token maintenance thread to stop
_TOKEN_REFRESH_THRESHOLD = 3600  # refresh if <1h left (Twitch tokens expire after ~4h)

def _load_tokens_file():
    try:
        with open(_TOKENS_PATH, "r", encoding="utf-8") as f:
            js = json.load(f)
        _TOKENS["access"] = js.get("access_token", _TOKENS["access"])
        _TOKENS["refresh"] = js.get("refresh_token", _TOKENS["refresh"])
    except Exception:
        pass

def _save_tokens_file():
    try:
        with open(_TOKENS_PATH, "w", encoding="utf-8") as f:
            json.dump({
                "access_token": _TOKENS.get("access",""),
                "refresh_token": _TOKENS.get("refresh","")
            }, f, indent=2)
        try:
            os.chmod(_TOKENS_PATH, 0o600)
        except Exception:
            pass
    except Exception:
        pass

def _validate_token(tok: str):
    if not tok:
        return None
    try:
        r = requests.get("https://id.twitch.tv/oauth2/validate",
                         headers={"Authorization": f"OAuth {tok}"}, timeout=6)
        if r.status_code == 200:
            return r.json()
    except Exception:
        pass
    return None

def _current_token_info():
    info = _validate_token(_TOKENS.get("access", ""))
    if not info:
        return {"valid": False, "expires_in": 0}
    return {"valid": True, "expires_in": info.get("expires_in", 0)}

def ensure_user_token() -> str:
    """
    Returner gyldig user access token. Forsøker refresh hvis ugyldig eller
    mindre enn 24t igjen. Tråd-sikker.
    """
    with _token_lock:
        tok = _TOKENS.get("access", "")
        info = _validate_token(tok)
        if info and info.get("expires_in", 0) > _TOKEN_REFRESH_THRESHOLD:
            return tok
        # refresh attempt
        if _TOKENS.get("refresh") and TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET:
            try:
                r = requests.post("https://id.twitch.tv/oauth2/token", data={
                    "client_id": TWITCH_CLIENT_ID,
                    "client_secret": TWITCH_CLIENT_SECRET,
                    "grant_type": "refresh_token",
                    "refresh_token": _TOKENS["refresh"],
                }, timeout=10)
                js = r.json()
                if r.status_code == 200 and js.get("access_token"):
                    _TOKENS["access"] = js["access_token"]
                    if js.get("refresh_token"):
                        _TOKENS["refresh"] = js["refresh_token"]
                    _save_tokens_file()
                    return _TOKENS["access"]
            except Exception:
                pass
        return _TOKENS.get("access", "")

def _token_maintenance_loop():
    """Background thread that keeps token fresh even without HTTP traffic"""
    while not _stop_token_maint.is_set():
        try:
            ensure_user_token()
        except Exception:
            pass
        # Wake every 30 minutes
        _stop_token_maint.wait(1800)

_load_tokens_file()

# Start token maintenance thread
Thread(target=_token_maintenance_loop, daemon=True, name="token-maint").start()

# Ensure background thread gets a stop signal on shutdown
import atexit
atexit.register(lambda: _stop_token_maint.set())


@app.route("/api/sg_status")
@login_required
def sg_status():
    base = {}
    # Stream Guard internal (if running) -> optional
    try:
        r = requests.get("http://127.0.0.1:8765/health", timeout=1.0)
        base.update(r.json())
    except Exception:
        base.setdefault("sg_error", True)

    # StreamGuard systemd state
    try:
        sg_active_rc = subprocess.run(["systemctl", "is-active", "--quiet", STREAM_GUARD_SERVICE_NAME]).returncode
        sg_failed_rc = subprocess.run(["systemctl", "is-failed", "--quiet", STREAM_GUARD_SERVICE_NAME]).returncode
        if sg_active_rc == 0:
            base['streamguard_state'] = 'ok'
        elif sg_failed_rc == 0:
            base['streamguard_state'] = 'error'
        else:
            base['streamguard_state'] = 'offline'
    except Exception:
        base['streamguard_state'] = 'error'

    # Chatbot systemd state classification
    chatbot_state = 'offline'
    try:
        # active?
        active_rc = subprocess.run(["systemctl", "is-active", "--quiet", SERVICE_NAME]).returncode
        failed_rc = subprocess.run(["systemctl", "is-failed", "--quiet", SERVICE_NAME]).returncode
        if active_rc == 0:
            chatbot_state = 'ok'
        elif failed_rc == 0:
            chatbot_state = 'error'
        else:
            chatbot_state = 'offline'
    except Exception:
        chatbot_state = 'error'
    base['chatbot_state'] = chatbot_state
    base['chatbot_autostart'] = _get_chatbot_pref()

    # Nginx systemd state classification
    nginx_state = 'offline'
    try:
        # active?
        active_rc = subprocess.run(["systemctl", "is-active", "--quiet", "nginx"]).returncode
        failed_rc = subprocess.run(["systemctl", "is-failed", "--quiet", "nginx"]).returncode
        if active_rc == 0:
            nginx_state = 'ok'
        elif failed_rc == 0:
            nginx_state = 'error'
        else:
            nginx_state = 'offline'
    except Exception:
        nginx_state = 'error'
    base['nginx_state'] = nginx_state

    # SLS stats endpoint
    try:
        sr = requests.get("http://192.168.25.5:8181/stats", timeout=1.5)
        base['sls_state'] = 'ok' if sr.status_code == 200 else 'error'
    except Exception:
        base['sls_state'] = 'error'

    # Twitch token validity
    tinfo = _current_token_info()
    base['token_valid'] = tinfo['valid']
    base['token_expires_in'] = tinfo['expires_in']

    # stunnel-kick service state
    try:
        active_rc = subprocess.run(["systemctl", "is-active", "--quiet", "stunnel-kick" ]).returncode
        failed_rc = subprocess.run(["systemctl", "is-failed", "--quiet", "stunnel-kick" ]).returncode
        if active_rc == 0:
            base['stunnel_state'] = 'ok'
        elif failed_rc == 0:
            base['stunnel_state'] = 'error'
        else:
            base['stunnel_state'] = 'offline'
    except Exception:
        base['stunnel_state'] = 'error'

    return jsonify(base)



if __name__ == '__main__':
    # Only for local development - production uses Gunicorn via wsgi.py
    # To run locally: python app.py --dev
    import sys
    if '--dev' in sys.argv:
        print("⚠️  Running Flask development server (use Gunicorn for production)")
        app.run(host='0.0.0.0', port=5000, debug=False)
    else:
        print("❌ Direct execution disabled. Use 'python app.py --dev' for development")
        print("   For production, use: gunicorn -c gunicorn.conf.py wsgi:app")
        sys.exit(1)
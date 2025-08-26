from __future__ import annotations
from typing import Any, Optional
from dotenv import load_dotenv
from obsws_python import ReqClient
import os, time, json, requests, socket, io, contextlib, asyncio, aiohttp, threading, http.server, socketserver, errno, atexit, signal

load_dotenv()

# --- Configuration ---
STATS_URL: str = os.getenv("STATS_URL")

OBS_HOST: str = os.getenv("OBS_HOST")
OBS_PORT: int = int(os.getenv("OBS_PORT"))
OBS_PASSWORD: Optional[str] = os.getenv("OBS_PASSWORD")
OBS_RECONNECT_INTERVAL_SEC: float = float(os.getenv("OBS_RECONNECT_INTERVAL_SEC", "10"))
MAX_RECONNECT_WAIT_SEC: float = float(os.getenv("OBS_MAX_RECONNECT_WAIT_SEC", "60"))

LIVE_SCENE_NAME: str = os.getenv("LIVE_SCENE_NAME", "LIVE")
LOW_SCENE_NAME: str = os.getenv("LOW_SCENE_NAME", "lowbitrate")

BITRATE_LOW_KBPS: int = int(os.getenv("BITRATE_LOW_KBPS"))
BITRATE_HIGH_KBPS: int = int(os.getenv("BITRATE_HIGH_KBPS"))

POLL_INTERVAL_SEC: float = float(os.getenv("POLL_INTERVAL_SEC"))
LOW_CONSEC_SAMPLES: int = int(os.getenv("LOW_CONSEC_SAMPLES"))
LIVE_SCENE_LOW_GRACE_SEC: float = float(os.getenv("LIVE_SCENE_LOW_GRACE_SEC", "3"))  # Ignorer lave målinger rett etter bytte til LIVE

REQUEST_TIMEOUT: float = float(os.getenv("REQUEST_TIMEOUT"))

# Behavior
WAIT_FOR_STREAM_START: bool = os.getenv("WAIT_FOR_STREAM_START", "true").lower() in ("1", "true", "yes", "y")
IDLE_WHEN_STREAM_ENDS: bool = os.getenv("IDLE_WHEN_STREAM_ENDS", "true").lower() in ("1", "true", "yes", "y")
EXIT_WHEN_STREAM_ENDS: bool = os.getenv("EXIT_WHEN_STREAM_ENDS", "false").lower() in ("1", "true", "yes", "y")

ALERTS_BASE_URL: str = os.getenv("ALERTS_BASE_URL")

# ==== Twitch EventSub (WebSocket) -> auto stop OBS on outgoing raid ====
TWITCH_CLIENT_ID      = os.getenv("TWITCH_CLIENT_ID")
TWITCH_OAUTH_TOKEN    = os.getenv("TWITCH_OAUTH_TOKEN")      # USER token (må komme fra auth-server)
TWITCH_BROADCASTER_ID = os.getenv("TWITCH_BROADCASTER_ID")
RAID_AUTO_STOP_ENABLED = os.getenv("RAID_AUTO_STOP_ENABLED", "true").lower() in ("1","true","yes","on")
RAID_AUTO_STOP_DELAY   = int(os.getenv("RAID_AUTO_STOP_DELAY", "0"))
TWITCH_CLIENT_SECRET  = os.getenv("TWITCH_CLIENT_SECRET")  # (ikke brukt for channel.raid nå)
TWITCH_TOKENS_PATH     = os.getenv("TWITCH_TOKENS_PATH", os.path.join(os.path.dirname(__file__), "twitch_tokens.json"))
RAID_SEND_CHAT_MESSAGE = os.getenv("RAID_SEND_CHAT_MESSAGE", "true").lower() in ("1","true","yes","on")
RAID_CHAT_MESSAGE      = os.getenv("RAID_CHAT_MESSAGE", "Raided successfully & ended stream")

EVENTSUB_WS   = "wss://eventsub.wss.twitch.tv/ws"
SUBSCRIBE_URL = "https://api.twitch.tv/helix/eventsub/subscriptions"
RESUB_MIN_INTERVAL_SEC = 30   # don't spam subscribe attempts

# === ChatGuard additions ===
TWITCH_ADMINS = os.getenv("TWITCH_ADMINS")
CHAT_ADMINS = {a.strip().lower() for a in TWITCH_ADMINS.split(",") if a.strip()}

STARTING_SCENE_NAME: str = os.getenv("STARTING_SCENE_NAME")
BRB_SCENE_NAME: str = os.getenv("BRB_SCENE_NAME")
OFFLINE_SCENE_NAME: str = os.getenv("OFFLINE_SCENE_NAME")


def _current_user_token() -> str:
    # Prøv fil (oppdatert av app.py på refresh)
    try:
        with open(TWITCH_TOKENS_PATH, "r", encoding="utf-8") as f:
            js = json.load(f)
        if isinstance(js, dict) and js.get("access_token"):
            return str(js["access_token"])
    except Exception:
        pass
    return TWITCH_OAUTH_TOKEN or ""

async def _safe_json(resp: aiohttp.ClientResponse):
    try:
        return await resp.json()
    except Exception:
        try:
            txt = await resp.text()
        except Exception:
            txt = "<no-body>"
        return {"_raw": txt}

async def _eventsub_subscribe_raid(http: aiohttp.ClientSession, session_id: str) -> bool:
    token = _current_user_token()
    if not token:
        print("[RaidGuard] No user token available (TWITCH_OAUTH_TOKEN empty). Disable raid watcher or add token.")
        return False

    headers = {
        "Client-Id": TWITCH_CLIENT_ID or "",
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    body = {
        "type": "channel.raid",
        "version": "1",
        "condition": { "from_broadcaster_user_id": TWITCH_BROADCASTER_ID },
        "transport": { "method": "websocket", "session_id": session_id },
    }

    async with http.post(SUBSCRIBE_URL, headers=headers, json=body) as r:
        js = await _safe_json(r)
        if r.status in (200, 202, 409):
            if r.status == 409:
                print("[RaidGuard] already subscribed: channel.raid")
            else:
                print("[RaidGuard] subscribed: channel.raid")
            _h_set("raid_subscribed", True)
            return True

        if r.status == 401:
            # user-token kan ha endret seg – les på nytt og prøv én gang til
            print("[RaidGuard] 401 unauthorized - token may be expired; retrying with latest token...")
            token = _current_user_token()
            headers["Authorization"] = f"Bearer {token}" if token else ""
            async with http.post(SUBSCRIBE_URL, headers=headers, json=body) as r2:
                js2 = await _safe_json(r2)
                if r2.status in (200, 202, 409):
                    if r2.status == 409:
                        print("[RaidGuard] already subscribed (after retry): channel.raid")
                    else:
                        print("[RaidGuard] subscribed (after retry): channel.raid")
                    _h_set("raid_subscribed", True)
                    return True
                print(f"[RaidGuard] subscribe retry failed {r2.status}: {js2}")
                _h_set("raid_subscribed", False)
                return False

        print(f"[RaidGuard] subscribe failed {r.status}: {js}")
        _h_set("raid_subscribed", False)
        return False

# === ChatGuard additions ===
async def _eventsub_subscribe_chat(http: aiohttp.ClientSession, session_id: str) -> bool:
    """Subscribe to channel.chat.message for the broadcaster, using the same user token."""
    token = _current_user_token()
    if not token:
        print("[ChatGuard] No user token available; cannot subscribe to chat messages.")
        return False

    headers = {
        "Client-Id": TWITCH_CLIENT_ID or "",
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    body = {
        "type": "channel.chat.message",
        "version": "1",
        "condition": {
            "broadcaster_user_id": TWITCH_BROADCASTER_ID,
            "user_id": TWITCH_BROADCASTER_ID  # listen as the broadcaster user
        },
        "transport": {"method": "websocket", "session_id": session_id},
    }

    async with http.post(SUBSCRIBE_URL, headers=headers, json=body) as r:
        js = await _safe_json(r)
        if r.status in (200, 202, 409):
            if r.status == 409:
                print("[ChatGuard] already subscribed: channel.chat.message")
            else:
                print("[ChatGuard] subscribed: channel.chat.message")
            _h_set("chat_subscribed", True)
            return True

        if r.status == 401:
            print("[ChatGuard] 401 unauthorized; retrying with latest token...")
            token = _current_user_token()
            headers["Authorization"] = f"Bearer {token}" if token else ""
            async with http.post(SUBSCRIBE_URL, headers=headers, json=body) as r2:
                js2 = await _safe_json(r2)
                if r2.status in (200, 202, 409):
                    print("[ChatGuard] subscribed (after retry): channel.chat.message")
                    _h_set("chat_subscribed", True)
                    return True
                print(f"[ChatGuard] subscribe retry failed {r2.status}: {js2}")
                _h_set("chat_subscribed", False)
                return False

        print(f"[ChatGuard] subscribe failed {r.status}: {js}")
        _h_set("chat_subscribed", False)
        return False


# === ChatGuard additions ===
CHAT_RESUB_MIN_INTERVAL_SEC = 30

async def _chat_guard():
    if not (TWITCH_CLIENT_ID and TWITCH_BROADCASTER_ID):
        print("[ChatGuard] missing TWITCH_* vars; disabled")
        return
    if not _current_user_token():
        print("[ChatGuard] No user token found; chat.message requires a user access token. Disabled.")
        return

    ws_url = EVENTSUB_WS
    next_resub_attempt = 0.0

    def _is_admin(login: str) -> bool:
        return login.lower() in CHAT_ADMINS

    while True:
        try:
            async with aiohttp.ClientSession() as http:
                async with http.ws_connect(ws_url, autoping=True) as ws:
                    session_id = None
                    _h_set("chat_ws", True)
                    _h_set("chat_subscribed", False)

                    while True:
                        now = time.time()
                        if session_id and not _h_snapshot().get("chat_subscribed") and _h_snapshot().get("token_valid") is True and now >= next_resub_attempt:
                            ok = await _eventsub_subscribe_chat(http, session_id)
                            next_resub_attempt = now + CHAT_RESUB_MIN_INTERVAL_SEC

                        msg = await ws.receive()
                        if msg.type == aiohttp.WSMsgType.TEXT:
                            data = json.loads(msg.data)
                            mtype = data.get("metadata", {}).get("message_type")

                            if mtype == "session_welcome":
                                session_id = data["payload"]["session"]["id"]
                                next_resub_attempt = 0.0

                            elif mtype == "session_reconnect":
                                ws_url = data["payload"]["session"]["reconnect_url"]
                                print("[ChatGuard] reconnect ->", ws_url)
                                break

                            elif mtype == "notification":
                                sub_type = data["payload"]["subscription"]["type"]

                                if sub_type == "channel.chat.message":
                                    ev = data["payload"]["event"]
                                    _h_set("chat_subscribed", True)  # mark healthy on first message
                                    login = (ev.get("chatter_user_login") or "").lower()
                                    text = (ev.get("message", {}).get("text") or "").strip()

                                    if not text.startswith("!"):
                                        continue
                                    if not _is_admin(login):
                                        # ignore non-admins
                                        continue

                                    cmd = text.split()[0].lower()
                                    print(f"[ChatGuard] cmd from {login}: {cmd}")

                                    if cmd == "!start":
                                        ok = _obs_start_and_switch(STARTING_SCENE_NAME)
                                        if ok:
                                            _send_chat_message("[bot] Stream started & switched to Starting soon!")
                                    elif cmd == "!live":
                                        ok = _obs_switch_scene_safe(LIVE_SCENE_NAME)
                                        if ok:
                                            _send_chat_message("[bot] Changed to 'LIVE'")
                                    elif cmd == "!brb":
                                        ok = _obs_switch_scene_safe(BRB_SCENE_NAME)
                                        if ok:
                                            _send_chat_message("[bot] Changed to 'BRB'")
                                    elif cmd == "!fix":
                                        ok = _obs_fix_brb_then_live(BRB_SCENE_NAME, LIVE_SCENE_NAME, delay_sec=1.0)
                                        if ok:
                                            _send_chat_message("[bot] trying to fix.")
                                    elif cmd == "!stop":
                                        ok = _obs_stop_stream()
                                        if ok:
                                            _send_chat_message("[bot] Stream ended")
                                    # else: ignore other commands

                            elif mtype == "revocation":
                                sub = data.get("payload", {}).get("subscription", {})
                                if sub.get("type") == "channel.chat.message":
                                    print("[ChatGuard] subscription revoked -> will re-subscribe when token valid again")
                                    _h_set("chat_subscribed", False)

                        elif msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                            break

                _h_set("chat_ws", False)

        except Exception as e:
            print("[ChatGuard] WS loop error:", e)
            _h_set("chat_ws", False)

        await asyncio.sleep(3)
        if not ws_url.startswith("wss://eventsub"):
            ws_url = EVENTSUB_WS

def start_chat_guard_thread():
    try:
        t = threading.Thread(target=lambda: asyncio.run(_chat_guard()),
                             daemon=True, name="chat-guard")
        t.start()
        print("[ChatGuard] started")
    except Exception as e:
        print("[ChatGuard] not started:", e)



async def _raid_watcher():
    if not RAID_AUTO_STOP_ENABLED:
        return
    if not (TWITCH_CLIENT_ID and TWITCH_BROADCASTER_ID):
        print("[RaidGuard] missing TWITCH_* vars; disabled")
        return
    if not _current_user_token():
        print("[RaidGuard] No user token found; channel.raid requires a user access token. Disabled.")
        return

    ws_url = EVENTSUB_WS
    next_resub_attempt = 0.0
    while True:
        try:
            async with aiohttp.ClientSession() as http:
                async with http.ws_connect(ws_url, autoping=True) as ws:
                    session_id = None
                    _h_set("raid_ws", True)
                    # reset subscription flag until confirmed
                    _h_set("raid_subscribed", False)
                    while True:
                        # Periodic proactive resubscribe if needed
                        now = time.time()
                        if session_id and not _h_snapshot().get("raid_subscribed") and _h_snapshot().get("token_valid") is True and now >= next_resub_attempt:
                            ok = await _eventsub_subscribe_raid(http, session_id)
                            next_resub_attempt = now + (RESUB_MIN_INTERVAL_SEC if not ok else RESUB_MIN_INTERVAL_SEC)
                        msg = await ws.receive()
                        if msg.type == aiohttp.WSMsgType.TEXT:
                            data = json.loads(msg.data)
                            mtype = data.get("metadata", {}).get("message_type")
                            if mtype == "session_welcome":
                                session_id = data["payload"]["session"]["id"]
                                next_resub_attempt = 0.0  # allow immediate subscribe
                            elif mtype == "session_reconnect":
                                ws_url = data["payload"]["session"]["reconnect_url"]
                                print("[RaidGuard] reconnect ->", ws_url)
                                break
                            elif mtype == "notification":
                                sub_type = data["payload"]["subscription"]["type"]
                                if sub_type == "channel.raid":
                                    ev = data["payload"]["event"]
                                    if ev.get("from_broadcaster_user_id") == TWITCH_BROADCASTER_ID:
                                        print("[RaidGuard] outgoing raid -> stopping OBS")
                                        if RAID_AUTO_STOP_DELAY > 0:
                                            await asyncio.sleep(RAID_AUTO_STOP_DELAY)
                                        try:
                                            c = connect_obs()
                                            c.stop_stream()
                                            try:
                                                c.set_current_program_scene(OFFLINE_SCENE_NAME)
                                            except Exception as sce:
                                                print(f"[RaidGuard] failed switching to offline scene '{OFFLINE_SCENE_NAME}':", sce)
                                            # Etter at stream er stoppet, send melding i Twitch chat hvis aktivert
                                            if RAID_SEND_CHAT_MESSAGE:
                                                try:
                                                    _send_chat_message(RAID_CHAT_MESSAGE)
                                                except Exception as e:
                                                    print("[RaidGuard] chat message failed:", e)
                                        except Exception as e:
                                            print("[RaidGuard] OBS stop failed:", e)
                            elif mtype == "revocation":
                                # Subscription revoked (token revoked / permissions removed)
                                sub = data.get("payload", {}).get("subscription", {})
                                if sub.get("type") == "channel.raid":
                                    print("[RaidGuard] subscription revoked -> will re-subscribe when token valid again")
                                    _h_set("raid_subscribed", False)
                        elif msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                            break
                # leaving ws context (clean close)
                _h_set("raid_ws", False)
        except Exception as e:
            print("[RaidGuard] WS loop error:", e)
            _h_set("raid_ws", False)
        await asyncio.sleep(3)
        if not ws_url.startswith("wss://eventsub"):
            ws_url = EVENTSUB_WS

def start_raid_watcher_thread():
    try:
        t = threading.Thread(target=lambda: asyncio.run(_raid_watcher()),
                             daemon=True, name="raid-watcher")
        t.start()
        print("[RaidGuard] started")
    except Exception as e:
        print("[RaidGuard] not started:", e)

def _notify_clients(kind: str, message: str) -> None:
    try:
        requests.post(f"{ALERTS_BASE_URL}/api/alert",
                      json={"type": kind, "message": message}, timeout=1.5)
    except Exception:
        pass

def _send_chat_message(message: str) -> None:
    """Send a chat message to the broadcaster's own Twitch chat using the user OAuth token.
    Requires the token to have user:write:chat and user:read:chat scopes (Twitch API 2024+).
    Falls back silently if missing creds.
    """
    token = _current_user_token()
    if not (token and TWITCH_CLIENT_ID and TWITCH_BROADCASTER_ID and message):
        return
    try:
        url = "https://api.twitch.tv/helix/chat/messages"
        headers = {
            "Client-ID": TWITCH_CLIENT_ID,
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        payload = {
            "broadcaster_id": TWITCH_BROADCASTER_ID,
            "sender_id": TWITCH_BROADCASTER_ID,
            "message": message[:480]  # safety trim
        }
        r = requests.post(url, headers=headers, json=payload, timeout=5)
        if r.status_code not in (200, 201):
            try:
                print(f"[RaidGuard] chat send failed {r.status_code}: {r.text[:300]}")
            except Exception:
                pass
    except Exception as e:
        print("[RaidGuard] chat send exception:", e)

# --- OBS control functions ---

def connect_obs() -> ReqClient:
    return ReqClient(host=OBS_HOST, port=OBS_PORT, password=OBS_PASSWORD, timeout=5)


def is_streaming(cl: ReqClient) -> bool:
    # Let exceptions bubble so the caller can reconnect
    status = cl.get_stream_status()
    return bool(status.output_active)


def get_current_scene(cl: ReqClient) -> str:
    # Let exceptions bubble
    return cl.get_current_program_scene().current_program_scene_name


def switch_scene(cl: ReqClient, scene: str) -> None:
    # Let exceptions bubble
    cl.set_current_program_scene(scene)


# === ChatGuard additions ===
def _obs_switch_scene_safe(scene: str) -> bool:
    try:
        c = connect_obs()
        switch_scene(c, scene)
        return True
    except Exception as e:
        print("[ChatGuard][OBS] switch failed:", e)
        return False

def _obs_start_and_switch(scene: str) -> bool:
    try:
        c = connect_obs()
        try:
            if not is_streaming(c):
                c.start_stream()
                print("[ChatGuard][OBS] Stream started.")
        except Exception as e:
            # Hvis allerede live, fortsetter vi bare å bytte scene
            print("[ChatGuard][OBS] start_stream err (may already be live):", e)
        switch_scene(c, scene)
        return True
    except Exception as e:
        print("[ChatGuard][OBS] start_and_switch failed:", e)
        return False

def _obs_fix_brb_then_live(brb_scene: str, live_scene: str, delay_sec: float = 1.0) -> bool:
    try:
        c = connect_obs()
        switch_scene(c, brb_scene)
        time.sleep(delay_sec)
        switch_scene(c, live_scene)
        return True
    except Exception as e:
        print("[ChatGuard][OBS] fix sequence failed:", e)
        return False

def _obs_stop_stream() -> bool:
    """Stop stream (if active) and switch to OFFLINE_SCENE_NAME."""
    try:
        c = connect_obs()
        # Stop stream if active
        try:
            if is_streaming(c):
                c.stop_stream()
        except Exception:
            # fallback second attempt
            try:
                c.stop_stream()
            except Exception:
                pass
        # Attempt to switch scene
        try:
            if OFFLINE_SCENE_NAME:
                c.set_current_program_scene(OFFLINE_SCENE_NAME)
        except Exception as sce:
            print(f"[ChatGuard][OBS] failed switching to offline scene '{OFFLINE_SCENE_NAME}':", sce)
        return True
    except Exception as e:
        print("[ChatGuard][OBS] stop_stream failed:", e)
        return False

# --- Bitrate fetch and parsing ---
def _find_numbers_by_keys(d: Any, key_hints=("bitrate", "kbps", "bw", "bandwidth")) -> list[int]:
    """Depth-first search to collect candidate numeric bitrate-like fields (ints) in the JSON.
    Returns values assuming units are kbps when matching typical key names.
    """
    out: list[int] = []
    if isinstance(d, dict):
        for k, v in d.items():
            k_lower = str(k).lower()
            if any(h in k_lower for h in key_hints):
                if isinstance(v, (int, float)):
                    out.append(int(v))
            out.extend(_find_numbers_by_keys(v, key_hints))
    elif isinstance(d, list):
        for it in d:
            out.extend(_find_numbers_by_keys(it, key_hints))
    return out


def fetch_bitrate_kbps() -> Optional[int]:
    try:
        r = requests.get(STATS_URL, timeout=REQUEST_TIMEOUT)
        r.raise_for_status()
        # Try JSON first; some SLS builds return text/HTML JSON or XML.
        data: Any
        try:
            data = r.json()
        except ValueError:
            # Attempt to extract JSON if the response is a single JSON string in text
            text = r.text.strip()
            if text.startswith("{") or text.startswith("["):
                data = json.loads(text)
            else:
                print("[SLS] Non-JSON stats; please expose JSON stats for reliable parsing.")
                return None

        # Prefer exact SLS structure under 'publishers'
        if isinstance(data, dict) and isinstance(data.get("publishers"), dict):
            pubs = data["publishers"]
            candidates: list[int] = []
            for k, v in pubs.items():
                if isinstance(v, dict):
                    # Primary: integer bitrate (kbps)
                    if isinstance(v.get("bitrate"), (int, float)):
                        candidates.append(int(v["bitrate"]))
                    # Fallback: bandwidth fields, convert Mbps -> kbps if present
                    elif isinstance(v.get("mbpsBandwidth"), (int, float)):
                        candidates.append(int(float(v["mbpsBandwidth"]) * 1000))
                    elif isinstance(v.get("kbpsBandwidth"), (int, float)):
                        candidates.append(int(v["kbpsBandwidth"]))
            if candidates:
                return max(candidates)

        # Fallback: generic search by key hints across the JSON
        candidates = _find_numbers_by_keys(data)
        if candidates:
            kbps = max(candidates)
            return int(kbps)
        return None
    except Exception as e:
        print(f"[SLS] Stats fetch failed: {e}")
        return None


# --- Minimal health state ---
_HEALTH = {
    "obs_connected": False,
    "raid_ws": False,
    "raid_subscribed": False,
    "token_valid": None,
    "chat_ws": False,
    "chat_subscribed": False,
}
_HEALTH_LOCK = threading.Lock()

def _h_set(k, v):
    with _HEALTH_LOCK:
        _HEALTH[k] = v

def _h_snapshot():
    with _HEALTH_LOCK:
        return dict(_HEALTH)

def _validate_user_token_once():
    tok = _current_user_token()
    if not tok:
        _h_set("token_valid", False)
        return
    try:
        r = requests.get("https://id.twitch.tv/oauth2/validate",
                         headers={"Authorization": f"OAuth {tok}"}, timeout=5)
        _h_set("token_valid", r.status_code == 200)
    except Exception:
        _h_set("token_valid", False)

class _HealthHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): return
    def do_GET(self):
        if self.path != "/health":
            self.send_response(404); self.end_headers(); return
        snap = _h_snapshot()
        body = json.dumps(snap).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

_HEALTH_HTTPD = None  # global ref for graceful shutdown

def start_health_server(port=8765, max_retries: int = 20, retry_delay: float = 0.25):
    """Start health server with retry + graceful shutdown.

    Handles fast systemd restarts where previous process socket still in TIME_WAIT.
    """
    class _ReuseTCPServer(socketserver.TCPServer):
        allow_reuse_address = True

    def _close_server():
        global _HEALTH_HTTPD
        try:
            if _HEALTH_HTTPD:
                try:
                    _HEALTH_HTTPD.shutdown()
                except Exception:
                    pass
                try:
                    _HEALTH_HTTPD.server_close()
                except Exception:
                    pass
        finally:
            _HEALTH_HTTPD = None

    def _signal_handler(signum, frame):  # pragma: no cover
        _close_server()
        raise SystemExit(0)

    # Register exit hooks once
    try:
        signal.signal(signal.SIGTERM, _signal_handler)
    except Exception:
        pass
    atexit.register(_close_server)

    def run():
        global _HEALTH_HTTPD
        attempt = 0
        while attempt <= max_retries:
            try:
                _HEALTH_HTTPD = _ReuseTCPServer(("127.0.0.1", port), _HealthHandler)
                print(f"[RaidGuard] health on 127.0.0.1:{port}/health (attempt {attempt})")
                try:
                    _HEALTH_HTTPD.serve_forever()
                finally:
                    _close_server()
                break
            except OSError as e:
                if e.errno == errno.EADDRINUSE:
                    attempt += 1
                    if attempt > max_retries:
                        print(f"[RaidGuard] health server failed bind after {max_retries} retries: {e}")
                        break
                    time.sleep(retry_delay)
                    continue
                else:
                    print(f"[RaidGuard] health server unexpected error: {e}")
                    break

    threading.Thread(target=run, daemon=True, name="health").start()

def start_token_validator(interval_sec=600):
    def run():
        last_valid = None
        while True:
            _validate_user_token_once()
            snap = _h_snapshot()
            cur = snap.get("token_valid")
            if last_valid is False and cur is True:
                # token restored -> force fresh subscription attempt
                print("[RaidGuard] token valid again -> scheduling resubscribe")
                _h_set("raid_subscribed", False)
            last_valid = cur
            time.sleep(interval_sec)
    threading.Thread(target=run, daemon=True, name="token-validator").start()

def main() -> None:
    print("[StreamGuard] Starting...")
    print(f"[StreamGuard] Stats URL: {STATS_URL}")
    print(f"[StreamGuard] Scenes: LIVE='{LIVE_SCENE_NAME}', LOW='{LOW_SCENE_NAME}'")
    print(f"[StreamGuard] Thresholds: low<{BITRATE_LOW_KBPS} kbps, high>={BITRATE_HIGH_KBPS} kbps (instant recovery)")
    print(f"[StreamGuard] Behavior: WAIT_FOR_STREAM_START={WAIT_FOR_STREAM_START}, IDLE_WHEN_STREAM_ENDS={IDLE_WHEN_STREAM_ENDS}, EXIT_WHEN_STREAM_ENDS={EXIT_WHEN_STREAM_ENDS}")
    low_streak = 0
    waiting_logged = False  # print "Waiting for stream to start..." only once per idle period
    last_not_allowed_scene: Optional[str] = None
    cl: Optional[ReqClient] = None
    reconnect_wait = OBS_RECONNECT_INTERVAL_SEC
    prev_scene: Optional[str] = None
    scene_enter_time: float = 0.0
    live_grace_logged: bool = False

    def _obs_port_open(host: str, port: int, timeout: float = 1.0) -> bool:
        try:
            with socket.create_connection((host, port), timeout=timeout):
                return True
        except Exception:
            return False

    def _connect_obs() -> Optional[ReqClient]:
        try:
            if not _obs_port_open(OBS_HOST, OBS_PORT, timeout=1.0):
                _h_set("obs_connected", False)
                return None
            sink = io.StringIO()
            with contextlib.redirect_stderr(sink), contextlib.redirect_stdout(sink):
                c = ReqClient(host=OBS_HOST, port=OBS_PORT, password=OBS_PASSWORD, timeout=5)
                _ = c.get_version()
            print("[StreamGuard][OBS] Connected.")
            _h_set("obs_connected", True)
            return c
        except Exception:
            _h_set("obs_connected", False)
            return None

    while True:
        try:
            if cl is None:
                _h_set("obs_connected", False)  # viser rødt mens vi forsøker reconnect
                cl = _connect_obs()
                if cl is None:
                    time.sleep(reconnect_wait)
                    reconnect_wait = min(max(OBS_RECONNECT_INTERVAL_SEC, reconnect_wait * 1.5), MAX_RECONNECT_WAIT_SEC)
                    continue
                reconnect_wait = OBS_RECONNECT_INTERVAL_SEC  # reset backoff

            try:
                streaming = is_streaming(cl)
            except Exception:
                _h_set("obs_connected", False)   # tapte forbindelse
                cl = None
                time.sleep(reconnect_wait)
                reconnect_wait = min(max(OBS_RECONNECT_INTERVAL_SEC, reconnect_wait * 1.5), MAX_RECONNECT_WAIT_SEC)
                continue

            if not streaming:
                low_streak = 0
                last_not_allowed_scene = None
                if WAIT_FOR_STREAM_START and not waiting_logged:
                    print("[StreamGuard] Waiting for stream to start…")
                    waiting_logged = True
                if EXIT_WHEN_STREAM_ENDS:
                    return
                time.sleep(POLL_INTERVAL_SEC)
                continue

            # Fetch current scene; on OBS error, reconnect
            try:
                current_scene = get_current_scene(cl)
            except Exception:
                _h_set("obs_connected", False)
                cl = None
                time.sleep(reconnect_wait)
                reconnect_wait = min(max(OBS_RECONNECT_INTERVAL_SEC, reconnect_wait * 1.5), MAX_RECONNECT_WAIT_SEC)
                continue

            # Scene change tracking
            if current_scene != prev_scene:
                prev_scene = current_scene
                scene_enter_time = time.time()
                live_grace_logged = False  # reset log flag for new scene

            # Streaming is active; reset waiting flag
            waiting_logged = False

            bitrate = fetch_bitrate_kbps()
            if bitrate is None:
                bitrate = 0

            if current_scene == LIVE_SCENE_NAME:
                last_not_allowed_scene = None
                elapsed_in_live = time.time() - scene_enter_time if scene_enter_time else 9999
                in_grace = elapsed_in_live < LIVE_SCENE_LOW_GRACE_SEC
                if in_grace:
                    # Ignorer lave målinger i grace-vinduet
                    low_streak = 0
                    if not live_grace_logged:
                        print(f"[StreamGuard] LIVE grace {LIVE_SCENE_LOW_GRACE_SEC:.1f}s - ignoring low bitrate samples (elapsed {elapsed_in_live:.2f}s, bitrate {bitrate} kbps)")
                        live_grace_logged = True
                else:
                    if bitrate < BITRATE_LOW_KBPS:
                        low_streak += 1
                    else:
                        low_streak = 0

                if low_streak >= LOW_CONSEC_SAMPLES:
                    try:
                        switch_scene(cl, LOW_SCENE_NAME)
                        print(f"[StreamGuard] Low bitrate {bitrate} kbps < {BITRATE_LOW_KBPS} kbps. Switched scene: {LIVE_SCENE_NAME} -> {LOW_SCENE_NAME}")
                        _notify_clients("low", "LOW BITRATE!")
                    except Exception:
                        cl = None
                        time.sleep(reconnect_wait)
                        reconnect_wait = min(max(OBS_RECONNECT_INTERVAL_SEC, reconnect_wait * 1.5), MAX_RECONNECT_WAIT_SEC)
                        continue
                    low_streak = 0

            elif current_scene == LOW_SCENE_NAME:
                last_not_allowed_scene = None
                if bitrate >= BITRATE_HIGH_KBPS:
                    try:
                        switch_scene(cl, LIVE_SCENE_NAME)
                        print(f"[StreamGuard] Bitrate restored {bitrate} kbps >= {BITRATE_HIGH_KBPS} kbps. Switched scene: {LOW_SCENE_NAME} -> {LIVE_SCENE_NAME}")
                        _notify_clients("restored", "CONNECTION RESTORED!")
                    except Exception:
                        cl = None
                        time.sleep(reconnect_wait)
                        reconnect_wait = min(max(OBS_RECONNECT_INTERVAL_SEC, reconnect_wait * 1.5), MAX_RECONNECT_WAIT_SEC)
                        continue
                    low_streak = 0

            else:
                if last_not_allowed_scene != current_scene:
                    print(f"[StreamGuard] Scene '{current_scene}': switching not allowed.")
                    last_not_allowed_scene = current_scene
                low_streak = 0

            time.sleep(POLL_INTERVAL_SEC)

        except KeyboardInterrupt:
            return
        except Exception:
             # For non-OBS errors, wait a bit and continue
             time.sleep(1.0)
             continue
             

# Entry point: start raid watcher thread, then main loop
if __name__ == "__main__":
    start_health_server()
    start_token_validator()
    _validate_user_token_once()
    try:
        start_raid_watcher_thread()
    except Exception as e:
        print("[RaidGuard] not started:", e)
    try:
        start_chat_guard_thread()
    except Exception as e:
        print("[ChatGuard] not started:", e)
    try:
        main()
    except KeyboardInterrupt:
        pass

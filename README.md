<p align="center">
  <img width="220" src="Screenshots/logo.png" alt="Stream Control Logo">
</p>

<h1 align="center">Stream Control & Stream Guard</h1>

<p align="center">
  <strong>Your streaming Swiss Army knife 🎬</strong><br>
  One dashboard to control everything - OBS, Twitch, alerts, restream and your remote stream PC.
</p>

<br><p align="center" width="100%">
<a href="https://www.buymeacoffee.com/kimsec">
<img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&amp;emoji=%E2%98%95&amp;slug=kimsec&amp;button_colour=FFDD00&amp;font_colour=000000&amp;font_family=Inter&amp;outline_colour=000000&amp;coffee_colour=ffffff" alt="Buy Me A Coffee"></a></p>
<p align="center">
  <a href="https://github.com/Kimsec/Stream-Control/releases/latest">
  <img src="https://img.shields.io/github/v/release/kimsec/Stream-Control" alt="Latest Release"></a>
  <a href="https://github.com/Kimsec/Stream-Control">
  <img src="https://img.shields.io/badge/Platform-Self%20Hosted-success" alt="Self Hosted"></a>
  <a href="https://www.buymeacoffee.com/kimsec">
  <img src="https://img.shields.io/badge/Support-By%20donation-FFDD00?logo=buymeacoffee&logoColor=000" alt="Support"></a>
</p>

---

## Table of Contents
- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Services](#running-the-services)
- [Using the Web UI](#using-the-web-ui)
- [Restream Management](#restream-management)
- [Chat Commands](#chat-commands)
- [Bitrate & Raid Automation](#bitrate--raid-automation)
- [Twitch Integration & Tokens](#twitch-integration--tokens)
- [Alert Sound](#alert-sound)
- [Logs Viewer](#logs-viewer)
- [Health Indicators](#health-indicators)
- [Security Recommendations](#security-recommendations)
- [Ip Banning](#ip-banning)
- [Troubleshooting](#troubleshooting)
- [Extending](#extending)
- [Contributing](#contributing)

---

## 🚀 What is This?

Ever tried managing a stream while your internet decides to have a bad day? Stream Control has your back.

**In simple terms**: A web dashboard that keeps your Twitch stream running smoothly - even when your connection isn't. It automatically switches to a "low bitrate" scene when your internet struggles, manages your restream destinations, and lets you control everything from one place.

**Perfect for**:
- 📡 Streamers with unstable internet
- 🎮 Mobile/IRL streamers using BELABOX or similar encoders
- 🔧 Anyone who wants full control without clicking through 5 different apps
- 🌍 Multi-platform streamers managing multiple restream endpoints

---

## ✨ What Can It Do?

### 🎛️ Stream Management
- **One-click OBS control** - Start/stop streaming, switch scenes
- **Auto scene switching** - Detects low bitrate and switches to fallback scene automatically
- **Twitch integration** - Update title/category, trigger raids, view live chat
- **Smart alerts** - Audio notifications when things go wrong (or right!)
- **Alerts from StreamElements** - Get notified with your alert sound when triggered by dono/subs etc 

### 🌐 Multi-Platform Streaming
- **Restream manager** - Add/edit/enable/disable all your streaming destinations
- **BELABOX integration** - Direct control of your mobile streaming setup
- **Auto-reload** - Changes to restream config automatically reload nginx

### 💻 Remote Control
- **Wake-on-LAN** - Turn on your streaming PC from anywhere
- **Power management** - Restart or shutdown your remote stream PC
- **Health monitoring** - See status of all services at a glance

### 🤖 Automation
- **Auto raid-stop** - Automatically end stream after raiding another channel
- **Token refresh** - Twitch tokens refresh automatically, no manual intervention
- **Chat commands** - Control your stream via Twitch chat (!start, !live, !brb, !stop)
- **Bitrate monitoring** - Constantly checks your connection quality

### 🔒 Security & Production
- **Password protected** - Secure login with hashed passwords
- **IP banning** - Automatic protection against brute force attempts
- **Production-ready** - Runs with Gunicorn behind Cloudflare Tunnel

---

## Architecture

Component | Role
----------|-----
`app.py` | UI endpoints, token refresh, restream config generation, alerts broadcast
`stream_guard.py` | Bitrate/scene logic, raid EventSub, health server
`static/main.js` | UI interactions, polling, modals, toasts
`templates/` | HTML + nginx Jinja2 template
`twitch_tokens.json` | Access + refresh token store (rotated automatically)

Processes are decoupled for resilience.

---

## 🏃 Quick Start

Get up and running in 5 minutes:

```bash
# 1. Clone and setup
git clone https://github.com/Kimsec/Stream-Control.git
cd Stream-Control
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 2. Configure
cp .env.example .env
nano .env  # Add your credentials

# 3. Generate secure password
python generate_password_hash.py
# Add the hash to .env as LOGIN_PASSWORD_HASH

# 4. Run (development)
python app.py --dev
python stream_guard.py
```

Open http://localhost:5000 and start streaming! 🎉

---

## 📋 What You Need

**Required:**
- 🐍 Python 3.10 or newer
- 🎥 OBS Studio
- 🔑 Twitch API credentials ([get them here](https://dev.twitch.tv/console/apps))

**Optional (but recommended):**
- 📡 nginx with RTMP module (for restreaming to multiple platforms)
- 📊 Stats endpoint (SRS/SLS/nginx stats for bitrate monitoring)
- 🔒 stunnel (for RTMPS support)
- ⚙️ systemd (for running as a service)

---

## 💾 Installation

### For Development
```bash
git clone https://github.com/Kimsec/Stream-Control.git
cd Stream-Control
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

### For Production (Ubuntu/Debian)
See [DEPLOYMENT.md](DEPLOYMENT.md) for a complete production setup guide with:
- ✅ Gunicorn with threaded workers
- ✅ Systemd service installation
- ✅ Secure password hashing
- ✅ Cloudflare Tunnel integration
- ✅ Log rotation and monitoring

---

## Configuration

Key groups in `.env`:

Group | Examples
------|---------
Flask/Auth | FLASK_SECRET_KEY, LOGIN_PASSWORD_HASH (use `python generate_password_hash.py` to generate)
Logging | LOGLEVEL (warning/info/debug), GUNICORN_ACCESSLOG (path or /dev/null)
OBS | OBS_HOST, OBS_PORT, OBS_PASSWORD
Bitrate | STATS_URL, BITRATE_LOW_KBPS, BITRATE_HIGH_KBPS, POLL_INTERVAL_SEC, LOW_CONSEC_SAMPLES
Scenes | LIVE_SCENE_NAME, LOW_SCENE_NAME
Restream | CONFIG_PATH, NGINX_CONF_OUT
Mini-PC | MINI_PC_USER, MINI_PC_IP, MAC_ADDRESS
Twitch | TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_BROADCASTER_ID, TWITCH_OAUTH_TOKEN, TWITCH_REFRESH_TOKEN, TWITCH_TOKENS_PATH
Raid | RAID_AUTO_STOP_ENABLED, RAID_AUTO_STOP_DELAY
Chat Commands | TWITCH_ADMINS, STARTING_SCENE_NAME, BRB_SCENE_NAME
Behavior | WAIT_FOR_STREAM_START, EXIT_WHEN_STREAM_ENDS, IDLE_WHEN_STREAM_ENDS, LIVE_SCENE_LOW_GRACE_SEC
Overlay | ALERTS_BASE_URL

Tokens are auto-refreshed and persisted.

---

## Running the Services

### Development

```bash
python app.py --dev
python stream_guard.py
```

### Production (Recommended)

**Generate password hash first:**
```bash
python generate_password_hash.py
# Add the generated hash to .env as LOGIN_PASSWORD_HASH
```

**Deploy with Gunicorn + systemd:**

```bash
# Install dependencies
pip install -r requirements.txt

# Configure logging in .env
echo "LOGLEVEL=warning" >> .env
echo "GUNICORN_ACCESSLOG=/home/kim3k/stream-control/logs/access.log" >> .env

# Create logs directory
mkdir -p logs

# Install systemd service
sudo cp stream-control.service.example /etc/systemd/system/stream-control.service
sudo systemctl daemon-reload
sudo systemctl enable stream-control
sudo systemctl start stream-control
```

**Production stack:**
- Gunicorn with **threaded workers** (sync worker + 100 threads)
- Secure password hashing (Werkzeug scrypt)
- ProxyFix middleware for Cloudflare Tunnel
- Rotating access logs (10MB max)
- systemd for auto-restart on failure

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed production setup guide and [SOLUTION.md](SOLUTION.md) for architecture decisions.

---

## Using the Web UI

Section | Purpose
--------|--------
Status | OBS state, scene, health dots
Twitch | Title/category edit, raid
Restream | Manage push endpoints / Restream endpoints
Stream-PC | Wake / reboot / shutdown
Bot | Control a systemd service (optional)
Chat | Embedded Twitch chat
Alerts | Sounds when visiting Website

Toasts provide immediate feedback.

### Embedded Twitch Player

- Toggle a top Twitch player from the Chat tab by double‑clicking the Chat tab label.
- The player loads edge‑to‑edge, starts muted with autoplay, and is layered above the chat.
- Hiding the player fully unloads the iframe to stop audio and save bandwidth.
- The correct channel is resolved automatically from `/twitch/channel_info` and cached for instant display.

Note: Twitch requires the page’s hostname to be listed in the embed `parent` parameter; the template injects this automatically.

### Viewer count (OBS tab)

- While live, the OBS tab shows “Viewers: N”.
- Polling is enabled only when streaming and stops when offline to minimize load.
- Backend endpoint: `GET /twitch/stream_info` → `{ is_live, viewer_count, title, game_name, started_at }`.

---

### Repair Backend

If the backend feels stuck (e.g., nginx not serving correctly or StreamGuard appears unresponsive), the Mini-PC tab includes a "Repair Backend" button. This triggers a controlled restart of critical services to recover quickly.

What it does (by default):

- Restarts nginx
- Restarts StreamGuard (the guard process handling bitrate and EventSub)
- Restarts Stunnel (RTMPS)

Notes:

- The operation is idempotent and safe to run when services are already healthy.
- Use this when health indicators show red for nginx/StreamGuard/Stunnel or the UI becomes unresponsive due to those services.

## Restream Management

Workflow:

1. Open Restream panel.
2. Edit/add endpoints (checkbox = enabled).
3. Save → JSON updated → nginx config rendered → nginx reloaded automatically.
4. Only enabled endpoints produce `push` lines.

---


### Chat Commands

Chat commands are processed via the Twitch EventSub `channel.chat.message` subscription.
A valid user access token (loaded from `twitch_tokens.json`) is required and must include the chat scopes: `user:read:chat and user:write:chat`.

Only admins listed in `TWITCH_ADMINS` (comma separated, lowercase) are authorized.
Commands are CASE SENSITIVE and must match exactly:

Command | Action
------- | ------
`!start` | Start the stream (ignored if already live) then switch to `STARTING_SCENE_NAME` (if set) or stay on current
`!live`  | Switch to `LIVE_SCENE_NAME`
`!brb`   | Switch to `BRB_SCENE_NAME`
`!fix`   | Switch to BRB then back to LIVE after ~1 second
`!stop`  | Stop the current stream

Environment variables affecting commands:

- `TWITCH_ADMINS=admin1,admin2`
- `STARTING_SCENE_NAME=Starting soon` (optional)
- `BRB_SCENE_NAME=BRB` (optional; defaults handled in code)

If scenes are missing in OBS, commands log errors but do not crash the guard.

---

## Bitrate & Raid Automation

Feature | Behavior
--------|---------
Low fallback | Switch after N consecutive low samples
Recovery | Switch back once high threshold met
Raid auto-stop | Optional post-raid stream stop
Idle handling | Idle, continue, or exit when stream ends (configurable)

Scene transitions also dispatch overlay alerts.

---


## Twitch Integration & Tokens

- Automatic refresh when invalid or near expiry.
- Shared file `twitch_tokens.json` used by Stream Guard.
- Health shows validity + remaining lifetime.
- Revoked tokens trigger subscription re-attempt after refresh.

Both `app.py` and `stream_guard.py` use the same token file (`twitch_tokens.json`, path set by `TWITCH_TOKENS_PATH`).

- app.py is the ONLY process that refreshes / rotates the access + refresh tokens (writes the file).
- stream_guard.py is read‑only: it loads the current access token to:
  - Subscribe to EventSub topics (raids, chat messages)
  - Send chat messages (Helix Chat API) for feedback / raid completion
  - Read live stream info (Helix `streams`) exposed by `GET /twitch/stream_info` for the viewer counter
Required scopes for full functionality (recommend granting when generating initial tokens):

- user:read:chat
- user:write:chat
- channel:manage:broadcast (title/category updates)
- channel:read:subscriptions (optional future use)
If a token is revoked or expires, app.py refresh logic updates the file; guard detects validity returning to healthy automatically.


## Alert Sound
- Alerts from streamElements
- Alerts when low bitrate / Connection restored (TTS on website)
- Send: `POST /api/alert` `{ "type": "low"|"restored", "message": "..." }`
- Transport: WebSocket (stateless; waits for next event)

---

## Logs Viewer

A built-in, mobile-friendly log viewer is available from the Mini-PC tab via the "Logs" button. It helps you inspect systemd service logs without SSH.

Features:

- Service dropdown: switch between multiple services without mixing lines. Current services:
  - stream-guard.service (StreamGuard)
  - chatbot.service (optional)
  - nginx.service
  - stunnel-kick.service
  - stream-control.service (the web app itself)
- Line count selector: load last 25 (default), 50, or 100 lines.
- Follow toggle: continue streaming new lines in real time via WebSocket.
- Timestamp format: rendered in journalctl short style, e.g. "Sep 08 04:56:38:" for readability.
- Color cues: basic highlighting for ERROR/WARN/INFO/DEBUG.
- Auto-scroll, large buffer trimming, and service-isolated sessions avoid stale entries when switching.

API (optional):

- HTTP: GET `/api/logs?service=<key>&lines=<n>` returns the initial batch of lines.
- WS:   connect to `/ws/logs?service=<key>` to follow (`-n 0` on the backend prevents duplicate backlog).
- Accepted service keys match the UI dropdown (e.g. `streamguard`, `chatbot`, `nginx`, `stunnel`, `streamcontrol`).

Notes:

- Changing the selected service closes the previous follow stream and ignores stale messages by session.
- The default 25 lines load immediately on open; follow can be toggled on/off without reloading the history.

---

## Health Indicators

The dashboard polls a lightweight health endpoint and renders compact status dots (ok/offline/error) with labels.

Data source: GET `/api/sg_status`

Provided states (UI shows a dot + concise label):

- Chatbot: `chatbot_state` (systemd unit state)
- Nginx: `nginx_state` (systemd unit state)
- Stunnel: `stunnel_state` (systemd unit state)
- StreamGuard: `streamguard_state` (systemd unit state)
- ChatGuard: derived from `chat_ws` and `chat_subscribed` (ok when both are true; shows `ws` when WS is up but not yet subscribed)
- SLS: `sls_state` (stats endpoint availability)
- OBS: `obs_connected` (ok when true)
- Twitch Events WS: `raid_ws` (EventSub WebSocket alive)
- Raid AutoStop: `raid_subscribed` (EventSub `channel.raid` subscription active)
- Twitch Token: `token_valid` plus `token_expires_in` (minutes shown in the label when valid)

Color coding in UI:

- ok: green dot
- offline: gray dot
- error: red dot (e.g., explicit error conditions)

Operational notes:

- StreamGuard’s EventSub client auto-retries subscription with backoff after network/token changes.
- When a token transitions from invalid to valid, a forced re-subscribe attempt is scheduled promptly.

---

## Security Recommendations

- Reverse proxy + HTTPS
- Limit network exposure (VPN / LAN)
- Least-privilege sudo (only what’s required)
- Strong secrets (FLASK_SECRET_KEY, LOGIN_PASSWORD)
- Restrict token file permissions (600)
- Never commit `.env` or live stream keys



## IP Banning

Stream-Control now includes support for IP banning to protect against unwanted connections or abuse. When an IP is banned:

- Connections from the banned IP address are immediately blocked.
- A log entry is created to indicate that a blocked IP attempted to connect.
- Banned IPs can be managed via the `bans.json` file or directly through the admin control panel at `/bans`.

### How to Enable IP Banning

1. IP banning is enabled by default.



#### Important Notes

- Ensure the `bans.json` file is protected against unauthorized access.
- Use this feature cautiously to avoid accidentally blocking legitimate users.
- Unbanning IPs can be done easily via the admin control panel at `/bans`.

---

## Troubleshooting

Issue | Hint
------|-----
OBS “Error” | Check port/password & plugin
Token stays invalid | Refresh token expired → reissue
No raid stop | Verify raid_ws & raid_subscribed
Bitrate static | STATS_URL response format
nginx reload fails | Endpoint syntax / template values
Chat missing | Ensure broadcaster_name + correct parent domain

Check logs for both processes first.

---

## Extending

Ideas:
- More metrics
- Role-based access
- Come with suggestions

---

## Contributing

1. Fork
2. Branch `feat/<name>`
3. Commit with clear messages
4. Open PR (Problem / Solution / Test)

---

## Disclaimer

Provided “as is.” Review before exposing publicly.

---

Happy streaming.

<p align="center">
  <img width="220" src="Screenshots/logo.png" alt="Stream Control Logo">
</p>

<h1 align="center">Stream Control & Stream Guard</h1>

<p align="center">
  <a href="https://github.com/Kimsec/Stream-Control/releases/latest">
    <img src="https://img.shields.io/github/v/release/kimsec/Stream-Control" alt="Latest Release">
  </a>
  <a href="https://github.com/Kimsec/Stream-Control">
    <img src="https://img.shields.io/badge/Platform-Self%20Hosted-success" alt="Self Hosted">
  </a>
  <a href="https://www.buymeacoffee.com/kimsec">
    <img src="https://img.shields.io/badge/Support-Buy%20Me%20a%20Coffee-FFDD00?logo=buymeacoffee&logoColor=000" alt="Support">
  </a>
</p>

<p align="center">
A lightweight self‑hosted control panel and autonomous guardian for live streaming.
Manage OBS, Twitch metadata, outgoing raids, restream destinations, and automatic
bitrate-based scene switching. Designed for unattended, long-running operation.
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
- [Twitch Integration & Tokens](#twitch-integration--tokens)
- [Bitrate & Raid Automation](#bitrate--raid-automation)
- [Alert Overlay](#alert-overlay)
- [Health Indicators](#health-indicators)
- [Security Recommendations](#security-recommendations)
- [Troubleshooting](#troubleshooting)
- [Extending](#extending)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Stream-Control consists of:
1. A Flask-based control panel (web dashboard).
2. A companion background process (Stream Guard) that:
   - Monitors bitrate via a stats endpoint (e.g. SRS / SLS / nginx module JSON)
   - Switches scenes automatically (LIVE <-> lowbitrate)
   - Listens for Twitch outgoing raids (EventSub WebSocket) and can stop the stream
   - Exposes a local health JSON polled by the panel
3. An overlay alert channel (WebSocket) for visual/audio notifications (e.g. low bitrate).

No database—simple JSON + environment variables.

---

## Features

- OBS start/stop + scene switching.
- Twitch title & category update with live search.
- Outgoing raid trigger.
- Automatic bitrate-based fallback & recovery scene logic.
- Automatic Twitch user token maintenance (refresh & persistence).
- EventSub (channel.raid) with reconnect + revocation recovery + resubscribe.
- Restream editor (writes JSON, regenerates nginx push config, auto reload).
- Wake-on-LAN / restart / shutdown for remote Mini-PC.
- Optional systemd chatbot control.
- Overlay alert push (low / restored).
- Health/status indicators (OBS, raid WS, subscription, token, etc.).
- Chat commands (!start, !live, !brb, !fix, !stop) via EventSub chat messages (admins only, case sensitive).

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

## Quick Start

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env
python app.py
python stream_guard.py
```

Open http://localhost:5000 (login with LOGIN_PASSWORD).

---

## Prerequisites

- Python 3.10+
- OBS with obs-websocket v5
- nginx with RTMP module (if restreaming)
- Stats endpoint (for bitrate switching)
- Twitch API credentials (Client ID + Secret + user tokens)
- Optional: stunnel (RTMPS), systemd

---

## Installation

```bash
git clone https://github.com/Kimsec/Stream-Control.git
cd Stream-Control
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

---

## Configuration

Key groups in `.env`:

Group | Examples
------|---------
Flask/Auth | FLASK_SECRET_KEY, LOGIN_PASSWORD
OBS | OBS_HOST, OBS_PORT, OBS_PASSWORD
Bitrate | STATS_URL, BITRATE_LOW_KBPS, BITRATE_HIGH_KBPS, POLL_INTERVAL_SEC, LOW_CONSEC_SAMPLES
Scenes | LIVE_SCENE_NAME, LOW_SCENE_NAME
Restream | CONFIG_PATH, NGINX_CONF_OUT
Mini-PC | MINI_PC_USER, MINI_PC_IP, MAC_ADDRESS
Twitch | TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_BROADCASTER_ID, TWITCH_OAUTH_TOKEN, TWITCH_REFRESH_TOKEN, TWITCH_TOKENS_PATH
Raid | RAID_AUTO_STOP_ENABLED, RAID_AUTO_STOP_DELAY
Chat Commands | TWITCH_ADMINS, STARTING_SCENE_NAME, BRB_SCENE_NAME
Behavior | WAIT_FOR_STREAM_START, EXIT_WHEN_STREAM_ENDS, IDLE_WHEN_STREAM_ENDS
Overlay | ALERTS_BASE_URL

Tokens are auto-refreshed and persisted.

---

## Running the Services

Development:
```bash
python app.py
python stream_guard.py
```

Production:
- `gunicorn` for app.py
- systemd units for both processes
- Auto-restart on failure

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

---

## Restream Management

Workflow:
1. Open Restream panel.
2. Edit/add endpoints (checkbox = enabled).
3. Save → JSON updated → nginx config rendered → nginx reloaded automatically.
4. Only enabled endpoints produce `push` lines.

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
Required scopes for full functionality (recommend granting when generating initial tokens):
- user:read:chat
- user:write:chat
- channel:manage:broadcast (title/category updates)
- channel:read:subscriptions (optional future use)
If a token is revoked or expires, app.py refresh logic updates the file; guard detects validity returning to healthy automatically.

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

## Alert Overlay

- Send: `POST /api/alert` `{ "type": "low"|"restored", "message": "..." }`
- Display: `/overlay` (add to OBS as Browser Source)
- Transport: WebSocket (stateless; waits for next event)

---

## Health Indicators

Polled via `/api/sg_status`:

Field | Meaning
------|--------
obs_connected | OBS reachable
raid_ws | EventSub WebSocket alive
raid_subscribed | channel.raid active
token_valid | Twitch token OK
token_expires_in | Seconds remaining

Color coding in UI: ok / offline / error.

---

## Security Recommendations

- Reverse proxy + HTTPS
- Limit network exposure (VPN / LAN)
- Least-privilege sudo (only what’s required)
- Strong secrets (FLASK_SECRET_KEY, LOGIN_PASSWORD)
- Restrict token file permissions (600)
- Never commit `.env` or live stream keys

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
- More EventSub topics
- Additional overlay alert kinds
- Metrics exporter
- Role-based access
- Webhook integration → alerts

---

## Contributing

1. Fork
2. Branch `feat/<name>`
3. Commit with clear messages
4. Open PR (Problem / Solution / Test)

---

## License

Add your preferred license (e.g. MIT).

---

## Disclaimer

Provided “as is.” Review before exposing publicly.

---

Happy streaming.

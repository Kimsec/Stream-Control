<p align="center" width="10%">
    <img width="20%" src="Screenshots/logo.png"></a>
</p>

# <p align="center">Stream Control</p>

<br><p align="center" width="100%">
<a href="https://www.buymeacoffee.com/kimsec">
  <img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&amp;emoji=%E2%98%95&amp;slug=kimsec&amp;button_colour=FFDD00&amp;font_colour=000000&amp;font_family=Inter&amp;outline_colour=000000&amp;coffee_colour=ffffff" alt="Buy Me A Coffee"></a></p>

# Description
A small web control panel for streaming — built with **Flask**.  
Start/stop OBS streaming, switch scenes, update Twitch title/category, trigger raids, and manage **restreaming** via `nginx-rtmp` with a simple UI that lets you add/enable/disable RTMP push destinations. All secrets and paths are configured via **.env**.

---

## Table of contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Environment variables (.env)](#environment-variables-env)
- [Run](#run)
- [Nginx RTMP](#nginx-rtmp)
- [Restream endpoints (JSON)](#restream-endpoints-json)
- [Kick / RTMPS via stunnel (optional)](#kick--rtmps-via-stunnel-optional)
- [sudoers / permissions](#sudoers--permissions)
- [Systemd (optional)](#systemd-optional)
- [Security notes](#security-notes)

---

## Features

- **OBS control** via obs-websocket v5 (start/stop stream, switch scenes).
- **Twitch integration**: update stream title & category (with live category search), start a raid.
- **Restream management** with `nginx-rtmp`:
  - Toggle each destination on/off.
  - Add/edit/delete endpoints in the web UI.
  - Confirmation dialog before deleting.
  - Save -> renders RTMP config from a Jinja2 template and reloads nginx.
- **Mini-PC actions**: ping status, Wake-on-LAN, restart, shutdown.
- **Optional**: start/stop a `systemd` service (e.g., a chatbot) from the UI.

## Requirements

- **Python 3.10+**
- **OBS** with **obs-websocket v5** enabled
- **nginx** with **ngx_rtmp_module** (loaded with `load_module`)
- (Optional) **stunnel4** for RTMPS bridging (e.g., Kick)
- Linux (tested on Debian/Ubuntu family)

## Installation

```bash
git clone https://github.com/<your-username>/Stream-Control.git
cd Stream-Control

python -m venv venv
source venv/bin/activate        # On Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env            # Fill in your values
```

Run in development:

```bash
python app.py
# Open http://localhost:5000
```

## Environment variables (.env)

Everything sensitive and all paths live in **.env** (do **not** commit this file).  
See **.env.example** for the full list. Example:

```
FLASK_SECRET_KEY=change-me

CONFIG_PATH=/home/user/stream-control/rtmp_endpoints.json
NGINX_CONF_OUT=/etc/nginx/conf.d/rtmp.conf

OBS_HOST=127.0.0.1
OBS_PORT=4455
OBS_PASSWORD=change-me

MINI_PC_USER=user
MINI_PC_IP=192.168.0.10
MAC_ADDRESS=00:11:22:33:44:55

TWITCH_CLIENT_ID=xxx
TWITCH_OAUTH_TOKEN=xxx
TWITCH_BROADCASTER_ID=1234567

LOGIN_PASSWORD=super-secret
```

> **Note:** `NGINX_CONF_OUT` is the file Flask will overwrite when you save restream settings (e.g., point it to `/etc/nginx/conf.d/rtmp.conf`).

## Run

- Dev: `python app.py`
- Production: use **systemd** (recommended). See below.

## Nginx RTMP

The app renders `templates/nginx.conf.j2` and writes the result to `NGINX_CONF_OUT`.  
Your nginx must load the RTMP module and include the generated file (or write directly to it).

Minimal example the template produces:

```nginx
load_module modules/ngx_rtmp_module.so;

rtmp {
  server {
    listen 1935;
    chunk_size 4096;

    application live {
      live on;
      record off;

      # Generated from UI (enabled endpoints only):
      # push rtmp://...;
      # push rtmp://...;
    }
  }
}
```

On save, the app runs (via sudo):
```
nginx -t && nginx -s reload
```

## Restream endpoints (JSON)

`CONFIG_PATH` points to a file with this structure:

```json
{
  "push_endpoints": [
    { "name": "Twitch",  "url": "rtmp://a.rtmp.twitch.tv/app/<key>",    "enabled": true  },
    { "name": "YouTube", "url": "rtmp://a.rtmp.youtube.com/live2/<key>","enabled": false }
  ]
}
```

The UI lets you **check/uncheck** to enable/disable, edit name & URL, and add/delete rows.

## Kick / RTMPS via stunnel (optional)

`nginx-rtmp` can’t push RTMPS directly. Use a local TLS tunnel and push RTMP to it.

Example `/etc/stunnel/stunnel.conf`:

```
client = yes
foreground = no
output = /var/log/stunnel4/kick.log
pid = /run/stunnel4/stunnel.pid

[rtmps-kick]
accept  = 127.0.0.1:19360
connect = fa723fc1b171.global-contribute.live-video.net:443
```

Start stunnel (`stunnel4` service or a custom unit).  
Then, in the UI add this endpoint:

```
rtmp://127.0.0.1:19360/app/STREAM_KEY
```

## sudoers / permissions

The app uses `sudo -n` for nginx test/reload and (optionally) to control a systemd service.  
Grant your user exact commands with `visudo` (adjust user/paths/service names):

```
# nginx
youruser ALL=(root) NOPASSWD: /usr/sbin/nginx -t, /usr/sbin/nginx -s reload

# optional: a service named "chatbot"
youruser ALL=(root) NOPASSWD: /bin/systemctl start chatbot, /bin/systemctl stop chatbot, /bin/systemctl restart chatbot
```

> **Heads-up:** `-n` makes sudo non-interactive; if the rule doesn’t match exactly, commands will fail instead of prompting for a password.

## Systemd (optional)

Example service for the app (`/etc/systemd/system/stream-control.service`):

```ini
[Unit]
Description=Stream Control Web Server
After=network.target

[Service]
User=youruser
WorkingDirectory=/home/youruser/stream-control
Environment="PYTHONUNBUFFERED=1"
ExecStart=/home/youruser/stream-control/venv/bin/python /home/youruser/stream-control/app.py
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable + start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now stream-control
```

## Security notes

- Keep the app behind a VPN, reverse proxy with auth, or on a trusted network.  
- Never commit `.env` or any real keys/stream URLs.  
- Limit sudoers entries to the exact commands needed.  
- Consider running the app as a non-root user under systemd with a minimal environment.

<p align="center">
  <img width="220" src="Screenshots/logo.png" alt="Stream Control Logo">
</p>

<h1 align="center">Stream Control & Stream Guard</h1>

<br><p align="center" width="100%">
<a href="https://www.buymeacoffee.com/kimsec">
<img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=%E2%98%95&slug=kimsec&button_colour=FFDD00&font_colour=000000&font_family=Inter&outline_colour=000000&coffee_colour=ffffff" alt="Buy Me A Coffee"></a></p>

<p align="center">
  <a href="https://github.com/Kimsec/Stream-Control/releases/latest">
  <img src="https://img.shields.io/github/v/release/kimsec/Stream-Control" alt="Latest Release"></a>
  <a href="https://github.com/Kimsec/Stream-Control">
  <img src="https://img.shields.io/badge/Platform-Self%20Hosted-success" alt="Self Hosted"></a>
  <a href="https://www.buymeacoffee.com/kimsec">
  <img src="https://img.shields.io/badge/Support-By%20donation-FFDD00?logo=buymeacoffee&logoColor=000" alt="Support"></a>
</p>

<p align="center">
A simple streaming control panel that brings everything you need into one place: Start and stop streams, switch scenes automatically, change Twitch titles, manage where you stream to, and control your streaming PC - all from one dashboard.
</p>

---

## Table of Contents
- [What is Stream Control?](#what-is-stream-control)
- [Main Features](#main-features)
- [Before You Start](#before-you-start)
- [Installation](#installation)
- [Setup](#setup)
- [How to Use Stream Control](#how-to-use-stream-control)
- [Manage Streaming Destinations](#manage-streaming-destinations)
- [Chat Commands](#chat-commands)
- [Automatic Features](#automatic-features)
- [Audio Alerts](#audio-alerts)
- [Log Viewer](#log-viewer)
- [Status Indicators](#status-indicators)
- [Security Tips](#security-tips)
- [IP Banning](#ip-banning)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

---

## What is Stream Control?

Stream Control is a web-based control panel that makes it easier to manage your stream. Instead of jumping between different programs and websites, you get everything in one place.

The system consists of two parts:
1. **Control Panel** - A website where you control everything
2. **Stream Guard** - A background program that automatically monitors your stream

---

## Main Features

### 🎮 OBS Control
- Start and stop streams
- Switch between scenes
- View OBS status

### 📺 Twitch Management
- Change stream title and category
- Start raids to other streamers
- View viewer count while live
- Embedded Twitch player and chat

### 🔄 Multi-Streaming
- Stream to multiple platforms simultaneously
- Easy to add and remove destinations
- Enable/disable without needing to restart

### 🤖 Automatic Features
- Automatically switch scenes when internet connection degrades
- Automatically stop stream after raid (optional)
- Keep stream stable even with unstable connection

### 💻 Remote PC Control
- Turn on PC via Wake-on-LAN
- Restart PC
- Shutdown PC
- Repair services if something hangs

### 💬 Chat Commands
- Control stream directly from Twitch chat
- Only administrators can use commands
- Commands like !start, !live, !brb, !stop

### 🔔 Alerts
- Get notified when internet connection degrades
- Get notified when connection returns to normal
- Audio and visual notifications

---

## Before You Start

You need the following before setting up Stream Control:

### Software
- Python 3.10 or newer
- OBS Studio with obs-websocket plugin (version 5)
- nginx with RTMP module (if streaming to multiple platforms)

### Twitch Connection
- Twitch account
- Twitch API access (Client ID and Secret)
- You must generate tokens to connect to Twitch

### Optional
- stunnel (for RTMPS support)
- systemd (for automatic startup on Linux)

---

## Installation

### Step 1: Download Stream Control

```bash
git clone https://github.com/Kimsec/Stream-Control.git
cd Stream-Control
```

### Step 2: Set up Python Environment

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### Step 3: Copy Configuration File

```bash
cp .env.example .env
```

Now you need to edit the `.env` file with your own settings (see next section).

---

## Setup

Open the `.env` file in a text editor and fill in these important settings:

### Basic Settings

| Setting | What is it? | Example |
|---------|-------------|---------|
| `LOGIN_PASSWORD` | Password to log into the control panel | `MySecretPassword123` |
| `FLASK_SECRET_KEY` | A random text string for security | Generate a long, random text |

### OBS Connection

| Setting | What is it? |
|---------|-------------|
| `OBS_HOST` | IP address of the PC running OBS (usually `localhost`) |
| `OBS_PORT` | Port for obs-websocket (usually `4455`) |
| `OBS_PASSWORD` | Password you set in obs-websocket |

### Scene Names

| Setting | What is it? |
|---------|-------------|
| `LIVE_SCENE_NAME` | Name of the scene you use when live |
| `LOW_SCENE_NAME` | Name of the scene shown during poor internet |
| `BRB_SCENE_NAME` | Name of the "Be Right Back" scene |
| `STARTING_SCENE_NAME` | Name of the "Starting Soon" scene (optional) |

### Twitch Connection

| Setting | What is it? | How to get it? |
|---------|-------------|----------------|
| `TWITCH_CLIENT_ID` | ID for your Twitch app | Create app at dev.twitch.tv |
| `TWITCH_CLIENT_SECRET` | Secret for your Twitch app | From same place |
| `TWITCH_BROADCASTER_ID` | Your Twitch user ID | Use twitch.tv/popout/.../viewercard |
| `TWITCH_OAUTH_TOKEN` | Access token | Generate via Twitch API |
| `TWITCH_REFRESH_TOKEN` | Refresh token | Generated at same time as access token |

### Internet Speed Monitoring

| Setting | What is it? |
|---------|-------------|
| `STATS_URL` | URL to statistics endpoint for bitrate monitoring |
| `BITRATE_LOW_KBPS` | How low bitrate (in kbps) before scene switches |
| `BITRATE_HIGH_KBPS` | How high bitrate before switching back |

### Streaming PC Remote Control

| Setting | What is it? |
|---------|-------------|
| `MINI_PC_IP` | IP address of the streaming PC |
| `MINI_PC_USER` | Username on the streaming PC |
| `MAC_ADDRESS` | MAC address of the network card (for Wake-on-LAN) |

### Chat Commands

| Setting | What is it? | Example |
|---------|-------------|---------|
| `TWITCH_ADMINS` | List of users who can use chat commands | `user1,user2,user3` |

**Note:** All usernames must be lowercase and without the @ symbol.

---

## How to Use Stream Control

### Start the Services

You need to start two programs:

**Terminal 1 - Control Panel:**
```bash
python app.py
```

**Terminal 2 - Stream Guard:**
```bash
python stream_guard.py
```

### Open the Control Panel

Go to http://localhost:5000 in your web browser and log in with the password you set in `.env`.

### Control Panel Overview

The control panel is divided into several tabs:

#### 📊 Status Tab
Here you can see:
- Whether OBS is connected
- Which scene is active
- Status of all services (green/red/gray dots)

#### 📺 OBS Tab
Here you can:
- Start and stop stream
- Switch scenes (Live, BRB, Starting)
- View viewer count when live

#### 🎮 Twitch Tab
Here you can:
- Change stream title
- Change category/game
- Start raid
- Get suggestions while typing

#### 🔄 Restream Tab
Here you manage where you stream:
- Add multiple streaming destinations
- Enable and disable destinations
- All changes are automatically activated

#### 💻 Mini-PC Tab
Here you can:
- Turn on streaming PC
- Restart PC
- Shutdown PC
- Repair services if something isn't working
- View system logs

#### 🤖 Bot Tab
Control chatbot service (if you have one)

#### 💬 Chat Tab
- View Twitch chat directly
- Double-click "Chat" to show Twitch player

---

## Manage Streaming Destinations

Stream Control makes it easy to stream to multiple platforms simultaneously.

### How to Add a Streaming Destination:

1. Go to the **Restream Tab**
2. Click **Edit Endpoints**
3. In the popup window:
   - **Name**: Give it a descriptive name (e.g., "YouTube", "Facebook")
   - **URL**: Paste the RTMP URL from the platform
   - **Checkbox**: Check to enable the destination
4. Click **Save**

The system will automatically:
- Update the configuration
- Start streaming to the new destinations
- Show green status icon when everything is working

### Enable and Disable Destinations

You can at any time:
- Uncheck to stop streaming to a destination
- Check again to re-enable it
- Delete destinations you no longer need

---

## Chat Commands

You can control your stream directly from Twitch chat. Only users listed in `TWITCH_ADMINS` can use these commands.

**Important:** Commands must be typed EXACTLY as shown (lowercase).

| Command | What does it do? |
|---------|------------------|
| `!start` | Starts the stream and goes to starting scene |
| `!live` | Switches to live scene |
| `!brb` | Switches to "Be Right Back" scene |
| `!fix` | Switches to BRB and back to Live (to fix small issues) |
| `!stop` | Stops the stream |

### Example:
If you type `!brb` in chat, the stream will automatically switch to your BRB scene.

---

## Automatic Features

Stream Guard continuously monitors your stream and makes adjustments automatically.

### 📉 Automatic Scene Switching During Poor Internet

**How it works:**
1. Stream Guard continuously checks your internet connection
2. If bitrate (speed) falls below the threshold you set, this happens:
   - Stream automatically switches to "low bitrate" scene
   - You receive an alert (audio and visual)
3. When internet is stable again:
   - Stream automatically returns to live scene
   - You're notified that the connection is back

**Settings you can adjust:**
- `BITRATE_LOW_KBPS`: How low bitrate before switching scene
- `BITRATE_HIGH_KBPS`: How high bitrate must be before switching back
- `LOW_CONSEC_SAMPLES`: How many consecutive poor measurements before switching

### 🎯 Automatic Stop After Raid

If enabled, the stream will automatically stop shortly after you raid another streamer.

**To enable:**
Set `RAID_AUTO_STOP_ENABLED=true` in the `.env` file.

**Delay:**
Set `RAID_AUTO_STOP_DELAY` (in seconds) for how long to wait before stopping.

---

## Audio Alerts

Stream Control can notify you with sound when important events occur.

### What do you get alerts for?
- 🔴 **Low bitrate**: When internet connection degrades
- 🟢 **Connection restored**: When internet is back to normal

### How does it work?
Alerts use text-to-speech (TTS) to speak messages aloud on your website. This allows you to hear alerts even if you're not looking at the screen.

---

## Log Viewer

You can view logs from all your services directly in the control panel.

### How to Open Log Viewer:
1. Go to the **Mini-PC Tab**
2. Click the **Logs** button

### What can you do?
- **Select service**: View logs from StreamGuard, nginx, stunnel, etc.
- **Select number of lines**: Show the last 25, 50, or 100 lines
- **Follow live**: Enable to see new log messages in real-time
- **Color codes**: Errors shown in red, warnings in yellow, etc.

This makes it easy to find out what's happening if something goes wrong, without using complex commands.

---

## Status Indicators

At the top of the control panel, you'll see small dots showing the status of all services:

### What do the colors mean?

| Color | Meaning |
|-------|---------|
| 🟢 Green | Everything is working as it should |
| ⚪ Gray | Service is not active or disconnected |
| 🔴 Red | There's a problem that needs fixing |

### What is monitored?

| Service | What it is |
|---------|-----------|
| **Chatbot** | Your chat bot (if you have one) |
| **Nginx** | Server that sends stream to multiple places |
| **Stunnel** | Secure streaming connection |
| **StreamGuard** | Background program monitoring your stream |
| **ChatGuard** | Chat monitoring and commands |
| **SLS** | Streaming server status |
| **OBS** | Whether OBS is connected |
| **Twitch Events** | Whether Twitch events work (raid, chat) |
| **Raid AutoStop** | Whether automatic raid stop is active |
| **Twitch Token** | Whether Twitch connection is valid |

The dots update automatically, so you always see current status.

---

## Security Tips

Stream Control gives you control over a lot, so it's important to secure it properly:

### ✅ Recommended Security Measures

1. **Use Strong Passwords**
   - Choose a long and complex password for `LOGIN_PASSWORD`
   - Generate a long, random string for `FLASK_SECRET_KEY`

2. **Protect Access**
   - Use VPN or limit to local network
   - If opening to internet: set up a reverse proxy with HTTPS

3. **Protect Token File**
   - Set correct file permissions on `twitch_tokens.json` (only owner can read/write)
   - Command: `chmod 600 twitch_tokens.json`

4. **Don't Share Secrets**
   - Never share the `.env` file with others
   - Don't commit `.env` to Git
   - Never share stream keys publicly

5. **Keep System Updated**
   - Update Stream Control regularly
   - Keep Python and other dependencies updated

6. **Minimize Access**
   - Only grant necessary sudo permissions
   - Limit which commands can be run via control panel

---

## IP Banning

Stream Control has built-in support for blocking unwanted IP addresses.

### How it works:
- Connections from blocked IP addresses are stopped immediately
- Blocked attempts are logged
- You can manage blocks via the `/bans` page

### Manage Blocked IP Addresses:
1. Go to `/bans` in your browser (e.g., http://localhost:5000/bans)
2. Here you can:
   - View list of blocked IP addresses
   - Add new IP addresses to block
   - Unblock IP addresses

### Important:
- Be careful not to block yourself
- Protect the `bans.json` file from unauthorized access
- Blocked IP addresses are stored in `bans.json`

---

## Troubleshooting

### Problem: OBS shows "Error" in status

**Possible causes:**
- OBS is not running
- obs-websocket is not installed
- Wrong port or password

**Solution:**
1. Check that OBS is running
2. Verify that obs-websocket plugin is installed (version 5)
3. Double-check `OBS_PORT` and `OBS_PASSWORD` in `.env`

---

### Problem: Twitch token remains invalid

**Possible causes:**
- Refresh token has expired
- Error in token file

**Solution:**
1. Generate new tokens via Twitch API
2. Update both `TWITCH_OAUTH_TOKEN` and `TWITCH_REFRESH_TOKEN` in `.env`
3. Restart both services

---

### Problem: Raid doesn't stop stream

**Possible causes:**
- `RAID_AUTO_STOP_ENABLED` is not set to `true`
- Twitch connection is not working

**Solution:**
1. Check that status indicators "Twitch Events WS" and "Raid AutoStop" are green
2. Verify that `RAID_AUTO_STOP_ENABLED=true` in `.env`
3. Check StreamGuard logs for more information

---

### Problem: Automatic scene switching doesn't work

**Possible causes:**
- `STATS_URL` is wrong or unavailable
- Bitrate thresholds are set incorrectly

**Solution:**
1. Test `STATS_URL` in browser - should return JSON data
2. Check that `BITRATE_LOW_KBPS` and `BITRATE_HIGH_KBPS` are reasonable values
3. Check StreamGuard logs for bitrate measurements

---

### Problem: Nginx doesn't reload after restream changes

**Possible causes:**
- Syntax error in endpoint URL
- nginx doesn't have permission to reload

**Solution:**
1. Double-check that all RTMP URLs are correct
2. Check nginx logs for error messages
3. Verify that user has sudo access to `nginx -s reload`

---

### Problem: Chat commands don't work

**Possible causes:**
- Username is not in `TWITCH_ADMINS`
- Command is typed incorrectly (must be lowercase)
- Chat connection is down

**Solution:**
1. Check that username is listed in `TWITCH_ADMINS` (lowercase, no @)
2. Type command exactly as shown: `!start`, `!live`, `!brb`, `!fix`, `!stop`
3. Verify that "ChatGuard" is green in status indicator

---

### Problem: Can't see Twitch player or chat

**Possible causes:**
- Wrong domain name in embed settings
- Blocked by ad blocker
- Twitch API issue

**Solution:**
1. Check that your domain name is correctly configured
2. Try disabling ad blocker temporarily
3. Check if you can open Twitch directly in browser

---

### General tips:
- **Always check logs first** - They often show what's wrong
- **Restart both services** - Many problems are solved with a restart
- **Double-check `.env` file** - Many errors come from incorrect configuration
- **Test step by step** - Start with basic functionality before adding more

---

## Contributing

Want to help make Stream Control better? Great!

### How to Contribute:

1. **Fork the project** on GitHub
2. **Create a new branch** for your feature: `git checkout -b my-new-feature`
3. **Make your changes** with clear commit messages
4. **Push to your fork**: `git push origin my-new-feature`
5. **Open a Pull Request** with description of:
   - The problem you're solving
   - How the solution works
   - How you tested it

### Ideas for Improvements:
- Translations to more languages
- Support for more streaming platforms
- Better mobile adaptation
- More automation features
- Documentation and tutorials

All contributions are welcome, whether bug fixes, new features, or improved documentation!

---

## Disclaimer

Stream Control is provided "as is" without any warranties. Please review all configuration before exposing the system publicly on the internet.

---

**Happy streaming!** 🎮📺

If you have questions or need help, check the GitHub repo for issues and discussions.

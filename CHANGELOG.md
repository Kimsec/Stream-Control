# Changelog

All notable changes to this project will be documented in this file.

## [v1.0.0] - 2025-11-24

> 🎉 **First stable release!** The beta phase is officially over—Stream Control v1.0.0 focuses on polishing the live preview + chat workflow so the dashboard layout stays rock-solid when you pop the Twitch player in and out during streams.

### Changed (v1.0.0)

- Chat tab layout now keeps the overall page height consistent whether the Twitch preview is visible or hidden by dynamically offsetting the chat container via `--preview-offset`.
- Preview toggle logic watches the embed height with a `ResizeObserver`, ensuring the Twitch chat automatically shifts to sit directly under the live preview without introducing scroll.

### Improvements

- Code polish across the preview/chat stack to remove inline sizing overrides and rely on shared CSS variables.
- Fine-tuned the ResizeObserver wiring so preview height changes propagate instantly without layout jitter.
- General UI touch-ups (button states, modal handling) to keep the stable release feeling snappy.

## [v0.10.0] - 2025-10-27

### Added (v0.10.0)

- Twitch viewer count in the OBS tab with live-only polling
  - New API: `GET /twitch/stream_info` returns `{ is_live, viewer_count, title, game_name, started_at }`
  - Frontend polls only while streaming; interval configurable via `window.__VIEWER_POLL_MS` (default 10s)
- Top Twitch player embed
  - Edge-to-edge container, muted autoplay, correct `parent` handling via template attributes
  - Double-click Chat tab to toggle; fully unloads iframe on hide to stop audio/data
  - Uses the logged-in broadcaster automatically (cached from `/twitch/channel_info`) for instant show
  - Prevent text selection on double-click for a clean gesture
- Mobile chat optimizations
  - Chat tab runs fullscreen without scroll; tightened iOS URL-bar behavior and sizing
- Power action confirmations
  - Shared confirmation modal for Restart/Shutdown (in addition to Stop Stream)
  - Repair Backend confirmation modal (restarts nginx and StreamGuard)
- Guard robustness
  - Health HTTP server now supports graceful shutdown, address reuse, and retry binding to tolerate fast systemd restarts
  - Token validator triggers forced EventSub resubscription when a previously invalid token becomes valid again
  - Bitrate guard supports `LIVE_SCENE_LOW_GRACE_SEC` to ignore low-bitrate blips immediately after switching to LIVE
- Nginx template improvements: DNS resolvers and timeout configured in `nginx.conf.j2`

### Changed (v0.10.0)

- Title/Category editor UX
  - Debounced category search with request aborts; minimum 2 chars; similarity-ranked results (top 6)
  - Prefills from a 5‑minute channel info cache and shows placeholders while loading
- Restream editor UI
  - Switched to class-based selectors; grid layout; cleaner icon buttons; compact mobile view (hide RTMP until editing)
- Health panel mapping refined
  - ChatGuard dot shows `ws` when WebSocket is up but subscription not yet confirmed; added stunnel service state mapping

### Fixed (v0.10.0)

- Eliminated "Address already in use" on rapid `systemctl restart` of StreamGuard (health server binds with reuse + retries)
- Prevented accidental text selection when toggling the Twitch player
- Corrected chat fullscreen sizing and z-index so the player stays above the chat iframe
- Logs viewer polish: stale message guards and no duplicate backlog when following

### Documentation (v0.10.0)

- README wording tweaks and Repair Backend description clarified (restarts Nginx and StreamGuard)

### Upgrade notes (v0.10.0)

- Ensure `TWITCH_BROADCASTER_ID`, `TWITCH_CLIENT_ID`, and `TWITCH_CLIENT_SECRET` are set for the new stream info API and token refresh
- The nginx template now specifies public DNS resolvers; verify outbound DNS is allowed
- No database changes; static assets updated

## [v0.9.0] - 2025-09-23

### Added

- Logs Viewer in the web UI (Mini‑PC tab → Logs):
  - Service dropdown (StreamGuard, Chatbot, Nginx, Stunnel Kick, Stream Control)
  - Line count selector (25/50/100), Follow mode via WebSocket
  - Journalctl‑style timestamps (e.g., "Sep 08 04:56:38:"), color highlighting
  - Clean switching without mixing logs, auto‑scroll, and buffer trimming
  - API: `GET /api/logs?service=<key>&lines=<n>`, WS: `/ws/logs?service=<key>`
- Health Indicators expanded:
  - Shows Chatbot, Nginx, Stunnel, StreamGuard, ChatGuard, SLS, OBS, Twitch Events WS, Raid AutoStop, Token
  - Concise labels and unified dot styling (ok/offline/error)
- Repair Backend button on Mini‑PC tab to restart core services (nginx and StreamGuard)
- IP Banning support with admin UI at `/bans` and persistent `bans.json`

### Changed

- Status emojis replaced with unified health dots across the UI
- EventSub resubscribe logic hardened:
  - Immediate attempt on `session_welcome`
  - Forced resubscribe when token transitions to valid
  - Backoff to prevent spamming

### Fixed

- Logs initial load always respects the selected line count (default 25)
- Prevent stale WebSocket messages when switching services in Logs Viewer
- Minor CSS/layout refinements for logs and mobile

### Notes

- StreamGuard reads tokens from `twitch_tokens.json`; only `app.py` refreshes/rotates tokens.
- For production, consider running `app.py` behind `gunicorn` and using systemd with auto‑restart.

<!-- End of release notes -->

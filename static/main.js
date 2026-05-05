document.getElementById("year").textContent = new Date().getFullYear();
let lastStreaming = null;
const chatbotToggleEl = document.getElementById('chatbot-toggle');
const unifiedChatToggleEl = document.getElementById('unified-chat-toggle');
const advancedBtn = document.getElementById('advancedBtn');
const advancedPanelEl = document.getElementById('advancedPanel');
let _chatbotAutoStartEnabled = true;
let _chatbotPrefHoldUntil = 0;
let _unifiedChatAutoStartEnabled = false;
let _unifiedChatPrefHoldUntil = 0;
let _isStreamingLive = false;
let _advancedPanelVisible = false;
const UNIFIED_CHAT_EMBED_URL = 'https://unified-chat.kimsec.net/popout?platform_names=0';
const UNIFIED_CHAT_RETRY_MS = 2500;
const belaboxContainerEl = document.getElementById('belabox-container');
const BELABOX_EMBED_URL = belaboxContainerEl?.dataset.embedUrl || 'https://belabox.kimsec.net';
const BELABOX_RETRY_MS = 2500;
let _chatTabActive = false;
let _chatEmbedMounted = false;
let _chatEmbedReady = false;
let _chatRetryTimer = null;
let _chatReadyRequestInFlight = false;
let _chatIframeEl = null;
let _belaboxTabActive = false;
let _belaboxEmbedMounted = false;
let _belaboxEmbedReady = false;
let _belaboxRetryTimer = null;
let _belaboxReadyRequestInFlight = false;
let _belaboxIframeEl = null;

function _syncAppHeight(){
  const docEl = document.documentElement;
  if(!docEl) return;
  const viewport = window.visualViewport;
  const h = Math.round((viewport && viewport.height) || window.innerHeight || docEl.clientHeight || 0);
  if(h > 0){
    docEl.style.setProperty('--app-height', `${h}px`);
  }
}

_syncAppHeight();

function _setAdvancedPanelVisibility(show){
  _advancedPanelVisible = !!show;
  if(advancedPanelEl){
    if(_advancedPanelVisible){
      advancedPanelEl.classList.add('expanded');
    } else {
      advancedPanelEl.classList.remove('expanded');
    }
    advancedPanelEl.style.maxHeight = '';
    advancedPanelEl.style.opacity = '';
    advancedPanelEl.setAttribute('aria-hidden', _advancedPanelVisible ? 'false' : 'true');
  }
  if(advancedBtn){
    advancedBtn.setAttribute('aria-expanded', _advancedPanelVisible ? 'true' : 'false');
  }
}

if(advancedBtn && advancedPanelEl){
  _setAdvancedPanelVisibility(false);
  advancedBtn.addEventListener('click', () => {
    _setAdvancedPanelVisibility(!_advancedPanelVisible);
  });
}

const srtLinkToggleBtn = document.getElementById('srtLinkToggleBtn');
const srtLinkPanel = document.getElementById('srtLinkPanel');
const srtLinkCopyBtn = document.getElementById('srtLinkCopyBtn');
const srtLinkDisplay = document.getElementById('srtLinkDisplay');

function _setSrtLinkPanelVisibility(show){
  if(!srtLinkPanel) return;
  if(show){
    srtLinkPanel.classList.add('expanded');
    srtLinkPanel.setAttribute('aria-hidden','false');
    if(srtLinkToggleBtn) srtLinkToggleBtn.setAttribute('aria-expanded','true');
  } else {
    srtLinkPanel.classList.remove('expanded');
    srtLinkPanel.setAttribute('aria-hidden','true');
    if(srtLinkToggleBtn) srtLinkToggleBtn.setAttribute('aria-expanded','false');
  }
}

if(srtLinkToggleBtn && srtLinkPanel){
  srtLinkToggleBtn.addEventListener('click', () => {
    _setSrtLinkPanelVisibility(!srtLinkPanel.classList.contains('expanded'));
  });
}

if(srtLinkCopyBtn){
  srtLinkCopyBtn.addEventListener('click', async () => {
    const url = (srtLinkDisplay && srtLinkDisplay.dataset.srtUrl) || '';
    if(!url){ showToast('No SRT link configured', 'error'); return; }
    try {
      if(navigator.clipboard && window.isSecureContext){
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      showToast('SRT link copied', 'success');
    } catch(e){
      showToast('Copy failed', 'error');
    }
  });
}

function _syncChatbotToggleUI(){
  if(chatbotToggleEl){
    chatbotToggleEl.checked = !!_chatbotAutoStartEnabled;
  }
}

function _syncUnifiedChatToggleUI(){
  if(unifiedChatToggleEl){
    unifiedChatToggleEl.checked = !!_unifiedChatAutoStartEnabled;
  }
}

function _persistChatbotAutoStart(enabled){
  return fetch('/api/chatbot_autostart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: !!enabled })
  });
}

function _startChatbot(){
  return fetch('/bot/start', { method: 'POST' }).catch(()=>{});
}

function _stopChatbot(){
  return fetch('/bot/stop', { method: 'POST' }).catch(()=>{});
}

function _persistUnifiedChatAutoStart(enabled){
  return fetch('/api/unified_chat_autostart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: !!enabled })
  });
}

function _startUnifiedChat(){
  return fetch('/unified-chat/start', { method: 'POST' }).catch(()=>{});
}

function _stopUnifiedChat(){
  return fetch('/unified-chat/stop', { method: 'POST' }).catch(()=>{});
}

function _handleChatbotToggleChange(enabled){
  _chatbotAutoStartEnabled = !!enabled;
  _chatbotPrefHoldUntil = Date.now() + 2000;
  _syncChatbotToggleUI();
  _persistChatbotAutoStart(_chatbotAutoStartEnabled).catch(()=>{});
  if(!_chatbotAutoStartEnabled){
    _stopChatbot();
  } else if (_isStreamingLive) {
    _startChatbot();
  }
}

function _handleUnifiedChatToggleChange(enabled){
  _unifiedChatAutoStartEnabled = !!enabled;
  _unifiedChatPrefHoldUntil = Date.now() + 2000;
  _syncUnifiedChatToggleUI();
  _persistUnifiedChatAutoStart(_unifiedChatAutoStartEnabled).catch(()=>{});
  if(!_unifiedChatAutoStartEnabled){
    _stopUnifiedChat();
  } else if (_isStreamingLive) {
    _startUnifiedChat();
  }
}

if(chatbotToggleEl){
  chatbotToggleEl.addEventListener('change', (ev) => {
    _handleChatbotToggleChange(ev.target.checked);
  });
  fetch('/api/chatbot_autostart')
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(js => {
      if(typeof js.enabled === 'boolean' && Date.now() > _chatbotPrefHoldUntil){
        _chatbotAutoStartEnabled = js.enabled;
        _syncChatbotToggleUI();
      }
    })
    .catch(()=>{});
}

if(unifiedChatToggleEl){
  unifiedChatToggleEl.addEventListener('change', (ev) => {
    _handleUnifiedChatToggleChange(ev.target.checked);
  });
  fetch('/api/unified_chat_autostart')
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(js => {
      if(typeof js.enabled === 'boolean' && Date.now() > _unifiedChatPrefHoldUntil){
        _unifiedChatAutoStartEnabled = js.enabled;
        _syncUnifiedChatToggleUI();
      }
    })
    .catch(()=>{});
}
// Enkel cache for channel info (title/category) for raskere UX
let _channelInfoCache = { data: null, ts: 0 };
const CHANNEL_INFO_TTL_MS = 300_000; // 5 min (mindre hyppig refresh)

function prefetchChannelInfo(force=false){
  if(!force && _channelInfoCache.data && (Date.now() - _channelInfoCache.ts) < CHANNEL_INFO_TTL_MS) return; // already fresh enough
  fetch('/twitch/channel_info')
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(d => { _channelInfoCache = { data: d, ts: Date.now() }; })
    .catch(()=>{});
}
// --- Toast system ---
function showToast(msg, type='info', opts={}){
  const host = document.getElementById('toast-host');
  if(!host) return window.alert(msg); // fallback
  const el = document.createElement('div');
  el.className = 'toast '+type;
  el.setAttribute('role','status');
  el.innerHTML = `<span class="toast-msg">${msg}</span>`;
  host.appendChild(el);
  const ttl = opts.ttl || 3800;
  let closed = false;
  function close(){
    if(closed) return; closed=true; el.classList.add('fade-out');
    setTimeout(()=>{ el.remove(); }, 340);
  }
  setTimeout(close, ttl);
}
// Tabs
const ACTIVE_TAB_KEY = 'stream-control.activeTab';
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');
const footer = document.getElementById('main-footer');
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const tabId = tab.getAttribute('data-tab');
        if (!tabId) return;
        const activeTabContent = document.getElementById(tabId);
        if (!activeTabContent) return;

        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        activeTabContent.classList.add('active');

        try {
          localStorage.setItem(ACTIVE_TAB_KEY, tabId);
        } catch (e) {}

        const isChatTab = tabId === 'chat';
        const isBelaboxTab = tabId === 'belabox';

        // Kun chat skjuler footer og lar CSS styre høyde
        if (isChatTab) {
          if (footer) footer.style.display = 'none';
          const chatContainerEl = document.getElementById('chat-container');
          if (chatContainerEl) chatContainerEl.style.height = '';
          _handleUnifiedChatTabVisibility(true);
        } else {
          if (footer) footer.style.display = '';
          _handleUnifiedChatTabVisibility(false);
        }

        _handleBelaboxTabVisibility(isBelaboxTab);
    });
});

// Restore last active tab (localStorage-only)
(() => {
  let saved = '';
  try {
    saved = localStorage.getItem(ACTIVE_TAB_KEY) || '';
  } catch (e) {
    return;
  }
  if (!saved) return;
  if (!/^[A-Za-z0-9_-]+$/.test(saved)) return;

  const savedTab = document.querySelector(`.tab[data-tab="${saved}"]`);
  const savedContent = document.getElementById(saved);
  if (!savedTab || !savedContent) return;

  savedTab.click();
})();

// Mini-PC
function sendRequest(url) {
    fetch(url, { method: 'POST' })
        .then(res => res.text())
  .then(t => showToast(t,'success'))
  .catch(err => showToast('Error: '+err,'error'));
}
function turnOnMiniPC() { sendRequest('/poweron'); }
function turnOffMiniPC() { sendRequest('/shutdown'); }
function restartMiniPC() { sendRequest('/restart'); }

// Helper: render status text with trailing health dot (like previous emoji placement)
function setStatusWithDot(el, text, ok){
  if(!el) return;
  el.textContent = text;
  const dot = document.createElement('span');
  dot.className = 'hc-dot ' + (ok ? 'hc-ok' : 'hc-bad');
  dot.setAttribute('aria-hidden','true');
  dot.style.marginLeft = '8px';
  el.appendChild(dot);
}

function checkMiniPCStatus() {
    fetch('/status')
        .then(res => res.json())
        .then(data => {
            const el = document.getElementById("minipcStatus");
            const hero = document.getElementById("minipcStatusHero");
            const isOn = data.status === "on";
            if (el) {
                el.textContent = isOn ? 'Online' : 'Offline';
                el.className = isOn ? 'on' : 'off';
            }
            if (hero) {
                hero.classList.toggle('is-on', isOn);
                hero.classList.toggle('is-off', !isOn);
            }
            if (isOn) {
                document.getElementById("turnOnBtn").style.display = "none";
                document.getElementById("restartBtn").style.display = "inline-block";
                document.getElementById("turnOffBtn").style.display = "inline-block";
            } else {
                document.getElementById("turnOnBtn").style.display = "inline-block";
                document.getElementById("restartBtn").style.display = "none";
                document.getElementById("turnOffBtn").style.display = "none";
            }
        });
}
setInterval(checkMiniPCStatus, 5000);
checkMiniPCStatus();

// --- Live uptime (small timer under OBS status) ---
let _liveUptimeStartMs = null;
let _liveUptimeTimer = null;
let _liveUptimeStartSource = null; // 'obs' | 'twitch'

// Align uptime ticking to server time so it never resets across devices with skewed clocks.
let _serverSkewMs = 0; // server_now_ms - Date.now()

function _updateServerSkew(serverNowUnix){
  const s = Number(serverNowUnix);
  if(!Number.isFinite(s) || s <= 0) return;
  _serverSkewMs = (s * 1000) - Date.now();
}

function _nowMs(){
  return Date.now() + (_serverSkewMs || 0);
}

function _pad2(n){
  const v = Math.max(0, n|0);
  return (v < 10 ? '0' : '') + v;
}

function _formatUptimeHHMMSS(startMs){
  const ms = Math.max(0, _nowMs() - (Number(startMs) || 0));
  const totalSec = Math.floor(ms / 1000);
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  return _pad2(hh) + ':' + _pad2(mm) + ':' + _pad2(ss);
}

function _getUptimeEl(){
  return document.getElementById('streamUptime');
}

function _renderUptime(){
  const el = _getUptimeEl();
  if(!el || !_isStreamingLive || !_liveUptimeStartMs) return;
  // Status-line already says "Status: Live"; keep the pill as time only.
  el.textContent = _formatUptimeHHMMSS(_liveUptimeStartMs);
}

function _scheduleUptimeTick(){
  if(_liveUptimeTimer){
    try { clearTimeout(_liveUptimeTimer); } catch(_) {}
    _liveUptimeTimer = null;
  }
  if(!_isStreamingLive || !_liveUptimeStartMs) return;

  const now = _nowMs();

  // Smooth when visible; reduce wakeups when tab is hidden.
  const cadenceMs = (typeof document !== 'undefined' && document.hidden) ? 5000 : 1000;
  const delay = (cadenceMs - (now % cadenceMs)) + 40; // align to boundary, small fudge
  _liveUptimeTimer = setTimeout(() => {
    _renderUptime();
    _scheduleUptimeTick();
  }, delay);
}

function _startUptime(startMs, source){
  _liveUptimeStartMs = Number(startMs) || _nowMs();
  _liveUptimeStartSource = source || 'obs';
  const el = _getUptimeEl();
  if(el) el.classList.remove('hidden');
  _renderUptime();
  _scheduleUptimeTick();
}

function _stopUptime(){
  if(_liveUptimeTimer){
    try { clearTimeout(_liveUptimeTimer); } catch(_) {}
    _liveUptimeTimer = null;
  }
  _liveUptimeStartMs = null;
  _liveUptimeStartSource = null;
  const el = _getUptimeEl();
  if(el){
    el.textContent = '';
    el.classList.add('hidden');
  }
}

function _maybeAdoptStartMs(startMs, source){
  const ms = Number(startMs) || 0;
  if(!_isStreamingLive || !ms) return;
  if(!Number.isFinite(ms)) return;
  // Ignore absurd values (future / very old)
  if(ms > _nowMs() + 60_000) return;
  if((_nowMs() - ms) > 7 * 24 * 3600 * 1000) return;

  if(!_liveUptimeStartMs){
    _startUptime(ms, source);
    return;
  }

  // Promotion rules:
  // - Never downgrade from Twitch to OBS.
  // - Only adopt a new start time if it makes uptime *longer* (i.e., earlier start),
  //   so the timer never jumps backwards.
  if(_liveUptimeStartSource === 'twitch' && source !== 'twitch') return;

  const current = Number(_liveUptimeStartMs) || 0;
  const makesLonger = ms < (current - 1000);
  if(source === 'twitch'){
    if(_liveUptimeStartSource !== 'twitch'){
      // Promote to Twitch as soon as it's available, but never jump backwards.
      _liveUptimeStartSource = 'twitch';
      if(makesLonger) _liveUptimeStartMs = ms;
      _renderUptime();
      _scheduleUptimeTick();
      return;
    }
    if(makesLonger){
      _liveUptimeStartMs = ms;
      _renderUptime();
      _scheduleUptimeTick();
    }
    return;
  }

  // OBS (or other non-twitch sources)
  if(makesLonger && _liveUptimeStartSource !== 'twitch'){
    _liveUptimeStartMs = ms;
    _liveUptimeStartSource = source;
    _renderUptime();
    _scheduleUptimeTick();
  }
}

function _maybeAdoptServerUptimeSeconds(uptimeSeconds, serverNowUnix, source){
  const u = Number(uptimeSeconds);
  const s = Number(serverNowUnix);
  if(!_isStreamingLive) return;
  if(!Number.isFinite(u) || u < 0) return;
  if(!Number.isFinite(s) || s <= 0) return;

  _updateServerSkew(s);
  const startMs = (s * 1000) - (Math.floor(u) * 1000);
  _maybeAdoptStartMs(startMs, source);
}

// OBS via Flask API
function switchToBRB() {
    fetch('/obs/switch_scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene: 'BRB' })
    })
    .then(res => res.text())
  .then(t=>showToast(t,'success'))
  .catch(err => showToast('Error: '+err,'error'));
}

function switchToLive() {
    fetch('/obs/switch_scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene: 'LIVE' }) 
    })
    .then(res => res.text())
  .then(t=>showToast(t,'success'))
  .catch(err => showToast('Error: '+err,'error'));
}
function applyStreamTitle() {
    const title = document.getElementById("streamTitleInput").value;
    const categoryId = document.getElementById("categorySearchInput").dataset.categoryId;

    if (!title || !categoryId) {
  showToast("Both title and category must be set.", 'error');
        return;
    }

    fetch('/twitch/update_category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, category_id: categoryId })
    })
    .then(res => {
        if (!res.ok) {
            return res.text().then(text => { throw new Error('Error from server: ' + text) });
        }
      return res.text();
    })
    .then(msg => {
    showToast(msg,'success');
        cancelStreamTitle();
    })
  .catch(err => showToast(err.message,'error'));
}

function cancelStreamTitle() {
    document.getElementById("streamTitleForm").style.display = "none";
    document.getElementById("showStreamTitleInput").style.display = "block";
    document.getElementById("streamTitleInput").value = "";
    document.getElementById("categorySearchInput").value = "";
    document.getElementById("categorySearchInput").dataset.categoryId = "";
    document.getElementById("categoryResults").innerHTML = "";
}

function showStreamTitleForm() {
  // Sørg for at skjemaet ligger rett etter knappen
  ensureFormAfterButton('showStreamTitleInput','streamTitleForm');
  const form = document.getElementById('streamTitleForm');
  const btn  = document.getElementById('showStreamTitleInput');
  const titleInput = document.getElementById('streamTitleInput');
  const catInput = document.getElementById('categorySearchInput');
  const resultsContainer = document.getElementById('categoryResults');

  if(btn) btn.style.display = 'none';
  if(form) form.style.display = 'block';

  // Sett umiddelbart fra cache hvis mulig (ingen blocking følelse)
  const cacheFresh = _channelInfoCache.data && (Date.now()-_channelInfoCache.ts) < CHANNEL_INFO_TTL_MS;
  if(cacheFresh){
    const d = _channelInfoCache.data;
    if(d.title) titleInput.value = d.title;
    if(d.category){
      catInput.value = d.category.name;
      catInput.dataset.categoryId = d.category.id;
    }
  } else {
    // Vis midlertidig placeholder mens vi venter
    titleInput.placeholder = 'Loading current title…';
    catInput.placeholder = 'Loading category…';
  }

  // Vis liten loading indikator (fjernes når fetch ferdig)
  let loader = null;
  if(!cacheFresh){
    loader = document.createElement('div');
    loader.id = 'streamTitleLoadingTmp';
    loader.style.fontSize = '12px';
    loader.style.opacity = '.65';
    loader.style.marginTop = '6px';
    if(resultsContainer && !document.getElementById('streamTitleLoadingTmp')){
      resultsContainer.parentElement.insertBefore(loader, resultsContainer);
    } else if(form && !document.getElementById('streamTitleLoadingTmp')) {
      form.appendChild(loader);
    }
  }

  const thisFetchController = new AbortController();
  // Abort ev. eldre pågående (lagre på window)
  if(window.__channelInfoCtl){ try{ window.__channelInfoCtl.abort(); }catch(e){} }
  window.__channelInfoCtl = thisFetchController;

  // Bare hent hvis ikke fresh
  if(!cacheFresh) fetch('/twitch/channel_info', { signal: thisFetchController.signal })
    .then(res => res.json())
    .then(data => {
      _channelInfoCache = { data, ts: Date.now() };
      if(data.title) titleInput.value = data.title;
      if(data.category){
        catInput.value = data.category.name;
        catInput.dataset.categoryId = data.category.id;
      }
    })
    .catch(err => {
      if(err.name === 'AbortError') return; // ignorert
      console.error('Error fetching stream info:', err);
      showToast('Error fetching current stream info.','error');
    })
    .finally(()=>{
      if(loader && loader.parentElement) loader.parentElement.removeChild(loader);
    });
}

// --- Banned Words (Chatbot) ---
function showBannedWordForm(){
  ensureFormAfterButton('showBannedWordInput','bannedWordForm');
  const form = document.getElementById('bannedWordForm');
  const btn  = document.getElementById('showBannedWordInput');
  const input = document.getElementById('bannedWordInput');
  if(btn) btn.style.display = 'none';
  if(form) form.style.display = 'block';
  if(input){
    input.value = '';
    input.focus();
  }
}

function cancelBannedWord(){
  const form = document.getElementById('bannedWordForm');
  const btn  = document.getElementById('showBannedWordInput');
  const input = document.getElementById('bannedWordInput');
  if(form) form.style.display = 'none';
  if(btn) btn.style.display = 'block';
  if(input) input.value = '';
}

function applyBannedWord(){
  const input = document.getElementById('bannedWordInput');
  const raw = (input && input.value) ? input.value : '';
  const word = raw.trim();
  if(!word){
    showToast('Please enter a word or sentence.','error');
    return;
  }
  fetch('/api/banned_words', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word })
  })
    .then(async (res) => {
      let payload = null;
      try { payload = await res.json(); } catch(_) {}
      if(!res.ok){
        const msg = (payload && (payload.error || payload.message)) ? (payload.error || payload.message) : ('HTTP ' + res.status);
        throw new Error(msg);
      }
      return payload || { ok: true };
    })
    .then((js) => {
      if(js && js.already){
        showToast('Already in banned words.','info');
      } else {
        showToast('Added to banned words.','success');
      }
      cancelBannedWord();
    })
    .catch((err) => {
      showToast('Error: ' + (err && err.message ? err.message : err), 'error');
    });
}

// Raid Channel
function applyRaid() {
    const channelName = document.getElementById("raidChannelInput").value;
    fetch('/twitch/raid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_name: channelName })
    })
    .then(res => {
        if (!res.ok) {
            return res.text().then(text => { throw new Error('Error from server: ' + text) });
        }
        return res.text();
    })
    .then(msg => {
    showToast(msg,'success');
        cancelRaid();
    })
  .catch(err => showToast(err.message,'error'));
}

function cancelRaid() {
    document.getElementById("raidChannelForm").style.display = "none";
    document.getElementById("showRaidChannelInput").style.display = "block";
    document.getElementById("raidChannelInput").value = "";
}

function showRaidChannelForm() {
  // Sørg for at skjemaet ligger rett etter knappen
  ensureFormAfterButton('showRaidChannelInput','raidChannelForm');
    document.getElementById("raidChannelForm").style.display = "block";
    document.getElementById("showRaidChannelInput").style.display = "none";
}

function loadTwitchChat() {
    const chatContainer = document.getElementById('chat-container');
    if (!chatContainer) return;
    const iframe = document.createElement('iframe');
    iframe.id = 'twitch-chat-iframe';
    iframe.src = UNIFIED_CHAT_EMBED_URL;
    chatContainer.innerHTML = '';
    chatContainer.appendChild(iframe);
    _chatIframeEl = iframe;
    _chatEmbedMounted = true;
    _chatEmbedReady = true;
}

function _renderEmbedWaiting(container, message) {
  if (!container) return;
  container.innerHTML = `
    <div class="embed-status-message">
      <div class="embed-status-card">
        <span class="embed-status-icon" aria-hidden="true">
          <i class="fa-solid fa-satellite-dish"></i>
        </span>
        <div class="embed-status-text">${message}</div>
      </div>
    </div>`;
}

function _renderUnifiedChatWaiting(message = 'Unified chat will appear automatically when stream is started'){
  const chatContainer = document.getElementById('chat-container');
  if (!chatContainer) return;
  _renderEmbedWaiting(chatContainer, message);
  _chatIframeEl = null;
  _chatEmbedMounted = false;
  _chatEmbedReady = false;
}

function loadBelabox() {
  const belaboxContainer = document.getElementById('belabox-container');
  if (!belaboxContainer) return;
  const iframe = document.createElement('iframe');
  iframe.id = 'belabox-iframe';
  iframe.src = BELABOX_EMBED_URL;
  iframe.setAttribute('allowfullscreen', '');
  iframe.loading = 'lazy';
  belaboxContainer.innerHTML = '';
  belaboxContainer.appendChild(iframe);
  _belaboxIframeEl = iframe;
  _belaboxEmbedMounted = true;
  _belaboxEmbedReady = true;
}

function _renderBelaboxWaiting(message = 'Belabox will appear automatically when online'){
  const belaboxContainer = document.getElementById('belabox-container');
  if (!belaboxContainer) return;
  _renderEmbedWaiting(belaboxContainer, message);
  _belaboxIframeEl = null;
  _belaboxEmbedMounted = false;
  _belaboxEmbedReady = false;
}

function _clearUnifiedChatRetryTimer(){
  if(_chatRetryTimer){
    clearTimeout(_chatRetryTimer);
    _chatRetryTimer = null;
  }
}

function _clearBelaboxRetryTimer(){
  if(_belaboxRetryTimer){
    clearTimeout(_belaboxRetryTimer);
    _belaboxRetryTimer = null;
  }
}

function _scheduleUnifiedChatRetry(){
  if(!_chatTabActive || _chatRetryTimer) return;
  _chatRetryTimer = setTimeout(() => {
    _chatRetryTimer = null;
    _pollUnifiedChatReadiness();
  }, UNIFIED_CHAT_RETRY_MS);
}

function _scheduleBelaboxRetry(){
  if(!_belaboxTabActive || _belaboxRetryTimer) return;
  _belaboxRetryTimer = setTimeout(() => {
    _belaboxRetryTimer = null;
    _pollBelaboxReadiness();
  }, BELABOX_RETRY_MS);
}

function _pollUnifiedChatReadiness(){
  if(!_chatTabActive || _chatReadyRequestInFlight) return;
  _chatReadyRequestInFlight = true;
  fetch('/api/unified_chat_ready', { cache: 'no-store' })
    .then(res => res.ok ? res.json() : Promise.reject())
    .then(data => {
      if(!_chatTabActive) return;
      const ready = !!(data && data.ready);
      if(ready){
        if(!_chatEmbedMounted){
          loadTwitchChat();
        }
        _chatEmbedReady = true;
      } else {
        if(_chatEmbedMounted || !_chatIframeEl){
          _renderUnifiedChatWaiting();
        }
        _chatEmbedReady = false;
      }
    })
    .catch(() => {
      if(!_chatTabActive) return;
      if(_chatEmbedMounted || !_chatIframeEl){
        _renderUnifiedChatWaiting();
      }
      _chatEmbedReady = false;
    })
    .finally(() => {
      _chatReadyRequestInFlight = false;
      if(_chatTabActive){
        _scheduleUnifiedChatRetry();
      }
    });
}

function _pollBelaboxReadiness(){
  if(!_belaboxTabActive || _belaboxReadyRequestInFlight) return;
  _belaboxReadyRequestInFlight = true;
  fetch('/api/belabox_ready', { cache: 'no-store' })
    .then(res => res.ok ? res.json() : Promise.reject())
    .then(data => {
      if(!_belaboxTabActive) return;
      const ready = !!(data && data.ready);
      if(ready){
        if(!_belaboxEmbedMounted){
          loadBelabox();
        }
        _belaboxEmbedReady = true;
      } else {
        if(_belaboxEmbedMounted || !_belaboxIframeEl){
          _renderBelaboxWaiting();
        }
        _belaboxEmbedReady = false;
      }
    })
    .catch(() => {
      if(!_belaboxTabActive) return;
      if(_belaboxEmbedMounted || !_belaboxIframeEl){
        _renderBelaboxWaiting();
      }
      _belaboxEmbedReady = false;
    })
    .finally(() => {
      _belaboxReadyRequestInFlight = false;
      if(_belaboxTabActive){
        _scheduleBelaboxRetry();
      }
    });
}

function _resetUnifiedChatEmbedState(showWaiting = false){
  _clearUnifiedChatRetryTimer();
  _chatIframeEl = null;
  _chatEmbedMounted = false;
  _chatEmbedReady = false;
  const chatContainer = document.getElementById('chat-container');
  if(!chatContainer) return;
  if(showWaiting){
    _renderUnifiedChatWaiting();
    if(_chatTabActive){
      _scheduleUnifiedChatRetry();
    }
  } else {
    chatContainer.innerHTML = '';
  }
}

function _resetBelaboxEmbedState(showWaiting = false){
  _clearBelaboxRetryTimer();
  _belaboxIframeEl = null;
  _belaboxEmbedMounted = false;
  _belaboxEmbedReady = false;
  const belaboxContainer = document.getElementById('belabox-container');
  if(!belaboxContainer) return;
  if(showWaiting){
    _renderBelaboxWaiting();
    if(_belaboxTabActive){
      _scheduleBelaboxRetry();
    }
  } else {
    belaboxContainer.innerHTML = '';
  }
}

function _handleUnifiedChatTabVisibility(active){
  _chatTabActive = !!active;
  if(!_chatTabActive){
    _clearUnifiedChatRetryTimer();
    return;
  }
  if(_chatEmbedMounted && _chatEmbedReady){
    _pollUnifiedChatReadiness();
    return;
  }
  _renderUnifiedChatWaiting();
  _pollUnifiedChatReadiness();
}

function _handleBelaboxTabVisibility(active){
  _belaboxTabActive = !!active;
  if(!_belaboxTabActive){
    _clearBelaboxRetryTimer();
    return;
  }
  if(_belaboxEmbedMounted && _belaboxEmbedReady){
    _pollBelaboxReadiness();
    return;
  }
  _renderBelaboxWaiting();
  _pollBelaboxReadiness();
}


function checkStreamStatus() {
  const startBtn = document.getElementById("startStreamBtn");
  const stopBtn = document.getElementById("stopStreamBtn");
  const switchToLiveBtn = document.querySelector("button[onclick='switchToLive()']");
  const switchToBRBBtn = document.querySelector("button[onclick='switchToBRB()']");

  fetch('/obs/stream_status')
    .then(res => res.json())
    .then(data => {
    // no-op

      // --- EDGE-TRIGGER: kun ved faktisk endring ---
      const isStreamingNow = !!data.isStreaming;
      _isStreamingLive = isStreamingNow;
      if (lastStreaming === null) {
        // første måling: sett baseline
        lastStreaming = isStreamingNow;
        if(!isStreamingNow) _stopUptime();
      } else if (isStreamingNow !== lastStreaming) {
        if (isStreamingNow) {
          if (_chatbotAutoStartEnabled) _startChatbot();
          if (_unifiedChatAutoStartEnabled) _startUnifiedChat();
          if (_chatTabActive) _pollUnifiedChatReadiness();
        } else {
          _stopChatbot();
          _stopUnifiedChat();
          _stopUptime();
          _resetUnifiedChatEmbedState(_chatTabActive);
        }
        lastStreaming = isStreamingNow;
      }

      // Update server clock alignment and adopt OBS uptime as fallback.
      if(data && typeof data.server_now_unix !== 'undefined'){
        _updateServerSkew(data.server_now_unix);
      }
      if(isStreamingNow && data && typeof data.obs_uptime_seconds !== 'undefined'){
        _maybeAdoptServerUptimeSeconds(data.obs_uptime_seconds, data.server_now_unix, 'obs');
      }

      // --- Viewer polling start/stop based on stream state ---
      // No polling when offline. Start on ON transition or first detection of ON, stop on OFF.
      if (isStreamingNow) {
        if (!window.__viewerPollTimer) {
          try { clearInterval(window.__viewerPollTimer); } catch(_) {}
          _pollViewersOnce();
          const iv = (typeof window.__VIEWER_POLL_MS === 'number' && window.__VIEWER_POLL_MS > 0) ? window.__VIEWER_POLL_MS : 10000;
          window.__viewerPollTimer = setInterval(_pollViewersOnce, iv);
        }
      } else {
        if (window.__viewerPollTimer) {
          try { clearInterval(window.__viewerPollTimer); } catch(_) {}
          window.__viewerPollTimer = null;
        }
        // reflect offline immediately
        _updateViewerUI(false, 0);
      }

      // --- UI oppdatering ---
      const status = document.getElementById("streamStatus");
      const scene = document.getElementById("obsScene");
      const hero = document.getElementById("obsStatusHero");

      if (data.error) {
        if (status) { status.textContent = "Error"; status.className = "off"; }
        if (scene) scene.textContent = "—";
        if (hero) { hero.classList.remove('is-live','is-on'); hero.classList.add('is-off'); }
        _stopUptime();
        startBtn.style.display = "inline-block";
        stopBtn.style.display = "none";
        return;
      }

      if (status) {
        status.textContent = isStreamingNow ? 'LIVE' : 'Offline';
        status.className = isStreamingNow ? 'live' : 'off';
      }
      if (hero) {
        hero.classList.toggle('is-live', isStreamingNow);
        hero.classList.toggle('is-off', !isStreamingNow);
      }
      if (scene) scene.textContent = (data.currentScene || '—');

      if (isStreamingNow) {
        startBtn.style.display = "none";
        stopBtn.style.display = "inline-block";
      } else {
        startBtn.style.display = "inline-block";
        stopBtn.style.display = "none";
      }

    })
    .catch(err => {
      console.error('Stream status error:', err);
      _stopUptime();
      startBtn.style.display = "inline-block";
      stopBtn.style.display = "none";
      const status = document.getElementById("streamStatus");
      const scene = document.getElementById("obsScene");
      const hero = document.getElementById("obsStatusHero");
      if (status) { status.textContent = "Error"; status.className = "off"; }
      if (scene) scene.textContent = "—";
      if (hero) { hero.classList.remove('is-live','is-on'); hero.classList.add('is-off'); }
    });
}

setInterval(checkStreamStatus, 2000);
checkMiniPCStatus();

const audioBanner = document.getElementById('audio-permission-banner');
const alertIframe = document.getElementById('alertbox-iframe');

function requestAudioPermission() {
  try {
    const desiredSrc = alertIframe?.getAttribute('data-src') || '';
    const currentSrc = alertIframe?.getAttribute('src') || '';

    // Load StreamElements only after a user click (banner).
    if (alertIframe && desiredSrc && currentSrc !== desiredSrc) {
      alertIframe.addEventListener('load', () => {
        try {
          alertIframe?.contentWindow?.postMessage({ type: 'unlock-audio' }, '*');
        } catch (e) {
          console.error('Error activating audio:', e);
        }
      }, { once: true });
      alertIframe.setAttribute('src', desiredSrc);
    }

    // If already loaded (or no data-src), attempt immediately too.
    alertIframe?.contentWindow?.postMessage({ type: 'unlock-audio' }, '*');
  } catch (e) {
    console.error('Error activating audio:', e);
  } finally {
    if (audioBanner) audioBanner.style.display = 'none';
  }
}

if (audioBanner) {
  audioBanner.addEventListener('click', requestAudioPermission, { once: true });
}

// --- Viewer count (controlled by stream state) ---
// Polling is started/stopped inside checkStreamStatus. Configure interval here.
window.__VIEWER_POLL_MS = 10000; // 10s

function _updateViewerUI(isLive, count){
  const el = document.getElementById('obsViewers');
  if(!el) return;
  el.textContent = isLive ? String(count ?? 0) : '—';
}

function _pollViewersOnce(){
  fetch('/twitch/stream_info')
    .then(r => r.ok ? r.json() : Promise.reject(r))
    .then(js => {
      if(js && typeof js.viewer_count !== 'undefined'){
        _updateViewerUI(!!js.is_live, js.viewer_count|0);

        // Prefer Twitch server-derived uptime; promote from OBS fallback when Twitch responds.
        if(typeof js.server_now_unix !== 'undefined'){
          _updateServerSkew(js.server_now_unix);
        }
        if(js.is_live){
          if(typeof js.uptime_seconds !== 'undefined'){
            _maybeAdoptServerUptimeSeconds(js.uptime_seconds, js.server_now_unix, 'twitch');
          } else if(typeof js.started_at_unix !== 'undefined'){
            const st = Number(js.started_at_unix);
            if(Number.isFinite(st) && st > 0){
              _maybeAdoptStartMs(st * 1000, 'twitch');
            }
          }
        }
      }else{
        _updateViewerUI(false, 0);
      }
    })
    .catch(() => _updateViewerUI(false, 0));
}


function searchCategory() {
  // Debounced søk: vent til bruker har stoppet å skrive
  const inputEl = document.getElementById("categorySearchInput");
  if(!inputEl) return;
  const resultsContainer = document.getElementById("categoryResults");
  const raw = inputEl.value;
  const query = raw.trim().toLowerCase();

  // Init globale (på window) én gang
  if(!window.__catSearch){
    window.__catSearch = {
      timer: null,
      controller: null,
      lastIssuedQuery: '',
      DEBOUNCE_MS: 300
    };
  }
  const st = window.__catSearch;

  // Avbryt pågående fetch hvis ny input kommer
  if(st.controller){
    st.controller.abort();
    st.controller = null;
  }
  clearTimeout(st.timer);

  if(!query){
    resultsContainer.innerHTML = "";
    inputEl.dataset.categoryId = ""; // reset valgt
    return;
  }
  // Minimum tegn før vi søker (unngå spam og brede treff)
  if(query.length < 2){
    resultsContainer.innerHTML = '<small style="opacity:.7;">Skriv minst 2 tegn…</small>';
    return;
  }

  resultsContainer.innerHTML = '<small style="opacity:.5;">Søker…</small>';

  st.timer = setTimeout(()=>{
    // Capture query at tidspunkt for utsendt forespørsel
    st.lastIssuedQuery = query;
    st.controller = new AbortController();
    fetch(`/twitch/search_categories?query=${encodeURIComponent(query)}`, { signal: st.controller.signal })
      .then(res => {
      if(!res.ok) throw new Error('HTTP '+res.status);
      return res.json();
      })
      .then(data => {
      // Hvis brukeren har skrevet mer etter at vi sendte forespørselen, ignorer resultat
      if(inputEl.value.trim().toLowerCase() !== st.lastIssuedQuery) return;
      resultsContainer.innerHTML = "";
      if (data.data && data.data.length > 0) {
        const categoriesWithSimilarity = data.data.map(category => ({
          name: category.name,
          id: category.id,
          similarity: calculateSimilarity(query, category.name.toLowerCase())
        }));
        categoriesWithSimilarity.sort((a,b)=> b.similarity - a.similarity);
        categoriesWithSimilarity.slice(0,6).forEach(category => {
          const button = document.createElement('button');
          button.textContent = category.name;
          button.style.fontSize = '20px';
          button.style.margin = '5px';
          button.style.padding = '15px 20px';
          button.addEventListener('click', () => {
            inputEl.value = category.name;
            inputEl.dataset.categoryId = category.id;
            resultsContainer.innerHTML = '';
          });
          resultsContainer.appendChild(button);
        });
      } else {
        resultsContainer.textContent = 'No categories found.';
      }
      })
      .catch(err => {
      if(err.name === 'AbortError') return; // ignorert
      console.error('Error searching categories:', err);
      // Bare vis feilmelding hvis query fortsatt er lik
      if(inputEl.value.trim().toLowerCase() === st.lastIssuedQuery)
        resultsContainer.textContent = 'Error searching categories.';
      })
      .finally(()=>{ st.controller = null; });
  }, st.DEBOUNCE_MS);
}

// Enkel funksjon for å beregne likhet mellom to strenger
function calculateSimilarity(query, categoryName) {
    const queryWords = query.split(" ");
    const categoryWords = categoryName.split(" ");
    let matchCount = 0;

    queryWords.forEach(queryWord => {
        if (categoryWords.some(categoryWord => categoryWord.startsWith(queryWord))) {
            matchCount++;
        }
    });

    return matchCount / Math.max(queryWords.length, categoryWords.length);
}

// ----- Restream UI -----
const restreamBtn      = document.getElementById('restreamBtn');
const restreamOptions  = document.getElementById('restreamOptions');
const endpointsList    = document.getElementById('endpointsList');
const saveRestreamBtn  = document.getElementById('saveRestream');
const cancelRestreamBtn= document.getElementById('cancelRestream');
const addEndpointBtn    = document.getElementById('addEndpoint');
const RTMP_PLATFORM_PRESETS = {
  twitch: {
    label: 'Twitch',
    defaultBase: 'rtmp://ingest.global-contribute.live-video.net/app',
    iconMarkup: '<i class="fa-brands fa-twitch" aria-hidden="true"></i>'
  },
  youtube: {
    label: 'YouTube',
    defaultBase: 'rtmp://a.rtmp.youtube.com/live2',
    iconMarkup: '<i class="fa-brands fa-youtube" aria-hidden="true"></i>'
  },
  kick: {
    label: 'Kick',
    defaultBase: 'rtmp://127.0.0.1:19360/fa723fc1b171.global-contribute.live-video.net',
    iconMarkup: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 3h6v7h2.2L17 3h3l-5.3 8.1L20.5 21h-3.2l-4.2-7.3H10V21H4V3Z"/></svg>'
  },
  custom: {
    label: 'Custom',
    defaultBase: '',
    iconMarkup: '<i class="fa-solid fa-server" aria-hidden="true"></i>'
  }
};
const RTMP_PLATFORM_ORDER = ['twitch', 'youtube', 'kick', 'custom'];
const EDIT_ICON_SVG = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M13.586 3.586a2 2 0 0 1 2.828 2.828l-8.486 8.486a1 1 0 0 1-.293.195l-3 1a1 1 0 0 1-1.266-1.265l1-3a1 1 0 0 1 .195-.293l8.486-8.486Zm1.414 1.414L6.879 13.121l-.586 1.757 1.757-.586 8.121-8.121-1.171-1.171Z"/></svg>';
const DELETE_ICON_SVG = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M7 2a2 2 0 0 0-2 2v1H3.5a.5.5 0 0 0 0 1h.54l.82 9.016A2 2 0 0 0 6.856 17h6.288a2 2 0 0 0 1.996-1.984L15.96 6H16.5a.5.5 0 0 0 0-1H15V4a2 2 0 0 0-2-2H7Zm6 3H7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1ZM8.5 8.5a.5.5 0 0 1 .5.5v5a.5.5 0 1 1-1 0V9a.5.5 0 0 1 .5-.5Zm3 .5v5a.5.5 0 1 0 1 0V9a.5.5 0 0 0-1 0Z"/></svg>';
const BASE_URL_ICON_SVG = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M7.8 12.2a.75.75 0 0 1 0-1.06l3.34-3.34a2.25 2.25 0 1 1 3.18 3.18l-1.7 1.7a2.25 2.25 0 0 1-3.18 0 .75.75 0 1 1 1.06-1.06.75.75 0 0 0 1.06 0l1.7-1.7a.75.75 0 1 0-1.06-1.06L8.86 12.2a.75.75 0 0 1-1.06 0Zm-1.42 5.14a2.25 2.25 0 0 1 0-3.18l1.7-1.7a2.25 2.25 0 1 1 3.18 3.18l-3.34 3.34a2.25 2.25 0 0 1-3.18-3.18l.58-.58a.75.75 0 0 1 1.06 1.06l-.58.58a.75.75 0 0 0 1.06 1.06l3.34-3.34a.75.75 0 0 0-1.06-1.06l-1.7 1.7a.75.75 0 1 1-1.06-1.06l1.7-1.7a2.25 2.25 0 1 1 3.18 3.18l-3.34 3.34a2.25 2.25 0 0 1-3.18 0Z"/></svg>';

if(restreamOptions){
  restreamOptions.setAttribute('aria-hidden','true');
  restreamOptions.style.maxHeight = '0px';
  restreamOptions.style.opacity = '0';
}
if(restreamBtn){
  restreamBtn.setAttribute('aria-expanded','false');
}

function _handleRestreamPanelTransition(ev){
  if(!restreamOptions || ev.target !== restreamOptions || ev.propertyName !== 'max-height') return;
  if(restreamOptions.classList.contains('restream-closing')){
    restreamOptions.classList.remove('restream-open', 'restream-closing');
    restreamOptions.style.maxHeight = '0px';
    restreamOptions.style.opacity = '0';
    return;
  }
  if(restreamOptions.classList.contains('restream-open')){
    restreamOptions.style.maxHeight = restreamOptions.scrollHeight + 'px';
  }
}

if(restreamOptions){
  restreamOptions.addEventListener('transitionend', _handleRestreamPanelTransition);
}

function _refreshRestreamPanelHeight(){
  if(restreamOptions && restreamOptions.classList.contains('restream-open')){
    restreamOptions.style.maxHeight = restreamOptions.scrollHeight + 'px';
  }
}

function _openRestreamPanel(){
  if(!restreamOptions) return;
  restreamOptions.classList.remove('restream-closing');
  restreamOptions.classList.add('restream-open');
  restreamOptions.setAttribute('aria-hidden','false');
  const targetHeight = restreamOptions.scrollHeight;
  requestAnimationFrame(()=>{
    restreamOptions.style.maxHeight = targetHeight + 'px';
    restreamOptions.style.opacity = '1';
  });
  if(restreamBtn){
    restreamBtn.style.display = 'none';
    restreamBtn.setAttribute('aria-expanded','true');
  }
}

function _closeRestreamPanel(){
  if(!restreamOptions) return;
  restreamOptions.setAttribute('aria-hidden','true');
  restreamOptions.style.maxHeight = restreamOptions.scrollHeight + 'px';
  restreamOptions.style.opacity = '1';
  restreamOptions.classList.add('restream-closing');
  requestAnimationFrame(()=>{
    restreamOptions.style.maxHeight = '0px';
    restreamOptions.style.opacity = '0';
  });
  if(restreamBtn){
    restreamBtn.style.display = 'inline-block';
    restreamBtn.setAttribute('aria-expanded','false');
  }
}

function _normalizeRtmpBase(base){
  return String(base || '').trim().replace(/\/+$/, '');
}

function _sanitizeStreamKey(key){
  return String(key || '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
}

function _splitEndpointUrl(url){
  const trimmed = String(url || '').trim();
  const match = trimmed.match(/^(rtmps?:\/\/.+)\/([^/?#]+)$/i);
  if(!match) return null;
  return {
    base: _normalizeRtmpBase(match[1]),
    key: match[2]
  };
}

function _isTwitchBase(base){
  return /^rtmps?:\/\/[^/]*live-video\.net\/app$/i.test(base || '');
}

function _isYouTubeBase(base){
  return /^rtmps?:\/\/[^/]*youtube\.com\/live\d+$/i.test(base || '');
}

function _isKickBase(base){
  return /^rtmps?:\/\/127\.0\.0\.1:19360\/[^/]+$/i.test(base || '');
}

function _matchesPlatformBase(base, platform){
  if(platform === 'twitch') return _isTwitchBase(base);
  if(platform === 'youtube') return _isYouTubeBase(base);
  if(platform === 'kick') return _isKickBase(base);
  return false;
}

function _makeIconButton(className, title, iconMarkup){
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.title = title;
  button.setAttribute('aria-label', title);
  button.innerHTML = iconMarkup;
  return button;
}

function _detectPlatformConfig(endpoint){
  const url = String(endpoint?.url || '').trim();
  const storedPlatform = String(endpoint?.platform || '').trim().toLowerCase();
  const split = _splitEndpointUrl(url);
  const base = split?.base || '';
  const key = split?.key || '';
  let platform = RTMP_PLATFORM_PRESETS[storedPlatform] ? storedPlatform : '';

  if(!platform){
    if(_isTwitchBase(base)) platform = 'twitch';
    else if(_isYouTubeBase(base)) platform = 'youtube';
    else if(_isKickBase(base)) platform = 'kick';
    else platform = 'custom';
  }

  if(platform === 'custom'){
    return {
      platform,
      customUrl: url,
      streamKey: '',
      effectiveBase: '',
      advancedOpen: false
    };
  }

  const preset = RTMP_PLATFORM_PRESETS[platform];
  const savedBase = _normalizeRtmpBase(endpoint?.base_url_override || '');
  const effectiveBase = savedBase || base || preset.defaultBase;

  return {
    platform,
    customUrl: '',
    streamKey: key,
    effectiveBase,
    advancedOpen: effectiveBase !== preset.defaultBase
  };
}

function _buildPresetUrl(base, streamKey){
  const normalizedBase = _normalizeRtmpBase(base);
  const normalizedKey = _sanitizeStreamKey(streamKey);
  if(!normalizedBase || !normalizedKey) return '';
  return `${normalizedBase}/${normalizedKey}`;
}

function _getEffectiveBase(row){
  const platform = row.querySelector('.platform-select')?.value || 'custom';
  const baseInput = row.querySelector('.base-url-input');
  if(platform === 'custom') return '';
  return _normalizeRtmpBase(baseInput?.value) || RTMP_PLATFORM_PRESETS[platform].defaultBase;
}

function _getPlatformLabel(platform){
  return RTMP_PLATFORM_PRESETS[platform]?.label || RTMP_PLATFORM_PRESETS.custom.label;
}

function _getPlatformIconMarkup(platform){
  return RTMP_PLATFORM_PRESETS[platform]?.iconMarkup || RTMP_PLATFORM_PRESETS.custom.iconMarkup;
}

function _updateEndpointDisplays(row){
  const nameDisplay = row.querySelector('.endpoint-name-display');
  const platformDisplay = row.querySelector('.endpoint-platform-display');
  const platformPicker = row.querySelector('.endpoint-platform-picker');
  const platformPickerIcon = row.querySelector('.endpoint-platform-picker-icon');
  const name = row.querySelector('.name-input')?.value.trim() || '';
  const platform = row.querySelector('.platform-select')?.value || 'custom';
  if(nameDisplay){
    nameDisplay.textContent = name || 'Name';
    nameDisplay.title = name || 'Name';
    nameDisplay.classList.toggle('is-placeholder', !name);
  }
  if(!platformDisplay) return;
  const platformLabel = _getPlatformLabel(platform);
  platformDisplay.dataset.platform = platform;
  platformDisplay.innerHTML = `<span class="endpoint-platform-icon">${_getPlatformIconMarkup(platform)}</span><span class="endpoint-platform-label">${platformLabel}</span>`;
  platformDisplay.title = platformLabel;
  if(platformPicker){
    platformPicker.dataset.platform = platform;
  }
  if(platformPickerIcon){
    platformPickerIcon.innerHTML = _getPlatformIconMarkup(platform);
    platformPickerIcon.setAttribute('aria-label', platformLabel);
    platformPickerIcon.title = platformLabel;
  }
}

function _updateEndpointHint(row){
  const hint = row.querySelector('.endpoint-hint');
  const hintText = row.querySelector('.endpoint-hint-text');
  const platform = row.querySelector('.platform-select')?.value || 'custom';
  if(!hint || !hintText) return;

  if(platform === 'custom'){
    hintText.textContent = 'Custom RTMP/RTMPS URL';
    return;
  }

  const effectiveBase = _getEffectiveBase(row);
  const suffix = effectiveBase !== RTMP_PLATFORM_PRESETS[platform].defaultBase ? ' | redigert' : '';
  hintText.textContent = `Base URL: ${effectiveBase}${suffix}`;
}

function _applyEndpointRowState(row){
  const editing = row.dataset.editing === 'true';
  const advancedOpen = row.dataset.advancedOpen === 'true';
  const keyOpen = row.dataset.keyOpen === 'true';
  const platform = row.querySelector('.platform-select')?.value || 'custom';
  const isCustom = platform === 'custom';
  const nameDisplay = row.querySelector('.endpoint-name-display');
  const platformDisplay = row.querySelector('.endpoint-platform-display');
  const nameInput = row.querySelector('.name-input');
  const platformPicker = row.querySelector('.endpoint-platform-picker');
  const platformSelect = row.querySelector('.platform-select');
  const primaryWrap = row.querySelector('.endpoint-primary');
  const streamKeyToggle = row.querySelector('.endpoint-stream-key-toggle');
  const streamKeyInput = row.querySelector('.stream-key-input');
  const customUrlInput = row.querySelector('.custom-url-input');
  const baseInput = row.querySelector('.base-url-input');
  const baseToggle = row.querySelector('.endpoint-base-toggle');
  const hint = row.querySelector('.endpoint-hint');
  const advancedWrap = row.querySelector('.endpoint-advanced');
  const editButton = row.querySelector('.edit-endpoint');

  nameInput.disabled = !editing;
  platformSelect.disabled = !editing;
  streamKeyInput.disabled = !editing || isCustom || !keyOpen;
  customUrlInput.disabled = !editing || !isCustom;
  baseInput.disabled = !editing || isCustom;

  row.classList.toggle('editing', editing);
  row.classList.toggle('collapsed', !editing);
  row.classList.toggle('is-custom', isCustom);
  nameDisplay.classList.toggle('hidden', editing);
  platformDisplay.classList.toggle('hidden', editing);
  nameInput.classList.toggle('hidden', !editing);
  platformPicker.classList.toggle('hidden', !editing);
  primaryWrap.classList.toggle('hidden', !editing);
  hint.classList.toggle('hidden', !editing);
  streamKeyToggle.classList.toggle('hidden', !editing || isCustom);
  streamKeyInput.classList.toggle('hidden', !editing || isCustom || !keyOpen);
  customUrlInput.classList.toggle('hidden', !editing || !isCustom);
  baseToggle.classList.toggle('hidden', !editing || isCustom);
  baseToggle.disabled = isCustom || !editing;
  advancedWrap.classList.toggle('hidden', !editing || isCustom || !advancedOpen);
  primaryWrap.classList.toggle('has-open-stream-key', editing && !isCustom && keyOpen);

  streamKeyInput.placeholder = platform === 'youtube' ? 'YouTube stream key' : 'Stream key';
  customUrlInput.placeholder = 'rtmp://PATH/streamkey';
  baseInput.placeholder = RTMP_PLATFORM_PRESETS[platform]?.defaultBase || 'rtmp://PATH';

  streamKeyToggle.textContent = keyOpen ? 'Skjul stream-key' : 'Stream-key';
  streamKeyToggle.title = keyOpen ? 'Hide stream key field' : 'Edit stream key';
  streamKeyToggle.setAttribute('aria-label', streamKeyToggle.title);

  if(editButton){
    editButton.title = editing ? 'Finish editing' : 'Edit';
    editButton.setAttribute('aria-label', editButton.title);
  }
  baseToggle.title = advancedOpen ? 'Hide base URL override' : 'Edit base URL';
  baseToggle.setAttribute('aria-label', baseToggle.title);

  _updateEndpointDisplays(row);
  _updateEndpointHint(row);
  _refreshRestreamPanelHeight();
}

function _createEndpointRow(endpoint = {}, options = {}){
  const hasExistingData = Boolean(endpoint?.url || endpoint?.name || endpoint?.platform);
  const config = hasExistingData ? _detectPlatformConfig(endpoint) : {
    platform: 'twitch',
    customUrl: '',
    streamKey: '',
    effectiveBase: RTMP_PLATFORM_PRESETS.twitch.defaultBase,
    advancedOpen: false
  };
  const editing = Boolean(options.editing);
  const row = document.createElement('div');
  row.className = 'endpoint-row';
  row.dataset.editing = editing ? 'true' : 'false';
  row.dataset.advancedOpen = config.advancedOpen ? 'true' : 'false';
  row.dataset.keyOpen = editing && config.platform !== 'custom' && !config.streamKey ? 'true' : 'false';
  row.dataset.platform = config.platform;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'endpoint-enabled';
  checkbox.checked = Boolean(endpoint.enabled);
  checkbox.setAttribute('aria-label', 'Enable endpoint');
  row.appendChild(checkbox);

  const nameDisplay = document.createElement('div');
  nameDisplay.className = 'endpoint-name-display endpoint-display';
  row.appendChild(nameDisplay);

  const platformDisplay = document.createElement('div');
  platformDisplay.className = 'endpoint-platform-display endpoint-display';
  row.appendChild(platformDisplay);

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'name-input endpoint-control';
  nameInput.placeholder = 'Name';
  nameInput.value = endpoint.name || '';
  row.appendChild(nameInput);

  const platformPicker = document.createElement('div');
  platformPicker.className = 'endpoint-platform-picker';

  const platformPickerIcon = document.createElement('span');
  platformPickerIcon.className = 'endpoint-platform-picker-icon';
  platformPickerIcon.setAttribute('aria-hidden', 'true');
  platformPicker.appendChild(platformPickerIcon);

  const platformSelect = document.createElement('select');
  platformSelect.className = 'platform-select';
  platformSelect.setAttribute('aria-label', 'Platform');
  RTMP_PLATFORM_ORDER.forEach((platform) => {
    const option = document.createElement('option');
    option.value = platform;
    option.textContent = RTMP_PLATFORM_PRESETS[platform].label;
    if(platform === config.platform) option.selected = true;
    platformSelect.appendChild(option);
  });
  platformPicker.appendChild(platformSelect);
  row.appendChild(platformPicker);

  const primaryWrap = document.createElement('div');
  primaryWrap.className = 'endpoint-primary';

  const streamKeyToggle = document.createElement('button');
  streamKeyToggle.type = 'button';
  streamKeyToggle.className = 'endpoint-stream-key-toggle';
  primaryWrap.appendChild(streamKeyToggle);

  const streamKeyInput = document.createElement('input');
  streamKeyInput.type = 'password';
  streamKeyInput.className = 'stream-key-input endpoint-control';
  streamKeyInput.autocomplete = 'off';
  streamKeyInput.spellcheck = false;
  streamKeyInput.value = config.streamKey;
  primaryWrap.appendChild(streamKeyInput);

  const customUrlInput = document.createElement('input');
  customUrlInput.type = 'text';
  customUrlInput.className = 'custom-url-input endpoint-control';
  customUrlInput.value = config.customUrl || '';
  primaryWrap.appendChild(customUrlInput);

  row.appendChild(primaryWrap);

  const editButton = _makeIconButton('icon-btn edit-endpoint', 'Edit', EDIT_ICON_SVG);
  row.appendChild(editButton);

  const deleteButton = _makeIconButton('icon-btn delete-endpoint', 'Delete', DELETE_ICON_SVG);
  deleteButton.addEventListener('click', () => openDeleteEndpointModal(row));
  row.appendChild(deleteButton);

  const hint = document.createElement('div');
  hint.className = 'endpoint-hint';
  const hintText = document.createElement('span');
  hintText.className = 'endpoint-hint-text';
  hint.appendChild(hintText);
  const baseToggle = _makeIconButton('icon-btn endpoint-base-toggle', 'Edit base URL', EDIT_ICON_SVG);
  hint.appendChild(baseToggle);
  row.appendChild(hint);

  const advancedWrap = document.createElement('div');
  advancedWrap.className = 'endpoint-advanced';

  const advancedLabel = document.createElement('div');
  advancedLabel.className = 'endpoint-advanced-label';
  advancedLabel.textContent = 'Base URL override';
  advancedWrap.appendChild(advancedLabel);

  const baseInput = document.createElement('input');
  baseInput.type = 'text';
  baseInput.className = 'base-url-input endpoint-control';
  baseInput.value = config.effectiveBase || RTMP_PLATFORM_PRESETS[config.platform]?.defaultBase || '';
  advancedWrap.appendChild(baseInput);
  row.appendChild(advancedWrap);

  platformSelect.addEventListener('change', () => {
    const previousPlatform = row.dataset.platform || 'custom';
    const nextPlatform = platformSelect.value;
    const previousBase = _normalizeRtmpBase(baseInput.value);
    const customSplit = _splitEndpointUrl(customUrlInput.value.trim());

    if(nextPlatform === 'custom'){
      if(!customUrlInput.value.trim()){
        customUrlInput.value = previousPlatform === 'custom'
          ? ''
          : _buildPresetUrl(previousBase || RTMP_PLATFORM_PRESETS[previousPlatform].defaultBase, streamKeyInput.value);
      }
      row.dataset.keyOpen = 'false';
      row.dataset.advancedOpen = 'false';
    } else {
      const nextDefaultBase = RTMP_PLATFORM_PRESETS[nextPlatform].defaultBase;
      if(previousPlatform === 'custom' && customSplit){
        if(!streamKeyInput.value.trim()) streamKeyInput.value = customSplit.key;
        baseInput.value = _matchesPlatformBase(customSplit.base, nextPlatform) ? customSplit.base : nextDefaultBase;
      } else {
        baseInput.value = nextDefaultBase;
      }
      if(!streamKeyInput.value.trim()){
        row.dataset.keyOpen = 'true';
      }
    }

    row.dataset.platform = nextPlatform;
    _applyEndpointRowState(row);
  });

  nameInput.addEventListener('input', () => {
    _updateEndpointDisplays(row);
  });

  streamKeyToggle.addEventListener('click', () => {
    const nextOpen = row.dataset.keyOpen === 'true' ? 'false' : 'true';
    row.dataset.keyOpen = nextOpen;
    _applyEndpointRowState(row);
    if(nextOpen === 'true'){
      streamKeyInput.focus();
      streamKeyInput.select();
    }
  });

  baseToggle.addEventListener('click', () => {
    row.dataset.advancedOpen = row.dataset.advancedOpen === 'true' ? 'false' : 'true';
    _applyEndpointRowState(row);
  });

  baseInput.addEventListener('input', () => {
    _updateEndpointHint(row);
  });

  editButton.addEventListener('click', () => {
    const nextEditing = row.dataset.editing === 'true' ? 'false' : 'true';
    row.dataset.editing = nextEditing;
    if(nextEditing === 'false'){
      row.dataset.keyOpen = 'false';
    } else if((platformSelect.value || 'custom') !== 'custom' && !streamKeyInput.value.trim()){
      row.dataset.keyOpen = 'true';
    }
    _applyEndpointRowState(row);
  });

  _applyEndpointRowState(row);
  return row;
}

function _collectEndpointPayload(row, index){
  const name = row.querySelector('.name-input')?.value.trim() || '';
  const platform = row.querySelector('.platform-select')?.value || 'custom';
  const enabled = row.querySelector('.endpoint-enabled')?.checked || false;
  const label = name || RTMP_PLATFORM_PRESETS[platform]?.label || `Row ${index + 1}`;

  if(platform === 'custom'){
    const customUrl = row.querySelector('.custom-url-input')?.value.trim() || '';
    if(!customUrl){
      return { error: `${label}: enter a custom RTMP URL.` };
    }
    if(!/^rtmps?:\/\//i.test(customUrl)){
      return { error: `${label}: custom URL must start with rtmp:// or rtmps://.` };
    }
    return {
      value: {
        name,
        enabled,
        platform,
        url: customUrl
      }
    };
  }

  const streamKey = _sanitizeStreamKey(row.querySelector('.stream-key-input')?.value || '');
  if(!streamKey){
    return { error: `${label}: stream key is required.` };
  }

  const effectiveBase = _getEffectiveBase(row);
  if(!/^rtmps?:\/\//i.test(effectiveBase)){
    return { error: `${label}: base URL must start with rtmp:// or rtmps://.` };
  }

  const payload = {
    name,
    enabled,
    platform,
    url: _buildPresetUrl(effectiveBase, streamKey)
  };
  if(effectiveBase !== RTMP_PLATFORM_PRESETS[platform].defaultBase){
    payload.base_url_override = effectiveBase;
  }
  return { value: payload };
}

function _renderRestreamEndpoints(pushEndpoints = []){
  if(!endpointsList) return;
  endpointsList.innerHTML = '';
  pushEndpoints.forEach((endpoint) => {
    endpointsList.appendChild(_createEndpointRow(endpoint));
  });
  _refreshRestreamPanelHeight();
}

function _loadRestreamEndpoints(){
  _openRestreamPanel();
  fetch('/rtmp_endpoints.json')
    .then(r => r.json())
    .then((data) => {
      _renderRestreamEndpoints(Array.isArray(data?.push_endpoints) ? data.push_endpoints : []);
    })
    .catch((err) => {
      console.error(err);
      showToast('Could not load restream settings.','error');
    });
}

if(restreamBtn){
  restreamBtn.addEventListener('click', _loadRestreamEndpoints);
}

if(addEndpointBtn){
  addEndpointBtn.addEventListener('click', () => {
    if(!endpointsList) return;
    endpointsList.appendChild(_createEndpointRow({}, { editing: true }));
    _refreshRestreamPanelHeight();
  });
}

if(saveRestreamBtn){
  saveRestreamBtn.addEventListener('click', () => {
    const rows = Array.from(endpointsList?.querySelectorAll('.endpoint-row') || []);
    const updated = [];

    for(let i = 0; i < rows.length; i++){
      const collected = _collectEndpointPayload(rows[i], i);
      if(collected.error){
        showToast(collected.error, 'error');
        return;
      }
      updated.push(collected.value);
    }

    fetch('/api/update_push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ push_endpoints: updated })
    })
      .then(res => res.json())
      .then(resp => {
        if(resp.status === 'ok'){
          showToast('Restream settings saved!','success');
          _closeRestreamPanel();
        } else {
          showToast('Error: ' + (resp.error || JSON.stringify(resp)),'error');
        }
      })
      .catch(err => showToast('Communication error: ' + err,'error'));
  });
}

if(cancelRestreamBtn){
  cancelRestreamBtn.addEventListener('click', () => {
    _closeRestreamPanel();
  });
}

// Tooltip toggle for Platforms help
const platformsHelpBtn = document.getElementById('platformsHelp');
const platformsTooltip = document.getElementById('platformsTooltip');

if (platformsHelpBtn && platformsTooltip) {
  platformsHelpBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = platformsTooltip.classList.toggle('show');
    platformsHelpBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  document.addEventListener('click', () => {
    platformsTooltip.classList.remove('show');
    platformsHelpBtn.setAttribute('aria-expanded', 'false');
  });

  platformsTooltip.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // optional: close with ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      platformsTooltip.classList.remove('show');
      platformsHelpBtn.setAttribute('aria-expanded', 'false');
    }
  });
}

function stopStream() {
    sendRequest('/obs/stop_stream');
}

(function(){
  function upd(id, state, label){
    const dot = document.getElementById(id);
    const lbl = document.getElementById(id+'-label');
    if(!dot) return;
    dot.classList.remove('hc-ok','hc-bad','hc-off');
    if(state === 'ok'){ dot.classList.add('hc-ok'); }
    else if(state === 'error'){ dot.classList.add('hc-bad'); }
    else { dot.classList.add('hc-off'); }
    if(lbl) lbl.textContent = label || state || '—';
  }
  async function pollHealth(){
    try{
      const r = await fetch('/api/sg_status');
      if(!r.ok) throw 0;
      const j = await r.json();
      if(typeof j.chatbot_autostart === 'boolean' && Date.now() > _chatbotPrefHoldUntil){
        _chatbotAutoStartEnabled = j.chatbot_autostart;
        _syncChatbotToggleUI();
      }
      if(typeof j.unified_chat_autostart === 'boolean' && Date.now() > _unifiedChatPrefHoldUntil){
        _unifiedChatAutoStartEnabled = j.unified_chat_autostart;
        _syncUnifiedChatToggleUI();
      }
      // Chatbot mapping
      upd('hc-chatbot', j.chatbot_state || 'offline', j.chatbot_state);
      upd('hc-unifiedchat', j.unified_chat_state || 'offline', j.unified_chat_state);
      // Nginx mapping
      upd('hc-nginx', j.nginx_state || 'offline', j.nginx_state);
  // StreamGuard service
  upd('hc-streamguard', j.streamguard_state || 'offline', j.streamguard_state);
  // ChatGuard (consider chat_ws AND chat_subscribed)
  const chatOk = (j.chat_ws === true && j.chat_subscribed === true);
  let chatLabel = 'offline';
  if (j.chat_ws === true && j.chat_subscribed !== true) chatLabel = 'ws';
  if (chatOk) chatLabel = 'ok';
  upd('hc-chatguard', chatOk ? 'ok' : (j.chat_ws ? 'error' : 'offline'), chatLabel);

  // SLS
      upd('hc-sls', j.sls_state || 'error', j.sls_state);
      // OBS (treat missing as offline)
      upd('hc-obs', j.obs_connected === true ? 'ok' : (j.sg_error ? 'error':'offline'), j.obs_connected===true?'ok':(j.sg_error?'error':'offline'));
      // Twitch Events WS
      upd('hc-raidws', j.raid_ws === true ? 'ok' : (j.sg_error?'error':'offline'), j.raid_ws===true?'ok':(j.sg_error?'error':'offline'));
      // Raid AutoStop subscription
      upd('hc-raidsub', j.raid_subscribed === true ? 'ok' : (j.sg_error?'error':'offline'), j.raid_subscribed===true?'ok':(j.sg_error?'error':'offline'));
      // Token
    upd('hc-token', j.token_valid === true ? 'ok' : 'error', j.token_valid===true ? ('exp '+Math.floor(j.token_expires_in/60)+'m') : 'invalid');
    // Optional system services (stunnel / stream-control) if backend later includes states; fallback offline
  upd('hc-stunnel', j.stunnel_state || 'offline', j.stunnel_state || 'offline');
    }catch(e){
  ['hc-chatbot','hc-unifiedchat','hc-nginx','hc-streamguard','hc-chatguard','hc-sls','hc-obs','hc-raidws','hc-raidsub','hc-token','hc-stunnel'].forEach(id=>{
        upd(id,'error','error');
      });
    }finally{
      setTimeout(pollHealth, 5000);
    }
  }
  pollHealth();
})();

// --- Logs Panel ---
let _logsWS = null;
let _logsWSService = null; // which service current WS follows
let _currentLogService = 'streamguard';
let followLogs = true;
let _logSessionId = 0; // increments on each service load to ignore stale async events
function toggleLogsPanel(){
  const panel = document.getElementById('logs-panel');
  if(!panel) return;
  if(panel.classList.contains('hidden')){
  // Read selected service from dropdown
  const sel = document.getElementById('logs-service-select');
  if(sel){ _currentLogService = sel.value || 'streamguard'; }
    // Normalize default lines select (some browsers may not honor selected attr until user interaction)
    const linesSel = document.getElementById('log-lines-select');
    if(linesSel && !linesSel.value){
      linesSel.value = '25';
    }
    panel.classList.remove('hidden');
    loadLogs(_currentLogService, true);
  } else {
    closeLogsPanel();
  }
}
function closeLogsPanel(){
  const panel = document.getElementById('logs-panel');
  if(panel) panel.classList.add('hidden');
  if(_logsWS){ try{ _logsWS.close(); }catch(e){} _logsWS=null; }
}
function loadLogs(svc, startFollow){
  _currentLogService = svc;
  _logSessionId++;
  const mySession = _logSessionId;
  // Close any existing WS immediately to stop old stream
  if(_logsWS){ try{ _logsWS.onmessage = null; _logsWS.close(); }catch(_){} _logsWS=null; }
  _logsWSService = null;
  const out = document.getElementById('logs-output');
  if(!out) return;
  out.innerHTML = '<span class="log-line log-line-loading">Loading logs...</span>';
  const sel = document.getElementById('log-lines-select');
  const lines = sel ? sel.value : '25';
  fetch(`/api/logs?service=${encodeURIComponent(svc)}&lines=${lines}`)
    .then(r=>r.json())
    .then(j=>{
      if(_logSessionId !== mySession) return; // stale response
      if(!out) return;
      out.innerHTML = '';
      const arr = j && j.lines ? j.lines : [];
      (Array.isArray(arr)?arr:[]).forEach(raw => appendLogDOM(raw));
      out.scrollTop = out.scrollHeight;
      if(document.getElementById('log-follow')?.checked && startFollow){
        startLogFollow(mySession);
      }
    })
    .catch(e=>{ if(out && _logSessionId===mySession) out.innerHTML = `<span class="log-line lvl-error">Error loading logs: ${e}</span>`; });
}
function startLogFollow(sessionId){
  if(_logSessionId !== sessionId) return; // service changed before follow start
  if(_logsWS){ try{ _logsWS.onmessage=null; _logsWS.close(); }catch(e){} }
  const svc = _currentLogService;
  const proto = (location.protocol === 'https:') ? 'wss:' : 'ws:';
  _logsWS = new WebSocket(`${proto}//${location.host}/ws/logs?service=${encodeURIComponent(svc)}`);
  _logsWSService = svc;
  const mySession = sessionId;
  _logsWS.onmessage = ev => {
    if(_logSessionId !== mySession) return; // stale
    if(_logsWSService !== _currentLogService) return; // switched already
    const out = document.getElementById('logs-output');
    if(!out) return;
    try{
      const msg = JSON.parse(ev.data);
      if(msg.type === 'line'){
        const atBottom = out.scrollTop + out.clientHeight >= out.scrollHeight - 5;
        appendLogDOM(msg.data);
        if(followLogs && atBottom) out.scrollTop = out.scrollHeight;
      } else if(msg.type === 'error'){
        appendLogDOM('[ERROR] '+msg.message, 'error');
      }
    }catch(e){}
  };
  _logsWS.onclose = ()=>{ if(_logsWS === this) _logsWS=null; };
}
function trimLogBuffer(out){
  // Remove oldest DOM nodes when exceeding 6000 lines
  while(out.children.length > 6000){
    out.removeChild(out.firstChild);
  }
}
function sanitizeLogLine(raw){
  if(!raw) return '';
  // Keep timestamp, drop process prefix before first colon
  // Example: 2025-09-07T13:32:45+02:00 rustdesk python[666621]: [ChatGuard] stuff
  const m = raw.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[.,]\d+)?[+\-]\d{2}:?\d{2})\s+([^:]+:)?\s*(.*)$/);
  if(m){
    const ts = m[1];
    const rest = m[3] || '';
    return ts + ' ' + rest.trim();
  }
  return raw;
}
function classifyLog(line){
  const u = line.toUpperCase();
  if(u.includes('ERROR') || u.includes('EXCEPTION') || u.includes('TRACEBACK')) return 'lvl-error';
  if(u.includes('WARN')) return 'lvl-warn';
  if(u.includes('INFO')) return 'lvl-info';
  if(u.includes('DEBUG')) return 'lvl-debug';
  return 'lvl-normal';
}
function appendLogDOM(rawLine, forcedLevel){
  const out = document.getElementById('logs-output');
  if(!out) return;
  const clean = sanitizeLogLine(rawLine);
  const level = forcedLevel ? (`lvl-${forcedLevel}`) : classifyLog(clean);
  // Split timestamp (first token matching ISO-like) from rest so all align
  let ts = '';
  let msgPart = clean;
  const tsMatch = clean.match(/^(\d{4}-\d{2}-\d{2}T[^\s]+)\s+(.*)$/);
  if(tsMatch){ ts = tsMatch[1]; msgPart = tsMatch[2]; }
  // Reformat ISO timestamp to journalctl short style 'Mon DD HH:MM:SS:'
  if(ts && /\d{4}-\d{2}-\d{2}T/.test(ts)){
    try {
      const d = new Date(ts);
      if(!isNaN(d.getTime())){
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const mon = months[d.getMonth()];
        const day = String(d.getDate()).padStart(2,'0');
        const hh = String(d.getHours()).padStart(2,'0');
        const mm = String(d.getMinutes()).padStart(2,'0');
        const ss = String(d.getSeconds()).padStart(2,'0');
        ts = `${mon} ${day} ${hh}:${mm}:${ss}:`;
      }
    } catch(_) {}
  }
  const lineEl = document.createElement('div');
  lineEl.className = 'log-line '+level;
  const tsEl = document.createElement('span');
  tsEl.className = 'log-ts';
  tsEl.textContent = ts || '';
  const msgEl = document.createElement('span');
  msgEl.className = 'log-msg';
  // Highlight first bracketed tag if present in message
  const tagMatch = msgPart.match(/^(\[[^\]]+\])\s*(.*)$/);
  if(tagMatch){
    const tagEl = document.createElement('span');
    tagEl.className = 'log-tag';
    tagEl.textContent = tagMatch[1];
    msgEl.appendChild(tagEl);
    msgEl.appendChild(document.createTextNode(' '+tagMatch[2]));
  } else {
    msgEl.textContent = msgPart;
  }
  lineEl.appendChild(tsEl);
  lineEl.appendChild(msgEl);
  out.appendChild(lineEl);
  trimLogBuffer(out);
}
// Service dropdown selector only
document.addEventListener('change', e => {
  if(e.target && e.target.id === 'logs-service-select'){
    loadLogs(e.target.value, true);
  }
});
// Lines select & follow checkbox
 document.addEventListener('change', e => {
   if(e.target && e.target.id === 'log-lines-select'){
  // Changing line count: treat as fresh load; keep follow state but don't auto start if user unchecked
  loadLogs(_currentLogService, document.getElementById('log-follow')?.checked === true);
   } else if(e.target && e.target.id === 'log-follow'){
     followLogs = !!e.target.checked;
       if(followLogs){
         // restart follow using current session id (no reload of historical lines)
         startLogFollow(_logSessionId);
       } else if(_logsWS){
         try{ _logsWS.close(); }catch(_){ }
         _logsWS=null;
       }
   }
 });

// --- Modal handling ---
function openStopStreamModal(){
  const m = document.getElementById('stop-stream-modal');
  if(m) m.classList.remove('hidden');
}
function closeStopStreamModal(){
  const m = document.getElementById('stop-stream-modal');
  if(m) m.classList.add('hidden');
}

// ---- Power (Restart/Shutdown) confirmation modal ----
let _pendingPowerAction = null; // 'restart' | 'shutdown'
function openPowerConfirm(kind){
  _pendingPowerAction = kind;
  const m = document.getElementById('power-confirm-modal');
  const title = document.getElementById('power-modal-title');
  const text = document.getElementById('power-modal-text');
  if(title){ title.textContent = kind === 'restart' ? 'Restart Mini-PC?' : 'Shutdown Mini-PC?'; }
  if(text){ text.textContent = kind === 'restart' ? 'Are you sure you want to restart the Mini-PC?' : 'Are you sure you want to shutdown the Mini-PC?'; }
  if(m) m.classList.remove('hidden');
}
function _closePowerConfirm(){
  const m = document.getElementById('power-confirm-modal');
  if(m) m.classList.add('hidden');
  _pendingPowerAction = null;
}
function _confirmPowerAction(){
  if(_pendingPowerAction === 'restart') restartMiniPC();
  else if(_pendingPowerAction === 'shutdown') turnOffMiniPC();
  _closePowerConfirm();
}

// ---- Repair Backend confirmation modal ----
function openRepairConfirm(){
  const m = document.getElementById('repair-confirm-modal');
  if(m) m.classList.remove('hidden');
}
function _closeRepairConfirm(){
  const m = document.getElementById('repair-confirm-modal');
  if(m) m.classList.add('hidden');
}
function _confirmRepairAction(){
  fetch('/repair', { method: 'POST' })
    .then(res => res.text())
    .then(t => showToast(t, 'success'))
    .catch(err => showToast('Error: ' + err, 'error'));
  _closeRepairConfirm();
}

// Delete endpoint modal handling
let _endpointPendingDelete = null;
function openDeleteEndpointModal(rowEl){
  _endpointPendingDelete = rowEl;
  const m = document.getElementById('delete-endpoint-modal');
  if(m) m.classList.remove('hidden');
}
function closeDeleteEndpointModal(){
  const m = document.getElementById('delete-endpoint-modal');
  if(m) m.classList.add('hidden');
  _endpointPendingDelete = null;
}
// Koble knapper når DOM er klar (hvis du ikke allerede har DOMContentLoaded lytter)
document.addEventListener('DOMContentLoaded', () => {
  // Initial justering i tilfelle rekkefølge har blitt endret ved render
  ensureFormAfterButton('showStreamTitleInput','streamTitleForm');
  ensureFormAfterButton('showRaidChannelInput','raidChannelForm');
  // Oppdater cache hvis vinduet blir synlig igjen og OBS-fanen er aktiv
  document.addEventListener('visibilitychange', () => {
    if(!document.hidden){
      const obsTab = document.querySelector('.tab.active[data-tab="obs"]');
      if(obsTab) prefetchChannelInfo(false);
    }

    // If we're live, switch uptime cadence immediately (1s visible / slower hidden).
    if(_isStreamingLive && _liveUptimeStartMs){
      if(!document.hidden) _renderUptime();
      _scheduleUptimeTick();
    }
  });
  const ok = document.getElementById('confirm-stop-stream');
  const cancel = document.getElementById('cancel-stop-stream');
  if(ok){
    ok.addEventListener('click', () => {
      closeStopStreamModal();
      // Kaller eksisterende stopStream() funksjon
      if(typeof stopStream === 'function') stopStream();
    });
  }
  if(cancel) cancel.addEventListener('click', closeStopStreamModal);
  // Lukk ved ESC
  document.addEventListener('keydown', e => {
    if(e.key === 'Escape') closeStopStreamModal();
  });
  // Klikk på backdrop
  const modal = document.getElementById('stop-stream-modal');
  if(modal){
    modal.addEventListener('click', e => {
      if(e.target === modal) closeStopStreamModal();
    });
  }

  // Delete endpoint modal wiring
  const delModal = document.getElementById('delete-endpoint-modal');
  const delOk = document.getElementById('confirm-delete-endpoint');
  const delCancel = document.getElementById('cancel-delete-endpoint');
  if(delOk){
    delOk.addEventListener('click', () => {
      if(_endpointPendingDelete && _endpointPendingDelete.parentElement){
        _endpointPendingDelete.parentElement.removeChild(_endpointPendingDelete);
        showToast('Endpoint deleted','success');
        _refreshRestreamPanelHeight();
      }
      closeDeleteEndpointModal();
    });
  }
  if(delCancel) delCancel.addEventListener('click', closeDeleteEndpointModal);
  if(delModal){
    delModal.addEventListener('click', e => { if(e.target === delModal) closeDeleteEndpointModal(); });
  }
  document.addEventListener('keydown', e => { if(e.key==='Escape') closeDeleteEndpointModal(); });

  // Power modal wiring
  const pConfirm = document.getElementById('power-modal-confirm');
  const pCancel = document.getElementById('power-modal-cancel');
  const pModal = document.getElementById('power-confirm-modal');
  if(pConfirm) pConfirm.addEventListener('click', _confirmPowerAction);
  if(pCancel) pCancel.addEventListener('click', _closePowerConfirm);
  if(pModal) pModal.addEventListener('click', e => { if(e.target === pModal) _closePowerConfirm(); });
  document.addEventListener('keydown', e => { if(e.key==='Escape') _closePowerConfirm(); });

  // Repair modal wiring
  const rConfirm = document.getElementById('repair-modal-confirm');
  const rCancel = document.getElementById('repair-modal-cancel');
  const rModal = document.getElementById('repair-confirm-modal');
  if(rConfirm) rConfirm.addEventListener('click', _confirmRepairAction);
  if(rCancel) rCancel.addEventListener('click', _closeRepairConfirm);
  if(rModal) rModal.addEventListener('click', e => { if(e.target === rModal) _closeRepairConfirm(); });
  document.addEventListener('keydown', e => { if(e.key==='Escape') _closeRepairConfirm(); });

  // If logs panel is present and not yet populated (user might expect default 25 lines immediately)
  const lp = document.getElementById('logs-panel');
  const out = document.getElementById('logs-output');
  if(lp && !lp.classList.contains('hidden') && out && out.childElementCount === 0){
    const svcSel = document.getElementById('logs-service-select');
    _currentLogService = svcSel ? svcSel.value : _currentLogService;
    loadLogs(_currentLogService, true);
  }
});

function _setDot(id, ok){
  const el = document.getElementById(id);
  if(!el) return;
  el.classList.remove('sg-ok','sg-bad');
  if(ok === true) el.classList.add('sg-ok');
  else if(ok === false) el.classList.add('sg-bad');
}

const twitchContainer = document.getElementById('twitch-player');
const chatTab = document.querySelector('.tab[data-tab="chat"]');
let _previewVisible = false;
let _previewEl = null;   // <video> for HLS or <iframe> for Twitch or <div> for placeholder
let _previewType = null; // 'hls' | 'twitch' | 'placeholder'
let _previewSourcePref = 'auto'; // 'auto' | 'hls' | 'twitch' - user preference
let _previewPollInterval = null; // Auto-refresh interval when showing placeholder
let _previewResizeObserver = null;
const _twitchEmbedTmpl = twitchContainer?.dataset.embedTemplate || 'https://player.twitch.tv/?channel={channel}&parent={parent}';
const _twitchEmbedAllow = twitchContainer?.dataset.embedAllow || 'autoplay; fullscreen';
const _twitchEmbedTitle = twitchContainer?.dataset.embedTitle || 'Twitch player';

function _syncHlsPreviewMaxWidth(){
  const docEl = document.documentElement;
  if(!docEl) return;

  // Only HLS <video> (and placeholder) should be affected. Twitch iframe stays untouched.
  if(_previewType !== 'hls' && _previewType !== 'placeholder'){
    docEl.style.setProperty('--hls-preview-max-w', '100%');
    return;
  }

  // Only enforce the chat rule while the Chat tab is active (otherwise #chat has no height).
  const chatPanel = document.getElementById('chat');
  const chatPanelActive = !!(chatPanel && chatPanel.classList && chatPanel.classList.contains('active'));
  if(!chatPanelActive || !twitchContainer || twitchContainer.classList.contains('hidden')){
    docEl.style.setProperty('--hls-preview-max-w', '100%');
    return;
  }

  const panelH = (chatPanel.getBoundingClientRect ? chatPanel.getBoundingClientRect().height : 0) || 0;
  const containerW = (twitchContainer.getBoundingClientRect ? twitchContainer.getBoundingClientRect().width : 0) || 0;
  if(panelH <= 0 || containerW <= 0){
    docEl.style.setProperty('--hls-preview-max-w', '100%');
    return;
  }

  // Requirement: chat height must stay >= 40% of available chat panel height.
  // Since chat height = panelH - previewH, this means previewH must be <= 60% of panelH.
  const maxPreviewH = panelH * 0.60;

  // Preview is effectively 16:9 and also capped by CSS max-height: 60vh.
  const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
  const cssMaxH = viewportH > 0 ? (viewportH * 0.60) : Infinity;
  const fullWidthH = Math.min(containerW * 9 / 16, cssMaxH);

  // If full width doesn't violate chat >= 40%, keep it at 100%.
  if(fullWidthH <= maxPreviewH){
    docEl.style.setProperty('--hls-preview-max-w', '100%');
    return;
  }

  // Otherwise, cap width so preview height becomes <= maxPreviewH.
  const neededW = (maxPreviewH * 16 / 9);
  const pct = Math.max(0, Math.min(100, (neededW / containerW) * 100));
  docEl.style.setProperty('--hls-preview-max-w', pct.toFixed(2) + '%');
}

function _setChatPreviewOffset(px){
  const docEl = document.documentElement;
  if(!docEl) return;
  const val = Math.max(0, Math.round(px || 0));
  docEl.style.setProperty('--preview-offset', val + 'px');
}

function _syncPreviewOffset(){
  if(!_previewVisible || !twitchContainer || twitchContainer.classList.contains('hidden')){
    _setChatPreviewOffset(0);
    _syncHlsPreviewMaxWidth();
    return;
  }
  _setChatPreviewOffset(twitchContainer.offsetHeight || 0);
  _syncHlsPreviewMaxWidth();
}

function _watchPreviewHeight(){
  if(!window.ResizeObserver || !twitchContainer) return;
  if(!_previewResizeObserver){
    _previewResizeObserver = new ResizeObserver(entries => {
      const entry = entries && entries[0];
      const h = entry ? entry.contentRect.height : (twitchContainer.offsetHeight || 0);
      _setChatPreviewOffset(_previewVisible ? h : 0);

      // Keep HLS sizing smooth while resizing.
      _syncHlsPreviewMaxWidth();
    });
  }
  try{ _previewResizeObserver.observe(twitchContainer); }catch(_){ }
}

function _unwatchPreviewHeight(){
  if(_previewResizeObserver && twitchContainer){
    try{ _previewResizeObserver.unobserve(twitchContainer); }catch(_){ }
  }
}

window.addEventListener('resize', () => {
  _syncAppHeight();
  if(_previewVisible) _syncPreviewOffset();
  else _syncHlsPreviewMaxWidth();
});

if(window.visualViewport){
  window.visualViewport.addEventListener('resize', _syncAppHeight);
}

function _getCachedChannel(){
  const fresh = _channelInfoCache.data && (Date.now() - _channelInfoCache.ts) < CHANNEL_INFO_TTL_MS;
  if(fresh){
    const d = _channelInfoCache.data;
    return d && (d.broadcaster_name || d.channel || d.login) || null;
  }
  return null;
}

function _createTwitchIframeSync(){
  const ch = (window.__broadcasterName) || _getCachedChannel();
  if(!ch) return null; // not ready yet
  const parent = window.location.hostname;
  const src = _twitchEmbedTmpl
    .replace('{channel}', encodeURIComponent(ch))
    .replace('{parent}', encodeURIComponent(parent));
  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.setAttribute('allowfullscreen','');
  if(_twitchEmbedAllow) iframe.setAttribute('allow', _twitchEmbedAllow);
  iframe.setAttribute('frameborder','0');
  iframe.setAttribute('title', _twitchEmbedTitle);
  iframe.loading = 'lazy';
  return iframe;
}

async function _ensureBroadcasterName(){
  if((window.__broadcasterName) || _getCachedChannel()) return true;
  try{
    const r = await fetch('/twitch/channel_info');
    if(!r.ok) return false;
    const d = await r.json();
    const name = (d && (d.broadcaster_name || d.channel || d.login)) || null;
    if(name){ window.__broadcasterName = name; return true; }
  }catch(_){ }
  return false;
}

function _fetchWithTimeout(url, ms){
  return Promise.race([
    fetch(url, { cache:'no-store' }),
    new Promise((_, rej)=> setTimeout(()=>rej(new Error('timeout')), ms||1500))
  ]);
}

async function _detectHlsUrl(){
  // Ask backend for available HLS playlists (served by Flask from /tmp/hls)
  try{
    const r = await _fetchWithTimeout('/preview/list', 1200);
    if(!r.ok) throw 0;
    const j = await r.json();
    const arr = (j && Array.isArray(j.playlists)) ? j.playlists : [];
    if(arr.length){
      // Use the newest (server returns sorted newest-first)
      const rel = arr[0]; // e.g., 'live/<name>.m3u8'
      const url = `/preview/hls/${rel}`;
      // Probe quickly to confirm it's a playlist
      try{
        const pr = await _fetchWithTimeout(url, 1200);
        if(pr.ok){
          const body = await pr.text();
          if(/^#EXTM3U/.test(body)) return url;
        }
      }catch(_){ /* ignore */ }
    }
  }catch(_){ /* ignore */ }
  return null;
}

function _createHlsVideo(url){
  const v = document.createElement('video');
  v.classList.add('hls-preview');
  v.controls = true;
  v.autoplay = false;
  v.muted = true; // allow autoplay
  v.playsInline = true;
  v.style.display = 'block';
  
  // Når videoen er klar til å spille av, prøv å starte
  v.addEventListener('canplay', () => {
    const p = v.play();
    if (p && p.catch) {
      p.catch(err => {
        console.debug('Autoplay blokkert:', err);
      });
    }
  }, { once: true });

  // Handle stream errors - switch to placeholder if stream dies
  v.addEventListener('error', () => {
    if(_previewVisible && _previewType === 'hls'){
      _showPlaceholderAndPoll();
    }
  });

  try{
    if(window.Hls && window.Hls.isSupported()){
      const hls = new window.Hls({
        liveBackBufferLength: 15,
        maxLiveSyncPlaybackRate: 1.15,
        liveDurationInfinity: true,
        lowLatencyMode: false,
        liveSyncDurationCount: 1,
        liveMaxLatencyDurationCount: 2,
        maxBufferLength: 4
      });
      hls.loadSource(url);
      hls.attachMedia(v);
      
      // Handle HLS errors - switch to placeholder if stream fails
      hls.on(window.Hls.Events.ERROR, (event, data) => {
        if(data.fatal){
          if(_previewVisible && _previewType === 'hls'){
            _showPlaceholderAndPoll();
          }
        }
      });
      
      // Store hls instance for cleanup
      v._hlsInstance = hls;
    } else {
      // Safari / native HLS
      v.src = url;
    }
  }catch(_){ /* fallback handled by caller */ }
  return v;
}

function _createPlaceholder(){
  const placeholder = document.createElement('div');
  placeholder.className = 'preview-placeholder';
  placeholder.innerHTML = `
    <div class="placeholder-content">
      <div class="placeholder-icon">
        <svg viewBox="0 0 24 24" width="64" height="64" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
      </div>
      <h3>Waiting for stream...</h3>
      <p>The preview will appear automatically when streaming starts</p>
      <div class="placeholder-spinner"></div>
    </div>
  `;
  return placeholder;
}

async function _showPreview(){
  if(!_previewVisible || !twitchContainer) return;
  
  // Cleanup existing HLS instance before clearing
  if(_previewEl && _previewType === 'hls' && _previewEl._hlsInstance){
    try{
      _previewEl._hlsInstance.destroy();
      _previewEl._hlsInstance = null;
    }catch(_){}
  }
  
  // Clear any existing child
  twitchContainer.innerHTML = '';
  _previewEl = null; _previewType = null;
  
  // Stop any existing poll
  _stopPreviewPoll();
  
  // Respect user preference
  if(_previewSourcePref === 'twitch'){
    // Force Twitch
    let ifr = _createTwitchIframeSync();
    if(!ifr){
      const ok = await _ensureBroadcasterName();
      if(ok){ ifr = _createTwitchIframeSync(); }
    }
    if(ifr){ 
      _previewEl = ifr; _previewType = 'twitch'; 
      twitchContainer.appendChild(ifr); 
      _renderToggleButton();
      _syncPreviewOffset();
      return;
    }
    // Twitch not available, show placeholder
    _showPlaceholderAndPoll();
    return;
  }
  
  if(_previewSourcePref === 'hls'){
    // Force HLS only
    const hlsUrl = await _detectHlsUrl();
    if(hlsUrl){
      const vid = _createHlsVideo(hlsUrl);
      if(vid){
        _previewEl = vid; _previewType = 'hls';
        twitchContainer.appendChild(vid);
        _renderToggleButton();
        _syncPreviewOffset();
        return;
      }
    }
    // HLS not available: show placeholder and poll
    _showPlaceholderAndPoll();
    return;
  }
  
  // Auto mode: try HLS first, fallback to Twitch
  const hlsUrl = await _detectHlsUrl();
  if(hlsUrl){
    const vid = _createHlsVideo(hlsUrl);
    if(vid){
      _previewEl = vid; _previewType = 'hls';
      twitchContainer.appendChild(vid);
      _renderToggleButton();
      _syncPreviewOffset();
      return;
    }
  }
  // Fallback: Twitch iframe
  let ifr = _createTwitchIframeSync();
  if(!ifr){
    const ok = await _ensureBroadcasterName();
    if(ok){ ifr = _createTwitchIframeSync(); }
  }
  if(ifr){ 
    _previewEl = ifr; _previewType = 'twitch'; 
    twitchContainer.appendChild(ifr); 
    _renderToggleButton();
    _syncPreviewOffset();
    return;
  }
  
  // Nothing available: show placeholder and poll
  _showPlaceholderAndPoll();
}

function _showPlaceholderAndPoll(){
  if(!twitchContainer) return;
  // Guard: if already showing placeholder, don't create another
  if(_previewType === 'placeholder') return;
  
  // Cleanup existing HLS instance before clearing
  if(_previewEl && _previewType === 'hls' && _previewEl._hlsInstance){
    try{
      _previewEl._hlsInstance.destroy();
      _previewEl._hlsInstance = null;
    }catch(_){}
  }
  
  // Clear container and mark as placeholder immediately to prevent race condition
  twitchContainer.innerHTML = '';
  _previewType = 'placeholder';
  
  const placeholder = _createPlaceholder();
  _previewEl = placeholder;
  twitchContainer.appendChild(placeholder);
  _renderToggleButton();
  _syncPreviewOffset();
  // Start polling every 3 seconds to check for stream
  _startPreviewPoll();
}

function _startPreviewPoll(){
  _stopPreviewPoll(); // Clear any existing
  _previewPollInterval = setInterval(async () => {
    if(!_previewVisible || _previewType !== 'placeholder') {
      _stopPreviewPoll();
      return;
    }
    // Try to detect stream again
    const hlsUrl = await _detectHlsUrl();
    if(hlsUrl){
      // Stream is available! Reload preview
      _showPreview();
    }
  }, 3000); // Check every 3 seconds
}

function _stopPreviewPoll(){
  if(_previewPollInterval){
    clearInterval(_previewPollInterval);
    _previewPollInterval = null;
  }
}

function _hidePreview(){
  if(!twitchContainer) return;
  _stopPreviewPoll(); // Stop polling when hiding
  twitchContainer.classList.add('hidden');
  if(_previewEl){
    try{
      if(_previewType === 'twitch'){ _previewEl.src = 'about:blank'; }
      else if(_previewType === 'hls'){ 
        // Cleanup HLS instance
        if(_previewEl._hlsInstance){
          _previewEl._hlsInstance.destroy();
          _previewEl._hlsInstance = null;
        }
        _previewEl.pause && _previewEl.pause();
      }
    }catch(_){ }
    _previewEl.remove();
  }
  _previewEl = null; _previewType = null;
  _removeToggleButton();
  _syncPreviewOffset();
}

function _renderToggleButton(){
  // Remove existing toggle if any
  _removeToggleButton();
  if(!twitchContainer || !_previewVisible) return;
  const btn = document.createElement('button');
  btn.id = 'preview-source-toggle';
  btn.className = 'preview-toggle-btn';
  btn.title = 'Switch preview source';
  btn.setAttribute('aria-label', 'Switch preview source');
  // Icon: swap/arrows (minimal SVG)
  btn.innerHTML = '<svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor"><path d="M8 5L3 10l5 5V5zm4 0v10l5-5-5-5z"/></svg>';
  btn.addEventListener('click', _togglePreviewSource);
  twitchContainer.appendChild(btn);
}

function _removeToggleButton(){
  const existing = document.getElementById('preview-source-toggle');
  if(existing) existing.remove();
}

function _togglePreviewSource(){
  // Cycle: auto -> hls -> twitch -> auto
  if(_previewSourcePref === 'auto') _previewSourcePref = 'hls';
  else if(_previewSourcePref === 'hls') _previewSourcePref = 'twitch';
  else _previewSourcePref = 'auto';
  // Reload preview with new preference
  _showPreview();
}

function setPreviewVisible(show){
  if(!twitchContainer) return;
  const on = !!show;
  if(on){
    _previewVisible = true;
    twitchContainer.classList.remove('hidden');
    _watchPreviewHeight();
    _syncPreviewOffset();
    // async load preview (local HLS first, Twitch fallback)
    _showPreview();
  } else {
    _previewVisible = false;
    _hidePreview();
    _unwatchPreviewHeight();
    _setChatPreviewOffset(0);
  }
}

setPreviewVisible(false);

if(chatTab){
  chatTab.addEventListener('dblclick', (e) => {
    // Hindre tekstmarkering/standard handling ved dobbeltklikk
    try{ e.preventDefault(); e.stopPropagation(); }catch(_){ }
    try{ const sel = window.getSelection && window.getSelection(); if(sel && sel.removeAllRanges) sel.removeAllRanges(); }catch(_){ }
    setPreviewVisible(!_previewVisible);
  });
}

Object.assign(window, {
  sendRequest,
  turnOnMiniPC,
  turnOffMiniPC,
  restartMiniPC,
  switchToLive,
  switchToBRB,
  applyStreamTitle,
  cancelStreamTitle,
  showStreamTitleForm,
  applyRaid,
  cancelRaid,
  showRaidChannelForm,
  stopStream,
  openPowerConfirm,
  openRepairConfirm
});

// Hjelpefunksjon: sørger for at et skjemaelement ligger rett etter knappen sin
function ensureFormAfterButton(buttonId, formId){
  const btn = document.getElementById(buttonId);
  const form = document.getElementById(formId);
  if(btn && form && btn.nextElementSibling !== form){
    btn.insertAdjacentElement('afterend', form);
  }
}

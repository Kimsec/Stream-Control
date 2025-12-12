document.getElementById("year").textContent = new Date().getFullYear();
let lastStreaming = null;
const chatbotToggleEl = document.getElementById('chatbot-toggle');
const advancedBtn = document.getElementById('advancedBtn');
const advancedPanelEl = document.getElementById('advancedPanel');
let _chatbotAutoStartEnabled = true;
let _chatbotPrefHoldUntil = 0;
let _isStreamingLive = false;
let _advancedPanelVisible = false;

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

function _syncChatbotToggleUI(){
  if(chatbotToggleEl){
    chatbotToggleEl.checked = !!_chatbotAutoStartEnabled;
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
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');
const footer = document.getElementById('main-footer');
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        const activeTabContent = document.getElementById(tab.getAttribute('data-tab'));
        activeTabContent.classList.add('active');

        // Kun chat skjuler footer og lar CSS styre høyde
        if (tab.getAttribute('data-tab') === 'chat') {
          footer.style.display = 'none';
          const chatContainerEl = document.getElementById('chat-container');
          if (chatContainerEl) chatContainerEl.style.height = '';
        } else {
          footer.style.display = '';
        }
    });
});

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
      if (data.status === "on") {
        setStatusWithDot(el, 'Status: ON', true);
        el.className = "status on";
                document.getElementById("turnOnBtn").style.display = "none";
                document.getElementById("restartBtn").style.display = "inline-block";
                document.getElementById("turnOffBtn").style.display = "inline-block";
            } else {
        setStatusWithDot(el, 'Status: OFF', false);
        el.className = "status off";
                document.getElementById("turnOnBtn").style.display = "inline-block";
                document.getElementById("restartBtn").style.display = "none";
                document.getElementById("turnOffBtn").style.display = "none";
            }
        });
}
setInterval(checkMiniPCStatus, 5000);
checkMiniPCStatus();

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
    const chatContainer = document.getElementById('chat-container'); // moved out of if
    fetch('/twitch/channel_info')
        .then(res => res.json())
    .then(data => {
      // Cache broadcaster/channel for instant reuse by Twitch player
      try { window.__broadcasterName = (data && (data.broadcaster_name || data.channel || data.login)) || null; } catch(_) {}
            if (data.broadcaster_name) {
                const iframe = document.createElement('iframe');
                iframe.id = 'twitch-chat-iframe';
                iframe.src = `https://www.twitch.tv/embed/${data.broadcaster_name}/chat?parent=${window.location.hostname}&darkpopout`;
                chatContainer.innerHTML = '';
                chatContainer.appendChild(iframe);
            } else {
                chatContainer.textContent = 'Could not load chat. Channel name not found.';
            }
        })
        .catch(err => {
            console.error('Error loading Twitch chat:', err);
            chatContainer.textContent = 'Error loading Twitch chat.';
        });
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
      } else if (isStreamingNow !== lastStreaming) {
        if (isStreamingNow) {
          if (_chatbotAutoStartEnabled) _startChatbot();
        } else {
          _stopChatbot();
        }
        lastStreaming = isStreamingNow;
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

      // --- UI oppdatering som før ---
      const status = document.getElementById("streamStatus");
      const scene = document.getElementById("obsScene");

      if (data.error) {
        status.textContent = "Error reading OBS";
        status.className = "status off";
        scene.textContent = "Scene: —";
        startBtn.style.display = "inline-block";
        stopBtn.style.display = "none";
        if (switchToLiveBtn) switchToLiveBtn.style.display = "inline-block";
        if (switchToBRBBtn) switchToBRBBtn.style.display = "none";
        return;
      }

      setStatusWithDot(status, isStreamingNow ? 'Status: Streaming' : 'Status: Offline', isStreamingNow);
      status.className = "status " + (isStreamingNow ? "on" : "off");

            const currentScene = (data.currentScene || "—");
            scene.textContent = "Scene: " + currentScene;

      if (isStreamingNow) {
        startBtn.style.display = "none";
        stopBtn.style.display = "inline-block";
      } else {
        startBtn.style.display = "inline-block";
        stopBtn.style.display = "none";
      }

      if (data.currentScene === "LIVE") {
        if (switchToLiveBtn) switchToLiveBtn.style.display = "none";
        if (switchToBRBBtn) switchToBRBBtn.style.display = "inline-block";
      } else {
        if (switchToLiveBtn) switchToLiveBtn.style.display = "inline-block";
        if (switchToBRBBtn) switchToBRBBtn.style.display = "none";
      }
    })
    .catch(err => {
      console.error('Stream status error:', err);
      startBtn.style.display = "inline-block";
      stopBtn.style.display = "none";
      if (switchToLiveBtn) switchToLiveBtn.style.display = "inline-block";
      if (switchToBRBBtn) switchToBRBBtn.style.display = "none";
      document.getElementById("streamStatus").textContent = "Error";
      document.getElementById("obsScene").textContent = "Scene: —";
    });
}

setInterval(checkStreamStatus, 2000);
checkMiniPCStatus();
loadTwitchChat(); 

const audioBanner = document.getElementById('audio-permission-banner');
const alertIframe = document.getElementById('alertbox-iframe');

function requestAudioPermission() {
  try {
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
  el.textContent = 'Viewers: ' + (isLive ? (count ?? 0) : '—');
}

function _pollViewersOnce(){
  fetch('/twitch/stream_info')
    .then(r => r.ok ? r.json() : Promise.reject(r))
    .then(js => {
      if(js && typeof js.viewer_count !== 'undefined'){
        _updateViewerUI(!!js.is_live, js.viewer_count|0);
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

if(restreamOptions){
  restreamOptions.setAttribute('aria-hidden','true');
  restreamOptions.style.maxHeight = '0px';
  restreamOptions.style.opacity = '0';
}
if(restreamBtn){
  restreamBtn.setAttribute('aria-expanded','false');
}

function _refreshRestreamPanelHeight(){
  if(restreamOptions && restreamOptions.classList.contains('restream-open')){
    restreamOptions.style.maxHeight = restreamOptions.scrollHeight + 'px';
  }
}

function _openRestreamPanel(){
  if(!restreamOptions) return;
  restreamOptions.classList.add('restream-open');
  restreamOptions.setAttribute('aria-hidden','false');
  requestAnimationFrame(()=>{
    restreamOptions.style.maxHeight = restreamOptions.scrollHeight + 'px';
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
  const currentHeight = restreamOptions.scrollHeight;
  restreamOptions.style.maxHeight = currentHeight + 'px';
  requestAnimationFrame(()=>{
    restreamOptions.classList.remove('restream-open');
    restreamOptions.style.maxHeight = '0px';
    restreamOptions.style.opacity = '0';
  });
  if(restreamBtn){
    restreamBtn.style.display = 'inline-block';
    restreamBtn.setAttribute('aria-expanded','false');
  }
}

// Vis/restre restream-panel
restreamBtn.addEventListener('click', () => {
  _openRestreamPanel();
    fetch('/rtmp_endpoints.json')
        .then(r => r.json())
        .then(data => {
            endpointsList.innerHTML = '';
            data.push_endpoints.forEach((ep) => {
                const div = document.createElement('div');
                div.className = 'endpoint-row';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = ep.enabled;
                div.appendChild(checkbox);

                const nameInput = document.createElement('input');
                nameInput.type = 'text';
                nameInput.className = 'name-input';
                nameInput.value = ep.name;
                nameInput.disabled = true;
                nameInput.style.backgroundColor = '#666';
                nameInput.style.color = 'black';
                nameInput.style.border = '1px solid #777';
                nameInput.style.padding = '5px';
                div.appendChild(nameInput);

                const urlInput = document.createElement('input');
                urlInput.type = 'text';
                urlInput.className = 'url-input';
                urlInput.value = ep.url;
                urlInput.disabled = true;
                urlInput.style.backgroundColor = '#666';
                urlInput.style.color = 'black';
                urlInput.style.border = '1px solid #777';
                urlInput.style.padding = '5px';
                div.appendChild(urlInput);

                const editButton = document.createElement('button');
                editButton.className = 'icon-btn edit-endpoint';
                editButton.innerHTML = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M13.586 3.586a2 2 0 0 1 2.828 2.828l-8.486 8.486a1 1 0 0 1-.293.195l-3 1a1 1 0 0 1-1.266-1.265l1-3a1 1 0 0 1 .195-.293l8.486-8.486Zm1.414 1.414L6.879 13.121l-.586 1.757 1.757-.586 8.121-8.121-1.171-1.171Z"/></svg>';
                editButton.title = 'Edit';
        editButton.addEventListener('click', () => {
          const enabling = nameInput.disabled; // was disabled -> enabling edit
          nameInput.disabled = !nameInput.disabled;
          urlInput.disabled = !urlInput.disabled;
          if (enabling) {
            div.classList.add('editing');
            nameInput.style.backgroundColor = '#444';
            nameInput.style.color = 'white';
            nameInput.style.border = '2px solid #81029b';
            urlInput.style.backgroundColor = '#444';
            urlInput.style.color = 'white';
            urlInput.style.border = '2px solid #81029b';
          } else {
            div.classList.remove('editing');
            nameInput.style.backgroundColor = '#666';
            nameInput.style.color = 'black';
            nameInput.style.border = '1px solid #777';
            urlInput.style.backgroundColor = '#666';
            urlInput.style.color = 'black';
            urlInput.style.border = '1px solid #777';
          }
        });
                div.appendChild(editButton);

                const deleteButton = document.createElement('button');
                deleteButton.className = 'icon-btn delete-endpoint';
                deleteButton.innerHTML = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M7 2a2 2 0 0 0-2 2v1H3.5a.5.5 0 0 0 0 1h.54l.82 9.016A2 2 0 0 0 6.856 17h6.288a2 2 0 0 0 1.996-1.984L15.96 6H16.5a.5.5 0 0 0 0-1H15V4a2 2 0 0 0-2-2H7Zm6 3H7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1ZM8.5 8.5a.5.5 0 0 1 .5.5v5a.5.5 0 1 1-1 0V9a.5.5 0 0 1 .5-.5Zm3 .5v5a.5.5 0 1 0 1 0V9a.5.5 0 0 0-1 0Z"/></svg>';
                deleteButton.title = 'Delete';
                deleteButton.addEventListener('click', () => openDeleteEndpointModal(div));
                div.appendChild(deleteButton);

                endpointsList.appendChild(div);
            });
              _refreshRestreamPanelHeight();
        })
        .catch(console.error);
});

// Legg til ny linje
addEndpointBtn.addEventListener('click', () => {
    const div = document.createElement('div');
    div.className = 'endpoint-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    div.appendChild(checkbox);

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'name-input';     // <- klasse
    nameInput.placeholder = 'Name';
    nameInput.style.backgroundColor = '#444';
    nameInput.style.color = 'white';
    nameInput.style.border = '2px solid #81029b';
    nameInput.style.padding = '5px';
    div.appendChild(nameInput);

    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.className = 'url-input';       // <- klasse
    urlInput.placeholder = 'rtmp://PATH/streamkey';
    urlInput.style.backgroundColor = '#444';
    urlInput.style.color = 'white';
    urlInput.style.border = '2px solid #81029b';
    urlInput.style.padding = '5px';
    div.appendChild(urlInput);

  const editButton = document.createElement('button');
  editButton.className = 'icon-btn edit-endpoint';
  editButton.innerHTML = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M13.586 3.586a2 2 0 0 1 2.828 2.828l-8.486 8.486a1 1 0 0 1-.293.195l-3 1a1 1 0 0 1-1.266-1.265l1-3a1 1 0 0 1 .195-.293l8.486-8.486Zm1.414 1.414L6.879 13.121l-.586 1.757 1.757-.586 8.121-8.121-1.171-1.171Z"/></svg>';
  editButton.title = 'Edit';
  editButton.addEventListener('click', () => {
    const enabling = nameInput.disabled;
    nameInput.disabled = !nameInput.disabled;
    urlInput.disabled = !urlInput.disabled;
    if (enabling) {
      div.classList.add('editing');
      nameInput.style.backgroundColor = '#444';
      nameInput.style.color = 'white';
      nameInput.style.border = '2px solid #81029b';
      urlInput.style.backgroundColor = '#444';
      urlInput.style.color = 'white';
      urlInput.style.border = '2px solid #81029b';
    } else {
      div.classList.remove('editing');
      nameInput.style.backgroundColor = '#666';
      nameInput.style.color = 'black';
      nameInput.style.border = '1px solid #777';
      urlInput.style.backgroundColor = '#666';
      urlInput.style.color = 'black';
      urlInput.style.border = '1px solid #777';
    }
  });
    div.appendChild(editButton);

  const deleteButton = document.createElement('button');
  deleteButton.className = 'icon-btn delete-endpoint';
  deleteButton.innerHTML = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M7 2a2 2 0 0 0-2 2v1H3.5a.5.5 0 0 0 0 1h.54l.82 9.016A2 2 0 0 0 6.856 17h6.288a2 2 0 0 0 1.996-1.984L15.96 6H16.5a.5.5 0 0 0 0-1H15V4a2 2 0 0 0-2-2H7Zm6 3H7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1ZM8.5 8.5a.5.5 0 0 1 .5.5v5a.5.5 0 1 1-1 0V9a.5.5 0 0 1 .5-.5Zm3 .5v5a.5.5 0 1 0 1 0V9a.5.5 0 0 0-1 0Z"/></svg>';
  deleteButton.title = 'Delete';
  deleteButton.addEventListener('click', () => openDeleteEndpointModal(div));
    div.appendChild(deleteButton);

    endpointsList.appendChild(div);
    _refreshRestreamPanelHeight();
});

// Lagre-endepunkter (bruk klasser, ikke nth-child)
saveRestreamBtn.addEventListener('click', () => {
    const updated = Array.from(endpointsList.querySelectorAll('.endpoint-row'))
        .map(div => ({
            name: div.querySelector('.name-input')?.value.trim() || '',
            url: div.querySelector('.url-input')?.value.trim() || '',
            enabled: div.querySelector('input[type="checkbox"]')?.checked || false
        }));

    fetch('/api/update_push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ push_endpoints: updated })
    })
    .then(res => res.json())
    .then(resp => {
        if (resp.status === 'ok') {
      showToast('Restream settings saved!','success');
            _closeRestreamPanel();
        } else {
      showToast('Error: ' + (resp.error || JSON.stringify(resp)),'error');
        }
    })
    .catch(err => showToast('Communication error: ' + err,'error'));
});

// Skjul ved Avbryt
cancelRestreamBtn.addEventListener('click', () => {
    _closeRestreamPanel();
});

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
      // Chatbot mapping
      upd('hc-chatbot', j.chatbot_state || 'offline', j.chatbot_state);
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
  ['hc-chatbot','hc-nginx','hc-streamguard','hc-chatguard','hc-sls','hc-obs','hc-raidws','hc-raidsub','hc-token','hc-stunnel'].forEach(id=>{
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

function _setChatPreviewOffset(px){
  const docEl = document.documentElement;
  if(!docEl) return;
  const val = Math.max(0, Math.round(px || 0));
  docEl.style.setProperty('--preview-offset', val + 'px');
}

function _syncPreviewOffset(){
  if(!_previewVisible || !twitchContainer || twitchContainer.classList.contains('hidden')){
    _setChatPreviewOffset(0);
    return;
  }
  _setChatPreviewOffset(twitchContainer.offsetHeight || 0);
}

function _watchPreviewHeight(){
  if(!window.ResizeObserver || !twitchContainer) return;
  if(!_previewResizeObserver){
    _previewResizeObserver = new ResizeObserver(entries => {
      const entry = entries && entries[0];
      const h = entry ? entry.contentRect.height : (twitchContainer.offsetHeight || 0);
      _setChatPreviewOffset(_previewVisible ? h : 0);
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
  if(_previewVisible) _syncPreviewOffset();
});

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
  v.controls = true;
  v.autoplay = false;
  v.muted = true; // allow autoplay
  v.playsInline = true;
  v.style.display = 'block';
  v.style.width = '100%';
  v.style.height = 'auto';
  
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

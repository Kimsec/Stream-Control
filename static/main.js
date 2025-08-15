document.getElementById("year").textContent = new Date().getFullYear();
let lastStreaming = null;
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

        // Kun chat skjuler footer
        if (tab.getAttribute('data-tab') === 'chat') {
            footer.style.display = 'none';
            document.getElementById('chat-container').style.height = 'calc(100vh - 55px)';
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

function checkMiniPCStatus() {
    fetch('/status')
        .then(res => res.json())
        .then(data => {
            const el = document.getElementById("minipcStatus");
            if (data.status === "on") {
                el.textContent = "Status: ON 🟢";
                el.className = "status on";
                document.getElementById("turnOnBtn").style.display = "none";
                document.getElementById("restartBtn").style.display = "inline-block";
                document.getElementById("turnOffBtn").style.display = "inline-block";
            } else {
                el.textContent = "Status: OFF 🔴";
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
    fetch('/twitch/channel_info')
        .then(res => res.json())
        .then(data => {
            if (data.title) {
                document.getElementById("streamTitleInput").value = data.title; // Sett nåværende tittel
            }
            if (data.category) {
                document.getElementById("categorySearchInput").value = data.category.name; // Sett nåværende kategori
                document.getElementById("categorySearchInput").dataset.categoryId = data.category.id; // Lagre kategori-ID
            }
            document.getElementById("streamTitleForm").style.display = "block";
            document.getElementById("showStreamTitleInput").style.display = "none";
        })
        .catch(err => {
            console.error("Error fetching stream info:", err);
            showToast("Error fetching current stream info.", 'error');
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
    document.getElementById("raidChannelForm").style.display = "block";
    document.getElementById("showRaidChannelInput").style.display = "none";
}

function loadTwitchChat() {
    const chatContainer = document.getElementById('chat-container'); // moved out of if
    fetch('/twitch/channel_info')
        .then(res => res.json())
        .then(data => {
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
      if (lastStreaming === null) {
        // første måling: sett baseline
        lastStreaming = isStreamingNow;
      } else if (isStreamingNow !== lastStreaming) {
        // overgang OFF->ON = start bot, ON->OFF = stopp bot
        fetch(isStreamingNow ? '/bot/start' : '/bot/stop', { method: 'POST' }).catch(()=>{});
        lastStreaming = isStreamingNow;
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

      status.textContent = isStreamingNow ? "Status: Streaming 🟢" : "Status: Offline 🔴";
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

function searchCategory() {
    const query = document.getElementById("categorySearchInput").value.trim().toLowerCase();
    if (!query) {
        document.getElementById("categoryResults").innerHTML = ""; // Tøm tidligere resultater hvis input er tomt
        return;
    }

    fetch(`/twitch/search_categories?query=${query}`)
        .then(res => res.json())
        .then(data => {
            const resultsContainer = document.getElementById("categoryResults");
            resultsContainer.innerHTML = ""; // Tøm tidligere resultater

            if (data.data && data.data.length > 0) {
                // Beregn likhet mellom søkestrengen og kategorinavnene
                const categoriesWithSimilarity = data.data.map(category => ({
                    name: category.name,
                    id: category.id,
                    similarity: calculateSimilarity(query, category.name.toLowerCase())
                }));

                // Sorter kategorier basert på likhet (høyest først)
                categoriesWithSimilarity.sort((a, b) => b.similarity - a.similarity);

                // Vis de 6 mest relevante treffene
                categoriesWithSimilarity.slice(0, 6).forEach(category => {
                    const button = document.createElement("button");
                    button.textContent = category.name; // Vis kategorinavnet
                    button.style.fontSize = "20px";
                    button.style.margin = "5px";
                    button.style.padding = "15px 20px";
                    button.onclick = () => {
                        document.getElementById("categorySearchInput").value = category.name; // Sett kategorinavnet
                        document.getElementById("categorySearchInput").dataset.categoryId = category.id; // Lagre category_id
                        resultsContainer.innerHTML = ""; // Fjern søkeresultatene
                    };
                    resultsContainer.appendChild(button);
                });
            } else {
                resultsContainer.textContent = "No categories found.";
            }
        })
        .catch(err => {
            console.error("Error searching categories:", err);
            document.getElementById("categoryResults").textContent = "Error searching categories.";
        });
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

// Vis/restre restream-panel
restreamBtn.addEventListener('click', () => {
    restreamOptions.style.display = 'block';
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
            restreamOptions.style.display = 'none';
        } else {
      showToast('Error: ' + (resp.error || JSON.stringify(resp)),'error');
        }
    })
    .catch(err => showToast('Communication error: ' + err,'error'));
});

// Skjul ved Avbryt
cancelRestreamBtn.addEventListener('click', () => {
    restreamOptions.style.display = 'none';
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
      // Chatbot mapping
      upd('hc-chatbot', j.chatbot_state || 'offline', j.chatbot_state);
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
    }catch(e){
  ['hc-chatbot','hc-streamguard','hc-chatguard','hc-sls','hc-obs','hc-raidws','hc-raidsub','hc-token'].forEach(id=>{
        upd(id,'error','error');
      });
    }finally{
      setTimeout(pollHealth, 5000);
    }
  }
  pollHealth();
})();

function openStopStreamModal(){
  const m = document.getElementById('stop-stream-modal');
  if(m) m.classList.remove('hidden');
}
function closeStopStreamModal(){
  const m = document.getElementById('stop-stream-modal');
  if(m) m.classList.add('hidden');
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
      }
      closeDeleteEndpointModal();
    });
  }
  if(delCancel) delCancel.addEventListener('click', closeDeleteEndpointModal);
  if(delModal){
    delModal.addEventListener('click', e => { if(e.target === delModal) closeDeleteEndpointModal(); });
  }
  document.addEventListener('keydown', e => { if(e.key==='Escape') closeDeleteEndpointModal(); });
});

function _setDot(id, ok){
  const el = document.getElementById(id);
  if(!el) return;
  el.classList.remove('sg-ok','sg-bad');
  if(ok === true) el.classList.add('sg-ok');
  else if(ok === false) el.classList.add('sg-bad');
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
  stopStream
});

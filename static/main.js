document.getElementById("year").textContent = new Date().getFullYear();
let lastStreaming = null;
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
        .then(alert)
        .catch(err => alert('Error: ' + err));
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
        body: JSON.stringify({ scene: 'BRB' })  // Send scenenavnet "BRB"
    })
    .then(res => res.text())
    .then(alert)
    .catch(err => alert('Error: ' + err));
}

function switchToLive() {
    fetch('/obs/switch_scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene: 'LIVE' })  // Send scenenavnet "LIVE"
    })
    .then(res => res.text())
    .then(alert)
    .catch(err => alert('Error: ' + err));
}
function applyStreamTitle() {
    const title = document.getElementById("streamTitleInput").value;
    const categoryId = document.getElementById("categorySearchInput").dataset.categoryId;

    if (!title || !categoryId) {
        alert("Both title and category must be set.");
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
        alert(msg);
        cancelStreamTitle();
    })
    .catch(err => alert(err.message));
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
            alert("Error fetching current stream info.");
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
        alert(msg);
        cancelRaid();
    })
    .catch(err => alert(err.message));
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
      console.log("OBS status:", data);

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

      scene.textContent = "Scene: " + (data.currentScene || "—");

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

setInterval(checkStreamStatus, 5000);
checkMiniPCStatus();
loadTwitchChat(); 

const audioBanner = document.getElementById('audio-permission-banner');
const alertIframe = document.getElementById('alertbox-iframe');

function requestAudioPermission() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        alertIframe.contentWindow.postMessage('play', '*');
        audioBanner.style.display = 'none'; // Skjul banneret etter aktivering
    } catch (e) {
        console.error('Error activating audio:', e);
        audioBanner.style.display = 'none'; // Skjul banneret selv om det feiler
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
                editButton.textContent = '✏️';
                editButton.title = 'Edit';
                editButton.addEventListener('click', () => {
                    nameInput.disabled = !nameInput.disabled;
                    urlInput.disabled = !urlInput.disabled;
                    if (!nameInput.disabled) {
                        nameInput.style.backgroundColor = '#444';
                        nameInput.style.color = 'white';
                        nameInput.style.border = '2px solid #81029b';
                        urlInput.style.backgroundColor = '#444';
                        urlInput.style.color = 'white';
                        urlInput.style.border = '2px solid #81029b';
                    } else {
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
                deleteButton.textContent = '🗑️';
                deleteButton.title = 'Delete';
                deleteButton.addEventListener('click', () => {
                    if (confirm('Confirm to delete?')) endpointsList.removeChild(div);
                });
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
    editButton.textContent = '✏️';
    editButton.title = 'Edit';
    editButton.addEventListener('click', () => {
        nameInput.disabled = !nameInput.disabled;
        urlInput.disabled = !urlInput.disabled;
        if (!nameInput.disabled) {
            nameInput.style.backgroundColor = '#444';
            nameInput.style.color = 'white';
            nameInput.style.border = '2px solid #81029b';
            urlInput.style.backgroundColor = '#444';
            urlInput.style.color = 'white';
            urlInput.style.border = '2px solid #81029b';
        } else {
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
    deleteButton.textContent = '🗑️';
    deleteButton.title = 'Delete';
    deleteButton.addEventListener('click', () => endpointsList.removeChild(div));
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
            alert('Restream settings saved!');
            restreamOptions.style.display = 'none';
        } else {
            alert('Error: ' + (resp.error || JSON.stringify(resp)));
        }
    })
    .catch(err => alert('Communication error: ' + err));
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
  stopStream // <- export so onclick finds it
});

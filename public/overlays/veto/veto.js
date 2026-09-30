let ws = null;

// Map background fallback images (styled gradients / official valorant aesthetic)
const MAP_THEMES = {
  Ascent: 'linear-gradient(135deg, #1b384f 0%, #0d1e2e 100%)',
  Bind: 'linear-gradient(135deg, #4f3b1b 0%, #2e200d 100%)',
  Haven: 'linear-gradient(135deg, #3a4f1b 0%, #1c2e0d 100%)',
  Lotus: 'linear-gradient(135deg, #1b4f45 0%, #0d2e26 100%)',
  Sunset: 'linear-gradient(135deg, #4f251b 0%, #2e120d 100%)',
  Split: 'linear-gradient(135deg, #381b4f 0%, #1e0d2e 100%)',
  Abyss: 'linear-gradient(135deg, #10263f 0%, #08111e 100%)',
  Icebox: 'linear-gradient(135deg, #22435e 0%, #102538 100%)',
  Breeze: 'linear-gradient(135deg, #1b4d54 0%, #0b272b 100%)',
  Fracture: 'linear-gradient(135deg, #4d441b 0%, #27230b 100%)'
};

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'INIT_STATE' || data.type === 'STATE_UPDATE') {
        renderVeto(data.state);
      }
    } catch (e) {
      console.error('[Veto Overlay] Error parsing message:', e);
    }
  };

  ws.onclose = () => {
    setTimeout(connectWebSocket, 1000);
  };
}

function renderVeto(state) {
  if (!state) return;

  // Header Teams & Series
  document.getElementById('veto-team-a').textContent = state.teamA.tag || 'SEN';
  document.getElementById('veto-team-b').textContent = state.teamB.tag || 'FNC';
  document.getElementById('veto-series-type').textContent = `BEST OF ${state.match.seriesType === 'BO5' ? 5 : state.match.seriesType === 'BO1' ? 1 : 3}`;

  const container = document.getElementById('maps-grid');
  container.innerHTML = '';

  const vetoList = state.veto || [];
  vetoList.forEach((item, index) => {
    const card = document.createElement('div');
    const statusLower = (item.status || 'pending').toLowerCase();
    card.className = `map-card ${statusLower}`;

    const bg = document.createElement('div');
    bg.className = 'map-card-bg';
    bg.style.background = MAP_THEMES[item.map] || MAP_THEMES.Ascent;
    card.appendChild(bg);

    // Card Top
    const top = document.createElement('div');
    top.className = 'map-content-top';
    top.innerHTML = `
      <div class="map-number-label">MAP ${index + 1}</div>
      <div class="map-name-title">${item.map}</div>
    `;
    card.appendChild(top);

    // Card Bottom
    const bottom = document.createElement('div');
    bottom.className = 'map-content-bottom';
    
    let statusLabel = item.status || 'PENDING';
    let teamLabel = item.team ? `BY ${item.team}` : '';
    if (statusLabel === 'DECIDER') teamLabel = 'FINAL MAP';
    if (statusLabel === 'PENDING') teamLabel = 'IN PROGRESS';

    bottom.innerHTML = `
      <div class="status-badge">${statusLabel}</div>
      <div class="status-team-info">${teamLabel}</div>
    `;
    card.appendChild(bottom);

    container.appendChild(card);
  });
}

connectWebSocket();
initAutoScale('.auto-stage', { anchor: 'center' });

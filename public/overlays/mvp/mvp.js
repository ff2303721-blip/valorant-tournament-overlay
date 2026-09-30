/**
 * Valorant Broadcast MVP Overlay WebSocket Client
 */
let ws = null;

function connectWS() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[MVP Overlay] Connected to Overlay Server.');
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'INIT_STATE' || data.type === 'STATE_UPDATE') {
        renderMVP(data.state);
      }
    } catch (e) {
      console.error('[MVP Overlay] Message parse error:', e);
    }
  };

  ws.onclose = () => {
    console.warn('[MVP Overlay] WS Disconnected. Retrying in 2s...');
    setTimeout(connectWS, 2000);
  };
}

function renderMVP(state) {
  if (!state) return;
  const p = state.mvpPlayer;
  if (!p) return;

  const urlParams = new URLSearchParams(window.location.search);
  const isPreview = urlParams.has('preview') || urlParams.has('always');
  if (!state.mvpVisible && !isPreview) {
    container.classList.add('hidden-mvp');
  } else {
    container.classList.remove('hidden-mvp');
  }

  const sizeParam = urlParams.get('size');
  if (sizeParam === 'large' || sizeParam === 'full') {
    container.classList.add('size-large');
  }

  // Portrait & Agent
  const photo = p.photo || '/players/DOMINIC.png';
  document.getElementById('mvp-photo').src = photo;
  document.getElementById('mvp-agent').textContent = (p.agent || 'JETT').toUpperCase();

  // Name & Team
  document.getElementById('mvp-name').textContent = p.name || 'MVP PLAYER';
  document.getElementById('mvp-team-tag').textContent = p.teamTag || 'TEAM';
  document.getElementById('mvp-team-name').textContent = p.teamName || 'TOURNAMENT TEAM';
  if (p.logo) {
    document.getElementById('mvp-team-logo').src = p.logo;
  }

  // Stats
  const kills = p.kills || 0;
  const deaths = p.deaths || 0;
  const assists = p.assists || 0;
  const kd = deaths > 0 ? (kills / deaths).toFixed(2) : kills.toFixed(2);
  const acs = p.acs || Math.max(150, kills * 18 + assists * 6);

  document.getElementById('mvp-kills').textContent = kills;
  document.getElementById('mvp-deaths').textContent = deaths;
  document.getElementById('mvp-assists').textContent = assists;
  document.getElementById('mvp-kd').textContent = kd;
  document.getElementById('mvp-acs').textContent = acs;

  const mapName = (state.match && state.match.mapName) || 'ASCENT';
  const stage = (state.match && state.match.stage) || 'MATCH REPORT';
  document.getElementById('mvp-match-info').textContent = `${stage.toUpperCase()} • ${mapName.toUpperCase()}`;
}

// Initialize auto-scaling to prevent cropping on any OBS or window resolution
if (typeof initAutoScale === 'function') {
  initAutoScale('.auto-stage', { anchor: 'center' });
}

// Initial fetch & connect
fetch('/api/state')
  .then(res => res.json())
  .then(state => renderMVP(state))
  .catch(err => console.warn('Could not fetch initial state:', err));

connectWS();


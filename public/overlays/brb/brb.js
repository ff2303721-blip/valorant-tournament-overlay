/* ── BRB Overlay JS ──────────────────────────────────
   Connects to WebSocket and keeps series score & teams synced
────────────────────────────────────────────────────── */

let ws = null;

function applyState(state) {
  if (!state) return;

  // Tournament title & stage
  if (state.match) {
    const t = document.getElementById('brb-tournament-title');
    if (t && state.match.title) t.textContent = state.match.title;

    const s = document.getElementById('brb-stage-badge');
    if (s && state.match.stage) s.textContent = state.match.stage.toUpperCase();

    const m = document.getElementById('brb-map-name');
    if (m && state.match.mapName) m.textContent = state.match.mapName.toUpperCase();

    const ser = document.getElementById('brb-series-type');
    if (ser && state.match.seriesType) ser.textContent = state.match.seriesType.toUpperCase();
  }

  // Team 1 (A)
  if (state.teamA) {
    document.getElementById('brb-team1-tag').textContent = state.teamA.tag || 'T1';
    document.getElementById('brb-team1-name').textContent = state.teamA.name || 'TEAM 1';
    document.getElementById('brb-team1-score').textContent = state.teamA.score !== undefined ? state.teamA.score : 0;
    if (state.teamA.logo) {
      document.getElementById('brb-team1-logo').src = state.teamA.logo;
    }
  }

  // Team 2 (B)
  if (state.teamB) {
    document.getElementById('brb-team2-tag').textContent = state.teamB.tag || 'T2';
    document.getElementById('brb-team2-name').textContent = state.teamB.name || 'TEAM 2';
    document.getElementById('brb-team2-score').textContent = state.teamB.score !== undefined ? state.teamB.score : 0;
    if (state.teamB.logo) {
      document.getElementById('brb-team2-logo').src = state.teamB.logo;
    }
  }
}

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}`);

  ws.onmessage = ({ data }) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'INIT_STATE' || msg.type === 'STATE_UPDATE') {
        applyState(msg.state);
      }
    } catch (e) {
      console.error('[BRB] Parse error:', e);
    }
  };

  ws.onclose = () => setTimeout(connectWS, 1500);
  ws.onerror = () => ws.close();
}

function setupClock() {
  function tick() {
    const el = document.getElementById('brb-ist-clock');
    if (el) {
      const now = new Date();
      el.textContent = 'IST ' + now.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour12: true,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    }
  }
  tick();
  setInterval(tick, 1000);
}

// Initial fetch fallback
fetch('/api/state')
  .then(r => r.json())
  .then(data => applyState(data.state || data))
  .catch(() => {});

connectWS();
setupClock();
initAutoScale('.brb-root', { anchor: 'center' });

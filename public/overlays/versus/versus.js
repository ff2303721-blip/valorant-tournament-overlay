let ws = null;

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}`);

  ws.onmessage = ({ data }) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'INIT_STATE' || msg.type === 'STATE_UPDATE') render(msg.state);
    } catch (e) { console.error(e); }
  };

  ws.onclose = () => setTimeout(connectWS, 1000);
  ws.onerror = () => ws.close();
}

function set(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setLogo(id, src) {
  const el = document.getElementById(id);
  if (!el) return;
  if (src && src.trim() !== '') {
    el.src = src;
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

function render(s) {
  if (!s) return;

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('preview') || urlParams.has('dark')) {
    document.body.classList.add('preview-mode');
  }

  // Tournament header
  set('vs-title',  s.match.title || 'VALORANT CHAMPIONSHIP');
  set('vs-stage',  s.match.stage || 'GRAND FINALS');
  set('vs-map',    s.match.mapName || 'ASCENT');

  // Team A
  set('vs-tag-a',  s.teamA.tag  || 'NDL');
  set('vs-name-a', s.teamA.name || 'NAADAN LEGACY');
  set('vs-wins-a', s.teamA.mapWins ?? 0);
  set('vs-side-a', s.teamA.side === 'attack' ? 'ATTACKERS' : 'DEFENDERS');
  setLogo('vs-logo-a', s.teamA.logo);

  // Team B
  set('vs-tag-b',  s.teamB.tag  || 'ATX');
  set('vs-name-b', s.teamB.name || 'AETRIX');
  set('vs-wins-b', s.teamB.mapWins ?? 0);
  set('vs-side-b', s.teamB.side === 'attack' ? 'ATTACKERS' : 'DEFENDERS');
  setLogo('vs-logo-b', s.teamB.logo);

  // Side labels colour via border
  const sideA = document.getElementById('vs-side-a');
  const sideB = document.getElementById('vs-side-b');
  if (sideA) sideA.style.borderColor = s.teamA.side === 'attack' ? 'var(--red)' : 'var(--cyan)';
  if (sideB) sideB.style.borderColor = s.teamB.side === 'attack' ? 'var(--red)' : 'var(--cyan)';

  // Series pips
  const winsNeeded = s.match.seriesType === 'BO5' ? 3 : s.match.seriesType === 'BO1' ? 1 : 2;
  renderPips('pips-a', winsNeeded, s.teamA.mapWins);
  renderPips('pips-b', winsNeeded, s.teamB.mapWins);

  // Status
  const msg = s.match.statusBanner || 'MATCH WILL BEGIN SHORTLY';
  set('vs-status', msg);
}

function renderPips(containerId, total, wins) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const pip = document.createElement('div');
    pip.className = 'pip' + (i < wins ? ' won' : '');
    el.appendChild(pip);
  }
}

connectWS();
initAutoScale('.vs-root', { anchor: 'center' });

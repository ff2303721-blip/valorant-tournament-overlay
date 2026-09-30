let ws = null;

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}`);

  ws.onopen = () => console.log('[Scoreboard] Connected.');

  ws.onmessage = ({ data }) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'INIT_STATE' || msg.type === 'STATE_UPDATE') render(msg.state);
      if (msg.type === 'TIMEOUT_TICK') updateTimeoutBanner(msg.remaining);
    } catch (e) { console.error(e); }
  };

  ws.onclose = () => { console.warn('[Scoreboard] WS closed. Reconnecting…'); setTimeout(connectWS, 1000); };
  ws.onerror = () => ws.close();
}

// ── Track previous scores to trigger bump animation ──────
const prevScores = { a: -1, b: -1 };

function render(s) {
  if (!s) return;

  const hud = document.getElementById('hud');
  if (hud) {
    const isCompact = location.search.includes('compact') || s.compactHud;
    hud.classList.toggle('compact-hud', !!isCompact);
  }

  // Team A
  set('tag-a',  s.teamA.tag  || 'NDL');
  set('name-a', s.teamA.name || 'NAADAN LEGACY');
  setLogo('logo-a', s.teamA.logo);

  // Team B
  set('tag-b',  s.teamB.tag  || 'ATX');
  set('name-b', s.teamB.name || 'AETRIX');
  setLogo('logo-b', s.teamB.logo);

  // Scores with bump animation
  setScore('score-a', s.teamA.score, prevScores.a);
  setScore('score-b', s.teamB.score, prevScores.b);
  prevScores.a = s.teamA.score;
  prevScores.b = s.teamB.score;

  // Map info
  set('map-name', s.match.mapName  || 'ASCENT');
  const total = s.match.seriesType === 'BO5' ? 5 : s.match.seriesType === 'BO1' ? 1 : 3;
  set('map-num', `MAP ${s.match.currentMapIndex || 1} OF ${total}`);

  // Side classes & labels
  applySide('block-a', 'side-text-a', s.teamA.side);
  applySide('block-b', 'side-text-b', s.teamB.side);

  // Series pips
  const wins = s.match.seriesType === 'BO5' ? 3 : s.match.seriesType === 'BO1' ? 1 : 2;
  renderPips('pips-a', wins, s.teamA.mapWins);
  renderPips('pips-b', wins, s.teamB.mapWins);

  // Status banner
  let bannerMsg = '';
  if (s.timeout && s.timeout.active) {
    bannerMsg = `TIMEOUT — ${s.timeout.team || 'TACTICAL'} (${s.timeout.remaining}s)`;
  } else {
    bannerMsg = s.match.statusBanner || '';
  }
  showBanner(bannerMsg);
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

function setScore(id, newVal, oldVal) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = newVal;
  if (newVal !== oldVal && oldVal >= 0) {
    el.classList.remove('bump');
    void el.offsetWidth; // reflow
    el.classList.add('bump');
  }
}

function applySide(blockId, textId, side) {
  const block = document.getElementById(blockId);
  const textEl = document.getElementById(textId);
  if (!block || !textEl) return;
  block.classList.remove('attack', 'defense');
  block.classList.add(side);
  textEl.textContent = side === 'attack' ? 'ATK' : 'DEF';
}

function renderPips(containerId, totalNeeded, wins) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < totalNeeded; i++) {
    const pip = document.createElement('div');
    pip.className = 'pip' + (i < wins ? ' won' : '');
    container.appendChild(pip);
  }
}

function showBanner(text) {
  const banner = document.getElementById('status-banner');
  const textEl = document.getElementById('status-text');
  if (!banner || !textEl) return;
  if (text && text.trim() !== '') {
    textEl.textContent = text.toUpperCase();
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

function updateTimeoutBanner(remaining) {
  const textEl = document.getElementById('status-text');
  if (textEl && textEl.textContent.includes('TIMEOUT')) {
    textEl.textContent = textEl.textContent.replace(/\(\d+s\)/, `(${remaining}s)`);
  }
}

connectWS();
initAutoScale('.auto-stage', { anchor: 'top' });

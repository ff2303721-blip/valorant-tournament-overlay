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

  // Check 13-round victory reveal in main game screen
  checkInGameVictory(s);
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

  // Apply side underglow to score block
  const scoreBlockId = blockId === 'block-a' ? 'score-a-block' : 'score-b-block';
  const scoreBlock = document.getElementById(scoreBlockId);
  if (scoreBlock) {
    scoreBlock.classList.remove('side-attack', 'side-defense');
    scoreBlock.classList.add(side === 'attack' ? 'side-attack' : 'side-defense');
  }
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

// ── In-Game Victory Popup Trigger (When a team hits 13 rounds) ──
let confettiActive = false;

function checkInGameVictory(s) {
  const modal = document.getElementById('in-game-victory');
  const canvas = document.getElementById('victory-confetti');
  if (!modal || !s || !s.teamA || !s.teamB) return;

  const sA = parseInt(s.teamA.score, 10) || 0;
  const sB = parseInt(s.teamB.score, 10) || 0;
  const mW_A = parseInt(s.teamA.mapWins, 10) || 0;
  const mW_B = parseInt(s.teamB.mapWins, 10) || 0;
  const phase = (s.match && s.match.phase) || '';

  // Valorant rules: A team wins when they hit 13 (regulation) or >= 13 with at least 2-round lead (overtime)
  const teamAWon = (sA >= 13 && sA - sB >= 2) || (sA === 13 && sB < 12) || (mW_A > mW_B && phase === 'ended');
  const teamBWon = (sB >= 13 && sB - sA >= 2) || (sB === 13 && sA < 12) || (mW_B > mW_A && phase === 'ended');

  if (teamAWon || teamBWon) {
    const winner = teamAWon ? s.teamA : s.teamB;
    const scoreWin = teamAWon ? sA : sB;
    const scoreLose = teamAWon ? sB : sA;

    set('vic-tag', winner.tag || 'WIN');
    set('vic-name', winner.name || 'WINNER');
    set('vic-scores', `${scoreWin} — ${scoreLose}`);
    set('vic-map', `ON ${(s.match.mapName || 'ASCENT').toUpperCase()}`);
    setLogo('vic-logo', winner.logo);

    modal.classList.remove('hidden');
    if (canvas) {
      canvas.classList.remove('hidden');
      if (!confettiActive) startVictoryConfetti();
    }
  } else {
    modal.classList.add('hidden');
    if (canvas) canvas.classList.add('hidden');
    confettiActive = false;
  }
}

function startVictoryConfetti() {
  const canvas = document.getElementById('victory-confetti');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = 1920;
  canvas.height = 1080;
  confettiActive = true;

  const particles = [];
  const colors = ['#ffd56b', '#ff4655', '#00f0ff', '#ffffff', '#ffb800'];

  for (let i = 0; i < 90; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height,
      w: Math.random() * 8 + 4,
      h: Math.random() * 12 + 6,
      vx: (Math.random() - 0.5) * 3,
      vy: Math.random() * 3 + 2,
      rot: Math.random() * 360,
      vrot: (Math.random() - 0.5) * 6,
      color: colors[Math.floor(Math.random() * colors.length)]
    });
  }

  function frame() {
    if (!confettiActive) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();

      if (p.y > canvas.height) {
        p.y = -20;
        p.x = Math.random() * canvas.width;
      }
    });
    requestAnimationFrame(frame);
  }

  frame();
}

connectWS();
initAutoScale('.auto-stage', { anchor: 'top' });

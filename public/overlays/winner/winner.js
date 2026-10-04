/* ── Match Winner Ceremony JS ────────────────────────
   Calculates the winner dynamically based on mapWins / scores,
   renders victory fanfare and celebratory confetti.
────────────────────────────────────────────────────── */

let ws = null;
let fanfarePlayed = false;

// ── Confetti Particle System ─────────────────────────
function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  canvas.width = 1920;
  canvas.height = 1080;

  const particles = [];
  const colors = ['#ffd56b', '#ff3b4b', '#00e5ff', '#ffffff', '#e5b044'];

  for (let i = 0; i < 120; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height,
      w: Math.random() * 8 + 4,
      h: Math.random() * 12 + 6,
      vx: (Math.random() - 0.5) * 3,
      vy: Math.random() * 3 + 2,
      rot: Math.random() * 360,
      vrot: (Math.random() - 0.5) * 8,
      color: colors[Math.floor(Math.random() * colors.length)]
    });
  }

  function frame() {
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

function applyState(state) {
  if (!state) return;

  const tA = state.teamA || {};
  const tB = state.teamB || {};

  // Winner calculation: compare scores / mapWins
  let winner = tA;
  let loser  = tB;
  let scoreWin = tA.score || 0;
  let scoreLose = tB.score || 0;

  if ((tB.mapWins || 0) > (tA.mapWins || 0) || (tB.score || 0) > (tA.score || 0)) {
    winner = tB;
    loser = tA;
    scoreWin = tB.score || 0;
    scoreLose = tA.score || 0;
  }

  // Populate UI
  document.getElementById('winner-team-tag').textContent = winner.tag || 'WIN';
  document.getElementById('winner-team-name').textContent = winner.name || 'WINNING TEAM';
  if (winner.logo) {
    document.getElementById('winner-team-logo').src = winner.logo;
  }

  // Map / Match details
  if (state.match) {
    const curMap = state.match.mapName || 'MATCH';
    document.getElementById('winner-sub-badge').textContent = `${curMap.toUpperCase()} CONQUERED`;
    document.getElementById('winner-tournament-title').textContent = state.match.title || 'VALORANT TOURNAMENT';
    document.getElementById('winner-match-info').textContent = `${(state.match.stage || 'GROUP STAGE').toUpperCase()} · FINAL RESULT`;
  }

  // Final score pod
  document.getElementById('score-tag-a').textContent = winner.tag || 'T1';
  document.getElementById('score-num-a').textContent = scoreWin;
  document.getElementById('score-tag-b').textContent = loser.tag || 'T2';
  document.getElementById('score-num-b').textContent = scoreLose;

  // Play fanfare once
  if (!fanfarePlayed && window.sfx) {
    window.sfx.playVictoryFanfare();
    fanfarePlayed = true;
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
    } catch (e) {}
  };

  ws.onclose = () => setTimeout(connectWS, 1500);
  ws.onerror = () => ws.close();
}

function setupClock() {
  function tick() {
    const el = document.getElementById('winner-ist-clock');
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

// Bootstrap
fetch('/api/state')
  .then(r => r.json())
  .then(data => applyState(data.state || data))
  .catch(() => {});

connectWS();
setupClock();
launchConfetti();
initAutoScale('.winner-root', { anchor: 'center' });

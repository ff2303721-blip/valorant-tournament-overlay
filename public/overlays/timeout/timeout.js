/* ── Timeout Overlay JS ────────────────────────────────
   Connects to the server WebSocket and listens for:
     INIT_STATE / STATE_UPDATE  – initial full state
     TIMEOUT_TICK               – remaining seconds tick
   Triggers: START_TIMEOUT / STOP_TIMEOUT from admin
────────────────────────────────────────────────────── */

const CIRCUMFERENCE = 2 * Math.PI * 88; // ≈ 552.9

let ws = null;
let clockInterval = null;
let totalDuration  = 60;
let currentRemaining = 60;

// ── DOM refs ──────────────────────────────────────────
const root        = document.getElementById('to-root');
const teamTag     = document.getElementById('to-team-tag');
const teamName    = document.getElementById('to-team-name');
const teamLogo    = document.getElementById('to-team-logo');
const teamGlow    = document.getElementById('to-team-glow');
const matchLabel  = document.getElementById('to-match-label');
const timerNum    = document.getElementById('to-timer-num');
const ringProg    = document.getElementById('to-ring-progress');
const statusText  = document.getElementById('to-status-text');
const barClock    = document.getElementById('to-bar-clock');

// ── Helpers ───────────────────────────────────────────
function setRing(remaining, total) {
  const pct    = Math.max(0, Math.min(1, remaining / total));
  const offset = CIRCUMFERENCE * (1 - pct);
  ringProg.style.strokeDashoffset = offset;

  const urgent = remaining <= 10;
  ringProg.classList.toggle('urgent', urgent);
  timerNum.classList.toggle('urgent', urgent);
}

function applyTeam(tag, teams) {
  if (!tag || !teams) return;
  const t = teams.find(t => t.tag === tag || t.id === tag);

  teamTag.textContent  = tag;
  teamName.textContent = t ? t.name.toUpperCase() : tag;

  if (t && t.logo) {
    teamLogo.src = t.logo;
    teamLogo.style.display = 'block';
    // Color the glow to team color if available
    if (t.color) {
      teamGlow.style.background = `radial-gradient(circle, ${t.color}55 0%, transparent 70%)`;
    }
  } else {
    teamLogo.style.display = 'none';
  }
}

function applyState(state) {
  if (!state) return;

  // Match label
  if (state.match) {
    const m = state.match;
    const num   = state.currentFixture ? `MATCH ${state.currentFixture.matchNumber}` : 'MATCH';
    const stage = m.stage || 'GROUP STAGE';
    matchLabel.textContent = `${num} · ${stage.toUpperCase()}`;
  }

  if (!state.timeout) return;

  const to = state.timeout;
  totalDuration    = to.duration    || 60;
  currentRemaining = to.remaining   || totalDuration;

  // Populate team
  applyTeam(to.team, state.teamsList || [
    ...(state.teamA ? [state.teamA] : []),
    ...(state.teamB ? [state.teamB] : [])
  ]);

  // Timer display
  timerNum.textContent = currentRemaining;
  setRing(currentRemaining, totalDuration);
  statusText.textContent = to.active
    ? 'TACTICAL PAUSE IN PROGRESS'
    : 'TIMEOUT ENDED';
}

// ── WebSocket ─────────────────────────────────────────
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}`);

  ws.onopen = () => {
    console.log('[Timeout] WS connected');
  };

  ws.onmessage = ({ data }) => {
    try {
      const msg = JSON.parse(data);

      if (msg.type === 'INIT_STATE' || msg.type === 'STATE_UPDATE') {
        applyState(msg.state);
      }

      if (msg.type === 'TIMEOUT_TICK') {
        currentRemaining = msg.remaining;
        timerNum.textContent = currentRemaining;
        setRing(currentRemaining, totalDuration);

        if (currentRemaining <= 0) {
          statusText.textContent = 'TIMEOUT ENDED';
        }
      }
    } catch (e) {
      console.error('[Timeout] WS parse error:', e);
    }
  };

  ws.onclose = () => setTimeout(connectWS, 1500);
  ws.onerror = () => ws.close();
}

// ── Live IST Clock ────────────────────────────────────
function setupClock() {
  function tick() {
    const now = new Date();
    barClock.textContent = 'IST ' + now.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour12: true,
      hour:   '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
  tick();
  clockInterval = setInterval(tick, 1000);
}

// ── Fallback REST fetch ───────────────────────────────
async function fetchInitialState() {
  try {
    const res = await fetch('/api/state');
    if (res.ok) {
      const body = await res.json();
      applyState(body.state || body);
    }
  } catch (e) {
    console.warn('[Timeout] REST fetch failed:', e.message);
  }
}

// ── Bootstrap ─────────────────────────────────────────
fetchInitialState();
connectWS();
setupClock();
initAutoScale('.to-root', { anchor: 'center' });

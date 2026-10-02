let ws = null;
let currentTodayData = null;
let countdownInterval = null;
let clockInterval = null;

// Connect to backend WebSocket
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}`);

  ws.onopen = () => {
    // Request today's fixtures immediately
    ws.send(JSON.stringify({ type: 'GET_TODAY_FIXTURES' }));
  };

  ws.onmessage = ({ data }) => {
    try {
      const msg = JSON.parse(data);
      if (msg.todayFixtures) {
        currentTodayData = msg.todayFixtures;
        renderTodayFixtures(msg.todayFixtures);
      } else if (msg.type === 'TODAY_FIXTURES_UPDATE') {
        currentTodayData = msg.todayFixtures;
        renderTodayFixtures(msg.todayFixtures);
      } else if (msg.type === 'INIT_STATE' || msg.type === 'STATE_UPDATE') {
        // Also update tournament title if customized in state
        if (msg.state && msg.state.match && msg.state.match.title) {
          const tEl = document.getElementById('ss-tournament-title');
          if (tEl) tEl.textContent = msg.state.match.title;
        }
      }
    } catch (e) {
      console.error('[StartingSoon] Error parsing WS data:', e);
    }
  };

  ws.onclose = () => setTimeout(connectWS, 1500);
  ws.onerror = () => ws.close();
}

// Fallback REST fetch in case WebSocket is blocked or loading initially
async function fetchTodayFixtures() {
  try {
    const res = await fetch('/api/fixtures/today');
    if (res.ok) {
      const data = await res.json();
      currentTodayData = data;
      renderTodayFixtures(data);
    }
  } catch (e) {
    console.warn('[StartingSoon] REST fetch failed:', e.message);
  }
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

// Main render function for today's fixtures
function renderTodayFixtures(data) {
  if (!data || !data.matches || data.matches.length === 0) return;

  const activeMatch = data.activeMatch || data.matches[0];
  if (!activeMatch) return;

  // Header meta
  set('ss-match-num', `MATCH ${activeMatch.matchNumber}`);
  set('ss-stage', activeMatch.stage || 'GROUP STAGE');
  set('ss-date-label', data.isToday ? `TODAY (${data.dateString})` : `UPCOMING`);
  set('ss-map-name', (activeMatch.map || 'DECIDER').toUpperCase());

  // Team 1
  const t1 = activeMatch.team1 || {};
  set('team-1-tag', t1.tag || 'T1');
  set('team-1-name', t1.name || 'TEAM 1');
  setLogo('team-1-logo', t1.logo);

  const side1 = (activeMatch.side1 || 'defense').toUpperCase();
  set('team-1-side-text', side1 === 'ATTACK' ? 'ATTACKERS' : 'DEFENDERS');
  const sideEl1 = document.getElementById('team-1-side');
  if (sideEl1) {
    sideEl1.className = `team-side-tag ${side1 === 'ATTACK' ? 'side-atk' : 'side-def'}`;
  }

  // Team 2
  const t2 = activeMatch.team2 || {};
  set('team-2-tag', t2.tag || 'T2');
  set('team-2-name', t2.name || 'TEAM 2');
  setLogo('team-2-logo', t2.logo);

  const side2 = (activeMatch.side2 || 'attack').toUpperCase();
  set('team-2-side-text', side2 === 'ATTACK' ? 'ATTACKERS' : 'DEFENDERS');
  const sideEl2 = document.getElementById('team-2-side');
  if (sideEl2) {
    sideEl2.className = `team-side-tag ${side2 === 'ATTACK' ? 'side-atk' : 'side-def'}`;
  }

  // Scheduled time pill
  if (activeMatch.time) {
    set('ss-scheduled-time', activeMatch.time);
  }

  // Setup / update Countdown timer
  setupCountdown(activeMatch.startTimeMs);

  // Render today's schedule tray
  renderScheduleTray(data.matches, activeMatch.matchNumber, data.isToday);
}

// Render schedule strip at the bottom of the arena
function renderScheduleTray(matches, activeMatchNum, isToday) {
  const container = document.getElementById('tray-matches-list');
  const title = document.getElementById('tray-title');
  if (!container) return;

  if (title) {
    title.textContent = isToday ? "TODAY'S SCHEDULE" : "UPCOMING SCHEDULE";
  }

  container.innerHTML = '';
  matches.forEach(m => {
    const item = document.createElement('div');
    item.className = 'tray-match-item' + (m.matchNumber === activeMatchNum ? ' active' : '');

    const timeShort = m.time ? (m.time.match(/\d{1,2}:\d{2}\s*(?:AM|PM)/i) ? m.time.match(/\d{1,2}:\d{2}\s*(?:AM|PM)/i)[0] : '') : '';

    item.innerHTML = `
      <span class="tray-match-num">M${m.matchNumber}:</span>
      <span class="tray-team-name">${m.team1 ? m.team1.tag : 'T1'}</span>
      <span class="tray-vs-sep">VS</span>
      <span class="tray-team-name">${m.team2 ? m.team2.tag : 'T2'}</span>
      <span class="tray-match-time">(${m.map}${timeShort ? ' · ' + timeShort : ''})</span>
    `;

    // Click to preview/switch target match in overlay
    item.style.cursor = 'pointer';
    item.title = 'Click to view this matchup';
    item.onclick = () => {
      if (currentTodayData) {
        const copy = { ...currentTodayData, activeMatch: m };
        renderTodayFixtures(copy);
      }
    };

    container.appendChild(item);
  });
}

// Countdown timer to match start time
function setupCountdown(targetMs) {
  if (countdownInterval) clearInterval(countdownInterval);

  function update() {
    const now = Date.now();
    if (!targetMs) {
      set('cd-hours', '00');
      set('cd-mins', '00');
      set('cd-secs', '00');
      set('countdown-status-text', 'MATCH STARTING SOON');
      return;
    }

    const diff = targetMs - now;
    if (diff <= 0) {
      set('cd-hours', '00');
      set('cd-mins', '00');
      set('cd-secs', '00');
      set('countdown-status-text', 'MATCH STARTING NOW');
      return;
    }

    const totalSecs = Math.floor(diff / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;

    const pad = n => String(n).padStart(2, '0');
    set('cd-hours', pad(hours));
    set('cd-mins', pad(mins));
    set('cd-secs', pad(secs));
    set('countdown-status-text', 'MATCH STARTS IN');
  }

  update();
  countdownInterval = setInterval(update, 1000);
}

// Live IST clock in footer
function setupLiveClock() {
  function tick() {
    const el = document.getElementById('live-ist-clock');
    if (el) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour12: true,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      el.textContent = `IST ${timeStr}`;
    }
  }
  tick();
  clockInterval = setInterval(tick, 1000);
}

// Auto-refresh today's fixtures every 60 seconds to detect day change / new match
setInterval(() => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'GET_TODAY_FIXTURES' }));
  } else {
    fetchTodayFixtures();
  }
}, 60000);

// Initialize
fetchTodayFixtures();
connectWS();
setupLiveClock();
initAutoScale('.ss-root', { anchor: 'center' });

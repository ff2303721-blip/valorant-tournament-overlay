/**
 * Valorant Broadcast Leaderboard WebSocket Client
 */
let ws = null;
let currentData = null;

function connectWS() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[Leaderboard] Connected to Overlay Server.');
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'INIT_STATE' || data.type === 'STATE_UPDATE') {
        renderLeaderboard(data.state);
      }
    } catch (e) {
      console.error('[Leaderboard] Message parse error:', e);
    }
  };

  ws.onclose = () => {
    console.warn('[Leaderboard] WS Disconnected. Retrying in 2s...');
    setTimeout(connectWS, 2000);
  };
}

function renderLeaderboard(state) {
  if (!state) return;
  currentData = state;

  const container = document.getElementById('board-container');
  if (!container) return;

  const urlParams = new URLSearchParams(window.location.search);
  const isForcedAlways = urlParams.get('always') === '1' || urlParams.get('force') === '1';
  if (!state.leaderboardVisible && !isForcedAlways) {
    container.classList.add('hidden-board');
  } else {
    container.classList.remove('hidden-board');
  }

  if (urlParams.has('preview') || urlParams.has('dark')) {
    document.body.classList.add('preview-mode');
  }

  const sizeParam = urlParams.get('size');
  if (sizeParam === 'large' || sizeParam === 'full') {
    container.classList.add('size-large');
  } else if (sizeParam === 'compact') {
    container.classList.add('size-compact');
  }

  // Header info
  const stage = state.match.stage || 'GROUP STAGE';
  const title = state.match.title || 'VALORANT TOURNAMENT';
  document.getElementById('board-stage').textContent = `${stage} • OFFICIAL MATCH REPORT`;
  document.getElementById('board-title').textContent = `${title} LEADERBOARD`;
  document.getElementById('board-map').textContent = (state.match.mapName || 'ASCENT').toUpperCase();
  document.getElementById('board-series').textContent = `MAP ${state.match.currentMapIndex || 1} • ${state.match.seriesType || 'BO1'}`;

  // Header scores
  document.getElementById('hdr-tag-a').textContent = state.teamA.tag || 'TEAM A';
  document.getElementById('hdr-score-a').textContent = state.teamA.score ?? 0;
  document.getElementById('hdr-score-b').textContent = state.teamB.score ?? 0;
  document.getElementById('hdr-tag-b').textContent = state.teamB.tag || 'TEAM B';

  // Team A Column
  document.getElementById('team-a-name').textContent = state.teamA.name || 'TEAM A';
  document.getElementById('team-a-side').textContent = (state.teamA.side || 'ATTACK').toUpperCase() + 'ERS';
  document.getElementById('team-a-score').textContent = state.teamA.score ?? 0;
  if (state.teamA.logo) {
    document.getElementById('team-a-logo').src = state.teamA.logo;
  }

  // Team B Column
  document.getElementById('team-b-name').textContent = state.teamB.name || 'TEAM B';
  document.getElementById('team-b-side').textContent = (state.teamB.side || 'DEFENSE').toUpperCase() + 'ERS';
  document.getElementById('team-b-score').textContent = state.teamB.score ?? 0;
  if (state.teamB.logo) {
    document.getElementById('team-b-logo').src = state.teamB.logo;
  }

  // Render Rows
  renderTeamRows('team-a-rows', state.teamA.players || [], state.mvpPlayer);
  renderTeamRows('team-b-rows', state.teamB.players || [], state.mvpPlayer);

  // Footer MVP
  if (state.mvpPlayer && state.mvpPlayer.name) {
    document.getElementById('mvp-name-tag').textContent = `${state.mvpPlayer.name} (${state.mvpPlayer.teamTag || ''}) - ${state.mvpPlayer.kills || 0} KILLS`;
  }
}

function renderTeamRows(targetId, players, mvp) {
  const container = document.getElementById(targetId);
  if (!container) return;

  // Take top 5 players (or all active) and sort by kills descending
  const sorted = [...players].sort((a, b) => (b.kills || 0) - (a.kills || 0));

  container.innerHTML = sorted.map((p) => {
    const kills = p.kills || 0;
    const deaths = p.deaths || 0;
    const assists = p.assists || 0;
    const diff = kills - deaths;
    const diffText = diff > 0 ? `+${diff}` : `${diff}`;
    const diffClass = diff > 0 ? 'diff-positive' : (diff < 0 ? 'diff-negative' : 'diff-neutral');
    const isMvp = mvp && mvp.name === p.name;
    const acs = p.acs || Math.max(120, kills * 18 + assists * 6);
    const photo = p.photo || '/logos/naadan-legacy.png';

    return `
      <div class="player-row ${isMvp ? 'is-mvp-row' : ''}">
        <div class="cell-player">
          <img class="player-avatar" src="${photo}" alt="${p.name}" onerror="this.src='/logos/naadan-legacy.png'">
          <div class="player-meta">
            <span class="player-ign">${p.name || 'Player'}</span>
            <span class="player-role-badge">${isMvp ? '★ MATCH MVP' : (p.role === 'Captain' ? 'CAPTAIN' : 'STARTER')}</span>
          </div>
        </div>

        <div class="cell-agent">
          <span class="agent-tag">${p.agent || 'Jett'}</span>
        </div>

        <div class="cell-stat stat-kills">${kills}</div>
        <div class="cell-stat">${deaths}</div>
        <div class="cell-stat">${assists}</div>
        <div class="cell-stat stat-diff ${diffClass}">${diffText}</div>
        <div class="cell-stat stat-acs">${acs}</div>
      </div>
    `;
  }).join('');
}

// Initialize auto-scaling to prevent cropping on any OBS or window resolution
if (typeof initAutoScale === 'function') {
  initAutoScale('.auto-stage', { anchor: 'center' });
}

// Initial fetch & connect
fetch('/api/state')
  .then(res => res.json())
  .then(state => renderLeaderboard(state))
  .catch(err => console.warn('Could not fetch initial state:', err));

connectWS();
setInterval(() => {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    fetch('/api/state')
      .then(res => res.json())
      .then(state => renderLeaderboard(state))
      .catch(() => {});
  }
}, 3000);


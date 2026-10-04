let ws = null;
let currentState = null;

const wsStatusBadge = document.getElementById('ws-status');

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    wsStatusBadge.textContent = 'CONNECTED';
    wsStatusBadge.classList.remove('disconnected');
    console.log('[Admin] WebSocket Connected.');
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'INIT_STATE' || data.type === 'STATE_UPDATE') {
        currentState = data.state;
        syncUI(data.state);
      }
      if (data.type === 'TRACKER_STATUS') {
        updateTrackerUI(data.tracker);
      }
      if (data.type === 'MATCH_SYNC_SUCCESS') {
        const btn = document.getElementById('btn-import-match');
        if (btn) {
          btn.textContent = '✅ Synced!';
          btn.style.background = '#10e79e';
          btn.style.color = '#000';
          setTimeout(() => {
            btn.textContent = '⚡ Import Match Results';
            btn.style.background = '';
            btn.style.color = '';
            btn.disabled = false;
          }, 2500);
        }
      }
      if (data.type === 'MATCH_SYNC_ERROR') {
        const btn = document.getElementById('btn-import-match');
        if (btn) {
          btn.textContent = '❌ Failed';
          btn.disabled = false;
          setTimeout(() => { btn.textContent = '⚡ Import Match Results'; }, 2500);
        }
        alert('⚠️ Match Import Error: ' + data.error);
      }
      // Forward all WS messages to DOM so inline scripts can react
      document.dispatchEvent(new CustomEvent('ws-message', { detail: data }));
    } catch (e) {
      console.error('[Admin] Error parsing message:', e);
    }
  };

  ws.onclose = () => {
    wsStatusBadge.textContent = 'DISCONNECTED';
    wsStatusBadge.classList.add('disconnected');
    console.warn('[Admin] WS Disconnected. Reconnecting in 1s...');
    setTimeout(connectWebSocket, 1000);
  };
}

function sendAction(action, payload) {
  const msg = payload !== undefined ? { action, payload } : { action };
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  } else {
    // Only fallback to HTTP REST when WebSocket is not connected
    fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg)
    }).then(r => r.json()).then(res => {
      if (res && res.state) {
        currentState = res.state;
        syncUI(res.state);
      }
    }).catch(() => {});
  }
}

// Sync UI Elements from Server State
function syncUI(state) {
  if (!state) return;

  // Tournament Info
  document.getElementById('input-match-title').value = state.match.title || '';
  document.getElementById('input-match-stage').value = state.match.stage || '';
  document.getElementById('select-series-type').value = state.match.seriesType || 'BO3';
  const mapSel = document.getElementById('select-current-map');
  if (mapSel) {
    const targetMap = state.match.mapName || 'Ascent';
    let matchOpt = [...mapSel.options].find(o => o.value.toLowerCase() === targetMap.toLowerCase());
    if (!matchOpt) {
      const newOpt = document.createElement('option');
      newOpt.value = targetMap;
      newOpt.textContent = targetMap;
      mapSel.appendChild(newOpt);
      mapSel.value = targetMap;
    } else {
      mapSel.value = matchOpt.value;
    }
  }
  document.getElementById('input-map-index').value = state.match.currentMapIndex || 1;
  document.getElementById('input-status-banner').value = state.match.statusBanner || '';

  // Team A
  document.getElementById('input-team-a-tag').value = state.teamA.tag;
  document.getElementById('input-team-a-name').value = state.teamA.name;
  document.getElementById('display-score-a').textContent = state.teamA.score;
  document.getElementById('display-map-a').textContent = state.teamA.mapWins;

  const logoA = document.getElementById('logo-preview-a');
  if (logoA) logoA.src = state.teamA.logo || '/logos/naadan-legacy.png';

  const presetA = document.getElementById('select-preset-a');
  if (presetA) {
    const found = [...presetA.options].find(o => o.text.includes(state.teamA.tag));
    if (found) presetA.value = found.value;
  }

  const sideABadge = document.getElementById('badge-side-a');
  const boxA = document.getElementById('ctrl-team-a-wrap');
  if (state.teamA.side === 'attack') {
    sideABadge.textContent = 'ATTACK';
    sideABadge.className = 'team-side-pill attack-pill';
    boxA.className = 'team-ctrl-box team-a-box attack-side';
  } else {
    sideABadge.textContent = 'DEFENSE';
    sideABadge.className = 'team-side-pill defense-pill';
    boxA.className = 'team-ctrl-box team-a-box defense-side';
  }

  // Team B
  document.getElementById('input-team-b-tag').value = state.teamB.tag;
  document.getElementById('input-team-b-name').value = state.teamB.name;
  document.getElementById('display-score-b').textContent = state.teamB.score;
  document.getElementById('display-map-b').textContent = state.teamB.mapWins;

  const logoB = document.getElementById('logo-preview-b');
  if (logoB) logoB.src = state.teamB.logo || '/logos/aetrix.png';

  const presetB = document.getElementById('select-preset-b');
  if (presetB) {
    const found = [...presetB.options].find(o => o.text.includes(state.teamB.tag));
    if (found) presetB.value = found.value;
  }

  const sideBBadge = document.getElementById('badge-side-b');
  const boxB = document.getElementById('ctrl-team-b-wrap');
  if (state.teamB.side === 'attack') {
    sideBBadge.textContent = 'ATTACK';
    sideBBadge.className = 'team-side-pill attack-pill';
    boxB.className = 'team-ctrl-box team-b-box attack-side';
  } else {
    sideBBadge.textContent = 'DEFENSE';
    sideBBadge.className = 'team-side-pill defense-pill';
    boxB.className = 'team-ctrl-box team-b-box defense-side';
  }

  // Timeout controls — dynamically update dropdown from live team state
  const btnStartTimeout = document.getElementById('btn-start-timeout');
  if (state.timeout && state.timeout.active) {
    btnStartTimeout.textContent = `Active (${state.timeout.remaining}s)`;
    btnStartTimeout.disabled = true;
  } else {
    btnStartTimeout.textContent = 'Start 60s';
    btnStartTimeout.disabled = false;
  }

  // Rebuild timeout team dropdown dynamically from current state
  const timeoutSel = document.getElementById('select-timeout-team');
  if (timeoutSel) {
    const prevVal = timeoutSel.value;
    const tagA  = state.teamA.tag  || 'Team A';
    const nameA = state.teamA.name || 'Team A';
    const tagB  = state.teamB.tag  || 'Team B';
    const nameB = state.teamB.name || 'Team B';
    timeoutSel.innerHTML = `
      <option value="${tagA}">${nameA} (${tagA})</option>
      <option value="${tagB}">${nameB} (${tagB})</option>
      <option value="OFFICIAL">Official / Tech</option>
    `;
    // Restore previous selection if it still exists
    if ([...timeoutSel.options].some(o => o.value === prevVal)) {
      timeoutSel.value = prevVal;
    }
  }

  // Casters dynamic admin render
  renderCastersAdmin(state.casters || []);
  const btnToggleCasters = document.getElementById('btn-toggle-casters');
  if (btnToggleCasters) {
    if (state.castersVisible) {
      btnToggleCasters.textContent = 'HIDE';
      btnToggleCasters.className = 'btn btn-mini btn-danger';
    } else {
      btnToggleCasters.textContent = 'SHOW';
      btnToggleCasters.className = 'btn btn-mini btn-primary';
    }
  }

  // Render Player Rosters
  renderPlayerStatsRosters(state);

  // Render Veto Table (if present)
  renderVetoTable(state.veto || []);
}

const AGENTS_LIST = [
  'Jett', 'Reyna', 'Raze', 'Phoenix', 'Yoru', 'Neon', 'Iso',
  'Omen', 'Viper', 'Brimstone', 'Astra', 'Harbor', 'Clove',
  'Sova', 'Fade', 'Skye', 'Breach', 'KAY/O', 'Gekko',
  'Killjoy', 'Cypher', 'Sage', 'Chamber', 'Deadlock', 'Vyse'
];

function renderPlayerStatsRosters(state) {
  if (!state) return;

  // Update header badges
  const logoA = document.getElementById('roster-logo-a');
  if (logoA && state.teamA.logo) logoA.src = state.teamA.logo;
  const nameA = document.getElementById('roster-team-name-a');
  if (nameA) nameA.textContent = state.teamA.name || 'Team A';
  const tagA = document.getElementById('roster-tag-pill-a');
  if (tagA) tagA.textContent = state.teamA.tag || 'NDL';

  const logoB = document.getElementById('roster-logo-b');
  if (logoB && state.teamB.logo) logoB.src = state.teamB.logo;
  const nameB = document.getElementById('roster-team-name-b');
  if (nameB) nameB.textContent = state.teamB.name || 'Team B';
  const tagB = document.getElementById('roster-tag-pill-b');
  if (tagB) tagB.textContent = state.teamB.tag || 'ATX';

  // Toggle buttons
  const isLdVisible = !!state.leaderboardVisible;
  const isMvpVisible = !!state.mvpVisible;

  const btnLd = document.getElementById('btn-toggle-stream-leaderboard');
  if (btnLd) {
    btnLd.textContent = isLdVisible ? '📊 HIDE LEADERBOARD' : '📊 SHOW LEADERBOARD';
    btnLd.className = isLdVisible ? 'btn btn-danger btn-sm' : 'btn btn-secondary btn-sm';
  }
  const btnMvp = document.getElementById('btn-toggle-stream-mvp');
  if (btnMvp) {
    btnMvp.textContent = isMvpVisible ? '⭐ HIDE MVP CARD' : '⭐ SHOW MVP CARD';
    btnMvp.className = isMvpVisible ? 'btn btn-danger btn-sm' : 'btn btn-secondary btn-sm';
  }

  // Top navbar toggle buttons
  const navBtnLd = document.getElementById('btn-nav-toggle-leaderboard');
  if (navBtnLd) {
    navBtnLd.textContent = isLdVisible ? '📊 Leaderboard: ON' : '📊 Leaderboard: OFF';
    navBtnLd.className = isLdVisible ? 'btn btn-danger btn-mini' : 'btn btn-secondary btn-mini';
  }
  const navBtnMvp = document.getElementById('btn-nav-toggle-mvp');
  if (navBtnMvp) {
    navBtnMvp.textContent = isMvpVisible ? '⭐ MVP Card: ON' : '⭐ MVP Card: OFF';
    navBtnMvp.className = isMvpVisible ? 'btn btn-danger btn-mini' : 'btn btn-secondary btn-mini';
  }

  const selectMvpType = document.getElementById('select-mvp-type');
  if (selectMvpType && document.activeElement !== selectMvpType) {
    selectMvpType.value = state.mvpType || 'map';
  }

  // Populate rows
  renderTeamRosterList('admin-roster-a', 'teamA', state.teamA.players || [], state.mvpPlayer, state.teamA);
  renderTeamRosterList('admin-roster-b', 'teamB', state.teamB.players || [], state.mvpPlayer, state.teamB);
}

function renderTeamRosterList(containerId, teamKey, players, mvpPlayer, team) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const currentTag = team.tag || '';
  if (container.dataset.teamTag !== currentTag || container.children.length !== players.length) {
    container.dataset.teamTag = currentTag;
    container.innerHTML = players.map(p => {
      const isMvp = mvpPlayer && mvpPlayer.name === p.name;
      const photo = p.photo || '/logos/naadan-legacy.png';
      const agentOptions = AGENTS_LIST.map(ag => 
        `<option value="${ag}" ${ag.toLowerCase() === (p.agent || '').toLowerCase() ? 'selected' : ''}>${ag}</option>`
      ).join('');

      return `
        <div class="admin-player-row ${isMvp ? 'is-mvp-active' : ''}" data-player-id="${p.id}">
          <img src="${photo}" class="player-thumb-avatar" alt="${p.name}" onerror="this.src='/logos/naadan-legacy.png'">
          <div class="player-name-agent">
            <span class="player-label-ign" title="${p.name}">${p.name}</span>
            <select class="player-agent-select" data-team="${teamKey}" data-id="${p.id}">
              ${agentOptions}
            </select>
          </div>
          <div class="stat-spin-group">
            <button class="stat-spin-btn btn-dec-kill" data-team="${teamKey}" data-id="${p.id}">−</button>
            <input type="number" class="stat-input-num input-kills" data-team="${teamKey}" data-id="${p.id}" value="${p.kills || 0}" min="0">
            <button class="stat-spin-btn btn-inc-kill" data-team="${teamKey}" data-id="${p.id}">+</button>
          </div>
          <div class="stat-dual-inputs">
            <input type="number" class="stat-input-mini input-deaths" data-team="${teamKey}" data-id="${p.id}" placeholder="D" value="${p.deaths || 0}" min="0" title="Deaths">
            <input type="number" class="stat-input-mini input-assists" data-team="${teamKey}" data-id="${p.id}" placeholder="A" value="${p.assists || 0}" min="0" title="Assists">
          </div>
          <button class="btn-star-mvp ${isMvp ? 'active-star' : ''}" data-team="${teamKey}" data-id="${p.id}" title="Make Match MVP">
            ${isMvp ? '★ MVP' : '☆ MVP'}
          </button>
        </div>
      `;
    }).join('');
  } else {
    // Just sync values without disrupting focus
    players.forEach(p => {
      const row = container.querySelector(`[data-player-id="${p.id}"]`);
      if (!row) return;

      const isMvp = mvpPlayer && mvpPlayer.name === p.name;
      row.classList.toggle('is-mvp-active', isMvp);

      const starBtn = row.querySelector('.btn-star-mvp');
      if (starBtn) {
        starBtn.classList.toggle('active-star', isMvp);
        starBtn.textContent = isMvp ? '★ MVP' : '☆ MVP';
      }

      const kInp = row.querySelector('.input-kills');
      if (kInp && document.activeElement !== kInp) kInp.value = p.kills || 0;

      const dInp = row.querySelector('.input-deaths');
      if (dInp && document.activeElement !== dInp) dInp.value = p.deaths || 0;

      const aInp = row.querySelector('.input-assists');
      if (aInp && document.activeElement !== aInp) aInp.value = p.assists || 0;

      const agSel = row.querySelector('.player-agent-select');
      if (agSel && document.activeElement !== agSel) agSel.value = p.agent || 'Jett';
    });
  }
}

// Dynamic Casters Manager
let localCastersList = [];
let castersListInitialized = false;

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderCastersAdmin(casters) {
  const container = document.getElementById('casters-list-container');
  if (!container) return;

  const countBadge = document.getElementById('casters-count-badge');
  if (countBadge) countBadge.textContent = (casters || []).length;

  const isEditing = container.contains(document.activeElement);
  if (isEditing && castersListInitialized) return;

  localCastersList = JSON.parse(JSON.stringify(casters || []));
  castersListInitialized = true;

  if (localCastersList.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 12px 6px; color: var(--t3); font-size: 11px;">
        No casters added. Click <strong>➕ Add</strong> to add talent.
      </div>
    `;
    return;
  }

  container.innerHTML = localCastersList.map((c, i) => {
    const role = c.role || 'Play-by-Play';
    return `
      <div class="caster-entry-row" data-index="${i}">
        <div class="caster-row-header">
          <span class="caster-num-pill">TALENT #${i + 1}</span>
          <select class="caster-role-select">
            <option value="Play-by-Play" ${role === 'Play-by-Play' ? 'selected' : ''}>🎙️ Play-by-Play</option>
            <option value="Color Caster" ${role === 'Color Caster' ? 'selected' : ''}>🎙️ Color Caster</option>
            <option value="Desk Host" ${role === 'Desk Host' ? 'selected' : ''}>👑 Desk Host</option>
            <option value="Analyst" ${role === 'Analyst' ? 'selected' : ''}>🧠 Analyst</option>
            <option value="Observer" ${role === 'Observer' ? 'selected' : ''}>🎥 Observer</option>
            <option value="Talent" ${role === 'Talent' ? 'selected' : ''}>🎧 Talent</option>
          </select>
          <button type="button" class="btn-remove-caster" data-index="${i}" title="Remove Caster">✕</button>
        </div>
        <div class="dual-input mt-1">
          <input type="text" class="form-input caster-name-input" placeholder="Name (e.g. CRONUS)" value="${escapeHtml(c.name || '')}">
          <input type="text" class="form-input caster-handle-input" placeholder="@handle" value="${escapeHtml(c.handle || '')}">
        </div>
      </div>
    `;
  }).join('');
}

function collectCastersFromAdminUI() {
  const container = document.getElementById('casters-list-container');
  if (!container) return [];
  const rows = container.querySelectorAll('.caster-entry-row');
  const result = [];
  rows.forEach(row => {
    const roleSel = row.querySelector('.caster-role-select');
    const nameInp = row.querySelector('.caster-name-input');
    const handleInp = row.querySelector('.caster-handle-input');
    const name = nameInp ? nameInp.value.trim() : '';
    const handle = handleInp ? handleInp.value.trim() : '';
    const role = roleSel ? roleSel.value : 'Play-by-Play';
    if (name) {
      result.push({ name, handle, role });
    }
  });
  localCastersList = result;
  return result;
}

// Veto Table Generation
function renderVetoTable(vetoList) {
  const tbody = document.getElementById('veto-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  vetoList.forEach((item, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${item.map}</strong></td>
      <td>
        <select class="form-select veto-status-sel" data-index="${index}">
          <option value="PICK" ${item.status === 'PICK' ? 'selected' : ''}>PICK</option>
          <option value="BAN" ${item.status === 'BAN' ? 'selected' : ''}>BAN</option>
          <option value="DECIDER" ${item.status === 'DECIDER' ? 'selected' : ''}>DECIDER</option>
          <option value="PENDING" ${item.status === 'PENDING' ? 'selected' : ''}>PENDING</option>
        </select>
      </td>
      <td>
        <input type="text" class="form-input veto-team-inp" data-index="${index}" value="${item.team || ''}" placeholder="Team Tag (e.g. SEN)">
      </td>
      <td>
        <button class="btn btn-mini btn-secondary btn-quick-swap-status" data-index="${index}">Cycle</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Event Listeners Setup
document.addEventListener('DOMContentLoaded', () => {
  connectWebSocket();

  // Theme Switcher
  const themeSel = document.getElementById('select-ui-theme');
  const savedTheme = localStorage.getItem('val_theme') || 'champions';
  if (themeSel) {
    themeSel.value = savedTheme;
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeSel.addEventListener('change', (e) => {
      const t = e.target.value;
      document.documentElement.setAttribute('data-theme', t);
      localStorage.setItem('val_theme', t);
    });
  }

  // Density / Viewport Fit Switcher
  const densitySel = document.getElementById('select-ui-density');
  const savedDensity = localStorage.getItem('val_density') || 'normal';
  if (densitySel) {
    densitySel.value = savedDensity;
    document.documentElement.setAttribute('data-density', savedDensity);
    densitySel.addEventListener('change', (e) => {
      const d = e.target.value;
      document.documentElement.setAttribute('data-density', d);
      localStorage.setItem('val_density', d);
    });
  }

  // Copy OBS URL buttons
  document.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const relUrl = btn.getAttribute('data-url');
      if (!relUrl) return;
      const fullUrl = window.location.origin + relUrl;
      navigator.clipboard.writeText(fullUrl).then(() => {
        const origText = btn.textContent;
        btn.textContent = 'COPIED!';
        btn.style.background = '#10e79e';
        btn.style.color = '#000';
        setTimeout(() => {
          btn.textContent = origText;
          btn.style.background = '';
          btn.style.color = '';
        }, 1500);
      }).catch(() => {
        prompt('Copy this URL:', fullUrl);
      });
    });
  });

  // Round Score Buttons
  document.getElementById('btn-inc-score-a').addEventListener('click', () => sendAction('INC_ROUND_SCORE', { teamKey: 'teamA' }));
  document.getElementById('btn-dec-score-a').addEventListener('click', () => sendAction('DEC_ROUND_SCORE', { teamKey: 'teamA' }));
  document.getElementById('btn-inc-score-b').addEventListener('click', () => sendAction('INC_ROUND_SCORE', { teamKey: 'teamB' }));
  document.getElementById('btn-dec-score-b').addEventListener('click', () => sendAction('DEC_ROUND_SCORE', { teamKey: 'teamB' }));

  // Series Map Score Buttons
  document.getElementById('btn-inc-map-a').addEventListener('click', () => sendAction('INC_MAP_SCORE', { teamKey: 'teamA' }));
  document.getElementById('btn-dec-map-a').addEventListener('click', () => sendAction('DEC_MAP_SCORE', { teamKey: 'teamA' }));
  document.getElementById('btn-inc-map-b').addEventListener('click', () => sendAction('INC_MAP_SCORE', { teamKey: 'teamB' }));
  document.getElementById('btn-dec-map-b').addEventListener('click', () => sendAction('DEC_MAP_SCORE', { teamKey: 'teamB' }));

  // Side Swap Button
  document.getElementById('btn-quick-swap').addEventListener('click', () => sendAction('SWAP_SIDES'));

  // Reset Buttons
  document.getElementById('btn-reset-rounds').addEventListener('click', () => {
    if (confirm('Reset round scores to 0-0?')) sendAction('RESET_ROUNDS');
  });

  document.getElementById('btn-reset-all').addEventListener('click', () => {
    if (confirm('Reset entire match state to default settings?')) sendAction('RESET_MATCH');
  });

  // Series Format & Map Selectors
  document.getElementById('select-series-type').addEventListener('change', (e) => {
    sendAction('UPDATE_MATCH', { seriesType: e.target.value });
  });

  document.getElementById('select-current-map').addEventListener('change', (e) => {
    sendAction('UPDATE_MATCH', { mapName: e.target.value });
  });

  document.getElementById('input-map-index').addEventListener('change', (e) => {
    sendAction('UPDATE_MATCH', { currentMapIndex: parseInt(e.target.value) || 1 });
  });

  // Team Preset Selectors
  const PRESET_MAP = {
    'naadan-legacy': { name: 'NAADAN LEGACY', tag: 'NDL', logo: '/logos/naadan-legacy.png' },
    'aetrix': { name: 'AETRIX', tag: 'ATX', logo: '/logos/aetrix.png' },
    'bitter-blade-z': { name: 'BITTER BLADE Z', tag: 'BBZ', logo: '/logos/bitter-blade-z.png' },
    'veyron': { name: 'VEYRON', tag: 'VRN', logo: '/logos/veyron.png' }
  };

  ['a', 'b'].forEach((k) => {
    const teamKey = k === 'a' ? 'teamA' : 'teamB';
    const presetEl = document.getElementById(`select-preset-${k}`);
    if (presetEl) {
      presetEl.addEventListener('change', (e) => {
        const selected = PRESET_MAP[e.target.value];
        if (selected) {
          document.getElementById(`input-team-${k}-tag`).value = selected.tag;
          document.getElementById(`input-team-${k}-name`).value = selected.name;
          const logoEl = document.getElementById(`logo-preview-${k}`);
          if (logoEl) logoEl.src = selected.logo;
          sendAction('UPDATE_TEAM', { teamKey, updates: selected });
        }
      });
    }

    document.getElementById(`input-team-${k}-tag`).addEventListener('change', (e) => {
      sendAction('UPDATE_TEAM', { teamKey, updates: { tag: e.target.value.toUpperCase() } });
    });
    document.getElementById(`input-team-${k}-name`).addEventListener('change', (e) => {
      sendAction('UPDATE_TEAM', { teamKey, updates: { name: e.target.value } });
    });
  });

  // Scheduled Match Fixture Loader
  const fixtureSelect = document.getElementById('select-tournament-fixture');
  const btnLoadFixture = document.getElementById('btn-load-fixture');
  function doLoadFixture() {
    const matchNum = fixtureSelect ? fixtureSelect.value : '';
    if (matchNum) {
      sendAction('LOAD_FIXTURE', { matchNumber: parseInt(matchNum) });
    }
  }
  if (fixtureSelect) fixtureSelect.addEventListener('change', doLoadFixture);
  if (btnLoadFixture) btnLoadFixture.addEventListener('click', doLoadFixture);

  // Status Banner
  document.getElementById('btn-set-banner').addEventListener('click', () => {
    const val = document.getElementById('input-status-banner').value;
    sendAction('UPDATE_MATCH', { statusBanner: val });
  });

  document.getElementById('btn-clear-banner').addEventListener('click', () => {
    document.getElementById('input-status-banner').value = '';
    sendAction('UPDATE_MATCH', { statusBanner: '' });
  });

  // Preset Pills
  document.querySelectorAll('.pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const banner = btn.getAttribute('data-banner');
      document.getElementById('input-status-banner').value = banner;
      sendAction('UPDATE_MATCH', { statusBanner: banner });
    });
  });

  // Tactical Timeout
  document.getElementById('btn-start-timeout').addEventListener('click', () => {
    const team = document.getElementById('select-timeout-team').value;
    sendAction('START_TIMEOUT', { team });
  });

  document.getElementById('btn-stop-timeout').addEventListener('click', () => {
    sendAction('STOP_TIMEOUT');
  });

  // Tournament Info Update
  document.getElementById('btn-save-meta').addEventListener('click', () => {
    const title = document.getElementById('input-match-title').value;
    const stage = document.getElementById('input-match-stage').value;
    sendAction('UPDATE_MATCH', { title, stage });
  });

  // Dynamic Casters Event Listeners
  const btnToggleCasters = document.getElementById('btn-toggle-casters');
  if (btnToggleCasters) {
    btnToggleCasters.addEventListener('click', () => {
      const currentCasters = collectCastersFromAdminUI();
      if (currentCasters && currentCasters.length > 0) {
        sendAction('UPDATE_CASTERS', currentCasters);
      }
      const target = currentState ? !currentState.castersVisible : true;
      sendAction('TOGGLE_CASTERS', target);
    });
  }

  const btnAddCaster = document.getElementById('btn-add-caster');
  if (btnAddCaster) {
    btnAddCaster.addEventListener('click', () => {
      collectCastersFromAdminUI();
      localCastersList.push({
        name: '',
        handle: '',
        role: localCastersList.length === 0 ? 'Play-by-Play' : (localCastersList.length === 1 ? 'Color Caster' : 'Analyst')
      });
      castersListInitialized = false;
      renderCastersAdmin(localCastersList);
      const container = document.getElementById('casters-list-container');
      const inputs = container.querySelectorAll('.caster-name-input');
      if (inputs.length > 0) inputs[inputs.length - 1].focus();
    });
  }

  const castersListContainer = document.getElementById('casters-list-container');
  if (castersListContainer) {
    castersListContainer.addEventListener('input', () => {
      collectCastersFromAdminUI();
    });
    castersListContainer.addEventListener('change', () => {
      collectCastersFromAdminUI();
    });
    castersListContainer.addEventListener('click', (e) => {
      const btnRemove = e.target.closest('.btn-remove-caster');
      if (btnRemove) {
        const idx = parseInt(btnRemove.dataset.index, 10);
        collectCastersFromAdminUI();
        if (!isNaN(idx) && idx >= 0 && idx < localCastersList.length) {
          localCastersList.splice(idx, 1);
          castersListInitialized = false;
          renderCastersAdmin(localCastersList);
          sendAction('UPDATE_CASTERS', localCastersList);
        }
      }
    });
  }

  const btnSaveCasters = document.getElementById('btn-save-casters');
  if (btnSaveCasters) {
    btnSaveCasters.addEventListener('click', () => {
      const casters = collectCastersFromAdminUI();
      sendAction('UPDATE_CASTERS', casters);
      const origText = btnSaveCasters.textContent;
      btnSaveCasters.textContent = '✓ Saved';
      btnSaveCasters.style.background = '#10e79e';
      btnSaveCasters.style.color = '#000';
      setTimeout(() => {
        btnSaveCasters.textContent = origText;
        btnSaveCasters.style.background = '';
        btnSaveCasters.style.color = '';
      }, 1200);
    });
  }

  document.querySelectorAll('.casters-quick-presets .btn-preset-mini').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      let newCasters = [];
      if (preset === 'official') {
        newCasters = [
          { name: 'SRB TROLLERS', handle: '@srbtrollersyt', role: 'Play-by-Play' },
          { name: 'SHEIKH KUNJAPPU', handle: '@sheikh_kunjappu', role: 'Color Caster' }
        ];
      } else if (preset === 'duo') {
        newCasters = [
          { name: 'CRONUS', handle: '@cronusval', role: 'Play-by-Play' },
          { name: 'VORTEX', handle: '@vortex_val', role: 'Color Caster' }
        ];
      } else if (preset === 'trio') {
        newCasters = [
          { name: 'APEX', handle: '@apex_desk', role: 'Desk Host' },
          { name: 'CRONUS', handle: '@cronusval', role: 'Play-by-Play' },
          { name: 'VORTEX', handle: '@vortex_val', role: 'Color Caster' }
        ];
      } else if (preset === 'solo') {
        newCasters = [
          { name: 'CRONUS', handle: '@cronusval', role: 'Play-by-Play' }
        ];
      }
      localCastersList = newCasters;
      castersListInitialized = false;
      renderCastersAdmin(newCasters);
      sendAction('UPDATE_CASTERS', newCasters);
    });
  });

  // Save Veto Table Changes (if present)
  const btnSaveVeto = document.getElementById('btn-save-veto');
  if (btnSaveVeto) {
    btnSaveVeto.addEventListener('click', () => {
      if (!currentState) return;
      const newVeto = [...currentState.veto];
      document.querySelectorAll('.veto-status-sel').forEach(sel => {
        const idx = parseInt(sel.getAttribute('data-index'));
        newVeto[idx].status = sel.value;
      });
      document.querySelectorAll('.veto-team-inp').forEach(inp => {
        const idx = parseInt(inp.getAttribute('data-index'));
        newVeto[idx].team = inp.value.toUpperCase();
      });
      sendAction('UPDATE_VETO', newVeto);
    });
  }

  // Live Game Auto-Sync (OCR) Controls
  const btnToggleTracker = document.getElementById('btn-toggle-tracker');
  const trackerBadge = document.getElementById('tracker-status-badge');
  const readoutScoreA = document.getElementById('readout-score-a');
  const readoutScoreB = document.getElementById('readout-score-b');
  const readoutTagA = document.getElementById('readout-tag-a');
  const readoutTagB = document.getElementById('readout-tag-b');
  const readoutLastChecked = document.getElementById('readout-last-checked');
  let isTrackerRunning = false;

  function updateTrackerUI(status) {
    if (!status) return;
    isTrackerRunning = !!status.running;

    if (trackerBadge) {
      trackerBadge.textContent = isTrackerRunning ? 'RUNNING' : 'OFFLINE';
      trackerBadge.className = 'tracker-badge ' + (isTrackerRunning ? 'running' : 'offline');
    }
    if (btnToggleTracker) {
      btnToggleTracker.textContent = isTrackerRunning ? '⏹ STOP AUTO-SYNC' : '▶ START AUTO-SYNC';
      btnToggleTracker.className = 'btn w-100 mt-2 ' + (isTrackerRunning ? 'btn-danger' : 'btn-primary');
    }
    if (readoutScoreA) readoutScoreA.textContent = status.scoreA ?? 0;
    if (readoutScoreB) readoutScoreB.textContent = status.scoreB ?? 0;
    if (readoutTagA && currentState && currentState.teamA) readoutTagA.textContent = currentState.teamA.tag;
    if (readoutTagB && currentState && currentState.teamB) readoutTagB.textContent = currentState.teamB.tag;

    if (readoutLastChecked) {
      if (isTrackerRunning && status.lastChecked) {
        const timeStr = new Date(status.lastChecked).toLocaleTimeString();
        readoutLastChecked.textContent = `Last scanned: ${timeStr} · ${status.detectedText || 'Scanning HUD…'}`;
      } else if (!isTrackerRunning) {
        readoutLastChecked.textContent = 'Ready to monitor';
      }
    }
  }

  window.updateTrackerUI = updateTrackerUI;

  if (btnToggleTracker) {
    btnToggleTracker.addEventListener('click', () => {
      sendAction(isTrackerRunning ? 'STOP_TRACKER' : 'START_TRACKER');
    });
  }

  // Periodic polling for tracker status
  setInterval(() => {
    fetch('/api/tracker/status')
      .then(res => res.json())
      .then(updateTrackerUI)
      .catch(() => {});
  }, 2500);

  // Player Stats & Leaderboard actions
  const btnToggleStreamLd = document.getElementById('btn-toggle-stream-leaderboard');
  if (btnToggleStreamLd) {
    btnToggleStreamLd.addEventListener('click', () => {
      const target = currentState ? !currentState.leaderboardVisible : true;
      sendAction('TOGGLE_LEADERBOARD', target);
    });
  }

  const btnNavToggleLd = document.getElementById('btn-nav-toggle-leaderboard');
  if (btnNavToggleLd) {
    btnNavToggleLd.addEventListener('click', () => {
      const target = currentState ? !currentState.leaderboardVisible : true;
      sendAction('TOGGLE_LEADERBOARD', target);
    });
  }

  const btnToggleStreamMvp = document.getElementById('btn-toggle-stream-mvp');
  if (btnToggleStreamMvp) {
    btnToggleStreamMvp.addEventListener('click', () => {
      const target = currentState ? !currentState.mvpVisible : true;
      sendAction('TOGGLE_MVP', target);
    });
  }

  const btnNavToggleMvp = document.getElementById('btn-nav-toggle-mvp');
  if (btnNavToggleMvp) {
    btnNavToggleMvp.addEventListener('click', () => {
      const target = currentState ? !currentState.mvpVisible : true;
      sendAction('TOGGLE_MVP', target);
    });
  }

  const selectMvpTypeEl = document.getElementById('select-mvp-type');
  if (selectMvpTypeEl) {
    selectMvpTypeEl.addEventListener('change', (e) => {
      sendAction('SET_MVP_TYPE', e.target.value);
    });
  }

  const btnImportMatch = document.getElementById('btn-import-match');
  if (btnImportMatch) {
    btnImportMatch.addEventListener('click', () => {
      btnImportMatch.textContent = '⏳ Fetching Results...';
      btnImportMatch.disabled = true;

      const fixSel = document.getElementById('select-tournament-fixture');
      const selectedFix = fixSel && fixSel.value ? parseInt(fixSel.value, 10) : (currentState && currentState.match ? currentState.match.fixtureMatchNumber : null);

      sendAction('SYNC_POST_MATCH', { matchNumber: selectedFix, fixtureMatchNumber: selectedFix });
      setTimeout(() => {
        if (btnImportMatch.textContent === '⏳ Fetching Results...') {
          btnImportMatch.textContent = '⚡ Import Match Results';
          btnImportMatch.disabled = false;
        }
      }, 5000);
    });
  }

  const btnResetPlayerStats = document.getElementById('btn-reset-player-stats');
  if (btnResetPlayerStats) {
    btnResetPlayerStats.addEventListener('click', () => {
      if (confirm('Reset all player kills, deaths and assists to 0?')) {
        sendAction('RESET_PLAYER_STATS');
      }
    });
  }

  // Delegated events for player rows
  function handleRosterInteraction(e) {
    const target = e.target;
    const teamKey = target.dataset.team;
    const playerId = target.dataset.id;
    if (!teamKey || !playerId) return;

    if (target.classList.contains('btn-inc-kill')) {
      const row = target.closest('.admin-player-row');
      const inp = row.querySelector('.input-kills');
      const val = (parseInt(inp.value, 10) || 0) + 1;
      inp.value = val;
      sendAction('UPDATE_PLAYER_STAT', { teamKey, playerId, updates: { kills: val } });
    } else if (target.classList.contains('btn-dec-kill')) {
      const row = target.closest('.admin-player-row');
      const inp = row.querySelector('.input-kills');
      const val = Math.max(0, (parseInt(inp.value, 10) || 0) - 1);
      inp.value = val;
      sendAction('UPDATE_PLAYER_STAT', { teamKey, playerId, updates: { kills: val } });
    } else if (target.classList.contains('btn-star-mvp')) {
      const team = currentState[teamKey];
      const player = team && team.players ? team.players.find(p => p.id === playerId) : null;
      if (player) {
        sendAction('SET_MVP', {
          name: player.name,
          teamTag: team.tag,
          teamName: team.name,
          role: player.role || 'Player',
          agent: player.agent || 'Jett',
          photo: player.photo,
          logo: team.logo,
          kills: player.kills || 0,
          deaths: player.deaths || 0,
          assists: player.assists || 0,
          acs: (player.acs !== undefined && player.acs !== null) ? player.acs : Math.max(150, (player.kills || 0) * 18 + (player.assists || 0) * 6),
          adr: player.adr,
          hs: player.hs
        });
      }
    }
  }

  function handleRosterChange(e) {
    const target = e.target;
    const teamKey = target.dataset.team;
    const playerId = target.dataset.id;
    if (!teamKey || !playerId) return;

    if (target.classList.contains('input-kills')) {
      const val = Math.max(0, parseInt(target.value, 10) || 0);
      sendAction('UPDATE_PLAYER_STAT', { teamKey, playerId, updates: { kills: val } });
    } else if (target.classList.contains('input-deaths')) {
      const val = Math.max(0, parseInt(target.value, 10) || 0);
      sendAction('UPDATE_PLAYER_STAT', { teamKey, playerId, updates: { deaths: val } });
    } else if (target.classList.contains('input-assists')) {
      const val = Math.max(0, parseInt(target.value, 10) || 0);
      sendAction('UPDATE_PLAYER_STAT', { teamKey, playerId, updates: { assists: val } });
    } else if (target.classList.contains('player-agent-select')) {
      sendAction('UPDATE_PLAYER_STAT', { teamKey, playerId, updates: { agent: target.value } });
    }
  }

  const rosterA = document.getElementById('admin-roster-a');
  const rosterB = document.getElementById('admin-roster-b');
  if (rosterA) {
    rosterA.addEventListener('click', handleRosterInteraction);
    rosterA.addEventListener('change', handleRosterChange);
  }
  if (rosterB) {
    rosterB.addEventListener('click', handleRosterInteraction);
    rosterB.addEventListener('change', handleRosterChange);
  }

  // Global Keyboard Shortcuts (hotkeys)
  function flashElement(el) {
    if (!el) return;
    el.style.transform = 'scale(0.92)';
    el.style.filter = 'brightness(1.5)';
    setTimeout(() => {
      el.style.transform = '';
      el.style.filter = '';
    }, 150);
  }

  window.addEventListener('keydown', (e) => {
    // If typing inside an input or select, skip hotkeys
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;

    const isKey1 = e.code === 'Digit1' || e.code === 'Numpad1' || e.key === '1' || e.key === '!';
    const isKey2 = e.code === 'Digit2' || e.code === 'Numpad2' || e.key === '2' || e.key === '@';

    if (isKey1) {
      e.preventDefault();
      if (e.shiftKey || e.key === '!') {
        flashElement(document.getElementById('btn-dec-score-a'));
        sendAction('DEC_ROUND_SCORE', { teamKey: 'teamA' });
      } else {
        flashElement(document.getElementById('btn-inc-score-a'));
        sendAction('INC_ROUND_SCORE', { teamKey: 'teamA' });
      }
    } else if (isKey2) {
      e.preventDefault();
      if (e.shiftKey || e.key === '@') {
        flashElement(document.getElementById('btn-dec-score-b'));
        sendAction('DEC_ROUND_SCORE', { teamKey: 'teamB' });
      } else {
        flashElement(document.getElementById('btn-inc-score-b'));
        sendAction('INC_ROUND_SCORE', { teamKey: 'teamB' });
      }
    } else if (e.key === 'q' || e.key === 'Q') {
      // Dedicated single-key minus for Team A (key directly under '1')
      e.preventDefault();
      flashElement(document.getElementById('btn-dec-score-a'));
      sendAction('DEC_ROUND_SCORE', { teamKey: 'teamA' });
    } else if (e.key === 'w' || e.key === 'W') {
      // Dedicated single-key minus for Team B (key directly under '2')
      e.preventDefault();
      flashElement(document.getElementById('btn-dec-score-b'));
      sendAction('DEC_ROUND_SCORE', { teamKey: 'teamB' });
    } else if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      flashElement(document.getElementById('btn-quick-swap'));
      sendAction('SWAP_SIDES');
    } else if (e.key === 't' || e.key === 'T') {
      e.preventDefault();
      flashElement(document.getElementById('btn-start-timeout'));
      const team = document.getElementById('select-timeout-team').value;
      sendAction('START_TIMEOUT', { team });
    }
  });
});

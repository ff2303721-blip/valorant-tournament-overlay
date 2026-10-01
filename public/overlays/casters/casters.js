/**
 * Valorant Broadcast Talent & Casters Overlay
 */
let ws = null;

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'INIT_STATE' || data.type === 'STATE_UPDATE') {
        renderCasters(data.state);
      }
    } catch (e) {
      console.error('[Casters Overlay] Error parsing message:', e);
    }
  };

  ws.onclose = () => {
    setTimeout(connectWebSocket, 1500);
  };
}

const ICONS = {
  mic: `<svg class="role-icon-svg" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>`,
  crown: `<svg class="role-icon-svg" viewBox="0 0 24 24"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .55-.45 1-1 1H6c-.55 0-1-.45-1-1v-1h14v1z"/></svg>`,
  chart: `<svg class="role-icon-svg" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg>`,
  camera: `<svg class="role-icon-svg" viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`,
  headset: `<svg class="role-icon-svg" viewBox="0 0 24 24"><path d="M12 1a9 9 0 0 0-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2a7 7 0 0 1 14 0v2h-4v8h3c1.66 0 3-1.34 3-3v-7a9 9 0 0 0-9-9z"/></svg>`,
  twitter: `<svg class="handle-icon" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`
};

function getRoleMeta(roleRaw) {
  const role = (roleRaw || 'Caster').trim();
  const lower = role.toLowerCase();

  if (lower.includes('play') || lower.includes('pbp')) {
    return { cls: 'role-pbp', label: role.toUpperCase(), icon: ICONS.mic };
  }
  if (lower.includes('color') || lower.includes('comment')) {
    return { cls: 'role-color', label: role.toUpperCase(), icon: ICONS.mic };
  }
  if (lower.includes('host')) {
    return { cls: 'role-host', label: role.toUpperCase(), icon: ICONS.crown };
  }
  if (lower.includes('analyst') || lower.includes('desk')) {
    return { cls: 'role-analyst', label: role.toUpperCase(), icon: ICONS.chart };
  }
  if (lower.includes('observe') || lower.includes('cam')) {
    return { cls: 'role-observer', label: role.toUpperCase(), icon: ICONS.camera };
  }
  return { cls: 'role-general', label: role.toUpperCase(), icon: ICONS.headset };
}

function renderCasters(state) {
  if (!state) return;

  const container = document.getElementById('casters-container');
  const cardsWrap = document.getElementById('casters-cards-wrap');
  if (!container || !cardsWrap) return;

  const urlParams = new URLSearchParams(window.location.search);

  // Preview or dark background mode
  if (urlParams.has('preview') || urlParams.has('dark')) {
    document.body.classList.add('preview-mode');
  }

  // Positioning
  const pos = urlParams.get('pos');
  container.classList.remove('pos-center', 'pos-right');
  if (pos === 'center') container.classList.add('pos-center');
  if (pos === 'right') container.classList.add('pos-right');

  // Strict visibility control
  const isForcedAlways = urlParams.get('always') === '1' || urlParams.get('force') === '1';
  if (!state.castersVisible && !isForcedAlways) {
    container.classList.add('hidden');
  } else {
    container.classList.remove('hidden');
  }

  // Desk title
  const deskTitleEl = document.getElementById('desk-title');
  if (deskTitleEl) {
    const customTitle = urlParams.get('title');
    if (customTitle) {
      deskTitleEl.textContent = customTitle.toUpperCase();
    } else if (state.match && state.match.stage) {
      deskTitleEl.textContent = `${state.match.stage} • TALENT`.toUpperCase();
    } else {
      deskTitleEl.textContent = 'BROADCAST TALENT';
    }
  }

  // Render cards
  const casters = (state.casters || []).filter(c => c && c.name && c.name.trim().length > 0);
  cardsWrap.innerHTML = '';

  // Density classes
  container.classList.remove('count-1', 'count-2', 'count-3', 'count-4', 'count-5');
  if (casters.length === 1) container.classList.add('count-1');
  else if (casters.length === 2) container.classList.add('count-2');
  else if (casters.length === 3) container.classList.add('count-3');
  else if (casters.length === 4) container.classList.add('count-4');
  else if (casters.length >= 5) container.classList.add('count-5');

  casters.forEach((caster, idx) => {
    const meta = getRoleMeta(caster.role);
    const name = caster.name.trim();
    const handle = (caster.handle || '').trim();

    const card = document.createElement('div');
    card.className = `caster-card ${meta.cls}`;

    let avatarHtml = '';
    if (caster.photo) {
      avatarHtml = `<img src="${caster.photo}" class="caster-avatar-img" alt="${name}" onerror="this.style.display='none'">`;
    } else {
      avatarHtml = `<div class="caster-avatar-icon">${meta.icon}</div>`;
    }

    const handleHtml = handle ? `
      <div class="caster-handle-row">
        ${ICONS.twitter}
        <span class="caster-handle">${handle.startsWith('@') ? handle : '@' + handle}</span>
      </div>
    ` : '';

    card.innerHTML = `
      <div class="caster-top-row">
        <div class="role-badge">
          ${meta.icon}
          <span>${meta.label}</span>
        </div>
        <span class="card-index-tag">0${idx + 1}</span>
      </div>
      <div class="caster-body">
        <div class="caster-avatar-box">
          ${avatarHtml}
        </div>
        <div class="caster-info">
          <div class="caster-name">${name}</div>
          ${handleHtml}
        </div>
      </div>
    `;

    cardsWrap.appendChild(card);
  });
}

connectWebSocket();
fetch('/api/state').then(r => r.json()).then(renderCasters).catch(() => {});
initAutoScale('.auto-stage', { anchor: 'bottom' });

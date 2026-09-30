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
    setTimeout(connectWebSocket, 1000);
  };
}

function renderCasters(state) {
  if (!state) return;

  const wrap = document.getElementById('casters-wrap');
  wrap.innerHTML = '';

  const casters = state.casters || [];
  casters.forEach((caster) => {
    if (!caster.name) return;

    const card = document.createElement('div');
    card.className = 'caster-card';
    card.innerHTML = `
      <div class="caster-badge">TALENT</div>
      <div class="caster-content">
        <div class="caster-name">${caster.name}</div>
        <div class="caster-meta">
          <span class="caster-role">${caster.role || 'CASTER'}</span>
          <span class="caster-handle">${caster.handle || ''}</span>
        </div>
      </div>
    `;
    wrap.appendChild(card);
  });

  if (state.castersVisible) {
    wrap.classList.remove('hidden');
  } else {
    wrap.classList.add('hidden');
  }
}

connectWebSocket();
initAutoScale('.auto-stage', { anchor: 'bottom' });

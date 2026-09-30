/**
 * Auto-scale helper for OBS Browser Sources.
 * Designed for standard 1920x1080 esports canvas.
 * Scales and centers the canvas cleanly into whatever resolution the OBS browser source is set to.
 */
function initAutoScale(targetSelector = '.auto-stage, .vs-root, #hud', options = {}) {
  const { anchor = 'center' } = options;

  function applyScale() {
    const el = document.querySelector(targetSelector);
    if (!el) return;

    // Viewport dimensions
    const vw = window.innerWidth || document.documentElement.clientWidth || 1920;
    const vh = window.innerHeight || document.documentElement.clientHeight || 1080;

    const baseW = 1920;
    const baseH = 1080;

    // Calculate uniform scale factor to fit cleanly within the viewport
    const scale = Math.min(vw / baseW, vh / baseH);

    // Calculate offsets based on anchor
    let offsetX = (vw - baseW * scale) / 2;
    let offsetY = (vh - baseH * scale) / 2;

    if (anchor === 'top') {
      offsetY = 0;
    } else if (anchor === 'bottom') {
      offsetY = vh - baseH * scale;
    }

    el.style.position = 'absolute';
    el.style.left = '0px';
    el.style.top = '0px';
    el.style.width = baseW + 'px';
    el.style.height = baseH + 'px';
    el.style.transformOrigin = '0 0';
    el.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;

    // Ensure body doesn't show scrollbars or clip
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.width = '100%';
    document.documentElement.style.height = '100%';
    document.body.style.overflow = 'hidden';
    document.body.style.width = '100%';
    document.body.style.height = '100%';
    document.body.style.margin = '0';
    document.body.style.padding = '0';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyScale);
  } else {
    applyScale();
  }

  window.addEventListener('resize', applyScale);
}

/* ══════════════════════════════════════════════════════════════════
   ESPORTS SFX SYNTHESIZER (Web Audio API)
   Generates rich tournament sound effects dynamically:
   - timeout_buzzer: tactical pause buzzer / warning
   - timeout_chime: last 10s urgent clock tick
   - victory_fanfare: victory brass arpeggio fanfare
   - round_point: high tech point blip
   - match_point_siren: tactical alarm siren
   Works in all modern browsers & OBS Browser Source without external mp3s!
══════════════════════════════════════════════════════════════════ */

class SoundManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  // Tactical Timeout Buzzer (Valorant tactical buzzer tone)
  playTimeoutBuzzer() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.6);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.6);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.65);
  }

  // Urgent Countdown Tick (<10s remaining)
  playTick(isUrgent = false) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = isUrgent ? 'square' : 'sine';
    osc.frequency.setValueAtTime(isUrgent ? 880 : 440, t);

    gain.gain.setValueAtTime(isUrgent ? 0.2 : 0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.09);
  }

  // Victory Fanfare for Match Winner Screen
  playVictoryFanfare() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const notes = [
      { f: 392.00, d: 0.18, offset: 0.00 }, // G4
      { f: 523.25, d: 0.18, offset: 0.20 }, // C5
      { f: 659.25, d: 0.18, offset: 0.40 }, // E5
      { f: 783.99, d: 0.50, offset: 0.60 }, // G5
      { f: 659.25, d: 0.18, offset: 1.15 }, // E5
      { f: 783.99, d: 0.80, offset: 1.35 }, // G5 sustain
      { f: 1046.50, d: 1.20, offset: 1.60 } // C6 high triumph
    ];

    const now = this.ctx.currentTime;
    notes.forEach(n => {
      const t = now + n.offset;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.f, t);

      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + n.d);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + n.d + 0.05);
    });
  }

  // Point scored blip
  playPointScored() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, t); // D5
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.15); // A5

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.22);
  }
}

// Global export
window.sfx = new SoundManager();

// Auto-unlock Web Audio on first user interaction or OBS document load
['click', 'keydown', 'touchstart'].forEach(evt => {
  window.addEventListener(evt, () => window.sfx.init(), { once: true });
});

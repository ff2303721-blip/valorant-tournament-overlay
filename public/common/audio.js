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

  // 1. Classic Victory Fanfare (Brass arpeggio)
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

  // 2. Cinematic Valorant Boom (Deep sub bass drop + power impact chord)
  playVictoryCinematic() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    // Sub-bass sweep
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(150, now);
    subOsc.frequency.exponentialRampToValueAtTime(32, now + 1.2);
    subGain.gain.setValueAtTime(0.45, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
    subOsc.connect(subGain);
    subGain.connect(this.ctx.destination);
    subOsc.start(now);
    subOsc.stop(now + 1.45);

    // Dramatic minor-to-major victory power chord swell
    const chord = [220, 277.18, 329.63, 440, 554.37]; // A major 9th swell
    chord.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + 0.08);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.25 + idx * 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);

      // Lowpass filter for warm cinematic tone
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, now);
      filter.frequency.exponentialRampToValueAtTime(2400, now + 0.4);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 2.1);
    });
  }

  // 3. Radiant Esports Synth Stinger (Fast futuristic riser + victory hit)
  playVictorySynth() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const arpeggios = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];

    arpeggios.forEach((freq, idx) => {
      const t = now + idx * 0.06;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.45);
    });

    // Big finish hit on end of arpeggio
    const hitT = now + arpeggios.length * 0.06;
    const hitOsc = this.ctx.createOscillator();
    const hitGain = this.ctx.createGain();
    hitOsc.type = 'triangle';
    hitOsc.frequency.setValueAtTime(523.25, hitT);
    hitGain.gain.setValueAtTime(0.35, hitT);
    hitGain.gain.exponentialRampToValueAtTime(0.001, hitT + 1.2);
    hitOsc.connect(hitGain);
    hitGain.connect(this.ctx.destination);
    hitOsc.start(hitT);
    hitOsc.stop(hitT + 1.25);
  }

  // 4. Victory Chimes (Crystal ethereal bells)
  playVictoryChimes() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const bells = [
      { f: 587.33, t: 0.0 },
      { f: 880.00, t: 0.2 },
      { f: 1174.66, t: 0.4 },
      { f: 1760.00, t: 0.7 }
    ];

    bells.forEach(b => {
      const t = now + b.t;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(b.f, t);

      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 1.55);
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

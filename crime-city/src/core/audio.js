// Procedural low-poly SFX — no audio assets, everything synthesized.
import { clamp, rand } from './utils.js';

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sirens = new Map();  // id -> {osc, gain, timer}
    this.musicOn = false;
    this.musicTimer = null;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return true;
    } catch { return false; }
  }
  now() { return this.ctx.currentTime; }

  env(gainNode, t0, peak, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0001), t0 + 0.005);
    g.exponentialRampToValueAtTime(0.0001, t0 + decay);
  }
  noise(t0, { decay = 0.15, freq = 1200, q = 1, peak = 0.5, type = 'lowpass' } = {}) {
    if (!this.ensure()) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    src.connect(f).connect(g).connect(this.master);
    this.env(g, t0, peak, decay);
    src.start(t0); src.stop(t0 + decay + 0.1);
  }
  tone(t0, { freq = 440, end = null, decay = 0.2, peak = 0.25, type = 'square' } = {}) {
    if (!this.ensure()) return;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (end) o.frequency.exponentialRampToValueAtTime(end, t0 + decay);
    const g = this.ctx.createGain();
    o.connect(g).connect(this.master);
    this.env(g, t0, peak, decay);
    o.start(t0); o.stop(t0 + decay + 0.1);
  }

  shot(type) {
    if (!this.ensure()) return;
    const t = this.now();
    if (type === 'pistol') {
      this.noise(t, { decay: 0.12, freq: 1800, peak: 0.55 });
      this.tone(t, { freq: 160, end: 60, decay: 0.09, peak: 0.4, type: 'triangle' });
    } else if (type === 'tommy') {
      this.noise(t, { decay: 0.08, freq: 1400, peak: 0.4 });
      this.tone(t, { freq: 140, end: 70, decay: 0.06, peak: 0.3, type: 'triangle' });
    } else if (type === 'shotgun') {
      this.noise(t, { decay: 0.3, freq: 700, peak: 0.8 });
      this.tone(t, { freq: 110, end: 40, decay: 0.22, peak: 0.55, type: 'triangle' });
    } else if (type === 'rifle') {
      this.noise(t, { decay: 0.14, freq: 2400, peak: 0.45 });
      this.tone(t, { freq: 200, end: 70, decay: 0.1, peak: 0.3, type: 'triangle' });
    } else if (type === 'minigun') {
      this.noise(t, { decay: 0.06, freq: 1700, peak: 0.4 });
      this.tone(t, { freq: 130, end: 80, decay: 0.05, peak: 0.32, type: 'sawtooth' });
    } else { // distant / enemy
      this.noise(t, { decay: 0.1, freq: 900, peak: 0.18 });
    }
  }
  punch() { const t = this.now(); this.tone(t, { freq: 90, end: 45, decay: 0.12, peak: 0.5, type: 'sine' }); this.noise(t, { decay: 0.06, freq: 500, peak: 0.2 }); }
  ricochet() {
    const t = this.now();
    this.tone(t, { freq: rand(2200, 3400), end: rand(500, 900), decay: 0.18, peak: 0.12, type: 'sine' });
  }
  hitmark() { this.tone(this.now(), { freq: 1400, end: 900, decay: 0.05, peak: 0.15, type: 'square' }); }
  hurt() { this.tone(this.now(), { freq: 220, end: 90, decay: 0.2, peak: 0.35, type: 'sawtooth' }); }
  reload() {
    const t = this.now();
    this.tone(t, { freq: 700, end: 500, decay: 0.04, peak: 0.2 });
    this.tone(t + 0.18, { freq: 900, end: 650, decay: 0.04, peak: 0.2 });
  }
  scream() {
    const t = this.now();
    this.tone(t, { freq: rand(700, 1000), end: rand(1400, 1800), decay: 0.25, peak: 0.08, type: 'sawtooth' });
  }
  cashTick() { this.tone(this.now(), { freq: 1250, end: 1600, decay: 0.05, peak: 0.12, type: 'sine' }); }
  explosion() {
    const t = this.now();
    this.noise(t, { decay: 0.7, freq: 300, peak: 0.9 });
    this.tone(t, { freq: 80, end: 30, decay: 0.5, peak: 0.6, type: 'sine' });
  }
  bark() { const t = this.now(); this.tone(t, { freq: 500, decay: 0.05, peak: 0.1 }); this.tone(t + 0.07, { freq: 380, decay: 0.06, peak: 0.1 }); }
  fanfare() {
    const t = this.now();
    [523, 659, 784, 1047].forEach((f, i) => this.tone(t + i * 0.11, { freq: f, decay: 0.3, peak: 0.22, type: 'square' }));
  }
  sting() {
    const t = this.now();
    this.tone(t, { freq: 196, decay: 0.4, peak: 0.3, type: 'sawtooth' });
    this.tone(t + 0.18, { freq: 147, decay: 0.7, peak: 0.3, type: 'sawtooth' });
  }
  wasted() {
    const t = this.now();
    [392, 330, 262, 196].forEach((f, i) => this.tone(t + i * 0.22, { freq: f, decay: 0.5, peak: 0.3, type: 'sawtooth' }));
  }
  win() {
    const t = this.now();
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(t + i * 0.16, { freq: f, decay: 0.5, peak: 0.25, type: 'square' }));
  }

  // ---- sirens: distance-attenuated two-tone loops keyed by entity id ----
  sirenStart(id) {
    if (!this.ensure() || this.sirens.has(id) || this.sirens.size >= 3) return;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    const g = this.ctx.createGain();
    g.gain.value = 0;
    o.connect(g).connect(this.master);
    o.start();
    const s = { o, g, hi: false };
    s.timer = setInterval(() => {
      if (!this.ctx) return;
      s.hi = !s.hi;
      o.frequency.setValueAtTime(s.hi ? 960 : 700, this.now());
    }, 340);
    this.sirens.set(id, s);
  }
  sirenUpdate(id, dist) {
    const s = this.sirens.get(id);
    if (!s) return;
    s.g.gain.value = clamp(0.09 * (1 - dist / 180), 0, 0.09);
  }
  sirenStop(id) {
    const s = this.sirens.get(id);
    if (!s) return;
    clearInterval(s.timer);
    try { s.o.stop(); } catch { /* already stopped */ }
    this.sirens.delete(id);
  }

  // ---- finale music: simple looped bass/drum pattern ----
  musicStart() {
    if (!this.ensure() || this.musicOn) return;
    this.musicOn = true;
    const bass = [55, 55, 65, 49];
    let bar = 0;
    const step = () => {
      if (!this.musicOn) return;
      const t = this.now();
      const root = bass[bar % 4];
      for (let i = 0; i < 4; i++) {
        this.tone(t + i * 0.22, { freq: root * (i === 3 ? 1.5 : 1), decay: 0.2, peak: 0.22, type: 'sawtooth' });
        this.noise(t + i * 0.22, { decay: 0.05, freq: 6000, peak: 0.07, type: 'highpass' });
      }
      this.noise(t + 0.44, { decay: 0.12, freq: 900, peak: 0.15 }); // snare-ish
      bar++;
      this.musicTimer = setTimeout(step, 880);
    };
    step();
  }
  musicStop() { this.musicOn = false; clearTimeout(this.musicTimer); }
}

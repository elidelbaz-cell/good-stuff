// ============================================================================
// AudioEngine — WebAudio. Real WAVs when the manifest provides them, synth
// placeholders (sine-wave beeps, filtered noise) when it doesn't.
// ALL rhythm timing runs off ctx.currentTime — the audio clock, never frames.
// ============================================================================
import { CONFIG } from '../config.js';

// Keys 1–7 → an A-minor-ish scale. Placeholder until note_1..7.wav arrive.
const KEY_FREQS = [220.0, 246.94, 261.63, 293.66, 329.63, 349.23, 392.0];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.buffers = new Map();
    this._noiseBuf = null;
    this.drone = null;
    this.tv = null;
    this._silenced = false;
  }

  // Must be called from a user gesture (the title click).
  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = CONFIG.audio.masterVolume;
    this.master.connect(this.ctx.destination);
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  async loadBuffer(name, url) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.status);
      const data = await res.arrayBuffer();
      this.buffers.set(name, await this.ctx.decodeAudioData(data));
    } catch (e) {
      console.warn(`[audio] could not load "${name}" from ${url} — using synth placeholder`, e);
    }
  }
  has(name) { return this.buffers.has(name); }

  // ------------------------------------------------------------ playback ----
  playBuffer(name, { when = 0, gain = 1, rate = 1, detune = 0, loop = false } = {}) {
    const buf = this.buffers.get(name);
    if (!buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = loop;
    src.playbackRate.value = rate;
    if (detune) src.detune.value = detune;
    const g = this.ctx.createGain(); g.gain.value = gain;
    src.connect(g); g.connect(this.master);
    src.start(when || this.now);
    return { src, gain: g, stop: () => { try { src.stop(); } catch (_) {} } };
  }

  // -------------------------------------------------------------- synths ----
  beep(freq, { when = 0, dur = 0.3, type = 'sine', gain = 0.3, attack = 0.005,
               detune = 0, out = null } = {}) {
    const t = when || this.now;
    const osc = this.ctx.createOscillator();
    osc.type = type; osc.frequency.value = freq;
    if (detune) osc.detune.value = detune;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(out || this.master);
    osc.start(t); osc.stop(t + dur + 0.05);
    return osc;
  }

  _noise() {
    if (!this._noiseBuf) {
      const len = this.ctx.sampleRate * 2;
      this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this._noiseBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { // brownish noise, softer than white
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        d[i] = last * 3.5;
      }
    }
    return this._noiseBuf;
  }

  noiseBurst({ when = 0, dur = 0.2, gain = 0.4, freq = 800, q = 1, type = 'bandpass' } = {}) {
    const t = when || this.now;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise(); src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------- game sfx ------
  keyFreq(key) { return KEY_FREQS[key - 1]; }

  // A piano note for key 1–7. flat=true → the off-time detuned version.
  playNote(key, { when = 0, flat = false, gain = CONFIG.audio.noteVolume } = {}) {
    const t = when || this.now;
    const name = `note_${key}`;
    if (flat && this.has(`${name}_flat`)) return void this.playBuffer(`${name}_flat`, { when: t, gain });
    if (this.has(name)) return void this.playBuffer(name, { when: t, gain, detune: flat ? -45 : 0 });
    // synth pluck placeholder
    const f = this.keyFreq(key);
    const det = flat ? -45 : 0;
    this.beep(f, { when: t, dur: 1.4, type: 'triangle', gain, detune: det });
    this.beep(f * 2, { when: t, dur: 0.7, type: 'sine', gain: gain * 0.25, detune: det + (flat ? 18 : 0) });
    if (flat) this.beep(f, { when: t, dur: 1.1, type: 'sine', gain: gain * 0.4, detune: -75 }); // beating
  }

  playWrong(when = 0) {
    const t = when || this.now;
    if (this.has('wrong_key')) return void this.playBuffer('wrong_key', { when: t, gain: 0.55 });
    // dissonant cluster — minor 2nds
    this.beep(233, { when: t, dur: 1.2, type: 'sawtooth', gain: 0.16 });
    this.beep(247, { when: t, dur: 1.2, type: 'sawtooth', gain: 0.16 });
    this.beep(466, { when: t, dur: 0.8, type: 'square', gain: 0.06 });
    this.noiseBurst({ when: t, dur: 0.25, gain: 0.2, freq: 1400 });
  }

  playFootstep(vol = 0.12) {
    if (this.has('footstep')) return void this.playBuffer('footstep', { gain: vol, rate: 0.9 + Math.random() * 0.2 });
    this.noiseBurst({ dur: 0.07, gain: vol, freq: 350 + Math.random() * 150, q: 1.5 });
  }

  playShelfFall() {
    if (this.has('shelf_fall')) return void this.playBuffer('shelf_fall', { gain: 0.8 });
    const t = this.now;
    this.beep(70, { when: t, dur: 0.5, type: 'sine', gain: 0.6 });   // body thud
    this.noiseBurst({ when: t, dur: 0.4, gain: 0.5, freq: 250, q: 0.8 });
  }

  playBooksScatter() {
    if (this.has('books_scatter')) return void this.playBuffer('books_scatter', { gain: 0.5 });
    for (let i = 0; i < 6; i++)
      this.noiseBurst({ when: this.now + Math.random() * 0.4, dur: 0.06, gain: 0.12, freq: 600 + Math.random() * 800 });
  }

  playDoorSlam() {
    if (this.has('door_slam')) return void this.playBuffer('door_slam', { gain: 0.9 });
    const t = this.now;
    this.beep(55, { when: t, dur: 0.7, type: 'sine', gain: 0.8 });
    this.noiseBurst({ when: t, dur: 0.3, gain: 0.55, freq: 180, q: 0.7 });
  }

  playLightFail() {
    if (this.has('light_fail')) return void this.playBuffer('light_fail', { gain: 0.3 });
    this.beep(2400, { dur: 0.12, type: 'square', gain: 0.03 });
    this.noiseBurst({ dur: 0.1, gain: 0.06, freq: 3000, q: 3 });
  }

  playChairFall() {
    if (this.has('chair_fall')) return void this.playBuffer('chair_fall', { gain: 0.7 });
    const t = this.now;
    this.noiseBurst({ when: t, dur: 0.15, gain: 0.4, freq: 300, q: 0.8 });
    this.beep(90, { when: t + 0.05, dur: 0.3, type: 'sine', gain: 0.4 });
    this.noiseBurst({ when: t + 0.22, dur: 0.1, gain: 0.25, freq: 500, q: 1 });
  }

  playPaper() {
    if (this.has('paper_handling')) return void this.playBuffer('paper_handling', { gain: 0.4 });
    for (let i = 0; i < 3; i++)
      this.noiseBurst({ when: this.now + i * 0.15, dur: 0.1, gain: 0.05, freq: 2500 + Math.random() * 1500, q: 2 });
  }

  // -------------------------------------------- ghost ambience (the drone) --
  // Distance-driven: closeness 0 (far) → 1 (on top of you). Louder and MORE
  // WRONG as it nears. Replaced by ghost_ambience.wav when delivered (loop —
  // closeness still drives its gain + filter).
  startDrone() {
    if (this.drone) return;
    if (this.has('ghost_ambience')) {
      const h = this.playBuffer('ghost_ambience', { gain: CONFIG.audio.droneFar, loop: true });
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 400;
      h.src.disconnect(); h.gain.disconnect();
      h.src.connect(filt); filt.connect(h.gain); h.gain.connect(this.master);
      this.drone = { gain: h.gain, filter: filt, stopFns: [() => h.stop()], detuners: [] };
      return;
    }
    const g = this.ctx.createGain(); g.gain.value = CONFIG.audio.droneFar;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 300; filt.Q.value = 1.2;
    filt.connect(g); g.connect(this.master);
    const mk = (type, freq, det, vol) => {
      const o = this.ctx.createOscillator();
      o.type = type; o.frequency.value = freq; o.detune.value = det;
      const og = this.ctx.createGain(); og.gain.value = vol;
      o.connect(og); og.connect(filt); o.start();
      return o;
    };
    const a = mk('sawtooth', 55, 0, 0.5);
    const b = mk('sawtooth', 55, 6, 0.5);   // detune spread grows as it nears
    const sub = mk('sine', 27.5, 0, 0.9);
    const n = this.ctx.createBufferSource();
    n.buffer = this._noise(); n.loop = true;
    const ng = this.ctx.createGain(); ng.gain.value = 0.15;
    n.connect(ng); ng.connect(filt); n.start();
    this.drone = {
      gain: g, filter: filt, detuners: [b],
      stopFns: [() => { [a, b, sub, n].forEach(x => { try { x.stop(); } catch (_) {} }); }],
    };
  }

  setDroneCloseness(c) {
    if (!this.drone || this._silenced) return;
    c = Math.min(1, Math.max(0, c));
    const t = this.now;
    const { droneFar, droneNear } = CONFIG.audio;
    this.drone.gain.gain.setTargetAtTime(droneFar + (droneNear - droneFar) * c * c, t, 0.12);
    this.drone.filter.frequency.setTargetAtTime(300 + 2400 * c * c, t, 0.15);
    for (const o of this.drone.detuners) o.detune.setTargetAtTime(6 + 80 * c, t, 0.2);
  }

  stopDrone() {
    if (!this.drone) return;
    const d = this.drone; this.drone = null;
    d.gain.gain.setTargetAtTime(0.0001, this.now, 0.3);
    setTimeout(() => d.stopFns.forEach(f => f()), 1200);
  }

  // ------------------------------------------------------- cutscene beds ----
  startTvMurmur() {
    if (this.tv) return;
    if (this.has('tv_murmur')) { this.tv = this.playBuffer('tv_murmur', { gain: 0.25, loop: true }); return; }
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise(); src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g = this.ctx.createGain(); g.gain.value = 0.05;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.7;
    const lg = this.ctx.createGain(); lg.gain.value = 0.02;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(); lfo.start();
    this.tv = { stop: () => { try { src.stop(); lfo.stop(); } catch (_) {} } };
  }
  stopTvMurmur() { if (this.tv) { this.tv.stop(); this.tv = null; } }

  // The uncle practising the melody BADLY upstairs — muffled, hesitant, wrong
  // notes — then stopping mid-phrase. Synth placeholder reuses the beatmap so
  // it is the SAME melody the player must play in scene 3.
  startPracticePiano(beatmap, stopAtNoteIndex = 14) {
    if (this.has('practice_piano')) {
      const h = this.playBuffer('practice_piano', { gain: 0.35 });
      return { stop: () => h.stop() };
    }
    const out = this.ctx.createGain(); out.gain.value = 0.16;         // quiet
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 700;                      // through the ceiling
    out.connect(f); f.connect(this.master);
    const t0 = this.now + 0.5;
    const oscs = [];
    let cursor = 0;
    for (let i = 0; i < Math.min(stopAtNoteIndex, beatmap.notes.length); i++) {
      const n = beatmap.notes[i];
      cursor = t0 + n.time_ms / 1000 + (Math.random() - 0.3) * 0.22;  // hesitant timing
      let key = n.key;
      if (Math.random() < 0.22) key = Math.max(1, Math.min(7, key + (Math.random() < 0.5 ? -1 : 1))); // wrong note
      const freq = this.keyFreq(key);
      oscs.push(this.beep(freq, { when: cursor, dur: 1.1, type: 'triangle', gain: 0.5, detune: (Math.random() - 0.5) * 30, out }));
      if (Math.random() < 0.15) { // stumbles: immediate correction
        oscs.push(this.beep(this.keyFreq(n.key), { when: cursor + 0.3, dur: 0.9, type: 'triangle', gain: 0.4, out }));
      }
    }
    return {
      stop: () => { // mid-phrase stop: kill everything scheduled from now
        for (const o of oscs) { try { o.stop(this.now + 0.05); } catch (_) {} }
        out.gain.setTargetAtTime(0.0001, this.now, 0.03);
      },
      lastNoteTime: cursor,
    };
  }

  // ------------------------------------------------- scene 3 song source ----
  // Returns { startCtxTime, stop }. songTimeMs = (ctx.currentTime - startCtxTime)*1000
  // minus beatmap.audio_offset_ms — this IS the rhythm clock.
  startSong(beatmap) {
    const t0 = this.now + 0.35; // small scheduling headroom
    if (this.has('melody_main')) {
      const h = this.playBuffer('melody_main', { when: t0, gain: 0.85 });
      return { startCtxTime: t0, stop: () => h.stop() };
    }
    // Placeholder "song": quiet guide tones one octave down at each beatmap
    // note. The player's own hits carry the melody at full volume — a miss
    // leaves near-silence where the note should be.
    const out = this.ctx.createGain();
    out.gain.value = 1; out.connect(this.master);
    const vol = CONFIG.audio.guideToneVolume;
    for (const n of beatmap.notes)
      this.beep(this.keyFreq(n.key) / 2, { when: t0 + n.time_ms / 1000, dur: 0.9, type: 'sine', gain: vol, out });
    return {
      startCtxTime: t0,
      stop: () => { out.gain.cancelScheduledValues(this.now); out.gain.setTargetAtTime(0.0001, this.now, 0.02); },
    };
  }

  // ------------------------------------------------------------- death ------
  // Cut to black, SILENCE — no stinger, no scream.
  silenceAll() {
    if (!this.ctx) return;
    this._silenced = true;
    this.master.gain.cancelScheduledValues(this.now);
    this.master.gain.setTargetAtTime(0.0001, this.now, 0.04);
  }
  restoreAll() {
    if (!this.ctx) return;
    this._silenced = false;
    this.master.gain.setTargetAtTime(CONFIG.audio.masterVolume, this.now, 0.25);
  }
}

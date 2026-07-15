// ============================================================================
// SCENE 3 — the piano. The core mechanic.
//
// The piano FBX is one FUSED mesh, so the keys are faked on top of it:
//  - the imported model is the static body (visual only)
//  - 7 invisible hitboxes (from assets/data/piano_keys.json — editable data,
//    nudge them to line up with the real model's key texture)
//  - 7 visible key-caps directly over the hitboxes; these depress a few mm
// Input: number keys 1–7. ALL timing runs off the audio playback clock.
// No health UI — the ghost's closeness IS the health bar.
// ============================================================================
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Hands } from './hands.js';

const PI = CONFIG.piano;

function makeLabelSprite(text) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.font = '44px Georgia';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 32, 34);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.28, depthTest: false });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(0.05);
  return s;
}

export class PianoScene {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();     // piano root — anchor for all key data
    this.caps = new Map();              // key → { mesh, baseY, anim }
    this.hitboxes = new Map();          // key → THREE.Box3 (world)
    this.hands = null;
    this.beatmap = null;
    this.notes = [];                    // runtime copies: { time, key, judged, missed }
    this.song = null;                   // { startCtxTime, stop }
    this.state = 'idle';                // idle | intro | playing | done
    this.streak = 0;
    this.hoverIdx = 0;
    this.completed = false;
    this.anchors = null;                // set in build()
  }

  // --- level construction (called once at boot) -----------------------------
  async build(scene, assets, keyData, beatmap, anchors) {
    this.beatmap = beatmap;
    this.anchors = anchors;             // { piano, bench, ghostFrom, ghostTo } from chase layout

    const pianoModel = await assets.getModel('piano');
    this.group.position.copy(anchors.piano);
    this.group.add(pianoModel);
    scene.add(this.group);

    // 7 key-caps + hitboxes from editable data
    const cs = keyData.capSize, hs = keyData.hitboxSize;
    const capGeo = new THREE.BoxGeometry(cs.w, cs.h, cs.d);
    const capMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(keyData.capColor || '#e8e4d8'), roughness: 0.55,
    });
    const worldTops = new Map();
    for (const k of keyData.keys) {
      const mesh = new THREE.Mesh(capGeo, capMat.clone());
      mesh.position.set(k.x, k.y, k.z);
      this.group.add(mesh);
      this.caps.set(k.key, { mesh, baseY: k.y, anim: 0 });

      const centre = new THREE.Vector3(k.x, k.y, k.z).add(anchors.piano);
      this.hitboxes.set(k.key, new THREE.Box3(
        new THREE.Vector3(centre.x - hs.w / 2, centre.y - hs.h / 2, centre.z - hs.d / 2),
        new THREE.Vector3(centre.x + hs.w / 2, centre.y + hs.h / 2, centre.z + hs.d / 2),
      ));
      worldTops.set(k.key, new THREE.Vector3(centre.x, centre.y + cs.h / 2, centre.z));

      if (CONFIG.dev.showKeyLabels) {
        const label = makeLabelSprite(String(k.key));
        label.position.set(k.x, k.y + 0.09, k.z + 0.02);
        this.group.add(label);
      }
    }

    // the two rigid hands, resting above the keys
    this.hands = new Hands(scene);
    this.hands.setKeyTargets(worldTops, 0);
    this.hands.setVisible(false);

    // a dim lamp over the keyboard — the last light in the library
    const lamp = new THREE.PointLight(0xffe0b0, 6, 6, 1.8);
    lamp.position.set(anchors.piano.x, anchors.piano.y + 1.9, anchors.piano.z + 0.4);
    scene.add(lamp);
  }

  // --- run -------------------------------------------------------------------
  start() {
    const g = this.game;
    g.checkpoint = 'piano';   // death restarts here, never the cutscene
    this.state = 'intro';
    this.completed = false;
    this.streak = 0;
    this.hoverIdx = 0;
    this.introT = 0;
    this.notes = this.beatmap.notes.map(n => ({ time: n.time_ms, key: n.key, judged: false, missed: false }));

    const a = this.anchors;
    g.player.teleport(a.bench, 0, -0.55);
    g.player.enabled = false;         // no WASD — cornered
    g.player.lookEnabled = true;
    g.player.setLookClamp({
      yawCenter: 0, yawRange: PI.yawLimit, pitchMin: PI.pitchMin, pitchMax: PI.pitchMax,
    });

    this.hands.setVisible(true);
    g.ghost.startApproach(a.ghostFrom, a.ghostTo, PI.ghostStartDistance);
    g.audio.startDrone();
  }

  reset() { // respawn after death
    if (this.song) { this.song.stop(); this.song = null; }
    this.start();
  }

  get songTimeMs() {
    if (!this.song) return -Infinity;
    return (this.game.audio.now - this.song.startCtxTime) * 1000 - (this.beatmap.audio_offset_ms || 0);
  }

  onKey(key) {
    if (this.state !== 'playing' || this.completed) return;
    const t = this.songTimeMs;
    const w = this.beatmap.hit_window_ms;
    const g = this.game;

    // nearest unjudged note within the judging radius
    let best = null, bestDt = Infinity;
    for (const n of this.notes) {
      if (n.judged) continue;
      const dt = t - n.time;
      if (dt > PI.offTimeWindowMs) continue;       // already too old (missed — update() sweeps it)
      if (dt < -PI.offTimeWindowMs) break;         // notes are sorted; rest are too far ahead
      if (Math.abs(dt) < Math.abs(bestDt)) { best = n; bestDt = dt; }
    }

    this.depressCap(key);
    this.hands.press(key);

    if (!best) {
      // a press with no note anywhere near it = a wrong sound in the silence
      g.audio.playWrong();
      g.ghost.stepCloser(PI.stepWrongKey);
      this.streak = 0;
      return;
    }

    if (best.key === key) {
      const adt = Math.abs(bestDt);
      best.judged = true;
      if (adt <= w.good) {
        // correct + on time → clean note, key-cap depresses, hand drops
        g.audio.playNote(key);
        this.streak++;
        if (this.streak >= PI.streakForRecovery) g.ghost.stepBack(PI.recoveryPerHit);
      } else {
        // correct + off time → flat/detuned note, ghost steps closer
        g.audio.playNote(key, { flat: true });
        g.ghost.stepCloser(PI.stepOffTime);
        this.streak = 0;
      }
    } else {
      // wrong key → dissonant, ghost steps BIG closer (note stays live)
      g.audio.playWrong();
      g.ghost.stepCloser(PI.stepWrongKey);
      this.streak = 0;
    }
  }

  depressCap(key) {
    const cap = this.caps.get(key);
    if (cap) cap.anim = 1;
  }

  update(dt) {
    const g = this.game;

    if (this.state === 'intro') {
      this.introT += dt;
      if (this.introT >= 1.2) {
        this.state = 'playing';
        this.song = g.audio.startSong(this.beatmap);
      }
    }

    // key-cap depress animation — a few millimetres down, then back
    for (const cap of this.caps.values()) {
      if (cap.anim > 0) {
        cap.anim = Math.max(0, cap.anim - dt * (1000 / CONFIG.piano.keycapReturnMs) * 0.5);
        const f = Math.sin(Math.min(1, 1 - cap.anim) * Math.PI); // down and back
        cap.mesh.position.y = cap.baseY - PI.keycapTravel * (cap.anim > 0 ? Math.min(1, f * 1.6) : 0);
      } else {
        cap.mesh.position.y = cap.baseY;
      }
    }

    this.hands.update(dt);

    if (this.state !== 'playing') return;
    const t = this.songTimeMs;
    const w = this.beatmap.hit_window_ms;

    // sweep misses: silence where a note should be — no sound at all
    for (const n of this.notes) {
      if (!n.judged && t > n.time + w.miss) {
        n.judged = true; n.missed = true;
        g.ghost.stepCloser(PI.stepMiss);
        this.streak = 0;
      }
      if (n.time > t) break;
    }

    // the hand slides over to hover the NEXT key one beat early
    const beatMs = 60000 / (this.beatmap.bpm || 60);
    while (this.hoverIdx < this.notes.length) {
      const n = this.notes[this.hoverIdx];
      if (n.judged) { this.hoverIdx++; continue; }
      if (t >= n.time - beatMs * CONFIG.hands.lookAheadBeats) {
        this.hands.hoverTo(n.key);
        this.hoverIdx++;
        continue;
      }
      break;
    }

    // the ghost drifts on every mistake; its closeness is the only health bar
    const dist = g.ghost.updateApproach(dt);
    if (dist <= PI.killDistance && !this.completed) {
      this.state = 'done';
      g.death.trigger();
      return;
    }

    // melody complete → hook fires; what happens next is an open decision
    const last = this.notes[this.notes.length - 1];
    if (!this.completed && this.notes.every(n => n.judged) && t > last.time + 1500) {
      this.completed = true;
      this.state = 'done';
      window.dispatchEvent(new CustomEvent('OnMelodyComplete', {
        detail: { misses: this.notes.filter(n => n.missed).length },
      }));
      console.info('[THE CALMING] OnMelodyComplete fired');
      CONFIG.onMelodyComplete(this.game);
    }
  }
}

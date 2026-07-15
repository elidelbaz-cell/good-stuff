// ============================================================================
// The ghost — the uncle's shadow. One rigid object gliding on the chase path
// (the "spline"). NOT AI, on purpose: it holds a set distance, closes when
// the player is slowed, re-opens when they run clean. Distance IS the health
// bar: it drives the ambience drone and the emission glow, and at zero the
// player dies. In the piano scene the same object advances on a straight
// approach line, stepped by mistakes and pushed back by clean streaks.
// ============================================================================
import * as THREE from 'three';
import { CONFIG } from '../config.js';

const G = CONFIG.ghost;
const _p = new THREE.Vector3();
const _d = new THREE.Vector3();

export class Ghost {
  constructor(mesh, audio) {
    this.mesh = mesh;                 // from assets.getModel('shadow')
    this.material = mesh.userData.material;
    this.audio = audio;
    this.mode = 'idle';               // idle | chase | approach
    this.s = 0;                       // progress on the chase path
    this.path = null;
    this.lunging = false;
    this.frozen = false;              // door slammed — waits at the threshold
    this.freezeS = 0;
    // approach mode (piano)
    this.anchorFrom = new THREE.Vector3();
    this.anchorTo = new THREE.Vector3();
    this.distance = 0;                // metres from the player
    this.targetDistance = 0;
    this.time = 0;
  }

  // ------------------------------------------------------------- chase ------
  startChase(path, playerS) {
    this.mode = 'chase';
    this.path = path;
    this.s = playerS - G.startGap;
    this.lunging = false;
    this.frozen = false;
    this.mesh.visible = true;
  }

  gapTo(playerS) { return playerS - this.s; }

  closeBy(metres) { if (this.mode === 'chase') this.s += metres; }

  lunge() { this.lunging = true; }

  freezeAt(s) { this.frozen = true; this.freezeS = s; }

  // Returns the current gap (metres). Caller checks kill distance.
  updateChase(dt, playerS, playerSpeed) {
    let gap = this.gapTo(playerS);
    let speed;
    if (this.lunging) {
      speed = G.lungeSpeed;
    } else if (gap > G.desiredGap) {
      // fell behind its set distance — reel back in
      speed = Math.max(G.closeSpeed, playerSpeed + (gap - G.desiredGap) * 0.5);
    } else {
      // at/inside its set distance — relentless, but a clean sprint outruns it
      speed = Math.max(G.closeSpeed, playerSpeed - G.reopenRate);
    }
    this.s += speed * dt;
    if (this.frozen) this.s = Math.min(this.s, this.freezeS);
    // never falls further behind than maxGap
    if (playerS - this.s > G.maxGap) this.s = playerS - G.maxGap;

    gap = this.gapTo(playerS);
    this._place(dt, gap);
    return gap;
  }

  _place(dt, gap) {
    this.time += dt;
    this.path.pointAt(this.s, _p);
    this.path.dirAt(this.s, _d);
    const sway = Math.sin(this.time * 1.7) * G.swayAmount;
    // perpendicular sway — it drifts, it does not run
    this.mesh.position.set(
      _p.x + -_d.z * sway,
      _p.y + G.hoverHeight * 0.35 + Math.sin(this.time * 1.1) * 0.12,
      _p.z + _d.x * sway,
    );
    this.mesh.rotation.y = Math.atan2(_d.x, _d.z);
    this._applyCloseness(this.closenessFromGap(gap));
  }

  closenessFromGap(gap) {
    return THREE.MathUtils.clamp(1 - (gap - G.killDistance) / (G.maxGap - G.killDistance), 0, 1);
  }

  // ---------------------------------------------------------- approach ------
  // Piano scene: straight line from the door threshold to the player's back.
  startApproach(fromPos, toPos, startDistance) {
    this.mode = 'approach';
    this.anchorFrom.copy(fromPos);
    this.anchorTo.copy(toPos);
    this.distance = startDistance;
    this.targetDistance = startDistance;
    this.lunging = false;
    this.mesh.visible = true;
  }

  stepCloser(metres) { this.targetDistance = Math.max(0, this.targetDistance - metres); }
  stepBack(metres) {
    this.targetDistance = Math.min(CONFIG.piano.ghostStartDistance, this.targetDistance + metres);
  }

  updateApproach(dt) {
    // drift toward the stepped target — a shadow does not snap
    this.distance += (this.targetDistance - this.distance) * Math.min(1, 2.5 * dt);
    this.time += dt;
    const total = this.anchorFrom.distanceTo(this.anchorTo);
    const f = THREE.MathUtils.clamp(1 - this.distance / total, 0, 1);
    _p.lerpVectors(this.anchorFrom, this.anchorTo, f);
    const sway = Math.sin(this.time * 1.3) * G.swayAmount * 0.5;
    this.mesh.position.set(_p.x + sway, _p.y + Math.sin(this.time * 0.9) * 0.1, _p.z);
    _d.copy(this.anchorTo).sub(this.anchorFrom).normalize();
    this.mesh.rotation.y = Math.atan2(_d.x, _d.z);

    const start = CONFIG.piano.ghostStartDistance;
    const closeness = THREE.MathUtils.clamp(
      1 - (this.distance - CONFIG.piano.killDistance) / (start - CONFIG.piano.killDistance), 0, 1);
    this._applyCloseness(closeness);
    return this.distance;
  }

  // --------------------------------------------------------------------------
  // Emission glow + drone, both driven by closeness. With the real shadow FBX
  // the emission map is already bound as emissiveMap — this same intensity
  // ramp drives it, no changes needed.
  _applyCloseness(c) {
    if (this.material) {
      this.material.emissiveIntensity = G.emissiveFar + (G.emissiveNear - G.emissiveFar) * c * c;
    }
    this.audio.setDroneCloseness(c);
  }

  placeStatic(pos, faceTowards) {
    this.mode = 'idle';
    this.mesh.visible = true;
    this.mesh.position.copy(pos);
    if (faceTowards) {
      this.mesh.rotation.y = Math.atan2(faceTowards.x - pos.x, faceTowards.z - pos.z);
    }
  }
}

// ============================================================================
// The two piano hands. Rigid meshes, NO skeleton, pure position-lerp:
//  - on a note the assigned hand lerps DOWN to the key-cap, then back up
//  - it lerps SIDEWAYS to hover over the next key one beat early
//  - keys 1–3 = left hand, 5–7 = right hand, 4 = least-recently-moved hand
// ============================================================================
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { makeHandMesh } from '../engine/placeholders.js';

const H = CONFIG.hands;

function smooth(t) { return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); }

class Hand {
  constructor(isLeft) {
    this.mesh = makeHandMesh(isLeft);
    this.isLeft = isLeft;
    this.anchor = new THREE.Vector3();      // current hover anchor (above a key)
    this.fromAnchor = new THREE.Vector3();
    this.toAnchor = new THREE.Vector3();
    this.travelT = 1;                        // sideways lerp progress
    this.pressPhase = null;                  // 'down' | 'up' | null
    this.pressT = 0;
    this.pressDepth = 0;                     // 0..1 → hover..key surface
    this.lastMoveTime = 0;
    this.hoverKey = null;
  }

  goTo(target, now) {
    this.fromAnchor.copy(this.anchor);
    this.toAnchor.copy(target);
    this.travelT = 0;
    this.lastMoveTime = now;
  }

  press(now) {
    this.pressPhase = 'down';
    this.pressT = 0;
    this.lastMoveTime = now;
  }

  update(dt) {
    if (this.travelT < 1) {
      this.travelT = Math.min(1, this.travelT + dt / H.travelLerpTime);
      this.anchor.lerpVectors(this.fromAnchor, this.toAnchor, smooth(this.travelT));
    }
    if (this.pressPhase === 'down') {
      this.pressT = Math.min(1, this.pressT + dt / H.pressLerpTime);
      this.pressDepth = smooth(this.pressT);
      if (this.pressT >= 1) { this.pressPhase = 'up'; this.pressT = 0; }
    } else if (this.pressPhase === 'up') {
      this.pressT = Math.min(1, this.pressT + dt / H.releaseLerpTime);
      this.pressDepth = 1 - smooth(this.pressT);
      if (this.pressT >= 1) { this.pressPhase = null; this.pressDepth = 0; }
    }
    this.mesh.position.set(
      this.anchor.x,
      this.anchor.y - this.pressDepth * (H.hoverHeight - 0.008),
      this.anchor.z,
    );
    // tiny idle breathing so they never look frozen
    this.mesh.position.y += Math.sin(performance.now() / 900 + (this.isLeft ? 0 : 1.7)) * 0.0035;
  }
}

export class Hands {
  constructor(scene) {
    this.left = new Hand(true);
    this.right = new Hand(false);
    scene.add(this.left.mesh, this.right.mesh);
    this.keyTargets = new Map();   // key (1–7) → world position of hover point
    this.now = 0;
  }

  // worldTops: Map key → Vector3 (top-centre of each key-cap)
  setKeyTargets(worldTops, facingYaw = 0) {
    this.keyTargets.clear();
    for (const [key, top] of worldTops) {
      this.keyTargets.set(key, new THREE.Vector3(top.x, top.y + H.hoverHeight, top.z));
    }
    this.left.mesh.rotation.y = facingYaw;
    this.right.mesh.rotation.y = facingYaw;
    // rest pose: left over key 2, right over key 6
    this.left.anchor.copy(this.keyTargets.get(2));
    this.left.toAnchor.copy(this.left.anchor); this.left.fromAnchor.copy(this.left.anchor);
    this.right.anchor.copy(this.keyTargets.get(6));
    this.right.toAnchor.copy(this.right.anchor); this.right.fromAnchor.copy(this.right.anchor);
    this.left.hoverKey = 2; this.right.hoverKey = 6;
  }

  // keys 1–3 = left, 5–7 = right, 4 = whichever hand moved least recently
  _assign(key) {
    if (key <= 3) return this.left;
    if (key >= 5) return this.right;
    return this.left.lastMoveTime <= this.right.lastMoveTime ? this.left : this.right;
  }

  // sideways move to hover over `key` (called one beat early for the next note)
  hoverTo(key) {
    const hand = this._assign(key);
    if (hand.hoverKey === key) return;
    hand.hoverKey = key;
    hand.goTo(this.keyTargets.get(key), this.now);
  }

  // drop onto `key` (called on an actual keypress)
  press(key) {
    const hand = this._assign(key);
    if (hand.hoverKey !== key) {
      hand.hoverKey = key;
      hand.goTo(this.keyTargets.get(key), this.now);
    }
    hand.press(this.now);
  }

  setVisible(v) { this.left.mesh.visible = v; this.right.mesh.visible = v; }

  update(dt) {
    this.now += dt;
    this.left.update(dt);
    this.right.update(dt);
  }
}

// ============================================================================
// First-person player. Sprint is ALWAYS on — there is no walk speed.
// WASD + mouse look + Space jump + Shift/Ctrl slide-duck.
// The rig: this.root (feet position, yaw) -> this.head (pitch, at eye height)
// -> camera. Scenes drive it via enable()/disable() and look clamps.
// ============================================================================
import * as THREE from 'three';
import { CONFIG } from '../config.js';

const P = CONFIG.player;

export class Player {
  constructor(camera, dom) {
    this.camera = camera;
    this.root = new THREE.Group();     // feet
    this.head = new THREE.Group();     // eyes
    this.head.position.y = P.eyeHeight;
    this.root.add(this.head);
    this.head.add(camera);
    camera.position.set(0, 0, 0);
    camera.rotation.set(0, 0, 0);

    this.vel = new THREE.Vector3();
    this.grounded = true;
    this.enabled = false;              // movement input
    this.lookEnabled = false;          // mouse input
    this.yaw = 0;
    this.pitch = 0;
    this.lookClamp = null;             // {yawCenter, yawRange, pitchMin, pitchMax}
    this.slideTimer = 0;
    this.slideCooldown = 0;
    this.staggerTimer = 0;
    this.shakeAmp = 0;
    this.eyeCurrent = P.eyeHeight;
    this.stepAccum = 0;
    this.onStep = null;                // footstep callback

    this.keys = new Set();
    dom.addEventListener('keydown', e => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight' ||
           e.code === 'ControlLeft' || e.code === 'ControlRight') &&
          this.enabled) this._trySlide();
    });
    dom.addEventListener('keyup', e => this.keys.delete(e.code));
    dom.addEventListener('mousemove', e => {
      if (!this.lookEnabled) return;
      if (document.pointerLockElement === null && !window.__noPointerLock) return;
      this.yaw -= (e.movementX || 0) * P.lookSensitivity;
      this.pitch -= (e.movementY || 0) * P.lookSensitivity;
      this._applyLookClamp();
    });
  }

  _applyLookClamp() {
    if (this.lookClamp) {
      const c = this.lookClamp;
      // wrap yaw near the centre so the clamp maths is stable
      let d = this.yaw - c.yawCenter;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      d = Math.max(-c.yawRange, Math.min(c.yawRange, d));
      this.yaw = c.yawCenter + d;
      this.pitch = Math.max(c.pitchMin, Math.min(c.pitchMax, this.pitch));
    } else {
      this.pitch = Math.max(-P.pitchLimit, Math.min(P.pitchLimit, this.pitch));
    }
  }

  setLookClamp(clamp) { this.lookClamp = clamp; this._applyLookClamp(); }

  teleport(pos, yaw = 0, pitch = 0) {
    this.root.position.copy(pos);
    this.yaw = yaw; this.pitch = pitch;
    this.vel.set(0, 0, 0);
    this.slideTimer = 0; this.staggerTimer = 0;
    this.eyeCurrent = P.eyeHeight;
    this._sync();
  }

  get position() { return this.root.position; }
  get eyePosition() {
    return new THREE.Vector3(this.root.position.x,
      this.root.position.y + this.eyeCurrent, this.root.position.z);
  }
  get sliding() { return this.slideTimer > 0; }
  get staggered() { return this.staggerTimer > 0; }
  get bodyHeight() { return this.sliding ? P.slideBodyHeight : P.bodyHeight; }
  get horizontalSpeed() { return Math.hypot(this.vel.x, this.vel.z); }

  _trySlide() {
    if (this.sliding || this.slideCooldown > 0 || !this.grounded || this.staggered) return;
    this.slideTimer = P.slideDuration;
    // slide continues along current heading with a small boost
    const dir = this._wishDir() || new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const spd = Math.max(this.horizontalSpeed, P.sprintSpeed) * P.slideBoost;
    this.vel.x = dir.x * spd; this.vel.z = dir.z * spd;
  }

  stagger(duration) {
    this.staggerTimer = duration;
    this.slideTimer = 0;
    this.vel.x *= -0.15; this.vel.z *= -0.15;  // knocked back a touch
    this.shakeAmp = 0.05;
  }

  _wishDir() {
    let f = 0, r = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) f += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) f -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) r += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) r -= 1;
    if (!f && !r) return null;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const dir = new THREE.Vector3(-sin * f + cos * r, 0, -cos * f + sin * r);
    return dir.normalize();
  }

  update(dt, world) {
    this.slideCooldown = Math.max(0, this.slideCooldown - dt);
    if (this.slideTimer > 0) {
      this.slideTimer -= dt;
      if (this.slideTimer <= 0) this.slideCooldown = P.slideCooldown;
    }
    if (this.staggerTimer > 0) this.staggerTimer -= dt;

    const controllable = this.enabled && !this.staggered;

    // --- horizontal ---------------------------------------------------------
    if (controllable && !this.sliding) {
      const wish = this._wishDir();
      const accel = this.grounded ? P.accel : P.accel * P.airControl;
      if (wish) {
        this.vel.x += wish.x * accel * dt;
        this.vel.z += wish.z * accel * dt;
        const spd = this.horizontalSpeed;
        if (spd > P.sprintSpeed) { // sprint cap — always sprinting, never faster
          this.vel.x *= P.sprintSpeed / spd;
          this.vel.z *= P.sprintSpeed / spd;
        }
      } else if (this.grounded) {
        const damp = Math.max(0, 1 - 10 * dt);
        this.vel.x *= damp; this.vel.z *= damp;
      }
    } else if (this.grounded && !this.sliding) {
      const damp = Math.max(0, 1 - 8 * dt);
      this.vel.x *= damp; this.vel.z *= damp;
    }

    // --- jump / gravity -----------------------------------------------------
    if (controllable && this.grounded && !this.sliding &&
        (this.keys.has('Space'))) {
      this.vel.y = P.jumpVelocity;
      this.grounded = false;
    }
    this.vel.y -= P.gravity * dt;
    this.root.position.addScaledVector(this.vel, dt);

    const floorY = world && world.floorY !== undefined ? world.floorY : 0;
    if (this.root.position.y <= floorY) {
      this.root.position.y = floorY;
      this.vel.y = 0;
      this.grounded = true;
    }

    // --- world collision (corridor clamp + AABBs) ---------------------------
    if (world && world.collide) world.collide(this);

    // --- eye height (slide crouch), head bob, shake -------------------------
    const targetEye = this.sliding ? P.slideEyeHeight : P.eyeHeight;
    this.eyeCurrent += (targetEye - this.eyeCurrent) * Math.min(1, 14 * dt);
    this.shakeAmp = Math.max(0, this.shakeAmp - dt * 0.12);

    const spd = this.horizontalSpeed;
    if (this.grounded && spd > 1 && !this.sliding) {
      this.stepAccum += spd * dt;
      const stride = 2.1;
      if (this.stepAccum > stride) {
        this.stepAccum -= stride;
        if (this.onStep) this.onStep(spd / P.sprintSpeed);
      }
    }
    this._sync(spd);
  }

  _sync(spd = 0) {
    this.root.rotation.y = this.yaw;
    this.head.rotation.x = this.pitch;
    const t = performance.now() / 1000;
    const bob = this.grounded && !this.sliding ? Math.sin(t * 11) * 0.018 * Math.min(1, spd / P.sprintSpeed) : 0;
    const shake = this.shakeAmp > 0 ? (Math.random() - 0.5) * this.shakeAmp : 0;
    this.head.position.y = this.eyeCurrent + bob + shake;
    this.head.position.x = shake * 0.6;
  }
}

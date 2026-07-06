/* =========================================================================
 * input.js — keyboard, mouse look, and shot charging.
 *
 * Mouse look works in two modes:
 *   • pointer-locked  — hidden cursor, unlimited turning (preferred)
 *   • fallback        — plain cursor; look deltas still applied while active,
 *                       so the game is fully playable even if the browser
 *                       refuses pointer lock (common on file:// / some setups)
 * ========================================================================= */

class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.yaw = 0;
    this.pitch = 0;
    this.locked = false;         // pointer-lock engaged?
    this.active = false;         // is the match live (accept look/shoot)?
    this.sensitivity = 0.0022;

    this.charging = false;
    this.charge = 0;
    this.actions = { shoot: 0, pass: 0, tackle: 0 };

    this._bind();
  }

  _bind() {
    addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (!this.active) return;
      if (e.code === 'KeyF') this.actions.pass = 1;
      if (e.code === 'Space') this.actions.tackle = 1;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    });

    // apply look deltas whenever the match is live (locked OR cursor mode)
    document.addEventListener('mousemove', (e) => {
      if (!this.active) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch = clamp(this.pitch - e.movementY * this.sensitivity, -1.2, 0.75);
    });

    // LMB charges/shoots, RMB passes — only once the match is live
    addEventListener('mousedown', (e) => {
      if (!this.active) return;
      if (e.button === 0) { this.charging = true; this.charge = 0; }
      if (e.button === 2) this.actions.pass = 1;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0 && this.charging) {
        this.charging = false;
        this.actions.shoot = Math.max(this.charge, 0.15);   // quick taps still kick
      }
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  requestLock() {
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});   // ignore rejection; fallback look still works
    } catch (_) { /* pointer lock unavailable — fine */ }
  }

  moveVector() {
    let f = 0, s = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) f += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) f -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) s += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) s -= 1;
    const fwdX = Math.sin(this.yaw), fwdZ = Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw), rightZ = -Math.sin(this.yaw);
    return { x: fwdX * f + rightX * s, z: fwdZ * f + rightZ * s, mag: Math.hypot(f, s) };
  }

  sprinting() { return !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']); }

  update(dt) { if (this.charging) this.charge = clamp(this.charge + dt * 1.15, 0, 1); }

  consume(name) { const v = this.actions[name]; this.actions[name] = 0; return v; }
}

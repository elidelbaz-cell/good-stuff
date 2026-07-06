/* =========================================================================
 * input.js — keyboard, pointer-lock mouse look, and shot charging.
 * Exposes yaw/pitch, a movement vector, and edge-triggered actions the
 * game loop consumes each frame.
 * ========================================================================= */

class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.yaw = 0;
    this.pitch = 0;
    this.locked = false;
    this.sensitivity = 0.0022;

    this.charging = false;
    this.charge = 0;                 // 0..1 shot power while LMB held
    this.actions = { shoot: 0, pass: 0, tackle: 0, switch: 0 };

    this._bind();
  }

  _bind() {
    addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyF') this.actions.pass = 1;
      if (e.code === 'Space') this.actions.tackle = 1;
      if (e.code === 'KeyQ') this.actions.switch = 1;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    this.canvas.addEventListener('click', () => {
      if (!this.locked) this.canvas.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch -= e.movementY * this.sensitivity;
      this.pitch = clamp(this.pitch, -1.2, 0.75);
    });

    // LMB = charge & shoot, RMB = pass
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) { this.charging = true; this.charge = 0; }
      if (e.button === 2) this.actions.pass = 1;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0 && this.charging) {
        this.charging = false;
        this.actions.shoot = this.charge;      // pass power (0..1) as the action
      }
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // horizontal move vector relative to yaw: returns {x, z, mag}
  moveVector() {
    let f = 0, s = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) f += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) f -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) s += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) s -= 1;
    // forward = (sin yaw, cos yaw); right = (cos yaw, -sin yaw)
    const fwdX = Math.sin(this.yaw), fwdZ = Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw), rightZ = -Math.sin(this.yaw);
    const x = fwdX * f + rightX * s;
    const z = fwdZ * f + rightZ * s;
    return { x, z, mag: Math.hypot(f, s) };
  }

  sprinting() { return !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']); }

  update(dt) {
    if (this.charging) this.charge = clamp(this.charge + dt * 1.15, 0, 1);
  }

  // read + clear an edge action
  consume(name) { const v = this.actions[name]; this.actions[name] = 0; return v; }
}

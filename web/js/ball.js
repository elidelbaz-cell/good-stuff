/* =========================================================================
 * ball.js — the ball: low-poly mesh + arcade physics (gravity, bounce,
 * rolling friction, board/post collisions) and a rolling animation.
 * ========================================================================= */

class Ball {
  constructor(scene) {
    this.pos = new THREE.Vector3(0, CFG.BALL.r, 0);
    this.vel = new THREE.Vector3();
    this.r = CFG.BALL.r;
    this.kickLock = 0;          // seconds during which dribble-capture is suppressed
    this.lastTouch = null;      // team key of last player to touch it

    // low-poly ball: white icosphere with a few dark panels for that classic look
    const geo = new THREE.IcosahedronGeometry(this.r, 1);
    const colors = [];
    const white = new THREE.Color(0xf5f5f7), dark = new THREE.Color(0x22242b);
    const triCount = geo.attributes.position.count / 3;
    for (let i = 0; i < triCount; i++) {
      const c = i % 5 === 0 ? dark : white;
      for (let k = 0; k < 3; k++) colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);

    // blob shadow
    this.shadow = makeBlobShadow(this.r * 2.2);
    scene.add(this.shadow);
  }

  reset(x = 0, z = 0) {
    this.pos.set(x, this.r, z);
    this.vel.set(0, 0, 0);
    this.kickLock = 0;
    this.lastTouch = null;
  }

  // Apply a kick impulse (used by players). dir is a normalized xz vector-ish.
  kick(vx, vy, vz, byTeam) {
    this.vel.set(vx, vy, vz);
    this.kickLock = 0.35;
    if (byTeam) this.lastTouch = byTeam;
  }

  update(dt) {
    if (this.kickLock > 0) this.kickLock -= dt;
    const B = CFG.BALL;

    // gravity + air drag
    this.vel.y -= B.gravity * dt;
    const drag = Math.exp(-B.airDrag * dt);
    this.vel.x *= drag; this.vel.z *= drag;

    this.pos.addScaledVector(this.vel, dt);

    // ground contact
    if (this.pos.y <= this.r) {
      this.pos.y = this.r;
      if (this.vel.y < 0) this.vel.y = -this.vel.y * B.restitution;
      if (Math.abs(this.vel.y) < 0.6) this.vel.y = 0;
      // rolling friction (stronger when slow so it settles)
      const speed = Math.hypot(this.vel.x, this.vel.z);
      const k = speed > 6 ? 0.6 : 1.8;
      const f = Math.exp(-k * dt);
      this.vel.x *= f; this.vel.z *= f;
      if (speed < 0.15) { this.vel.x = 0; this.vel.z = 0; }
    }

    this._collideBounds();
    this._collidePosts();

    this.mesh.position.copy(this.pos);
    this._roll(dt);

    this.shadow.position.set(this.pos.x, 0.02, this.pos.z);
    const s = clamp(1.6 - this.pos.y * 0.25, 0.5, 1.6);
    this.shadow.scale.setScalar(s);
  }

  // Futsal-style rebound boards on the touchlines; goal mouths stay open.
  _collideBounds() {
    const L = CFG.LINES, GO = CFG.GOAL, e = 0.62;
    // touchlines (x)
    if (this.pos.x < -L.halfW + this.r) { this.pos.x = -L.halfW + this.r; this.vel.x = Math.abs(this.vel.x) * e; }
    if (this.pos.x >  L.halfW - this.r) { this.pos.x =  L.halfW - this.r; this.vel.x = -Math.abs(this.vel.x) * e; }
    // goal lines (z): open only between the posts and under the bar
    for (const s of [-1, 1]) {
      const line = s * L.halfL;
      const beyond = s > 0 ? this.pos.z > line - this.r : this.pos.z < line + this.r;
      if (!beyond) continue;
      const inMouth = Math.abs(this.pos.x) < GO.halfWidth - this.r && this.pos.y < GO.height - this.r;
      if (inMouth) {
        // let it fly into the net; net backstop stops it
        const netZ = s * (GO.lineZ + GO.depth - this.r);
        if (s > 0 ? this.pos.z > netZ : this.pos.z < netZ) {
          this.pos.z = netZ; this.vel.multiplyScalar(0.1);
        }
      } else {
        // hit the board outside the goal
        this.pos.z = s > 0 ? line - this.r : line + this.r;
        this.vel.z = -this.vel.z * e;
      }
    }
  }

  // Bounce off the two goal posts of each goal.
  _collidePosts() {
    const GO = CFG.GOAL;
    for (const s of [-1, 1]) {
      const z = s * GO.lineZ;
      if (Math.abs(this.pos.z - z) > 1.2) continue;
      for (const px of [-GO.halfWidth, GO.halfWidth]) {
        const dx = this.pos.x - px, dz = this.pos.z - z;
        const d = Math.hypot(dx, dz), min = this.r + GO.postR;
        if (d < min && d > 1e-4 && this.pos.y < GO.height) {
          const nx = dx / d, nz = dz / d;
          this.pos.x = px + nx * min; this.pos.z = z + nz * min;
          const vn = this.vel.x * nx + this.vel.z * nz;
          this.vel.x -= 1.6 * vn * nx; this.vel.z -= 1.6 * vn * nz;
        }
      }
    }
  }

  // Rotate the mesh so it looks like it's rolling along its velocity.
  _roll(dt) {
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (speed < 0.05) return;
    const axis = _v0.set(this.vel.z, 0, -this.vel.x).normalize();
    const angle = (speed * dt) / this.r;
    this.mesh.rotateOnWorldAxis(axis, angle);
  }
}

// Shared helper: a soft dark circle used as a fake shadow.
function makeBlobShadow(radius) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grd.addColorStop(0, 'rgba(0,0,0,0.42)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius, radius), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  m.renderOrder = -1;
  return m;
}

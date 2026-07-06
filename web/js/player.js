/* =========================================================================
 * player.js — footballers: low-poly humanoid mesh, running animation,
 * steering movement, and per-role AI (chase / dribble / shoot / pass /
 * support / defend / goalkeep).
 * ========================================================================= */

class Player {
  constructor(scene, opts) {
    this.scene = scene;
    this.team = opts.team;            // 'home' | 'away'
    this.role = opts.role;            // 'GK' | 'DEF' | 'MID' | 'ST'
    this.isKeeper = opts.role === 'GK';
    this.isHuman = !!opts.isHuman;
    this.anchor = new THREE.Vector2(opts.anchor.x, opts.anchor.z);

    this.pos = new THREE.Vector3(opts.anchor.x, 0, opts.anchor.z);
    this.vel = new THREE.Vector3();
    this.yaw = this.team === 'home' ? 0 : Math.PI;
    this.speed = 0;
    this.phase = Math.random() * TAU;    // running-cycle phase
    this.shotCd = 0;

    this._buildMesh();
    this.shadow = makeBlobShadow(1.4);
    scene.add(this.shadow);
  }

  // --- geometry ------------------------------------------------------------
  _buildMesh() {
    const c = CFG.colors;
    const jersey = this.team === 'home' ? c.home : c.away;
    const shorts = this.team === 'home' ? c.homeDark : c.awayDark;
    const mat = (col) => new THREE.MeshLambertMaterial({ color: col, flatShading: true });
    const box = (w, h, d, col) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(col));

    const g = new THREE.Group();
    this.parts = {};

    // torso + head
    const torso = box(0.52, 0.62, 0.3, jersey); torso.position.y = 1.16;
    const head = box(0.3, 0.3, 0.3, c.skin); head.position.y = 1.62;
    g.add(torso, head);
    this.parts.torso = torso; this.parts.head = head;
    if (this.isKeeper) torso.material.color.offsetHSL(0, 0, 0.12); // lighter GK kit

    // limbs built around pivots so we can swing them
    const limb = (px, shoulder, upperCol, lowerCol, upperH, lowerH, isLeg) => {
      const pivot = new THREE.Group();
      pivot.position.set(px, shoulder, 0);
      const upper = box(isLeg ? 0.18 : 0.14, upperH, isLeg ? 0.2 : 0.16, upperCol);
      upper.position.y = -upperH / 2;
      const lower = box(isLeg ? 0.15 : 0.12, lowerH, isLeg ? 0.17 : 0.14, lowerCol);
      lower.position.y = -upperH - lowerH / 2;
      pivot.add(upper, lower);
      if (isLeg) {
        const boot = box(0.18, 0.12, 0.32, c.boots);
        boot.position.set(0, -upperH - lowerH, 0.06);
        pivot.add(boot);
      }
      g.add(pivot);
      return pivot;
    };
    this.parts.lleg = limb(-0.14, 0.86, shorts, c.skin, 0.44, 0.36, true);
    this.parts.rleg = limb(0.14, 0.86, shorts, c.skin, 0.44, 0.36, true);
    this.parts.larm = limb(-0.33, 1.42, jersey, c.skin, 0.32, 0.3, false);
    this.parts.rarm = limb(0.33, 1.42, jersey, c.skin, 0.32, 0.3, false);

    g.position.copy(this.pos);
    this.mesh = g;
    this.scene.add(g);
  }

  // Hide the upper body for the local first-person player (keep legs visible).
  setFirstPerson() {
    this.parts.head.visible = false;
    this.parts.torso.visible = false;
    this.parts.larm.visible = false;
    this.parts.rarm.visible = false;
  }

  forward() { return _v0.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  // --- movement ------------------------------------------------------------
  // Steer toward (tx,tz) at up to `cap` m/s using simple accel toward target.
  steerTo(tx, tz, cap, dt) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) { this.vel.multiplyScalar(0.6); return; }
    const desiredX = (dx / d) * cap, desiredZ = (dz / d) * cap;
    const a = CFG.PLAYER.accel * dt;
    this.vel.x = approach(this.vel.x, desiredX, a);
    this.vel.z = approach(this.vel.z, desiredZ, a);
    // face travel direction (AI); humans face their camera separately
    if (!this.isHuman && d > 0.2) {
      const want = Math.atan2(dx, dz);
      this.yaw += angleDelta(this.yaw, want) * clamp(CFG.PLAYER.turn * dt, 0, 1);
    }
  }

  // Directly drive velocity from an input vector (local player).
  driveInput(fx, fz, cap, dt) {
    const m = Math.hypot(fx, fz);
    const a = CFG.PLAYER.accel * dt;
    const dX = m > 0 ? (fx / m) * cap : 0;
    const dZ = m > 0 ? (fz / m) * cap : 0;
    this.vel.x = approach(this.vel.x, dX, a);
    this.vel.z = approach(this.vel.z, dZ, a);
  }

  integrate(dt) {
    this.pos.addScaledVector(this.vel, dt);
    // keep players inside the boards
    const L = CFG.LINES, m = 0.6;
    this.pos.x = clamp(this.pos.x, -L.halfW - 1 + m, L.halfW + 1 - m);
    this.pos.z = clamp(this.pos.z, -L.halfL - 2 + m, L.halfL + 2 - m);
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.shotCd > 0) this.shotCd -= dt;

    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    this._animate(dt);

    this.shadow.position.set(this.pos.x, 0.02, this.pos.z);
  }

  _animate(dt) {
    const moving = this.speed > 0.3;
    const freq = 2.2 + this.speed * 0.9;
    if (moving) this.phase += freq * dt; else this.phase *= 1; // freeze phase when idle
    const amp = clamp(this.speed / CFG.PLAYER.run, 0, 1) * 0.9;
    const s = Math.sin(this.phase) * amp;
    this.parts.lleg.rotation.x = s;
    this.parts.rleg.rotation.x = -s;
    this.parts.larm.rotation.x = -s * 0.8;
    this.parts.rarm.rotation.x = s * 0.8;
    this.mesh.position.y = moving ? Math.abs(Math.sin(this.phase)) * 0.05 : 0;
  }

  // ======================================================================
  //  AI — called for every non-human player each frame.
  // ======================================================================
  think(game, dt) {
    if (this.isKeeper) return this._keeper(game, dt);
    const dir = game.attackDir(this.team);
    const ball = game.ball;

    if (game.chaser[this.team] === this) {
      if (game.controller === this) this._onBall(game, dt, dir);
      else this._chase(game, dt);
    } else if (game.possessionTeam === this.team) {
      this._support(game, dt, dir);
    } else {
      this._defend(game, dt, dir);
    }
  }

  _chase(game, dt) {
    const b = game.ball;
    const tx = b.pos.x + b.vel.x * 0.15;
    const tz = b.pos.z + b.vel.z * 0.15;
    this.steerTo(tx, tz, CFG.PLAYER.run, dt);
  }

  _onBall(game, dt, dir) {
    const goalZ = game.oppGoalZ(this.team);
    const goal = _v1.set(clamp(game.ball.pos.x * 0.4, -3, 3), 0, goalZ);
    const distGoal = distXZ(this.pos, goal);
    const opp = game.nearestOpponent(this);
    const pressed = opp && opp.dist < 2.7;

    // shoot when close to goal and roughly lined up
    if (this.shotCd <= 0 && distGoal < 26) {
      const toGoal = Math.atan2(goal.x - this.pos.x, goalZ - this.pos.z);
      if (Math.abs(angleDelta(this.yaw, toGoal)) < 0.6 || distGoal < 12) {
        return this._shoot(game, goal, distGoal);
      }
    }
    // pass out of pressure
    if (pressed) {
      const mate = game.bestPassTarget(this);
      if (mate) return this._pass(game, mate);
    }
    // otherwise dribble toward goal (steer; ball is nudged by game dribble system)
    this.steerTo(goal.x, goalZ, CFG.PLAYER.run * 0.92, dt);
  }

  _shoot(game, goal, distGoal) {
    const b = game.ball;
    const dx = goal.x - this.pos.x, dz = goal.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const power = clamp(16 + distGoal * 0.5, 16, 30);
    const spread = 0.12;
    const nx = (dx / d) + rand(-spread, spread);
    const nz = (dz / d) + rand(-spread, spread);
    const nm = Math.hypot(nx, nz) || 1;
    b.kick((nx / nm) * power, rand(4, 7), (nz / nm) * power, this.team);
    this.shotCd = 1.2;
  }

  _pass(game, mate) {
    const b = game.ball;
    const lead = 0.25;
    const tx = mate.pos.x + mate.vel.x * lead;
    const tz = mate.pos.z + mate.vel.z * lead;
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const power = clamp(d * 1.15, 8, 20);
    b.kick((dx / d) * power, 3.2, (dz / d) * power, this.team);
    this.shotCd = 0.6;
  }

  _support(game, dt, dir) {
    const b = game.ball;
    // advance toward opponent half, spread laterally around the ball
    const halfW = CFG.LINES.halfW;
    const tx = clamp(this.anchor.x + (b.pos.x - this.anchor.x) * 0.35, -halfW + 3, halfW - 3);
    let tz = this.anchor.y + dir * 12 + b.pos.z * 0.25;
    tz = clamp(tz, -CFG.LINES.halfL + 4, CFG.LINES.halfL - 4);
    this.steerTo(tx, tz, CFG.PLAYER.run * 0.85, dt);
  }

  _defend(game, dt, dir) {
    const b = game.ball;
    const ownZ = game.ownGoalZ(this.team);
    // sit on the line between ball and own goal, biased to formation anchor
    const midx = lerp(b.pos.x, 0, 0.45);
    const midz = lerp(b.pos.z, ownZ, 0.4);
    const tx = clamp(lerp(this.anchor.x, midx, 0.6), -CFG.LINES.halfW + 2, CFG.LINES.halfW - 2);
    const tz = lerp(this.anchor.y, midz, 0.6);
    this.steerTo(tx, tz, CFG.PLAYER.run * 0.9, dt);
  }

  _keeper(game, dt) {
    const b = game.ball;
    const dir = game.attackDir(this.team);
    const ownZ = game.ownGoalZ(this.team);
    const lineZ = ownZ + dir * 2.2;                 // stand just off the line
    const gw = CFG.GOAL.halfWidth - 0.5;
    let tx = clamp(b.pos.x * 0.55, -gw, gw);
    let tz = lineZ;

    // rush out if the ball is close and in front of goal
    const inBox = Math.abs(b.pos.x) < 12 &&
      (dir > 0 ? b.pos.z < ownZ + 16 : b.pos.z > ownZ - 16);
    const near = distXZ(this.pos, b.pos) < 9;
    if (inBox && near) { tx = b.pos.x; tz = lerp(lineZ, b.pos.z, 0.5); }

    this.steerTo(tx, tz, CFG.PLAYER.run * (inBox && near ? 1.0 : 0.8), dt);

    // clear the ball hard upfield when it's at the keeper's feet
    if (distXZ(this.pos, b.pos) < CFG.CONTROL.kickRange && b.pos.y < 1.6) {
      const upfield = -dir;                          // toward opponent goal
      b.kick(rand(-4, 4), 6, upfield * 22, this.team);
    }
  }
}

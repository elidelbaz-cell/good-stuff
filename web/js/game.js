/* =========================================================================
 * game.js — the match: renderer/camera, teams & formations, possession &
 * assignment logic, dribbling, human control, goals, clock and rules.
 * ========================================================================= */

class Game {
  constructor() {
    this.canvas = document.getElementById('view');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.1, 400);

    this.world = new World(this.scene);
    this.ball = new Ball(this.scene);
    this.input = new Input(this.canvas);
    this.hud = new Hud();

    this.players = [];
    this.chaser = { home: null, away: null };
    this.controller = null;
    this.possessionTeam = null;

    this.score = { home: 0, away: 0 };
    this.gameTime = 0;                 // match minutes, 0..90
    this.matchRealSeconds = 165;       // real seconds for a full match
    this.state = 'menu';               // menu | play | goal | fulltime
    this.restartTimer = 0;
    this.stamina = 1;
    this.dashTimer = 0;
    this.started = false;

    this._buildTeams();
    this._resize();
    addEventListener('resize', () => this._resize());
    addEventListener('keydown', (e) => { if (e.code === 'Enter') this._onEnter(); });

    this.input.onLockChange = (locked) => this._onLock(locked);

    this.hud.say('Welcome to Low-Poly Volta Arena — click to kick off!');
    this._last = performance.now();
    requestAnimationFrame((t) => this._loop(t));
  }

  // ---- team / formation setup -------------------------------------------
  _formation() {
    // blue (home) attacks +z; own goal at z=-40. away is the mirror.
    return [
      { role: 'GK',  x: 0,   z: -37 },
      { role: 'DEF', x: -13, z: -24 },
      { role: 'DEF', x: 13,  z: -24 },
      { role: 'MID', x: 0,   z: -12 },
      { role: 'ST',  x: 2,   z: -3 },
    ];
  }

  _buildTeams() {
    const form = this._formation();
    // human = the home striker (last entry)
    form.forEach((f, i) => {
      const p = new Player(this.scene, {
        team: 'home', role: f.role, anchor: { x: f.x, z: f.z },
        isHuman: i === form.length - 1,
      });
      if (p.isHuman) { this.human = p; p.setFirstPerson(); }
      this.players.push(p);
    });
    // away mirror (negate z; negate x to keep the shape symmetric)
    form.forEach((f) => {
      const p = new Player(this.scene, {
        team: 'away', role: f.role, anchor: { x: -f.x, z: -f.z },
      });
      this.players.push(p);
    });
    this.home = this.players.filter((p) => p.team === 'home');
    this.away = this.players.filter((p) => p.team === 'away');
  }

  attackDir(team) { return team === 'home' ? 1 : -1; }
  oppGoalZ(team) { return this.attackDir(team) * CFG.GOAL.lineZ; }
  ownGoalZ(team) { return -this.attackDir(team) * CFG.GOAL.lineZ; }
  outfield(team) { return this.players.filter((p) => p.team === team && !p.isKeeper); }

  // ---- lifecycle ---------------------------------------------------------
  _onLock(locked) {
    document.getElementById('overlay').style.display = locked ? 'none' : 'flex';
    if (locked && !this.started) {
      this.started = true;
      this._kickoff('home', true);
    }
  }

  _onEnter() {
    if (this.state === 'fulltime') {
      this.score = { home: 0, away: 0 };
      this.hud.setScore(0, 0);
      this.gameTime = 0;
      this.started = false;
      if (this.input.locked) { this.started = true; this._kickoff('home', true); }
    }
  }

  _kickoff(team, matchStart) {
    const form = this._formation();
    this.home.forEach((p, i) => { p.pos.set(form[i].x, 0, form[i].z); p.vel.set(0, 0, 0); p.yaw = 0; });
    this.away.forEach((p, i) => { p.pos.set(-form[i].x, 0, -form[i].z); p.vel.set(0, 0, 0); p.yaw = Math.PI; });
    this.ball.reset(0, 0);
    this.state = 'play';
    this.restartTimer = 0;
    if (matchStart) {
      this.hud.bigAnnounce('KICK OFF', `${CFG.colors.homeName} vs ${CFG.colors.awayName}`);
      this.hud.say('Kick off! You are the striker in yellow on the radar.');
    } else {
      this.hud.bigAnnounce('KICK OFF', null, 1400);
    }
  }

  _onGoal(scorer) {
    this.score[scorer]++;
    this.hud.setScore(this.score.home, this.score.away);
    const name = scorer === 'home' ? CFG.colors.homeName : CFG.colors.awayName;
    const mine = scorer === 'home';
    this.hud.bigAnnounce('G O A L !', `${name} scores — ${this.score.home} : ${this.score.away}`, 2600);
    this.hud.say(mine ? 'What a finish! Get back for the restart.' : `${name} punish it — heads up!`);
    this.ball.vel.multiplyScalar(0.05);
    this.state = 'goal';
    this.restartTimer = 2.6;
  }

  _fullTime() {
    this.state = 'fulltime';
    const h = this.score.home, a = this.score.away;
    const res = h > a ? `${CFG.colors.homeName} WIN` : a > h ? `${CFG.colors.awayName} WIN` : 'DRAW';
    this.hud.bigAnnounce('FULL TIME', `${res}  —  ${h} : ${a}   (press Enter to replay)`, 999999);
    this.hud.say('Full time. Press Enter to play again.');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // ---- possession / assignment ------------------------------------------
  _updateAssignments() {
    // controller = closest player within control radius (ball must be low)
    let best = null, bd = CFG.CONTROL.radius;
    if (this.ball.pos.y < 1.3) {
      for (const p of this.players) {
        const d = distXZ(p.pos, this.ball.pos);
        if (d < bd) { bd = d; best = p; }
      }
    }
    this.controller = best;
    if (best) this.ball.lastTouch = best.team;
    this.possessionTeam = best ? best.team : this.ball.lastTouch;

    // chaser per team = outfield player closest to the (slightly predicted) ball
    const bx = this.ball.pos.x + this.ball.vel.x * 0.12;
    const bz = this.ball.pos.z + this.ball.vel.z * 0.12;
    for (const team of ['home', 'away']) {
      let bp = null, bmin = Infinity;
      for (const p of this.outfield(team)) {
        const d = Math.hypot(p.pos.x - bx, p.pos.z - bz);
        if (d < bmin) { bmin = d; bp = p; }
      }
      this.chaser[team] = bp;
    }
  }

  // Soft dribble: the controller carries the ball just ahead of their feet.
  _dribble(dt) {
    const c = this.controller;
    if (!c || this.ball.kickLock > 0 || this.ball.pos.y > 1.2) return;
    const fwd = c.isHuman
      ? { x: Math.sin(this.input.yaw), z: Math.cos(this.input.yaw) }
      : { x: Math.sin(c.yaw), z: Math.cos(c.yaw) };
    const ahead = CFG.CONTROL.dribbleAhead;
    const desiredX = c.pos.x + fwd.x * ahead;
    const desiredZ = c.pos.z + fwd.z * ahead;
    const stiff = 6.5;
    let vx = c.vel.x + (desiredX - this.ball.pos.x) * stiff;
    let vz = c.vel.z + (desiredZ - this.ball.pos.z) * stiff;
    const sp = Math.hypot(vx, vz), cap = 17;
    if (sp > cap) { vx = (vx / sp) * cap; vz = (vz / sp) * cap; }
    this.ball.vel.x = vx; this.ball.vel.z = vz;
  }

  // Players nudge the ball when they run into it (loose-ball deflections).
  _bodyCollisions() {
    const rr = CFG.PLAYER.radius + this.ball.r;
    for (const p of this.players) {
      if (p === this.controller) continue;
      const dx = this.ball.pos.x - p.pos.x, dz = this.ball.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < rr && d > 1e-3 && this.ball.pos.y < 1.4) {
        const nx = dx / d, nz = dz / d;
        this.ball.pos.x = p.pos.x + nx * rr;
        this.ball.pos.z = p.pos.z + nz * rr;
        const push = 2 + p.speed;
        this.ball.vel.x = nx * push + p.vel.x * 0.5;
        this.ball.vel.z = nz * push + p.vel.z * 0.5;
        this.ball.lastTouch = p.team;
      }
    }
  }

  nearestOpponent(player) {
    let best = null, bd = Infinity;
    for (const p of this.players) {
      if (p.team === player.team) continue;
      const d = distXZ(p.pos, player.pos);
      if (d < bd) { bd = d; best = p; }
    }
    return best ? { player: best, dist: bd } : null;
  }

  bestPassTarget(player) {
    const dir = this.attackDir(player.team);
    let best = null, score = -Infinity;
    for (const p of this.players) {
      if (p.team !== player.team || p === player || p.isKeeper) continue;
      const forwardness = (p.pos.z - player.pos.z) * dir;     // ahead is good
      const dist = distXZ(p.pos, player.pos);
      if (dist < 4 || dist > 45) continue;
      const opp = this.nearestOpponent(p);
      const open = opp ? clamp(opp.dist, 0, 8) : 8;           // more open is good
      const s = forwardness * 1.2 + open * 1.5 - dist * 0.15;
      if (s > score) { score = s; best = p; }
    }
    return best;
  }

  // ---- human control -----------------------------------------------------
  _handleHuman(dt) {
    const mv = this.input.moveVector();
    const wantSprint = this.input.sprinting() && this.stamina > 0.02 && mv.mag > 0;
    let cap = wantSprint ? CFG.PLAYER.sprint : (mv.mag > 0 ? CFG.PLAYER.run : 0);
    if (this.dashTimer > 0) { cap += 4.5; this.dashTimer -= dt; }
    this.human.driveInput(mv.x, mv.z, cap, dt);
    this.human.yaw = this.input.yaw;

    // stamina
    if (wantSprint) this.stamina = clamp(this.stamina - dt * 0.24, 0, 1);
    else this.stamina = clamp(this.stamina + dt * 0.16, 0, 1);

    // actions
    const shoot = this.input.consume('shoot');
    if (shoot > 0) this._humanKick(shoot, false);
    if (this.input.consume('pass')) this._humanKick(0.5, true);
    if (this.input.consume('tackle') && this.dashTimer <= 0) {
      this.dashTimer = 0.4;
      this.hud.say('Sprint tackle!');
    }
  }

  _humanKick(power01, isPass) {
    if (distXZ(this.human.pos, this.ball.pos) > CFG.CONTROL.kickRange + 0.5) return;
    let fx = Math.sin(this.input.yaw), fz = Math.cos(this.input.yaw);
    if (isPass) {
      const mate = this.bestPassTarget(this.human);
      if (mate) {
        const dx = mate.pos.x - this.human.pos.x, dz = mate.pos.z - this.human.pos.z;
        const d = Math.hypot(dx, dz) || 1; fx = dx / d; fz = dz / d;
      }
      const p = 16;
      this.ball.kick(fx * p, 3, fz * p, 'home');
      this.hud.say(mate ? 'Nice pass!' : 'Ball played forward.');
    } else {
      const p = lerp(15, 31, power01);
      const loft = lerp(2.5, 7, power01);
      this.ball.kick(fx * p, loft, fz * p, 'home');
      this.hud.say(power01 > 0.75 ? 'Big strike!' : 'Shot away!');
    }
  }

  // ---- goals -------------------------------------------------------------
  _checkGoal() {
    const b = this.ball, GO = CFG.GOAL;
    const inMouth = Math.abs(b.pos.x) < GO.halfWidth && b.pos.y < GO.height;
    if (!inMouth) return;
    if (b.pos.z > GO.lineZ + 0.05) this._onGoal('home');       // away net (blue attacks +z)
    else if (b.pos.z < -GO.lineZ - 0.05) this._onGoal('away');  // home net
  }

  // ---- camera ------------------------------------------------------------
  _updateCamera() {
    const eye = this.human.pos;
    this.camera.position.set(eye.x, eye.y + CFG.PLAYER.eye, eye.z);
    const yaw = this.input.yaw, pitch = this.input.pitch;
    const cy = Math.cos(pitch);
    _v0.set(
      this.camera.position.x + Math.sin(yaw) * cy,
      this.camera.position.y + Math.sin(pitch),
      this.camera.position.z + Math.cos(yaw) * cy,
    );
    this.camera.lookAt(_v0);
  }

  // ---- main loop ---------------------------------------------------------
  _resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _simulate(dt) {
    if (this.state === 'play') {
      this.gameTime += dt * (90 / this.matchRealSeconds);
      if (this.gameTime >= 90) { this.gameTime = 90; this._fullTime(); }

      this._updateAssignments();
      this._handleHuman(dt);
      for (const p of this.players) if (!p.isHuman) p.think(this, dt);
      for (const p of this.players) p.integrate(dt);
      this._dribble(dt);
      this._bodyCollisions();
      this.ball.update(dt);
      this._checkGoal();
    } else if (this.state === 'goal') {
      // brief celebration, players jog, ball settles
      for (const p of this.players) { if (!p.isHuman) p.think(this, dt); p.integrate(dt); }
      this._handleHuman(dt);
      this.ball.update(dt);
      this.restartTimer -= dt;
      if (this.restartTimer <= 0) {
        const conceded = this.ball.lastTouch === 'home' ? 'away' : 'home';
        this._kickoff(conceded, false);
      }
    }
  }

  _loop(now) {
    let dt = (now - this._last) / 1000;
    this._last = now;
    dt = Math.min(dt, 0.05);

    this.input.update(dt);
    if (this.input.locked && this.state !== 'fulltime') this._simulate(dt);

    this._updateCamera();
    this.hud.update(dt);
    this.hud.setClock(this.gameTime * 60);
    this.hud.setStamina(this.stamina);
    this.hud.setPower(this.input.charging, this.input.charge);
    this.hud.drawRadar(this);

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame((t) => this._loop(t));
  }
}

addEventListener('load', () => { window.game = new Game(); });

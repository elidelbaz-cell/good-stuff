// First-person weapons: low-poly view models, recoil, muzzle flash, tracers,
// reload, ammo, and hitscan against static geometry + registered targets.
import * as THREE from 'three';
import { WEAPONS } from '../core/config.js';
import { bus } from '../core/bus.js';
import { box, mat, clamp, damp, rand, raycastColliders } from '../core/utils.js';

const ORDER = ['fists', 'pistol', 'tommy', 'shotgun'];

export class Weapons {
  constructor(G) {
    this.G = G;
    this.slot = 1;
    this.mag = { pistol: WEAPONS.pistol.mag, tommy: WEAPONS.tommy.mag, shotgun: WEAPONS.shotgun.mag };
    this.cooldown = 0;
    this.reloading = false;
    this.reloadT = 0;
    this.recoil = 0;
    this.recoilKick = 0;
    this.sway = new THREE.Vector2();
    this.punchArm = 0;

    // view-model rig attached to the camera
    this.rig = new THREE.Group();
    G.camera.add(this.rig);
    if (!G.scene.children.includes(G.camera)) G.scene.add(G.camera);
    this.rig.position.set(0, 0, 0);

    this.models = {};
    this.buildModels();
    this.setSlot(1, true);

    this._o = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._hit = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
  }

  key() { return ORDER[this.slot]; }
  current() { return WEAPONS[this.key()]; }
  slotUnlocked(i) {
    const k = ORDER[i];
    if (k === 'fists' || k === 'pistol') return true;
    return !!this.G.state?.weapons[k];
  }

  buildModels() {
    // Each model is a small group positioned lower-right of the view.
    const g = (name) => { const gr = new THREE.Group(); gr.visible = false; this.rig.add(gr); this.models[name] = gr; return gr; };
    const part = (parent, w, h, d, color, x, y, z) => {
      const m = new THREE.Mesh(box(w, h, d), mat(color));
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };

    // fists — two blocky hands
    const fists = g('fists');
    this.fistL = part(fists, 0.16, 0.16, 0.28, '#d9a878', -0.28, -0.34, -0.5);
    this.fistR = part(fists, 0.16, 0.16, 0.28, '#d9a878', 0.28, -0.34, -0.5);

    // pistol
    const pistol = g('pistol');
    part(pistol, 0.09, 0.16, 0.34, '#26292f', 0.3, -0.34, -0.55);   // slide
    part(pistol, 0.08, 0.18, 0.12, '#1a1c21', 0.3, -0.46, -0.42);   // grip
    part(pistol, 0.14, 0.14, 0.22, '#c98a5a', 0.28, -0.35, -0.36);  // hand
    this.pistolMuzzle = new THREE.Object3D(); this.pistolMuzzle.position.set(0.3, -0.32, -0.74); pistol.add(this.pistolMuzzle);

    // tommy gun
    const tommy = g('tommy');
    part(tommy, 0.1, 0.14, 0.7, '#3a2b1c', 0.26, -0.32, -0.7);      // body
    part(tommy, 0.08, 0.1, 0.45, '#22242a', 0.26, -0.28, -1.0);     // barrel
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 12), mat('#2a2c32'));
    drum.rotation.x = Math.PI / 2; drum.position.set(0.26, -0.42, -0.72); tommy.add(drum);
    part(tommy, 0.08, 0.18, 0.1, '#4a3a28', 0.26, -0.46, -0.5);     // grip
    part(tommy, 0.14, 0.14, 0.2, '#c98a5a', 0.24, -0.34, -0.42);    // hand
    this.tommyMuzzle = new THREE.Object3D(); this.tommyMuzzle.position.set(0.26, -0.28, -1.25); tommy.add(this.tommyMuzzle);

    // shotgun
    const shotgun = g('shotgun');
    part(shotgun, 0.11, 0.13, 0.95, '#4a352c', 0.27, -0.32, -0.85);  // stock/body
    part(shotgun, 0.08, 0.1, 0.5, '#2a2c32', 0.27, -0.3, -1.15);     // barrel
    part(shotgun, 0.1, 0.08, 0.3, '#6a4a30', 0.27, -0.4, -0.75);     // pump
    part(shotgun, 0.14, 0.14, 0.2, '#c98a5a', 0.25, -0.34, -0.5);    // hand
    this.shotgunMuzzle = new THREE.Object3D(); this.shotgunMuzzle.position.set(0.27, -0.3, -1.45); shotgun.add(this.shotgunMuzzle);
  }

  syncFromState() {
    // if current slot became invalid, drop to pistol
    if (!this.slotUnlocked(this.slot)) this.setSlot(1);
  }

  setSlot(i, force = false) {
    if (i < 0 || i > 3) return;
    if (!this.slotUnlocked(i)) { this.G.hud?.toast('locked — buy it at the base'); return; }
    if (i === this.slot && !force) return;
    this.slot = i;
    this.reloading = false;
    this.reloadT = 0;
    for (const k of ORDER) this.models[k].visible = (k === ORDER[i]);
    this.raiseAnim = 0.25;
  }

  startReload() {
    const k = this.key();
    if (this.current().melee || this.reloading) return;
    if (this.mag[k] >= this.current().mag) return;
    if (this.G.state.ammo[k] <= 0) { this.G.hud?.toast('no ' + k + ' ammo'); return; }
    this.reloading = true;
    this.reloadT = this.current().reload;
    this.G.audio.reload();
  }

  finishReload() {
    const k = this.key();
    const need = this.current().mag - this.mag[k];
    const take = Math.min(need, this.G.state.ammo[k]);
    this.mag[k] += take;
    this.G.state.ammo[k] -= take;
    this.reloading = false;
  }

  tryFire() {
    const w = this.current();
    if (this.cooldown > 0) return;
    if (w.melee) { this.melee(); return; }
    const k = this.key();
    if (this.reloading) return;
    if (this.mag[k] <= 0) {
      this.cooldown = 0.2;
      this.G.audio.tone?.(this.G.audio.now?.() ?? 0, { freq: 200, decay: 0.05, peak: 0.1 });
      this.startReload();
      return;
    }
    this.mag[k]--;
    this.cooldown = 1 / w.rate;
    this.fireShot(w);
  }

  fireShot(w) {
    const G = this.G;
    G.audio.shot(this.key());
    // recoil
    this.recoil = Math.min(this.recoil + w.kick, 2.2);
    this.recoilKick = w.kick;
    G.player.shake = Math.min(G.player.shake + w.kick * 0.08, 0.35);

    // origin/dir from camera
    G.camera.getWorldDirection(this._d);
    this._o.copy(G.camera.position);

    // muzzle flash in world space
    const muzzle = this[this.key() + 'Muzzle'];
    if (muzzle) {
      muzzle.getWorldPosition(this._tmp);
      G.fx.muzzle(this._tmp, this._d, w.pellets ? 1.5 : 1);
    }

    const pellets = w.pellets || 1;
    for (let p = 0; p < pellets; p++) {
      this._d.copy(G.player.aimDir(this._tmp));
      // spread
      const s = w.spread;
      this._d.x += rand(-s, s); this._d.y += rand(-s, s); this._d.z += rand(-s, s);
      this._d.normalize();
      this.hitscan(this._o, this._d, w.dmg, w.range || 200);
    }

    bus.emit('gunfire', { x: G.player.pos.x, z: G.player.pos.z, radius: 30 });
    // auto-reload when empty
    if (this.mag[this.key()] <= 0) this.startReload();
  }

  hitscan(o, d, dmg, maxDist) {
    const G = this.G;
    let bestT = raycastColliders(o, d, maxDist, G.city.grid);
    let bestTarget = null;
    for (const tgt of G.targets) {
      if (!tgt.alive()) continue;
      const t = tgt.hitTest(o, d, bestT ?? maxDist);
      if (t !== null && (bestT === null || t < bestT)) { bestT = t; bestTarget = tgt; }
    }
    const dist = bestT ?? maxDist;
    this._hit.copy(o).addScaledVector(d, dist);
    // tracer from muzzle-ish to hit
    const muzzle = this[this.key() + 'Muzzle'];
    const from = muzzle ? muzzle.getWorldPosition(new THREE.Vector3()) : o;
    G.fx.tracer(from, this._hit);

    if (bestTarget) {
      const kind = bestTarget.kind;
      G.fx.impact(this._hit, d.clone().multiplyScalar(-1), kind === 'car' ? 'metal' : 'flesh');
      bestTarget.damage(dmg, true);
      const killed = !bestTarget.alive();
      G.hud.hitmarker ? bus.emit('hitmarker', killed) : null;
      G.audio.hitmark();
    } else if (bestT !== null) {
      G.fx.impact(this._hit, d.clone().multiplyScalar(-1), 'wall');
    }
  }

  melee() {
    const w = WEAPONS.fists;
    this.cooldown = 1 / w.rate;
    this.punchArm = 1;
    this.G.audio.punch();
    // short-range hitscan straight ahead
    this.G.camera.getWorldDirection(this._d);
    this._o.copy(this.G.camera.position);
    let bestT = null, bestTarget = null;
    for (const tgt of this.G.targets) {
      if (!tgt.alive()) continue;
      const t = tgt.hitTest(this._o, this._d, w.range);
      if (t !== null && (bestT === null || t < bestT)) { bestT = t; bestTarget = tgt; }
    }
    if (bestTarget && bestT <= w.range) {
      this._hit.copy(this._o).addScaledVector(this._d, bestT);
      this.G.fx.impact(this._hit, this._d.clone().multiplyScalar(-1), bestTarget.kind === 'car' ? 'metal' : 'flesh');
      bestTarget.damage(w.dmg, true);
      bus.emit('hitmarker', !bestTarget.alive());
      this.G.audio.hitmark();
      // knock cars? no. push peds handled by their damage()
    }
    bus.emit('gunfire', { x: this.G.player.pos.x, z: this.G.player.pos.z, radius: 6 });
  }

  update(dt) {
    const G = this.G;
    if (G.shopOpen) return;
    const input = G.input;

    // slot switching: number keys
    if (input.pressed('Digit1')) this.setSlot(0);
    if (input.pressed('Digit2')) this.setSlot(1);
    if (input.pressed('Digit3')) this.setSlot(2);
    if (input.pressed('Digit4')) this.setSlot(3);
    if (input.wheel !== 0) {
      let n = this.slot;
      for (let i = 0; i < 4; i++) {
        n = (n + (input.wheel > 0 ? 1 : -1) + 4) % 4;
        if (this.slotUnlocked(n)) break;
      }
      this.setSlot(n);
    }
    if (input.pressed('KeyR')) this.startReload();

    // firing
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!G.player.dead) {
      const w = this.current();
      if (w.auto ? input.mouseDown : input.mouseJust) this.tryFire();
    }

    // reload timer
    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.finishReload();
    }

    // recoil recovery + view kick applied to pitch
    this.recoil = damp(this.recoil, 0, 8, dt);
    this.punchArm = damp(this.punchArm, 0, 10, dt);
    if (this.recoilKick > 0) {
      G.player.pitch = clamp(G.player.pitch + this.recoilKick * 0.02, -1.52, 1.52);
      this.recoilKick = 0;
    }

    // view-model bob + sway + recoil pushback
    const speed = Math.hypot(G.player.vel.x, G.player.vel.z);
    const bob = Math.sin(G.player.bobPhase) * 0.012 * G.player.bob;
    const bobY = Math.abs(Math.cos(G.player.bobPhase)) * 0.012 * G.player.bob;
    this.sway.x = damp(this.sway.x, clamp(-input.dx * 0.0004, -0.03, 0.03), 10, dt);
    this.sway.y = damp(this.sway.y, clamp(input.dy * 0.0004, -0.03, 0.03), 10, dt);
    if (this.raiseAnim > 0) this.raiseAnim -= dt;
    const raise = this.raiseAnim > 0 ? this.raiseAnim * 1.5 : 0;

    this.rig.position.set(bob + this.sway.x, bobY + this.sway.y - raise - this.recoil * 0.02, this.recoil * 0.06);
    this.rig.rotation.set(this.sway.y * 2 + this.recoil * 0.04, this.sway.x * 2, 0);

    // fists punch anim
    if (this.models.fists.visible) {
      this.fistR.position.z = -0.5 - this.punchArm * 0.35;
      this.fistL.position.z = -0.5 - Math.max(0, this.punchArm - 0.5) * 0.2;
    }
  }
}

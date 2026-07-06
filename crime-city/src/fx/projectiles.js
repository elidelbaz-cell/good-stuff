// Rockets (RPG), thrown molotovs, and spreading fire patches (arson).
import * as THREE from 'three';
import { BOUNTY, CASH } from '../core/config.js';
import { bus } from '../core/bus.js';
import {
  box, mat, rand, dist2D, clamp, raycastColliders, rayAABB,
} from '../core/utils.js';

export class Projectiles {
  constructor(G) {
    this.G = G;
    this.root = new THREE.Group();
    G.scene.add(this.root);
    this.rockets = [];
    this.thrown = [];
    this.fires = [];
    this._d = new THREE.Vector3();
    this._p = new THREE.Vector3();
  }

  clear() {
    for (const r of this.rockets) this.root.remove(r.mesh);
    for (const t of this.thrown) this.root.remove(t.mesh);
    for (const f of this.fires) this.root.remove(f.group);
    this.rockets.length = 0; this.thrown.length = 0; this.fires.length = 0;
  }

  // ---------- RPG rocket ----------
  fireRocket(origin, dir, dmg, splash, byPlayer = true) {
    const mesh = new THREE.Mesh(box(0.22, 0.22, 0.9), mat('#d8d2c0'));
    const tip = new THREE.Mesh(box(0.26, 0.26, 0.25), mat('#c0392b'));
    tip.position.z = -0.5; mesh.add(tip);
    mesh.position.copy(origin);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir.clone().normalize());
    this.root.add(mesh);
    this.rockets.push({ mesh, dir: dir.clone().normalize(), speed: 55, dmg, splash, life: 3.5, byPlayer, smokeT: 0 });
    this.G.audio.explosion();
  }

  // ---------- thrown molotov ----------
  throwMolotov(origin, dir, byPlayer = true) {
    const mesh = new THREE.Mesh(box(0.18, 0.3, 0.18), mat('#3a7d3a'));
    const flame = new THREE.Mesh(box(0.1, 0.18, 0.1), new THREE.MeshBasicMaterial({ color: '#ffb04a' }));
    flame.position.y = 0.24; mesh.add(flame);
    mesh.position.copy(origin);
    this.root.add(mesh);
    const vel = dir.clone().normalize().multiplyScalar(18);
    vel.y += 5;
    this.thrown.push({ mesh, vel, life: 5, byPlayer, spin: rand(6, 12) });
    this.G.audio.tone?.(this.G.audio.now?.() ?? 0, { freq: 300, decay: 0.1, peak: 0.15 });
  }

  landMolotov(x, z, byPlayer) {
    this.createFire(x, z, 3.2, byPlayer);
    this.G.fx.explosion(new THREE.Vector3(x, 0.4, z));
    // arson payoff: igniting near a building or car
    let flammable = false;
    this.G.city.grid.query(x, z, 4, this._q || (this._q = []));
    if (this._q.length) flammable = true;
    for (const t of this.G.targets) {
      if (t.kind === 'car' && t.alive() && dist2D(t.pos().x, t.pos().z, x, z) < 6) flammable = true;
    }
    if (byPlayer && flammable) {
      this.G.economy.addBounty(BOUNTY.arson, 'arson', false, x, z);
      this.G.economy.addCash(CASH.arson);
      this.G.hud.banner('ARSON!', '+' + '$' + BOUNTY.arson.toLocaleString() + ' bounty', 'red', 2);
      this.G.police.addHeat(1.5, x, z);
    }
  }

  // ---------- fire patch ----------
  createFire(x, z, radius, byPlayer) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const flames = [];
    const n = 6;
    for (let i = 0; i < n; i++) {
      const f = new THREE.Mesh(box(rand(0.5, 1.1), rand(1, 2.2), rand(0.5, 1.1)),
        new THREE.MeshBasicMaterial({ color: i % 2 ? '#ff8a2a' : '#ffd24a', transparent: true, opacity: 0.85 }));
      f.position.set(rand(-radius, radius) * 0.7, 0.5, rand(-radius, radius) * 0.7);
      group.add(f);
      flames.push(f);
    }
    this.root.add(group);
    this.fires.push({ group, flames, x, z, radius, life: 7, byPlayer, dmgT: 0, spreadT: 1.5 });
    bus.emit('gunfire', { x, z, radius: 20 }); // fire scares folks too
  }

  update(dt) {
    const G = this.G;

    // rockets
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.life -= dt;
      const step = r.speed * dt;
      this._p.copy(r.mesh.position);
      // check collision along this step
      let hit = null, hitT = raycastColliders(this._p, r.dir, step + 0.3, G.city.grid);
      for (const t of G.targets) {
        if (!t.alive()) continue;
        const tt = t.hitTest(this._p, r.dir, hitT ?? (step + 0.3));
        if (tt !== null && (hitT === null || tt < hitT)) { hitT = tt; hit = t; }
      }
      r.mesh.position.addScaledVector(r.dir, step);
      r.smokeT -= dt;
      if (r.smokeT <= 0) { r.smokeT = 0.03; G.fx.puff(r.mesh.position.clone(), '#9a9a9a', 0.4, 1); }
      if ((hitT !== null && hitT <= step + 0.3) || r.life <= 0 || r.mesh.position.y < 0.1) {
        const boom = hit ? this._p.clone().addScaledVector(r.dir, hitT) : r.mesh.position.clone();
        this.explode(boom, r.dmg, r.splash, r.byPlayer);
        this.root.remove(r.mesh);
        this.rockets.splice(i, 1);
      }
    }

    // thrown molotovs (ballistic)
    for (let i = this.thrown.length - 1; i >= 0; i--) {
      const t = this.thrown[i];
      t.life -= dt;
      t.vel.y += -20 * dt;
      t.mesh.position.addScaledVector(t.vel, dt);
      t.mesh.rotation.x += t.spin * dt;
      const landed = t.mesh.position.y <= 0.15;
      // building hit
      let blocked = false;
      G.city.grid.query(t.mesh.position.x, t.mesh.position.z, 0.5, this._q || (this._q = []));
      for (const c of this._q) {
        if (t.mesh.position.x > c.x0 - 0.2 && t.mesh.position.x < c.x1 + 0.2 &&
            t.mesh.position.z > c.z0 - 0.2 && t.mesh.position.z < c.z1 + 0.2 &&
            t.mesh.position.y < (c.y1 ?? 50)) { blocked = true; break; }
      }
      if (landed || blocked || t.life <= 0) {
        this.landMolotov(t.mesh.position.x, t.mesh.position.z, t.byPlayer);
        this.root.remove(t.mesh);
        this.thrown.splice(i, 1);
      }
    }

    // fire patches
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.life -= dt;
      // flicker
      for (const fl of f.flames) {
        fl.scale.y = 0.7 + Math.abs(Math.sin(performance.now() / 90 + fl.position.x)) * 0.8;
        fl.material.opacity = 0.6 + Math.random() * 0.35;
      }
      f.group.position.y = 0;
      // damage over time to targets + player
      f.dmgT -= dt;
      if (f.dmgT <= 0) {
        f.dmgT = 0.35;
        for (const t of G.targets) {
          if (!t.alive()) continue;
          if (dist2D(t.pos().x, t.pos().z, f.x, f.z) < f.radius + 0.8) t.damage(9, f.byPlayer);
        }
        if (dist2D(G.player.pos.x, G.player.pos.z, f.x, f.z) < f.radius + 0.5) G.player.damage(6);
        for (const u of G.squad?.units || []) {
          if (u.state !== 'down' && dist2D(u.pos.x, u.pos.z, f.x, f.z) < f.radius + 0.5) G.squad.damage(u, 5);
        }
        G.fx.puff(new THREE.Vector3(f.x + rand(-f.radius, f.radius), 0.5, f.z + rand(-f.radius, f.radius)), '#3a3a3a', 0.8, 1);
      }
      if (f.life <= 0) { this.root.remove(f.group); this.fires.splice(i, 1); }
    }
  }

  explode(pos, dmg, splash, byPlayer) {
    const G = this.G;
    G.fx.explosion(pos);
    for (const t of G.targets) {
      if (!t.alive()) continue;
      const d = dist2D(t.pos().x, t.pos().z, pos.x, pos.z);
      if (d < splash) t.damage(dmg * clamp(1 - d / splash, 0.25, 1), byPlayer);
    }
    // catch the player / squad in the blast
    const pd = dist2D(G.player.pos.x, G.player.pos.z, pos.x, pos.z);
    if (pd < splash) G.player.damage(dmg * 0.5 * clamp(1 - pd / splash, 0.2, 1));
    for (const u of G.squad?.units || []) {
      if (u.state === 'down') continue;
      const d = dist2D(u.pos.x, u.pos.z, pos.x, pos.z);
      if (d < splash) G.squad.damage(u, dmg * 0.4 * clamp(1 - d / splash, 0.2, 1));
    }
  }
}

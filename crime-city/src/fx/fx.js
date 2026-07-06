// Pooled low-poly combat FX: tracers, muzzle flashes, hit sparks, blood-free
// impact puffs, explosions, floating damage/score bits. No gore — sparks & smoke.
import * as THREE from 'three';
import { rand, pick } from '../core/utils.js';

export class FX {
  constructor(G) {
    this.G = G;
    this.root = new THREE.Group();
    G.scene.add(this.root);

    // ---- tracer pool (thin stretched boxes) ----
    this.tracers = [];
    const tracerGeo = new THREE.BoxGeometry(0.04, 0.04, 1);
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: '#fff6c8', transparent: true }));
      m.visible = false;
      this.root.add(m);
      this.tracers.push({ mesh: m, life: 0, max: 0.06 });
    }
    this.tracerI = 0;

    // ---- spark pool (small instanced-ish billboards) ----
    this.sparks = [];
    const sparkGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
    for (let i = 0; i < 120; i++) {
      const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: '#ffd24a' }));
      m.visible = false;
      this.root.add(m);
      this.sparks.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0, g: -14 });
    }
    this.sparkI = 0;

    // ---- muzzle flash pool ----
    this.flashes = [];
    const flashGeo = new THREE.IcosahedronGeometry(0.28, 0);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true }));
      m.visible = false;
      this.root.add(m);
      this.flashes.push({ mesh: m, life: 0 });
    }
    this.flashI = 0;

    // ---- smoke/debris puffs ----
    this.puffs = [];
    const puffGeo = new THREE.IcosahedronGeometry(0.5, 0);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: '#8a8a8a', transparent: true }));
      m.visible = false;
      this.root.add(m);
      this.puffs.push({ mesh: m, life: 0, max: 1, vy: 0, grow: 1 });
    }
    this.puffI = 0;

    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 0, 1);
  }

  tracer(from, to, color = '#fff6c8') {
    const t = this.tracers[this.tracerI = (this.tracerI + 1) % this.tracers.length];
    const m = t.mesh;
    this._v.subVectors(to, from);
    const len = this._v.length();
    m.material.color.set(color);
    m.material.opacity = 0.9;
    m.position.copy(from).addScaledVector(this._v, 0.5);
    m.scale.set(1, 1, len);
    m.quaternion.setFromUnitVectors(this._up, this._v.normalize());
    m.visible = true;
    t.life = t.max;
  }

  muzzle(pos, dir, scale = 1) {
    const f = this.flashes[this.flashI = (this.flashI + 1) % this.flashes.length];
    f.mesh.position.copy(pos).addScaledVector(dir, 0.3);
    f.mesh.scale.setScalar(scale * rand(0.8, 1.3));
    f.mesh.material.opacity = 1;
    f.mesh.visible = true;
    f.life = 0.05;
  }

  spark(pos, dir, count = 6, color = '#ffd24a') {
    for (let i = 0; i < count; i++) {
      const s = this.sparks[this.sparkI = (this.sparkI + 1) % this.sparks.length];
      s.mesh.position.copy(pos);
      s.mesh.material.color.set(color);
      s.mesh.visible = true;
      s.life = rand(0.18, 0.4);
      const spread = 0.9;
      s.vx = dir.x * rand(1, 4) + rand(-spread, spread) * 4;
      s.vy = dir.y * rand(1, 4) + rand(1, 5);
      s.vz = dir.z * rand(1, 4) + rand(-spread, spread) * 4;
      s.g = -18;
    }
  }

  puff(pos, color = '#9a9a9a', size = 1, count = 3) {
    for (let i = 0; i < count; i++) {
      const p = this.puffs[this.puffI = (this.puffI + 1) % this.puffs.length];
      p.mesh.position.copy(pos).add(this._v.set(rand(-0.4, 0.4), rand(-0.2, 0.4), rand(-0.4, 0.4)));
      p.mesh.material.color.set(color);
      p.mesh.material.opacity = 0.7;
      p.mesh.scale.setScalar(size * rand(0.5, 0.9));
      p.mesh.visible = true;
      p.life = p.max = rand(0.4, 0.8);
      p.vy = rand(0.6, 1.6);
      p.grow = rand(1.4, 2.4);
    }
  }

  impact(pos, normal, surface = 'wall') {
    if (surface === 'flesh') {
      // no gore: a puff of color + a couple sparks
      this.spark(pos, normal, 3, '#ff4a3d');
      this.puff(pos, '#c0392b', 0.5, 1);
    } else if (surface === 'metal') {
      this.spark(pos, normal, 7, '#ffe08a');
      this.G.audio.ricochet();
    } else {
      this.spark(pos, normal, 4, '#cfcfcf');
      this.puff(pos, '#b0a89a', 0.6, 1);
    }
  }

  explosion(pos) {
    this.G.audio.explosion();
    this.puff(pos, '#ff8a2a', 2.4, 6);
    this.puff(pos, '#3a3a3a', 2.8, 5);
    this.spark(pos, this._v.set(0, 1, 0), 26, '#ffd24a');
    // flash
    const f = this.flashes[this.flashI = (this.flashI + 1) % this.flashes.length];
    f.mesh.position.copy(pos);
    f.mesh.scale.setScalar(4);
    f.mesh.material.opacity = 1;
    f.mesh.material.color.set('#ffb04a');
    f.mesh.visible = true;
    f.life = 0.12;
    // camera shake if near
    const d = this.G.player.pos.distanceTo(pos);
    if (d < 30) this.G.player.shake = Math.min(this.G.player.shake + (1 - d / 30) * 0.5, 0.6);
  }

  update(dt) {
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / t.max) * 0.9;
      if (t.life <= 0) t.mesh.visible = false;
    }
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      f.mesh.material.opacity = Math.max(0, f.life / 0.05);
      f.mesh.rotation.y += dt * 20;
      if (f.life <= 0) { f.mesh.visible = false; f.mesh.material.color.set('#ffe08a'); }
    }
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.vy += s.g * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      if (s.mesh.position.y < 0.05) { s.mesh.position.y = 0.05; s.vy = 0; s.vx *= 0.5; s.vz *= 0.5; }
      if (s.life <= 0) s.mesh.visible = false;
    }
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      const f = p.life / p.max;
      p.mesh.material.opacity = f * 0.7;
      p.mesh.position.y += p.vy * dt;
      p.mesh.scale.multiplyScalar(1 + p.grow * dt);
      p.mesh.rotation.x += dt * 2;
      if (p.life <= 0) p.mesh.visible = false;
    }
  }
}

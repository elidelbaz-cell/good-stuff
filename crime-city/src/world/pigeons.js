// One instanced mesh of pigeons that peck around and scatter from people and gunfire.
import * as THREE from 'three';
import { bus } from '../core/bus.js';
import { pick, rand } from '../core/utils.js';

const COUNT = 26;

export class Pigeons {
  constructor(G) {
    this.G = G;
    const geo = new THREE.BoxGeometry(0.22, 0.2, 0.34);
    geo.translate(0, 0.1, 0);
    const m = new THREE.MeshLambertMaterial({ color: '#9aa0ad' });
    this.mesh = new THREE.InstancedMesh(geo, m, COUNT);
    this.mesh.castShadow = true;
    G.scene.add(this.mesh);
    this.birds = [];
    for (let i = 0; i < COUNT; i++) {
      const spot = pick(G.city.pigeonSpots);
      this.birds.push({
        x: spot.x + rand(-2.5, 2.5), y: 0, z: spot.z + rand(-2.5, 2.5),
        ry: rand(Math.PI * 2), state: 'peck', vy: 0, vx: 0, vz: 0,
        t: rand(3), flyT: 0,
      });
    }
    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    bus.on('gunfire', ({ x, z }) => this.scatter(x, z, 30));
  }

  scatter(x, z, radius) {
    for (const b of this.birds) {
      if (b.state === 'fly') continue;
      if (Math.hypot(b.x - x, b.z - z) < radius) this.launch(b, x, z);
    }
  }

  launch(b, fx, fz) {
    b.state = 'fly';
    b.flyT = rand(5, 9);
    const dx = b.x - fx, dz = b.z - fz;
    const d = Math.hypot(dx, dz) || 1;
    b.vx = (dx / d) * rand(3, 6) + rand(-1.5, 1.5);
    b.vz = (dz / d) * rand(3, 6) + rand(-1.5, 1.5);
    b.vy = rand(3.5, 6);
  }

  update(dt) {
    const P = this.G.player;
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i];
      if (b.state === 'peck') {
        b.t -= dt;
        if (b.t <= 0) { b.t = rand(0.6, 2.4); b.ry = rand(Math.PI * 2); b.x += Math.sin(b.ry) * 0.3; b.z += Math.cos(b.ry) * 0.3; }
        if (P && Math.hypot(b.x - P.pos.x, b.z - P.pos.z) < 3.6) this.launch(b, P.pos.x, P.pos.z);
      } else {
        b.flyT -= dt;
        b.x += b.vx * dt; b.z += b.vz * dt;
        if (b.flyT > 2) { b.y = Math.min(b.y + b.vy * dt, 22); }
        else { b.y = Math.max(0, b.y - 6 * dt); b.vx *= 0.98; b.vz *= 0.98; }
        b.ry = Math.atan2(b.vx, b.vz);
        if (b.flyT <= 0 && b.y <= 0) {
          b.state = 'peck'; b.y = 0;
          const spot = pick(this.G.city.pigeonSpots);
          b.x = spot.x + rand(-2.5, 2.5); b.z = spot.z + rand(-2.5, 2.5);
        }
      }
      this._e.set(0, b.ry, b.state === 'fly' ? Math.sin(performance.now() / 60 + i) * 0.5 : 0);
      this._q.setFromEuler(this._e);
      this._m4.compose(new THREE.Vector3(b.x, b.y + (b.state === 'fly' ? 0 : Math.abs(Math.sin(b.t * 6)) * 0.05), b.z), this._q, new THREE.Vector3(1, 1, 1));
      this.mesh.setMatrixAt(i, this._m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

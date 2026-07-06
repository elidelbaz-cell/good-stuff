// Ambient cars + taxis cruising the grid. Destructible (that's a crime, though).
import * as THREE from 'three';
import { CITY, ROADS } from '../core/config.js';
import { bus } from '../core/bus.js';
import { box, mat, pick, rand, rayAABB } from '../core/utils.js';

const COLORS = ['#f2c522', '#f2c522', '#f2c522', '#c0392b', '#3a6ea8', '#7d858f', '#2e3440', '#e8e3d8', '#3f7d4c'];

export class Traffic {
  constructor(G) {
    this.G = G;
    this.cars = [];
    this.root = new THREE.Group();
    G.scene.add(this.root);
    for (let i = 0; i < 20; i++) this.spawn();
  }

  spawn() {
    const color = pick(COLORS);
    const grp = new THREE.Group();
    const body = new THREE.Mesh(box(1.9, 0.8, 4.4), mat(color));
    body.position.y = 0.68; body.castShadow = true;
    const cab = new THREE.Mesh(box(1.7, 0.62, 2.1), mat(color === '#f2c522' ? '#e8e3d8' : '#1d2026'));
    cab.position.set(0, 1.35, -0.2);
    grp.add(body, cab);
    if (color === '#f2c522') {
      const sign = new THREE.Mesh(box(0.9, 0.22, 0.3), mat('#1d2026'));
      sign.position.set(0, 1.77, -0.2);
      grp.add(sign);
    }
    this.root.add(grp);
    const car = {
      grp, body, cab, color, hp: 90, wrecked: false, wreckT: 0,
      axis: Math.random() < 0.5 ? 'x' : 'z',
      dir: Math.random() < 0.5 ? 1 : -1,
      road: pick(ROADS), t: rand(CITY.min, CITY.max),
      speed: 0, cruise: rand(8, 12),
      kind: 'car',
    };
    this.place(car);
    this.cars.push(car);
    this.registerTarget(car);
    return car;
  }

  place(car) {
    const lane = 3 * car.dir; // right-hand-ish traffic
    if (car.axis === 'x') {
      car.grp.position.set(car.t, 0, car.road - lane);
      car.grp.rotation.y = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      car.grp.position.set(car.road + lane, 0, car.t);
      car.grp.rotation.y = car.dir > 0 ? 0 : Math.PI;
    }
  }

  aabb(car) {
    const p = car.grp.position;
    const hw = car.axis === 'x' ? 2.4 : 1.1, hd = car.axis === 'x' ? 1.1 : 2.4;
    return { x0: p.x - hw, x1: p.x + hw, z0: p.z - hd, z1: p.z + hd, y1: 1.8 };
  }

  registerTarget(car) {
    this.G.targets.push({
      kind: 'car', ref: car,
      alive: () => !car.wrecked,
      hitTest: (o, d, maxDist) => {
        const t = rayAABB(o, d, this.aabb(car));
        return t !== null && t <= maxDist ? t : null;
      },
      pos: () => car.grp.position,
      damage: (amt, byPlayer) => this.damage(car, amt, byPlayer),
    });
  }

  damage(car, amt, byPlayer) {
    if (car.wrecked) return;
    car.hp -= amt;
    if (car.hp <= 0) {
      car.wrecked = true;
      car.wreckT = 14;
      car.speed = 0;
      car.body.material = mat('#1a1c20');
      car.cab.material = mat('#26282e');
      car.grp.rotation.z = rand(-0.15, 0.15);
      this.G.fx?.explosion(car.grp.position.clone().setY(1));
      if (byPlayer) bus.emit('crime', { amount: 1, x: car.grp.position.x, z: car.grp.position.z });
    } else if (byPlayer) {
      bus.emit('crime', { amount: 0.34, x: car.grp.position.x, z: car.grp.position.z });
    }
  }

  update(dt) {
    const P = this.G.player;
    for (const car of this.cars) {
      if (car.wrecked) {
        car.wreckT -= dt;
        if (car.wreckT <= 0) { // quietly respawn somewhere else
          car.wrecked = false; car.hp = 90;
          car.body.material = mat(car.color);
          car.cab.material = mat(car.color === '#f2c522' ? '#e8e3d8' : '#1d2026');
          car.grp.rotation.z = 0;
          car.road = pick(ROADS); car.t = CITY.min + 2;
        }
        this.G.dynamicColliders.push(this.aabb(car));
        continue;
      }
      // brake for the player or a car ahead
      const p = car.grp.position;
      const aheadX = car.axis === 'x' ? p.x + car.dir * 5 : p.x;
      const aheadZ = car.axis === 'z' ? p.z + car.dir * 5 : p.z;
      let blocked = false;
      if (P && Math.abs(P.pos.x - aheadX) < 3 && Math.abs(P.pos.z - aheadZ) < 3) blocked = true;
      if (!blocked) {
        for (const o of this.cars) {
          if (o === car) continue;
          const op = o.grp.position;
          if (Math.abs(op.x - aheadX) < 3.4 && Math.abs(op.z - aheadZ) < 3.4) { blocked = true; break; }
        }
      }
      car.speed = blocked ? Math.max(0, car.speed - 30 * dt) : Math.min(car.cruise, car.speed + 8 * dt);
      car.t += car.speed * car.dir * dt;
      if (car.t > CITY.max + 14) { car.t = CITY.min - 12; car.road = pick(ROADS); }
      if (car.t < CITY.min - 14) { car.t = CITY.max + 12; car.road = pick(ROADS); }
      this.place(car);
      this.G.dynamicColliders.push(this.aabb(car));
    }
  }
}

// Ambient capsule-people walking sidewalk loops; they flee screaming from gunfire.
import * as THREE from 'three';
import { bus } from '../core/bus.js';
import { pick, rand, randInt, resolveStatic, rayCylinder, angleLerp } from '../core/utils.js';
import { makePerson, walkAnim, stillPose } from './people.js';

const COUNT = 34;

export class Pedestrians {
  constructor(G) {
    this.G = G;
    this.root = new THREE.Group();
    G.scene.add(this.root);
    this.peds = [];
    for (let i = 0; i < COUNT; i++) this.spawn();
    bus.on('gunfire', ({ x, z, radius = 26 }) => this.panic(x, z, radius));
  }

  spawn() {
    const person = makePerson({});
    const loop = pick(this.G.city.sidewalkLoops);
    const ped = {
      person, loop,
      pos: person.group.position,
      corner: randInt(0, 3), cw: Math.random() < 0.5 ? 1 : -1,
      speed: rand(1.5, 2.3), phase: rand(6),
      state: 'walk', panicT: 0, downT: 0, screamed: false,
      panicFrom: new THREE.Vector3(),
      kind: 'ped',
    };
    const c = this.cornerPos(ped);
    ped.pos.set(c.x + rand(-2, 2), 0, c.z + rand(-2, 2));
    this.root.add(person.group);
    this.peds.push(ped);
    this.G.targets.push({
      kind: 'ped', ref: ped,
      alive: () => ped.state !== 'down',
      hitTest: (o, d, maxDist) => rayCylinder(o, d, ped.pos.x, ped.pos.z, 0.45, 0, 1.85, maxDist),
      pos: () => ped.pos,
      damage: (amt, byPlayer) => this.knockdown(ped, byPlayer),
    });
  }

  cornerPos(ped) {
    const l = ped.loop;
    const corners = [[l.x0, l.z0], [l.x1, l.z0], [l.x1, l.z1], [l.x0, l.z1]];
    const [x, z] = corners[((ped.corner % 4) + 4) % 4];
    return { x, z };
  }

  panic(x, z, radius) {
    for (const ped of this.peds) {
      if (ped.state === 'down') continue;
      const d = Math.hypot(ped.pos.x - x, ped.pos.z - z);
      if (d < radius) {
        if (ped.state !== 'flee') { this.G.audio.scream(); }
        ped.state = 'flee';
        ped.panicT = rand(5, 8);
        ped.panicFrom.set(x, 0, z);
      }
    }
  }

  knockdown(ped, byPlayer) {
    if (ped.state === 'down') return;
    ped.state = 'down';
    ped.downT = rand(1.6, 2.4);
    ped.person.group.rotation.z = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    ped.person.group.position.y = 0.3;
    if (byPlayer) bus.emit('crime', { amount: 0.5, x: ped.pos.x, z: ped.pos.z });
    this.panic(ped.pos.x, ped.pos.z, 15);
  }

  update(dt) {
    const P = this.G.player;
    for (const ped of this.peds) {
      const distToPlayer = P ? Math.hypot(ped.pos.x - P.pos.x, ped.pos.z - P.pos.z) : 999;
      if (ped.state === 'down') {
        ped.downT -= dt;
        if (ped.downT <= 0) {
          ped.state = 'flee';
          ped.panicT = 6;
          ped.person.group.rotation.z = 0;
          ped.person.group.position.y = 0;
          ped.panicFrom.copy(P ? P.pos : ped.pos);
        }
        continue;
      }
      let vx = 0, vz = 0, spd = ped.speed;
      if (ped.state === 'flee') {
        ped.panicT -= dt;
        spd = 6.2;
        let dx = ped.pos.x - ped.panicFrom.x, dz = ped.pos.z - ped.panicFrom.z;
        const d = Math.hypot(dx, dz) || 1;
        vx = dx / d; vz = dz / d;
        if (ped.panicT <= 0 && distToPlayer > 35) {
          ped.state = 'walk';
          // adopt nearest loop and keep strolling
          let best = 1e9;
          for (const l of this.G.city.sidewalkLoops) {
            const cx = (l.x0 + l.x1) / 2, cz = (l.z0 + l.z1) / 2;
            const dd = Math.hypot(ped.pos.x - cx, ped.pos.z - cz);
            if (dd < best) { best = dd; ped.loop = l; }
          }
        }
      } else {
        const c = this.cornerPos(ped);
        let dx = c.x - ped.pos.x, dz = c.z - ped.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.2) { ped.corner += ped.cw; }
        else { vx = dx / d; vz = dz / d; }
      }
      if (vx || vz) {
        ped.pos.x += vx * spd * dt;
        ped.pos.z += vz * spd * dt;
        resolveStatic(ped.pos, 0.4, this.G.city.grid);
        const targetYaw = Math.atan2(vx, vz);
        ped.person.group.rotation.y = angleLerp(ped.person.group.rotation.y, targetYaw, Math.min(1, dt * 10));
        if (distToPlayer < 130) {
          ped.phase += spd * dt * 2.4;
          walkAnim(ped.person, ped.phase, ped.state === 'flee' ? 0.95 : 0.6);
          if (ped.state === 'flee') { // arms up, panicking
            ped.person.armL.rotation.x = -2.6;
            ped.person.armR.rotation.x = -2.6;
          }
        }
      } else if (distToPlayer < 130) {
        stillPose(ped.person);
      }
    }
  }
}

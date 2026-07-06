// Drivable vehicles: street cars, hijacked cop cars, a flyable helicopter with
// a chin gun, and a cargo ship in the harbor. Enter/exit with E.
import * as THREE from 'three';
import { CITY, BASE, BOUNTY, CASH } from '../core/config.js';
import { bus } from '../core/bus.js';
import {
  box, mat, mesh, rand, clamp, damp, dist2D, resolveStatic, raycastColliders, rayCylinder,
} from '../core/utils.js';

const SPEC = {
  car:    { accel: 30, maxF: 25, maxR: 9,  turn: 2.0, radius: 1.9, camBack: 8.5, camUp: 3.6, ram: 45, hp: 260 },
  copcar: { accel: 34, maxF: 29, maxR: 9,  turn: 2.1, radius: 1.9, camBack: 8.5, camUp: 3.6, ram: 60, hp: 300 },
  heli:   { accel: 22, maxF: 30, turn: 1.6, radius: 2.6, camBack: 11, camUp: 4.5, hp: 400 },
  ship:   { accel: 6,  maxF: 13, maxR: 5, turn: 0.5, radius: 7, camBack: 24, camUp: 13, hp: 4000 },
};

export class Vehicles {
  constructor(G) {
    this.G = G;
    this.root = new THREE.Group();
    G.scene.add(this.root);
    this.list = [];       // dedicated drivable vehicles (cars, heli, ship)
    this._v = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this.buildStatics();
    this.spawnDefaults();
  }

  buildStatics() {
    // helipad on the dock
    const pad = new THREE.Mesh(box(12, 0.15, 12), mat('#2a2d34'));
    pad.position.set(-224, 0.14, -150);
    pad.receiveShadow = true;
    this.root.add(pad);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4, 0.3, 6, 20), new THREE.MeshBasicMaterial({ color: '#ffd24a' }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(-224, 0.2, -150);
    this.root.add(ring);
    const hMark = new THREE.Mesh(box(0.6, 0.05, 3), new THREE.MeshBasicMaterial({ color: '#ffd24a' }));
    hMark.position.set(-224, 0.22, -150); this.root.add(hMark);
    const hMark2 = new THREE.Mesh(box(2.4, 0.05, 0.6), new THREE.MeshBasicMaterial({ color: '#ffd24a' }));
    hMark2.position.set(-224, 0.22, -150); this.root.add(hMark2);
  }

  spawnDefaults() {
    // a couple of parked street cars near the base and downtown
    this.spawnCar('#c0392b', -196, 12, 0);
    this.spawnCar('#2f6ea8', -60, 8.5, Math.PI / 2);
    this.spawnCar('#f2c522', 60, -8.5, -Math.PI / 2);
    // the helicopter on the pad
    this.heli = this.spawnHeli(-224, -150);
    // the cargo ship moored right against the docks (boardable from the dock edge)
    this.ship = this.spawnShip(CITY.waterX - 10, 60);
  }

  reset() {
    // return to on-foot and respawn the fixed vehicles at their pads
    if (this.G.vehicle) this.exit(true);
    for (const v of this.list) v.grp.parent?.remove(v.grp);
    this.list.length = 0;
    this.spawnDefaults();
  }

  // ---------- mesh builders ----------
  carMesh(color, cop = false) {
    const g = new THREE.Group();
    const body = mesh(2.0, 0.8, 4.5, cop ? '#20304f' : color); body.position.y = 0.7; g.add(body);
    const cab = mesh(1.8, 0.66, 2.2, cop ? '#f0f0f0' : (color === '#f2c522' ? '#e8e3d8' : '#1d2026')); cab.position.set(0, 1.38, -0.2); g.add(cab);
    for (const zz of [1.6, -1.6]) for (const xx of [1.0, -1.0]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 8), mat('#141519'));
      wheel.rotation.z = Math.PI / 2; wheel.position.set(xx, 0.42, zz); g.add(wheel);
    }
    if (cop) {
      const lr = new THREE.Mesh(box(0.4, 0.22, 0.4), new THREE.MeshBasicMaterial({ color: '#ff2a2a' })); lr.position.set(-0.25, 1.85, -0.2);
      const lb = new THREE.Mesh(box(0.4, 0.22, 0.4), new THREE.MeshBasicMaterial({ color: '#2a4aff' })); lb.position.set(0.25, 1.85, -0.2);
      g.add(lr, lb); g.userData.lights = [lr, lb];
    }
    return g;
  }

  heliMesh() {
    const g = new THREE.Group();
    const body = mesh(1.6, 1.4, 3.6, '#2b2f36'); body.position.y = 1.6; g.add(body);
    const nose = mesh(1.3, 1.1, 1.4, '#3a3f48'); nose.position.set(0, 1.6, -2.1); g.add(nose);
    const tail = mesh(0.5, 0.5, 3.4, '#2b2f36'); tail.position.set(0, 2.0, 3.0); g.add(tail);
    const fin = mesh(0.2, 1.0, 0.8, '#3a3f48'); fin.position.set(0, 2.6, 4.4); g.add(fin);
    for (const xx of [0.9, -0.9]) { const skid = mesh(0.14, 0.14, 3.0, '#1a1c21'); skid.position.set(xx, 0.4, 0); g.add(skid); }
    // chin gun
    const gun = mesh(0.24, 0.24, 1.0, '#14161b'); gun.position.set(0, 0.9, -2.4); g.add(gun);
    // main rotor
    const rotor = new THREE.Group(); rotor.position.set(0, 2.55, 0);
    for (let i = 0; i < 2; i++) { const blade = mesh(0.3, 0.08, 9, '#16181d'); blade.rotation.y = i * Math.PI / 2; rotor.add(blade); }
    g.add(rotor);
    // tail rotor
    const trotor = new THREE.Group(); trotor.position.set(0.35, 2.6, 4.6);
    for (let i = 0; i < 2; i++) { const b = mesh(0.08, 1.6, 0.2, '#16181d'); b.rotation.z = i * Math.PI / 2; trotor.add(b); }
    g.add(trotor);
    g.userData.rotor = rotor; g.userData.trotor = trotor; g.userData.gun = gun;
    return g;
  }

  shipMesh() {
    const g = new THREE.Group();
    const hull = mesh(9, 3, 26, '#3a4652'); hull.position.y = 1.0; g.add(hull);
    const deck = mesh(9.2, 0.4, 26.2, '#586878'); deck.position.y = 2.5; g.add(deck);
    const tower = mesh(6, 4, 5, '#e8e3d8'); tower.position.set(0, 4.7, 9); g.add(tower);
    const bridge = mesh(6.4, 1.4, 2.6, '#2a4a6a'); bridge.position.set(0, 6.6, 9); g.add(bridge);
    // container stacks
    const cols = ['#b3543f', '#3f6fb3', '#3fb36b', '#b39f3f', '#7a4fb3'];
    let ci = 0;
    for (let z = -9; z <= 4; z += 3.4) for (let x = -2.6; x <= 2.6; x += 2.6) for (let y = 0; y < 2; y++) {
      const c = mesh(2.4, 1.2, 3.2, cols[ci++ % cols.length]); c.position.set(x, 3.4 + y * 1.3, z); g.add(c);
    }
    return g;
  }

  spawnCar(color, x, z, yaw) {
    const grp = this.carMesh(color);
    grp.position.set(x, 0, z); grp.rotation.y = yaw;
    this.root.add(grp);
    const v = { type: 'car', grp, pos: grp.position, yaw, speed: 0, hp: SPEC.car.hp, color };
    this.list.push(v); return v;
  }
  spawnHeli(x, z) {
    const grp = this.heliMesh(); grp.position.set(x, 0, z);
    this.root.add(grp);
    const v = { type: 'heli', grp, pos: grp.position, yaw: 0, speed: 0, vspeed: 0, alt: 0, hp: SPEC.heli.hp, rotorSpin: 0, fireT: 0 };
    this.list.push(v); return v;
  }
  spawnShip(x, z) {
    const grp = this.shipMesh(); grp.position.set(x, 0, z);
    this.root.add(grp);
    const v = { type: 'ship', grp, pos: grp.position, yaw: 0, speed: 0, hp: SPEC.ship.hp };
    this.list.push(v); return v;
  }

  // ---------- enter / exit ----------
  nearestDrivable() {
    const p = this.G.player.pos;
    let best = null, bd = 5;
    for (const v of this.list) {
      const r = v.type === 'ship' ? 14 : (v.type === 'heli' ? 6 : 4.5);
      const d = dist2D(p.x, p.z, v.pos.x, v.pos.z);
      if (d < r && d < bd + r) { if (!best || d < best.d) best = { v, d, kind: v.type }; }
    }
    // hijackable cop cars
    for (const car of this.G.police.cars) {
      if (car.dead) continue;
      const d = dist2D(p.x, p.z, car.grp.position.x, car.grp.position.z);
      if (d < 5 && (!best || d < best.d)) best = { car, d, kind: 'hijack' };
    }
    return best;
  }

  enter(v) {
    this.G.vehicle = v;
    v.driven = true;
    this.G.hud.toast(
      v.type === 'heli' ? 'helicopter — SPACE up, CTRL down, WASD fly, LMB gun, E exit'
      : v.type === 'ship' ? 'cargo ship — WASD to sail, E to disembark'
      : 'driving — WASD, E to get out (ram cops for bounty!)', 'green');
    this.G.audio.reload();
    if (v.type === 'heli') this.G.hud.subtitle('BOSS', 'Let’s take this bird up.');
  }

  hijack(car) {
    // release the police car from AI and turn it into a driven cop car
    const grp = this.G.police.releaseCar(car);
    this.root.add(grp); // reparent into the vehicles group
    const v = { type: 'copcar', grp, pos: grp.position, yaw: grp.rotation.y, speed: 0, hp: SPEC.copcar.hp, color: '#20304f' };
    this.list.push(v);
    this.enter(v);
    this.G.economy.addBounty(BOUNTY.hijack, 'hijack', false, grp.position.x, grp.position.z);
    this.G.economy.addCash(CASH.hijack);
    this.G.police.addHeat(1.5, grp.position.x, grp.position.z);
    this.G.hud.banner('COP CAR HIJACKED', '+' + '$' + BOUNTY.hijack.toLocaleString(), 'gold', 2);
  }

  exit(silent = false) {
    const v = this.G.vehicle;
    if (!v) return;
    v.driven = false;
    // place the boss beside the vehicle, on the ground
    const side = this._d.set(-Math.cos(v.yaw), 0, Math.sin(v.yaw)).multiplyScalar(v.type === 'ship' ? 7 : 3);
    this.G.player.pos.set(v.pos.x + side.x, 0, v.pos.z + side.z);
    resolveStatic(this.G.player.pos, 0.42, this.G.city.grid, 0);
    this.G.player.yaw = v.yaw;
    if (v.type === 'heli' && v.alt > 2) {
      // step out onto the skids height, then fall
      this.G.player.pos.set(v.pos.x + side.x, 0, v.pos.z + side.z);
    }
    this.G.vehicle = null;
    if (!silent) this.G.audio.reload();
  }

  // ---------- steal rewards for the special vehicles ----------
  rewardSteal(v) {
    if (v.stolen) return;
    v.stolen = true;
    if (v.type === 'heli') {
      this.G.economy.addBounty(BOUNTY.heliSteal, 'heli', false, v.pos.x, v.pos.z);
      this.G.economy.addCash(CASH.heliSteal);
      this.G.hud.banner('CHOPPER STOLEN', '+' + '$' + BOUNTY.heliSteal.toLocaleString(), 'gold', 2.5);
      this.G.police.addHeat(2, v.pos.x, v.pos.z);
    } else if (v.type === 'ship') {
      this.G.economy.addBounty(BOUNTY.shipSteal, 'ship', false, v.pos.x, v.pos.z);
      this.G.economy.addCash(CASH.shipSteal);
      this.G.hud.banner('CARGO SHIP HIJACKED', '+' + '$' + BOUNTY.shipSteal.toLocaleString(), 'gold', 3);
      this.G.police.addHeat(3, v.pos.x, v.pos.z);
    }
  }

  update(dt) {
    const G = this.G;
    // idle rotor spin on the parked heli
    for (const v of this.list) if (v.type === 'heli' && !v.driven) this.spinHeli(v, dt, 0.35);

    if (!G.vehicle) {
      // enter prompt
      if (!G.interact && !G.player.dead) {
        const near = this.nearestDrivable();
        if (near) {
          const label = near.kind === 'hijack' ? 'hijack this cop car'
            : near.kind === 'heli' ? 'get in the helicopter'
            : near.kind === 'ship' ? 'board the cargo ship' : 'get in';
          G.interact = { text: label, keyLabel: 'E' };
          if (G.input.pressed('KeyE')) {
            if (near.kind === 'hijack') this.hijack(near.car);
            else { this.enter(near.v); if (near.v.type === 'heli' || near.v.type === 'ship') this.rewardSteal(near.v); }
          }
        }
      }
      return;
    }

    const v = G.vehicle;
    if (G.input.pressed('KeyE') && !(v.type === 'heli' && v.alt > 3)) { this.exit(); return; }

    if (v.type === 'heli') this.driveHeli(v, dt);
    else if (v.type === 'ship') this.driveGround(v, dt, SPEC.ship, true);
    else this.driveGround(v, dt, SPEC[v.type], false);

    // sync driver position + heat trackers
    G.player.pos.copy(v.pos);
    this.updateCamera(v, dt);

    // ramming: ground vehicles bump cops/peds
    if (v.type !== 'heli') this.doRamming(v, dt);

    // vehicle destroyed
    if (v.hp <= 0) this.wreck(v);
  }

  driveGround(v, dt, spec, isShip) {
    const G = this.G, input = G.input;
    let throttle = 0;
    if (input.down('KeyW')) throttle += 1;
    if (input.down('KeyS')) throttle -= 1;
    const targetSpeed = throttle > 0 ? spec.maxF : (throttle < 0 ? -spec.maxR : 0);
    if (throttle !== 0) v.speed = damp(v.speed, targetSpeed, 1.6, dt);
    else v.speed = damp(v.speed, 0, 2.4, dt);

    // steering scales with speed, reverses in reverse
    let steer = 0;
    if (input.down('KeyA')) steer += 1;
    if (input.down('KeyD')) steer -= 1;
    const speedFactor = clamp(Math.abs(v.speed) / spec.maxF, 0, 1);
    v.yaw += steer * spec.turn * dt * speedFactor * Math.sign(v.speed || 1);

    const fwd = this._d.set(-Math.sin(v.yaw), 0, -Math.cos(v.yaw));
    const nx = v.pos.x + fwd.x * v.speed * dt;
    const nz = v.pos.z + fwd.z * v.speed * dt;
    if (isShip) {
      // keep the ship in the harbor water (west of the docks)
      v.pos.x = clamp(nx, CITY.waterX - 150, CITY.waterX - 6);
      v.pos.z = clamp(nz, -180, 180);
      v.grp.position.y = -0.2 + Math.sin(performance.now() / 700) * 0.15; // gentle bob
    } else {
      const before = this._v.set(v.pos.x, 0, v.pos.z);
      v.pos.x = nx; v.pos.z = nz;
      resolveStatic(v.pos, spec.radius, G.city.grid, 0.6);
      // keep on the map
      v.pos.x = clamp(v.pos.x, CITY.min - 6, CITY.max + 6);
      v.pos.z = clamp(v.pos.z, CITY.min - 6, CITY.max + 6);
      const moved = dist2D(v.pos.x, v.pos.z, before.x, before.z);
      if (moved < Math.abs(v.speed) * dt * 0.4) { // hit a wall — bleed speed + engine hit
        v.speed *= 0.3;
      }
    }
    v.grp.position.copy(v.pos);
    v.grp.rotation.y = v.yaw;
    // blink cop lights
    if (v.grp.userData.lights) {
      const on = Math.floor(performance.now() / 200) % 2 === 0;
      v.grp.userData.lights.forEach((l, k) => l.material.color.set(on === (k === 0) ? (k === 0 ? '#ff2a2a' : '#2a4aff') : '#3a1a1a'));
    }
    if (Math.abs(v.speed) > 1) bus.emit('gunfire', { x: v.pos.x, z: v.pos.z, radius: 8 }); // engine noise scares peds a touch
  }

  driveHeli(v, dt) {
    const G = this.G, input = G.input;
    // vertical
    let vert = 0;
    if (input.down('Space')) vert += 1;
    if (input.down('ControlLeft') || input.down('ShiftLeft')) vert -= 1;
    v.vspeed = damp(v.vspeed, vert * 12, 2.5, dt);
    v.alt = clamp(v.alt + v.vspeed * dt, 0, 140);
    // yaw
    let steer = 0;
    if (input.down('KeyA')) steer += 1;
    if (input.down('KeyD')) steer -= 1;
    v.yaw += steer * SPEC.heli.turn * dt;
    // forward/back tilt
    let throttle = 0;
    if (input.down('KeyW')) throttle += 1;
    if (input.down('KeyS')) throttle -= 1;
    v.speed = damp(v.speed, throttle * SPEC.heli.maxF, 1.8, dt);
    const fwd = this._d.set(-Math.sin(v.yaw), 0, -Math.cos(v.yaw));
    v.pos.x = clamp(v.pos.x + fwd.x * v.speed * dt, CITY.waterX - 150, CITY.max + 40);
    v.pos.z = clamp(v.pos.z + fwd.z * v.speed * dt, CITY.min - 40, CITY.max + 40);
    v.pos.y = v.alt;
    v.grp.position.copy(v.pos);
    v.grp.rotation.y = v.yaw;
    v.grp.rotation.x = damp(v.grp.rotation.x, -throttle * 0.18, 4, dt); // nose tilt
    v.grp.rotation.z = damp(v.grp.rotation.z, steer * 0.14, 4, dt);      // bank
    this.spinHeli(v, dt, 1.6);

    // chin gun
    v.fireT -= dt;
    if (input.mouseDown && v.fireT <= 0) {
      v.fireT = 0.08;
      this.heliFire(v);
    }
  }

  spinHeli(v, dt, speed) {
    if (v.grp.userData.rotor) v.grp.userData.rotor.rotation.y += dt * 40 * speed;
    if (v.grp.userData.trotor) v.grp.userData.trotor.rotation.x += dt * 50 * speed;
  }

  heliFire(v) {
    const G = this.G;
    G.audio.shot('minigun');
    const gun = v.grp.userData.gun;
    const from = gun.getWorldPosition(new THREE.Vector3());
    G.camera.getWorldDirection(this._d);
    this._d.x += rand(-0.02, 0.02); this._d.y += rand(-0.02, 0.02); this._d.z += rand(-0.02, 0.02);
    this._d.normalize();
    G.fx.muzzle(from, this._d, 1);
    // hitscan
    let bestT = raycastColliders(from, this._d, 200, G.city.grid), hit = null;
    for (const t of G.targets) {
      if (!t.alive()) continue;
      const tt = t.hitTest(from, this._d, bestT ?? 200);
      if (tt !== null && (bestT === null || tt < bestT)) { bestT = tt; hit = t; }
    }
    const end = from.clone().addScaledVector(this._d, bestT ?? 200);
    G.fx.tracer(from, end, '#fff6c8');
    if (hit) { G.fx.impact(end, this._d.clone().multiplyScalar(-1), hit.kind === 'car' ? 'metal' : 'flesh'); hit.damage(16, true); G.audio.hitmark(); }
    bus.emit('gunfire', { x: v.pos.x, z: v.pos.z, radius: 30 });
  }

  doRamming(v, dt) {
    if (Math.abs(v.speed) < 6) return;
    const spec = SPEC[v.type];
    for (const c of this.G.police.cops) {
      if (!c.alive) continue;
      if (dist2D(v.pos.x, v.pos.z, c.pos.x, c.pos.z) < spec.radius + 1.2) {
        this.G.police.damageCop(c, spec.ram, true);
        this.G.fx.impact(c.pos.clone().setY(1), this._d.set(0, 1, 0), 'flesh');
      }
    }
    for (const ped of this.G.peds.peds) {
      if (ped.state === 'down') continue;
      if (dist2D(v.pos.x, v.pos.z, ped.pos.x, ped.pos.z) < spec.radius + 1) this.G.peds.knockdown(ped, true);
    }
    // ram enemy cop cars
    for (const car of this.G.police.cars) {
      if (car.dead) continue;
      if (dist2D(v.pos.x, v.pos.z, car.grp.position.x, car.grp.position.z) < spec.radius + 2.4) {
        this.G.police.damageCar(car, spec.ram * dt * 4, true);
      }
    }
  }

  wreck(v) {
    this.G.fx.explosion(v.pos.clone().setY(1));
    this.exit(true);
    // drop the boss and hurt him a bit
    this.G.player.damage(25);
    this.root.remove(v.grp);
    const i = this.list.indexOf(v);
    if (i >= 0) this.list.splice(i, 1);
    this.G.hud.toast('your ride is totaled', 'red');
  }

  updateCamera(v, dt) {
    const G = this.G, cam = G.camera;
    const spec = SPEC[v.type];
    // let the mouse tweak pitch (look up/down) and a little yaw orbit
    G.player.pitch = clamp(G.player.pitch - G.input.dy * 0.0022, -1.3, 1.0);
    const orbit = clamp(-G.input.dx * 0.0022, -0.4, 0.4);
    this._camYaw = damp(this._camYaw ?? v.yaw, v.yaw + orbit, 12, dt);

    const back = this._d.set(Math.sin(this._camYaw), 0, Math.cos(this._camYaw));
    const cx = v.pos.x + back.x * spec.camBack;
    const cz = v.pos.z + back.z * spec.camBack;
    const cy = (v.type === 'heli' ? v.alt : 0) + spec.camUp - G.player.pitch * 4;
    cam.position.lerp(this._v.set(cx, cy, cz), Math.min(1, dt * 8));
    const lookY = (v.type === 'heli' ? v.alt : 0) + 1.5 + G.player.pitch * 3;
    cam.lookAt(v.pos.x, lookY, v.pos.z);
    // keep player.yaw roughly aligned so exit faces sensibly
    G.player.yaw = v.yaw;
  }
}

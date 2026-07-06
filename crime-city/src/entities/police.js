// Police & SWAT: wanted stars, heat, scaling spawns, seek/alert/combat AI with
// cover, cop cars, SWAT vans, roadblocks, and the WASTED/respawn flow.
import * as THREE from 'three';
import { POLICE, BOUNTY, CASH, CITY, ROADS, BASE, PLAYER } from '../core/config.js';
import { bus } from '../core/bus.js';
import { saveGame } from '../core/state.js';
import {
  box, mat, mesh, rand, pick, clamp, damp, dist2D, angleLerp,
  resolveStatic, rayCylinder, raycastColliders, rayAABB,
} from '../core/utils.js';
import { makePerson, walkAnim, aimPose, stillPose, makeHealthBar } from '../world/people.js';

let COP_ID = 0;

export class Police {
  constructor(G) {
    this.G = G;
    this.root = new THREE.Group();
    G.scene.add(this.root);
    this.cops = [];
    this.cars = [];
    this.heat = 0;
    this.stars = 0;
    this.timeUnseen = 0;
    this.evading = false;
    this.spawnTimer = 0;
    this.lastKnown = new THREE.Vector3();
    this.hadStars = 0;
    this.finaleMode = false;   // finale spawns bypass safe zone + caps

    this._v = new THREE.Vector3();
    this._d = new THREE.Vector3();

    bus.on('crime', ({ amount, x, z }) => this.addHeat(amount, x, z));
    bus.on('gunfire', ({ x, z }) => {
      if (this.G.base?.inZone(x, z) && !this.finaleMode) return; // base is quiet
      this.addHeat(0.05, x, z);
    });
    bus.on('respawn', () => this.onRespawn());
  }

  addHeat(amount, x, z) {
    if (this.G.state?.wonGame && !this.finaleMode) return; // cops fear you after the win
    const before = this.stars;
    this.heat = clamp(this.heat + amount, 0, 5.4);
    this.stars = clamp(Math.floor(this.heat + 0.0001), 0, 5);
    this.timeUnseen = 0;
    if (x !== undefined) this.lastKnown.set(x, 0, z);
    else this.lastKnown.copy(this.G.player.pos);
    if (this.stars > before) this.onStarGain(before);
  }

  onStarGain(before) {
    if (this.stars === 1 && before === 0) {
      this.G.hud.toast('WANTED — police are looking for you', 'red');
      this.G.audio.sirenStart('dispatch');
    }
    if (this.stars >= 5 && before < 5) {
      this.G.hud.banner('5 STARS — SWAT INBOUND', 'survive the heat to bank a bounty', 'red', 3);
      this.startChaseObjective();
    } else if (this.stars === 4 && before < 4) {
      this.G.hud.toast('SWAT vans rolling out', 'red');
    }
  }

  startChaseObjective() {
    if (this.G.activities) this.G.activities.startChase();
  }

  loseStar() {
    if (this.stars <= 0) return;
    this.heat = Math.max(0, this.stars - 1 + 0.4);
    const before = this.stars;
    this.stars = clamp(Math.floor(this.heat + 0.0001), 0, 5);
    if (this.stars < before) this.G.hud.toast(this.stars === 0 ? 'heat is off — you lost them' : `heat down to ${this.stars} star${this.stars > 1 ? 's' : ''}`);
    if (this.stars === 0) { this.heat = 0; this.G.audio.sirenStop('dispatch'); }
  }

  // ---------- spawning ----------
  targetCounts() {
    if (this.finaleMode) return this._finaleCounts || { cops: 0, swat: 0, cars: 0, vans: 0 };
    const s = this.stars;
    return {
      cops: POLICE.copsByStar[s] || 0,
      cars: POLICE.carsByStar[s] || 0,
      vans: POLICE.vansByStar[s] || 0,
      swat: s >= 4 ? (s === 5 ? 5 : 2) : 0,
    };
  }

  roadPointNear(px, pz, minD, maxD) {
    for (let tries = 0; tries < 20; tries++) {
      const road = pick(ROADS);
      const along = rand(CITY.min + 10, CITY.max - 10);
      const vertical = Math.random() < 0.5;
      const x = vertical ? road + rand(-3, 3) : along;
      const z = vertical ? along : road + rand(-3, 3);
      const d = dist2D(x, z, px, pz);
      if (d < minD || d > maxD) continue;
      if (this.G.base?.inZone(x, z) && !this.finaleMode) continue;
      return { x, z };
    }
    return null;
  }

  spawnCop(type, at) {
    const P = this.G;
    const isSwat = type === 'swat';
    const person = makePerson({
      shirt: isSwat ? '#20242c' : '#20407a',
      pants: isSwat ? '#181b22' : '#1a2740',
      hat: isSwat ? 'helmet' : 'cap',
      hatColor: isSwat ? '#14161c' : '#12203c',
      prop: isSwat ? 'rifle' : 'pistol',
    });
    // white cap detail for regular cops handled by hat color already
    const cop = {
      id: 'cop' + (COP_ID++),
      type, person,
      pos: person.group.position,
      hp: isSwat ? POLICE.swatHP : POLICE.copHP,
      maxHp: isSwat ? POLICE.swatHP : POLICE.copHP,
      alive: true,
      state: 'seek',
      speed: isSwat ? 5.4 : 6.0,
      fireTimer: rand(0.5, 1.5),
      losTimer: rand(0, 0.2),
      hasLOS: false,
      coverPoint: null,
      recoverT: 0,
      phase: rand(6),
      yaw: 0,
      dmg: isSwat ? POLICE.swatDmg : POLICE.copDmg,
      range: isSwat ? 46 : 34,
      target: null,
      strafe: rand(-1, 1),
    };
    cop.pos.set(at.x, 0, at.z);
    if (isSwat) {
      // shield on the left arm
      const shield = new THREE.Mesh(box(0.55, 1.0, 0.08), mat('#20304f'));
      shield.position.set(0, -0.4, -0.35);
      person.armL.add(shield);
    }
    const bar = makeHealthBar('#ff6a5a', 2.15, 1.0);
    person.group.add(bar.grp);
    cop.bar = bar;
    this.root.add(person.group);
    this.cops.push(cop);
    this.registerCopTarget(cop);
    return cop;
  }

  registerCopTarget(cop) {
    this.G.targets.push({
      kind: 'cop', ref: cop,
      alive: () => cop.alive,
      hitTest: (o, d, maxDist) => rayCylinder(o, d, cop.pos.x, cop.pos.z, 0.5, 0.2, 1.9, maxDist),
      pos: () => cop.pos,
      damage: (amt, byPlayer) => this.damageCop(cop, amt, byPlayer),
    });
  }

  damageCop(cop, amt, byPlayer) {
    if (!cop.alive) return;
    // swat shield soaks frontal player damage a bit
    cop.hp -= amt;
    cop.bar.set(clamp(cop.hp / cop.maxHp, 0, 1));
    cop.bar.grp.visible = true;
    cop.barT = 3;
    if (cop.state === 'seek') cop.state = 'combat';
    this.lastKnown.copy(this.G.player.pos);
    this.timeUnseen = 0;
    if (cop.hp <= 0) this.downCop(cop, byPlayer);
  }

  downCop(cop, byPlayer) {
    cop.alive = false;
    cop.person.group.rotation.z = Math.random() < 0.5 ? 1.4 : -1.4;
    cop.person.group.position.y = 0.35;
    cop.bar.grp.visible = false;
    cop.deadT = 8;
    this.G.fx.puff(cop.pos.clone().setY(1), cop.type === 'swat' ? '#20242c' : '#20407a', 0.6, 2);
    const b = cop.type === 'swat' ? BOUNTY.swat : BOUNTY.cop;
    const c = cop.type === 'swat' ? CASH.swat : CASH.cop;
    this.G.economy.addBounty(b, 'cop', false, cop.pos.x, cop.pos.z);
    this.G.economy.addCash(c);
    this.G.state.stats.copsDowned++;
    bus.emit('copDown', cop);
    if (Math.random() < 0.5) this.G.hud.subtitle('DISPATCH', pick(['officer down!', 'we need backup!', "he's got the whole block!"]));
  }

  // ---------- cop cars ----------
  spawnCar(type = 'car') {
    const isVan = type === 'van';
    const isTruck = type === 'truck';
    const grp = new THREE.Group();
    const bodyCol = isTruck ? '#33383f' : (isVan ? '#1c2530' : '#20304f');
    const bw = isTruck ? 3.0 : (isVan ? 2.3 : 2.0);
    const bl = isTruck ? 6.5 : (isVan ? 5.2 : 4.6);
    const bh = isTruck ? 2.6 : (isVan ? 2.4 : 0.9);
    const body = new THREE.Mesh(box(bw, bh, bl), mat(bodyCol));
    body.position.y = 0.5 + bh / 2; body.castShadow = true;
    grp.add(body);
    if (!isVan && !isTruck) {
      const cab = new THREE.Mesh(box(bw - 0.2, 0.7, 2.0), mat('#f0f0f0'));
      cab.position.set(0, 1.35, -0.2); grp.add(cab);
      // roof lights
      const lr = new THREE.Mesh(box(0.4, 0.22, 0.4), new THREE.MeshBasicMaterial({ color: '#ff2a2a' }));
      lr.position.set(-0.25, 1.82, -0.2);
      const lb = new THREE.Mesh(box(0.4, 0.22, 0.4), new THREE.MeshBasicMaterial({ color: '#2a4aff' }));
      lb.position.set(0.25, 1.82, -0.2);
      grp.add(lr, lb);
      grp.userData.lights = [lr, lb];
    } else {
      const stripe = new THREE.Mesh(box(bw + 0.02, 0.5, bl * 0.6), mat('#e8e8e8'));
      stripe.position.set(0, 0.9, 0); grp.add(stripe);
      const lr = new THREE.Mesh(box(0.5, 0.2, 0.5), new THREE.MeshBasicMaterial({ color: '#ff2a2a' }));
      lr.position.set(0, bh + 0.6, isTruck ? -2 : -1.5);
      grp.add(lr);
      grp.userData.lights = [lr];
    }
    this.root.add(grp);
    const car = {
      grp, type,
      hp: isTruck ? POLICE.truckHP : (isVan ? POLICE.vanHP : POLICE.carHP),
      maxHp: isTruck ? POLICE.truckHP : (isVan ? POLICE.vanHP : POLICE.carHP),
      dead: false, deadT: 0,
      state: 'drive', speed: 0, cruise: isTruck ? 9 : 13,
      deployed: false, deployCount: isVan ? 4 : (isTruck ? 6 : 2),
      hw: bw / 2 + 0.2, hl: bl / 2 + 0.2, bh,
      blinkT: 0,
      pos: grp.position,
    };
    this.registerCarTarget(car);
    this.cars.push(car);
    return car;
  }

  registerCarTarget(car) {
    this.G.targets.push({
      kind: 'car', ref: car,
      alive: () => !car.dead,
      hitTest: (o, d, maxDist) => {
        const p = car.grp.position;
        const c = car.grp.rotation.y;
        // approximate as an AABB in car-local not worth it; use padded box
        const aabb = { x0: p.x - car.hw - 0.6, x1: p.x + car.hw + 0.6, z0: p.z - car.hl, z1: p.z + car.hl, y1: 0.5 + car.bh + 0.6 };
        const t = rayAABB(o, d, aabb);
        return t !== null && t <= maxDist ? t : null;
      },
      pos: () => car.grp.position,
      damage: (amt, byPlayer) => this.damageCar(car, amt, byPlayer),
    });
  }

  damageCar(car, amt, byPlayer) {
    if (car.dead) return;
    car.hp -= amt;
    if (car.hp <= 0) {
      car.dead = true;
      car.deadT = 16;
      car.grp.children.forEach((c) => { if (c.material) c.material = mat('#1a1c20'); });
      car.grp.rotation.z = rand(-0.12, 0.12);
      this.G.fx.explosion(car.grp.position.clone().setY(1));
      const b = car.type === 'truck' ? BOUNTY.copCar * 4 : (car.type === 'van' ? BOUNTY.swatVan : BOUNTY.copCar);
      this.G.economy.addBounty(b, 'car', false, car.grp.position.x, car.grp.position.z);
      this.G.economy.addCash(CASH.copCar);
      bus.emit('copCarDown', car);
    } else if (byPlayer) {
      this.addHeat(0.02, car.grp.position.x, car.grp.position.z);
    }
  }

  aabbFor(car) {
    const p = car.grp.position;
    return { x0: p.x - car.hw, x1: p.x + car.hw, z0: p.z - car.hl, z1: p.z + car.hl, y1: 0.5 + car.bh };
  }

  // ---------- LOS ----------
  hasLineOfSight(fromX, fromZ, toX, toZ) {
    this._d.set(toX - fromX, 0, toZ - fromZ);
    const dist = this._d.length();
    if (dist < 0.5) return true;
    this._d.normalize();
    this._v.set(fromX, 1.4, fromZ);
    const t = raycastColliders(this._v, this._d, dist - 0.5, this.G.city.grid);
    return t === null;
  }

  // ---------- enemy fire ----------
  copFire(cop, targetRef, tx, tz) {
    const G = this.G;
    const muzzle = this._v.set(cop.pos.x, 1.4, cop.pos.z);
    const aim = new THREE.Vector3(tx + rand(-0.6, 0.6), 1.2 + rand(-0.4, 0.4), tz + rand(-0.6, 0.6));
    G.fx.tracer(muzzle, aim, cop.type === 'swat' ? '#bcffcf' : '#ffd0a0');
    G.fx.muzzle(muzzle, this._d.set(tx - cop.pos.x, 0, tz - cop.pos.z).normalize(), 0.7);
    G.audio.shot('distant');
    const dist = dist2D(cop.pos.x, cop.pos.z, tx, tz);
    let acc = clamp(1 - dist / cop.range, 0.12, 0.72);
    if (this.stars >= 4) acc += 0.05;
    if (Math.random() < acc) {
      const dmg = rand(cop.dmg[0], cop.dmg[1]);
      targetRef.damage(dmg);
    }
  }

  // ---------- pick a hostile target for a cop ----------
  pickTarget(cop) {
    const G = this.G;
    let best = { ref: G.player.dead ? null : { damage: (a) => G.player.damage(a), pos: G.player.pos, isPlayer: true }, d: G.player.dead ? 1e9 : dist2D(cop.pos.x, cop.pos.z, G.player.pos.x, G.player.pos.z) };
    if (G.player.dead) best.d = 1e9;
    if (G.squad) {
      for (const u of G.squad.units) {
        if (u.state === 'down') continue;
        const d = dist2D(cop.pos.x, cop.pos.z, u.pos.x, u.pos.z);
        if (d < best.d * 0.8) best = { ref: { damage: (a) => G.squad.damage(u, a), pos: u.pos, isPlayer: false }, d };
      }
    }
    return best.ref ? best : { ref: { damage: (a) => G.player.damage(a), pos: G.player.pos, isPlayer: true }, d: 1e9 };
  }

  // ---------- cover ----------
  findCover(cop, tx, tz) {
    const cars = this.G.city.coverCars;
    let best = null, bestD = 1e9;
    for (const c of cars) {
      const d = dist2D(cop.pos.x, cop.pos.z, c.x, c.z);
      if (d < 22 && d < bestD) { bestD = d; best = c; }
    }
    // also cop cars
    for (const cc of this.cars) {
      if (cc.dead) continue;
      const p = cc.grp.position;
      const d = dist2D(cop.pos.x, cop.pos.z, p.x, p.z);
      if (d < 22 && d < bestD) { bestD = d; best = { x: p.x, z: p.z }; }
    }
    if (!best) return null;
    // point on the far side of cover from the target
    const dx = best.x - tx, dz = best.z - tz;
    const l = Math.hypot(dx, dz) || 1;
    return { x: best.x + (dx / l) * 2.4, z: best.z + (dz / l) * 2.4 };
  }

  update(dt) {
    const G = this.G;
    const P = G.player;

    // heat decay when unseen
    const anyClose = this.cops.some((c) => c.alive && c.hasLOS);
    if (!anyClose && this.stars > 0 && !this.finaleMode) {
      this.timeUnseen += dt;
      this.evading = true;
      if (this.timeUnseen >= POLICE.decayTime) {
        this.timeUnseen = 0;
        this.loseStar();
      }
    } else {
      this.evading = false;
      if (anyClose) this.timeUnseen = 0;
    }
    // reinforced doors: heat drops fast while inside
    if (G.base?.playerInside() && G.state.upgrades.doors && this.stars > 0) {
      this.heat = damp(this.heat, 0, 1.2, dt);
      this.stars = clamp(Math.floor(this.heat + 0.0001), 0, 5);
      if (this.stars === 0) this.G.audio.sirenStop('dispatch');
    }

    // ---- maintain spawns ----
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.8;
      this.maintainSpawns();
    }

    // ---- update cops ----
    const maxCops = this.finaleMode ? 999 : POLICE.maxCops + POLICE.maxSwat;
    for (const cop of this.cops) {
      if (!cop.alive) {
        cop.deadT -= dt;
        continue;
      }
      this.updateCop(cop, dt);
    }
    // cull dead cops
    for (let i = this.cops.length - 1; i >= 0; i--) {
      const cop = this.cops[i];
      if (!cop.alive && cop.deadT <= 0) this.removeCop(i);
    }

    // ---- update cars ----
    for (const car of this.cars) this.updateCar(car, dt);
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      if (car.dead) { car.deadT -= dt; }
      if (car.dead && car.deadT <= 0 && !this.finaleMode) this.removeCar(i);
      else if (!car.dead) G.dynamicColliders.push(this.aabbFor(car));
    }

    // sirens follow nearest car/cop
    this.updateSirens();
  }

  maintainSpawns() {
    if (this.stars === 0 && !this.finaleMode) return;
    const t = this.targetCounts();
    const aliveCops = this.cops.filter((c) => c.alive && c.type === 'cop').length;
    const aliveSwat = this.cops.filter((c) => c.alive && c.type === 'swat').length;
    const aliveCars = this.cars.filter((c) => !c.dead && c.type === 'car').length;
    const aliveVans = this.cars.filter((c) => !c.dead && c.type === 'van').length;

    const P = this.G.player.pos;
    // spawn a small batch per tick so the wanted level ramps up quickly
    let budget = this.finaleMode ? 6 : 3;
    for (let n = aliveCops; n < t.cops && budget > 0; n++, budget--) {
      const at = this.roadPointNear(P.x, P.z, 42, 100);
      if (at) { const c = this.spawnCop('cop', at); c.state = 'seek'; }
    }
    for (let n = aliveSwat; n < t.swat && budget > 0; n++, budget--) {
      const at = this.roadPointNear(P.x, P.z, 55, 115);
      if (at) { const c = this.spawnCop('swat', at); c.state = 'seek'; }
    }
    if (aliveCars < t.cars) this.spawnCarInbound('car');
    if (aliveVans < t.vans) this.spawnCarInbound('van');
  }

  spawnCarInbound(type) {
    const P = this.G.player.pos;
    // choose a road that passes near the player, spawn at the far end
    const vertical = Math.random() < 0.5;
    const road = pick(ROADS);
    const car = this.spawnCar(type);
    const startAlong = Math.random() < 0.5 ? CITY.min - 8 : CITY.max + 8;
    if (vertical) { car.grp.position.set(road + 3, 0, startAlong); car.axis = 'z'; car.road = road + 3; }
    else { car.grp.position.set(startAlong, 0, road + 3); car.axis = 'x'; car.road = road + 3; }
    car.dir = startAlong < 0 ? 1 : -1;
    car.along = startAlong;
    car.target = { x: P.x, z: P.z };
  }

  updateCop(cop, dt) {
    const G = this.G;
    const P = G.player;
    const tinfo = this.pickTarget(cop);
    const tref = tinfo.ref;
    const tx = tref.pos.x, tz = tref.pos.z;
    const distT = dist2D(cop.pos.x, cop.pos.z, tx, tz);

    // periodic LOS check
    cop.losTimer -= dt;
    if (cop.losTimer <= 0) {
      cop.losTimer = 0.2;
      cop.hasLOS = distT < cop.range + 8 && this.hasLineOfSight(cop.pos.x, cop.pos.z, tx, tz);
      if (cop.hasLOS) { this.lastKnown.set(tx, 0, tz); cop.lastKnown = { x: tx, z: tz }; }
    }

    // state transitions
    if (cop.hasLOS) cop.state = 'combat';
    else if (cop.state === 'combat') cop.state = 'search';

    let moveX = 0, moveZ = 0, moving = false, aiming = false;

    if (cop.state === 'combat') {
      aiming = true;
      // maintain a fighting distance; use cover if available
      const wantDist = cop.type === 'swat' ? 16 : 12;
      if (!cop.coverPoint || Math.random() < 0.01) cop.coverPoint = this.findCover(cop, tx, tz);
      let goalX, goalZ;
      if (cop.coverPoint && distT < cop.range) {
        goalX = cop.coverPoint.x; goalZ = cop.coverPoint.z;
      } else {
        // strafe toward ideal ring
        const dx = cop.pos.x - tx, dz = cop.pos.z - tz;
        const l = Math.hypot(dx, dz) || 1;
        goalX = tx + (dx / l) * wantDist;
        goalZ = tz + (dz / l) * wantDist;
      }
      const gd = dist2D(cop.pos.x, cop.pos.z, goalX, goalZ);
      if (gd > 1.5) { moveX = (goalX - cop.pos.x) / gd; moveZ = (goalZ - cop.pos.z) / gd; moving = true; }
      // face target
      cop.yaw = Math.atan2(tx - cop.pos.x, tz - cop.pos.z);
      // fire
      cop.fireTimer -= dt;
      if (cop.fireTimer <= 0 && distT < cop.range) {
        const burst = cop.type === 'swat' ? 3 : 1;
        this.copFire(cop, tref, tx, tz);
        cop._burst = (cop._burst || 0) + 1;
        cop.fireTimer = cop._burst >= burst ? rand(cop.type === 'swat' ? 1.4 : 0.9, 2.2) : 0.12;
        if (cop._burst >= burst) cop._burst = 0;
      }
    } else if (cop.state === 'search') {
      const lk = cop.lastKnown || this.lastKnown;
      const gd = dist2D(cop.pos.x, cop.pos.z, lk.x, lk.z);
      if (gd > 2) { moveX = (lk.x - cop.pos.x) / gd; moveZ = (lk.z - cop.pos.z) / gd; moving = true; cop.yaw = Math.atan2(moveX, moveZ); }
      else { cop.yaw += dt * 1.5; cop.searchT = (cop.searchT || 0) + dt; if (cop.searchT > 4) cop.state = 'seek'; }
    } else { // seek
      const lk = this.lastKnown;
      const gx = lk.x || P.pos.x, gz = lk.z || P.pos.z;
      const gd = dist2D(cop.pos.x, cop.pos.z, gx, gz);
      if (gd > 2) { moveX = (gx - cop.pos.x) / gd; moveZ = (gz - cop.pos.z) / gd; moving = true; cop.yaw = Math.atan2(moveX, moveZ); }
    }

    // separation from other cops
    for (const other of this.cops) {
      if (other === cop || !other.alive) continue;
      const dx = cop.pos.x - other.pos.x, dz = cop.pos.z - other.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.4 && d > 0.01) { moveX += (dx / d) * 0.5; moveZ += (dz / d) * 0.5; moving = true; }
    }

    if (moving) {
      const l = Math.hypot(moveX, moveZ) || 1;
      const spd = cop.speed;
      cop.pos.x += (moveX / l) * spd * dt;
      cop.pos.z += (moveZ / l) * spd * dt;
      resolveStatic(cop.pos, 0.5, G.city.grid, 0);
      // keep out of base safe zone unless finale
      if (!this.finaleMode && G.base?.inZone(cop.pos.x, cop.pos.z)) {
        // push back toward edge
        cop.pos.x = clamp(cop.pos.x, cop.pos.x < 0 ? -1000 : BASE.zone.x1, 1000);
      }
      cop.phase += spd * dt * 2.2;
      walkAnim(cop.person, cop.phase, 0.7);
    } else {
      stillPose(cop.person);
    }
    aimPose(cop.person, aiming);
    cop.person.group.rotation.y = angleLerp(cop.person.group.rotation.y, cop.yaw, Math.min(1, dt * 10));

    // health bar billboard + fade
    if (cop.barT > 0) { cop.barT -= dt; if (cop.barT <= 0) cop.bar.grp.visible = false; }
    cop.bar.grp.quaternion.copy(G.camera.quaternion);

    // register collider so player can't walk through cops (soft)
    // (skipped: keeps combat fluid)
  }

  removeCop(i) {
    const cop = this.cops[i];
    this.root.remove(cop.person.group);
    this.cops.splice(i, 1);
    const ti = this.G.targets.findIndex((t) => t.ref === cop);
    if (ti >= 0) this.G.targets.splice(ti, 1);
  }
  removeCar(i) {
    const car = this.cars[i];
    this.root.remove(car.grp);
    this.cars.splice(i, 1);
    const ti = this.G.targets.findIndex((t) => t.ref === car);
    if (ti >= 0) this.G.targets.splice(ti, 1);
  }

  updateCar(car, dt) {
    // blink lights
    car.blinkT += dt;
    const on = Math.floor(car.blinkT * 4) % 2 === 0;
    const lights = car.grp.userData.lights;
    if (lights) lights.forEach((l, k) => { l.material.color.set(on === (k === 0) ? (k === 0 ? '#ff2a2a' : '#2a4aff') : '#3a1a1a'); });

    if (car.dead) return;

    if (car.state === 'drive' && !car.deployed) {
      const P = this.G.player.pos;
      const target = car.target || { x: P.x, z: P.z };
      const d = dist2D(car.grp.position.x, car.grp.position.z, P.x, P.z);
      // drive along its road toward player's cross street, then stop and deploy
      if (d > 26) {
        car.speed = damp(car.speed, car.cruise, 2, dt);
        if (car.axis === 'x') {
          car.along += car.speed * car.dir * dt;
          // steer road toward player's z
          car.road = damp(car.road, clamp(P.z + 3, CITY.min, CITY.max), 1.2, dt);
          car.grp.position.set(car.along, 0, car.road);
          car.grp.rotation.y = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          if ((car.dir > 0 && car.along > P.x) || (car.dir < 0 && car.along < P.x)) car.dir *= -1;
        } else {
          car.along += car.speed * car.dir * dt;
          car.road = damp(car.road, clamp(P.x + 3, CITY.min, CITY.max), 1.2, dt);
          car.grp.position.set(car.road, 0, car.along);
          car.grp.rotation.y = car.dir > 0 ? 0 : Math.PI;
          if ((car.dir > 0 && car.along > P.z) || (car.dir < 0 && car.along < P.z)) car.dir *= -1;
        }
      } else {
        car.speed = damp(car.speed, 0, 6, dt);
        if (car.speed < 1) this.deployCar(car);
      }
    }
  }

  deployCar(car) {
    car.deployed = true;
    car.state = 'parked';
    const p = car.grp.position;
    for (let k = 0; k < car.deployCount; k++) {
      const type = car.type === 'van' ? 'swat' : (car.type === 'truck' ? 'swat' : 'cop');
      const ang = rand(Math.PI * 2);
      const cop = this.spawnCop(type, { x: p.x + Math.cos(ang) * 2.5, z: p.z + Math.sin(ang) * 2.5 });
      cop.state = 'seek';
    }
    if (car.type === 'van') this.G.hud.subtitle('DISPATCH', 'SWAT deploying — take them down!');
  }

  updateSirens() {
    const P = this.G.player.pos;
    let nearest = 1e9, nid = null;
    for (const car of this.cars) {
      if (car.dead) continue;
      const d = dist2D(P.x, P.z, car.grp.position.x, car.grp.position.z);
      if (d < nearest) { nearest = d; nid = car; }
    }
    if (this.stars > 0 || this.finaleMode) {
      this.G.audio.sirenStart('dispatch');
      this.G.audio.sirenUpdate('dispatch', Math.min(nearest, 160));
    }
  }

  // ---------- respawn / wasted ----------
  onRespawn() {
    // clear all cops & cars, reset heat
    for (let i = this.cops.length - 1; i >= 0; i--) this.removeCop(i);
    for (let i = this.cars.length - 1; i >= 0; i--) this.removeCar(i);
    this.heat = 0; this.stars = 0; this.evading = false; this.finaleMode = false;
    this.G.audio.sirenStop('dispatch');
    this.G.player.reset(true);
    saveGame(this.G.state);
  }

  clearAll() {
    for (let i = this.cops.length - 1; i >= 0; i--) this.removeCop(i);
    for (let i = this.cars.length - 1; i >= 0; i--) this.removeCar(i);
    this.heat = 0; this.stars = 0;
    this.G.audio.sirenStop('dispatch');
  }
}

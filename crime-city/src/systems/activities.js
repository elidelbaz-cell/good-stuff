// Bounty-earning activities beyond fighting cops: store stickups, turf
// takeovers (mob flags), escort/smuggling runs, and surviving 5-star chases.
import * as THREE from 'three';
import { BOUNTY, CASH, BASE, CITY, ROADS } from '../core/config.js';
import { bus } from '../core/bus.js';
import {
  rand, pick, clamp, dist2D, resolveStatic, angleLerp, rayCylinder,
} from '../core/utils.js';
import { makePerson, walkAnim, stillPose } from '../world/people.js';
import { box, mat } from '../core/utils.js';

const CAP_TIME = 4.0;
const SAFE_TIME = 2.6;
const DRUG_SPOTS = [[-120, -8.5], [8.5, 120], [120, 55], [-8.5, -120], [55, -120]];

export class Activities {
  constructor(G) {
    this.G = G;
    this.robbery = null;
    this.capTurf = null;
    this.capProgress = 0;
    this.turfAccum = 0;
    this.chaseT = 0;
    this.escort = null;
    this.drugSpots = [];
    this.buildDrugSpots();
  }

  buildDrugSpots() {
    for (let i = 0; i < DRUG_SPOTS.length; i++) {
      const [x, z] = DRUG_SPOTS[i];
      const m = new THREE.Mesh(box(0.7, 0.5, 0.7),
        new THREE.MeshLambertMaterial({ color: '#2f8f4f', emissive: '#2fbf4f', emissiveIntensity: 0.5 }));
      m.position.set(x, 0.6, z);
      this.G.scene.add(m);
      this.drugSpots.push({ id: 'drug-' + i, x, z, marker: m, cooldown: 0, progress: 0 });
    }
  }

  syncFromState() {
    const G = this.G;
    // cancel any live activity and reset all turf visuals
    if (this.escort) { G.scene.remove(this.escort.person.group); this.escort = null; G.objectiveMarker = null; }
    this.cleanupRobbery();
    this.chaseT = 0; this.capTurf = null; this.capProgress = 0;
    for (const s of this.drugSpots) { s.cooldown = 0; s.progress = 0; }
    for (const t of G.city.turfSpots) {
      const owned = G.state.turf?.includes(t.id);
      t.owned = false; // reset then repaint owned
      t.flag.material = mat(owned ? G.state.mobColor : '#666a72');
      t.flag.position.y = owned ? 5.8 : 2.2;
      t.ring.material.color.set(owned ? G.state.mobColor : '#ffd24a');
      t.ring.material.opacity = owned ? 0.5 : 0.35;
      if (owned) this.paintTurf(t, false);
      t.progress = 0;
    }
    for (const b of G.city.bodegas) b.cooldown = 0;
  }

  // ---------------- store robbery: shoot the clerk, crack the safe ----------------
  updateRobbery(dt) {
    const G = this.G, p = G.player.pos;
    for (const b of G.city.bodegas) if (b.cooldown > 0) b.cooldown -= dt;

    if (this.robbery) { this.stepRobbery(dt); return; }
    if (G.vehicle || G.player.dead || G.finale?.active) return;

    let near = null, nd = 4;
    for (const b of G.city.bodegas) {
      if (b.cooldown > 0) continue;
      const d = dist2D(p.x, p.z, b.x, b.z);
      if (d < nd) { nd = d; near = b; }
    }
    if (near && !G.interact) {
      G.interact = { text: `stick up the ${near.name} — walk in strapped`, keyLabel: 'E' };
      if (G.input.pressed('KeyE')) this.startRobbery(near);
    }
  }

  startRobbery(b) {
    const G = this.G;
    const cx = b.x - 4, cz = b.z + 3.6;   // behind the counter, in the doorway
    const cashier = makePerson({ shirt: '#dfe6ff', pants: '#2a2d3a', hat: 'cap', hatColor: '#8a1f1f' });
    cashier.group.position.set(cx, 0, cz);
    cashier.group.rotation.y = Math.PI;   // face the street
    cashier.armL.rotation.x = -2.7; cashier.armR.rotation.x = -2.7; // hands up
    G.scene.add(cashier.group);
    const counter = new THREE.Mesh(box(3.6, 1.1, 0.8), mat('#6a4a30'));
    counter.position.set(cx, 0.55, cz - 1.5);
    G.scene.add(counter);
    const register = new THREE.Mesh(box(0.7, 0.4, 0.5), mat('#2a2d34'));
    register.position.set(cx + 1, 1.3, cz - 1.5); G.scene.add(register);

    const rob = { b, state: 'cashier', cashier, counter, register, safe: null, hp: 34, alive: true, progress: 0, cx, cz };
    this.robbery = rob;
    const entry = {
      kind: 'ped', ref: rob,
      alive: () => rob.alive && rob.state === 'cashier',
      hitTest: (o, d, maxDist) => rayCylinder(o, d, cashier.group.position.x, cashier.group.position.z, 0.5, 0, 1.9, maxDist),
      pos: () => cashier.group.position,
      damage: () => this.hitCashier(),
    };
    rob.entry = entry;
    G.targets.push(entry);
    G.hud.banner('ROBBERY', 'take out the clerk, then crack the safe', 'gold', 2.6);
    G.hud.subtitle('CLERK', pick(['Please — take anything!', "Don't shoot!", 'The safe’s in back!']));
    G.hud.setObjective(`ROB THE ${b.name.toUpperCase()}<br>• take out the clerk`);
    G.audio.scream();
  }

  hitCashier() {
    const rob = this.robbery;
    if (!rob || rob.state !== 'cashier') return;
    rob.hp -= 22;
    if (rob.hp <= 0) this.cashierDown();
  }

  cashierDown() {
    const G = this.G, rob = this.robbery;
    rob.state = 'safe';
    rob.cashier.group.rotation.z = 1.4;
    rob.cashier.group.position.y = 0.35;
    const ti = G.targets.indexOf(rob.entry);
    if (ti >= 0) G.targets.splice(ti, 1);
    const safe = new THREE.Mesh(box(1.2, 1.4, 1.0), mat('#33363d'));
    safe.position.set(rob.cx + 1.6, 0.7, rob.cz - 0.8);
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 10), mat('#c9b04f'));
    dial.rotation.x = Math.PI / 2; dial.position.set(0, 0, 0.53); safe.add(dial);
    G.scene.add(safe);
    rob.safe = safe; rob.dial = dial;
    G.police.addHeat(2, rob.cx, rob.cz);
    bus.emit('gunfire', { x: rob.cx, z: rob.cz, radius: 22 });
    G.hud.subtitle('BOSS', 'Now let’s crack that safe.');
    G.hud.setObjective(`ROB THE ${rob.b.name.toUpperCase()}<br>• clerk down ✓<br>• crack the safe (hold E)`);
  }

  stepRobbery(dt) {
    const G = this.G, rob = this.robbery, p = G.player.pos;
    if (dist2D(p.x, p.z, rob.b.x, rob.b.z) > 34) { this.cancelRobbery(); return; }
    if (rob.state === 'cashier') {
      G.objectiveMarker = { x: rob.cashier.group.position.x, z: rob.cashier.group.position.z };
      return;
    }
    // safe
    G.objectiveMarker = { x: rob.safe.position.x, z: rob.safe.position.z };
    const d = dist2D(p.x, p.z, rob.safe.position.x, rob.safe.position.z);
    if (d < 3 && !G.vehicle && !G.interact) {
      const holding = G.input.down('KeyE');
      rob.progress = clamp(rob.progress + (holding ? dt : -dt * 1.5), 0, SAFE_TIME);
      if (holding) rob.dial.rotation.z += dt * 8;
      G.interact = { text: 'crack the safe', keyLabel: 'E', frac: rob.progress / SAFE_TIME };
      if (rob.progress >= SAFE_TIME) this.finishRobbery();
    }
  }

  finishRobbery() {
    const G = this.G, rob = this.robbery;
    rob.b.cooldown = 75;
    const cash = CASH.safe + Math.round(rand(0, 3000));
    G.economy.addBounty(BOUNTY.safe, 'safe', false, rob.safe.position.x, rob.safe.position.z);
    G.economy.addCash(cash);
    G.hud.banner('SAFE CRACKED', `${rob.b.name} — +$${cash.toLocaleString()}`, 'gold', 2.6);
    G.hud.headline(`armed robbery at ${rob.b.name} — ${G.state.mobName} suspected`);
    G.audio.cashTick(); G.audio.fanfare();
    G.police.addHeat(2, rob.safe.position.x, rob.safe.position.z);
    for (let i = 0; i < 14; i++) G.fx.spark(rob.safe.position.clone().setY(1.2), new THREE.Vector3(0, 1, 0), 1, '#4fbf5f');
    this.cleanupRobbery();
  }

  cancelRobbery() {
    this.G.hud.toast('robbery abandoned');
    this.robbery.b.cooldown = 20;
    this.cleanupRobbery();
  }

  cleanupRobbery() {
    const G = this.G, rob = this.robbery;
    if (!rob) return;
    if (rob.entry) { const ti = G.targets.indexOf(rob.entry); if (ti >= 0) G.targets.splice(ti, 1); }
    G.scene.remove(rob.counter); G.scene.remove(rob.register); G.scene.remove(rob.cashier.group);
    if (rob.safe) G.scene.remove(rob.safe);
    G.hud.setObjective('');
    G.objectiveMarker = null;
    this.robbery = null;
  }

  // ---------------- drug dealing ----------------
  updateDrugs(dt) {
    const G = this.G, p = G.player.pos;
    for (const s of this.drugSpots) {
      if (s.cooldown > 0) { s.cooldown -= dt; s.marker.material.emissiveIntensity = 0.12; }
      else s.marker.material.emissiveIntensity = 0.4 + 0.25 * Math.sin(performance.now() / 300 + s.x);
      s.marker.rotation.y += dt;
    }
    if (this.robbery || G.vehicle || G.player.dead || G.finale?.active) return;
    let near = null, nd = 3.2;
    for (const s of this.drugSpots) {
      if (s.cooldown > 0) continue;
      const d = dist2D(p.x, p.z, s.x, s.z);
      if (d < nd) { nd = d; near = s; }
    }
    if (near && !G.interact) {
      const holding = G.input.down('KeyE');
      near.progress = clamp(near.progress + (holding ? dt : -dt * 1.5), 0, 2.2);
      G.interact = { text: 'deal on this corner', keyLabel: 'E', frac: near.progress / 2.2 };
      if (near.progress >= 2.2) this.doDeal(near);
    } else {
      for (const s of this.drugSpots) if (s !== near) s.progress = 0;
    }
  }

  doDeal(s) {
    const G = this.G;
    s.progress = 0; s.cooldown = 40;
    const cash = CASH.drug + Math.round(rand(0, 2000));
    G.economy.addBounty(BOUNTY.drug, 'drug', false, s.x, s.z);
    G.economy.addCash(cash);
    G.hud.banner('DRUG DEAL', `slung product — +$${cash.toLocaleString()}`, 'gold', 2.2);
    G.audio.cashTick();
    G.police.addHeat(1, s.x, s.z);
    // sometimes the deal goes bad and heat spikes
    if (Math.random() < 0.4) {
      G.hud.subtitle('BOSS', 'Deal’s gone sour — heat’s coming.');
      G.police.addHeat(1.5, s.x, s.z);
    }
  }

  // ---------------- turf takeovers ----------------
  updateTurf(dt) {
    const G = this.G, p = G.player.pos;

    // passive income from owned corners
    const owned = G.city.turfSpots.filter((t) => t.owned).length;
    if (owned > 0) {
      this.turfAccum += owned * dt;
      if (this.turfAccum >= 3) {
        this.turfAccum = 0;
        G.economy.addCash(owned * CASH.turfTick);
      }
    }
    // animate flags
    for (const t of G.city.turfSpots) {
      if (t.owned && t.flag.position.y < 5.8) t.flag.position.y = Math.min(5.8, t.flag.position.y + dt * 2.5);
      if (t.ring.material.opacity !== undefined) t.ring.rotation.y += dt * (t.owned ? 0.8 : 0.2);
    }

    let near = null, nd = 6.5;
    for (const t of G.city.turfSpots) {
      if (t.owned) continue;
      const d = dist2D(p.x, p.z, t.x, t.z);
      if (d < nd) { nd = d; near = t; }
    }
    if (near && !G.player.dead && !G.finale?.active && !G.vehicle) {
      if (this.capTurf !== near) { this.capTurf = near; this.capProgress = 0; }
      if (!G.interact) {
        // capture is faster with no cops nearby; henchmen help hold it
        const copNear = G.police.cops.some((c) => c.alive && dist2D(c.pos.x, c.pos.z, near.x, near.z) < 14);
        const rate = copNear ? 0.4 : 1;
        this.capProgress = clamp(this.capProgress + rate * dt, 0, CAP_TIME);
        near.progress = this.capProgress;
        G.interact = {
          text: copNear ? 'clear the cops to raise your flag' : 'hold this corner — planting your flag',
          keyLabel: '⚑', frac: this.capProgress / CAP_TIME,
        };
        if (this.capProgress >= CAP_TIME) this.captureTurf(near);
      }
    } else {
      if (this.capTurf) this.capTurf.progress = 0;
      this.capTurf = null; this.capProgress = 0;
    }
  }

  paintTurf(t, announce = true) {
    const G = this.G;
    t.owned = true;
    t.flag.material = mat(G.state.mobColor);
    t.ring.material.color.set(G.state.mobColor);
    t.ring.material.opacity = 0.5;
    t.flag.position.y = 5.8;
    if (announce) {
      G.economy.addBounty(BOUNTY.turf, 'turf', false, t.x, t.z);
      G.economy.addCash(CASH.turfCapture);
      G.hud.banner('TURF TAKEN', 'this corner flies your colors now', 'gold', 2.4);
      G.audio.fanfare();
      G.police.addHeat(1.5, t.x, t.z);
      if (!G.state.turf.includes(t.id)) G.state.turf.push(t.id);
    }
  }
  captureTurf(t) {
    this.capTurf = null; this.capProgress = 0;
    this.paintTurf(t, true);
  }

  // ---------------- escort / smuggling run ----------------
  startEscort() {
    const G = this.G;
    if (this.escort) { G.hud.toast('a run is already underway'); return; }
    // courier starts at the garage, walks to a far drop point
    const person = makePerson({ shirt: '#c9b04f', pants: '#3a3a3a', hat: 'fedora', hatColor: '#2a2a2a' });
    const suitcase = new THREE.Mesh(box(0.4, 0.3, 0.14), mat('#5a3a1f'));
    suitcase.position.set(0.42, 0.9, -0.2);
    person.group.add(suitcase);
    const start = { x: -228, z: BASE.z1 + 6 };
    person.group.position.set(start.x, 0, start.z);
    G.scene.add(person.group);
    // drop point: a far road point
    let drop = null;
    for (let i = 0; i < 30; i++) {
      const road = pick(ROADS), along = rand(CITY.min + 20, CITY.max - 20);
      const cand = Math.random() < 0.5 ? { x: road, z: along } : { x: along, z: road };
      if (dist2D(cand.x, cand.z, start.x, start.z) > 160) { drop = cand; break; }
    }
    drop = drop || { x: 160, z: 160 };
    this.escort = { person, pos: person.group.position, drop, hp: 120, phase: 0, heatT: 3, failT: 0, done: false };
    G.objectiveMarker = drop;
    G.hud.banner('SMUGGLING RUN', 'get the courier to the drop — protect him!', 'gold', 3);
    G.hud.toast('escort: follow the gold marker on your minimap', 'green');
    G.police.addHeat(2, start.x, start.z);
  }

  updateEscort(dt) {
    const e = this.escort;
    if (!e) return;
    const G = this.G;
    // move toward drop
    const d = dist2D(e.pos.x, e.pos.z, e.drop.x, e.drop.z);
    if (d > 2.5) {
      const mx = (e.drop.x - e.pos.x) / d, mz = (e.drop.z - e.pos.z) / d;
      const spd = 4.4;
      e.pos.x += mx * spd * dt; e.pos.z += mz * spd * dt;
      resolveStatic(e.pos, 0.45, G.city.grid, 0);
      e.phase += spd * dt * 2.2;
      walkAnim(e.person, e.phase, 0.7);
      e.person.group.rotation.y = angleLerp(e.person.group.rotation.y, Math.atan2(mx, mz), Math.min(1, dt * 8));
    } else {
      this.finishEscort(true);
      return;
    }
    // periodic heat so cops keep coming
    e.heatT -= dt;
    if (e.heatT <= 0) { e.heatT = 6; G.police.addHeat(0.6, e.pos.x, e.pos.z); }

    // cops can grab the courier if the player isn't protecting
    const playerNear = dist2D(e.pos.x, e.pos.z, G.player.pos.x, G.player.pos.z) < 8;
    let copGrab = false;
    for (const c of G.police.cops) {
      if (!c.alive) continue;
      const cd = dist2D(c.pos.x, c.pos.z, e.pos.x, e.pos.z);
      if (cd < 3) { copGrab = true; }
      if (cd < 26) { // cops shoot the courier
        if (Math.random() < 0.4 * dt) { e.hp -= rand(3, 7); }
      }
    }
    if (copGrab && !playerNear) { e.failT += dt; if (e.failT > 1.2) return this.finishEscort(false, 'the courier got pinched'); }
    else e.failT = Math.max(0, e.failT - dt);
    if (e.hp <= 0) return this.finishEscort(false, 'the courier went down');
  }

  finishEscort(success, reason) {
    const G = this.G, e = this.escort;
    if (!e || e.done) return;
    e.done = true;
    G.scene.remove(e.person.group);
    G.objectiveMarker = null;
    this.escort = null;
    if (success) {
      const cash = Math.round(rand(3500, 5000));
      G.economy.addBounty(BOUNTY.escort, 'escort', false);
      G.economy.addCash(cash);
      G.hud.banner('DELIVERY MADE', `escort complete — +$${cash.toLocaleString()}`, 'gold', 3);
      G.audio.fanfare();
    } else {
      G.hud.banner('RUN BLOWN', reason || 'the courier is gone', 'red', 3);
      G.audio.sting();
    }
  }

  // ---------------- surviving a 5-star chase ----------------
  startChase() {
    if (this.chaseT > 0) return;
    this.chaseT = 60;
  }
  updateChase(dt) {
    const G = this.G;
    if (this.chaseT > 0) {
      if (G.police.stars >= 5) {
        this.chaseT -= dt;
        if (this.chaseT <= 0) {
          this.chaseT = 0;
          const cash = CASH.chase;
          G.economy.addBounty(BOUNTY.chase, 'chase', false);
          G.economy.addCash(cash);
          G.hud.banner('YOU BEAT THE HEAT', `survived a 5-star chase — +$${cash.toLocaleString()}`, 'gold', 3.2);
          G.audio.fanfare();
        }
      } else {
        this.chaseT = 0;
        G.hud.toast('you slipped the 5-star net');
      }
    }
  }

  update(dt) {
    this.updateRobbery(dt);
    this.updateDrugs(dt);
    this.updateTurf(dt);
    this.updateEscort(dt);
    this.updateChase(dt);
  }
}

// Bounty-earning activities beyond fighting cops: store stickups, turf
// takeovers (mob flags), escort/smuggling runs, and surviving 5-star chases.
import * as THREE from 'three';
import { BOUNTY, CASH, BASE, CITY, ROADS } from '../core/config.js';
import { bus } from '../core/bus.js';
import {
  rand, pick, clamp, dist2D, resolveStatic, angleLerp,
} from '../core/utils.js';
import { makePerson, walkAnim, stillPose } from '../world/people.js';
import { box, mat } from '../core/utils.js';

const ROB_TIME = 2.2;
const CAP_TIME = 4.0;

export class Activities {
  constructor(G) {
    this.G = G;
    this.robStore = null;
    this.robProgress = 0;
    this.capTurf = null;
    this.capProgress = 0;
    this.turfAccum = 0;
    this.chaseT = 0;
    this.escort = null;
  }

  syncFromState() {
    const G = this.G;
    // cancel any live activity and reset all turf visuals
    if (this.escort) { G.scene.remove(this.escort.person.group); this.escort = null; G.objectiveMarker = null; }
    this.chaseT = 0; this.robStore = null; this.robProgress = 0; this.capTurf = null; this.capProgress = 0;
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

  // ---------------- stickups ----------------
  updateStickups(dt) {
    const G = this.G, p = G.player.pos;
    for (const b of G.city.bodegas) if (b.cooldown > 0) b.cooldown -= dt;

    let near = null, nd = 3.6;
    for (const b of G.city.bodegas) {
      if (b.cooldown > 0) continue;
      const d = dist2D(p.x, p.z, b.x, b.z);
      if (d < nd) { nd = d; near = b; }
    }
    if (near && !G.player.dead && !G.finale?.active) {
      if (this.robStore !== near) { this.robStore = near; this.robProgress = 0; }
      if (!G.interact) {
        this.robProgress = clamp(this.robProgress + (G.input.down('KeyE') ? dt : -dt * 2), 0, ROB_TIME);
        G.interact = { text: `hold to stick up the ${near.name}`, keyLabel: 'E', frac: this.robProgress / ROB_TIME };
        if (this.robProgress >= ROB_TIME) this.doStickup(near);
      }
    } else {
      this.robStore = null; this.robProgress = 0;
    }
  }

  doStickup(b) {
    const G = this.G;
    b.cooldown = 60;
    this.robProgress = 0; this.robStore = null;
    const cash = Math.round(rand(1200, 2200));
    G.economy.addBounty(BOUNTY.stickup, 'stickup', false, b.x, b.z);
    G.economy.addCash(cash);
    G.hud.banner('STICKUP!', `${b.name} — +$${cash.toLocaleString()}`, 'gold', 2.2);
    G.hud.headline(`armed robbery at ${b.name} — ${G.state.mobName} suspected`);
    if (b.marker) b.marker.material.emissiveIntensity = 0.1;
    G.audio.cashTick();
    G.police.addHeat(2, b.x, b.z);
    bus.emit('gunfire', { x: b.x, z: b.z, radius: 24 }); // scares peds
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
    if (near && !G.player.dead && !G.finale?.active) {
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
    this.updateStickups(dt);
    this.updateTurf(dt);
    this.updateEscort(dt);
    this.updateChase(dt);
  }
}

// Henchmen: recruit by cash, unlock classes by bounty tier, follow in formation,
// take cover, fight cops, get downed + revived. Commands: F follow, G hold, T attack.
import * as THREE from 'three';
import { HENCH, TIERS, WEAPONS } from '../core/config.js';
import { bus } from '../core/bus.js';
import { maxSquad, tierIndex } from '../core/state.js';
import {
  rand, pick, clamp, dist2D, angleLerp, resolveStatic, rayCylinder, raycastColliders,
} from '../core/utils.js';
import { makePerson, walkAnim, aimPose, stillPose, makeHealthBar } from '../world/people.js';
import { box, mat } from '../core/utils.js';
import { HENCH_NAMES } from '../core/config.js';

const BARKS_ATTACK = ['On it, boss!', 'You got it!', "They're mine!", 'Say the word!', 'Lightin’ em up!'];
const BARKS_FOLLOW = ['Right behind ya.', 'Stickin’ close.', 'Lead the way.', 'We got your back.'];
const BARKS_HOLD = ['Holdin’ here.', 'Diggin’ in.', 'This corner’s ours.', 'Nobody gets past.'];
const BARKS_DOWN = ['I’m hit!', 'Boss… help!', 'They got me!', 'Need a hand!'];
const BARKS_KILL = ['Got one!', 'Down he goes!', 'Ha! Too easy.', 'That’s how we do it.'];

let UID = 0;

export class Squad {
  constructor(G) {
    this.G = G;
    this.root = new THREE.Group();
    G.scene.add(this.root);
    this.units = [];
    this.mode = 'follow';         // follow | hold | attack
    this.forcedTarget = null;
    this.dirtyUI = true;
    this.barkTimer = 0;
    this._usedNames = new Set();

    bus.on('enteredBase', () => this.reviveAllAtBase());
    bus.on('respawn', () => this.onRespawn());
  }

  maxSquad() { return maxSquad(this.G.state.bounty); }

  unlockedTypes() {
    const idx = tierIndex(this.G.state.bounty);
    return TIERS.slice(0, idx + 1).map((t) => t.unlock);
  }

  nextName() {
    const avail = HENCH_NAMES.filter((n) => !this._usedNames.has(n));
    const n = avail.length ? pick(avail) : pick(HENCH_NAMES) + ' ' + (this._usedNames.size + 1);
    this._usedNames.add(n);
    return n;
  }

  syncFromState() {
    // rebuild units from the saved roster
    for (const u of this.units) this.root.remove(u.person.group), this.unregister(u);
    this.units = [];
    this._usedNames.clear();
    this.mode = 'follow';
    this.forcedTarget = null;
    for (const type of (this.G.state.henchmen || [])) this.spawnUnit(type, false);
    this.dirtyUI = true;
  }

  onTierUnlock() { this.dirtyUI = true; }

  // ---- recruitment shop items ----
  recruitItems() {
    const G = this.G, st = G.state;
    const items = [];
    const unlocked = this.unlockedTypes();
    for (const [key, def] of Object.entries(HENCH)) {
      const isUnlocked = unlocked.includes(key);
      const full = this.units.length >= this.maxSquad();
      // tier threshold for locked message
      const tier = TIERS.find((t) => t.unlock === key);
      items.push({
        name: def.name.toUpperCase(),
        desc: isUnlocked
          ? `${def.weapon} · ${def.hp} HP · wears your colors`
          : `unlocks at $${(tier.bounty / 1e6).toFixed(tier.bounty >= 1e6 ? 1 : 2)}M bounty`,
        cost: def.cost,
        locked: !isUnlocked || full,
        lockedLabel: !isUnlocked ? 'LOCKED' : 'SQUAD FULL',
        onBuy: () => {
          st.henchmen.push(key);
          this.spawnUnit(key, true);
          this.dirtyUI = true;
          G.hud.toast(`recruited a ${def.name}`, 'green');
        },
      });
    }
    // status header row via desc on first? Just return; shop shows squad count in title elsewhere.
    return items;
  }

  spawnUnit(type, announce) {
    const def = HENCH[type];
    const st = this.G.state;
    const prop = def.weapon === 'bat' ? 'bat' : def.weapon;
    const person = makePerson({
      shirt: st.mobColor,
      pants: '#26282f',
      hat: type === 'bodyguard' ? 'fedora' : (type === 'veteran' ? 'cap' : null),
      hatColor: '#1a1c22',
      prop: prop === 'rifle' ? 'rifle' : prop,
    });
    if (type === 'bodyguard') {
      // armor plate
      const vest = new THREE.Mesh(box(0.66, 0.5, 0.38), mat('#3a3d46'));
      vest.position.set(0, 1.14, 0);
      person.group.add(vest);
    }
    const unit = {
      id: 'u' + (UID++),
      type, def, person,
      name: this.nextName(),
      pos: person.group.position,
      hp: def.hp, maxHp: def.hp,
      state: 'follow',
      slot: this.units.length,
      phase: rand(6), yaw: 0,
      fireTimer: rand(0.3, 1.2), _burst: 0,
      losTimer: rand(0, 0.2), hasLOS: false,
      target: null, reviveT: 0,
      speed: def.speed,
      melee: def.weapon === 'bat',
      range: def.range,
    };
    // spawn near player/base
    const p = this.G.player.pos;
    unit.pos.set(p.x + rand(-3, 3), 0, p.z + rand(-3, 3));
    const bar = makeHealthBar('#6dff7a', 2.15, 1.0);
    person.group.add(bar.grp);
    unit.bar = bar;
    this.root.add(person.group);
    this.units.push(unit);
    this.register(unit);
    if (announce) {
      this.G.audio.bark();
      this.G.hud.subtitle(unit.name, pick(BARKS_FOLLOW));
    }
    return unit;
  }

  register(unit) {
    // henchmen are NOT player-shootable, but cops can hit them via this list? No —
    // cops target them directly via pos. We register only for revive proximity.
    unit._targetEntry = null;
  }
  unregister(unit) {}

  // ---- combat: henchman fires at a cop ----
  fireAt(unit, cop, tx, tz) {
    const G = this.G;
    const muzzle = new THREE.Vector3(unit.pos.x, 1.4, unit.pos.z);
    const aim = new THREE.Vector3(tx + rand(-0.5, 0.5), 1.2 + rand(-0.3, 0.3), tz + rand(-0.5, 0.5));
    if (unit.melee) {
      // bat swing handled by proximity; here we just do a melee hit
      G.audio.punch();
      cop && G.police.damageCop(cop, unit.def.dmg, false);
      G.fx.impact(new THREE.Vector3(tx, 1, tz), new THREE.Vector3(0, 1, 0), 'flesh');
      return;
    }
    G.fx.tracer(muzzle, aim, '#c8ff9a');
    G.fx.muzzle(muzzle, aim.clone().sub(muzzle).normalize(), 0.6);
    G.audio.shot('distant');
    const dist = dist2D(unit.pos.x, unit.pos.z, tx, tz);
    const acc = clamp(1 - dist / unit.range, 0.18, 0.7);
    if (cop && Math.random() < acc) {
      G.police.damageCop(cop, unit.def.dmg, false);
      if (!cop.alive && Math.random() < 0.35) this.G.hud.subtitle(unit.name, pick(BARKS_KILL));
    }
  }

  nearestCop(x, z, maxD = 70) {
    let best = null, bestD = maxD;
    for (const c of this.G.police.cops) {
      if (!c.alive) continue;
      const d = dist2D(x, z, c.pos.x, c.pos.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  // formation slot in world space (behind the player)
  formationPos(slot, out) {
    const P = this.G.player;
    const row = Math.floor(slot / 3);
    const col = (slot % 3) - 1;
    const back = 3 + row * 2.4;
    const side = col * 2.4;
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw); // forward
    const rx = -fz, rz = fx;                             // right
    out.x = P.pos.x - fx * back + rx * side;
    out.z = P.pos.z - fz * back + rz * side;
    return out;
  }

  setMode(mode) {
    if (this.mode === mode && mode !== 'attack') return;
    this.mode = mode;
    if (mode === 'hold') for (const u of this.units) u.holdPos = { x: u.pos.x, z: u.pos.z };
    const alive = this.units.filter((u) => u.state !== 'down');
    if (alive.length) {
      const u = pick(alive);
      const line = mode === 'follow' ? pick(BARKS_FOLLOW) : mode === 'hold' ? pick(BARKS_HOLD) : pick(BARKS_ATTACK);
      this.G.hud.subtitle(u.name, line);
      this.G.audio.bark();
    }
  }

  // T — attack the thing the player is looking at
  attackMyTarget() {
    const G = this.G;
    const o = G.camera.position.clone();
    const d = new THREE.Vector3();
    G.camera.getWorldDirection(d);
    let best = null, bestT = raycastColliders(o, d, 120, G.city.grid) ?? 120;
    for (const c of G.police.cops) {
      if (!c.alive) continue;
      const t = rayCylinder(o, d, c.pos.x, c.pos.z, 1.2, 0.2, 1.9, bestT);
      if (t !== null) { bestT = t; best = c; }
    }
    // fall back to nearest cop to the player
    if (!best) best = this.nearestCop(G.player.pos.x, G.player.pos.z, 90);
    this.forcedTarget = best;
    this.setMode('attack');
    if (best) G.hud.toast('squad: attacking your target', 'green');
    else G.hud.toast('no target — squad on the move');
  }

  reviveAllAtBase() {
    for (const u of this.units) {
      if (u.state === 'down') this.reviveUnit(u, u.maxHp);
      else u.hp = u.maxHp;
      u.bar.set(clamp(u.hp / u.maxHp, 0, 1));
    }
    this.dirtyUI = true;
  }

  reviveUnit(u, hp) {
    u.state = this.mode === 'attack' ? 'follow' : this.mode;
    u.hp = hp;
    u.person.group.rotation.z = 0;
    u.person.group.position.y = 0;
    u.reviveT = 0;
    u.bar.grp.visible = true;
    u.bar.set(clamp(u.hp / u.maxHp, 0, 1));
  }

  downUnit(u) {
    u.state = 'down';
    u.hp = 0;
    u.person.group.rotation.z = Math.random() < 0.5 ? 1.4 : -1.4;
    u.person.group.position.y = 0.35;
    u.reviveT = 15; // revive window
    u.bar.set(0);
    this.G.hud.subtitle(u.name, pick(BARKS_DOWN));
    this.dirtyUI = true;
  }

  damage(u, amt) {
    if (u.state === 'down') return;
    u.hp -= amt;
    u.bar.set(clamp(u.hp / u.maxHp, 0, 1));
    u.bar.grp.visible = true;
    if (u.hp <= 0) this.downUnit(u);
  }

  loseUnit(u) {
    // permanent (revive window expired) — remove from field + roster
    this.root.remove(u.person.group);
    const i = this.units.indexOf(u);
    if (i >= 0) this.units.splice(i, 1);
    const ri = this.G.state.henchmen.indexOf(u.type);
    if (ri >= 0) this.G.state.henchmen.splice(ri, 1);
    this.G.state.stats.henchLost++;
    this._usedNames.delete(u.name);
    this.G.hud.toast(`${u.name} is gone`, 'red');
    this.dirtyUI = true;
    // reassign slots
    this.units.forEach((uu, k) => uu.slot = k);
  }

  onRespawn() {
    // downed crew are lost when the boss is wasted; survivors regroup at base
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (u.state === 'down') this.loseUnit(u);
    }
    for (const u of this.units) {
      const p = this.G.player.pos;
      u.pos.set(p.x + rand(-3, 3), 0, p.z + rand(-3, 3));
      u.hp = u.maxHp; u.state = 'follow'; u.bar.set(1);
    }
    this.mode = 'follow';
    this.forcedTarget = null;
    this.dirtyUI = true;
  }

  update(dt) {
    const G = this.G;
    if (!G.shopOpen) {
      if (G.input.pressed('KeyF')) this.setMode('follow');
      if (G.input.pressed('KeyG')) this.setMode('hold');
      if (G.input.pressed('KeyT')) this.attackMyTarget();
    }

    // forced target cleared when dead
    if (this.forcedTarget && !this.forcedTarget.alive) this.forcedTarget = null;

    // nearest downed unit → revive prompt (only if not already showing a base station prompt)
    let reviveTarget = null, reviveD = 3.2;
    for (const u of this.units) {
      if (u.state !== 'down') continue;
      const d = dist2D(G.player.pos.x, G.player.pos.z, u.pos.x, u.pos.z);
      if (d < reviveD) { reviveD = d; reviveTarget = u; }
    }
    if (reviveTarget && !G.interact && !G.vehicle) {
      G.interact = { text: `revive ${reviveTarget.name}`, keyLabel: 'E' };
      if (G.input.pressed('KeyE')) {
        this.reviveUnit(reviveTarget, reviveTarget.maxHp * 0.5);
        G.audio.bark();
        G.hud.subtitle(reviveTarget.name, 'Back in it, boss!');
        this.dirtyUI = true;
      }
    }

    const formTmp = { x: 0, z: 0 };
    for (const u of this.units) {
      if (u.state === 'down') {
        u.reviveT -= dt;
        if (u.reviveT <= 0) this.loseUnit(u);
        continue;
      }
      this.updateUnit(u, dt, formTmp);
    }

    // periodic idle bark under fire
    this.barkTimer -= dt;
    if (this.barkTimer <= 0 && this.mode === 'attack' && this.units.some((u) => u.hasLOS)) {
      this.barkTimer = rand(4, 8);
      const u = pick(this.units.filter((x) => x.state !== 'down'));
      if (u) G.hud.subtitle(u.name, pick(BARKS_ATTACK));
    }
  }

  updateUnit(u, dt, formTmp) {
    const G = this.G;

    // choose target
    let cop = null;
    if (this.mode === 'attack' && this.forcedTarget && this.forcedTarget.alive) cop = this.forcedTarget;
    else cop = this.nearestCop(u.pos.x, u.pos.z, this.mode === 'hold' ? 32 : 60);

    let moveX = 0, moveZ = 0, moving = false, aiming = false, faceYaw = u.yaw;

    if (cop) {
      const tx = cop.pos.x, tz = cop.pos.z;
      const distT = dist2D(u.pos.x, u.pos.z, tx, tz);
      u.losTimer -= dt;
      if (u.losTimer <= 0) { u.losTimer = 0.2; u.hasLOS = this.hasLOS(u.pos.x, u.pos.z, tx, tz); }
      aiming = !u.melee;
      faceYaw = Math.atan2(tx - u.pos.x, tz - u.pos.z);

      const desired = u.melee ? 1.6 : (u.type === 'veteran' ? 30 : u.range * 0.6);
      if (distT > desired + 2) {
        moveX = (tx - u.pos.x) / distT; moveZ = (tz - u.pos.z) / distT; moving = true;
      } else if (distT < desired - 3 && !u.melee) {
        moveX = (u.pos.x - tx) / distT; moveZ = (u.pos.z - tz) / distT; moving = true;
      }
      // fire / melee
      u.fireTimer -= dt;
      if (u.fireTimer <= 0 && (u.melee ? distT < 2.4 : (u.hasLOS && distT < u.range))) {
        this.fireAt(u, cop, tx, tz);
        if (u.melee) { u.fireTimer = 1 / u.def.rate; }
        else {
          const burst = u.def.weapon === 'tommy' ? 4 : (u.def.weapon === 'shotgun' ? 1 : 1);
          u._burst++;
          u.fireTimer = u._burst >= burst ? rand(0.8, 1.6) / (u.def.rate / 1.5) : 0.09;
          if (u._burst >= burst) u._burst = 0;
        }
      }
    } else {
      // no enemy: follow or hold
      if (this.mode === 'hold' && u.holdPos) {
        const d = dist2D(u.pos.x, u.pos.z, u.holdPos.x, u.holdPos.z);
        if (d > 1) { moveX = (u.holdPos.x - u.pos.x) / d; moveZ = (u.holdPos.z - u.pos.z) / d; moving = true; faceYaw = Math.atan2(moveX, moveZ); }
        else faceYaw = G.player.yaw;
      } else {
        // follow formation
        this.formationPos(u.slot, formTmp);
        const d = dist2D(u.pos.x, u.pos.z, formTmp.x, formTmp.z);
        if (d > 1.4) {
          const spd = d > 10 ? 1 : 1;
          moveX = (formTmp.x - u.pos.x) / d; moveZ = (formTmp.z - u.pos.z) / d; moving = true;
          faceYaw = Math.atan2(moveX, moveZ);
          u.runFactor = d > 8 ? 1.35 : 1;   // catch up if far
        } else { faceYaw = G.player.yaw; u.runFactor = 1; }
      }
    }

    // bodyguards glue to the player
    if (u.type === 'bodyguard' && !cop) {
      const d = dist2D(u.pos.x, u.pos.z, G.player.pos.x, G.player.pos.z);
      if (d > 3.2) { moveX = (G.player.pos.x - u.pos.x) / d; moveZ = (G.player.pos.z - u.pos.z) / d; moving = true; faceYaw = Math.atan2(moveX, moveZ); u.runFactor = 1.2; }
    }

    // separation
    for (const other of this.units) {
      if (other === u || other.state === 'down') continue;
      const dx = u.pos.x - other.pos.x, dz = u.pos.z - other.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.3 && d > 0.01) { moveX += (dx / d) * 0.6; moveZ += (dz / d) * 0.6; moving = true; }
    }

    if (moving) {
      const l = Math.hypot(moveX, moveZ) || 1;
      const spd = u.speed * (u.runFactor || 1);
      u.pos.x += (moveX / l) * spd * dt;
      u.pos.z += (moveZ / l) * spd * dt;
      resolveStatic(u.pos, 0.45, G.city.grid, 0);
      u.phase += spd * dt * 2.2;
      walkAnim(u.person, u.phase, 0.7);
    } else {
      stillPose(u.person);
    }
    aimPose(u.person, aiming);
    u.yaw = faceYaw;
    u.person.group.rotation.y = angleLerp(u.person.group.rotation.y, u.yaw, Math.min(1, dt * 10));

    // slow regen out of combat
    if (!cop && u.hp < u.maxHp) { u.hp = Math.min(u.maxHp, u.hp + 6 * dt); u.bar.set(u.hp / u.maxHp); }

    u.bar.grp.quaternion.copy(G.camera.quaternion);
    u.bar.grp.visible = u.hp < u.maxHp - 0.5 || cop;
  }

  hasLOS(fromX, fromZ, toX, toZ) {
    const d = new THREE.Vector3(toX - fromX, 0, toZ - fromZ);
    const dist = d.length();
    if (dist < 0.5) return true;
    d.normalize();
    const o = new THREE.Vector3(fromX, 1.4, fromZ);
    return raycastColliders(o, d, dist - 0.5, this.G.city.grid) === null;
  }
}

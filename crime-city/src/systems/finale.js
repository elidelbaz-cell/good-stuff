// The final brawl (bounty >= $10M): SWAT surrounds your base, then escalating
// waves of police -> SWAT -> an armored riot truck. Win = the city is yours.
import * as THREE from 'three';
import { BASE, BOUNTY, HENCH } from '../core/config.js';
import { bus } from '../core/bus.js';
import { saveGame } from '../core/state.js';
import { rand, pick, dist2D } from '../core/utils.js';

const WAVES = [
  { label: 'WAVE 1', cops: 6, swat: 0, ring: 'base' },
  { label: 'WAVE 2', cops: 8, swat: 1, cars: 1 },
  { label: 'WAVE 3', cops: 8, swat: 3, cars: 2 },
  { label: 'WAVE 4', cops: 5, swat: 5, vans: 1 },
  { label: 'WAVE 5', cops: 4, swat: 7, vans: 1 },
  { label: 'WAVE 6', cops: 2, swat: 9, vans: 2 },
  { label: 'FINAL WAVE', cops: 4, swat: 5, truck: 1 },
];
const DOOR = { x: -204, z: 0 };

export class Finale {
  constructor(G) {
    this.G = G;
    this.triggered = false;
    this.active = false;
    this.state = 'idle';
    this.wave = 0;
    this.waveLabel = '';
    this.timer = 0;
    this.spawnGuard = 0;
    this.startTime = 0;
    this.startHenchLost = 0;

    bus.on('retryFinale', () => this.retry());
  }

  stopMusic() { this.G.audio.musicStop(); }

  fillArmy() {
    const G = this.G, st = G.state;
    const types = G.squad.unlockedTypes();
    const max = G.squad.maxSquad();
    // keep whatever the player already has, then top up with the strongest unlocked
    const strong = [...types].reverse();
    let i = 0;
    while (st.henchmen.length < max) { st.henchmen.push(strong[i % strong.length]); i++; }
    G.squad.syncFromState();
    G.squad.reviveAllAtBase();
    G.squad.setMode('follow');
  }

  trigger() {
    if (this.triggered) return;
    this.triggered = true;
    const G = this.G;
    G.state.bounty = BOUNTY.GOAL;

    // full army + full health, boss at his own front door facing the city
    this.fillArmy();
    G.player.reset(true);
    G.player.pos.set(DOOR.x + 2, 0, DOOR.z);
    G.player.yaw = Math.PI / 2; // face +x, into the streets

    // heat + police into finale mode; clear any stragglers
    G.police.clearAll();
    G.police.finaleMode = true;
    G.police.stars = 5;
    G.audio.sirenStart('dispatch');
    G.audio.musicStart();

    this.active = true;
    this.state = 'intro';
    this.timer = 3.4;
    this.wave = 0;
    this.startTime = G.state.stats.time;
    this.startHenchLost = G.state.stats.henchLost;

    G.hud.banner(`${G.state.mobName.toUpperCase()} vs THE NYPD`, 'LAST STAND — survive every wave', 'finale', 4);
    G.hud.headline(`the entire NYPD converges on ${G.state.mobName} — the city holds its breath`);
    G.hud.subtitle('BOSS', 'This is our city. Nobody takes it from us. FIGHT!');
  }

  startWave(idx) {
    const G = this.G;
    const w = WAVES[idx];
    this.wave = idx;
    this.waveLabel = `${w.label}  ${idx + 1}/${WAVES.length}`;
    this.state = 'fighting';
    this.spawnGuard = 0.6;

    const P = G.player.pos;
    const center = w.ring === 'base' ? DOOR : { x: P.x, z: P.z };

    const ringSpawn = (type, n, r0, r1) => {
      for (let k = 0; k < n; k++) {
        const ang = rand(Math.PI * 2);
        const r = rand(r0, r1);
        let x = center.x + Math.cos(ang) * r;
        let z = center.z + Math.sin(ang) * r;
        x = Math.max(-190, Math.min(185, x)); // keep on the walkable map (east of docks)
        z = Math.max(-185, Math.min(185, z));
        const c = G.police.spawnCop(type, { x, z });
        c.state = 'combat';
        c.hasLOS = true;
      }
    };
    ringSpawn('cop', w.cops || 0, 22, 55);
    ringSpawn('swat', w.swat || 0, 26, 60);

    for (let k = 0; k < (w.cars || 0); k++) this.spawnVehicleNear('car', center);
    for (let k = 0; k < (w.vans || 0); k++) this.spawnVehicleNear('van', center);
    if (w.truck) {
      this.spawnVehicleNear('truck', center);
      G.hud.banner('ARMORED RIOT TRUCK', 'take it down to win the city', 'finale', 3);
    }

    G.hud.banner(w.label, `hold the line — wave ${idx + 1} of ${WAVES.length}`, 'red', 2.6);
    G.audio.sting();
    if (idx === 0) G.hud.subtitle('DISPATCH', 'All units, converge on the warehouse!');
  }

  spawnVehicleNear(type, center) {
    const G = this.G;
    const car = G.police.spawnCar(type);
    const ang = rand(Math.PI * 2), r = rand(60, 100);
    const x = Math.max(-188, Math.min(185, center.x + Math.cos(ang) * r));
    const z = Math.max(-185, Math.min(185, center.z + Math.sin(ang) * r));
    // approach along the nearest axis
    car.axis = Math.abs(Math.cos(ang)) > Math.abs(Math.sin(ang)) ? 'x' : 'z';
    car.grp.position.set(x, 0, z);
    car.road = car.axis === 'x' ? z : x;
    car.along = car.axis === 'x' ? x : z;
    car.dir = (car.axis === 'x' ? center.x - x : center.z - z) > 0 ? 1 : -1;
    car.target = { x: center.x, z: center.z };
  }

  enemiesRemaining() {
    const cops = this.G.police.cops.some((c) => c.alive);
    const cars = this.G.police.cars.some((c) => !c.dead);
    return cops || cars;
  }

  onPlayerDown() {
    if (!this.active) return;
    this.active = false;
    this.state = 'lost';
    this.G.audio.musicStop();
    this.G.audio.wasted();
    this.G.audio.sirenStop('dispatch');
    saveGame(this.G.state);
    this.G.loseT = 1.0;
  }

  retry() {
    this.triggered = false;
    this.G.police.finaleMode = false;
    this.trigger();
  }

  win() {
    const G = this.G;
    this.active = false;
    this.state = 'won';
    G.state.wonGame = true;
    G.police.clearAll();
    G.police.finaleMode = false;
    G.audio.musicStop();
    G.audio.sirenStop('dispatch');
    G.audio.win();

    const secs = Math.round(G.state.stats.time);
    const mm = Math.floor(secs / 60), ss = secs % 60;
    const stats = {
      timeStr: `${mm}m ${ss}s`,
      bounty: '$' + Math.round(G.state.stats.bountyEarned).toLocaleString(),
      henchLost: G.state.stats.henchLost,
      cops: G.state.stats.copsDowned,
    };
    saveGame(G.state);
    G.winStats = stats;
    G.winT = 1.6; // let the last explosion breathe, then the win screen
  }

  update(dt) {
    if (!this.active) return;
    const G = this.G;

    if (this.state === 'intro') {
      this.timer -= dt;
      if (this.timer <= 0) this.startWave(0);
      return;
    }

    if (this.state === 'fighting') {
      if (this.spawnGuard > 0) { this.spawnGuard -= dt; return; }
      if (!this.enemiesRemaining()) {
        // wave cleared
        if (this.wave >= WAVES.length - 1) { this.win(); return; }
        this.state = 'between';
        this.timer = 4;
        G.hud.banner('WAVE CLEARED', 'reinforcements incoming — revive your crew!', 'gold', 3);
        G.audio.fanfare();
        // mid-fight morale: heal the boss a little, auto-revive some downed crew
        G.player.hp = Math.min(G.player.maxHp, G.player.hp + 30);
        this.reviveSomeCrew();
      }
      return;
    }

    if (this.state === 'between') {
      this.timer -= dt;
      // trickle-heal the boss between waves
      G.player.hp = Math.min(G.player.maxHp, G.player.hp + 8 * dt);
      if (this.timer <= 0) this.startWave(this.wave + 1);
    }
  }

  reviveSomeCrew() {
    const down = this.G.squad.units.filter((u) => u.state === 'down');
    // revive up to half of the downed crew each break
    const n = Math.ceil(down.length / 2);
    for (let i = 0; i < n; i++) this.G.squad.reviveUnit(down[i], down[i].maxHp * 0.7);
    if (n > 0) { this.G.hud.toast(`${n} of your crew back on their feet`, 'green'); this.G.squad.dirtyUI = true; }
  }
}

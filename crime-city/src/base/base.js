// The mob HQ: a dock warehouse with your name in lights, sliding mob-color
// doors, and interactive stations inside (weapons wall / planning table /
// recruitment corner / garage). Safe zone, heal, autosave.
import * as THREE from 'three';
import { BASE, WEAPONS, AMMO_PACKS, UPGRADES } from '../core/config.js';
import { bus } from '../core/bus.js';
import { saveGame } from '../core/state.js';
import { box, mat, mesh, clamp, damp } from '../core/utils.js';
import { textTexture } from '../world/canvasTex.js';
import { makePerson } from '../world/people.js';

const CX = (BASE.x0 + BASE.x1) / 2;

export class Base {
  constructor(G) {
    this.G = G;
    this.root = new THREE.Group();
    G.scene.add(this.root);
    this.wasInside = false;
    this.doorOpen = 0;
    this.lastPileCount = -1;
    this.build();

    this.stations = [
      { x: -234, z: -24, r: 4, label: 'browse the WEAPONS WALL', open: () => this.openWeapons() },
      { x: -236, z: -13, r: 3.6, label: 'study the PLANNING TABLE (upgrades)', open: () => this.openUpgrades() },
      { x: -212.5, z: 19, r: 4, label: 'talk to the RECRUITMENT CORNER', open: () => this.openRecruit() },
      { x: -228, z: -22.5, r: 3.4, label: 'start a SMUGGLING RUN (garage)', open: () => this.G.activities?.startEscort() },
    ];
  }

  build() {
    const G = this.G;
    const grid = G.city.grid;
    const { x0, x1, z0, z1, wall, height, doorZ0, doorZ1 } = BASE;
    const wallMat = mat('#7d8188');
    const add = (m) => this.root.add(m);

    // walls (with front door gap)
    const front1 = mesh(wall, height, doorZ0 - z0, '#7d8188');
    front1.position.set(x1 - wall / 2, height / 2, (z0 + doorZ0) / 2);
    const front2 = mesh(wall, height, z1 - doorZ1, '#7d8188');
    front2.position.set(x1 - wall / 2, height / 2, (doorZ1 + z1) / 2);
    const lintel = mesh(wall, height - BASE.doorH, doorZ1 - doorZ0, '#7d8188');
    lintel.position.set(x1 - wall / 2, BASE.doorH + (height - BASE.doorH) / 2, 0);
    const back = mesh(wall, height, z1 - z0, '#71757c');
    back.position.set(x0 + wall / 2, height / 2, 0);
    const sideN = mesh(x1 - x0, height, wall, '#767a81');
    sideN.position.set(CX, height / 2, z0 + wall / 2);
    const sideS = mesh(x1 - x0, height, wall, '#767a81');
    sideS.position.set(CX, height / 2, z1 - wall / 2);
    [front1, front2, lintel, back, sideN, sideS].forEach(add);

    grid.add({ x0: x1 - wall, x1, z0, z1: doorZ0, y1: height });
    grid.add({ x0: x1 - wall, x1, z0: doorZ1, z1, y1: height });
    grid.add({ x0, x1: x0 + wall, z0, z1, y1: height });
    grid.add({ x0, x1, z0, z1: z0 + wall, y1: height });
    grid.add({ x0, x1, z0: z1 - wall, z1, y1: height });

    // roof + trim
    const roof = mesh(x1 - x0 + 1, 0.8, z1 - z0 + 1, '#565a61');
    roof.position.set(CX, height + 0.4, 0);
    add(roof);

    // interior floor + ceiling light boxes + a real light
    const floor = new THREE.Mesh(box(x1 - x0 - wall * 2, 0.12, z1 - z0 - wall * 2), mat('#63666d'));
    floor.position.set(CX, 0.06, 0);
    floor.receiveShadow = true;
    add(floor);
    for (let i = -1; i <= 1; i++) {
      const lamp = new THREE.Mesh(box(2.4, 0.18, 0.5), new THREE.MeshBasicMaterial({ color: '#ffe9b0' }));
      lamp.position.set(CX + i * 11, height - 1.2, 0);
      add(lamp);
    }
    const pt = new THREE.PointLight('#ffe2b0', 900, 55, 1.9);
    pt.position.set(CX, height - 2, 0);
    add(pt);

    // ---- glowing sign over the door (texture set in applyMobStyle) ----
    this.signMat = new THREE.MeshBasicMaterial({ color: '#fff' });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(22, 4), this.signMat);
    sign.position.set(x1 + 0.15, height - 2.2, 0);
    sign.rotation.y = Math.PI / 2;
    add(sign);
    const trim = new THREE.Mesh(box(0.2, 4.6, 23), new THREE.MeshLambertMaterial({ color: '#2a2d35', emissive: '#ffd24a', emissiveIntensity: 0.25 }));
    trim.position.set(x1 + 0.05, height - 2.2, 0);
    add(trim);

    // ---- sliding mob-color doors ----
    this.doorMat = new THREE.MeshLambertMaterial({ color: '#e33b3b' });
    this.doorL = new THREE.Mesh(box(0.3, BASE.doorH, (doorZ1 - doorZ0) / 2), this.doorMat);
    this.doorR = new THREE.Mesh(box(0.3, BASE.doorH, (doorZ1 - doorZ0) / 2), this.doorMat);
    this.doorL.castShadow = this.doorR.castShadow = true;
    add(this.doorL, this.doorR);

    // ---- garage door on the south wall ----
    this.garageMat = new THREE.MeshLambertMaterial({ color: '#e33b3b' });
    const garage = new THREE.Mesh(box(9, 6, 0.3), this.garageMat);
    garage.position.set(-228, 3, z1 + 0.1);
    add(garage);

    // ---- planning table with city map ----
    const table = mesh(6, 0.4, 3.6, '#6e4a2f');
    table.position.set(-236, 1.05, -13);
    add(table);
    for (const [lx, lz] of [[-2.6, -1.4], [2.6, -1.4], [-2.6, 1.4], [2.6, 1.4]]) {
      const leg = mesh(0.3, 0.9, 0.3, '#4a331f');
      leg.position.set(-236 + lx, 0.45, -13 + lz);
      add(leg);
    }
    const mapTex = new THREE.CanvasTexture(this.G.minimap.static);
    mapTex.colorSpace = THREE.SRGBColorSpace;
    const mapTop = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 3.1), new THREE.MeshBasicMaterial({ map: mapTex }));
    mapTop.rotation.x = -Math.PI / 2;
    mapTop.position.set(-236, 1.27, -13);
    add(mapTop);
    grid.add({ x0: -239, x1: -233, z0: -14.9, z1: -11.1, y1: 1.3 });

    // ---- weapons wall ----
    const rackPanel = mesh(14, 4.4, 0.3, '#3a3e46');
    rackPanel.position.set(-234, 2.6, BASE.z0 + wall + 0.2);
    add(rackPanel);
    this.rackGuns = [];
    const gunSpecs = [
      { key: 'pistol', w: 1.6, h: 1.0, x: -239 },
      { key: 'tommy', w: 3.2, h: 1.2, x: -234.5 },
      { key: 'shotgun', w: 3.0, h: 0.9, x: -229.5 },
    ];
    for (const g of gunSpecs) {
      const gm = new THREE.Mesh(box(g.w, g.h * 0.28, 0.3), new THREE.MeshLambertMaterial({ color: '#22252c' }));
      gm.position.set(g.x, 2.9, BASE.z0 + wall + 0.5);
      add(gm);
      this.rackGuns.push({ key: g.key, mesh: gm });
    }

    // ---- cash pile (grows with cash) ----
    const pileGeo = new THREE.BoxGeometry(0.55, 0.2, 0.34);
    this.pile = new THREE.InstancedMesh(pileGeo, new THREE.MeshLambertMaterial({ color: '#4fbf5f' }), 90);
    const m4 = new THREE.Matrix4();
    let n = 0;
    for (let layer = 0; layer < 6 && n < 90; layer++) {
      for (let ix = 0; ix < 6 - layer && n < 90; ix++) for (let iz = 0; iz < 4 && n < 90; iz++) {
        m4.makeRotationY((ix * 7 + iz * 13 + layer * 3) % 6 * 0.12);
        m4.setPosition(-244.5 + ix * 0.62 + layer * 0.3, 0.22 + layer * 0.21, 16.5 + iz * 0.4 + (layer % 2) * 0.2);
        this.pile.setMatrixAt(n++, m4);
      }
    }
    this.pile.count = 1;
    add(this.pile);

    // ---- recruitment corner: couch + poster ----
    const seat = mesh(4, 0.55, 1.3, '#5c3a4a');
    seat.position.set(-212.6, 0.55, 22);
    const backRest = mesh(4, 1.1, 0.4, '#4a2f3c');
    backRest.position.set(-212.6, 1.1, 22.8);
    add(seat, backRest);
    grid.add({ x0: -214.6, x1: -210.6, z0: 21.3, z1: 23.2, y1: 1.4 });
    this.posterMat = new THREE.MeshBasicMaterial({ color: '#fff' });
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.4), this.posterMat);
    poster.position.set(BASE.x1 - wall - 0.1, 3.4, 19);
    poster.rotation.y = -Math.PI / 2;
    add(poster);
    this.decor = new THREE.Group();
    add(this.decor);
  }

  applyMobStyle() {
    const st = this.G.state;
    this.signMat.map = textTexture(st.mobName.toUpperCase(), { w: 1024, h: 192, fg: st.mobColor, bg: '#0b0d13', font: 'bold 110px Impact, Arial Black, sans-serif' });
    this.signMat.needsUpdate = true;
    this.doorMat.color.set(st.mobColor);
    this.garageMat.color.set(st.mobColor);
    this.posterMat.map = textTexture('WANTED: MUSCLE — ASK FOR THE BOSS', { w: 512, h: 256, fg: '#e8dcc0', bg: '#4a3b28', font: 'bold 44px Impact' });
    this.posterMat.needsUpdate = true;
    // loitering henchmen decor
    this.decor.clear();
    for (const [x, z, ry] of [[-213.5, 20.5, 2.6], [-211, 19.5, -2.4]]) {
      const p = makePerson({ shirt: st.mobColor, hat: 'fedora' });
      p.group.position.set(x, 0, z);
      p.group.rotation.y = ry;
      this.decor.add(p.group);
    }
    this.refreshRack();
  }

  refreshRack() {
    const st = this.G.state;
    for (const rg of this.rackGuns) {
      const owned = !!st.weapons[rg.key];
      rg.mesh.material.color.set(owned ? '#d8d2c0' : '#22252c');
    }
  }

  playerInside() {
    const p = this.G.player.pos;
    return p.x > BASE.x0 + 1 && p.x < BASE.x1 - 1 && p.z > BASE.z0 + 1 && p.z < BASE.z1 - 1;
  }
  inZone(x, z) {
    const zn = BASE.zone;
    return x > zn.x0 && x < zn.x1 && z > zn.z0 && z < zn.z1;
  }

  openWeapons() {
    const G = this.G, st = G.state;
    G.shop.show('WEAPONS WALL', () => {
      const armoryMul = st.upgrades.armory ? 0.6 : 1;
      const items = [
        {
          name: 'TOMMY GUN', desc: 'full-auto street sweeper (slot 3)', cost: WEAPONS.tommy.cost,
          owned: st.weapons.tommy,
          onBuy: () => { st.weapons.tommy = true; st.ammo.tommy += 80; G.weapons?.syncFromState(); this.refreshRack(); G.hud.toast('TOMMY GUN on the wall', 'green'); },
        },
        {
          name: 'SHOTGUN', desc: 'doors and everything behind them (slot 4)', cost: WEAPONS.shotgun.cost,
          owned: st.weapons.shotgun,
          onBuy: () => { st.weapons.shotgun = true; st.ammo.shotgun += 16; G.weapons?.syncFromState(); this.refreshRack(); G.hud.toast('SHOTGUN on the wall', 'green'); },
        },
      ];
      for (const [key, pack] of Object.entries(AMMO_PACKS)) {
        items.push({
          name: `${key.toUpperCase()} AMMO +${pack.amount}`,
          desc: st.upgrades.armory ? 'armory discount applied' : '',
          cost: Math.round(pack.cost * armoryMul),
          locked: key !== 'pistol' && !st.weapons[key],
          lockedLabel: 'NO GUN',
          onBuy: () => { st.ammo[key] += pack.amount; },
        });
      }
      return items;
    });
  }

  openUpgrades() {
    const G = this.G, st = G.state;
    G.shop.show('PLANNING TABLE — BASE UPGRADES', () =>
      Object.entries(UPGRADES).map(([key, u]) => ({
        name: u.name.toUpperCase(), desc: u.desc, cost: u.cost,
        owned: st.upgrades[key],
        onBuy: () => {
          st.upgrades[key] = true;
          G.hud.toast(u.name + ' installed', 'green');
          saveGame(st);
        },
      })));
  }

  openRecruit() {
    const G = this.G;
    if (!G.squad) { G.hud.toast('nobody here yet…'); return; }
    G.shop.show('RECRUITMENT CORNER', () => G.squad.recruitItems());
  }

  update(dt) {
    const G = this.G;
    const p = G.player.pos;

    // sliding doors
    const nearDoor = Math.hypot(p.x - BASE.x1, p.z) < 7;
    this.doorOpen = damp(this.doorOpen, nearDoor ? 1 : 0, 6, dt);
    const half = (BASE.doorZ1 - BASE.doorZ0) / 2;
    this.doorL.position.set(BASE.x1 - 0.45, BASE.doorH / 2, BASE.doorZ0 + half / 2 - this.doorOpen * half);
    this.doorR.position.set(BASE.x1 - 0.45, BASE.doorH / 2, BASE.doorZ1 - half / 2 + this.doorOpen * half);

    // enter / exit
    const inside = this.playerInside();
    if (inside && !this.wasInside) {
      saveGame(G.state);
      G.hud.toast('SAVED — the family rests easy', 'green');
      bus.emit('enteredBase');
    }
    this.wasInside = inside;

    // stations
    if (inside && !G.shopOpen) {
      for (const s of this.stations) {
        if (Math.hypot(p.x - s.x, p.z - s.z) < s.r) {
          G.interact = { text: s.label };
          if (G.input.pressed('KeyE')) s.open();
          break;
        }
      }
    }

    // cash pile growth
    const count = clamp(Math.floor(G.state.cash / 350) + 1, 1, 90);
    if (count !== this.lastPileCount) {
      this.lastPileCount = count;
      this.pile.count = count;
    }
  }
}

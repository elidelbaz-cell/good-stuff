// Procedural low-poly Manhattan-flavored grid: blocks, streets, instanced
// buildings, props, park, docks, skyline — plus all static colliders.
import * as THREE from 'three';
import { CITY, ROADS } from '../core/config.js';
import { ColliderGrid, box, mat, pick, rand, randInt } from '../core/utils.js';
import { textTexture, windowTexture } from './canvasTex.js';

const BROWNSTONE_COLORS = ['#a5552f', '#b06a3c', '#8f4e2e', '#c07a4a', '#9c5b36', '#7d4426', '#b8862f', '#8f8a80'];
const TOWER_COLORS = ['#5b7d8f', '#4a6fa5', '#6b8cae', '#3f5e78', '#7797a8', '#54708c', '#8aa5b5'];
const CAR_COLORS = ['#f2c522', '#f2c522', '#c33', '#3a6ea8', '#7d858f', '#2e3440', '#e3e3e3', '#3f7d4c'];
const STORE_NAMES = ['LUCKY DELI', 'CORNER MART', 'BIG SLICE PIZZA', 'GOOD FELLAS GROCERY', "SAL'S BODEGA"];

const blockCenter = (i) => -150 + i * 60;
const BODEGA_BLOCKS = [[0, 1], [4, 0], [2, 4], [5, 3], [1, 3]];
const TURF_CROSSES = [[1, 1], [5, 1], [1, 5], [5, 5], [3, 0], [0, 3]]; // ROADS index pairs
const STAND_SPOTS = [[-52, -52], [68, 8.5], [-111.5, 128], [128, -111.5], [8.5, 68]];

export class City {
  constructor(G) {
    this.G = G;
    this.grid = new ColliderGrid(40);
    this.nightMats = [];
    this.bodegas = [];
    this.turfSpots = [];
    this.sidewalkLoops = [];
    this.coverCars = [];   // static parked cars the cops use as cover
    this.pigeonSpots = [];
    this.lightPhase = 0;
    this.root = new THREE.Group();
    G.scene.add(this.root);
    this.build();
  }

  addCollider(x0, x1, z0, z1, y1 = 50) { this.grid.add({ x0, x1, z0, z1, y1 }); }

  instanced(geo, material, transforms, colors = null, shadow = true) {
    const im = new THREE.InstancedMesh(geo, material, transforms.length);
    const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    const e = new THREE.Euler();
    transforms.forEach((t, i) => {
      p.set(t.x, t.y ?? 0, t.z);
      e.set(0, t.ry ?? 0, 0); q.setFromEuler(e);
      s.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
      m4.compose(p, q, s);
      im.setMatrixAt(i, m4);
      if (colors) im.setColorAt(i, new THREE.Color(colors[i]));
    });
    im.castShadow = shadow;
    im.receiveShadow = true;
    this.root.add(im);
    return im;
  }

  build() {
    const { min, max } = CITY;

    // ---------- ground ----------
    const ground = new THREE.Mesh(box(max - min + 24, 0.1, max - min + 24), mat('#3d4048'));
    ground.position.set((min + max) / 2, -0.05, 0);
    ground.receiveShadow = true;
    this.root.add(ground);

    const dockGround = new THREE.Mesh(box(CITY.dock.x1 - CITY.dock.x0 + 4, 0.12, max - min + 24), mat('#84878f'));
    dockGround.position.set((CITY.dock.x0 + CITY.dock.x1) / 2, -0.04, 0);
    dockGround.receiveShadow = true;
    this.root.add(dockGround);

    const water = new THREE.Mesh(box(340, 0.1, 900), mat('#1c4f6e'));
    water.position.set(CITY.waterX - 170, -0.18, 0);
    this.root.add(water);

    // map bounds (invisible walls)
    this.addCollider(CITY.waterX - 2, CITY.waterX, -300, 300);      // water edge
    this.addCollider(max + 4, max + 6, -300, 300);
    this.addCollider(-300, 300, min - 6, min - 4);
    this.addCollider(-300, 300, max + 4, max + 6);

    // ---------- sidewalk slabs + blocks ----------
    const slabT = [];
    for (let i = 0; i < CITY.blocks; i++) for (let j = 0; j < CITY.blocks; j++) {
      slabT.push({ x: blockCenter(i), y: 0, z: blockCenter(j), sx: 48, sy: 0.14, sz: 48 });
      this.sidewalkLoops.push({ x0: blockCenter(i) - 22, x1: blockCenter(i) + 22, z0: blockCenter(j) - 22, z1: blockCenter(j) + 22 });
    }
    const slabGeo = new THREE.BoxGeometry(1, 1, 1);
    slabGeo.translate(0, 0.5, 0);
    this.unitBox = slabGeo;
    this.instanced(slabGeo, mat('#9599a2'), slabT, null, false);

    // ---------- road markings ----------
    const dashes = [], stripes = [];
    for (const r of ROADS) {
      for (let t = min + 6; t < max - 4; t += 8) {
        if (ROADS.some((c) => Math.abs(t - c) < 8)) continue; // skip intersections
        dashes.push({ x: r, y: 0.03, z: t + 2, sx: 0.34, sy: 0.05, sz: 3 });
        dashes.push({ x: t + 2, y: 0.03, z: r, sx: 3, sy: 0.05, sz: 0.34 });
      }
    }
    for (const rx of ROADS) for (const rz of ROADS) {
      for (let k = -2; k <= 2; k++) {
        stripes.push({ x: rx + k * 1.15, y: 0.03, z: rz + 7.4, sx: 0.7, sy: 0.05, sz: 2.6 });
        stripes.push({ x: rx + k * 1.15, y: 0.03, z: rz - 7.4, sx: 0.7, sy: 0.05, sz: 2.6 });
        stripes.push({ x: rx + 7.4, y: 0.03, z: rz + k * 1.15, sx: 2.6, sy: 0.05, sz: 0.7 });
        stripes.push({ x: rx - 7.4, y: 0.03, z: rz + k * 1.15, sx: 2.6, sy: 0.05, sz: 0.7 });
      }
    }
    this.instanced(this.unitBox, mat('#c9b23f'), dashes, null, false);
    this.instanced(this.unitBox, mat('#d8dae0'), stripes, null, false);

    // ---------- buildings ----------
    const winTex = windowTexture({ litChance: 0.5 });
    const brownMat = new THREE.MeshLambertMaterial({ color: '#fff', emissive: '#ffdf9e', emissiveMap: winTex, emissiveIntensity: 0 });
    const towerTex = windowTexture({ cols: 8, rows: 18, litChance: 0.6, color: '#cfe6ff' });
    const towerMat = new THREE.MeshLambertMaterial({ color: '#fff', emissive: '#bcd8ff', emissiveMap: towerTex, emissiveIntensity: 0 });
    this.nightMats.push(brownMat, towerMat);

    const towers = [], towerCols = [], browns = [], brownCols = [], wtT = [];
    const [pi, pj] = CITY.parkBlock;

    for (let i = 0; i < CITY.blocks; i++) for (let j = 0; j < CITY.blocks; j++) {
      if (i === pi && j === pj) continue;
      const cx = blockCenter(i), cz = blockCenter(j);
      const isBodega = BODEGA_BLOCKS.some(([a, b]) => a === i && b === j);
      const lots = [[-10, -10], [10, -10], [-10, 10], [10, 10]];
      for (const [dx, dz] of lots) {
        if (isBodega && dz === -10) continue; // south half reserved for the store
        const centerDist = Math.max(Math.abs(i - 2.5), Math.abs(j - 2.5));
        const isTower = Math.random() < (centerDist < 1.6 ? 0.72 : 0.22);
        const w = rand(13, 17.5), d = rand(13, 17.5);
        const h = isTower ? rand(26, 66) : rand(9, 17);
        const t = { x: cx + dx, z: cz + dz, sx: w, sy: h, sz: d };
        if (isTower) { towers.push(t); towerCols.push(pick(TOWER_COLORS)); }
        else {
          browns.push(t); brownCols.push(pick(BROWNSTONE_COLORS));
          if (Math.random() < 0.45) wtT.push({ x: t.x + rand(-3, 3), y: h, z: t.z + rand(-3, 3) });
        }
        this.addCollider(t.x - w / 2, t.x + w / 2, t.z - d / 2, t.z + d / 2, h);
      }
      if (isBodega) this.buildBodega(i, j, cx, cz);
    }
    this.instanced(this.unitBox, towerMat, towers, towerCols);
    this.instanced(this.unitBox, brownMat, browns, brownCols);

    // rooftop water towers
    const wtGeo = new THREE.CylinderGeometry(1.3, 1.5, 2.6, 8);
    wtGeo.translate(0, 1.3, 0);
    this.instanced(wtGeo, mat('#6e4a2f'), wtT);
    const wtTop = new THREE.ConeGeometry(1.5, 1, 8);
    this.instanced(wtTop, mat('#5c3d26'), wtT.map((t) => ({ ...t, y: t.y + 3.1 })));

    this.buildPark();
    this.buildProps();
    this.buildParkedCars();
    this.buildTurf();
    this.buildSkyline();
    this.buildDocks();
  }

  buildBodega(i, j, cx, cz) {
    const name = STORE_NAMES[this.bodegas.length % STORE_NAMES.length];
    const g = new THREE.Group();
    const bodyCol = pick(['#b8433f', '#3f8ab8', '#3fa85f', '#a83f9a']);
    const body = new THREE.Mesh(box(26, 5.5, 13), mat(bodyCol));
    body.position.set(cx, 2.75, cz - 13);
    body.castShadow = true;
    g.add(body);
    // dark doorway inset on the street side
    const door = new THREE.Mesh(box(3, 3.2, 0.4), mat('#14161d'));
    door.position.set(cx, 1.6, cz - 19.6);
    g.add(door);
    // glowing sign
    const signTex = textTexture(name, { w: 512, h: 96, fg: '#fff', bg: '#8f1f1f' });
    const sign = new THREE.Mesh(box(16, 2, 0.4), new THREE.MeshBasicMaterial({ map: signTex }));
    sign.position.set(cx, 6.4, cz - 19.4);
    g.add(sign);
    // cash register marker outside
    const reg = new THREE.Mesh(box(0.8, 0.8, 0.8), new THREE.MeshLambertMaterial({ color: '#ffd24a', emissive: '#ffd24a', emissiveIntensity: 0.6 }));
    const rx = cx + 4, rz = cz - 22.5;
    reg.position.set(rx, 1, rz);
    g.add(reg);
    this.root.add(g);
    this.addCollider(cx - 13, cx + 13, cz - 19.5, cz - 6.5, 5.5);
    this.bodegas.push({ id: `store-${i}-${j}`, name, x: rx, z: rz, marker: reg, cooldown: 0 });
    this.pigeonSpots.push({ x: cx - 6, z: cz - 23 });
  }

  buildPark() {
    const cx = blockCenter(CITY.parkBlock[0]), cz = blockCenter(CITY.parkBlock[1]);
    const grass = new THREE.Mesh(box(42, 0.2, 42), mat('#4f9e4f'));
    grass.position.set(cx, 0.08, cz);
    grass.receiveShadow = true;
    this.root.add(grass);
    const pathH = new THREE.Mesh(box(42, 0.1, 2.6), mat('#c9b48a'));
    pathH.position.set(cx, 0.2, cz);
    const pathV = new THREE.Mesh(box(2.6, 0.1, 42), mat('#c9b48a'));
    pathV.position.set(cx, 0.2, cz);
    this.root.add(pathH, pathV);
    const pond = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.12, 12), mat('#2a7fa8'));
    pond.position.set(cx + 10, 0.2, cz - 9);
    this.root.add(pond);

    const treeT = [];
    for (let k = 0; k < 12; k++) {
      const x = cx + rand(-18, 18), z = cz + rand(-18, 18);
      if (Math.abs(x - cx) < 3 || Math.abs(z - cz) < 3) continue;             // keep paths clear
      if (Math.hypot(x - (cx + 10), z - (cz - 9)) < 8) continue;              // keep pond clear
      treeT.push({ x, z, sy: rand(0.8, 1.3) });
      this.addCollider(x - 0.4, x + 0.4, z - 0.4, z + 0.4, 3);
    }
    this.parkTrees = treeT;
    this.plantTrees(treeT);

    // benches
    for (let k = 0; k < 4; k++) {
      const bench = new THREE.Mesh(box(2.4, 0.5, 0.7), mat('#7a5230'));
      const bx = cx + (k < 2 ? -4 : 4), bz = cz + (k % 2 ? -8 : 8);
      bench.position.set(bx, 0.45, bz);
      bench.castShadow = true;
      this.root.add(bench);
    }
    for (let k = 0; k < 4; k++) this.pigeonSpots.push({ x: cx + rand(-15, 15), z: cz + rand(-15, 15) });
  }

  plantTrees(transforms) {
    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.36, 2.2, 6);
    trunkGeo.translate(0, 1.1, 0);
    this.instanced(trunkGeo, mat('#6e4a2f'), transforms);
    const canGeo = new THREE.IcosahedronGeometry(2.1, 0);
    canGeo.translate(0, 3.6, 0);
    this.instanced(canGeo, mat('#3f8f3f'), transforms.map((t) => ({ ...t, ry: rand(Math.PI * 2) })),
      transforms.map(() => pick(['#3f8f3f', '#4fa347', '#357a35', '#5fae4f'])));
  }

  buildProps() {
    // street lamps at every intersection corner
    const lampPole = [], lampHead = [];
    for (const rx of ROADS) for (const rz of ROADS) {
      for (const [sx, sz] of [[1, 1], [-1, -1]]) {
        lampPole.push({ x: rx + 7.6 * sx, z: rz + 7.6 * sz });
        lampHead.push({ x: rx + 7.6 * sx - 0.8 * sx, y: 4.4, z: rz + 7.6 * sz });
      }
    }
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.11, 4.6, 5);
    poleGeo.translate(0, 2.3, 0);
    this.instanced(poleGeo, mat('#2c2f38'), lampPole, null, false);
    const headMat = new THREE.MeshLambertMaterial({ color: '#d8d29a', emissive: '#ffe9a0', emissiveIntensity: 0 });
    headMat.userData.nightMax = 1.6;
    this.nightMats.push(headMat);
    this.instanced(box(0.6, 0.22, 0.34), headMat, lampHead, null, false);

    // traffic lights (all synced, cosmetic)
    const tlPole = [], tlBox = [], dotR = [], dotY = [], dotG = [];
    for (const rx of ROADS) for (const rz of ROADS) {
      if ((rx + rz) % 120 !== 0) continue; // thin them out a bit
      tlPole.push({ x: rx + 7.2, z: rz - 7.2 });
      tlBox.push({ x: rx + 7.2, y: 3.6, z: rz - 7.2 });
      dotR.push({ x: rx + 7.2, y: 3.95, z: rz - 6.93 });
      dotY.push({ x: rx + 7.2, y: 3.6, z: rz - 6.93 });
      dotG.push({ x: rx + 7.2, y: 3.25, z: rz - 6.93 });
    }
    const tlPoleGeo = new THREE.CylinderGeometry(0.08, 0.1, 4.4, 5);
    tlPoleGeo.translate(0, 2.2, 0);
    this.instanced(tlPoleGeo, mat('#3a3d29'), tlPole, null, false);
    this.instanced(box(0.42, 1.15, 0.4), mat('#2a2d1f'), tlBox, null, false);
    this.tlMats = ['#ff4a3d', '#ffd24a', '#4aff5e'].map((c) => new THREE.MeshLambertMaterial({ color: '#222', emissive: c, emissiveIntensity: 0.1 }));
    const dotGeo = box(0.16, 0.16, 0.1);
    this.instanced(dotGeo, this.tlMats[0], dotR, null, false);
    this.instanced(dotGeo, this.tlMats[1], dotY, null, false);
    this.instanced(dotGeo, this.tlMats[2], dotG, null, false);

    // hydrants
    const hydT = [];
    for (let k = 0; k < 34; k++) {
      const loop = pick(this.sidewalkLoops);
      const side = randInt(0, 3);
      const t = rand(0.15, 0.85);
      const x = side < 2 ? (side ? loop.x1 : loop.x0) : loop.x0 + (loop.x1 - loop.x0) * t;
      const z = side < 2 ? loop.z0 + (loop.z1 - loop.z0) * t : (side === 2 ? loop.z0 : loop.z1);
      hydT.push({ x, z });
      this.addCollider(x - 0.3, x + 0.3, z - 0.3, z + 0.3, 1);
    }
    const hydGeo = new THREE.CylinderGeometry(0.22, 0.26, 0.9, 6);
    hydGeo.translate(0, 0.45, 0);
    this.instanced(hydGeo, mat('#c1272d'), hydT);

    // street trees
    const stT = [];
    for (const loop of this.sidewalkLoops) {
      if (Math.random() < 0.5) continue;
      const n = randInt(1, 3);
      for (let k = 0; k < n; k++) {
        const x = rand(loop.x0 + 4, loop.x1 - 4);
        const z = Math.random() < 0.5 ? loop.z0 : loop.z1;
        stT.push({ x, z, sy: rand(0.7, 1) });
        this.addCollider(x - 0.35, x + 0.35, z - 0.35, z + 0.35, 3);
      }
    }
    this.plantTrees(stT);

    // hot dog stands
    for (const [x, z] of STAND_SPOTS) {
      const g = new THREE.Group();
      const cart = new THREE.Mesh(box(1.7, 1.15, 0.95), mat('#c9463c'));
      cart.position.y = 0.75; cart.castShadow = true;
      const top = new THREE.Mesh(box(1.7, 0.12, 0.95), mat('#e8e3d8'));
      top.position.y = 1.38;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5), mat('#888'));
      pole.position.y = 2.1;
      const umb = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.6, 8), mat('#ffd24a'));
      umb.position.y = 2.9; umb.castShadow = true;
      g.add(cart, top, pole, umb);
      g.position.set(x, 0, z);
      this.root.add(g);
      this.addCollider(x - 0.95, x + 0.95, z - 0.6, z + 0.6, 1.5);
      this.pigeonSpots.push({ x: x + 2.5, z: z + 1.5 });
    }
  }

  buildParkedCars() {
    const bodyT = [], cabT = [], cols = [];
    for (let k = 0; k < 34; k++) {
      const vertical = Math.random() < 0.5;
      const road = pick(ROADS);
      const t = rand(CITY.min + 14, CITY.max - 14);
      if (ROADS.some((c) => Math.abs(t - c) < 10)) continue;
      const off = 4.7 * (Math.random() < 0.5 ? 1 : -1);
      const x = vertical ? road + off : t;
      const z = vertical ? t : road + off;
      const ry = vertical ? 0 : Math.PI / 2;
      const col = pick(CAR_COLORS);
      bodyT.push({ x, y: 0.28, z, ry, sx: 1.9, sy: 0.75, sz: 4.3 });
      cabT.push({ x, y: 1.0, z: z + (vertical ? -0.3 : 0), x2: 0, ry, sx: 1.7, sy: 0.62, sz: 2.2 });
      cols.push(col);
      const hw = vertical ? 1 : 2.2, hd = vertical ? 2.2 : 1;
      this.addCollider(x - hw, x + hw, z - hd, z + hd, 1.7);
      this.coverCars.push({ x, z });
    }
    const bodyGeo = new THREE.BoxGeometry(1, 1, 1); bodyGeo.translate(0, 0.5, 0);
    this.instanced(bodyGeo, new THREE.MeshLambertMaterial({ color: '#fff' }), bodyT, cols);
    this.instanced(bodyGeo, new THREE.MeshLambertMaterial({ color: '#fff' }), cabT, cols.map((c) => (c === '#f2c522' ? '#e8e3d8' : '#1d2026')));
  }

  buildTurf() {
    for (let k = 0; k < TURF_CROSSES.length; k++) {
      const [a, b] = TURF_CROSSES[k];
      const x = ROADS[a] + 8.5, z = ROADS[b] + 8.5;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 8, 6), mat('#8a8d94'));
      pole.position.set(x, 4, z);
      pole.castShadow = true;
      const flag = new THREE.Mesh(box(2.2, 1.3, 0.08), mat('#666a72'));
      flag.position.set(x + 1.15, 2.2, z);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.5, 0.08, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#ffd24a', transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
      ring.position.set(x, 0.5, z);
      this.root.add(pole, flag, ring);
      this.turfSpots.push({ id: `turf-${k}`, x, z, flag, ring, owned: false, progress: 0 });
    }
  }

  buildSkyline() {
    const t = [], cols = [];
    for (let k = 0; k < 60; k++) {
      const ang = rand(Math.PI * 2);
      const r = rand(480, 720);
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      if (x < CITY.waterX - 40 && Math.abs(x) < 420) continue; // leave the harbor open-ish
      t.push({ x, z, sx: rand(26, 60), sy: rand(50, 170), sz: rand(26, 60) });
      cols.push(pick(['#26344f', '#2c3a56', '#1f2b42']));
    }
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#fff' }), t.length);
    const m4 = new THREE.Matrix4();
    t.forEach((tt, i) => {
      m4.makeScale(tt.sx, tt.sy, tt.sz);
      m4.setPosition(tt.x, 0, tt.z);
      im.setMatrixAt(i, m4);
      im.setColorAt(i, new THREE.Color(cols[i]));
    });
    this.root.add(im);
  }

  buildDocks() {
    // bollards + shipping containers along the dock strip for cover/flavor
    const bolT = [];
    for (let z = -180; z <= 180; z += 24) bolT.push({ x: CITY.waterX + 2.5, z });
    const bolGeo = new THREE.CylinderGeometry(0.3, 0.34, 1, 6);
    bolGeo.translate(0, 0.5, 0);
    this.instanced(bolGeo, mat('#2c2f38'), bolT);

    const contT = [], contC = [];
    const spots = [[-238, 70], [-232, 84], [-238, 77.5, 2.6], [-226, -80], [-238, -110], [-231, -96], [-240, 150], [-228, 130]];
    for (const [x, z, y] of spots) {
      contT.push({ x, y: y ?? 0, z, sx: 6.2, sy: 2.6, sz: 2.6, ry: Math.random() < 0.5 ? 0 : Math.PI / 2 });
      contC.push(pick(['#b3543f', '#3f6fb3', '#3fb36b', '#b39f3f', '#7a4fb3']));
      if (!y) this.addCollider(x - 3.1, x + 3.1, z - 3.1, z + 3.1, 2.6);
    }
    const contGeo = new THREE.BoxGeometry(1, 1, 1); contGeo.translate(0, 0.5, 0);
    this.instanced(contGeo, new THREE.MeshLambertMaterial({ color: '#fff' }), contT, contC);

    for (let k = 0; k < 3; k++) this.pigeonSpots.push({ x: rand(-244, -212), z: rand(-170, 170) });
  }

  randomSidewalkPoint() {
    const loop = pick(this.sidewalkLoops);
    const side = randInt(0, 3);
    const t = rand(0, 1);
    if (side === 0) return { x: loop.x0, z: loop.z0 + (loop.z1 - loop.z0) * t };
    if (side === 1) return { x: loop.x1, z: loop.z0 + (loop.z1 - loop.z0) * t };
    if (side === 2) return { x: loop.x0 + (loop.x1 - loop.x0) * t, z: loop.z0 };
    return { x: loop.x0 + (loop.x1 - loop.x0) * t, z: loop.z1 };
  }

  update(dt) {
    // synced traffic-light cycle
    this.lightPhase = (this.lightPhase + dt) % 11;
    const g = this.lightPhase < 5, y = this.lightPhase >= 5 && this.lightPhase < 6.5;
    this.tlMats[0].emissiveIntensity = !g && !y ? 1 : 0.08;
    this.tlMats[1].emissiveIntensity = y ? 1 : 0.08;
    this.tlMats[2].emissiveIntensity = g ? 1 : 0.08;
  }
}

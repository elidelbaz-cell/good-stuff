/* CUTLASS: MANHUNT — freeroam pixel survival mode. Three.js r147.
   Endless procedural wilds, mining, crafting, building, a flying sword
   companion, and hunters. Exposed as window.__SURVIVAL(). */
window.__SURVIVAL = () => {
'use strict';

// ============================== CONSTANTS ==================================
const STEP = 1 / 60;
const GRAV = -30, FALL_MAX = -36;
const SPEED = 8.5, ACC_GROUND = 12, ACC_AIR = 4.5;
const JUMP_V = 11.6, AIRJUMP_V = 10.6, MAX_AIR_JUMPS = 2;
const COYOTE = 0.12, JUMP_BUF = 0.14, WALLJUMP_V = 10.8, WALLPUSH = 7.5;
const GRAPPLE_PULL = 34, GRAPPLE_REEL = 11, GRAPPLE_MIN = 2.6;
const SWING_DUR = 0.42, SWING_ACTIVE_A = 0.10, SWING_ACTIVE_B = 0.30, ATK_CD = 0.62;
const HIT_RANGE = 3.3, HIT_ARC = 1.15;
const CELL = 2, CH = 16, CHUNK_W = CELL * CH;            // 32u chunks
const WATER_Y = 0.45, DAYLEN = 160;
const MINE_RANGE = 5.2, PLACE_RANGE = 6.5, STEP_UP = 1.06;
const TIER_DMG = [34, 48, 62, 80];
const SAVE_KEY = 'cutlass.manhunt.v1';

const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
if (IS_TOUCH) document.body.classList.add('touch');
const VIEW_R = IS_TOUCH ? 2 : 3;                          // chunk radius

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const fmt = (t) => { t = Math.max(0, Math.floor(t)); return `${(t / 60) | 0}:${t % 60 < 10 ? '0' : ''}${t % 60}`; };

// ============================== AUDIO ======================================
let AC = null;
function ac() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } return AC; }
function tone(f0, f1, dur, type, vol) {
  const c = ac(); if (!c || c.state === 'suspended') return;
  const o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur);
}
function noise(dur, vol, freq) {
  const c = ac(); if (!c || c.state === 'suspended') return;
  const n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = c.createBufferSource(); s.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq;
  const g = c.createGain(); g.gain.value = vol;
  s.connect(f).connect(g).connect(c.destination); s.start();
}
const sfx = {
  jump()   { tone(280, 620, 0.14, 'square', 0.08); },
  airjump(){ tone(380, 760, 0.13, 'square', 0.08); },
  swing()  { noise(0.16, 0.3, 2400); },
  hit()    { tone(200, 60, 0.16, 'sawtooth', 0.16); noise(0.1, 0.25, 900); },
  hurt()   { tone(160, 50, 0.25, 'sawtooth', 0.14); },
  ko()     { tone(300, 30, 0.5, 'sawtooth', 0.2); noise(0.35, 0.3, 500); },
  grap()   { tone(700, 1400, 0.1, 'square', 0.07); },
  land()   { noise(0.08, 0.15, 500); },
  chop()   { noise(0.12, 0.3, 1400); tone(150, 90, 0.08, 'square', 0.08); },
  mine()   { tone(900, 500, 0.06, 'square', 0.1); noise(0.08, 0.2, 2600); },
  breakB() { noise(0.2, 0.35, 800); },
  place()  { tone(220, 320, 0.1, 'square', 0.1); },
  pickup() { tone(600, 1200, 0.12, 'square', 0.09); },
  craft()  { tone(440, 880, 0.18, 'square', 0.1); setTimeout(() => tone(660, 1100, 0.15, 'square', 0.08), 90); },
  horn()   { tone(160, 110, 0.7, 'sawtooth', 0.16); setTimeout(() => tone(140, 95, 0.8, 'sawtooth', 0.14), 250); },
  blip()   { tone(500, 700, 0.05, 'square', 0.05); },
  night()  { tone(300, 120, 1.2, 'sine', 0.1); },
};
window.addEventListener('pointerdown', () => { const c = ac(); if (c && c.state === 'suspended') c.resume(); }, { passive: true });

// ============================== RENDERER ===================================
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const scene = new THREE.Scene();
const SKY_DAY = new THREE.Color(0x77c4f2), SKY_DUSK = new THREE.Color(0xe8945a), SKY_NIGHT = new THREE.Color(0x111a36);
scene.background = SKY_DAY.clone();
scene.fog = new THREE.Fog(0x77c4f2, IS_TOUCH ? 45 : 60, IS_TOUCH ? 82 : 105);
const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 300);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const pix = Math.max(2, Math.round(w / 440));
  renderer.setSize(Math.floor(w / pix), Math.floor(h / pix), false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();

const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5a4a36, 0.8);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2cf, 0.7);
sun.position.set(40, 70, 25); scene.add(sun);

// ============================== TEXTURES ===================================
function pixTex(px, fn) {
  const cv = document.createElement('canvas'); cv.width = cv.height = px;
  const g = cv.getContext('2d'); fn(g, px);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function speckle(g, px, base, specks, n) {
  g.fillStyle = base; g.fillRect(0, 0, px, px);
  for (let i = 0; i < n; i++) {
    g.fillStyle = specks[(Math.random() * specks.length) | 0];
    g.fillRect((Math.random() * px) | 0, (Math.random() * px) | 0, 1, 1);
  }
}
const TEX = {
  gray:  pixTex(16, (g, p) => speckle(g, p, '#c9c9c9', ['#bdbdbd', '#d6d6d6', '#b3b3b3', '#e0e0e0'], 90)),
  wood:  pixTex(16, (g, p) => {
    speckle(g, p, '#9c6b3a', ['#a9773f', '#8a5c30', '#b0803f'], 40);
    g.fillStyle = '#6f4a24'; for (let y = 3; y < p; y += 4) g.fillRect(0, y, p, 1);
  }),
  stone: pixTex(16, (g, p) => speckle(g, p, '#8b8f99', ['#9ba0ac', '#767a85', '#a6abb8', '#696d78'], 80)),
  leaf:  pixTex(16, (g, p) => speckle(g, p, '#3d8f36', ['#4caf3f', '#2f7a2a', '#57c24b', '#367f2e'], 110)),
  bush:  pixTex(16, (g, p) => { speckle(g, p, '#3d8f36', ['#4caf3f', '#2f7a2a'], 60);
    g.fillStyle = '#e03131'; for (let i = 0; i < 7; i++) g.fillRect((Math.random() * p) | 0, (Math.random() * p) | 0, 2, 2); }),
  ore:   pixTex(16, (g, p) => { speckle(g, p, '#6e727d', ['#7d818c', '#5f636d'], 60);
    g.fillStyle = '#dfe4ee'; for (let i = 0; i < 6; i++) g.fillRect((Math.random() * p) | 0, (Math.random() * p) | 0, 2, 2); }),
  water: pixTex(32, (g, p) => speckle(g, p, '#2f6fba', ['#3f82d1', '#2a62a6', '#4f95e0', '#77b7ef'], 220)),
};
TEX.water.repeat.set(40, 40);
const flat = (c) => new THREE.MeshLambertMaterial({ color: c });
const MAT = {
  terrTop:  new THREE.MeshLambertMaterial({ map: TEX.gray }),      // tinted per-instance
  terrBody: new THREE.MeshLambertMaterial({ map: TEX.gray }),
  trunk:    new THREE.MeshLambertMaterial({ map: TEX.wood }),
  leaf:     new THREE.MeshLambertMaterial({ map: TEX.leaf }),
  rock:     new THREE.MeshLambertMaterial({ map: TEX.stone }),
  ore:      new THREE.MeshLambertMaterial({ map: TEX.ore }),
  bush:     new THREE.MeshLambertMaterial({ map: TEX.bush }),
  blockWood:  new THREE.MeshLambertMaterial({ map: TEX.wood }),
  blockStone: new THREE.MeshLambertMaterial({ map: TEX.stone }),
};
const C_GRASS = new THREE.Color(0x4caf3f), C_FOREST = new THREE.Color(0x3d9432),
      C_ROCK = new THREE.Color(0x8b8f99), C_SNOW = new THREE.Color(0xe8eef7),
      C_SAND = new THREE.Color(0xd8c27a), C_DIRT = new THREE.Color(0x7a5230),
      C_STONE_U = new THREE.Color(0x777b86);

// ============================== WORLD GEN ==================================
let seed = 1234;
function h2(ix, iz) {
  let n = (ix * 374761393 + iz * 668265263 + seed * 971) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function n01(x, z, s, o) {
  const gx = x / s + o * 37.7, gz = z / s + o * 61.3;
  const x0 = Math.floor(gx), z0 = Math.floor(gz);
  let fx = gx - x0, fz = gz - z0;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = h2(x0, z0), b = h2(x0 + 1, z0), c = h2(x0, z0 + 1), d = h2(x0 + 1, z0 + 1);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
}
// diffs — everything the player changed; persisted
let diffs = { dh: {}, rm: {}, pb: {} };
const cellKey = (cx, cz) => cx + ',' + cz;

function cellGen(cx, cz) {
  const base = n01(cx, cz, 22, 1), hills = n01(cx, cz, 7, 2),
        ridge = n01(cx, cz, 13, 3), moist = n01(cx, cz, 19, 4), lakeN = n01(cx, cz, 16, 5);
  let h = 1 + base * 6 + hills * hills * 7 * (0.35 + ridge);
  if (lakeN < 0.22) h -= (0.22 - lakeN) * 40;
  const r = Math.hypot(cx, cz);
  if (r < 14) h = lerp(3.2, Math.max(h, 1.2), clamp(r / 14, 0, 1) ** 1.5);
  h = Math.round(clamp(h, -4, 18));

  let biome; // 0 meadow 1 forest 2 rocky 3 snow 4 sand
  if (h <= 1) biome = 4;
  else if (h >= 12) biome = 3;
  else if (moist < 0.33) biome = 2;
  else if (moist > 0.58) biome = 1;
  else biome = 0;

  let obj = 0; // 1 tree 2 rock 3 ore 4 bush
  if (h >= 1 && r > 4) {
    const oh = h2(cx * 3 + 7, cz * 3 - 5);
    if (biome === 1 && oh < 0.15) obj = 1;
    else if (biome === 0) { if (oh < 0.035) obj = 1; else if (oh < 0.07) obj = 4; }
    else if (biome === 2) { if (oh < 0.045) obj = 2; else if (oh < 0.075) obj = 3; }
    else if (biome === 3 && oh < 0.05) obj = 1;
  }
  return { h, biome, obj };
}
function cellH(cx, cz) {
  const ch = chunks.get(chunkKeyOf(cx, cz));
  let h;
  if (ch) h = ch.hs[(cz - ch.cz0) * CH + (cx - ch.cx0)];
  else h = cellGen(cx, cz).h + (diffs.dh[cellKey(cx, cz)] || 0);
  return h;
}
const groundH = (x, z) => cellH(Math.floor(x / CELL), Math.floor(z / CELL));

// ============================== CHUNKS =====================================
const chunks = new Map();
const chunkKeyOf = (cx, cz) => Math.floor(cx / CH) + ',' + Math.floor(cz / CH);
const geoTop = new THREE.BoxGeometry(CELL, 0.6, CELL);
const geoBody = new THREE.BoxGeometry(CELL, 1, CELL);
const geoTrunk = new THREE.BoxGeometry(0.9, 3.6, 0.9);
const geoLeaf = new THREE.BoxGeometry(3.4, 3.0, 3.4);
const geoRock = new THREE.BoxGeometry(1.6, 1.1, 1.6);
const geoBush = new THREE.BoxGeometry(1.5, 1.0, 1.5);
const geoBlock = new THREE.BoxGeometry(1, 1, 1);
const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color();

function buildChunk(kcx, kcz) {
  const key = kcx + ',' + kcz;
  if (chunks.has(key)) return chunks.get(key);
  const cx0 = kcx * CH, cz0 = kcz * CH;
  const ch = { key, cx0, cz0, hs: new Int8Array(CH * CH), objs: [], solids: [], rays: [], meshes: [], blocks: [] };
  // r147 InstancedMesh culls by base-geometry bounds; give each mesh a
  // sphere that actually covers its chunk or whole chunks vanish/linger
  const chunkSphere = () => new THREE.Sphere(V3(cx0 * CELL + CHUNK_W / 2, 8, cz0 * CELL + CHUNK_W / 2), 42);

  // heights first (with mining diffs)
  const cells = [];
  for (let z = 0; z < CH; z++) for (let x = 0; x < CH; x++) {
    const cx = cx0 + x, cz = cz0 + z;
    const g = cellGen(cx, cz);
    g.h += (diffs.dh[cellKey(cx, cz)] || 0);
    ch.hs[z * CH + x] = g.h;
    cells.push(g);
  }
  // terrain instanced meshes
  const tops = new THREE.InstancedMesh(geoTop.clone(), MAT.terrTop, CH * CH);
  const bodies = new THREE.InstancedMesh(geoBody.clone(), MAT.terrBody, CH * CH);
  ch.cellIdx = [];
  for (let z = 0; z < CH; z++) for (let x = 0; x < CH; x++) {
    const i = z * CH + x, g = cells[i], cx = cx0 + x, cz = cz0 + z;
    const wx = cx * CELL + CELL / 2, wz = cz * CELL + CELL / 2, h = g.h;
    const shade = 0.88 + 0.24 * h2(cx * 7 + 1, cz * 7 + 3);
    const topC = [C_GRASS, C_FOREST, C_ROCK, C_SNOW, C_SAND][g.biome];
    tmpM.makeTranslation(wx, h - 0.3, wz);
    tops.setMatrixAt(i, tmpM);
    tops.setColorAt(i, tmpC.copy(topC).multiplyScalar(shade));
    // body extends to just below the lowest neighbour
    let minN = h;
    minN = Math.min(minN, cellH(cx + 1, cz), cellH(cx - 1, cz), cellH(cx, cz + 1), cellH(cx, cz - 1));
    const depth = Math.max(1, h - minN + 2);
    tmpM.makeScale(1, depth, 1); tmpM.setPosition(wx, h - 0.6 - depth / 2, wz);
    bodies.setMatrixAt(i, tmpM);
    const underC = g.biome === 2 || g.biome === 3 ? C_STONE_U : C_DIRT;
    bodies.setColorAt(i, tmpC.copy(underC).multiplyScalar(shade));
    ch.cellIdx.push({ cx, cz });
  }
  tops.instanceMatrix.needsUpdate = true; bodies.instanceMatrix.needsUpdate = true;
  if (tops.instanceColor) tops.instanceColor.needsUpdate = true;
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  tops.geometry.boundingSphere = chunkSphere();
  bodies.geometry.boundingSphere = chunkSphere();
  tops.userData = { kind: 'terr', ch }; bodies.userData = { kind: 'terr', ch };
  scene.add(tops, bodies);
  ch.meshes.push(tops, bodies); ch.rays.push(tops, bodies);

  // objects
  const objList = [];
  for (let z = 0; z < CH; z++) for (let x = 0; x < CH; x++) {
    const i = z * CH + x, g = cells[i];
    if (!g.obj) continue;
    const cx = cx0 + x, cz = cz0 + z;
    if (diffs.rm[cellKey(cx, cz)]) continue;
    objList.push({ type: g.obj, cx, cz, x: cx * CELL + CELL / 2, z: cz * CELL + CELL / 2, y: g.h });
  }
  const byType = { 1: [], 2: [], 3: [], 4: [] };
  for (const o of objList) byType[o.type].push(o);
  ch.objs = objList;
  function instFor(list, geo, mat, place, kind) {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo.clone(), mat, list.length);
    list.forEach((o, i) => { place(o, i, im); });
    im.instanceMatrix.needsUpdate = true;
    im.geometry.boundingSphere = chunkSphere();
    im.userData = { kind, list, ch };
    scene.add(im); ch.meshes.push(im); ch.rays.push(im);
    return im;
  }
  instFor(byType[1], geoTrunk, MAT.trunk, (o, i, im) => {
    tmpM.makeTranslation(o.x, o.y + 1.8, o.z); im.setMatrixAt(i, tmpM);
    ch.solids.push({ min: V3(o.x - 0.45, o.y, o.z - 0.45), max: V3(o.x + 0.45, o.y + 3.6, o.z + 0.45) });
  }, 'tree');
  instFor(byType[1], geoLeaf, MAT.leaf, (o, i, im) => {
    tmpM.makeTranslation(o.x, o.y + 4.6, o.z); im.setMatrixAt(i, tmpM);
  }, 'tree');
  instFor(byType[2], geoRock, MAT.rock, (o, i, im) => {
    tmpM.makeTranslation(o.x, o.y + 0.55, o.z); im.setMatrixAt(i, tmpM);
    ch.solids.push({ min: V3(o.x - 0.8, o.y, o.z - 0.8), max: V3(o.x + 0.8, o.y + 1.1, o.z + 0.8) });
  }, 'rock');
  instFor(byType[3], geoRock, MAT.ore, (o, i, im) => {
    tmpM.makeTranslation(o.x, o.y + 0.55, o.z); im.setMatrixAt(i, tmpM);
    ch.solids.push({ min: V3(o.x - 0.8, o.y, o.z - 0.8), max: V3(o.x + 0.8, o.y + 1.1, o.z + 0.8) });
  }, 'ore');
  instFor(byType[4], geoBush, MAT.bush, (o, i, im) => {
    tmpM.makeTranslation(o.x, o.y + 0.5, o.z); im.setMatrixAt(i, tmpM);
  }, 'bush');

  // placed blocks belonging to this chunk
  for (const bk in diffs.pb) {
    const [bx, by, bz] = bk.split(',').map(Number);
    if (Math.floor(Math.floor(bx / CELL) / CH) !== kcx || Math.floor(Math.floor(bz / CELL) / CH) !== kcz) continue;
    addBlockMesh(ch, bx, by, bz, diffs.pb[bk]);
  }

  chunks.set(key, ch);
  return ch;
}
function addBlockMesh(ch, bx, by, bz, type) {
  const m = new THREE.Mesh(geoBlock, type === 1 ? MAT.blockWood : MAT.blockStone);
  m.position.set(bx + 0.5, by + 0.5, bz + 0.5);
  m.userData = { kind: 'block', bx, by, bz, type };
  scene.add(m);
  const solid = { min: V3(bx, by, bz), max: V3(bx + 1, by + 1, bz + 1), block: m };
  ch.solids.push(solid); ch.rays.push(m); ch.blocks.push(m);
}
function disposeChunk(ch) {
  for (const m of ch.meshes) { scene.remove(m); if (m.geometry !== geoBlock) m.geometry.dispose(); }
  for (const b of ch.blocks) scene.remove(b);
  chunks.delete(ch.key);
}
function rebuildChunk(kcx, kcz) {
  const ch = chunks.get(kcx + ',' + kcz);
  if (ch) disposeChunk(ch);
  buildChunk(kcx, kcz);
}
function rebuildAround(cx, cz) {
  const kx = Math.floor(cx / CH), kz = Math.floor(cz / CH);
  rebuildChunk(kx, kz);
  const lx = ((cx % CH) + CH) % CH, lz = ((cz % CH) + CH) % CH;
  if (lx === 0) rebuildChunk(kx - 1, kz); if (lx === CH - 1) rebuildChunk(kx + 1, kz);
  if (lz === 0) rebuildChunk(kx, kz - 1); if (lz === CH - 1) rebuildChunk(kx, kz + 1);
}
// streaming
const genQueue = [];
function streamChunks() {
  const pcx = Math.floor(player.pos.x / CHUNK_W), pcz = Math.floor(player.pos.z / CHUNK_W);
  genQueue.length = 0;
  for (let dz = -VIEW_R; dz <= VIEW_R; dz++) for (let dx = -VIEW_R; dx <= VIEW_R; dx++) {
    const k = (pcx + dx) + ',' + (pcz + dz);
    if (!chunks.has(k)) genQueue.push({ kx: pcx + dx, kz: pcz + dz, d: dx * dx + dz * dz });
  }
  genQueue.sort((a, b) => a.d - b.d);
  if (genQueue.length) buildChunk(genQueue[0].kx, genQueue[0].kz);
  // unload far chunks
  for (const ch of chunks.values()) {
    const kx = Math.floor(ch.cx0 / CH), kz = Math.floor(ch.cz0 / CH);
    if (Math.max(Math.abs(kx - pcx), Math.abs(kz - pcz)) > VIEW_R + 2) { disposeChunk(ch); break; }
  }
}
function nearbySolids(pos) {
  const out = [];
  const kx = Math.floor(pos.x / CHUNK_W), kz = Math.floor(pos.z / CHUNK_W);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const ch = chunks.get((kx + dx) + ',' + (kz + dz));
    if (ch) out.push(...ch.solids);
  }
  return out;
}
function nearbyRays() {
  const out = [];
  const kx = Math.floor(player.pos.x / CHUNK_W), kz = Math.floor(player.pos.z / CHUNK_W);
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
    const ch = chunks.get((kx + dx) + ',' + (kz + dz));
    if (ch) out.push(...ch.rays);
  }
  return out;
}

// water follows the player
const water = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshBasicMaterial({ map: TEX.water, transparent: true, opacity: 0.88 }));
water.rotation.x = -Math.PI / 2; water.position.y = WATER_Y;
scene.add(water);
// clouds
const clouds = [];
for (let i = 0; i < 8; i++) {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.85 });
  for (let j = 0; j < 3; j++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(rand(4, 9), 1.6, rand(3, 5)), m);
    b.position.set(rand(-4, 4), rand(-0.5, 0.5), rand(-2, 2)); g.add(b);
  }
  g.position.set(rand(-90, 90), rand(26, 44), rand(-90, 90));
  scene.add(g); clouds.push(g);
}

// ============================== CHARACTERS =================================
function buildPirate(opt) {
  const g = new THREE.Group();
  const skin = flat(opt.skin), shirt = flat(opt.shirt), pants = flat(opt.pants || 0x3a3f52),
        band = flat(opt.bandana), dark = flat(0x14161f);
  const parts = {};
  const box = (w, h, d, m, x, y, z, ty) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    if (ty !== undefined) geo.translate(0, ty, 0);
    const msh = new THREE.Mesh(geo, m); msh.position.set(x, y, z); return msh;
  };
  parts.legL = box(0.2, 0.7, 0.24, pants, -0.13, 0.7, 0, -0.35);
  parts.legR = box(0.2, 0.7, 0.24, pants, 0.13, 0.7, 0, -0.35);
  parts.body = box(0.56, 0.6, 0.32, shirt, 0, 1.0, 0);
  g.add(box(0.58, 0.14, 0.34, dark, 0, 0.76, 0));
  parts.armL = box(0.17, 0.6, 0.22, shirt, -0.37, 1.26, 0, -0.26);
  parts.armR = box(0.17, 0.6, 0.22, shirt, 0.37, 1.26, 0, -0.26);
  parts.armL.add(box(0.15, 0.14, 0.19, skin, 0, -0.5, 0));
  parts.armR.add(box(0.15, 0.14, 0.19, skin, 0, -0.5, 0));
  parts.head = box(0.46, 0.44, 0.46, skin, 0, 1.53, 0);
  parts.head.add(box(0.5, 0.16, 0.5, band, 0, 0.19, 0));
  parts.head.add(box(0.12, 0.16, 0.08, band, 0.2, 0.16, -0.26));
  const eyeM = opt.redEyes ? new THREE.MeshBasicMaterial({ color: 0xff2b2b }) : dark;
  parts.head.add(box(0.08, 0.08, 0.04, eyeM, -0.11, 0.02, 0.235));
  if (opt.patch) {
    parts.head.add(box(0.14, 0.14, 0.04, dark, 0.11, 0.02, 0.235));
    parts.head.add(box(0.5, 0.05, 0.5, dark, 0, 0.09, 0));
  } else parts.head.add(box(0.08, 0.08, 0.04, eyeM, 0.11, 0.02, 0.235));
  if (opt.holdSword) {
    const cut = new THREE.Group();
    cut.add(box(0.07, 0.2, 0.07, flat(0x5d3c20), 0, 0.02, 0));
    cut.add(box(0.2, 0.05, 0.16, flat(0xf2c14e), 0, -0.1, 0));
    const bladeM = flat(0xdfe6f0);
    cut.add(box(0.05, 0.66, 0.17, bladeM, 0, -0.45, 0.01));
    const tip = box(0.05, 0.24, 0.15, bladeM, 0, -0.82, 0.06); tip.rotation.x = 0.5; cut.add(tip);
    cut.position.set(0, -0.55, 0.05);
    parts.armR.add(cut);
  }
  for (const k in parts) g.add(parts[k]);
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; scene.add(sh);
  scene.add(g);
  return { group: g, parts, shadow: sh, mats: [skin, shirt, band] };
}
function makeTag(name, color) {
  const cv = document.createElement('canvas'); cv.width = 96; cv.height = 28;
  const g = cv.getContext('2d');
  const t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true }));
  sp.scale.set(2.1, 0.62, 1); scene.add(sp);
  return {
    sprite: sp,
    draw(hp) {
      g.clearRect(0, 0, 96, 28);
      g.font = 'bold 13px monospace'; g.textAlign = 'center';
      g.fillStyle = '#000'; g.fillText(name, 49, 13); g.fillStyle = color; g.fillText(name, 48, 12);
      g.fillStyle = '#000'; g.fillRect(17, 17, 62, 8);
      g.fillStyle = hp < 35 ? '#e03131' : '#40d444';
      g.fillRect(18, 18, Math.max(0, 60 * hp / 100), 6);
      t.needsUpdate = true;
    }
  };
}
function makeRope() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x2b2118 }));
  line.frustumCulled = false; line.visible = false;
  const hook = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), flat(0x8a8f99));
  hook.visible = false;
  scene.add(line, hook);
  return { line, hook };
}

// ============================== CUTTY (sword companion) ====================
const cutty = (() => {
  const g = new THREE.Group();
  const bladeM = flat(0xdfe6f0);
  const box = (w, h, d, m, x, y, z) => { const msh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); msh.position.set(x, y, z); g.add(msh); return msh; };
  box(0.1, 0.3, 0.1, flat(0x5d3c20), 0, 0.62, 0);                    // grip
  box(0.3, 0.08, 0.24, flat(0xf2c14e), 0, 0.44, 0);                  // guard
  box(0.08, 1.0, 0.26, bladeM, 0, -0.08, 0.01);                      // blade
  const tip = box(0.08, 0.34, 0.22, bladeM, 0, -0.66, 0.08); tip.rotation.x = 0.5;
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x14161f });
  box(0.1, 0.09, 0.06, eyeM, -0.001, 0.1, 0.15);                     // eyes on the flat
  box(0.1, 0.09, 0.06, eyeM, -0.001, -0.14, 0.15);
  scene.add(g);
  return { group: g, bladeM, bob: 0 };
})();

// speech
const msgQ = [];
let msgT = 0;
const elMsgBox = document.getElementById('s_msgbox'), elMsgTxt = document.getElementById('s_msgtxt');
function say(txt, priority) {
  if (priority) msgQ.length = 0;
  if (msgQ.length > 3) return;
  msgQ.push(txt);
}
function tickSay(dt) {
  if (msgT > 0) { msgT -= dt; if (msgT <= 0) elMsgBox.style.display = 'none'; return; }
  if (msgQ.length) {
    elMsgTxt.textContent = msgQ.shift();
    elMsgBox.style.display = 'block';
    msgT = 4.2; sfx.blip();
  }
}
const dirName = (dx, dz) => Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'EAST' : 'WEST') : (dz > 0 ? 'SOUTH' : 'NORTH');

// ============================== SAVE / LOAD ================================
let best = 0, runT = 0, flags = {};
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 1, seed, best, runT, flags, diffs,
      player: {
        x: player.pos.x, y: player.pos.y, z: player.pos.z, hp: player.hp,
        inv, tier, ropeUp, armor,
      },
    }));
  } catch (e) {}
}
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && s.v === 1) return s;
  } catch (e) {}
  return null;
}
function wipeSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

// ============================== ENTITIES ===================================
function baseEntity() {
  return {
    pos: V3(0, 10, 0), vel: V3(0, 0, 0), yaw: 0, hw: 0.42, hh: 0.9,
    hp: 100, dead: false, invuln: 0,
    onGround: false, coyote: 0, jumpsLeft: MAX_AIR_JUMPS, jumpBuf: 0,
    wallT: 0, wallN: V3(0, 0, 0), landV: 0, squash: 0, inWater: false,
    mx: 0, mz: 0,
    swingT: -1, atkCd: 0, swingVictims: new Set(), didMine: false,
    hitstun: 0, flashT: 0, regenT: 0,
    grapOn: false, grapP: V3(0, 0, 0), grapLen: 0, grapT: 0,
  };
}
const player = Object.assign(baseEntity(), { isPlayer: true });
player.vis = buildPirate({ skin: 0xe8b88a, shirt: 0xf2f2f2, bandana: 0xd8322e });
player.rope = makeRope();
let inv = { wood: 0, stone: 0, iron: 0, berry: 0 };
let tier = 0, ropeUp = 0, armor = false;
const grappleRange = () => 40 + ropeUp * 12;

const hunters = [];
function spawnHunter() {
  const a = rand(0, Math.PI * 2), d = rand(46, 60);
  const x = player.pos.x + Math.sin(a) * d, z = player.pos.z + Math.cos(a) * d;
  const h = Object.assign(baseEntity(), {
    isPlayer: false,
    ai: { thinkT: 0, strafe: Math.random() < 0.5 ? 1 : -1, stuckT: 0, grapCd: rand(4, 8), atkDelay: 0 },
  });
  h.pos.set(x, groundH(x, z) + 2, z);
  h.vis = buildPirate({ skin: 0xb9a08c, shirt: 0x2a2f3d, bandana: 0x6e1f18, pants: 0x1d2029, patch: true, redEyes: true, holdSword: true });
  h.rope = makeRope();
  h.tag = makeTag('HUNTER', '#ff6b6b'); h.tag.draw(100);
  hunters.push(h);
  sfx.horn();
  const dx = x - player.pos.x, dz = z - player.pos.z;
  say(`⚠ A hunter prowls to the ${dirName(dx, dz)}! ${Math.round(Math.hypot(dx, dz))}m off. Steel yerself!`, true);
  return h;
}
function killHunter(h, silent) {
  h.dead = true;
  scene.remove(h.vis.group); scene.remove(h.vis.shadow);
  scene.remove(h.tag.sprite); scene.remove(h.rope.line); scene.remove(h.rope.hook);
  hunters.splice(hunters.indexOf(h), 1);
  if (!silent) {
    burst(V3(h.pos.x, h.pos.y + 0.5, h.pos.z), 0xe03131, 16, 9, 1);
    sfx.ko();
    const drops = ['wood', 'stone', 'iron', 'berry'];
    for (let i = 0; i < 3; i++) spawnPickup(h.pos, drops[(Math.random() * drops.length) | 0], 1 + ((Math.random() * 2) | 0));
    say(['Ha! Sent that dog to the depths.', 'One less shadow on our trail.', 'They\'ll send more. They always do.'][(Math.random() * 3) | 0]);
  }
}

// ============================== PARTICLES ==================================
const parts = [];
const partGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
for (let i = 0; i < 130; i++) {
  const m = new THREE.Mesh(partGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  m.visible = false; scene.add(m);
  parts.push({ m, vel: V3(0, 0, 0), life: 0 });
}
let partIdx = 0;
function burst(pos, color, n, spd, up) {
  for (let i = 0; i < n; i++) {
    const p = parts[partIdx++ % parts.length];
    p.m.visible = true; p.m.position.copy(pos); p.m.material.color.setHex(color);
    p.vel.set(rand(-1, 1), rand(0, 1) + (up || 0.3), rand(-1, 1)).normalize().multiplyScalar(spd * rand(0.5, 1));
    p.life = rand(0.3, 0.7);
    const s = rand(0.6, 1.6); p.m.scale.set(s, s, s);
  }
}
function tickParts(dt) {
  for (const p of parts) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.m.visible = false; continue; }
    p.vel.y += GRAV * 0.4 * dt;
    p.m.position.addScaledVector(p.vel, dt);
  }
}

// ============================== PICKUPS ====================================
const PICK_COLOR = { wood: 0x9c6b3a, stone: 0x8b8f99, iron: 0xdfe4ee, berry: 0xe03131 };
const pickups = [];
function spawnPickup(pos, type, n) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), new THREE.MeshLambertMaterial({ color: PICK_COLOR[type] }));
  m.position.set(pos.x + rand(-0.8, 0.8), pos.y + 0.8, pos.z + rand(-0.8, 0.8));
  scene.add(m);
  pickups.push({ m, type, n, vy: rand(3, 6), t: rand(0, 9) });
}
function tickPickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.t += dt;
    const gy = groundH(p.m.position.x, p.m.position.z) + 0.3;
    p.vy += GRAV * 0.6 * dt;
    p.m.position.y += p.vy * dt;
    if (p.m.position.y < gy) { p.m.position.y = gy; p.vy = 0; }
    p.m.rotation.y += dt * 3;
    const d = p.m.position.distanceTo(player.pos);
    if (d < 3) {
      p.m.position.lerp(V3(player.pos.x, player.pos.y, player.pos.z), Math.min(1, 8 * dt));
      if (d < 0.9) {
        inv[p.type] += p.n; updRes(); sfx.pickup();
        scene.remove(p.m); pickups.splice(i, 1);
        if (!flags.gotWood && p.type === 'wood') { flags.gotWood = 1; say('Wood! Open CRAFT and I\'ll show ye what we can forge.'); }
        if (!flags.gotIron && p.type === 'iron') { flags.gotIron = 1; say('Iron! Now we\'re talkin\'. A sharper me awaits in CRAFT.'); }
      }
    }
  }
}

// ============================== INPUT ======================================
const keys = {};
let camYaw = 0.6, camPitch = 0.28, camDist = 7.6;
let wantGrapple = false, lookDX = 0, lookDY = 0;
let selSlot = 0, craftOpen = false;
const joy = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
const lookTouch = { id: -1, lx: 0, ly: 0 };
let state = 'MENU'; // MENU | PLAY | DEAD

window.addEventListener('keydown', ev => {
  if (ev.repeat) return;
  keys[ev.code] = true;
  if (ev.code === 'Space') { player.jumpBuf = JUMP_BUF; ev.preventDefault(); }
  if (ev.code === 'KeyE') wantGrapple = true;
  if (ev.code === 'KeyC' && state === 'PLAY') toggleCraft();
  if (ev.code === 'Digit1') selectSlot(0);
  if (ev.code === 'Digit2') selectSlot(1);
  if (ev.code === 'Digit3') selectSlot(2);
});
window.addEventListener('keyup', ev => {
  keys[ev.code] = false;
  if (ev.code === 'KeyE') wantGrapple = false;
});
let dragLook = false;
function requestLock() {
  try {
    const p = canvas.requestPointerLock && canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch (e) {}
}
canvas.addEventListener('mousedown', ev => {
  if (IS_TOUCH || state !== 'PLAY') return;
  if (document.pointerLockElement !== canvas) { requestLock(); dragLook = true; }
  if (ev.button === 0) startSwing(player);
  if (ev.button === 2) tryPlace();
});
window.addEventListener('mouseup', ev => { if (ev.buttons === 0) dragLook = false; });
window.addEventListener('contextmenu', ev => ev.preventDefault());
window.addEventListener('mousemove', ev => {
  if (document.pointerLockElement === canvas) { lookDX += ev.movementX * 0.0026; lookDY += ev.movementY * 0.0026; }
  else if (dragLook && state === 'PLAY') { lookDX += ev.movementX * 0.0032; lookDY += ev.movementY * 0.0032; }
});

const joyBase = document.getElementById('joyBase'), joyKnob = document.getElementById('joyKnob');
window.addEventListener('touchstart', ev => {
  if (state !== 'PLAY' || craftOpen) return;
  if (ev.target.closest && ev.target.closest('.tbtn, button, .overlay, .slot, #s_craft')) return;
  for (const t of ev.changedTouches) {
    if (t.clientX < window.innerWidth * 0.45 && joy.id === -1) {
      joy.id = t.identifier; joy.active = true; joy.ox = t.clientX; joy.oy = t.clientY; joy.x = joy.y = 0;
      joyBase.style.display = 'block'; joyKnob.style.display = 'block';
      joyBase.style.left = (joy.ox - 60) + 'px'; joyBase.style.top = (joy.oy - 60) + 'px';
      joyKnob.style.left = (joy.ox - 26) + 'px'; joyKnob.style.top = (joy.oy - 26) + 'px';
    } else if (lookTouch.id === -1) {
      lookTouch.id = t.identifier; lookTouch.lx = t.clientX; lookTouch.ly = t.clientY;
    }
  }
  ev.preventDefault();
}, { passive: false });
window.addEventListener('touchmove', ev => {
  if (state !== 'PLAY') return;
  for (const t of ev.changedTouches) {
    if (t.identifier === joy.id) {
      let dx = t.clientX - joy.ox, dy = t.clientY - joy.oy;
      const len = Math.hypot(dx, dy), max = 52;
      if (len > max) { dx *= max / len; dy *= max / len; }
      joy.x = dx / max; joy.y = dy / max;
      joyKnob.style.left = (joy.ox + dx - 26) + 'px'; joyKnob.style.top = (joy.oy + dy - 26) + 'px';
    } else if (t.identifier === lookTouch.id) {
      lookDX += (t.clientX - lookTouch.lx) * 0.007; lookDY += (t.clientY - lookTouch.ly) * 0.007;
      lookTouch.lx = t.clientX; lookTouch.ly = t.clientY;
    }
  }
  if (ev.cancelable) ev.preventDefault();
}, { passive: false });
function touchEnd(ev) {
  for (const t of ev.changedTouches) {
    if (t.identifier === joy.id) { joy.id = -1; joy.active = false; joy.x = joy.y = 0; joyBase.style.display = 'none'; joyKnob.style.display = 'none'; }
    if (t.identifier === lookTouch.id) lookTouch.id = -1;
  }
}
window.addEventListener('touchend', touchEnd, { passive: true });
window.addEventListener('touchcancel', touchEnd, { passive: true });

function bindBtn(id, down, up) {
  const el = document.getElementById(id);
  el.addEventListener('touchstart', ev => { ev.preventDefault(); ev.stopPropagation(); el.classList.add('on'); down(); }, { passive: false });
  el.addEventListener('touchend', ev => { ev.preventDefault(); ev.stopPropagation(); el.classList.remove('on'); if (up) up(); }, { passive: false });
}
bindBtn('s_btnJump', () => { player.jumpBuf = JUMP_BUF; });
bindBtn('s_btnAtk', () => startSwing(player));
bindBtn('s_btnGrap', () => { wantGrapple = true; }, () => { wantGrapple = false; });
bindBtn('s_btnPlace', () => tryPlace());
bindBtn('s_btnCraft', () => toggleCraft());
document.getElementById('fsBtn').addEventListener('touchend', ev => {
  ev.preventDefault();
  try {
    if (!document.fullscreenElement) {
      const p = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
      if (p && p.catch) p.catch(() => {});
    } else document.exitFullscreen();
  } catch (e) {}
}, { passive: false });

// hotbar
const slots = [document.getElementById('s_slot0'), document.getElementById('s_slot1'), document.getElementById('s_slot2')];
function selectSlot(i) {
  selSlot = i;
  slots.forEach((s, j) => s.classList.toggle('sel', j === i));
  document.getElementById('s_btnPlace').classList.toggle('avail', i > 0);
  ghost.visible = false;
}
slots.forEach((s, i) => {
  s.addEventListener('click', () => selectSlot(i));
  s.addEventListener('touchstart', ev => { ev.preventDefault(); ev.stopPropagation(); selectSlot(i); }, { passive: false });
});

// ============================== CRAFTING ===================================
const RECIPES = [
  { id: 'iron',    name: 'Iron Blade',    desc: 'CUTTY dmg 34→48',      cost: { wood: 6, stone: 6, iron: 2 }, once: true, req: () => tier === 0, do: () => { tier = 1; cutty.bladeM.color.setHex(0x9fb8d8); } },
  { id: 'gold',    name: 'Gold Blade',    desc: 'CUTTY dmg 48→62',      cost: { stone: 10, iron: 5 },         once: true, req: () => tier === 1, do: () => { tier = 2; cutty.bladeM.color.setHex(0xf2c14e); } },
  { id: 'crystal', name: 'Crystal Blade', desc: 'CUTTY dmg 62→80',      cost: { iron: 10 },                   once: true, req: () => tier === 2, do: () => { tier = 3; cutty.bladeM.color.setHex(0x7ee8e0); } },
  { id: 'rope',    name: 'Longer Rope',   desc: '+12 grapple range',    cost: { wood: 6, iron: 2 },           max: 2,     req: () => ropeUp < 2, do: () => { ropeUp++; } },
  { id: 'armor',   name: 'Iron Armor',    desc: '-40% damage taken',    cost: { iron: 8 },                    once: true, req: () => !armor,     do: () => { armor = true; } },
  { id: 'eat',     name: 'Scoff Berries', desc: '+30 HP',               cost: { berry: 2 },                               req: () => true,       do: () => { player.hp = Math.min(100, player.hp + 30); } },
];
const elCraft = document.getElementById('s_craft'), elRecipes = document.getElementById('s_recipes');
function costStr(c) { return Object.entries(c).map(([k, v]) => `${v} ${k}`).join(' + '); }
function canAfford(c) { return Object.entries(c).every(([k, v]) => inv[k] >= v); }
function renderCraft() {
  elRecipes.innerHTML = '';
  for (const r of RECIPES) {
    const row = document.createElement('div'); row.className = 'recipe';
    const done = !r.req();
    const info = document.createElement('div'); info.className = 'info';
    info.innerHTML = `<b>${r.name}</b> — ${r.desc}<br><span class="cost">${costStr(r.cost)}</span>`;
    const btn = document.createElement('button'); btn.className = 'rbtn';
    if (done) { btn.textContent = 'OWNED'; btn.classList.add('done'); btn.disabled = true; }
    else { btn.textContent = 'CRAFT'; btn.disabled = !canAfford(r.cost); }
    btn.addEventListener('click', () => {
      if (!r.req() || !canAfford(r.cost)) return;
      for (const [k, v] of Object.entries(r.cost)) inv[k] -= v;
      r.do(); updRes(); sfx.craft(); renderCraft();
      if (!flags.crafted) { flags.crafted = 1; say('Feel that edge? MUCH better.'); }
    });
    row.append(info, btn); elRecipes.append(row);
  }
}
function toggleCraft() {
  craftOpen = !craftOpen;
  elCraft.style.display = craftOpen ? 'block' : 'none';
  if (craftOpen) renderCraft();
}
document.getElementById('s_craftClose').addEventListener('click', () => { if (craftOpen) toggleCraft(); });

// ============================== COMBAT / MINING ============================
const raycaster = new THREE.Raycaster();
// first crosshair hit past the player (skips geometry between camera & player)
function castCenter(range) {
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  raycaster.far = range + camDist + 4;
  const dir = raycaster.ray.direction;
  const pd = (player.pos.x - camera.position.x) * dir.x +
             (player.pos.y + 0.7 - camera.position.y) * dir.y +
             (player.pos.z - camera.position.z) * dir.z;
  const hits = raycaster.intersectObjects(nearbyRays(), false);
  for (const h of hits) {
    if (h.distance < pd - 1.4) continue;
    if (h.point.distanceTo(player.pos) > range) return null;
    return h;
  }
  return null;
}
function startSwing(att) {
  if (state !== 'PLAY' && att.isPlayer) return;
  if (att.dead || att.atkCd > 0 || att.hitstun > 0) return;
  att.swingT = 0; att.atkCd = ATK_CD; att.swingVictims.clear(); att.didMine = false;
  if (att.isPlayer) {
    let bestT = null, bestD = 5.2;
    for (const o of hunters) {
      const dx = o.pos.x - att.pos.x, dz = o.pos.z - att.pos.z, d = Math.hypot(dx, dz);
      if (d < bestD && Math.abs(o.pos.y - att.pos.y) < 2.5) {
        const a = Math.atan2(dx, dz);
        if (Math.abs(angDiff(a, att.yaw)) < 1.2) { bestT = o; bestD = d; }
      }
    }
    if (bestT) att.yaw = Math.atan2(bestT.pos.x - att.pos.x, bestT.pos.z - att.pos.z);
  }
  att.vel.x += Math.sin(att.yaw) * 5.5; att.vel.z += Math.cos(att.yaw) * 5.5;
  sfx.swing();
}
function swingTick(att) {
  // melee arc vs the other side
  const foes = att.isPlayer ? hunters : [player];
  for (const t of foes) {
    if (t.dead || t.invuln > 0 || att.swingVictims.has(t)) continue;
    const dx = t.pos.x - att.pos.x, dz = t.pos.z - att.pos.z;
    const hd = Math.hypot(dx, dz), dy = t.pos.y - att.pos.y;
    if (hd < HIT_RANGE && Math.abs(dy) < 2.3) {
      const a = Math.atan2(dx, dz);
      if (Math.abs(angDiff(a, att.yaw)) < HIT_ARC) {
        att.swingVictims.add(t);
        applyHit(att, t, dx / (hd || 1), dz / (hd || 1));
      }
    }
  }
  // player also mines/chops (once per swing)
  if (att.isPlayer && !att.didMine) { att.didMine = true; mineImpact(); }
}
const mineHp = new Map();
function mineImpact() {
  const h = castCenter(MINE_RANGE);
  if (h) {
    const u = h.object.userData;
    if (u.kind === 'terr') {
      const cell = u.ch.cellIdx[h.instanceId];
      if (cellH(cell.cx, cell.cz) <= -3) return;      // deep enough, pirate
      hitMinable('c:' + cellKey(cell.cx, cell.cz), 3, h.point, 0x8b8f99, () => {
        diffs.dh[cellKey(cell.cx, cell.cz)] = (diffs.dh[cellKey(cell.cx, cell.cz)] || 0) - 1;
        inv.stone += 1; updRes(); rebuildAround(cell.cx, cell.cz); sfx.breakB();
        if (!flags.mined) { flags.mined = 1; say('Dig, dig! Stone makes fine walls when they come huntin\'.'); }
      });
      return;
    }
    if (u.kind === 'tree' || u.kind === 'rock' || u.kind === 'ore' || u.kind === 'bush') {
      const o = u.list[h.instanceId];
      const need = { tree: 4, rock: 3, ore: 5, bush: 1 }[u.kind];
      const col = { tree: 0x9c6b3a, rock: 0x8b8f99, ore: 0xdfe4ee, bush: 0x4caf3f }[u.kind];
      hitMinable('o:' + cellKey(o.cx, o.cz), need, h.point, col, () => {
        diffs.rm[cellKey(o.cx, o.cz)] = 1;
        if (u.kind === 'tree') { inv.wood += 5; if (!flags.chopped) { flags.chopped = 1; say('TIMBER! Five logs. Chop more — wood builds bridges.'); } }
        if (u.kind === 'rock') inv.stone += 3;
        if (u.kind === 'ore') inv.iron += 3;
        if (u.kind === 'bush') inv.berry += 3;
        updRes(); rebuildAround(o.cx, o.cz); sfx.breakB();
      });
      return;
    }
    if (u.kind === 'block') {
      hitMinable('b:' + u.bx + ',' + u.by + ',' + u.bz, 2, h.point, 0x9c6b3a, () => {
        const type = diffs.pb[u.bx + ',' + u.by + ',' + u.bz];
        delete diffs.pb[u.bx + ',' + u.by + ',' + u.bz];
        inv[type === 1 ? 'wood' : 'stone'] += 1; updRes();
        rebuildAround(Math.floor(u.bx / CELL), Math.floor(u.bz / CELL)); sfx.breakB();
      });
      return;
    }
    return;
  }
}
function hitMinable(key, need, point, color, onBreak) {
  const left = (mineHp.get(key) ?? need) - 1;
  burst(point, color, 5, 4, 0.5);
  sfx.chop();
  if (left <= 0) { mineHp.delete(key); onBreak(); }
  else mineHp.set(key, left);
}
function applyHit(att, vic, nx, nz) {
  let dmg = att.isPlayer ? TIER_DMG[tier] : Math.min(26, 14 + runT / 60 * 1.5);
  if (vic.isPlayer && armor) dmg *= 0.6;
  vic.hp -= dmg; vic.hitstun = 0.28; vic.flashT = 0.22; vic.regenT = 5;
  vic.vel.x += nx * 9.5; vic.vel.z += nz * 9.5; vic.vel.y = Math.max(vic.vel.y, 5);
  vic.grapOn = false;
  burst(V3(vic.pos.x, vic.pos.y + 0.5, vic.pos.z), 0xffd23e, 8, 6, 0.6);
  sfx.hit();
  if (vic.isPlayer) {
    flashVignette(); sfx.hurt();
    if (vic.hp < 32 && !vic.dead) say('We\'re bleedin\' bad! Berries! Or run!', true);
  }
  if (vic.tag) vic.tag.draw(Math.max(0, vic.hp));
  if (vic.hp <= 0) {
    if (vic.isPlayer) playerDeath();
    else killHunter(vic);
  }
}

// ============================== BUILDING ===================================
const ghost = new THREE.Mesh(new THREE.BoxGeometry(1.02, 1.02, 1.02),
  new THREE.MeshBasicMaterial({ color: 0x7dff6a, wireframe: true }));
ghost.visible = false; scene.add(ghost);
let ghostPos = null, ghostT = 0;
function updateGhost(dt) {
  ghostT -= dt;
  if (ghostT > 0) return;
  ghostT = 0.08;
  ghost.visible = false; ghostPos = null;
  if (state !== 'PLAY' || selSlot === 0) return;
  const h = castCenter(PLACE_RANGE);
  if (!h || !h.face) return;
  const p = h.point.clone().addScaledVector(h.face.normal, 0.5);
  const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
  if (by + 0.5 < groundH(bx + 0.5, bz + 0.5)) return;               // inside terrain
  if (diffs.pb[bx + ',' + by + ',' + bz]) return;
  // don't place inside anyone
  for (const e of [player, ...hunters]) {
    if (Math.abs(e.pos.x - (bx + 0.5)) < e.hw + 0.5 &&
        Math.abs(e.pos.z - (bz + 0.5)) < e.hw + 0.5 &&
        Math.abs(e.pos.y - (by + 0.5)) < e.hh + 0.5) return;
  }
  ghostPos = { bx, by, bz };
  ghost.position.set(bx + 0.5, by + 0.5, bz + 0.5);
  ghost.visible = true;
}
function tryPlace() {
  if (state !== 'PLAY' || selSlot === 0 || !ghostPos) return;
  const type = selSlot === 1 ? 1 : 2, res = selSlot === 1 ? 'wood' : 'stone';
  if (inv[res] < 1) { say(`Out of ${res}! ${res === 'wood' ? 'Chop trees' : 'Mine stone'} first.`); return; }
  inv[res] -= 1; updRes();
  const { bx, by, bz } = ghostPos;
  diffs.pb[bx + ',' + by + ',' + bz] = type;
  const kx = Math.floor(Math.floor(bx / CELL) / CH), kz = Math.floor(Math.floor(bz / CELL) / CH);
  const ch = chunks.get(kx + ',' + kz);
  if (ch) addBlockMesh(ch, bx, by, bz, type);
  sfx.place();
  ghostPos = null; ghost.visible = false;
  if (!flags.built) { flags.built = 1; say('A fine start! Stack blocks to towers — hunters climb poorly.'); }
}

// ============================== PHYSICS ====================================
function cornerH(e) {
  const o = e.hw - 0.06;
  return Math.max(
    groundH(e.pos.x - o, e.pos.z - o), groundH(e.pos.x + o, e.pos.z - o),
    groundH(e.pos.x - o, e.pos.z + o), groundH(e.pos.x + o, e.pos.z + o));
}
function overlapsS(e, s) {
  return e.pos.x - e.hw < s.max.x && e.pos.x + e.hw > s.min.x &&
         e.pos.y - e.hh < s.max.y && e.pos.y + e.hh > s.min.y &&
         e.pos.z - e.hw < s.max.z && e.pos.z + e.hw > s.min.z;
}
function moveAndCollide(e, dt) {
  const wasGround = e.onGround;
  e.onGround = false;
  const solids = nearbySolids(e.pos);
  const step = wasGround ? STEP_UP : 0.35;
  // X
  let prev = e.pos.x;
  e.pos.x += e.vel.x * dt;
  let H = cornerH(e), feet = e.pos.y - e.hh;
  if (H - feet > step || (H - feet > 0.05 && !wasGround && e.vel.y > 0.5)) {
    e.pos.x = prev;
    if (!wasGround) { e.wallT = 0.16; e.wallN.set(e.vel.x > 0 ? -1 : 1, 0, 0); }
    e.vel.x = 0;
  }
  for (const s of solids) if (overlapsS(e, s)) {
    if (e.vel.x > 0) e.pos.x = s.min.x - e.hw; else if (e.vel.x < 0) e.pos.x = s.max.x + e.hw;
    if (!wasGround) { e.wallT = 0.16; e.wallN.set(e.vel.x > 0 ? -1 : 1, 0, 0); }
    e.vel.x = 0;
  }
  // Z
  prev = e.pos.z;
  e.pos.z += e.vel.z * dt;
  H = cornerH(e); feet = e.pos.y - e.hh;
  if (H - feet > step || (H - feet > 0.05 && !wasGround && e.vel.y > 0.5)) {
    e.pos.z = prev;
    if (!wasGround) { e.wallT = 0.16; e.wallN.set(0, 0, e.vel.z > 0 ? -1 : 1); }
    e.vel.z = 0;
  }
  for (const s of solids) if (overlapsS(e, s)) {
    if (e.vel.z > 0) e.pos.z = s.min.z - e.hw; else if (e.vel.z < 0) e.pos.z = s.max.z + e.hw;
    if (!wasGround) { e.wallT = 0.16; e.wallN.set(0, 0, e.vel.z > 0 ? -1 : 1); }
    e.vel.z = 0;
  }
  // Y
  e.pos.y += e.vel.y * dt;
  H = cornerH(e);
  if (e.pos.y - e.hh <= H && e.vel.y <= 0) {
    e.pos.y = H + e.hh; e.onGround = true;
    if (!wasGround && e.landV < -14) { burst(V3(e.pos.x, e.pos.y - e.hh, e.pos.z), 0xffffff, 5, 3, 0.4); e.squash = 0.18; if (e.isPlayer) sfx.land(); }
    e.vel.y = 0;
  }
  for (const s of solids) if (overlapsS(e, s)) {
    if (e.vel.y <= 0 && e.pos.y > (s.min.y + s.max.y) / 2) {
      e.pos.y = s.max.y + e.hh; e.onGround = true;
      if (!wasGround && e.landV < -14) { e.squash = 0.18; if (e.isPlayer) sfx.land(); }
    } else if (e.vel.y > 0) e.pos.y = s.min.y - e.hh;
    e.vel.y = 0;
  }
  if (e.onGround) { e.jumpsLeft = MAX_AIR_JUMPS; e.coyote = COYOTE; }
  // water
  e.inWater = groundH(e.pos.x, e.pos.z) <= 0 && (e.pos.y - e.hh) < WATER_Y;
}
function tryJump(e) {
  if (e.inWater) { e.vel.y = JUMP_V * 0.85; return true; }
  if (e.onGround || e.coyote > 0) {
    e.vel.y = JUMP_V; e.onGround = false; e.coyote = 0; e.squash = 0.15;
    if (e.isPlayer) sfx.jump();
    return true;
  }
  if (e.wallT > 0) {
    e.vel.y = WALLJUMP_V;
    e.vel.x += e.wallN.x * WALLPUSH; e.vel.z += e.wallN.z * WALLPUSH;
    e.wallT = 0;
    burst(V3(e.pos.x, e.pos.y - 0.4, e.pos.z), 0xffffff, 4, 3, 0.5);
    if (e.isPlayer) sfx.airjump();
    return true;
  }
  if (e.jumpsLeft > 0) {
    e.jumpsLeft--; e.vel.y = AIRJUMP_V;
    e.vel.x += e.mx * 2.5; e.vel.z += e.mz * 2.5;
    burst(V3(e.pos.x, e.pos.y - 0.8, e.pos.z), 0xcfe8ff, 6, 3.5, 0.2);
    if (e.isPlayer) sfx.airjump();
    return true;
  }
  return false;
}
function updateEntity(e, dt) {
  if (e.dead) return;
  e.atkCd = Math.max(0, e.atkCd - dt);
  e.coyote = Math.max(0, e.coyote - dt);
  e.wallT = Math.max(0, e.wallT - dt);
  e.invuln = Math.max(0, e.invuln - dt);
  e.hitstun = Math.max(0, e.hitstun - dt);
  e.flashT = Math.max(0, e.flashT - dt);
  e.jumpBuf = Math.max(0, e.jumpBuf - dt);
  e.squash = Math.max(0, e.squash - dt);
  if (e.regenT > 0) e.regenT -= dt;
  else if (e.hp < 100) { e.hp = Math.min(100, e.hp + (e.isPlayer ? 3.5 : 6) * dt); if (e.tag) e.tag.draw(e.hp); }

  if (e.swingT >= 0) {
    e.swingT += dt;
    if (e.swingT > SWING_DUR) e.swingT = -1;
    else if (e.swingT >= SWING_ACTIVE_A && e.swingT <= SWING_ACTIVE_B) swingTick(e);
  }

  const stunned = e.hitstun > 0;
  const spd = e.inWater ? SPEED * 0.45 : SPEED;
  if (!stunned && (e.mx !== 0 || e.mz !== 0)) {
    const acc = e.onGround || e.inWater ? ACC_GROUND : ACC_AIR;
    const k = Math.min(1, acc * dt);
    e.vel.x += (e.mx * spd - e.vel.x) * k;
    e.vel.z += (e.mz * spd - e.vel.z) * k;
  } else if ((e.onGround || e.inWater) && !stunned) {
    const k = Math.min(1, 10 * dt);
    e.vel.x -= e.vel.x * k; e.vel.z -= e.vel.z * k;
  }
  if (e.jumpBuf > 0 && !stunned) { if (tryJump(e)) e.jumpBuf = 0; }

  if (e.grapOn) {
    e.grapT += dt;
    const dx = e.grapP.x - e.pos.x, dy = e.grapP.y - e.pos.y, dz = e.grapP.z - e.pos.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < GRAPPLE_MIN || e.grapT > 3.0 || (e.isPlayer && !wantGrapple)) {
      e.grapOn = false;
      e.vel.y += 3.5;
    } else {
      const nx = dx / d, ny = dy / d, nz = dz / d;
      e.vel.x += nx * GRAPPLE_PULL * dt;
      e.vel.y += ny * (GRAPPLE_PULL + 12) * dt;
      e.vel.z += nz * GRAPPLE_PULL * dt;
      e.grapLen = Math.max(GRAPPLE_MIN, e.grapLen - GRAPPLE_REEL * dt);
      if (d > e.grapLen) {
        const ex = d - e.grapLen;
        e.pos.x += nx * ex; e.pos.y += ny * ex; e.pos.z += nz * ex;
        const rad = e.vel.x * -nx + e.vel.y * -ny + e.vel.z * -nz;
        if (rad > 0) { e.vel.x += nx * rad; e.vel.y += ny * rad; e.vel.z += nz * rad; }
      }
    }
  }

  e.vel.y += GRAV * (e.inWater ? 0.35 : 1) * dt;
  if (e.inWater && e.vel.y < -4) e.vel.y = -4;
  if (e.inWater && e.pos.y - e.hh < WATER_Y - 1.2) e.vel.y += 26 * dt;   // buoyancy
  if (e.vel.y < FALL_MAX) e.vel.y = FALL_MAX;
  if (e.wallT > 0 && e.vel.y < -5) e.vel.y = -5;
  e.landV = e.vel.y;

  moveAndCollide(e, dt);
  if (e.pos.y < -25) { e.pos.y = groundH(e.pos.x, e.pos.z) + 3; e.vel.set(0, 0, 0); }
}

// ============================== GRAPPLE ====================================
function tryGrapple() {
  const h = castCenter(grappleRange());
  if (h) { attachGrapple(player, h.point); return true; }
  return false;
}
function attachGrapple(e, point) {
  e.grapOn = true; e.grapP.copy(point);
  e.grapLen = Math.max(GRAPPLE_MIN, e.pos.distanceTo(point));
  e.grapT = 0;
  sfx.grap();
  burst(point, 0xffd23e, 5, 4, 0.5);
  if (e.isPlayer && !flags.swung) { flags.swung = 1; say('WHEEE! Swing tree to tree — hunters hate that.'); }
}

// ============================== HUNTER AI ==================================
function hunterThink(e, dt) {
  const ai = e.ai;
  ai.grapCd -= dt; ai.thinkT -= dt;
  if (ai.thinkT <= 0) {
    ai.thinkT = 0.22;
    if (Math.random() < 0.15) ai.strafe = -ai.strafe;
  }
  const t = player;
  e.mx = e.mz = 0;
  if (t.dead) return;
  const dx = t.pos.x - e.pos.x, dz = t.pos.z - e.pos.z;
  const hd = Math.hypot(dx, dz), dy = t.pos.y - e.pos.y;
  const nx = dx / (hd || 1), nz = dz / (hd || 1);
  e.yaw = Math.atan2(dx, dz);

  if (hd > 3.0) { e.mx = nx; e.mz = nz; }
  else {
    e.mx = nz * ai.strafe * 0.7 - nx * 0.15;
    e.mz = -nx * ai.strafe * 0.7 - nz * 0.15;
  }
  // cliffs / walls / stuck
  const hspd = Math.hypot(e.vel.x, e.vel.z);
  if ((e.mx || e.mz) && hspd < 1.2 && e.onGround) ai.stuckT += dt; else ai.stuckT = Math.max(0, ai.stuckT - dt * 2);
  if (ai.stuckT > 0.35) { e.jumpBuf = JUMP_BUF; ai.stuckT = 0; }
  const aheadH = groundH(e.pos.x + nx * 2, e.pos.z + nz * 2);
  if (e.onGround && aheadH - (e.pos.y - e.hh) > 1.1) e.jumpBuf = JUMP_BUF;      // climb
  if (!e.onGround && e.vel.y < -3 && e.jumpsLeft > 0 && dy > 0 && Math.random() < 0.06) tryJump(e);
  // grapple to a tree near the player
  if (!e.grapOn && ai.grapCd <= 0 && (hd > 18 || dy > 5)) {
    let bestO = null, bd = 1e9;
    const kx = Math.floor(e.pos.x / CHUNK_W), kz = Math.floor(e.pos.z / CHUNK_W);
    for (let ddz = -1; ddz <= 1; ddz++) for (let ddx = -1; ddx <= 1; ddx++) {
      const ch = chunks.get((kx + ddx) + ',' + (kz + ddz));
      if (!ch) continue;
      for (const o of ch.objs) {
        if (o.type !== 1 || diffs.rm[cellKey(o.cx, o.cz)]) continue;
        const dMe = Math.hypot(o.x - e.pos.x, o.z - e.pos.z);
        if (dMe < 5 || dMe > 34) continue;
        const score = Math.hypot(o.x - t.pos.x, o.z - t.pos.z) + dMe * 0.4;
        if (score < bd) { bd = score; bestO = o; }
      }
    }
    if (bestO) { attachGrapple(e, V3(bestO.x, bestO.y + 5.5, bestO.z)); ai.grapCd = rand(5, 9); }
    else ai.grapCd = 2;
  }
  // attack
  if (hd < 3.1 && Math.abs(dy) < 2.2 && e.atkCd <= 0 && ai.atkDelay <= 0) ai.atkDelay = rand(0.08, 0.4);
  if (ai.atkDelay > 0) { ai.atkDelay -= dt; if (ai.atkDelay <= 0) startSwing(e); }
}
// spawn director
let hunterTimer = 30, night = false;
function tickHunters(dt) {
  const cap = 1 + Math.min(3, Math.floor(runT / 90));
  hunterTimer -= dt * (night ? 1.6 : 1);
  if (hunterTimer <= 0 && hunters.length < cap) {
    spawnHunter();
    hunterTimer = Math.max(10, 30 - runT / 25);
  }
  for (const h of hunters) {
    hunterThink(h, dt);
    updateEntity(h, dt);
    if (Math.hypot(h.pos.x - player.pos.x, h.pos.z - player.pos.z) > 130) killHunter(h, true);
  }
}

// ============================== VISUALS ====================================
function updateVisual(e, dt, time) {
  if (e.dead) return;
  const v = e.vis, p = v.parts;
  v.group.position.set(e.pos.x, e.pos.y - e.hh, e.pos.z);
  v.group.rotation.y = e.yaw;
  const sq = e.squash > 0 ? 1 - e.squash * 1.6 : 1;
  v.group.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
  const flash = e.flashT > 0;
  for (const m of v.mats) m.emissive.setHex(flash ? 0x991111 : 0x000000);
  v.group.visible = !(e.invuln > 0 && Math.floor(time * 14) % 2 === 0);

  const hspd = Math.hypot(e.vel.x, e.vel.z);
  if (e.onGround) {
    const sw = Math.sin(time * 11 * Math.max(0.4, hspd / SPEED)) * Math.min(1, hspd / SPEED) * 0.75;
    p.legL.rotation.x = sw; p.legR.rotation.x = -sw;
    p.armL.rotation.x = -sw * 0.8; p.armL.rotation.z = 0.06;
    if (e.swingT < 0) p.armR.rotation.set(sw * 0.8, 0, -0.06);
  } else {
    p.legL.rotation.x = 0.5; p.legR.rotation.x = -0.35;
    p.armL.rotation.x = -0.5; p.armL.rotation.z = 0.5;
    if (e.swingT < 0) p.armR.rotation.set(-0.5, 0, -0.5);
  }
  if (e.grapOn) { p.armL.rotation.x = -2.6; p.armL.rotation.z = 0; }
  if (e.swingT >= 0) {
    const t = e.swingT / SWING_DUR;
    let rx, ry;
    if (t < 0.22) { const k = t / 0.22; rx = lerp(-0.4, -2.5, k); ry = lerp(0, 0.5, k); }
    else if (t < 0.62) { const k = (t - 0.22) / 0.4; rx = lerp(-2.5, 0.9, k); ry = lerp(0.5, -0.7, k); }
    else { const k = (t - 0.62) / 0.38; rx = lerp(0.9, 0, k); ry = lerp(-0.7, 0, k); }
    p.armR.rotation.set(rx, ry, -0.15);
  }
  if (e.grapOn) {
    e.rope.line.visible = e.rope.hook.visible = true;
    const a = e.rope.line.geometry.attributes.position.array;
    a[0] = e.pos.x; a[1] = e.pos.y + 0.5; a[2] = e.pos.z;
    a[3] = e.grapP.x; a[4] = e.grapP.y; a[5] = e.grapP.z;
    e.rope.line.geometry.attributes.position.needsUpdate = true;
    e.rope.hook.position.copy(e.grapP);
  } else e.rope.line.visible = e.rope.hook.visible = false;
  if (e.tag) e.tag.sprite.position.set(e.pos.x, e.pos.y + 1.5, e.pos.z);
  // blob shadow on terrain
  const gy = cornerH(e);
  v.shadow.visible = true;
  v.shadow.position.set(e.pos.x, gy + 0.03, e.pos.z);
  const hAbove = clamp(e.pos.y - e.hh - gy, 0, 12);
  const s = lerp(1.15, 0.45, hAbove / 12);
  v.shadow.scale.set(s, s, 1);
  v.shadow.material.opacity = lerp(0.32, 0.1, hAbove / 12);
}
let hunterNear = 1e9;
function updateCutty(dt, time) {
  const g = cutty.group;
  if (player.swingT >= 0) {
    // dart in an arc in front of the player
    const t = clamp(player.swingT / SWING_DUR, 0, 1);
    const a = lerp(1.2, -1.2, t * t * (3 - 2 * t));
    const r = 1.5;
    const tx = player.pos.x + Math.sin(player.yaw + a) * r;
    const tz = player.pos.z + Math.cos(player.yaw + a) * r;
    g.position.lerp(V3(tx, player.pos.y + 0.55, tz), Math.min(1, 30 * dt));
    g.rotation.y = player.yaw + a;
    g.rotation.x = lerp(1.5, 2.6, t);
    g.rotation.z = 0;
  } else {
    const ry = camYaw;
    const bx = player.pos.x + (-Math.cos(ry)) * -1.15 + Math.sin(ry) * 0.2;
    const bz = player.pos.z + (Math.sin(ry)) * -1.15 + Math.cos(ry) * 0.2;
    cutty.bob += dt;
    g.position.lerp(V3(bx, player.pos.y + 0.9 + Math.sin(cutty.bob * 2.2) * 0.14, bz), Math.min(1, 8 * dt));
    g.rotation.y = camYaw;
    g.rotation.x = Math.sin(cutty.bob * 1.6) * 0.1;
    g.rotation.z = Math.sin(cutty.bob * 1.1) * 0.06;
  }
  // danger glow
  if (hunterNear < 35) {
    const pulse = (Math.sin(time * 8) + 1) / 2;
    cutty.bladeM.emissive.setRGB(0.45 * pulse + 0.1, 0, 0);
  } else cutty.bladeM.emissive.setHex(0x000000);
}

// ============================== CAMERA =====================================
const camPos = V3(0, 12, -12);
function updateCamera(dt) {
  camYaw -= lookDX; camPitch += lookDY;
  lookDX = lookDY = 0;
  camPitch = clamp(camPitch, -1.15, 1.25);
  const head = V3(player.pos.x, player.pos.y + 0.7, player.pos.z);
  const cp = Math.cos(camPitch);
  const off = V3(-Math.sin(camYaw) * cp, Math.sin(camPitch), -Math.cos(camYaw) * cp);
  let dist = camDist;
  for (let k = 1; k <= 10; k++) {
    const t = (k / 10) * camDist;
    const px = head.x + off.x * t, py = head.y + off.y * t, pz = head.z + off.z * t;
    if (py < groundH(px, pz) + 0.4) { dist = Math.max(1.4, t - 0.5); break; }
  }
  const target = head.clone().addScaledVector(off, dist);
  camPos.lerp(target, Math.min(1, 14 * dt));
  camera.position.copy(camPos);
  camera.lookAt(head.x, head.y + 0.25, head.z);
}
function menuCamera(time) {
  const a = time * 0.1;
  const cx = Math.sin(a) * 26, cz = Math.cos(a) * 26;
  camera.position.set(cx, groundH(cx, cz) + 13, cz);
  camera.lookAt(0, groundH(0, 0) + 2, 0);
}

// ============================== HUD ========================================
const elHp = document.getElementById('s_hpfill');
const pips = Array.from(document.querySelectorAll('#s_pips .pip'));
const elTimer = document.getElementById('s_timer');
const elBest = document.getElementById('s_best');
const elWarn = document.getElementById('s_warn');
const elVig = document.getElementById('vig');
const elCross = document.getElementById('cross');
function flashVignette() { elVig.style.opacity = 0.9; }
function updRes() {
  document.getElementById('s_rWood').textContent = inv.wood;
  document.getElementById('s_rStone').textContent = inv.stone;
  document.getElementById('s_rIron').textContent = inv.iron;
  document.getElementById('s_rBerry').textContent = inv.berry;
}
function updateHud() {
  const hpw = clamp(player.hp, 0, 100);
  elHp.style.width = hpw + '%';
  elHp.className = hpw < 35 ? 'low' : '';
  for (let i = 0; i < pips.length; i++)
    pips[i].className = 'pip' + ((player.onGround ? i < 3 : i < player.jumpsLeft) ? '' : ' off');
  const day = Math.floor(runT / DAYLEN) + 1;
  elTimer.childNodes[0].textContent = `${fmt(runT)} · DAY ${day}`;
  elBest.textContent = `BEST ${fmt(best)}`;
  elTimer.classList.toggle('night', night);
  hunterNear = 1e9;
  for (const h of hunters) hunterNear = Math.min(hunterNear, Math.hypot(h.pos.x - player.pos.x, h.pos.z - player.pos.z));
  if (hunterNear < 26) { elWarn.style.display = 'block'; elWarn.textContent = `⚠ HUNTER ${Math.round(hunterNear)}m`; }
  else elWarn.style.display = 'none';
}
let crossT = 0;
function updateCross(dt) {
  crossT -= dt; if (crossT > 0) return; crossT = 0.15;
  if (state !== 'PLAY') { elCross.classList.remove('hot'); return; }
  elCross.classList.toggle('hot', !!castCenter(grappleRange()));
}
// radar ping
let pingT = 10;
function tickPing(dt) {
  pingT -= dt;
  if (pingT > 0) return;
  pingT = 9;
  let bestH = null, bd = 1e9;
  for (const h of hunters) {
    const d = Math.hypot(h.pos.x - player.pos.x, h.pos.z - player.pos.z);
    if (d < bd) { bd = d; bestH = h; }
  }
  if (bestH && bd < 80 && bd > 24)
    say(`Hunter ${Math.round(bd)}m to the ${dirName(bestH.pos.x - player.pos.x, bestH.pos.z - player.pos.z)}. I can smell the brute.`);
}

// ============================== DAY / NIGHT ================================
const fogDay = 0x77c4f2;
function tickDayNight() {
  const phase = (runT % DAYLEN) / DAYLEN;
  let k; // 0 = day, 1 = night
  if (phase < 0.45) k = 0;
  else if (phase < 0.55) k = (phase - 0.45) / 0.1;
  else if (phase < 0.92) k = 1;
  else k = 1 - (phase - 0.92) / 0.08;
  const wasNight = night;
  night = k > 0.6;
  if (night && !wasNight) { sfx.night(); say('Night falls... they hunt bolder in the dark. Eyes open.', true); }
  const sky = SKY_DAY.clone().lerp(SKY_NIGHT, k);
  if (k > 0.1 && k < 0.9) sky.lerp(SKY_DUSK, 0.35 * Math.sin(k * Math.PI));
  scene.background.copy(sky);
  scene.fog.color.copy(sky);
  sun.intensity = lerp(0.7, 0.1, k);
  hemi.intensity = lerp(0.8, 0.3, k);
}

// ============================== GAME FLOW ==================================
const elMenu = document.getElementById('s_menu'), elDeath = document.getElementById('s_death');
function playerControl() {
  let ix = 0, iy = 0;
  if (keys.KeyW || keys.ArrowUp) iy += 1;
  if (keys.KeyS || keys.ArrowDown) iy -= 1;
  if (keys.KeyD || keys.ArrowRight) ix += 1;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1;
  if (joy.active) { ix += joy.x; iy += -joy.y; }
  const len = Math.hypot(ix, iy);
  if (len > 1) { ix /= len; iy /= len; }
  const sy = Math.sin(camYaw), cy = Math.cos(camYaw);
  player.mx = sy * iy - cy * ix;
  player.mz = cy * iy + sy * ix;
  if (len > 0.05 && player.swingT < 0 && !player.grapOn)
    player.yaw = Math.atan2(player.mx, player.mz);
  if (player.swingT >= 0 || player.grapOn) player.yaw = camYaw;
  if (wantGrapple && !player.grapOn && !player.dead) tryGrapple();
  if (!wantGrapple && player.grapOn) player.grapOn = false;
}
function startRun(fresh) {
  state = 'PLAY';
  elMenu.style.display = 'none'; elDeath.style.display = 'none';
  player.dead = false;
  if (fresh) {
    player.pos.set(1, groundH(1, 1) + 2, 1);
    player.hp = 100;
  }
  player.invuln = 1.5;
  selectSlot(0); updRes();
  if (!IS_TOUCH) requestLock();
  const c = ac(); if (c && c.state === 'suspended') c.resume();
  if (!flags.intro) {
    flags.intro = 1;
    say('Ahoy! I\'m CUTTY, yer flyin\' cutlass. Chop trees, mine stone, build!');
    say('Hunters are comin\' for ye. Survive as long as ye can — I\'ll keep watch.');
  } else say('Back at it! The wilds remember ye.');
}
function playerDeath() {
  player.dead = true;
  state = 'DEAD';
  burst(V3(player.pos.x, player.pos.y + 0.5, player.pos.z), 0xe03131, 18, 9, 1);
  sfx.ko();
  document.exitPointerLock && document.exitPointerLock();
  if (runT > best) best = Math.floor(runT);
  document.getElementById('s_deathInfo').innerHTML =
    `Survived <b style="color:#ffd23e">${fmt(runT)}</b> · Best ${fmt(best)}<br>` +
    `Day ${Math.floor(runT / DAYLEN) + 1} · Your world and loot are safe.`;
  elDeath.style.display = 'flex';
  saveGame();
}
document.getElementById('s_respawnBtn').addEventListener('click', () => {
  runT = 0; hunterTimer = 30;
  while (hunters.length) killHunter(hunters[0], true);
  player.hp = 100; player.vel.set(0, 0, 0); player.grapOn = false;
  player.pos.set(1, groundH(1, 1) + 2, 1);
  startRun(false);
});
function initWorld(save) {
  for (const ch of [...chunks.values()]) disposeChunk(ch);
  while (hunters.length) killHunter(hunters[0], true);
  for (const p of pickups) scene.remove(p.m);
  pickups.length = 0; mineHp.clear(); hunterTimer = 30;
  if (save) {
    seed = save.seed; best = save.best || 0; runT = save.runT || 0; flags = save.flags || {};
    diffs = save.diffs || { dh: {}, rm: {}, pb: {} };
    if (!diffs.rm || Array.isArray(diffs.rm)) diffs.rm = {};
    inv = save.player.inv; tier = save.player.tier || 0;
    ropeUp = save.player.ropeUp || 0; armor = !!save.player.armor;
    cutty.bladeM.color.setHex([0xdfe6f0, 0x9fb8d8, 0xf2c14e, 0x7ee8e0][tier]);
    buildChunk(0, 0);
    player.pos.set(save.player.x, save.player.y + 0.5, save.player.z);
    player.hp = save.player.hp;
  } else {
    seed = (Math.random() * 1e9) | 0;
    diffs = { dh: {}, rm: {}, pb: {} };
    inv = { wood: 0, stone: 0, iron: 0, berry: 0 };
    tier = 0; ropeUp = 0; armor = false; flags = {}; runT = 0;
    cutty.bladeM.color.setHex(0xdfe6f0);
    player.pos.set(1, 10, 1);
  }
  // build the immediate area synchronously
  const kx = Math.floor(player.pos.x / CHUNK_W), kz = Math.floor(player.pos.z / CHUNK_W);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) buildChunk(kx + dx, kz + dz);
  if (!save) player.pos.y = groundH(1, 1) + 2;
}
const existing = loadSave();
if (existing) document.getElementById('s_continueBtn').style.display = '';
if (IS_TOUCH) {
  document.getElementById('s_ctrlsDesk').style.display = 'none';
  document.getElementById('s_ctrlsTouch').style.display = 'block';
}
document.getElementById('s_continueBtn').addEventListener('click', () => { initWorld(existing); startRun(false); });
document.getElementById('s_newBtn').addEventListener('click', () => { wipeSave(); initWorld(null); startRun(true); });
// menu backdrop world
initWorld(existing);

let saveT = 8;
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'PLAY') saveGame(); });

// ============================== MAIN LOOP ==================================
// tiny debug/testing surface (harmless in production)
window.__SURV_DEBUG = {
  state: () => state,
  inv: () => ({ ...inv }),
  runT: () => runT,
  aim: () => { const h = castCenter(MINE_RANGE); return h ? h.object.userData.kind : null; },
  mine: () => mineImpact(),
  blocks: () => Object.keys(diffs.pb).length,
  hunters: () => hunters.length,
  spawnHunter: () => spawnHunter(),
  chunks: () => chunks.size,
};

let last = performance.now(), acc = 0, timeSec = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  timeSec += dt;

  if (state === 'PLAY') {
    runT += dt;
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 4) {
      playerControl();
      updateEntity(player, STEP);
      tickHunters(STEP);
      tickParts(STEP);
      tickPickups(STEP);
      acc -= STEP; steps++;
    }
    if (acc >= STEP) acc = 0;
    updateCamera(dt);
    updateGhost(dt);
    tickPing(dt);
    saveT -= dt;
    if (saveT <= 0) { saveT = 8; saveGame(); }
  } else if (state === 'MENU') {
    menuCamera(timeSec);
  } else {
    updateCamera(dt);
  }

  streamChunks();
  tickDayNight();
  tickSay(dt);
  water.position.x = player.pos.x; water.position.z = player.pos.z;
  water.material.map.offset.x += dt * 0.008;
  water.material.map.offset.y += dt * 0.004;
  for (const c of clouds) {
    c.position.x += dt * 1.1;
    if (c.position.x > player.pos.x + 110) c.position.x = player.pos.x - 110;
  }
  sun.position.set(player.pos.x + 40, 70, player.pos.z + 25);

  updateVisual(player, dt, timeSec);
  for (const h of hunters) updateVisual(h, dt, timeSec);
  updateCutty(dt, timeSec);
  elVig.style.opacity = Math.max(0, parseFloat(elVig.style.opacity || 0) - dt * 2);
  updateHud();
  updateCross(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
};

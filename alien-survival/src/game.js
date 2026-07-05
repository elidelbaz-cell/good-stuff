import * as THREE from 'three';

/* ============================================================
   XENOTERRA
   First-person voxel survival on an alien planet.
   - Procedural alien terrain: violet meadows, teal stone,
     glowfruit trees, crystal veins, shallow seas.
   - Mine blocks (hold LMB), place blocks (RMB), 9-slot hotbar.
   - Hunger + health. Eat glowfruit and shimmer-shrooms.
   - Full day/night cycle. Skitters crawl out after dark.
   - Pointer-lock first person, WASD + sprint + jump + swim.
   ============================================================ */

// ---------------------------------------------------------- world constants
const WX = 128, WZ = 128, WY = 48;   // world size in blocks
const WATER_Y = 12;                  // sea level
const CHUNK = 16;
const CX = WX / CHUNK, CZ = WZ / CHUNK;
const DAY_LEN = 240;                 // seconds per full day
const REACH = 6;

// block ids
const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, CRYSTAL = 4, WOOD = 5, LEAF = 6, SAND = 7, WATER = 8, SHROOM = 9, FRUIT = 10;

const BLOCKS = {
  [GRASS]:   { name: 'Violet turf',    top: 0xb04fd8, side: 0x7a4a9a, bottom: 0x5a3a6a, hard: 0.45, drop: GRASS },
  [DIRT]:    { name: 'Mauve loam',     top: 0x6a4a72, side: 0x604468, bottom: 0x584060, hard: 0.4,  drop: DIRT },
  [STONE]:   { name: 'Teal stone',     top: 0x4a7a80, side: 0x40707a, bottom: 0x386068, hard: 1.3,  drop: STONE },
  [CRYSTAL]: { name: 'Sunshard',       top: 0x6af2e0, side: 0x4ad8cc, bottom: 0x3ac0b8, hard: 2.0,  drop: CRYSTAL, glow: true },
  [WOOD]:    { name: 'Spire-wood',     top: 0x8a5a9a, side: 0x74477e, bottom: 0x5a3a66, hard: 0.8,  drop: WOOD },
  [LEAF]:    { name: 'Glow canopy',    top: 0xff7ae0, side: 0xe860c8, bottom: 0xc850b0, hard: 0.25, drop: LEAF, glow: true },
  [SAND]:    { name: 'Pearl sand',     top: 0xd8cce8, side: 0xc8bcd8, bottom: 0xb0a4c0, hard: 0.4,  drop: SAND },
  [SHROOM]:  { name: 'Shimmer-shroom', top: 0x7adfff, side: 0x54c4f0, bottom: 0x3aa8d8, hard: 0.2,  drop: SHROOM, glow: true, food: 3 },
  [FRUIT]:   { name: 'Glowfruit',      top: 0xffd24d, side: 0xffb83a, bottom: 0xe0a030, hard: 0.2,  drop: FRUIT, glow: true, food: 4 },
};
const PLACEABLE = [GRASS, DIRT, STONE, CRYSTAL, WOOD, LEAF, SAND, SHROOM, FRUIT];

// ---------------------------------------------------------- dom
const $ = (id) => document.getElementById(id);
const ui = {
  hearts: $('hearts'), hunger: $('hunger'), hotbar: $('hotbar'),
  crosshair: $('crosshair'), breakring: $('breakring'),
  clock: $('clock'), hint: $('hint'), pops: $('pops'), flash: $('flash'), vignette: $('vignette'),
  overlay: $('overlay'), oTitle: $('o-title'), oSub: $('o-sub'), oControls: $('o-controls'), playBtn: $('playbtn'),
  toast: $('toast'),
};

// ---------------------------------------------------------- tiny synth sfx
let actx = null;
function audioCtx() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (actx && actx.state === 'suspended') actx.resume();
  return actx;
}
function tone(freq, dur, type = 'sine', vol = 0.15, slideTo = 0) {
  const a = audioCtx(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, a.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), a.currentTime + dur);
  g.gain.setValueAtTime(vol, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  o.connect(g); g.connect(a.destination);
  o.start(); o.stop(a.currentTime + dur + 0.02);
}
function noiseHit(dur = 0.12, vol = 0.14, f0 = 300, f1 = 120) {
  const a = audioCtx(); if (!a) return;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource(); src.buffer = buf;
  const flt = a.createBiquadFilter(); flt.type = 'lowpass';
  flt.frequency.setValueAtTime(f0 * 4, a.currentTime);
  flt.frequency.exponentialRampToValueAtTime(f1 * 4, a.currentTime + dur);
  const g = a.createGain(); g.gain.value = vol;
  src.connect(flt); flt.connect(g); g.connect(a.destination); src.start();
}
const sfx = {
  step: () => noiseHit(0.05, 0.03, 200, 120),
  dig: () => noiseHit(0.08, 0.08, 260, 140),
  brk: () => noiseHit(0.16, 0.16, 320, 100),
  place: () => noiseHit(0.1, 0.12, 180, 90),
  eat: () => { tone(300, 0.08, 'square', 0.1, 200); setTimeout(() => tone(260, 0.08, 'square', 0.1, 180), 90); setTimeout(() => tone(340, 0.12, 'square', 0.1, 240), 180); },
  hurt: () => tone(200, 0.2, 'sawtooth', 0.2, 100),
  mobHit: () => { tone(120, 0.12, 'square', 0.2, 70); noiseHit(0.08, 0.1); },
  mobDie: () => { tone(400, 0.3, 'sawtooth', 0.15, 60); noiseHit(0.2, 0.15); },
  hiss: () => tone(1600 + Math.random() * 600, 0.25, 'sawtooth', 0.03, 500),
  splash: () => noiseHit(0.25, 0.12, 500, 200),
  pickup: () => tone(880, 0.08, 'square', 0.08, 1100),
  die: () => { tone(220, 0.6, 'sawtooth', 0.22, 40); noiseHit(0.4, 0.2); },
  dawn: () => { tone(523, 0.2, 'sine', 0.08); setTimeout(() => tone(784, 0.3, 'sine', 0.08), 200); },
};

// ---------------------------------------------------------- three setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x000000, 40, 150);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 600);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// world materials: vertex colors carry the block colors + baked face shading;
// the material color is the global daylight tint (multiplies everything)
const solidMat = new THREE.MeshBasicMaterial({ vertexColors: true });
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true }); // never tinted — glows at night
const waterMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.62, depthWrite: false });

// sky bodies
const skyGroup = new THREE.Group();
scene.add(skyGroup);
const sunMesh = new THREE.Mesh(new THREE.CircleGeometry(14, 20), new THREE.MeshBasicMaterial({ color: 0xfff0c8, fog: false }));
skyGroup.add(sunMesh);
const starGeo = new THREE.BufferGeometry();
{
  const pts = [];
  for (let i = 0; i < 900; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(400);
    if (v.y > -10) pts.push(v.x, v.y, v.z);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
}
const starMat = new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.8, sizeAttenuation: false, fog: false, transparent: true, opacity: 0 });
skyGroup.add(new THREE.Points(starGeo, starMat));
const planet = new THREE.Mesh(new THREE.SphereGeometry(26, 24, 24), new THREE.MeshBasicMaterial({ color: 0x8a6fc0, fog: false, transparent: true, opacity: 0.85 }));
planet.position.set(180, 120, -300);
skyGroup.add(planet);
const pring = new THREE.Mesh(new THREE.TorusGeometry(40, 4, 2, 48), new THREE.MeshBasicMaterial({ color: 0xb0a0e0, fog: false, transparent: true, opacity: 0.7 }));
pring.position.copy(planet.position);
pring.rotation.x = Math.PI / 2.3;
pring.scale.z = 0.12;
skyGroup.add(pring);
const moon2 = new THREE.Mesh(new THREE.SphereGeometry(8, 16, 16), new THREE.MeshBasicMaterial({ color: 0xd8c8f0, fog: false, transparent: true, opacity: 0.8 }));
moon2.position.set(-220, 90, -160);
skyGroup.add(moon2);

// ---------------------------------------------------------- rng + noise
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
let seed = Math.floor(Math.random() * 1e9);
try {
  const q = new URLSearchParams(location.search).get('seed');
  if (q) seed = parseInt(q, 10) || seed;
} catch (e) {}
const rng = mulberry32(seed);

// value noise on a coarse grid
function makeNoise(cell, amp, r) {
  const gw = Math.ceil(WX / cell) + 2, gh = Math.ceil(WZ / cell) + 2;
  const g = [];
  for (let i = 0; i < gw * gh; i++) g.push(r() * amp);
  return (x, z) => {
    const fx = x / cell, fz = z / cell;
    const x0 = Math.floor(fx), z0 = Math.floor(fz);
    const tx = fx - x0, tz = fz - z0;
    const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
    const i = (xx, zz) => g[(zz + 1) * gw + (xx + 1)];
    const a = i(x0, z0), b = i(x0 + 1, z0), c = i(x0, z0 + 1), d = i(x0 + 1, z0 + 1);
    return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
  };
}

// ---------------------------------------------------------- world data
const blocks = new Uint8Array(WX * WY * WZ);
const B = (x, y, z) => (y * WZ + z) * WX + x;
function getBlock(x, y, z) {
  x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
  if (x < 0 || x >= WX || y < 0 || y >= WY || z < 0 || z >= WZ) return y < 1 ? STONE : AIR;
  return blocks[B(x, y, z)];
}
function isSolid(id) { return id !== AIR && id !== WATER; }

const heightMap = new Int16Array(WX * WZ);

function genWorld() {
  const n1 = makeNoise(31, 14, rng);
  const n2 = makeNoise(11, 6, rng);
  const n3 = makeNoise(5, 2.4, rng);
  for (let x = 0; x < WX; x++) {
    for (let z = 0; z < WZ; z++) {
      // island falloff so the world reads as a floating shard of alien land
      const dx = (x - WX / 2) / (WX / 2), dz = (z - WZ / 2) / (WZ / 2);
      const fall = Math.max(0, 1 - (dx * dx + dz * dz) * 0.9);
      let h = Math.floor(6 + (n1(x, z) + n2(x, z) + n3(x, z)) * fall);
      h = Math.max(2, Math.min(WY - 10, h));
      heightMap[z * WX + x] = h;
      for (let y = 0; y <= h; y++) {
        let id = STONE;
        if (y === h) id = h <= WATER_Y + 1 ? SAND : GRASS;
        else if (y >= h - 3) id = h <= WATER_Y + 1 ? SAND : DIRT;
        blocks[B(x, y, z)] = id;
      }
      for (let y = h + 1; y <= WATER_Y; y++) blocks[B(x, y, z)] = WATER;
    }
  }
  // crystal veins
  for (let v = 0; v < 90; v++) {
    let x = 4 + Math.floor(rng() * (WX - 8));
    let z = 4 + Math.floor(rng() * (WZ - 8));
    let y = 2 + Math.floor(rng() * 14);
    for (let k = 0; k < 4 + rng() * 5; k++) {
      if (getBlock(x, y, z) === STONE) blocks[B(x, y, z)] = CRYSTAL;
      x += Math.floor(rng() * 3) - 1;
      y += Math.floor(rng() * 3) - 1;
      z += Math.floor(rng() * 3) - 1;
      x = Math.max(1, Math.min(WX - 2, x)); y = Math.max(1, Math.min(20, y)); z = Math.max(1, Math.min(WZ - 2, z));
    }
  }
  // spire-wood trees with glow canopies + fruit
  for (let t = 0; t < 110; t++) {
    const x = 3 + Math.floor(rng() * (WX - 6));
    const z = 3 + Math.floor(rng() * (WZ - 6));
    const h = heightMap[z * WX + x];
    if (getBlock(x, h, z) !== GRASS) continue;
    const th = 4 + Math.floor(rng() * 4);
    if (h + th + 3 >= WY) continue;
    for (let y = h + 1; y <= h + th; y++) blocks[B(x, y, z)] = WOOD;
    for (let ox = -2; ox <= 2; ox++) {
      for (let oz = -2; oz <= 2; oz++) {
        for (let oy = 0; oy <= 2; oy++) {
          const r2 = ox * ox + oz * oz + oy * oy;
          if (r2 > 5.5) continue;
          const bx = x + ox, by = h + th + oy, bz = z + oz;
          if (getBlock(bx, by, bz) === AIR) {
            blocks[B(bx, by, bz)] = rng() < 0.07 ? FRUIT : LEAF;
          }
        }
      }
    }
  }
  // shimmer-shrooms on open turf
  for (let s = 0; s < 60; s++) {
    const x = 2 + Math.floor(rng() * (WX - 4));
    const z = 2 + Math.floor(rng() * (WZ - 4));
    const h = heightMap[z * WX + x];
    if (getBlock(x, h, z) === GRASS && getBlock(x, h + 1, z) === AIR) blocks[B(x, h + 1, z)] = SHROOM;
  }
}

// ---------------------------------------------------------- chunk meshing
const chunks = []; // [cz][cx] = { solid, glow, water }
const FACES = [
  { dir: [0, 1, 0],  corners: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], shade: 1.0, key: 'top' },
  { dir: [0, -1, 0], corners: [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]], shade: 0.5, key: 'bottom' },
  { dir: [1, 0, 0],  corners: [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]], shade: 0.8, key: 'side' },
  { dir: [-1, 0, 0], corners: [[0, 0, 1], [0, 0, 0], [0, 1, 0], [0, 1, 1]], shade: 0.7, key: 'side' },
  { dir: [0, 0, 1],  corners: [[1, 0, 1], [0, 0, 1], [0, 1, 1], [1, 1, 1]], shade: 0.85, key: 'side' },
  { dir: [0, 0, -1], corners: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], shade: 0.65, key: 'side' },
];
const _c = new THREE.Color();

function buildChunk(cx, cz) {
  const pos = [], col = [], idx = [];
  const gpos = [], gcol = [], gidx = [];
  const wpos = [], wcol = [], widx = [];
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  for (let x = x0; x < x0 + CHUNK; x++) {
    for (let z = z0; z < z0 + CHUNK; z++) {
      for (let y = 0; y < WY; y++) {
        const id = blocks[B(x, y, z)];
        if (id === AIR) continue;
        const def = BLOCKS[id];
        if (id === WATER) {
          // only render the surface of water against air
          if (getBlock(x, y + 1, z) === AIR) {
            const base = wpos.length / 3;
            for (const c of FACES[0].corners) wpos.push(x + c[0], y + 0.88, z + c[2]);
            _c.set(0x3a6fd8);
            for (let k = 0; k < 4; k++) wcol.push(_c.r, _c.g, _c.b);
            widx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
          continue;
        }
        const P2 = def.glow ? gpos : pos, C2 = def.glow ? gcol : col, I2 = def.glow ? gidx : idx;
        for (const f of FACES) {
          const nb = getBlock(x + f.dir[0], y + f.dir[1], z + f.dir[2]);
          if (isSolid(nb)) continue;
          const base = P2.length / 3;
          for (const c of f.corners) P2.push(x + c[0], y + c[1], z + c[2]);
          _c.set(def[f.key === 'top' ? 'top' : f.key === 'bottom' ? 'bottom' : 'side']);
          const grain = 0.92 + ((x * 7 + y * 13 + z * 5) % 7) * 0.013; // subtle per-block variation
          const sh = f.shade * grain * (def.glow ? 1 : 1);
          for (let k = 0; k < 4; k++) C2.push(_c.r * sh, _c.g * sh, _c.b * sh);
          I2.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
  }
  function toMesh(p, c2, i2, mat) {
    if (!i2.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(c2, 3));
    g.setIndex(i2);
    const m = new THREE.Mesh(g, mat);
    scene.add(m);
    return m;
  }
  return {
    solid: toMesh(pos, col, idx, solidMat),
    glow: toMesh(gpos, gcol, gidx, glowMat),
    water: toMesh(wpos, wcol, widx, waterMat),
  };
}

function disposeChunk(ch) {
  for (const k of ['solid', 'glow', 'water']) {
    if (ch[k]) { scene.remove(ch[k]); ch[k].geometry.dispose(); }
  }
}

function rebuildChunk(cx, cz) {
  if (cx < 0 || cx >= CX || cz < 0 || cz >= CZ) return;
  disposeChunk(chunks[cz][cx]);
  chunks[cz][cx] = buildChunk(cx, cz);
}

function rebuildAll() {
  for (let cz = 0; cz < CZ; cz++) {
    chunks[cz] = chunks[cz] || [];
    for (let cx = 0; cx < CX; cx++) {
      if (chunks[cz][cx]) disposeChunk(chunks[cz][cx]);
      chunks[cz][cx] = buildChunk(cx, cz);
    }
  }
}

function setBlock(x, y, z, id) {
  x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
  if (x < 0 || x >= WX || y < 1 || y >= WY || z < 0 || z >= WZ) return;
  blocks[B(x, y, z)] = id;
  const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
  rebuildChunk(cx, cz);
  if (x % CHUNK === 0) rebuildChunk(cx - 1, cz);
  if (x % CHUNK === CHUNK - 1) rebuildChunk(cx + 1, cz);
  if (z % CHUNK === 0) rebuildChunk(cx, cz - 1);
  if (z % CHUNK === CHUNK - 1) rebuildChunk(cx, cz + 1);
}

// ---------------------------------------------------------- player
const P = {
  pos: new THREE.Vector3(WX / 2 + 0.5, 30, WZ / 2 + 0.5), // feet position
  vel: new THREE.Vector3(),
  onGround: false, inWater: false,
  hp: 20, hunger: 20, dead: false,
  sel: 0,
  state: 'menu',
};
const INV = []; // 9 slots {id, count}
for (let i = 0; i < 9; i++) INV.push(null);

let yaw = 0, pitch = -0.1;
let elapsed = 0;
let dayT = 0.28; // start mid-morning
let pointerLocked = false;
const keys = {};
let stepT = 0, hurtCd = 0, hungerT = 0, starveT = 0, swimT = 0;
let mining = null; // { x,y,z, t, need }
let mouseDown = false;

function surfaceY(x, z) {
  for (let y = WY - 1; y > 0; y--) {
    if (isSolid(getBlock(x, y, z))) return y + 1;
  }
  return WATER_Y + 1;
}

function spawnPlayer() {
  // spawn on open terrain near the center — not in the sea, not up a tree
  let sx = WX / 2, sz = WZ / 2;
  outer:
  for (let r = 0; r < 40; r += 2) {
    for (let a = 0; a < Math.PI * 2; a += 0.6) {
      const x = Math.floor(WX / 2 + Math.cos(a) * r);
      const z = Math.floor(WZ / 2 + Math.sin(a) * r);
      const h = heightMap[z * WX + x];
      if (h > WATER_Y + 1 && getBlock(x, h, z) === GRASS && getBlock(x, h + 1, z) === AIR && getBlock(x, h + 2, z) === AIR) {
        sx = x; sz = z;
        break outer;
      }
    }
  }
  P.pos.set(sx + 0.5, heightMap[sz * WX + sx] + 1.2, sz + 0.5);
  P.vel.set(0, 0, 0);
  P.hp = 20; P.hunger = 20; P.dead = false;
}

// AABB voxel collision, axis by axis. Player is 0.6 wide, 1.8 tall.
const HALF = 0.3, HEIGHT = 1.8;
function collideAxis(axis, delta) {
  P.pos[axis] += delta;
  const minX = Math.floor(P.pos.x - HALF), maxX = Math.floor(P.pos.x + HALF);
  const minY = Math.floor(P.pos.y), maxY = Math.floor(P.pos.y + HEIGHT - 0.01);
  const minZ = Math.floor(P.pos.z - HALF), maxZ = Math.floor(P.pos.z + HALF);
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        if (!isSolid(getBlock(x, y, z))) continue;
        if (axis === 'x') {
          P.pos.x = delta > 0 ? x - HALF - 0.001 : x + 1 + HALF + 0.001;
          P.vel.x = 0;
        } else if (axis === 'z') {
          P.pos.z = delta > 0 ? z - HALF - 0.001 : z + 1 + HALF + 0.001;
          P.vel.z = 0;
        } else {
          if (delta > 0) { P.pos.y = y - HEIGHT - 0.001; P.vel.y = 0; }
          else {
            const impact = -P.vel.y;
            P.pos.y = y + 1;
            P.vel.y = 0;
            P.onGround = true;
            if (impact > 14 && !P.inWater) {
              damage(Math.floor((impact - 12) * 0.8), 'the fall');
            }
          }
        }
        return;
      }
    }
  }
}

function updatePlayer(dt) {
  const eyeBlock = getBlock(P.pos.x, P.pos.y + 1.2, P.pos.z);
  const feetBlock = getBlock(P.pos.x, P.pos.y + 0.2, P.pos.z);
  P.inWater = feetBlock === WATER || eyeBlock === WATER;

  let mvF = 0, mvS = 0;
  if (!P.dead) {
    if (keys['KeyW'] || keys['ArrowUp']) mvF += 1;
    if (keys['KeyS'] || keys['ArrowDown']) mvF -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) mvS += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) mvS -= 1;
  }
  const sprint = (keys['ShiftLeft'] || keys['ShiftRight']) && P.hunger > 3;
  const speed = (P.inWater ? 3 : sprint ? 7.2 : 4.6);
  _v1.set(Math.sin(yaw), 0, -Math.cos(yaw));
  _v2.set(_v1.z, 0, -_v1.x); // left
  const ax = (_v1.x * mvF - _v2.x * mvS);
  const az = (_v1.z * mvF - _v2.z * mvS);
  const l = Math.hypot(ax, az) || 1;
  const tx = ax / l * speed, tz = az / l * speed;
  const accel = P.onGround ? 14 : 5;
  P.vel.x += (tx - P.vel.x) * Math.min(1, accel * dt);
  P.vel.z += (tz - P.vel.z) * Math.min(1, accel * dt);

  if (P.inWater) {
    P.vel.y -= 6 * dt;
    P.vel.y *= (1 - 1.8 * dt);
    if (keys['Space'] && !P.dead) P.vel.y += 16 * dt;
    swimT -= dt;
    if ((mvF || mvS) && swimT <= 0) { swimT = 0.6; sfx.splash(); }
  } else {
    P.vel.y -= 26 * dt;
    if (keys['Space'] && P.onGround && !P.dead) { P.vel.y = 9; P.onGround = false; sfx.step(); }
  }

  P.onGround = false;
  collideAxis('y', P.vel.y * dt);
  collideAxis('x', P.vel.x * dt);
  collideAxis('z', P.vel.z * dt);

  if (P.pos.y < -8) { damage(99, 'the void'); }

  if ((mvF || mvS) && P.onGround) {
    stepT -= dt * (sprint ? 1.5 : 1);
    if (stepT <= 0) { stepT = 0.38; sfx.step(); }
  }

  // hunger
  hungerT += dt * (sprint && (mvF || mvS) ? 2.2 : 1);
  if (hungerT > 20) {
    hungerT = 0;
    if (P.hunger > 0) P.hunger -= 1;
  }
  if (P.hunger <= 0) {
    starveT += dt;
    if (starveT > 3) { starveT = 0; damage(1, 'starvation'); }
  } else if (P.hunger >= 18 && P.hp < 20) {
    starveT += dt;
    if (starveT > 4) { starveT = 0; P.hp = Math.min(20, P.hp + 1); }
  }
  hurtCd = Math.max(0, hurtCd - dt);
}

function damage(n, source) {
  if (P.dead || n <= 0) return;
  P.hp -= n;
  sfx.hurt();
  ui.flash.classList.remove('on');
  void ui.flash.offsetWidth;
  ui.flash.classList.add('on');
  if (P.hp <= 0) {
    P.hp = 0;
    P.dead = true;
    sfx.die();
    ui.oTitle.textContent = 'YOU DIED';
    ui.oSub.innerHTML = `Claimed by ${source} on day ${Math.floor(elapsed / DAY_LEN) + 1}.<br>Your scattered belongings forgive you. (Inventory kept.)`;
    ui.oControls.classList.add('hidden');
    ui.playBtn.textContent = 'RESPAWN';
    ui.overlay.classList.remove('hidden');
    if (document.exitPointerLock) document.exitPointerLock();
  }
}

// ---------------------------------------------------------- inventory
function addItem(id, n = 1) {
  for (let i = 0; i < 9; i++) {
    if (INV[i] && INV[i].id === id && INV[i].count < 99) { INV[i].count += n; renderHotbar(); return true; }
  }
  for (let i = 0; i < 9; i++) {
    if (!INV[i]) { INV[i] = { id, count: n }; renderHotbar(); return true; }
  }
  return false;
}

function renderHotbar() {
  ui.hotbar.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const slot = document.createElement('div');
    slot.className = 'slot' + (i === P.sel ? ' sel' : '');
    const it = INV[i];
    if (it) {
      const chip = document.createElement('div');
      chip.className = 'chip';
      const def = BLOCKS[it.id];
      chip.style.background = '#' + new THREE.Color(def.top).getHexString();
      chip.style.boxShadow = def.glow ? '0 0 8px #' + new THREE.Color(def.top).getHexString() : 'none';
      slot.appendChild(chip);
      const n = document.createElement('span');
      n.className = 'count';
      n.textContent = it.count;
      slot.appendChild(n);
      slot.title = def.name;
    }
    ui.hotbar.appendChild(slot);
  }
  const it = INV[P.sel];
  ui.toast.textContent = it ? BLOCKS[it.id].name + (BLOCKS[it.id].food ? ' — right-click to EAT' : '') : '';
}

// ---------------------------------------------------------- block targeting
function raycastBlock() {
  const eye = _v1.set(P.pos.x, P.pos.y + 1.62, P.pos.z);
  const dir = _v2.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  let px = Math.floor(eye.x), py = Math.floor(eye.y), pz = Math.floor(eye.z);
  for (let t = 0; t < REACH; t += 0.04) {
    const x = Math.floor(eye.x + dir.x * t);
    const y = Math.floor(eye.y + dir.y * t);
    const z = Math.floor(eye.z + dir.z * t);
    if (x !== px || y !== py || pz !== z) {
      const id = getBlock(x, y, z);
      if (isSolid(id)) return { x, y, z, id, nx: px, ny: py, nz: pz };
      px = x; py = y; pz = z;
    }
  }
  return null;
}

const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
  new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })
);
highlight.visible = false;
scene.add(highlight);

function breakBlock(hit) {
  const def = BLOCKS[hit.id];
  setBlock(hit.x, hit.y, hit.z, AIR);
  if (def && def.drop) { addItem(def.drop); sfx.pickup(); }
  sfx.brk();
  spawnDebris(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, def ? def.top : 0xffffff);
}

function placeBlock(hit) {
  const it = INV[P.sel];
  if (!it || !PLACEABLE.includes(it.id)) return;
  const x = hit.nx, y = hit.ny, z = hit.nz;
  if (y < 1 || y >= WY) return;
  // don't place inside yourself
  if (x + 1 > P.pos.x - HALF && x < P.pos.x + HALF &&
      z + 1 > P.pos.z - HALF && z < P.pos.z + HALF &&
      y + 1 > P.pos.y && y < P.pos.y + HEIGHT) return;
  if (isSolid(getBlock(x, y, z))) return;
  setBlock(x, y, z, it.id);
  it.count -= 1;
  if (it.count <= 0) INV[P.sel] = null;
  renderHotbar();
  sfx.place();
}

function tryEat() {
  const it = INV[P.sel];
  if (!it) return false;
  const def = BLOCKS[it.id];
  if (!def.food) return false;
  if (P.hunger >= 20) { ui.toast.textContent = 'You are full.'; return true; }
  P.hunger = Math.min(20, P.hunger + def.food);
  it.count -= 1;
  if (it.count <= 0) INV[P.sel] = null;
  renderHotbar();
  sfx.eat();
  viewKick = 0.5;
  return true;
}

// debris particles
const debris = [];
for (let i = 0; i < 40; i++) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  m.visible = false;
  scene.add(m);
  debris.push({ mesh: m, vel: new THREE.Vector3(), life: 0 });
}
let dIdx = 0;
function spawnDebris(x, y, z, color) {
  for (let i = 0; i < 8; i++) {
    const p = debris[dIdx = (dIdx + 1) % debris.length];
    p.mesh.visible = true;
    p.mesh.material.color.set(color);
    p.mesh.position.set(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6);
    p.vel.set((Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4);
    p.life = 0.6;
  }
}
function updateDebris(dt) {
  for (const p of debris) {
    if (p.life <= 0) { p.mesh.visible = false; continue; }
    p.life -= dt;
    p.vel.y -= 18 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.rotation.x += 8 * dt;
  }
}

// ---------------------------------------------------------- skitters (night mobs)
const mobs = [];
function makeSkitter() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), new THREE.MeshBasicMaterial({ color: 0x2a1a3a }));
  body.scale.y = 0.7;
  body.position.y = 0.34;
  g.add(body);
  for (const sx of [-0.16, 0.16]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff4040 }));
    eye.position.set(sx, 0.45, 0.32);
    g.add(eye);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.5, 4), new THREE.MeshBasicMaterial({ color: 0x1a1028 }));
    leg.position.set(Math.cos(a) * 0.38, 0.2, Math.sin(a) * 0.38);
    leg.rotation.z = Math.cos(a) * 0.7;
    leg.rotation.x = -Math.sin(a) * 0.7;
    g.add(leg);
  }
  scene.add(g);
  return g;
}

function spawnSkitter(nearX, nearZ) {
  if (mobs.length >= 7) return null;
  for (let tries = 0; tries < 8; tries++) {
    const a = Math.random() * Math.PI * 2;
    const r = 16 + Math.random() * 18;
    const x = Math.max(2, Math.min(WX - 2, Math.floor(nearX + Math.cos(a) * r)));
    const z = Math.max(2, Math.min(WZ - 2, Math.floor(nearZ + Math.sin(a) * r)));
    const y = surfaceY(x, z);
    if (y <= WATER_Y + 1) continue;
    const mob = { group: makeSkitter(), hp: 3, hitCd: 0, hissT: Math.random() * 4, dead: false, deadT: 0 };
    mob.group.position.set(x + 0.5, y, z + 0.5);
    mobs.push(mob);
    return mob;
  }
  return null;
}

function isNight() { const s = Math.sin(dayT * Math.PI * 2); return s < -0.08; }

let mobSpawnT = 0;
function updateMobs(dt) {
  mobSpawnT -= dt;
  if (isNight() && mobSpawnT <= 0 && !P.dead) {
    mobSpawnT = 5 + Math.random() * 6;
    spawnSkitter(P.pos.x, P.pos.z);
  }
  for (let i = mobs.length - 1; i >= 0; i--) {
    const m = mobs[i];
    const g = m.group;
    if (m.dead) {
      m.deadT -= dt;
      g.scale.setScalar(Math.max(0.01, m.deadT * 2));
      if (m.deadT <= 0) { scene.remove(g); mobs.splice(i, 1); }
      continue;
    }
    // daylight burns them off
    if (!isNight()) {
      m.dead = true; m.deadT = 0.5;
      spawnDebris(g.position.x, g.position.y + 0.4, g.position.z, 0x2a1a3a);
      continue;
    }
    const dx = P.pos.x - g.position.x, dz = P.pos.z - g.position.z;
    const d = Math.hypot(dx, dz);
    m.hissT -= dt;
    if (d < 24 && m.hissT <= 0) { m.hissT = 3 + Math.random() * 3; sfx.hiss(); }
    if (d > 0.5 && d < 40 && !P.dead) {
      const sp = 2.6;
      const nx = g.position.x + dx / d * sp * dt;
      const nz = g.position.z + dz / d * sp * dt;
      const ny = surfaceY(nx, nz);
      if (ny - g.position.y < 1.5) {
        g.position.x = nx; g.position.z = nz;
        g.position.y += (ny - g.position.y) * Math.min(1, 10 * dt);
      }
      g.rotation.y = Math.atan2(dx, dz);
      g.position.y += Math.sin(elapsed * 14 + i) * 0.008;
    }
    m.hitCd -= dt;
    if (d < 1.3 && Math.abs(g.position.y - P.pos.y) < 2 && m.hitCd <= 0 && !P.dead) {
      m.hitCd = 1.4;
      damage(3, 'a skitter');
      P.vel.x += dx / d * 6;
      P.vel.z += dz / d * 6;
    }
  }
}

function punchMob() {
  // nearest mob within reach, roughly ahead
  const dir = _v2.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  let bestM = null, bd = 3.6;
  for (const m of mobs) {
    if (m.dead) continue;
    _v1.copy(m.group.position).sub(P.pos).sub(_v3.set(0, 1.4, 0));
    const d = _v1.length();
    if (d > bd) continue;
    _v1.divideScalar(d || 1);
    if (_v1.dot(dir) < 0.4) continue;
    bd = d; bestM = m;
  }
  if (!bestM) return false;
  bestM.hp -= 1;
  sfx.mobHit();
  viewKick = 0.4;
  const g = bestM.group;
  _v1.copy(g.position).sub(P.pos).setY(0).normalize();
  g.position.addScaledVector(_v1, 0.8);
  if (bestM.hp <= 0) {
    bestM.dead = true;
    bestM.deadT = 0.5;
    sfx.mobDie();
    spawnDebris(g.position.x, g.position.y + 0.4, g.position.z, 0x2a1a3a);
    addItem(FRUIT, 1 + (Math.random() < 0.5 ? 1 : 0)); // they're full of stolen glowfruit
    sfx.pickup();
  }
  return true;
}

// ---------------------------------------------------------- viewmodel (your hand/held block)
const viewGroup = new THREE.Group();
camera.add(viewGroup);
scene.add(camera);
const handBlock = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), new THREE.MeshBasicMaterial({ color: 0xb04fd8 }));
const handFist = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshBasicMaterial({ color: 0x9a6ff0 }));
viewGroup.add(handBlock);
viewGroup.add(handFist);
viewGroup.position.set(0.42, -0.38, -0.7);
let viewKick = 0;

function updateViewmodel(dt) {
  const it = INV[P.sel];
  handBlock.visible = !!it;
  handFist.visible = !it;
  if (it) handBlock.material.color.set(BLOCKS[it.id].top);
  const moving = (keys['KeyW'] || keys['KeyA'] || keys['KeyS'] || keys['KeyD']) && P.onGround;
  const bob = moving ? Math.sin(elapsed * 9) * 0.02 : Math.sin(elapsed * 1.8) * 0.006;
  viewKick = Math.max(0, viewKick - dt * 4);
  const swing = (mouseDown || viewKick > 0) ? Math.sin(elapsed * 22) * 0.09 : 0;
  viewGroup.position.set(0.42, -0.38 + bob - viewKick * 0.1 + swing * 0.4, -0.7 - swing);
  viewGroup.rotation.z = swing * 1.4;
  viewGroup.rotation.x = swing * 0.8;
}

// ---------------------------------------------------------- day / night
const dayCol = { sky: new THREE.Color(0xc2a4e8), fog: new THREE.Color(0xc2a4e8), tint: new THREE.Color(0xffffff) };
const duskCol = { sky: new THREE.Color(0xe07a5f), fog: new THREE.Color(0xd88a70), tint: new THREE.Color(0xd0a090) };
const nightCol = { sky: new THREE.Color(0x0b0820), fog: new THREE.Color(0x0e0a26), tint: new THREE.Color(0x4a5080) };
const _sky = new THREE.Color(), _fog = new THREE.Color(), _tint = new THREE.Color();

function updateDay(dt) {
  dayT = (dayT + dt / DAY_LEN) % 1;
  const s = Math.sin(dayT * Math.PI * 2); // 1 = noon, -1 = midnight
  let a, b, k;
  if (s > 0.25) { a = dayCol; b = dayCol; k = 0; }
  else if (s > -0.08) { a = duskCol; b = dayCol; k = (s + 0.08) / 0.33; }
  else { a = nightCol; b = duskCol; k = Math.min(1, (s + 0.08) / -0.5); k = 1 - k; }
  _sky.lerpColors(a.sky, b.sky, k);
  _fog.lerpColors(a.fog, b.fog, k);
  _tint.lerpColors(a.tint, b.tint, k);
  scene.background = _sky;
  scene.fog.color.copy(_fog);
  solidMat.color.copy(_tint);
  waterMat.color.copy(_tint);
  starMat.opacity = THREE.MathUtils.clamp(-s * 1.8, 0, 0.9);
  // sun path
  const ang = dayT * Math.PI * 2 - Math.PI / 2;
  sunMesh.position.set(Math.cos(ang) * 300, Math.sin(ang) * 300, -120);
  sunMesh.lookAt(camera.position);
  sunMesh.visible = Math.sin(ang) > -0.15;
  const hour = Math.floor(dayT * 24), min = Math.floor((dayT * 24 % 1) * 60);
  ui.clock.textContent = `${isNight() ? '🌙' : '☀️'} ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')} · day ${Math.floor(elapsed / DAY_LEN) + 1}`;
}

// ---------------------------------------------------------- HUD
function heartsRow(el, n, full, empty) {
  let s = '';
  const units = Math.ceil(n / 2); // 10 icons represent 20 points
  for (let i = 0; i < 10; i++) s += i < units ? full : empty;
  el.textContent = s;
}
function updateHUD() {
  heartsRow(ui.hearts, P.hp, '💜', '🖤');
  heartsRow(ui.hunger, P.hunger, '🍖', '·');
  if (mining) {
    ui.breakring.classList.remove('hidden');
    ui.breakring.style.background = `conic-gradient(#ffe14d ${Math.min(1, mining.t / mining.need) * 360}deg, rgba(255,255,255,0.15) 0deg)`;
  } else {
    ui.breakring.classList.add('hidden');
  }
}

// ---------------------------------------------------------- pointer lock + input
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

function requestLock() {
  const el = renderer.domElement;
  if (el.requestPointerLock) { try { el.requestPointerLock(); } catch (e) {} }
}
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
});
window.addEventListener('mousemove', (ev) => {
  if (pointerLocked && !P.dead) {
    yaw += ev.movementX * 0.0024;
    pitch = THREE.MathUtils.clamp(pitch - ev.movementY * 0.0022, -1.5, 1.5);
  }
});
window.addEventListener('keydown', (ev) => {
  keys[ev.code] = true;
  if (ev.code === 'Space') ev.preventDefault();
  const m = ev.code.match(/^Digit([1-9])$/);
  if (m) { P.sel = parseInt(m[1], 10) - 1; renderHotbar(); }
});
window.addEventListener('keyup', (ev) => { keys[ev.code] = false; });
window.addEventListener('wheel', (ev) => {
  if (P.state !== 'play') return;
  P.sel = (P.sel + (ev.deltaY > 0 ? 1 : 8)) % 9;
  renderHotbar();
});
renderer.domElement.addEventListener('contextmenu', (ev) => ev.preventDefault());
renderer.domElement.addEventListener('pointerdown', (ev) => {
  audioCtx();
  if (P.state !== 'play' || P.dead) return;
  if (!pointerLocked) requestLock();
  if (ev.button === 0) {
    mouseDown = true;
    if (punchMob()) return;
  } else if (ev.button === 2) {
    if (tryEat()) return;
    const hit = raycastBlock();
    if (hit) placeBlock(hit);
  }
});
window.addEventListener('pointerup', (ev) => {
  if (ev.button === 0) { mouseDown = false; mining = null; }
});

ui.playBtn.addEventListener('click', () => {
  audioCtx();
  if (P.dead) {
    spawnPlayer();
    ui.overlay.classList.add('hidden');
    requestLock();
    return;
  }
  P.state = 'play';
  ui.overlay.classList.add('hidden');
  ui.hint.textContent = 'Hold LEFT CLICK to mine · RIGHT CLICK to place (or eat food) · 1-9 hotbar · survive the night';
  ui.hint.classList.remove('hidden');
  setTimeout(() => ui.hint.classList.add('hidden'), 9000);
  requestLock();
});

// ---------------------------------------------------------- mining loop
function updateMining(dt) {
  if (!mouseDown || P.dead) { mining = null; return; }
  const hit = raycastBlock();
  if (!hit) { mining = null; return; }
  if (!mining || mining.x !== hit.x || mining.y !== hit.y || mining.z !== hit.z) {
    mining = { x: hit.x, y: hit.y, z: hit.z, t: 0, need: BLOCKS[hit.id] ? BLOCKS[hit.id].hard : 1 };
  }
  mining.t += dt;
  if (Math.floor(mining.t * 8) !== Math.floor((mining.t - dt) * 8)) sfx.dig();
  if (mining.t >= mining.need) {
    breakBlock(hit);
    mining = null;
  }
}

// ---------------------------------------------------------- main loop
const clock = new THREE.Clock();

function frame() {
  const dt = Math.min(clock.getDelta(), 0.06);

  if (P.state === 'play') {
    elapsed += dt;
    updateDay(dt);
    if (!P.dead) {
      updatePlayer(dt);
      updateMining(dt);
    }
    updateMobs(dt);
    updateDebris(dt);
    updateViewmodel(dt);

    // camera = eyes (yaw/pitch match the raycast direction exactly)
    camera.position.set(P.pos.x, P.pos.y + 1.62, P.pos.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = -yaw;
    camera.rotation.x = pitch;
    camera.rotation.z = 0;

    // underwater tint
    const eyeIn = getBlock(P.pos.x, P.pos.y + 1.55, P.pos.z) === WATER;
    ui.vignette.classList.toggle('water', eyeIn);

    // block highlight
    const hit = P.dead ? null : raycastBlock();
    if (hit) {
      highlight.visible = true;
      highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    } else highlight.visible = false;

    skyGroup.position.set(camera.position.x, 0, camera.position.z);
    updateHUD();
  } else {
    // menu: slow orbit over the world
    elapsed += dt;
    updateDay(dt * 0.2);
    const a = elapsed * 0.05;
    const cx2 = WX / 2, cz2 = WZ / 2;
    camera.position.set(cx2 + Math.cos(a) * 60, 42, cz2 + Math.sin(a) * 60);
    camera.rotation.order = 'YXZ';
    camera.lookAt(cx2, 16, cz2);
    skyGroup.position.set(camera.position.x, 0, camera.position.z);
  }

  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame);

// ---------------------------------------------------------- boot
genWorld();
rebuildAll();
spawnPlayer();
renderHotbar();

// starter kit
addItem(WOOD, 6);
addItem(FRUIT, 3);

// exposed for automated smoke tests
window.__game = P;
window.__debug = {
  P, INV, mobs, getBlock, setBlock, breakBlock, placeBlock: (hit) => placeBlock(hit),
  raycastBlock, surfaceY, addItem, tryEat, punchMob, spawnSkitter,
  setYawPitch: (y, p2) => { yaw = y; pitch = p2; },
  setDayT: (t) => { dayT = t; },
  dayT: () => dayT, isNight, seed,
  damage, spawnPlayer,
  keys,
};

/* CUTLASS — 3D pixel-art parkour PvP arena mode. Three.js r147.
   Exposed as window.__ARENA(); invoked by the mode-select screen. */
window.__ARENA = () => {
'use strict';

// ============================== CONSTANTS ==================================
const STEP = 1 / 60;
const GRAV = -30, FALL_MAX = -36;
const SPEED = 8.5, ACC_GROUND = 12, ACC_AIR = 4.5;
const JUMP_V = 11.6, AIRJUMP_V = 10.6, MAX_AIR_JUMPS = 2;
const COYOTE = 0.12, JUMP_BUF = 0.14, WALLJUMP_V = 10.8, WALLPUSH = 7.5;
const GRAPPLE_RANGE = 48, GRAPPLE_PULL = 34, GRAPPLE_REEL = 11, GRAPPLE_MIN = 2.6;
const SWING_DUR = 0.42, SWING_ACTIVE_A = 0.10, SWING_ACTIVE_B = 0.30, ATK_CD = 0.62;
const HIT_RANGE = 3.3, HIT_ARC = 1.15, PLAYER_DMG = 34, BOT_DMG = 16;
const KILL_Y = -20, MATCH_LEN = 180;
const BOT_NAMES = ['Bonez', 'Salty', 'Redbeard', 'Gully', 'Marrow'];

const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
if (IS_TOUCH) document.body.classList.add('touch');

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

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
  swing()  { noise(0.16, 0.30, 2400); },
  hit()    { tone(200, 60, 0.16, 'sawtooth', 0.16); noise(0.1, 0.25, 900); },
  hurt()   { tone(160, 50, 0.25, 'sawtooth', 0.14); },
  ko()     { tone(300, 30, 0.5, 'sawtooth', 0.2); noise(0.35, 0.3, 500); },
  grap()   { tone(700, 1400, 0.1, 'square', 0.07); },
  hook()   { tone(1200, 500, 0.09, 'square', 0.08); },
  land()   { noise(0.08, 0.15, 500); },
  win()    { tone(440, 880, 0.5, 'square', 0.12); setTimeout(() => tone(660, 1320, 0.6, 'square', 0.1), 180); },
};
window.addEventListener('pointerdown', () => { const c = ac(); if (c && c.state === 'suspended') c.resume(); }, { passive: true });

// ============================== RENDERER ===================================
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x77c4f2);
scene.fog = new THREE.Fog(0x77c4f2, 70, 175);
const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 300);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const pix = Math.max(2, Math.round(w / 440));      // pixelation factor
  renderer.setSize(Math.floor(w / pix), Math.floor(h / pix), false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();

scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x5a4a36, 0.8));
const sun = new THREE.DirectionalLight(0xfff2cf, 0.7);
sun.position.set(40, 70, 25); scene.add(sun);

// ============================== PIXEL TEXTURES =============================
function pixTex(px, fn, repeat) {
  const cv = document.createElement('canvas'); cv.width = cv.height = px;
  const g = cv.getContext('2d'); fn(g, px);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat, repeat);
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
  grass: pixTex(16, (g, p) => speckle(g, p, '#4caf3f', ['#5fc94f', '#3d9432', '#6fdf5e', '#459c3a'], 90)),
  dirt:  pixTex(16, (g, p) => speckle(g, p, '#7a5230', ['#8a6238', '#6a4526', '#93693c', '#5d3c20'], 80)),
  stone: pixTex(16, (g, p) => speckle(g, p, '#8b8f99', ['#9ba0ac', '#767a85', '#a6abb8', '#696d78'], 80)),
  wood:  pixTex(16, (g, p) => {
    speckle(g, p, '#9c6b3a', ['#a9773f', '#8a5c30', '#b0803f'], 40);
    g.fillStyle = '#6f4a24'; for (let y = 3; y < p; y += 4) g.fillRect(0, y, p, 1);
  }),
  gold:  pixTex(8, (g, p) => speckle(g, p, '#f2c14e', ['#ffd96b', '#d9a63a', '#ffe89a'], 20)),
  water: pixTex(32, (g, p) => speckle(g, p, '#2f6fba', ['#3f82d1', '#2a62a6', '#4f95e0', '#77b7ef'], 220), 24),
};
function mat(tex, sx, sy) {
  const t = tex.clone(); t.needsUpdate = true; t.repeat.set(Math.max(1, Math.round(sx / 2)), Math.max(1, Math.round(sy / 2)));
  return new THREE.MeshLambertMaterial({ map: t });
}
const flat = (c) => new THREE.MeshLambertMaterial({ color: c });

// ============================== WORLD ======================================
const solids = [];        // AABBs {min,max}
const raycastables = [];  // meshes for grapple/camera rays
const orbs = [];          // grapple orbs {mesh, pos}
const spawns = [];

function addBox(x, y, z, w, h, d, top, side) {
  // (x,y,z) = center. top/side are textures (side defaults to top).
  side = side || top;
  const geo = new THREE.BoxGeometry(w, h, d);
  const sideMat = mat(side, Math.max(w, d), h), topMat = mat(top, w, d);
  const m = new THREE.Mesh(geo, [sideMat, sideMat, topMat, mat(side, w, d), sideMat, sideMat]);
  m.position.set(x, y, z);
  scene.add(m); raycastables.push(m);
  solids.push({ min: V3(x - w / 2, y - h / 2, z - d / 2), max: V3(x + w / 2, y + h / 2, z + d / 2) });
  return m;
}
function addOrb(x, y, z) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshBasicMaterial({ color: 0xffd23e }));
  const ring = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 1.5), flat(0x8a5fc9));
  g.add(core, ring); g.position.set(x, y, z);
  scene.add(g); raycastables.push(core);
  orbs.push({ mesh: g, core, pos: V3(x, y, z), t: Math.random() * 9 });
}

function buildMap() {
  // main island
  addBox(0, -2.5, 0, 36, 5, 36, TEX.grass, TEX.dirt);
  addBox(0, -6.5, 0, 26, 4, 26, TEX.dirt);
  addBox(0, -9.5, 0, 16, 3, 16, TEX.stone);
  // central mast + crow's nest
  addBox(0, 3.5, 0, 1.6, 13, 1.6, TEX.wood);
  addBox(0, 10.6, 0, 7, 1.2, 7, TEX.wood);
  addBox(0, 12.0, 0, 1.2, 1.6, 1.2, TEX.wood);
  // wall-jump alley on main island
  addBox(-9, 3, -10, 10, 6, 1.2, TEX.stone);
  addBox(-9, 3, -4.5, 10, 6, 1.2, TEX.stone);
  // ramparts
  addBox(13, 1.5, 13, 6, 3, 6, TEX.stone);
  addBox(-14, 2, 11, 5, 4, 5, TEX.stone);
  addBox(12, 2.5, -13, 5, 5, 5, TEX.wood);

  // ring islands: [x, topY, z, w, d]
  const isles = [
    [30, 5.5, 8, 13, 13],
    [-28, 8, -14, 11, 11],
    [4, 11, -34, 13, 13],
    [-16, 4.5, 28, 12, 12],
    [32, 13, -22, 8, 8],
    [-34, 12, 16, 8, 8],
    [14, 8, 32, 9, 9],
  ];
  for (const [x, ty, z, w, d] of isles) {
    addBox(x, ty - 1.5, z, w, 3, d, TEX.grass, TEX.dirt);
    addBox(x, ty - 4.2, z, w * 0.55, 2.5, d * 0.55, TEX.dirt);
    spawns.push(V3(x, ty + 1.4, z));
  }
  spawns.push(V3(12, 1.4, 12), V3(-12, 1.4, -12), V3(-12, 1.4, 12), V3(12, 1.4, -12), V3(0, 12.6, 0));

  // stepping stones between main island and ring isles
  const stoneRuns = [
    [[20, 1.5, 4], [24, 3, 6], [27, 4.5, 7]],
    [[-20, 2, -7], [-23, 4, -10], [-26, 6, -12]],
    [[2, 2, -20], [3, 4.5, -24], [4, 7, -28], [4, 9.5, -31]],
    [[-9, 1.5, 19], [-12, 2.5, 22], [-14, 3.5, 25]],
    [[8, 2, 20], [10, 4, 24], [12, 6, 28]],
    [[31, 7.5, -2], [32, 9.5, -8], [32, 11.5, -14]],
    [[-30, 9.5, -4], [-32, 10.5, 2], [-33, 11, 8]],
  ];
  for (const run of stoneRuns)
    for (const [x, y, z] of run) addBox(x, y - 0.6, z, 2.6, 1.2, 2.6, TEX.stone);

  // tall pillars rising from the deep (wall-jump / grapple props)
  const pillars = [[22, -4, 22, 10], [-24, -6, 24, 9], [24, -6, -26, 12], [-22, -4, -26, 8], [0, -2, 26, 7], [-26, -2, 2, 9]];
  for (const [x, y, z, h] of pillars) addBox(x, y + h / 2, z, 2.4, h, 2.4, TEX.stone);

  // plank bridge with a gap (main -> east isle)
  addBox(19.5, 4.9, 8, 5, 0.6, 2.4, TEX.wood);
  addBox(13.5, 3.9, 8, 4, 0.6, 2.4, TEX.wood);

  // grapple orbs
  const orbSpots = [
    [0, 17, 0], [14, 10, 2], [-14, 11, -2], [2, 10, 14], [-2, 10, -14],
    [24, 12, 14], [-24, 13, -18], [10, 16, -26], [-22, 11, 22], [30, 18, -10],
    [-32, 17, 6], [18, 13, 26], [22, 8, -20], [-16, 9, -22],
  ];
  for (const [x, y, z] of orbSpots) addOrb(x, y, z);

  // ocean
  const water = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshBasicMaterial({ map: TEX.water }));
  water.rotation.x = -Math.PI / 2; water.position.y = -26;
  scene.add(water);
  return water;
}
const water = buildMap();

// drifting pixel clouds
const clouds = [];
for (let i = 0; i < 9; i++) {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.9 });
  for (let j = 0; j < 3; j++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(rand(4, 9), 1.6, rand(3, 5)), m);
    b.position.set(rand(-4, 4), rand(-0.5, 0.5), rand(-2, 2)); g.add(b);
  }
  g.position.set(rand(-90, 90), rand(22, 42), rand(-90, 90));
  scene.add(g); clouds.push(g);
}

// ============================== CHARACTERS =================================
function buildPirate(opt) {
  const g = new THREE.Group();
  const skin = flat(opt.skin), shirt = flat(opt.shirt), pants = flat(0x3a3f52),
        band = flat(opt.bandana), dark = flat(0x14161f);
  const parts = {};
  const box = (w, h, d, m, x, y, z, ty) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    if (ty !== undefined) geo.translate(0, ty, 0);
    const msh = new THREE.Mesh(geo, m); msh.position.set(x, y, z); return msh;
  };
  // legs pivot at hip (y .7)
  parts.legL = box(0.2, 0.7, 0.24, pants, -0.13, 0.7, 0, -0.35);
  parts.legR = box(0.2, 0.7, 0.24, pants, 0.13, 0.7, 0, -0.35);
  // body
  parts.body = box(0.56, 0.6, 0.32, shirt, 0, 1.0, 0);
  g.add(box(0.58, 0.14, 0.34, dark, 0, 0.76, 0)); // belt
  // arms pivot at shoulder (y 1.26)
  parts.armL = box(0.17, 0.6, 0.22, shirt, -0.37, 1.26, 0, -0.26);
  parts.armR = box(0.17, 0.6, 0.22, shirt, 0.37, 1.26, 0, -0.26);
  parts.armL.add(box(0.15, 0.14, 0.19, skin, 0, -0.5, 0));
  parts.armR.add(box(0.15, 0.14, 0.19, skin, 0, -0.5, 0));
  // head
  parts.head = box(0.46, 0.44, 0.46, skin, 0, 1.53, 0);
  parts.head.add(box(0.5, 0.16, 0.5, band, 0, 0.19, 0));           // bandana
  parts.head.add(box(0.12, 0.16, 0.08, band, 0.2, 0.16, -0.26));   // knot
  parts.head.add(box(0.08, 0.08, 0.04, dark, -0.11, 0.02, 0.235)); // eyes
  if (opt.patch) {
    parts.head.add(box(0.14, 0.14, 0.04, dark, 0.11, 0.02, 0.235));
    parts.head.add(box(0.5, 0.05, 0.5, dark, 0, 0.09, 0));
  } else {
    parts.head.add(box(0.08, 0.08, 0.04, dark, 0.11, 0.02, 0.235));
  }
  // cutlass in right hand
  const cut = new THREE.Group();
  cut.add(box(0.07, 0.2, 0.07, flat(0x5d3c20), 0, 0.02, 0));
  cut.add(box(0.2, 0.05, 0.16, flat(0xf2c14e), 0, -0.1, 0));
  const bladeM = flat(0xdfe6f0);
  cut.add(box(0.05, 0.66, 0.17, bladeM, 0, -0.45, 0.01));
  const tip = box(0.05, 0.24, 0.15, bladeM, 0, -0.82, 0.06); tip.rotation.x = 0.5; cut.add(tip);
  cut.position.set(0, -0.55, 0.05);
  parts.armR.add(cut); parts.cutlass = cut;

  for (const k in parts) g.add(parts[k]);
  g.traverse(o => { if (o.isMesh) o.matrixAutoUpdate = true; });

  // blob shadow
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2;
  scene.add(sh);

  scene.add(g);
  return { group: g, parts, shadow: sh, mats: [skin, shirt, band] };
}

// name + hp tag sprite
function makeTag(name) {
  const cv = document.createElement('canvas'); cv.width = 96; cv.height = 28;
  const g = cv.getContext('2d');
  const t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true }));
  sp.scale.set(2.1, 0.62, 1);
  scene.add(sp);
  return {
    sprite: sp,
    draw(hp) {
      g.clearRect(0, 0, 96, 28);
      g.font = 'bold 13px monospace'; g.textAlign = 'center';
      g.fillStyle = '#000'; g.fillText(name, 49, 13); g.fillStyle = '#fff'; g.fillText(name, 48, 12);
      g.fillStyle = '#000'; g.fillRect(17, 17, 62, 8);
      g.fillStyle = '#40d444'; if (hp < 35) g.fillStyle = '#e03131';
      g.fillRect(18, 18, Math.max(0, 60 * hp / 100), 6);
      t.needsUpdate = true;
    }
  };
}

// rope per entity
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

// ============================== ENTITIES ===================================
const entities = [];
function makeEntity(name, isPlayer, look) {
  const vis = buildPirate(look);
  const e = {
    name, isPlayer,
    pos: V3(0, 5, 0), vel: V3(0, 0, 0), yaw: 0,
    hw: 0.42, hh: 0.9,
    hp: 100, dead: false, respawnT: 0, invuln: 0,
    onGround: false, coyote: 0, jumpsLeft: MAX_AIR_JUMPS, jumpBuf: 0,
    wallT: 0, wallN: V3(0, 0, 0), landV: 0, squash: 0,
    mx: 0, mz: 0,                       // desired world move dir (unit-ish)
    swingT: -1, atkCd: 0, swingVictims: new Set(),
    hitstun: 0, flashT: 0, regenT: 0, lastHitBy: null, lastHitT: 0,
    grapOn: false, grapP: V3(0, 0, 0), grapLen: 0, grapT: 0,
    score: 0, falls: 0,
    vis, rope: makeRope(),
    tag: isPlayer ? null : makeTag(name),
    ai: isPlayer ? null : {
      target: null, thinkT: rand(0, 0.3), strafe: Math.random() < 0.5 ? 1 : -1,
      stuckT: 0, grapCd: rand(2, 6), atkDelay: 0, hopT: rand(1, 3),
    },
  };
  if (e.tag) e.tag.draw(100);
  entities.push(e);
  return e;
}

const player = makeEntity('You', true, { skin: 0xe8b88a, shirt: 0xf2f2f2, bandana: 0xd8322e, patch: false });
const botLooks = [
  { skin: 0xc98e5f, shirt: 0x3a6ea5, bandana: 0x2f9e44, patch: true },
  { skin: 0xe8b88a, shirt: 0x9c36b5, bandana: 0x1098ad, patch: false },
  { skin: 0x8d5524, shirt: 0xe8590c, bandana: 0xfcc419, patch: false },
  { skin: 0xe8b88a, shirt: 0x495057, bandana: 0xe64980, patch: true },
  { skin: 0xc98e5f, shirt: 0x2b8a3e, bandana: 0x7048e8, patch: false },
];
for (let i = 0; i < BOT_NAMES.length; i++) makeEntity(BOT_NAMES[i], false, botLooks[i]);

function pickSpawn(e) {
  let best = spawns[0], bestScore = -1;
  for (const s of spawns) {
    let dMin = 1e9;
    for (const o of entities) if (o !== e && !o.dead) dMin = Math.min(dMin, s.distanceTo(o.pos));
    const score = dMin + Math.random() * 8;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}
function placeAtSpawn(e) {
  const s = pickSpawn(e);
  e.pos.copy(s); e.vel.set(0, 0, 0); e.hp = 100; e.dead = false;
  e.invuln = 1.6; e.grapOn = false; e.swingT = -1; e.hitstun = 0;
  e.vis.group.visible = true; e.vis.shadow.visible = true;
  if (e.tag) { e.tag.draw(e.hp); e.tag.sprite.visible = true; }
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

// ============================== INPUT ======================================
const keys = {};
let camYaw = 0.6, camPitch = 0.28, camDist = 7.6;
let wantGrapple = false, lookDX = 0, lookDY = 0;
const joy = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
const lookTouch = { id: -1, lx: 0, ly: 0 };

window.addEventListener('keydown', ev => {
  if (ev.repeat) return;
  keys[ev.code] = true;
  if (ev.code === 'Space') { player.jumpBuf = JUMP_BUF; ev.preventDefault(); }
  if (ev.code === 'KeyE') wantGrapple = true;
});
window.addEventListener('keyup', ev => {
  keys[ev.code] = false;
  if (ev.code === 'KeyE') wantGrapple = false;
});

// mouse (desktop) — pointer lock when available, drag-to-look fallback when
// it's denied (e.g. sandboxed iframes)
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
  if (ev.button === 2) wantGrapple = true;
});
window.addEventListener('mouseup', ev => {
  if (ev.button === 2) wantGrapple = false;
  if (ev.buttons === 0) dragLook = false;
});
window.addEventListener('contextmenu', ev => ev.preventDefault());
window.addEventListener('mousemove', ev => {
  if (document.pointerLockElement === canvas) { lookDX += ev.movementX * 0.0026; lookDY += ev.movementY * 0.0026; }
  else if (dragLook && state === 'PLAY') { lookDX += ev.movementX * 0.0032; lookDY += ev.movementY * 0.0032; }
});

// touch — #hud is pointer-events:none, so touches land on the canvas and
// bubble to window; buttons (.tbtn) stopPropagation and handle themselves.
const joyBase = document.getElementById('joyBase'), joyKnob = document.getElementById('joyKnob');
window.addEventListener('touchstart', ev => {
  if (state !== 'PLAY') return;                                   // let menu UI receive taps
  if (ev.target.closest && ev.target.closest('.tbtn, button, .overlay')) return;
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
bindBtn('btnJump', () => { player.jumpBuf = JUMP_BUF; });
bindBtn('btnAtk', () => startSwing(player));
bindBtn('btnGrap', () => { wantGrapple = true; }, () => { wantGrapple = false; });
document.getElementById('fsBtn').addEventListener('touchend', ev => {
  ev.preventDefault();
  try {
    if (!document.fullscreenElement) {
      const p = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
      if (p && p.catch) p.catch(() => {});
    } else document.exitFullscreen();
  } catch (e) {}
}, { passive: false });

// ============================== COMBAT =====================================
function startSwing(att) {
  if (state !== 'PLAY' && !(att.ai)) return;
  if (att.dead || att.atkCd > 0 || att.hitstun > 0) return;
  att.swingT = 0; att.atkCd = ATK_CD; att.swingVictims.clear();
  // aim assist: snap toward closest foe in front
  let best = null, bestD = 5.2;
  for (const o of entities) {
    if (o === att || o.dead) continue;
    const dx = o.pos.x - att.pos.x, dz = o.pos.z - att.pos.z, d = Math.hypot(dx, dz);
    if (d < bestD && Math.abs(o.pos.y - att.pos.y) < 2.5) {
      const a = Math.atan2(dx, dz);
      if (Math.abs(angDiff(a, att.yaw)) < 1.2) { best = o; bestD = d; }
    }
  }
  if (best) att.yaw = Math.atan2(best.pos.x - att.pos.x, best.pos.z - att.pos.z);
  // lunge
  att.vel.x += Math.sin(att.yaw) * 5.5; att.vel.z += Math.cos(att.yaw) * 5.5;
  sfx.swing();
}
function swingHits(att) {
  for (const t of entities) {
    if (t === att || t.dead || t.invuln > 0 || att.swingVictims.has(t)) continue;
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
}
function applyHit(att, vic, nx, nz) {
  const dmg = att.isPlayer ? PLAYER_DMG : BOT_DMG;
  vic.hp -= dmg; vic.hitstun = 0.28; vic.flashT = 0.22; vic.regenT = 5;
  vic.lastHitBy = att; vic.lastHitT = elapsed;
  vic.vel.x += nx * 9.5; vic.vel.z += nz * 9.5; vic.vel.y = Math.max(vic.vel.y, 5);
  vic.grapOn = false;
  burst(V3(vic.pos.x, vic.pos.y + 0.5, vic.pos.z), 0xffd23e, 8, 6, 0.6);
  sfx.hit();
  if (vic.isPlayer) { flashVignette(); sfx.hurt(); }
  if (vic.tag) vic.tag.draw(Math.max(0, vic.hp));
  if (vic.hp <= 0) ko(vic, att);
}
function ko(vic, att) {
  vic.dead = true; vic.respawnT = 2.6; vic.hp = 0; vic.grapOn = false;
  vic.vis.group.visible = false; vic.vis.shadow.visible = false;
  if (vic.tag) vic.tag.sprite.visible = false;
  vic.rope.line.visible = vic.rope.hook.visible = false;
  burst(V3(vic.pos.x, vic.pos.y + 0.5, vic.pos.z), 0xe03131, 16, 9, 1);
  burst(V3(vic.pos.x, vic.pos.y + 0.5, vic.pos.z), 0xffffff, 10, 7, 1);
  sfx.ko();
  if (att && att !== vic) {
    att.score++;
    addFeed(`${att.name} ⚔ ${vic.name}`);
  } else {
    vic.falls++;
    addFeed(`${vic.name} fell in the drink`);
  }
  if (vic.isPlayer) showMsg(att && att !== vic ? `KO'D BY ${att.name.toUpperCase()}!` : 'SPLASH!', 2.2);
  updateBoard();
}

// ============================== GRAPPLE ====================================
const raycaster = new THREE.Raycaster();
// first crosshair hit past the player (skips geometry between camera & player)
function castCenter(range) {
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  raycaster.far = range + camDist + 4;
  const dir = raycaster.ray.direction;
  const pd = (player.pos.x - camera.position.x) * dir.x +
             (player.pos.y + 0.7 - camera.position.y) * dir.y +
             (player.pos.z - camera.position.z) * dir.z;
  const hits = raycaster.intersectObjects(raycastables, false);
  for (const h of hits) {
    if (h.distance < pd - 1.4) continue;
    if (h.point.distanceTo(player.pos) > range) return null;
    return h;
  }
  return null;
}
function tryGrapple(e) {
  // player: aim through crosshair; bots: pick an orb
  if (e.isPlayer) {
    const h = castCenter(GRAPPLE_RANGE);
    if (h) { attachGrapple(e, h.point); return true; }
    return false;
  }
  return false;
}
function attachGrapple(e, point) {
  e.grapOn = true; e.grapP.copy(point);
  e.grapLen = Math.max(GRAPPLE_MIN, e.pos.distanceTo(point));
  e.grapT = 0;
  e.rope.hook.position.copy(point);
  sfx.grap(); sfx.hook();
  burst(point, 0xffd23e, 5, 4, 0.5);
}
// ============================== PHYSICS ====================================
function overlaps(e, s) {
  return e.pos.x - e.hw < s.max.x && e.pos.x + e.hw > s.min.x &&
         e.pos.y - e.hh < s.max.y && e.pos.y + e.hh > s.min.y &&
         e.pos.z - e.hw < s.max.z && e.pos.z + e.hw > s.min.z;
}
function moveAndCollide(e, dt) {
  const wasGround = e.onGround;
  e.onGround = false;
  // X
  e.pos.x += e.vel.x * dt;
  for (const s of solids) if (overlaps(e, s)) {
    if (e.vel.x > 0) e.pos.x = s.min.x - e.hw; else if (e.vel.x < 0) e.pos.x = s.max.x + e.hw;
    if (!wasGround) { e.wallT = 0.16; e.wallN.set(e.vel.x > 0 ? -1 : 1, 0, 0); }
    e.vel.x = 0;
  }
  // Z
  e.pos.z += e.vel.z * dt;
  for (const s of solids) if (overlaps(e, s)) {
    if (e.vel.z > 0) e.pos.z = s.min.z - e.hw; else if (e.vel.z < 0) e.pos.z = s.max.z + e.hw;
    if (!wasGround) { e.wallT = 0.16; e.wallN.set(0, 0, e.vel.z > 0 ? -1 : 1); }
    e.vel.z = 0;
  }
  // Y
  e.pos.y += e.vel.y * dt;
  for (const s of solids) if (overlaps(e, s)) {
    if (e.vel.y <= 0) {
      e.pos.y = s.max.y + e.hh; e.onGround = true;
      if (!wasGround && e.landV < -14) { burst(V3(e.pos.x, e.pos.y - e.hh, e.pos.z), 0xffffff, 5, 3, 0.4); e.squash = 0.18; if (e.isPlayer) sfx.land(); }
    } else e.pos.y = s.min.y - e.hh;
    e.vel.y = 0;
  }
  if (e.onGround) { e.jumpsLeft = MAX_AIR_JUMPS; e.coyote = COYOTE; }
}
function tryJump(e) {
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
  if (e.dead) {
    e.respawnT -= dt;
    if (e.respawnT <= 0 && (state === 'PLAY' || state === 'MENU')) placeAtSpawn(e);
    return;
  }
  e.atkCd = Math.max(0, e.atkCd - dt);
  e.coyote = Math.max(0, e.coyote - dt);
  e.wallT = Math.max(0, e.wallT - dt);
  e.invuln = Math.max(0, e.invuln - dt);
  e.hitstun = Math.max(0, e.hitstun - dt);
  e.flashT = Math.max(0, e.flashT - dt);
  e.jumpBuf = Math.max(0, e.jumpBuf - dt);
  e.squash = Math.max(0, e.squash - dt);
  if (e.regenT > 0) e.regenT -= dt;
  else if (e.hp < 100) { e.hp = Math.min(100, e.hp + 9 * dt); if (e.tag) e.tag.draw(e.hp); }

  // swing timeline
  if (e.swingT >= 0) {
    e.swingT += dt;
    if (e.swingT > SWING_DUR) e.swingT = -1;
    else if (e.swingT >= SWING_ACTIVE_A && e.swingT <= SWING_ACTIVE_B) swingHits(e);
  }

  // control
  const stunned = e.hitstun > 0;
  if (!stunned && (e.mx !== 0 || e.mz !== 0)) {
    const acc = e.onGround ? ACC_GROUND : ACC_AIR;
    const k = Math.min(1, acc * dt);
    e.vel.x += (e.mx * SPEED - e.vel.x) * k;
    e.vel.z += (e.mz * SPEED - e.vel.z) * k;
  } else if (e.onGround && !stunned) {
    const k = Math.min(1, 10 * dt);
    e.vel.x -= e.vel.x * k; e.vel.z -= e.vel.z * k;
  }

  // buffered jump
  if (e.jumpBuf > 0 && !stunned) { if (tryJump(e)) e.jumpBuf = 0; }

  // grapple pull
  if (e.grapOn) {
    e.grapT += dt;
    const dx = e.grapP.x - e.pos.x, dy = e.grapP.y - e.pos.y, dz = e.grapP.z - e.pos.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < GRAPPLE_MIN || e.grapT > 3.0 || (e.isPlayer && !wantGrapple)) {
      e.grapOn = false;
      e.vel.y += 3.5;                      // release pop
    } else {
      const nx = dx / d, ny = dy / d, nz = dz / d;
      e.vel.x += nx * GRAPPLE_PULL * dt;
      e.vel.y += ny * (GRAPPLE_PULL + 12) * dt;   // fight gravity a bit harder
      e.vel.z += nz * GRAPPLE_PULL * dt;
      e.grapLen = Math.max(GRAPPLE_MIN, e.grapLen - GRAPPLE_REEL * dt);
      if (d > e.grapLen) {
        const ex = d - e.grapLen;
        e.pos.x += nx * ex; e.pos.y += ny * ex; e.pos.z += nz * ex;
        const rad = e.vel.x * -nx + e.vel.y * -ny + e.vel.z * -nz; // outward speed
        if (rad > 0) { e.vel.x += nx * rad; e.vel.y += ny * rad; e.vel.z += nz * rad; }
      }
    }
  }

  // gravity
  e.vel.y += GRAV * dt;
  if (e.vel.y < FALL_MAX) e.vel.y = FALL_MAX;
  if (e.wallT > 0 && e.vel.y < -5) e.vel.y = -5;   // wall slide
  e.landV = e.vel.y;

  moveAndCollide(e, dt);

  // fell into the sea
  if (e.pos.y < KILL_Y) {
    burst(V3(e.pos.x, KILL_Y + 1, e.pos.z), 0x4f95e0, 14, 8, 1.4);
    const credit = (e.lastHitBy && elapsed - e.lastHitT < 5) ? e.lastHitBy : null;
    ko(e, credit);
  }
}

// ============================== BOT AI =====================================
function nearestFoe(e) {
  let best = null, bd = 1e9;
  for (const o of entities) {
    if (o === e || o.dead) continue;
    const d = e.pos.distanceTo(o.pos);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}
function overVoid(e) {
  for (const s of solids) {
    if (e.pos.x > s.min.x - 0.4 && e.pos.x < s.max.x + 0.4 &&
        e.pos.z > s.min.z - 0.4 && e.pos.z < s.max.z + 0.4 && s.max.y <= e.pos.y) return false;
  }
  return true;
}
function groundAhead(e, dirX, dirZ) {
  const px = e.pos.x + dirX * 1.8, pz = e.pos.z + dirZ * 1.8, py = e.pos.y;
  for (const s of solids) {
    if (px > s.min.x - 0.2 && px < s.max.x + 0.2 && pz > s.min.z - 0.2 && pz < s.max.z + 0.2 &&
        s.max.y > py - 4 && s.max.y < py + 0.5) return true;
  }
  return false;
}
function landingAhead(e, dirX, dirZ) {
  // is there anywhere to land within triple-jump reach in this direction?
  for (let step = 3; step <= 12; step += 1.5) {
    const px = e.pos.x + dirX * step, pz = e.pos.z + dirZ * step;
    for (const s of solids) {
      if (px > s.min.x - 0.3 && px < s.max.x + 0.3 && pz > s.min.z - 0.3 && pz < s.max.z + 0.3 &&
          s.max.y > e.pos.y - 6 && s.max.y < e.pos.y + 3) return true;
    }
  }
  return false;
}
function botGrappleToward(e, targetPos) {
  let best = null, bd = 1e9;
  for (const o of orbs) {
    const dToMe = o.pos.distanceTo(e.pos);
    if (dToMe > GRAPPLE_RANGE * 0.85 || dToMe < 4) continue;
    if (o.pos.y < e.pos.y + 2) continue;
    const score = o.pos.distanceTo(targetPos) + dToMe * 0.4;
    if (score < bd) { bd = score; best = o; }
  }
  if (best) { attachGrapple(e, best.pos); return true; }
  return false;
}
function botThink(e, dt) {
  const ai = e.ai;
  ai.grapCd -= dt; ai.hopT -= dt;
  ai.thinkT -= dt;
  if (ai.thinkT <= 0) {
    ai.thinkT = 0.22;
    ai.target = nearestFoe(e);
    if (Math.random() < 0.15) ai.strafe = -ai.strafe;
  }
  const t = ai.target;
  e.mx = e.mz = 0;
  if (!t) return;

  const dx = t.pos.x - e.pos.x, dz = t.pos.z - e.pos.z;
  const hd = Math.hypot(dx, dz), dy = t.pos.y - e.pos.y;
  const nx = dx / (hd || 1), nz = dz / (hd || 1);
  e.yaw = Math.atan2(dx, dz);

  if (hd > 3.0) {
    e.mx = nx; e.mz = nz;
  } else {
    // knife-fight range: strafe + occasional backpedal
    e.mx = nz * ai.strafe * 0.7 - nx * 0.15;
    e.mz = -nx * ai.strafe * 0.7 - nz * 0.15;
  }

  // stuck / obstacle → jump
  const hspd = Math.hypot(e.vel.x, e.vel.z);
  if ((e.mx || e.mz) && hspd < 1.2 && e.onGround) ai.stuckT += dt; else ai.stuckT = Math.max(0, ai.stuckT - dt * 2);
  if (ai.stuckT > 0.35) { e.jumpBuf = JUMP_BUF; ai.stuckT = 0; }
  // gap ahead → jump only if there's somewhere to land; otherwise hold the
  // edge and try to grapple across instead of lemming off
  if (e.onGround && hd > 3 && !groundAhead(e, nx, nz)) {
    if (landingAhead(e, nx, nz)) e.jumpBuf = JUMP_BUF;
    else {
      e.mx = nz * ai.strafe * 0.6; e.mz = -nx * ai.strafe * 0.6;
      if (!e.grapOn && ai.grapCd <= 0 && botGrappleToward(e, t.pos)) ai.grapCd = rand(3, 7);
    }
  }
  if (!e.onGround && e.vel.y < -3 && e.jumpsLeft > 0 && e.pos.y < t.pos.y + 1 && Math.random() < 0.08) tryJump(e);
  // target above → hop up
  if (e.onGround && dy > 1.6 && ai.hopT <= 0) { e.jumpBuf = JUMP_BUF; ai.hopT = rand(0.7, 1.6); }
  // random parkour hop
  if (e.onGround && ai.hopT <= 0 && Math.random() < 0.01) { e.jumpBuf = JUMP_BUF; ai.hopT = rand(1.5, 4); }

  // grapple toward a useful orb when far away or below the target
  if (!e.grapOn && ai.grapCd <= 0 && (hd > 13 || dy > 5)) {
    if (botGrappleToward(e, t.pos)) ai.grapCd = rand(4, 8);
  }

  // over the void: forget the fight, get back to land
  if (!e.onGround && !e.grapOn && overVoid(e)) {
    let ns = null, nd = 1e9;
    for (const s of spawns) {
      const d = Math.hypot(s.x - e.pos.x, s.z - e.pos.z);
      if (d < nd) { nd = d; ns = s; }
    }
    if (ns) { e.mx = (ns.x - e.pos.x) / (nd || 1); e.mz = (ns.z - e.pos.z) / (nd || 1); }
    if (e.vel.y < -5 && e.jumpsLeft > 0 && Math.random() < 0.12) tryJump(e);
    if (e.vel.y < -9) {
      let best = null, bd = 1e9;
      for (const o of orbs) {
        if (o.pos.y < e.pos.y + 1) continue;
        const d = o.pos.distanceTo(e.pos);
        if (d < GRAPPLE_RANGE * 0.9 && d < bd) { bd = d; best = o; }
      }
      if (best) { attachGrapple(e, best.pos); ai.grapCd = rand(3, 6); }
    }
  }

  // attack
  if (hd < 3.1 && Math.abs(dy) < 2.2 && e.atkCd <= 0 && ai.atkDelay <= 0) {
    ai.atkDelay = rand(0.05, 0.35);       // human-ish reaction delay
  }
  if (ai.atkDelay > 0) { ai.atkDelay -= dt; if (ai.atkDelay <= 0) startSwing(e); }
}

// ============================== VISUALS ====================================
function shadowFor(e) {
  let gy = -1e9;
  for (const s of solids) {
    if (e.pos.x > s.min.x - 0.2 && e.pos.x < s.max.x + 0.2 &&
        e.pos.z > s.min.z - 0.2 && e.pos.z < s.max.z + 0.2 &&
        s.max.y <= e.pos.y - e.hh + 0.3 && s.max.y > gy) gy = s.max.y;
  }
  return gy;
}
function updateVisual(e, dt, time) {
  if (e.dead) return;
  const v = e.vis, p = v.parts;
  v.group.position.set(e.pos.x, e.pos.y - e.hh, e.pos.z);
  v.group.rotation.y = e.yaw;
  const sq = e.squash > 0 ? 1 - e.squash * 1.6 : 1;
  v.group.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));

  // flash red when hit / blink when invulnerable
  const flash = e.flashT > 0;
  for (const m of v.mats) m.emissive.setHex(flash ? 0x991111 : 0x000000);
  v.group.visible = !(e.invuln > 0 && Math.floor(time * 14) % 2 === 0);

  const hspd = Math.hypot(e.vel.x, e.vel.z);
  if (e.onGround) {
    const sw = Math.sin(time * 11 * Math.max(0.4, hspd / SPEED)) * Math.min(1, hspd / SPEED) * 0.75;
    p.legL.rotation.x = sw; p.legR.rotation.x = -sw;
    p.armL.rotation.x = -sw * 0.8; p.armL.rotation.z = 0.06;
    if (e.swingT < 0) { p.armR.rotation.set(sw * 0.8, 0, -0.06); }
  } else {
    p.legL.rotation.x = 0.5; p.legR.rotation.x = -0.35;
    p.armL.rotation.x = -0.5; p.armL.rotation.z = 0.5;
    if (e.swingT < 0) p.armR.rotation.set(-0.5, 0, -0.5);
  }
  if (e.grapOn) { p.armL.rotation.x = -2.6; p.armL.rotation.z = 0; }

  // cutlass swing: windup then arc
  if (e.swingT >= 0) {
    const t = e.swingT / SWING_DUR;
    let rx, ry;
    if (t < 0.22) { const k = t / 0.22; rx = lerp(-0.4, -2.5, k); ry = lerp(0, 0.5, k); }
    else if (t < 0.62) { const k = (t - 0.22) / 0.4; rx = lerp(-2.5, 0.9, k); ry = lerp(0.5, -0.7, k); }
    else { const k = (t - 0.62) / 0.38; rx = lerp(0.9, 0, k); ry = lerp(-0.7, 0, k); }
    p.armR.rotation.set(rx, ry, -0.15);
  }

  // rope
  if (e.grapOn) {
    e.rope.line.visible = e.rope.hook.visible = true;
    const a = e.rope.line.geometry.attributes.position.array;
    a[0] = e.pos.x; a[1] = e.pos.y + 0.5; a[2] = e.pos.z;
    a[3] = e.grapP.x; a[4] = e.grapP.y; a[5] = e.grapP.z;
    e.rope.line.geometry.attributes.position.needsUpdate = true;
    e.rope.hook.position.copy(e.grapP);
  } else e.rope.line.visible = e.rope.hook.visible = false;

  // tag + shadow
  if (e.tag) e.tag.sprite.position.set(e.pos.x, e.pos.y + 1.5, e.pos.z);
  const gy = shadowFor(e);
  if (gy > -1e8) {
    v.shadow.visible = true;
    v.shadow.position.set(e.pos.x, gy + 0.03, e.pos.z);
    const hAbove = clamp(e.pos.y - e.hh - gy, 0, 12);
    const s = lerp(1.15, 0.45, hAbove / 12);
    v.shadow.scale.set(s, s, 1);
    v.shadow.material.opacity = lerp(0.32, 0.1, hAbove / 12);
  } else v.shadow.visible = false;
}

// ============================== CAMERA =====================================
const camPos = V3(0, 8, -12);
function updateCamera(dt) {
  camYaw -= lookDX; camPitch += lookDY;
  lookDX = lookDY = 0;
  camPitch = clamp(camPitch, -1.15, 1.25);

  const head = V3(player.pos.x, player.pos.y + 0.7, player.pos.z);
  const cp = Math.cos(camPitch);
  const off = V3(-Math.sin(camYaw) * cp, Math.sin(camPitch), -Math.cos(camYaw) * cp);
  // camera collision: pull in if a solid blocks the view
  let dist = camDist;
  raycaster.set(head, off.clone().normalize());
  raycaster.far = camDist;
  const hits = raycaster.intersectObjects(raycastables, false);
  if (hits.length) dist = Math.max(1.2, hits[0].distance - 0.4);
  const target = head.clone().addScaledVector(off, dist);
  camPos.lerp(target, Math.min(1, 14 * dt));
  camera.position.copy(camPos);
  camera.lookAt(head.x, head.y + 0.25, head.z);
}
function menuCamera(time) {
  const a = time * 0.12;
  camera.position.set(Math.sin(a) * 46, 18 + Math.sin(time * 0.3) * 4, Math.cos(a) * 46);
  camera.lookAt(0, 4, 0);
}

// ============================== HUD ========================================
const elHp = document.getElementById('hpfill');
const pips = Array.from(document.querySelectorAll('.pip'));
const elTimer = document.getElementById('timer');
const elBoard = document.getElementById('board');
const elFeed = document.getElementById('feed');
const elMsg = document.getElementById('msg');
const elVig = document.getElementById('vig');
const elCross = document.getElementById('cross');
let msgT = 0;

function flashVignette() { elVig.style.opacity = 0.9; }
function showMsg(txt, t) { elMsg.textContent = txt; elMsg.style.display = 'block'; msgT = t; }
function addFeed(txt) {
  const d = document.createElement('div'); d.textContent = txt;
  elFeed.prepend(d);
  while (elFeed.children.length > 5) elFeed.lastChild.remove();
  setTimeout(() => { if (d.parentNode) d.remove(); }, 6000);
}
function updateBoard() {
  const rows = [...entities].sort((a, b) => b.score - a.score);
  elBoard.innerHTML = rows.map(e =>
    `<div class="row${e.isPlayer ? ' me' : ''}"><span>${e.isPlayer ? '★ ' : ''}${e.name}</span><span>${e.score}</span></div>`).join('');
}
function updateHud() {
  const hpw = clamp(player.hp, 0, 100);
  elHp.style.width = hpw + '%';
  elHp.className = hpw < 35 ? 'low' : '';
  for (let i = 0; i < pips.length; i++)
    pips[i].className = 'pip' + ((player.onGround ? i < 3 : i < player.jumpsLeft) ? '' : ' off');
  const t = Math.max(0, Math.ceil(matchT));
  const mm = (t / 60) | 0, ss = t % 60;
  elTimer.textContent = `${mm}:${ss < 10 ? '0' : ''}${ss}`;
  elTimer.classList.toggle('hurry', t <= 20 && state === 'PLAY');
}
// crosshair heat check (throttled)
let crossT = 0;
function updateCross(dt) {
  crossT -= dt; if (crossT > 0) return; crossT = 0.12;
  if (player.dead || state !== 'PLAY') { elCross.classList.remove('hot'); return; }
  elCross.classList.toggle('hot', !!castCenter(GRAPPLE_RANGE));
}

// ============================== GAME FLOW ==================================
let state = 'MENU';         // MENU | PLAY | OVER
let matchT = MATCH_LEN, elapsed = 0;
const elMenu = document.getElementById('menu'), elOver = document.getElementById('over'), elResume = document.getElementById('resume');

function resetMatch() {
  matchT = MATCH_LEN;
  elFeed.innerHTML = '';
  for (const e of entities) { e.score = 0; e.falls = 0; placeAtSpawn(e); }
  updateBoard();
}
function startGame() {
  resetMatch();
  state = 'PLAY';
  elMenu.style.display = 'none'; elOver.style.display = 'none';
  showMsg('FIGHT!', 1.4);
  if (!IS_TOUCH) requestLock();
  const c = ac(); if (c && c.state === 'suspended') c.resume();
}
function endMatch() {
  state = 'OVER';
  document.exitPointerLock && document.exitPointerLock();
  const rows = [...entities].sort((a, b) => b.score - a.score);
  const winner = rows[0];
  document.getElementById('overTitle').textContent =
    winner.isPlayer ? '☠ VICTORY ☠' : `${winner.name.toUpperCase()} WINS`;
  document.getElementById('overList').innerHTML = rows.map((e, i) =>
    `${i + 1}. ${e.isPlayer ? '★ ' : ''}${e.name} — ${e.score} KO${e.score === 1 ? '' : 's'}`).join('<br>');
  elOver.style.display = 'flex';
  sfx.win();
}
document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('againBtn').addEventListener('click', startGame);
if (IS_TOUCH) {
  document.getElementById('ctrlsDesk').style.display = 'none';
  document.getElementById('ctrlsTouch').style.display = 'block';
}
elResume.addEventListener('click', () => { elResume.style.display = 'none'; requestLock(); });
document.addEventListener('pointerlockchange', () => {
  if (!IS_TOUCH && state === 'PLAY' && document.pointerLockElement !== canvas)
    elResume.style.display = 'flex';
  else elResume.style.display = 'none';
});

// menu demo: player idles on the crow's nest, bots brawl below
player.pos.set(0, 12.6, 0);
for (const e of entities) if (!e.isPlayer) placeAtSpawn(e);
updateBoard();

// ============================== MAIN LOOP ==================================
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
  // view forward = (sin yaw, 0, cos yaw); screen-right = (-cos yaw, 0, sin yaw)
  player.mx = sy * iy - cy * ix;
  player.mz = cy * iy + sy * ix;
  if (len > 0.05 && player.swingT < 0 && !player.grapOn)
    player.yaw = Math.atan2(player.mx, player.mz);
  if (player.swingT >= 0 || player.grapOn) player.yaw = camYaw;

  // grapple engage
  if (wantGrapple && !player.grapOn && !player.dead) {
    if (!tryGrapple(player)) { /* no target in reach */ }
  }
  if (!wantGrapple && player.grapOn) player.grapOn = false;
}

let last = performance.now(), acc = 0, timeSec = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  timeSec += dt;
  elapsed += dt;

  if (state !== 'OVER') {
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 4) {
      if (state === 'PLAY') playerControl();
      else { player.mx = player.mz = 0; }
      for (const e of entities) {
        if (!e.isPlayer && !e.dead) botThink(e, STEP);
        if (e.isPlayer && state !== 'PLAY') { updateEntityMenuIdle(e, STEP); }
        else updateEntity(e, STEP);
      }
      tickParts(STEP);
      acc -= STEP; steps++;
    }
    if (acc >= STEP) acc = 0; // drop time if tab was hidden
  }

  if (state === 'PLAY') {
    matchT -= dt;
    if (matchT <= 0) endMatch();
    updateCamera(dt);
  } else if (state === 'MENU') {
    menuCamera(timeSec);
  } else {
    menuCamera(timeSec);
  }

  // world anim
  for (const o of orbs) {
    o.t += dt;
    o.mesh.position.y = o.pos.y + Math.sin(o.t * 1.8) * 0.35;
    o.mesh.rotation.y += dt * 1.2;
    o.core.scale.setScalar(1 + Math.sin(o.t * 3) * 0.12);
  }
  for (const c of clouds) { c.position.x += dt * 1.1; if (c.position.x > 110) c.position.x = -110; }
  water.material.map.offset.x += dt * 0.008;
  water.material.map.offset.y += dt * 0.004;

  for (const e of entities) updateVisual(e, dt, timeSec);

  // hud
  elVig.style.opacity = Math.max(0, parseFloat(elVig.style.opacity || 0) - dt * 2);
  if (msgT > 0) { msgT -= dt; if (msgT <= 0) elMsg.style.display = 'none'; }
  updateHud();
  updateCross(dt);

  renderer.render(scene, camera);
}
function updateEntityMenuIdle(e, dt) {
  // player stands still (and can't die) on the menu screen
  e.invuln = 1;
  updateEntity(e, dt);
}
requestAnimationFrame(frame);
};

import * as THREE from 'three';

/* ============================================================
   SPACE SWINGER
   Third-person tentacle-swinging brawler in a neon alien city.

   - QUICK MATCH: matchmaking -> lobby -> 4-swinger DEATHMATCH
     (kill feed, scoreboard, 3:00 timer). Opponents are AI
     swingers standing in for live players — the flow is built
     like an online game so netcode can slot in later.
   - STORY: the wanted-fugitive quest chain in the same city.
   - HOLD E: your right tentacle arm stretches to the anchor and
     you swing on pendulum physics. Release mid-arc to fly.
   - LEFT CLICK: punch combos — jab, hook, UPPERCUT (launches).
   - Shift-lock mouse look (click / Shift), WASD run, SPACE jump.
   ============================================================ */

const WALK_SPEED = 11;
const CITY_R = 270;
const EYE = 1.6;            // physics height of your center above your feet
const MELEE_RANGE = 5.5;
const MATCH_TIME = 180;

// ---------------------------------------------------------- dom
const $ = (id) => document.getElementById(id);
const ui = {
  hp: $('hpbar'), score: $('stat-score'), best: $('stat-best'), wanted: $('stat-wanted'),
  questTitle: $('quest-title'), questObj: $('quest-obj'), questBar: $('questbar'),
  vignette: $('vignette'), flash: $('flash'), crosshair: $('crosshair'), fade: $('fade'),
  overlay: $('overlay'), oTitle: $('o-title'), oSub: $('o-sub'), oControls: $('o-controls'),
  playBtn: $('playbtn'), storyBtn: $('storybtn'), hint: $('hint'), pops: $('pops'),
  cutscene: $('cutscene'), cutSpeaker: $('cut-speaker'), cutText: $('cut-text'), cutSkip: $('cut-skip'),
  mm: $('mm'), mmList: $('mm-list'), lobby: $('lobby'), lobbyList: $('lobby-list'), lobbyCount: $('lobby-count'),
  matchHud: $('match-hud'), matchTimer: $('match-timer'), matchScore: $('match-score'),
  killfeed: $('killfeed'), combo: $('combo'), board: $('scoreboard'), boardRows: $('board-rows'),
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
function whoosh(dur = 0.4, vol = 0.2) {
  const a = audioCtx(); if (!a) return;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = 'bandpass';
  f.frequency.setValueAtTime(400, a.currentTime);
  f.frequency.exponentialRampToValueAtTime(2400, a.currentTime + dur);
  const g = a.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(a.destination); src.start();
}
const sfx = {
  attach: () => { whoosh(0.2, 0.15); tone(500, 0.12, 'sine', 0.1, 900); },
  release: () => tone(700, 0.15, 'sine', 0.08, 400),
  jump: () => tone(300, 0.15, 'triangle', 0.1, 500),
  land: () => tone(220, 0.1, 'triangle', 0.12, 160),
  hit1: () => { tone(140, 0.12, 'square', 0.2, 90); whoosh(0.08, 0.12); },
  hit2: () => { tone(120, 0.13, 'square', 0.22, 70); whoosh(0.09, 0.14); },
  hit3: () => { tone(90, 0.2, 'square', 0.28, 45); whoosh(0.16, 0.22); },
  shot: (v) => tone(1500, 0.08, 'square', v, 500),
  pew: () => tone(1100, 0.12, 'sawtooth', 0.1, 300),
  hurt: () => tone(220, 0.2, 'sawtooth', 0.2, 110),
  ko: () => { tone(200, 0.4, 'sawtooth', 0.22, 50); whoosh(0.3, 0.25); },
  step: () => tone(160 + Math.random() * 40, 0.04, 'triangle', 0.025),
  pickup: () => { tone(880, 0.1, 'square', 0.12); setTimeout(() => tone(1320, 0.15, 'square', 0.1), 80); },
  quest: () => { tone(523, 0.12, 'square', 0.12); setTimeout(() => tone(659, 0.12, 'square', 0.12), 110); setTimeout(() => tone(880, 0.25, 'square', 0.12), 220); },
  talk: () => tone(440, 0.06, 'square', 0.08, 520),
  win: () => { tone(523, 0.15, 'square', 0.13); setTimeout(() => tone(659, 0.15, 'square', 0.13), 130); setTimeout(() => tone(784, 0.3, 'square', 0.13), 260); setTimeout(() => tone(1047, 0.5, 'square', 0.13), 420); },
  siren: () => { tone(620, 0.28, 'square', 0.09, 880); setTimeout(() => tone(880, 0.28, 'square', 0.09, 620), 300); },
  whiff: () => whoosh(0.12, 0.08),
  join: () => tone(660, 0.1, 'square', 0.1, 880),
  count: () => tone(880, 0.12, 'square', 0.12),
  go: () => tone(1320, 0.3, 'square', 0.14),
};

// ---------------------------------------------------------- three setup
const SKY = 0x140b2e;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 50, 300);

const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.1, 700);
camera.position.set(0, 30, 14);

scene.add(new THREE.HemisphereLight(0x7a5fff, 0x162a3a, 1.15));
const sun = new THREE.DirectionalLight(0xb0d8ff, 0.9);
sun.position.set(60, 120, 40);
scene.add(sun);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------- materials / geometries
function neonMat(hex) {
  return new THREE.MeshLambertMaterial({ color: 0x0d0a1a, emissive: hex, emissiveIntensity: 1.4 });
}
const MAT = {
  tower: new THREE.MeshLambertMaterial({ color: 0x241d45 }),
  tower2: new THREE.MeshLambertMaterial({ color: 0x1c1638 }),
  tower3: new THREE.MeshLambertMaterial({ color: 0x2b2152 }),
  neonCyan: neonMat(0x2ae8d8), neonMagenta: neonMat(0xe83fd0), neonGreen: neonMat(0x5fe86a),
  neonOrange: neonMat(0xff9a3f), neonBlue: neonMat(0x3f8cff),
  lane: new THREE.MeshBasicMaterial({ color: 0x35f0d8, transparent: true, opacity: 0.35 }),
  tentacle: new THREE.MeshLambertMaterial({ color: 0x9a6ff0, emissive: 0x241040, emissiveIntensity: 1 }),
  sucker: new THREE.MeshLambertMaterial({ color: 0xd8c6ff, emissive: 0x4a2f80, emissiveIntensity: 0.6 }),
  body: new THREE.MeshLambertMaterial({ color: 0x7a4fd0 }),
  eyeW: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  eyeB: new THREE.MeshBasicMaterial({ color: 0x0a0a12 }),
  skinA: new THREE.MeshLambertMaterial({ color: 0x8de85c }),
  skinB: new THREE.MeshLambertMaterial({ color: 0x5cc8e8 }),
  skinC: new THREE.MeshLambertMaterial({ color: 0xe85c9a }),
  skinD: new THREE.MeshLambertMaterial({ color: 0xd0b32a }),
  suit: new THREE.MeshLambertMaterial({ color: 0x2b2b3d }),
  suit2: new THREE.MeshLambertMaterial({ color: 0x3d2b3a }),
  npc1: new THREE.MeshLambertMaterial({ color: 0x6a4fd0 }),
  npc2: new THREE.MeshLambertMaterial({ color: 0xb8762a }),
  npc3: new THREE.MeshLambertMaterial({ color: 0xd0b32a }),
  npc4: new THREE.MeshLambertMaterial({ color: 0xd04f4f }),
  pedA: new THREE.MeshLambertMaterial({ color: 0x3a7a5f }),
  pedB: new THREE.MeshLambertMaterial({ color: 0x7a3a6f }),
  pedC: new THREE.MeshLambertMaterial({ color: 0x3a5f7a }),
  botA: new THREE.MeshLambertMaterial({ color: 0xe0483a }),
  botB: new THREE.MeshLambertMaterial({ color: 0x3a9ae0 }),
  botC: new THREE.MeshLambertMaterial({ color: 0x46c46a }),
  botTentA: new THREE.MeshLambertMaterial({ color: 0xf0836a, emissive: 0x401510, emissiveIntensity: 1 }),
  botTentB: new THREE.MeshLambertMaterial({ color: 0x6ab8f0, emissive: 0x102540, emissiveIntensity: 1 }),
  botTentC: new THREE.MeshLambertMaterial({ color: 0x7ae094, emissive: 0x104018, emissiveIntensity: 1 }),
  gun: new THREE.MeshLambertMaterial({ color: 0x1c1c28 }),
  bullet: new THREE.MeshBasicMaterial({ color: 0xff4fd8 }),
  bolt: new THREE.MeshBasicMaterial({ color: 0x4dffe1 }),
  flash: new THREE.MeshBasicMaterial({ color: 0xffb3ee }),
  hull: new THREE.MeshLambertMaterial({ color: 0x8a93b8 }),
  hullDark: new THREE.MeshLambertMaterial({ color: 0x3c4260 }),
  dome: new THREE.MeshLambertMaterial({ color: 0x7ef2dd, emissive: 0x2ac5b5, emissiveIntensity: 0.7, transparent: true, opacity: 0.85 }),
  beamGold: new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
  beamPurple: new THREE.MeshBasicMaterial({ color: 0xb03fd0, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }),
  beamOrange: new THREE.MeshBasicMaterial({ color: 0xff9a3f, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }),
  beamYellow: new THREE.MeshBasicMaterial({ color: 0xd0b32a, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }),
  beamRed: new THREE.MeshBasicMaterial({ color: 0xff4f4f, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }),
  beamWhite: new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }),
  scrap: new THREE.MeshLambertMaterial({ color: 0x5a6478, emissive: 0x2ac5b5, emissiveIntensity: 0.6 }),
  fuel: new THREE.MeshLambertMaterial({ color: 0x3a3a20, emissive: 0xffe14d, emissiveIntensity: 1.1 }),
  rocket: new THREE.MeshLambertMaterial({ color: 0xc8d2e8 }),
  rocketFin: new THREE.MeshLambertMaterial({ color: 0xd04f4f }),
  lightRed: new THREE.MeshBasicMaterial({ color: 0xff3b3b }),
  lightBlue: new THREE.MeshBasicMaterial({ color: 0x3b8cff }),
  mask: new THREE.MeshLambertMaterial({ color: 0xf0e8d8 }),
  anchor: new THREE.MeshBasicMaterial({ color: 0x4dffe1, transparent: true, opacity: 0.9 }),
  carA: neonMat(0xe83fd0), carB: neonMat(0x2ae8d8), carC: neonMat(0xffe14d),
  spore: new THREE.MeshBasicMaterial({ color: 0xb03fd0 }),
};
const GEO = {
  bullet: new THREE.SphereGeometry(0.22, 8, 8),
  bolt: new THREE.SphereGeometry(0.18, 6, 6),
  bit: new THREE.BoxGeometry(0.22, 0.22, 0.22),
  head: new THREE.SphereGeometry(0.24, 10, 10),
  eye: new THREE.SphereGeometry(0.075, 8, 8),
  npcBody: new THREE.CylinderGeometry(0.28, 0.34, 0.68, 8),
  gun: new THREE.BoxGeometry(0.1, 0.12, 0.55),
  muzzle: new THREE.SphereGeometry(0.16, 6, 6),
  beam: new THREE.CylinderGeometry(0.8, 0.8, 150, 8, 1, true),
  car: new THREE.BoxGeometry(2.4, 0.7, 1.1),
};

// ---------------------------------------------------------- ground + sky
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(4000, 4000),
  new THREE.MeshLambertMaterial({ color: 0x120e24 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const mist = new THREE.Mesh(
  new THREE.PlaneGeometry(4000, 4000),
  new THREE.MeshBasicMaterial({ color: 0x241645, transparent: true, opacity: 0.4, depthWrite: false })
);
mist.rotation.x = -Math.PI / 2;
mist.position.y = 3.5;
scene.add(mist);

const skyGroup = new THREE.Group();
{
  const starGeo = new THREE.BufferGeometry();
  const pts = [];
  for (let i = 0; i < 800; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(500);
    if (v.y > -20) pts.push(v.x, v.y, v.z);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  skyGroup.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 2.2, sizeAttenuation: false, fog: false })));
  const planet = new THREE.Mesh(new THREE.SphereGeometry(40, 24, 24), new THREE.MeshBasicMaterial({ color: 0x5a4a9e, fog: false }));
  planet.position.set(180, 170, -350);
  skyGroup.add(planet);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(60, 6, 2, 48), new THREE.MeshBasicMaterial({ color: 0x8f7fd0, fog: false }));
  ring.position.copy(planet.position);
  ring.rotation.x = Math.PI / 2.4;
  ring.scale.z = 0.15;
  skyGroup.add(ring);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(11, 16, 16), new THREE.MeshBasicMaterial({ color: 0xd8b8e8, fog: false }));
  moon.position.set(-260, 130, -200);
  skyGroup.add(moon);
}
scene.add(skyGroup);

// ---------------------------------------------------------- helpers / containers
function randPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

let worldGroup = new THREE.Group();
scene.add(worldGroup);

const buildings = [];
const spawnRoofs = [];  // Vector3 rooftop respawn points
const enemies = [];
const peds = [];
const cars = [];
const pursuers = [];
const npcs = [];
const scraps = [];
const projectiles = [];
const playerShots = [];
const bots = [];        // match opponents
let objectiveBeam = null;
let fuelCell = null;
let rocket = null;
let mode = 'none';      // 'story' | 'match'

function makeBeam(pos, mat) {
  const m = new THREE.Mesh(GEO.beam, mat);
  m.position.set(pos.x, 75, pos.z);
  worldGroup.add(m);
  return m;
}

// ---------------------------------------------------------- city
function groundAt(x, z) {
  let g = 0.2;
  for (const b of buildings) {
    if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && b.h > g) g = b.h;
  }
  return g;
}

function addBuilding(cx, cz, w, d, h, accent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), randPick([MAT.tower, MAT.tower2, MAT.tower3]));
  m.position.set(cx, h / 2, cz);
  worldGroup.add(m);
  const trim = accent || randPick([MAT.neonCyan, MAT.neonMagenta, MAT.neonGreen, MAT.neonBlue, MAT.neonOrange]);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.35, h, 0.35), trim);
    p.position.set(cx + sx * (w / 2), h / 2, cz + sz * (d / 2));
    worldGroup.add(p);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), MAT.tower2);
  roof.position.set(cx, h + 0.12, cz);
  worldGroup.add(roof);
  for (const [ex, ez, ew, ed] of [[0, -d / 2, w + 0.4, 0.35], [0, d / 2, w + 0.4, 0.35], [-w / 2, 0, 0.35, d + 0.4], [w / 2, 0, 0.35, d + 0.4]]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(ew, 0.35, ed), trim);
    strip.position.set(cx + ex, h + 0.15, cz + ez);
    worldGroup.add(strip);
  }
  if (Math.random() < 0.3) {
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.35, 6, 5), trim);
    spire.position.set(cx, h + 3, cz);
    worldGroup.add(spire);
  }
  buildings.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h });
  if (h > 12 && h < 34) spawnRoofs.push(new THREE.Vector3(cx, h + EYE, cz));
}

const BLOCK = 46;
function blockIsReserved(cx, cz) {
  for (const key of Object.keys(L)) {
    const p = L[key];
    if (Math.abs(p.x - cx) < BLOCK * 0.7 && Math.abs(p.z - cz) < BLOCK * 0.7) return key;
  }
  return null;
}

function buildCity() {
  for (let i = -6; i <= 6; i++) {
    const c = i * BLOCK;
    if (Math.abs(c) > CITY_R) continue;
    const laneX = new THREE.Mesh(new THREE.PlaneGeometry(0.5, CITY_R * 2), MAT.lane);
    laneX.rotation.x = -Math.PI / 2;
    laneX.position.set(c, 0.26, 0);
    worldGroup.add(laneX);
    const laneZ = new THREE.Mesh(new THREE.PlaneGeometry(CITY_R * 2, 0.5), MAT.lane);
    laneZ.rotation.x = -Math.PI / 2;
    laneZ.position.set(0, 0.26, c);
    worldGroup.add(laneZ);
  }
  for (let gx = -5; gx <= 5; gx++) {
    for (let gz = -5; gz <= 5; gz++) {
      const cx = gx * BLOCK + BLOCK / 2;
      const cz = gz * BLOCK + BLOCK / 2;
      if (Math.hypot(cx, cz) > CITY_R - 20) continue;
      if (blockIsReserved(cx, cz)) continue;
      const n = Math.random() < 0.35 ? 2 : 1;
      if (n === 1) {
        addBuilding(cx + (Math.random() - 0.5) * 6, cz + (Math.random() - 0.5) * 6, 16 + Math.random() * 12, 16 + Math.random() * 12, 14 + Math.random() * 42);
      } else {
        addBuilding(cx - 8, cz - 6, 12 + Math.random() * 4, 12 + Math.random() * 4, 12 + Math.random() * 30);
        addBuilding(cx + 8, cz + 7, 12 + Math.random() * 4, 12 + Math.random() * 4, 16 + Math.random() * 38);
      }
    }
  }
  for (let i = 0; i < 42; i++) spawnPed();
  for (let i = 0; i < 14; i++) {
    const axis = Math.random() < 0.5 ? 'x' : 'z';
    const lane = (Math.floor(Math.random() * 11) - 5) * BLOCK + (Math.random() < 0.5 ? -3.5 : 3.5);
    const mesh = new THREE.Mesh(GEO.car, randPick([MAT.carA, MAT.carB, MAT.carC]));
    if (axis === 'z') mesh.rotation.y = Math.PI / 2;
    mesh.position.y = 1.1;
    worldGroup.add(mesh);
    cars.push({ mesh, axis, lane, t: Math.random() * CITY_R * 2 - CITY_R, dir: Math.random() < 0.5 ? 1 : -1, speed: 16 + Math.random() * 10 });
  }
}

// ---------------------------------------------------------- swinger rig (you, and the bots)
// A swinger = capsule body + head/eyes + LEFT tentacle arm (short, animated)
// + RIGHT tentacle arm whose tube IS the grapple: it stretches from the
// right shoulder to the anchor when swinging, or to the punch target.
function makeSwinger(bodyMat, tentMat) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.5, 6, 12), bodyMat);
  body.position.y = 0.75;
  g.add(body);
  for (const sx of [-0.16, 0.16]) {
    const ew = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), MAT.eyeW);
    ew.position.set(sx, 0.98, 0.34);
    g.add(ew);
    const eb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), MAT.eyeB);
    eb.position.set(sx, 0.98, 0.43);
    g.add(eb);
  }
  const armL = new THREE.Mesh(new THREE.BufferGeometry(), tentMat);
  armL.frustumCulled = false;
  const armR = new THREE.Mesh(new THREE.BufferGeometry(), tentMat);
  armR.frustumCulled = false;
  scene.add(armL); scene.add(armR);
  const fist = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 10), MAT.sucker);
  fist.visible = false;
  scene.add(fist);
  scene.add(g);
  return { group: g, armL, armR, fist };
}

function setTube(mesh, points, radius, tubular = 10) {
  mesh.geometry.dispose();
  mesh.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), tubular, radius, 6, false);
}

// shoulder world positions for a swinger group
function shoulder(group, side, out) {
  out.set(side * 0.45, 0.85, 0.1);
  out.applyQuaternion(group.quaternion);
  out.add(group.position);
  return out;
}

// animate a swinger's arms. reach = world point the RIGHT arm stretches to (or null)
function poseArms(rig, t, phase, reach, vel) {
  const g = rig.group;
  const sL = shoulder(g, -1, _v1).clone();
  const swayL = Math.sin(t * 4 + phase) * 0.15;
  _v2.set(-0.5, -0.3 + swayL, 0.15).applyQuaternion(g.quaternion);
  const l1 = sL.clone().add(_v2);
  _v2.set(-0.65, -0.75 + swayL * 1.6, 0.1 - (vel ? Math.min(0.6, vel.length() * 0.02) : 0)).applyQuaternion(g.quaternion);
  const l2 = sL.clone().add(_v2);
  setTube(rig.armL, [sL, l1, l2], 0.09, 7);

  const sR = shoulder(g, 1, _v1).clone();
  if (reach) {
    const mid = sR.clone().lerp(reach, 0.5);
    mid.y += sR.distanceTo(reach) * 0.03;
    setTube(rig.armR, [sR, mid, reach.clone()], 0.11, 12);
    rig.fist.visible = true;
    rig.fist.position.copy(reach);
  } else {
    const swayR = Math.cos(t * 4.5 + phase) * 0.15;
    _v2.set(0.5, -0.3 + swayR, 0.15).applyQuaternion(g.quaternion);
    const r1 = sR.clone().add(_v2);
    _v2.set(0.65, -0.75 + swayR * 1.6, 0.1 - (vel ? Math.min(0.6, vel.length() * 0.02) : 0)).applyQuaternion(g.quaternion);
    const r2 = sR.clone().add(_v2);
    setTube(rig.armR, [sR, r1, r2], 0.09, 7);
    rig.fist.visible = false;
  }
}

// ---------------------------------------------------------- people
function buildPerson(bodyMat, skin) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(GEO.npcBody, bodyMat);
  body.position.y = 0.34;
  g.add(body);
  const head = new THREE.Mesh(GEO.head, skin || MAT.skinA);
  head.position.y = 0.88;
  g.add(head);
  for (const sx of [-0.09, 0.09]) {
    const eye = new THREE.Mesh(GEO.eye, MAT.eyeB);
    eye.position.set(sx, 0.94, 0.19);
    g.add(eye);
  }
  for (const sx of [-0.08, 0.08]) {
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.28, 4), skin || MAT.skinA);
    ant.position.set(sx, 1.2, 0);
    ant.rotation.z = -sx * 2;
    g.add(ant);
  }
  return g;
}

function roadPoint() {
  const lane = (Math.floor(Math.random() * 11) - 5) * BLOCK;
  const t = Math.random() * CITY_R * 1.6 - CITY_R * 0.8;
  const off = (Math.random() - 0.5) * 10;
  return Math.random() < 0.5
    ? new THREE.Vector3(lane + off, 0.2, t)
    : new THREE.Vector3(t, 0.2, lane + off);
}

function spawnPed() {
  const skin = randPick([MAT.skinA, MAT.skinB, MAT.skinC, MAT.skinD]);
  const g = buildPerson(randPick([MAT.pedA, MAT.pedB, MAT.pedC]), skin);
  g.position.copy(roadPoint());
  worldGroup.add(g);
  peds.push({ group: g, target: roadPoint(), speed: 1.2 + Math.random() * 1.6, dead: false, removed: false, vel: new THREE.Vector3(), spin: 0, life: 3, panic: 0 });
}

function spawnGunner(pos, flags) {
  const g = buildPerson(Math.random() < 0.5 ? MAT.suit : MAT.suit2, MAT.skinA);
  const gun = new THREE.Mesh(GEO.gun, MAT.gun);
  gun.position.set(0.26, 0.55, 0.2);
  g.add(gun);
  const muzzle = new THREE.Mesh(GEO.muzzle, MAT.flash);
  muzzle.position.set(0.26, 0.55, 0.55);
  muzzle.scale.setScalar(0.01);
  g.add(muzzle);
  g.position.copy(pos);
  worldGroup.add(g);
  enemies.push({
    group: g, muzzle, dead: false, removed: false,
    cd: 1 + Math.random() * 2, vel: new THREE.Vector3(), spin: 0, life: 3, flashT: 0,
    goon: !!(flags && flags.goon), guard: !!(flags && flags.guard),
  });
}

function makeNPC(pos, mat, name, talk, prop) {
  const g = buildPerson(mat, MAT.skinB);
  if (prop === 'mask') {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.2, 8), MAT.mask);
    m.position.set(0, 0.9, 0.23);
    g.add(m);
  } else if (prop === 'hat') {
    const h = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.4, 6), MAT.hullDark);
    h.position.y = 1.25;
    g.add(h);
  } else if (prop === 'wrench') {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), MAT.hull);
    w.position.set(0.35, 0.5, 0);
    w.rotation.z = 0.6;
    g.add(w);
  }
  g.position.copy(pos);
  worldGroup.add(g);
  npcs.push({ group: g, pos: pos.clone(), name, talk });
}

function makePatrolSaucer(pos) {
  const group = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1.9, 16, 10), MAT.hull);
  hull.scale.set(1, 0.34, 1);
  group.add(hull);
  const band = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.3, 8, 22), MAT.hullDark);
  band.rotation.x = Math.PI / 2;
  group.add(band);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), MAT.dome);
  dome.position.y = 0.35;
  group.add(dome);
  const lightA = new THREE.Mesh(new THREE.SphereGeometry(0.24, 6, 6), MAT.lightRed);
  lightA.position.set(-0.5, 0.95, 0);
  group.add(lightA);
  const lightB = new THREE.Mesh(new THREE.SphereGeometry(0.24, 6, 6), MAT.lightBlue);
  lightB.position.set(0.5, 0.95, 0);
  group.add(lightB);
  group.position.copy(pos);
  worldGroup.add(group);
  pursuers.push({
    group, lightA, lightB, cd: 2 + Math.random(), phase: Math.random() * Math.PI * 2,
    home: pos.clone(), active: false, hp: 3, crashed: false, respawnAt: 0,
  });
}

// ---------------------------------------------------------- districts
const L = {
  spawn: new THREE.Vector3(8, 0, 190),
  hideout: new THREE.Vector3(30, 0, 165),
  mask: new THREE.Vector3(-70, 0, 115),
  hunter: new THREE.Vector3(115, 0, 70),
  camp: new THREE.Vector3(160, 0, 120),
  dealer: new THREE.Vector3(-150, 0, -35),
  rocket: new THREE.Vector3(-45, 0, -215),
  depot: new THREE.Vector3(120, 0, -150),
};
let hideoutRoof = 38;

function buildDistricts() {
  addBuilding(L.hideout.x, L.hideout.z, 20, 20, hideoutRoof, MAT.neonMagenta);

  addBuilding(L.mask.x - 14, L.mask.z, 14, 14, 12, MAT.neonMagenta);
  const sign = new THREE.Mesh(new THREE.CircleGeometry(2.2, 8), MAT.mask);
  sign.position.set(L.mask.x - 7, 8, L.mask.z);
  sign.rotation.y = Math.PI / 2;
  worldGroup.add(sign);
  makeNPC(new THREE.Vector3(L.mask.x, 0.2, L.mask.z), MAT.npc1, 'THE MASK MAKER', talkMaskMaker, 'mask');
  makeBeam(L.mask, MAT.beamPurple);

  addBuilding(L.hunter.x + 14, L.hunter.z, 14, 18, 16, MAT.neonOrange);
  makeNPC(new THREE.Vector3(L.hunter.x, 0.2, L.hunter.z), MAT.npc2, 'OLD ZEB', talkHunter, 'hat');
  makeBeam(L.hunter, MAT.beamOrange);

  for (const [tx, tz] of [[L.camp.x - 5, L.camp.z], [L.camp.x + 4, L.camp.z + 5], [L.camp.x, L.camp.z - 6]]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(2, 1.4, 2), MAT.hullDark);
    c.position.set(tx, 0.9, tz);
    worldGroup.add(c);
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    spawnGunner(new THREE.Vector3(L.camp.x + Math.cos(a) * 5, 0.2, L.camp.z + Math.sin(a) * 5), { goon: true });
  }
  makeBeam(L.camp, MAT.beamRed);

  for (let k = 0; k < 7; k++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1 + Math.random() * 1.6, 0.6 + Math.random(), 1 + Math.random()), MAT.hullDark);
    b.position.set(L.dealer.x + (Math.random() - 0.5) * 12, 0.7, L.dealer.z + (Math.random() - 0.5) * 12);
    b.rotation.y = Math.random() * 3;
    worldGroup.add(b);
  }
  makeNPC(new THREE.Vector3(L.dealer.x, 0.2, L.dealer.z), MAT.npc3, 'RUSTY', talkDealer, 'hat');
  makeBeam(L.dealer, MAT.beamYellow);

  const padDisc = new THREE.Mesh(new THREE.CylinderGeometry(10, 11, 0.8, 10), MAT.hullDark);
  padDisc.position.set(L.rocket.x, 0.6, L.rocket.z);
  worldGroup.add(padDisc);
  rocket = new THREE.Group();
  const rbody = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 8, 10), MAT.rocket);
  rbody.position.y = 5;
  rocket.add(rbody);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3, 10), MAT.rocketFin);
  nose.position.y = 10.5;
  rocket.add(nose);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.6, 1.4), MAT.rocketFin);
    fin.position.set(Math.cos(a) * 1.8, 2, Math.sin(a) * 1.8);
    fin.rotation.y = -a;
    rocket.add(fin);
  }
  rocket.position.set(L.rocket.x, 1, L.rocket.z);
  rocket.rotation.z = 0.12;
  worldGroup.add(rocket);
  makeNPC(new THREE.Vector3(L.rocket.x + 7, 0.2, L.rocket.z + 3), MAT.npc4, 'PIA THE MECHANIC', talkMechanic, 'wrench');
  makeBeam(L.rocket, MAT.beamWhite);

  const slab = new THREE.Mesh(new THREE.CylinderGeometry(12, 13, 1, 10), MAT.hullDark);
  slab.position.set(L.depot.x, 0.7, L.depot.z);
  worldGroup.add(slab);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    spawnGunner(new THREE.Vector3(L.depot.x + Math.cos(a) * 8, 1.2, L.depot.z + Math.sin(a) * 8), { guard: true });
  }
  for (let k = 0; k < 3; k++) {
    makePatrolSaucer(new THREE.Vector3(L.depot.x + (k - 1) * 6, 9, L.depot.z - 9));
  }
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), MAT.hullDark);
  crate.position.set(L.depot.x, 1.9, L.depot.z);
  worldGroup.add(crate);
  fuelCell = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 0.8), MAT.fuel);
  fuelCell.position.set(L.depot.x, 3.2, L.depot.z);
  worldGroup.add(fuelCell);
  makeBeam(L.depot, MAT.beamRed);

  objectiveBeam = makeBeam(L.mask, MAT.beamGold);
  objectiveBeam.visible = false;
}

// ---------------------------------------------------------- quest chain (story mode)
const CHAIN = [
  { t: 'BLEND IN', o: 'Find the Mask Maker (GOLD beam) and get a disguise', tgt: () => L.mask },
  { t: 'GET A WEAPON', o: 'Visit Old Zeb at the pawn shop', tgt: () => L.hunter },
  { t: 'ALLEY CLEANOUT', o: 'Punch the goons in the alley', n: 4, tgt: () => L.camp },
  { t: 'CLAIM YOUR ZAPPER', o: 'Return to Old Zeb', tgt: () => L.hunter },
  { t: 'ROCKET RUMORS', o: 'Ask Rusty at the scrapyard about the rocket', tgt: () => L.dealer },
  { t: 'SCRAP RUN', o: 'Collect scrap (two are on ROOFTOPS — swing up!)', n: 4, tgt: () => nearestScrap() },
  { t: 'THE MECHANIC', o: 'Bring the scrap to Pia at the launch pad', tgt: () => L.rocket },
  { t: 'FUEL HEIST', o: 'Steal a fuel cell from the patrol depot', tgt: () => L.depot },
  { t: 'LAUNCH!', o: 'Swing back to the rocket — GO GO GO', tgt: () => L.rocket },
];
let chainIdx = 0;
let questN = 0;
let disguised = false;
let hasGun = false;
let hasFuel = false;
let alarm = false;

function nearestScrap() {
  let bp = L.dealer, bd = Infinity;
  for (const s of scraps) {
    if (s.taken) continue;
    const d = s.mesh.position.distanceTo(P.pos);
    if (d < bd) { bd = d; bp = s.mesh.position; }
  }
  return bp;
}

function advanceChain() {
  chainIdx++;
  questN = 0;
  sfx.quest();
  if (chainIdx < CHAIN.length) popTextScreen(`NEW QUEST: ${CHAIN[chainIdx].t}`);
  if (chainIdx === 5) spawnScraps();
}

function spawnScraps() {
  const spots = [];
  const roofs = buildings
    .map((b) => ({ b, d: Math.hypot((b.minX + b.maxX) / 2 - L.dealer.x, (b.minZ + b.maxZ) / 2 - L.dealer.z) }))
    .filter((o) => o.d > 20 && o.d < 120)
    .sort((a, b) => a.d - b.d)
    .slice(0, 2);
  for (const o of roofs) spots.push(new THREE.Vector3((o.b.minX + o.b.maxX) / 2, o.b.h + 1, (o.b.minZ + o.b.maxZ) / 2));
  spots.push(new THREE.Vector3(L.dealer.x + 40, 1.2, L.dealer.z + 45));
  spots.push(new THREE.Vector3(L.dealer.x - 25, 1.2, L.dealer.z - 60));
  for (const p of spots) {
    const m = new THREE.Mesh(new THREE.TorusKnotGeometry(0.5, 0.16, 32, 6), MAT.scrap);
    m.position.copy(p);
    worldGroup.add(m);
    scraps.push({ mesh: m, taken: false });
  }
}

function talkMaskMaker() {
  if (chainIdx === 0) {
    openDialog([
      { who: 'THE MASK MAKER', text: 'Ohoho. A face the whole quadrant has on a poster. Hold still, fugitive...' },
      { who: 'THE MASK MAKER', text: 'There. Chitin-fibre, spore-glue, two eye holes. Even your mother would walk right past you.' },
      { who: 'SPLORT', text: 'I can already feel the not-being-arrested.' },
    ], () => {
      disguised = true;
      P.heat = 0;
      popTextScreen('DISGUISE ACQUIRED — the patrol no longer recognizes you');
      advanceChain();
    });
  } else {
    openDialog([{ who: 'THE MASK MAKER', text: 'Nice face, stranger. Wink.' }]);
  }
}
function talkHunter() {
  if (chainIdx === 1) {
    openDialog([
      { who: 'OLD ZEB', text: 'A zapper? Zappers ain’t free, masked stranger.' },
      { who: 'OLD ZEB', text: 'Goons shook down my shop and set up in the alley east of here. Knock four of them over, and we’ll talk hardware.' },
    ], () => advanceChain());
  } else if (chainIdx === 3) {
    openDialog([
      { who: 'OLD ZEB', text: 'HA! I watched the third one bounce off a hovercar. A deal’s a deal —' },
      { who: 'OLD ZEB', text: 'One ZAPPER. Slightly chewed. LEFT CLICK to fire. Try not to point it at me.' },
    ], () => {
      hasGun = true;
      popTextScreen('ZAPPER ACQUIRED — LEFT CLICK to shoot');
      advanceChain();
    });
  } else if (chainIdx === 2) {
    openDialog([{ who: 'OLD ZEB', text: `Four goons. You’ve tipped ${questN}. Get on with it.` }]);
  } else {
    openDialog([{ who: 'OLD ZEB', text: 'A rocket, eh? Rusty at the scrapyard knows every bolt in this city.' }]);
  }
}
function talkDealer() {
  if (chainIdx === 4) {
    openDialog([
      { who: 'RUSTY', text: 'A rocket? There’s ONE. The old mail rocket on the south-west pad. Crooked as my back but she’ll fly.' },
      { who: 'RUSTY', text: 'Bring me 4 pieces of good scrap and I’ll send the parts to Pia. Check the CYAN glows — two are up on the towers.' },
    ], () => advanceChain());
  } else if (chainIdx === 5) {
    openDialog([{ who: 'RUSTY', text: `Scrap count: ${questN}/4. The rooftop ones are the good stuff.` }]);
  } else {
    openDialog([{ who: 'RUSTY', text: 'No refunds.' }]);
  }
}
function talkMechanic() {
  if (chainIdx === 6) {
    openDialog([
      { who: 'PIA', text: 'Rusty’s scrap came through. Give me a second—' },
      { who: 'PIA', text: '*clang* *clang* ...Done. One problem: the tank is DRY.' },
      { who: 'PIA', text: 'The patrol depot keeps fuel cells. Steal one. This is where your day gets LOUD.' },
    ], () => {
      rocket.rotation.z = 0;
      advanceChain();
    });
  } else if (chainIdx === 7) {
    openDialog([{ who: 'PIA', text: 'Fuel cell. Depot. Loud. You know the plan.' }]);
  } else if (chainIdx === 8) {
    openDialog([{ who: 'PIA', text: 'GET IN THE ROCKET!' }]);
  } else {
    openDialog([{ who: 'PIA', text: 'I fix things. It’s a living.' }]);
  }
}

// ---------------------------------------------------------- dialogue
let dlg = null;
let talkCd = 0;
function openDialog(lines, onDone) {
  dlg = { lines, idx: 0, onDone };
  sfx.talk();
  showDlgLine();
  ui.cutscene.classList.remove('hidden');
  ui.cutSkip.textContent = 'CLOSE ▸';
}
function showDlgLine() {
  const l = dlg.lines[dlg.idx];
  ui.cutSpeaker.textContent = l.who;
  ui.cutSpeaker.classList.remove('hidden');
  ui.cutText.classList.remove('system');
  ui.cutText.textContent = l.text;
}
function advanceDialog() {
  if (!dlg) return;
  dlg.idx++;
  if (dlg.idx >= dlg.lines.length) {
    const done = dlg.onDone;
    dlg = null;
    talkCd = elapsed + 2.5;
    ui.cutscene.classList.add('hidden');
    if (done) done();
  } else {
    sfx.talk();
    showDlgLine();
  }
}

// ---------------------------------------------------------- particles
const particles = [];
for (let i = 0; i < 70; i++) {
  const m = new THREE.Mesh(GEO.bit, MAT.spore);
  m.visible = false;
  scene.add(m);
  particles.push({ mesh: m, vel: new THREE.Vector3(), life: 0 });
}
let pIdx = 0;
function burst(pos, mat, n, speed, up = 4) {
  for (let i = 0; i < n; i++) {
    const p = particles[pIdx = (pIdx + 1) % particles.length];
    p.mesh.visible = true;
    p.mesh.material = mat;
    p.mesh.position.copy(pos);
    p.vel.set((Math.random() - 0.5) * speed, Math.random() * up, (Math.random() - 0.5) * speed);
    p.life = 0.6 + Math.random() * 0.5;
  }
}
function updateParticles(dt) {
  for (const p of particles) {
    if (p.life <= 0) { p.mesh.visible = false; continue; }
    p.life -= dt;
    p.vel.y -= 14 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.rotation.x += 6 * dt; p.mesh.rotation.y += 5 * dt;
  }
}

// ---------------------------------------------------------- player state
const P = {
  state: 'menu', // menu | cutscene | walk | air | swing | won | dead(respawning)
  pos: new THREE.Vector3(), vel: new THREE.Vector3(),
  hp: 100, score: 0, punches: 0, kos: 0, deaths: 0,
  heat: 0, gunCd: 0, startTime: 0, groundY: 0.2,
  comboStep: 0, comboT: 0, comboCount: 0, attackAnim: null, respawnAt: 0,
};
const playerRig = makeSwinger(MAT.body, MAT.tentacle);
playerRig.group.visible = false;
let swing = null;
let best = 0;
try { best = parseInt(localStorage.getItem('ssw_best') || '0', 10) || 0; } catch (e) {}
ui.best.textContent = best;

let shake = 0;
let fov = 74, fovTarget = 74;
let camFwd = new THREE.Vector3(0, 0, -1);
let yaw = 0, pitch = -0.15;
let elapsed = 0;
let stepT = 0;
let escapeTimer = 0;
let lastSiren = -10;
let cutsceneSeen = false;
let cut = null;
let cutBody = null;
let pointerLocked = false;
const mouse = { x: 0, y: 0 };
const keys = {};

// match state
let matchTime = 0;
let matchOver = false;
const BOT_NAMES = ['Zorblax_99', 'xX_Tenta_Xx', 'SlurpMaster', 'GleepGlorp', 'NoodleArms', 'Sir_Squidly', 'WetBandit', 'Calamari_Carl'];

// ---------------------------------------------------------- shift lock
function requestLock() {
  const el = renderer.domElement;
  if (el.requestPointerLock) { try { el.requestPointerLock(); } catch (e) {} }
}
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
  ui.crosshair.classList.toggle('locked', pointerLocked);
});
document.addEventListener('pointerlockerror', () => { pointerLocked = false; });
window.addEventListener('mousemove', (ev) => {
  if (pointerLocked) {
    yaw += ev.movementX * 0.0026;
    pitch = THREE.MathUtils.clamp(pitch - ev.movementY * 0.0023, -1.1, 0.9);
  } else {
    mouse.x = (ev.clientX / window.innerWidth) * 2 - 1;
    mouse.y = (ev.clientY / window.innerHeight) * 2 - 1;
  }
});

// ---------------------------------------------------------- swing mechanics
const anchorMarker = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 10), MAT.anchor);
anchorMarker.visible = false;
scene.add(anchorMarker);

function findAnchor() {
  let bestP = null, bestScore = 0.3;
  const eye = P.pos;
  for (const b of buildings) {
    const px = THREE.MathUtils.clamp(eye.x, b.minX, b.maxX);
    const pz = THREE.MathUtils.clamp(eye.z, b.minZ, b.maxZ);
    const py = b.h + 0.3;
    if (py < eye.y - 18) continue;
    _v1.set(px - eye.x, py - eye.y, pz - eye.z);
    const d = _v1.length();
    if (d < 7 || d > 75) continue;
    _v1.divideScalar(d);
    const align = _v1.dot(camFwd);
    if (align < 0.08) continue;
    const score = align * 1.6 - d * 0.006 + (py - eye.y) * 0.004;
    if (score > bestScore) {
      bestScore = score;
      bestP = new THREE.Vector3(px, py, pz);
    }
  }
  return bestP;
}

function startSwing() {
  const a = findAnchor();
  if (!a) { sfx.whiff(); return false; }
  const d = a.distanceTo(P.pos);
  swing = { anchor: a, len: Math.max(7, Math.min(d * 0.97, 55)) };
  if (P.state === 'walk') P.vel.y = Math.max(P.vel.y, 3);
  P.state = 'swing';
  sfx.attach();
  return true;
}

function endSwing(silent) {
  if (P.state === 'swing') P.state = 'air';
  swing = null;
  if (!silent) sfx.release();
}

function applySwingPhysics(dt) {
  P.vel.y -= 28 * dt;
  _v1.set(camFwd.x, 0, camFwd.z).normalize();
  if (keys['KeyW'] || keys['ArrowUp']) P.vel.addScaledVector(_v1, 14 * dt);
  if (keys['KeyS'] || keys['ArrowDown']) P.vel.addScaledVector(_v1, -8 * dt);
  _v2.crossVectors(_v1, _v3.set(0, 1, 0));
  if (keys['KeyA'] || keys['ArrowLeft']) P.vel.addScaledVector(_v2, 9 * dt);
  if (keys['KeyD'] || keys['ArrowRight']) P.vel.addScaledVector(_v2, -9 * dt);
  P.pos.addScaledVector(P.vel, dt);
  _v1.copy(P.pos).sub(swing.anchor);
  const d = _v1.length();
  if (d > swing.len) {
    _v1.divideScalar(d);
    P.pos.copy(swing.anchor).addScaledVector(_v1, swing.len);
    const radial = P.vel.dot(_v1);
    if (radial > 0) P.vel.addScaledVector(_v1, -radial);
  }
  P.vel.multiplyScalar(1 - 0.06 * dt);
}

function collide() {
  for (const b of buildings) {
    if (P.pos.x > b.minX - 0.5 && P.pos.x < b.maxX + 0.5 &&
        P.pos.z > b.minZ - 0.5 && P.pos.z < b.maxZ + 0.5 &&
        P.pos.y - EYE < b.h - 0.4) {
      const dxl = P.pos.x - (b.minX - 0.5), dxr = (b.maxX + 0.5) - P.pos.x;
      const dzl = P.pos.z - (b.minZ - 0.5), dzr = (b.maxZ + 0.5) - P.pos.z;
      const m = Math.min(dxl, dxr, dzl, dzr);
      if (m === dxl) { P.pos.x = b.minX - 0.5; if (P.vel.x > 0) P.vel.x = 0; }
      else if (m === dxr) { P.pos.x = b.maxX + 0.5; if (P.vel.x < 0) P.vel.x = 0; }
      else if (m === dzl) { P.pos.z = b.minZ - 0.5; if (P.vel.z > 0) P.vel.z = 0; }
      else { P.pos.z = b.maxZ + 0.5; if (P.vel.z < 0) P.vel.z = 0; }
    }
  }
  const g = groundAt(P.pos.x, P.pos.z);
  if (P.pos.y - EYE <= g + 0.05 && P.vel.y <= 0.01) {
    const impact = -P.vel.y;
    P.pos.y = g + EYE;
    P.groundY = g;
    if (P.state === 'swing') endSwing(true);
    if (P.state !== 'walk') {
      if (impact > 34) { hurt(Math.min(35, (impact - 30) * 2), null); popTextScreen('OOF.'); }
      sfx.land();
    }
    P.vel.set(0, 0, 0);
    P.state = 'walk';
    return true;
  }
  return false;
}

// ---------------------------------------------------------- combat: combos
function allTargets() {
  const list = [];
  if (mode === 'match') {
    for (const b of bots) if (!b.dead) list.push({ kind: 'bot', e: b, pos: b.group.position });
  }
  for (const e of enemies) if (!e.dead && !e.removed) list.push({ kind: 'enemy', e, pos: e.group.position });
  for (const p of peds) if (!p.dead && !p.removed) list.push({ kind: 'ped', e: p, pos: p.group.position });
  return list;
}

function nearestTarget(range) {
  let bestT = null, bs = Infinity;
  for (const t of allTargets()) {
    const d = t.pos.distanceTo(P.pos);
    if (d > range) continue;
    const s = d - (t.kind === 'bot' ? 2.5 : 0); // in a match, the other swingers matter most
    if (s < bs) { bs = s; bestT = t; }
  }
  return bestT;
}

function attack() {
  if (P.attackAnim) return;
  if (P.state !== 'walk' && P.state !== 'air' && P.state !== 'swing') return;
  // combo timing: chain within 0.9s
  if (elapsed - P.comboT < 0.9) P.comboStep = (P.comboStep % 3) + 1;
  else P.comboStep = 1;
  P.comboT = elapsed;
  const target = nearestTarget(MELEE_RANGE);
  const reach = target ? target.pos.clone().add(_v3.set(0, 0.8, 0)) : P.pos.clone().addScaledVector(camFwd, 3);
  P.attackAnim = { target, reach, t: 0, step: P.comboStep };
  // lunge toward the target
  if (target) {
    _v1.copy(target.pos).sub(P.pos).setY(0).normalize();
    P.vel.addScaledVector(_v1, 4);
  }
  whoosh(0.1, 0.1);
}

function updateAttack(dt) {
  const a = P.attackAnim;
  if (!a) return;
  a.t += dt / 0.22;
  if (a.t >= 0.5 && !a.hitDone) {
    a.hitDone = true;
    if (a.target && !a.target.e.dead) {
      const dmg = [10, 12, 20][a.step - 1];
      hitEntity(a.target, dmg, a.step === 3);
      P.comboCount += 1;
      ui.combo.textContent = 'COMBO x' + P.comboCount;
      ui.combo.classList.remove('hidden');
      ui.combo.classList.remove('pop2');
      void ui.combo.offsetWidth;
      ui.combo.classList.add('pop2');
      [sfx.hit1, sfx.hit2, sfx.hit3][a.step - 1]();
      shake = Math.min(1, shake + 0.2 + a.step * 0.1);
    } else {
      P.comboCount = 0;
      ui.combo.classList.add('hidden');
      sfx.whiff();
    }
  }
  if (a.t >= 1) P.attackAnim = null;
}

function hitEntity(t, dmg, launcher) {
  const e = t.e;
  burst(t.pos, MAT.bullet, 6, 8, 6);
  if (t.kind === 'bot') {
    e.hp -= dmg;
    e.staggerT = 0.35;
    _v1.copy(e.group.position).sub(P.pos).setY(0).normalize();
    e.knock.set(_v1.x * (launcher ? 14 : 6), launcher ? 11 : 3, _v1.z * (launcher ? 14 : 6));
    if (e.hp <= 0) botKO(e, 'You');
    return;
  }
  // peds and story gunners are one-combo folk
  e.dead = true;
  _v1.copy(t.pos).sub(P.pos).normalize();
  e.vel.set(_v1.x * (launcher ? 19 : 12), launcher ? 14 : 9, _v1.z * (launcher ? 19 : 12));
  e.spin = 8 + Math.random() * 8;
  e.life = 2.5;
  P.punches += 1;
  if (t.kind === 'ped') {
    if (mode === 'story') { P.heat = Math.min(100, P.heat + 30); popText(t.pos, 'ASSAULT! 🚨', 'pow'); }
    else popText(t.pos, 'BYSTANDER!', 'pow');
  } else {
    P.score += 25;
    P.hp = Math.min(100, P.hp + 10);
    if (e.guard) P.heat = Math.min(100, P.heat + 26);
    popText(t.pos, launcher ? 'LAUNCHED!' : 'POW!', 'pow');
    if (mode === 'story' && chainIdx === 2 && e.goon) {
      questN += 1;
      popTextScreen(`GOONS TIPPED: ${questN}/4`);
      if (questN >= 4) { advanceChain(); popTextScreen('Return to OLD ZEB for your zapper'); }
    }
  }
}

// ---------------------------------------------------------- zapper (story)
function fireZapper() {
  if (!hasGun || P.gunCd > 0) return;
  P.gunCd = 0.28;
  let aimDir = camFwd.clone();
  let bs = 0.92;
  for (const t of allTargets()) {
    _v1.copy(t.pos).sub(P.pos);
    const d = _v1.length();
    if (d > 70) continue;
    _v1.divideScalar(d);
    if (_v1.dot(camFwd) > bs) { bs = _v1.dot(camFwd); aimDir = _v1.clone(); }
  }
  for (const u of pursuers) {
    if (!u.active || u.crashed) continue;
    _v1.copy(u.group.position).sub(P.pos);
    const d = _v1.length();
    if (d > 85) continue;
    _v1.divideScalar(d);
    if (_v1.dot(camFwd) > bs) { bs = _v1.dot(camFwd); aimDir = _v1.clone(); }
  }
  const m = new THREE.Mesh(GEO.bolt, MAT.bolt);
  m.position.copy(P.pos).addScaledVector(camFwd, 1).add(_v3.set(0, 0.3, 0));
  scene.add(m);
  playerShots.push({ mesh: m, vel: aimDir.multiplyScalar(80), life: 1.4 });
  sfx.pew();
}

function updatePlayerShots(dt) {
  P.gunCd = Math.max(0, P.gunCd - dt);
  for (let i = playerShots.length - 1; i >= 0; i--) {
    const s = playerShots[i];
    s.mesh.position.addScaledVector(s.vel, dt);
    s.life -= dt;
    let hit = false;
    for (const t of allTargets()) {
      if (t.pos.distanceTo(s.mesh.position) < 1.6) {
        hitEntity(t, 34, false);
        sfx.hit2();
        hit = true;
        break;
      }
    }
    if (!hit) {
      for (const u of pursuers) {
        if (!u.active || u.crashed) continue;
        if (u.group.position.distanceTo(s.mesh.position) < 2.6) {
          u.hp -= 1;
          burst(s.mesh.position, MAT.bolt, 5, 6, 5);
          sfx.hit1();
          if (u.hp <= 0) {
            u.crashed = true;
            u.respawnAt = elapsed + 16;
            u.vel = new THREE.Vector3((Math.random() - 0.5) * 6, -2, (Math.random() - 0.5) * 6);
            P.score += 50;
            popText(u.group.position, 'SAUCER DOWN!', 'pow');
          }
          hit = true;
          break;
        }
      }
    }
    if (hit || s.life <= 0) {
      scene.remove(s.mesh);
      playerShots.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------- MATCH MODE: the other swingers
function spawnBot(i) {
  const mats = [[MAT.botA, MAT.botTentA], [MAT.botB, MAT.botTentB], [MAT.botC, MAT.botTentC]];
  const rig = makeSwinger(mats[i % 3][0], mats[i % 3][1]);
  const start = randPick(spawnRoofs) || new THREE.Vector3(0, EYE, 0);
  rig.group.position.set(start.x, start.y - EYE, start.z);
  const bot = {
    rig, group: rig.group, name: BOT_NAMES.splice(Math.floor(Math.random() * BOT_NAMES.length), 1)[0],
    hp: 100, kos: 0, deaths: 0, dead: false,
    state: 'idle', hopFrom: new THREE.Vector3(), hopTo: new THREE.Vector3(), hopT: 0, hopDur: 1,
    target: null, decideT: 0, atkT: 0, comboStep: 0,
    knock: new THREE.Vector3(), staggerT: 0, ragT: 0, respawnAt: 0,
    phase: Math.random() * 6, reach: null,
  };
  bots.push(bot);
  return bot;
}

function botKO(bot, killerName) {
  bot.dead = true;
  bot.deaths += 1;
  bot.ragT = 1.2;
  bot.respawnAt = elapsed + 3;
  bot.knock.y = Math.max(bot.knock.y, 9);
  sfx.ko();
  if (killerName === 'You') { P.kos += 1; P.score += 100; }
  else {
    const killer = bots.find((b) => b.name === killerName);
    if (killer) killer.kos += 1;
  }
  killfeed(`${killerName} KO'd ${bot.name}`);
}

function killfeed(text) {
  const el = document.createElement('div');
  el.className = 'kf';
  el.textContent = text;
  ui.killfeed.prepend(el);
  setTimeout(() => el.remove(), 4200);
  while (ui.killfeed.children.length > 5) ui.killfeed.lastChild.remove();
}

function botPickTarget(bot) {
  const cands = [];
  if (P.state === 'walk' || P.state === 'air' || P.state === 'swing') cands.push({ name: 'You', pos: P.pos, isPlayer: true });
  for (const b of bots) if (b !== bot && !b.dead) cands.push({ name: b.name, pos: b.group.position, bot: b });
  if (!cands.length) return null;
  cands.sort((a, b) => a.pos.distanceTo(bot.group.position) - b.pos.distanceTo(bot.group.position));
  return Math.random() < 0.75 ? cands[0] : randPick(cands);
}

function updateBots(dt) {
  for (const bot of bots) {
    const g = bot.group;
    if (bot.dead) {
      // ragdoll
      bot.knock.y -= 26 * dt;
      g.position.addScaledVector(bot.knock, dt);
      g.rotation.x += 5 * dt;
      if (g.position.y < 0.2) g.position.y = 0.2;
      if (elapsed > bot.respawnAt && !matchOver) {
        bot.dead = false;
        bot.hp = 100;
        g.rotation.set(0, 0, 0);
        const s = randPick(spawnRoofs);
        g.position.set(s.x, s.y - EYE, s.z);
        bot.state = 'idle';
      }
      poseArms(bot.rig, elapsed, bot.phase, null, bot.knock);
      continue;
    }
    if (bot.staggerT > 0) {
      bot.staggerT -= dt;
      bot.knock.y -= 20 * dt;
      g.position.addScaledVector(bot.knock, dt);
      const gy = groundAt(g.position.x, g.position.z);
      if (g.position.y < gy + 0.2) { g.position.y = gy + 0.2; bot.knock.set(0, 0, 0); }
      poseArms(bot.rig, elapsed, bot.phase, null, bot.knock);
      continue;
    }
    bot.decideT -= dt;
    if (bot.decideT <= 0 || !bot.target) {
      bot.decideT = 2 + Math.random() * 2;
      bot.target = botPickTarget(bot);
    }
    const tp = bot.target ? bot.target.pos : null;
    if (bot.state === 'hop') {
      bot.hopT += dt / bot.hopDur;
      const k = Math.min(1, bot.hopT);
      g.position.lerpVectors(bot.hopFrom, bot.hopTo, k);
      g.position.y += Math.sin(k * Math.PI) * bot.hopArc;
      // swing-arm reach to a sky anchor mid-hop — looks like swinging
      bot.reach = bot.hopAnchor;
      if (k >= 1) { bot.state = 'idle'; bot.reach = null; }
    } else if (tp) {
      const d = g.position.distanceTo(tp);
      if (d > 5) {
        // start a swing-hop toward the target
        bot.state = 'hop';
        bot.hopFrom.copy(g.position);
        const over = Math.min(d, 26 + Math.random() * 14);
        _v1.copy(tp).sub(g.position).setY(0).normalize();
        bot.hopTo.copy(g.position).addScaledVector(_v1, over);
        bot.hopTo.y = groundAt(bot.hopTo.x, bot.hopTo.z) + 0.2;
        bot.hopDur = 0.55 + over / 40;
        bot.hopArc = 3 + over * 0.22;
        bot.hopT = 0;
        bot.hopAnchor = g.position.clone().addScaledVector(_v1, over * 0.5).add(_v3.set(0, 18 + Math.random() * 8, 0));
      } else {
        // brawl
        g.rotation.y = Math.atan2(tp.x - g.position.x, tp.z - g.position.z);
        bot.atkT -= dt;
        if (bot.atkT <= 0) {
          bot.atkT = 0.75 + Math.random() * 0.5;
          bot.comboStep = (bot.comboStep % 3) + 1;
          bot.reach = tp.clone().add(_v3.set(0, 0.8, 0));
          setTimeout(() => { if (bot.reach) bot.reach = null; }, 220);
          const launcher = bot.comboStep === 3;
          if (bot.target.isPlayer) {
            if (P.pos.distanceTo(g.position) < 5.5) {
              hurt(launcher ? 16 : 9, bot.name);
              if (launcher) { _v1.copy(P.pos).sub(g.position).setY(0).normalize(); P.vel.addScaledVector(_v1, 12); P.vel.y += 8; if (P.state === 'walk') P.state = 'air'; }
              [sfx.hit1, sfx.hit2, sfx.hit3][bot.comboStep - 1]();
            }
          } else if (bot.target.bot && !bot.target.bot.dead) {
            const tb = bot.target.bot;
            if (tb.group.position.distanceTo(g.position) < 5.5) {
              tb.hp -= launcher ? 16 : 9;
              tb.staggerT = 0.3;
              _v1.copy(tb.group.position).sub(g.position).setY(0).normalize();
              tb.knock.set(_v1.x * (launcher ? 12 : 5), launcher ? 9 : 2, _v1.z * (launcher ? 12 : 5));
              if (tb.hp <= 0) botKO(tb, bot.name);
            }
          }
        }
      }
    }
    // face travel direction while hopping
    if (bot.state === 'hop') {
      _v1.copy(bot.hopTo).sub(bot.hopFrom);
      if (_v1.lengthSq() > 0.1) g.rotation.y = Math.atan2(_v1.x, _v1.z);
    }
    poseArms(bot.rig, elapsed, bot.phase, bot.reach || null, null);
  }
}

// ---------------------------------------------------------- popups & damage
function popText(worldPos, text, cls) {
  _v1.copy(worldPos).project(camera);
  if (_v1.z > 1) return;
  spawnPop(((_v1.x * 0.5 + 0.5) * 100) + '%', ((-_v1.y * 0.5 + 0.5) * 100) + '%', text, cls);
}
function popTextScreen(text) {
  const stacked = ui.pops.querySelectorAll('.pop.sys').length;
  spawnPop('50%', (34 + stacked * 7) + '%', text, 'sys');
}
function spawnPop(left, top, text, cls) {
  const el = document.createElement('div');
  el.className = 'pop ' + (cls || '');
  el.textContent = text;
  el.style.left = left;
  el.style.top = top;
  ui.pops.appendChild(el);
  setTimeout(() => el.remove(), cls === 'sys' ? 2600 : 900);
}

function hurt(dmg, attacker) {
  if (P.state === 'menu' || P.state === 'won' || P.state === 'cutscene' || P.state === 'dead') return;
  P.hp -= dmg;
  sfx.hurt();
  shake = Math.min(1, shake + 0.35);
  ui.flash.classList.remove('on');
  void ui.flash.offsetWidth;
  ui.flash.classList.add('on');
  if (P.hp <= 0) {
    P.hp = 0;
    if (mode === 'match') {
      P.deaths += 1;
      const killer = attacker || 'The pavement';
      killfeed(`${killer} KO'd You`);
      const kb = bots.find((b) => b.name === attacker);
      if (kb) kb.kos += 1;
      sfx.ko();
      endSwing(true);
      P.state = 'dead';
      P.respawnAt = elapsed + 2.5;
      ui.vignette.classList.add('on');
    } else {
      respawnStory('KNOCKED OUT! You wake up back at the plaza. -50', 50);
    }
  }
}

function respawnMatch() {
  const s = randPick(spawnRoofs);
  P.pos.set(s.x, s.y, s.z);
  P.vel.set(0, 0, 0);
  P.hp = 100;
  P.groundY = s.y - EYE;
  P.state = 'walk';
  ui.vignette.classList.remove('on');
}

function respawnStory(msg, penalty) {
  P.score = Math.max(0, P.score - penalty);
  P.hp = 100;
  endSwing(true);
  P.state = 'walk';
  P.pos.set(L.spawn.x, 0.2 + EYE, L.spawn.z);
  P.vel.set(0, 0, 0);
  P.groundY = 0.2;
  P.heat = alarm ? 100 : (disguised ? 0 : 40);
  for (const u of pursuers) if (!u.crashed) u.group.position.copy(u.home);
  escapeTimer = 0;
  popTextScreen(msg);
  shake = 1;
}

function busted() {
  sfx.siren();
  respawnStory('BUSTED! They fined you and dumped you at the plaza. -100', 100);
}

// ---------------------------------------------------------- wanted (story)
function wantedStars() { return P.heat <= 0 ? 0 : Math.min(3, 1 + Math.floor(P.heat / 34)); }

function updateWanted(dt) {
  if (mode !== 'story') { for (const u of pursuers) u.active = false; return; }
  const stars = wantedStars();
  let active = 0;
  for (const u of pursuers) {
    if (u.crashed) { u.active = false; continue; }
    if (active < stars) { u.active = true; active++; } else { u.active = false; }
  }
  if (!alarm) {
    const floor = disguised ? 0 : 40;
    let nearest = Infinity;
    for (const u of pursuers) if (u.active && !u.crashed) nearest = Math.min(nearest, u.group.position.distanceTo(P.pos));
    if (nearest > 70) {
      escapeTimer += dt;
      if (escapeTimer > 4 && P.heat > floor) {
        P.heat = Math.max(floor, P.heat - 7 * dt);
        if (P.heat === floor && floor === 0) popTextScreen('🚨 Heat: cold.');
      }
    } else {
      escapeTimer = 0;
    }
  }
}

function updatePursuers(dt) {
  const hunting = P.state === 'walk' || P.state === 'air' || P.state === 'swing';
  let minD = Infinity;
  for (const u of pursuers) {
    if (u.crashed) {
      if (u.group.position.y > 1.5) {
        u.group.position.addScaledVector(u.vel, dt);
        u.group.position.y -= 9 * dt;
        u.group.rotation.z += 3 * dt;
        if (u.group.position.y <= 1.5) burst(u.group.position, MAT.bullet, 14, 10, 9);
      }
      if (elapsed > u.respawnAt) {
        u.crashed = false;
        u.hp = 3;
        u.group.position.copy(u.home);
        u.group.rotation.set(0, 0, 0);
      }
      continue;
    }
    u.lightA.visible = Math.sin(elapsed * 14 + u.phase) > 0;
    u.lightB.visible = !u.lightA.visible;
    if (u.active && hunting) {
      _v1.copy(P.pos).sub(u.group.position);
      const d = _v1.length();
      minD = Math.min(minD, d);
      if (d > 5) u.group.position.addScaledVector(_v1.normalize(), Math.min(14 * dt, d - 4.5));
      u.group.position.y = Math.max(u.group.position.y, groundAt(u.group.position.x, u.group.position.z) + 4);
      u.group.rotation.y = Math.atan2(_v1.x, _v1.z);
      if (d < 6) { busted(); return; }
      u.cd -= dt;
      if (u.cd <= 0 && d < 75) {
        u.cd = 2.2 + Math.random() * 1.5;
        const lead = _v2.copy(P.pos).addScaledVector(P.vel, d / 32 * 0.4);
        lead.x += (Math.random() - 0.5) * 4;
        lead.y += (Math.random() - 0.5) * 4;
        lead.z += (Math.random() - 0.5) * 4;
        shootAt(u.group.position.clone().add(_v3.set(0, -0.4, 0)), lead, 32);
        sfx.shot(0.06);
      }
    } else {
      _v1.copy(u.home).sub(u.group.position);
      const d = _v1.length();
      if (d > 1) u.group.position.addScaledVector(_v1.normalize(), Math.min(10 * dt, d));
      u.group.position.y = u.home.y + Math.sin(elapsed * 1.5 + u.phase) * 0.4;
      u.group.rotation.z = 0;
    }
  }
  if (mode === 'story' && isFinite(minD) && minD < 30 && elapsed - lastSiren > 1.6) { lastSiren = elapsed; sfx.siren(); }
}

// ---------------------------------------------------------- gunners & peds
function enemyHostile(e) {
  if (mode !== 'story') return false;
  if (e.guard) return true;
  if (e.goon) return chainIdx >= 2 || e.group.position.distanceTo(P.pos) < 10;
  return true;
}

function shootAt(from, target, speed) {
  const m = new THREE.Mesh(GEO.bullet, MAT.bullet);
  m.position.copy(from);
  const dir = target.clone().sub(from).normalize();
  projectiles.push({ mesh: m, vel: dir.multiplyScalar(speed), life: 5 });
  scene.add(m);
}

function updateTumble(e, dt) {
  e.vel.y -= 26 * dt;
  e.group.position.addScaledVector(e.vel, dt);
  e.group.rotation.x += e.spin * dt;
  e.group.rotation.z += e.spin * 0.7 * dt;
  e.life -= dt;
  if (e.life <= 0) { e.removed = true; worldGroup.remove(e.group); }
}

function updateEnemies(dt) {
  const shootable = P.state === 'walk' || P.state === 'air' || P.state === 'swing';
  for (const e of enemies) {
    if (e.removed) continue;
    if (e.dead) { updateTumble(e, dt); continue; }
    const d = e.group.position.distanceTo(P.pos);
    if (d > 90) continue;
    e.group.rotation.y = Math.atan2(P.pos.x - e.group.position.x, P.pos.z - e.group.position.z);
    if (e.flashT > 0) {
      e.flashT -= dt;
      e.muzzle.scale.setScalar(Math.max(0.01, e.flashT * 6));
    }
    const range = e.guard ? 48 : 26;
    if (!shootable || d < 3 || d > range || !enemyHostile(e)) continue;
    e.cd -= dt;
    if (e.cd <= 0) {
      e.cd = 1.4 + Math.random() * 1.6;
      e.flashT = 0.18;
      const from = e.group.localToWorld(_v1.set(0.26, 0.55, 0.6)).clone();
      const lead = _v2.copy(P.pos).addScaledVector(P.vel, d / 30 * 0.5);
      lead.x += (Math.random() - 0.5) * 3.5;
      lead.y += (Math.random() - 0.5) * 3.5;
      lead.z += (Math.random() - 0.5) * 3.5;
      shootAt(from, lead, 30);
      sfx.shot(Math.max(0.02, 0.1 - d * 0.001));
    }
  }
}

function updatePeds(dt) {
  for (const p of peds) {
    if (p.removed) continue;
    if (p.dead) { updateTumble(p, dt); continue; }
    const dP = p.group.position.distanceTo(P.pos);
    if ((wantedStars() > 0 || mode === 'match') && dP < 14) p.panic = 2;
    if (p.panic > 0) {
      p.panic -= dt;
      _v1.copy(p.group.position).sub(P.pos).setY(0).normalize();
      p.group.position.addScaledVector(_v1, 5 * dt);
      p.group.rotation.y = Math.atan2(_v1.x, _v1.z);
      continue;
    }
    _v1.copy(p.target).sub(p.group.position).setY(0);
    const d = _v1.length();
    if (d < 1.5) { p.target = roadPoint(); continue; }
    _v1.divideScalar(d);
    p.group.position.addScaledVector(_v1, p.speed * dt);
    p.group.rotation.y = Math.atan2(_v1.x, _v1.z);
  }
}

function updateProjectiles(dt) {
  const canHit = P.state === 'walk' || P.state === 'air' || P.state === 'swing';
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i];
    pr.mesh.position.addScaledVector(pr.vel, dt);
    pr.life -= dt;
    if (canHit && pr.mesh.position.distanceTo(P.pos) < 1.4) {
      hurt(12, 'Patrol');
      burst(pr.mesh.position, MAT.bullet, 5, 6, 5);
      pr.life = 0;
    }
    if (pr.life <= 0) {
      scene.remove(pr.mesh);
      projectiles.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------- story interactions
function nearXZ(a, b, r, dy) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return dx * dx + dz * dz < r * r && Math.abs(a.y - b.y) < dy;
}

function updateStory(dt) {
  if (P.state === 'walk' && !dlg && elapsed > talkCd) {
    for (const n of npcs) {
      if (nearXZ(n.pos, P.pos, 3.6, 4)) { n.talk(); break; }
    }
  }
  if (chainIdx === 5) {
    for (const s of scraps) {
      if (s.taken) continue;
      s.mesh.rotation.y += dt * 2;
      if (nearXZ(s.mesh.position, P.pos, 4, 6)) {
        s.taken = true;
        worldGroup.remove(s.mesh);
        questN += 1;
        P.score += 15;
        burst(s.mesh.position, MAT.bolt, 8, 7, 6);
        sfx.pickup();
        popTextScreen(`SCRAP: ${questN}/4`);
        if (questN >= 4) advanceChain();
      }
    }
  }
  if (chainIdx === 7 && !alarm && nearXZ(P.pos, L.depot, 34, 60)) {
    alarm = true;
    P.heat = 100;
    sfx.siren();
    popTextScreen('🚨 DEPOT ALARM — GRAB THE CELL AND RUN!');
  }
  if (chainIdx === 7 && fuelCell && nearXZ(fuelCell.position, P.pos, 3.4, 5)) {
    hasFuel = true;
    worldGroup.remove(fuelCell);
    fuelCell = null;
    sfx.pickup();
    advanceChain();
  }
  if (chainIdx === 8 && nearXZ(P.pos, L.rocket, 9, 14)) {
    alarm = false;
    storyWin();
  }
  if (fuelCell) fuelCell.position.y = 3.2 + Math.sin(elapsed * 2.2) * 0.15;
  if (objectiveBeam && chainIdx < CHAIN.length) {
    const t = CHAIN[chainIdx].tgt();
    objectiveBeam.position.x = t.x;
    objectiveBeam.position.z = t.z;
  }
}

function updateCars(dt) {
  for (const c of cars) {
    c.t += c.dir * c.speed * dt;
    if (c.t > CITY_R) c.t = -CITY_R;
    if (c.t < -CITY_R) c.t = CITY_R;
    if (c.axis === 'x') c.mesh.position.set(c.t, 1.1 + Math.sin(elapsed * 3 + c.lane) * 0.1, c.lane);
    else c.mesh.position.set(c.lane, 1.1 + Math.sin(elapsed * 3 + c.lane) * 0.1, c.t);
  }
}

function storyWin() {
  P.state = 'won';
  P.score += 500;
  endSwing(true);
  ui.crosshair.classList.add('hidden');
  if (document.exitPointerLock) document.exitPointerLock();
  saveBest();
  sfx.win();
  ui.oTitle.textContent = '🚀 BLAST OFF!';
  ui.oSub.innerHTML = `The old mail rocket coughs, shudders — and LEAVES. Splort the Slippery escapes again.<br><b>${P.score}</b> score (best ${best}) &nbsp;·&nbsp; <b>${P.punches}</b> KOs`;
  ui.oControls.classList.add('hidden');
  ui.playBtn.textContent = 'MAIN MENU';
  ui.storyBtn.classList.add('hidden');
  ui.overlay.classList.remove('hidden');
}

function saveBest() {
  if (P.score > best) {
    best = P.score;
    try { localStorage.setItem('ssw_best', String(best)); } catch (e) {}
  }
  ui.best.textContent = best;
}

// ---------------------------------------------------------- cutscene (story)
const CUT_LINES = [
  { who: 'GALACTIC PATROL', text: 'SPLORT THE SLIPPERY! By order of the Galactic Patrol you are under arrest for 4,362 counts of grand larceny... and one (1) stolen moon.', dur: 6.0, cam: 'wide' },
  { who: 'GALACTIC PATROL', text: 'Put your tentacles where we can see them. Yes. BOTH of them.', dur: 4.2, cam: 'saucer' },
  { who: 'SPLORT', text: 'Heh... you’ll have to catch me first. This city has ONE rocket left — and it’s got my name on it.', dur: 4.4, cam: 'hero' },
  { who: '', text: '\u{1F6A8} WANTED — SWING! (hold E)', dur: 1.5, cam: 'dive' },
];
let cutSaucers = [];
function roofPos() { return new THREE.Vector3(L.hideout.x, hideoutRoof + 0.3, L.hideout.z); }

function startCutscene() {
  cutsceneSeen = true;
  P.state = 'cutscene';
  playerRig.group.visible = false;
  const T = roofPos();
  makePatrolSaucer(new THREE.Vector3(T.x + 12, T.y + 8, T.z + 16));
  makePatrolSaucer(new THREE.Vector3(T.x - 13, T.y + 10, T.z + 13));
  cutSaucers = [pursuers[pursuers.length - 2], pursuers[pursuers.length - 1]];
  cutBody = makeSwinger(MAT.body, MAT.tentacle);
  cutBody.group.position.set(T.x, T.y, T.z);
  const mid = cutSaucers[0].group.position.clone().add(cutSaucers[1].group.position).multiplyScalar(0.5);
  cutBody.group.rotation.y = Math.atan2(mid.x - T.x, mid.z - T.z);
  ui.crosshair.classList.add('hidden');
  ui.cutscene.classList.remove('hidden');
  ui.cutSkip.textContent = 'SKIP ▸▸';
  cut = { line: -1, t: 0, from: null, to: null, look: null, dur: 0 };
  nextCutLine();
  sfx.siren();
}

function cutCam(name) {
  const T = roofPos();
  const s0 = cutSaucers[0].group.position;
  const mid = s0.clone().add(cutSaucers[1].group.position).multiplyScalar(0.5);
  if (name === 'wide') return {
    from: new THREE.Vector3(T.x + 22, T.y + 12, T.z + 30),
    to: new THREE.Vector3(T.x + 15, T.y + 8, T.z + 24),
    look: mid.clone().lerp(T, 0.4),
  };
  if (name === 'saucer') return {
    from: s0.clone().add(new THREE.Vector3(5, 1.5, 5)),
    to: s0.clone().add(new THREE.Vector3(3, 0.6, 3)),
    look: s0.clone(),
  };
  if (name === 'hero') return {
    from: new THREE.Vector3(T.x + (mid.x - T.x) * 0.3, T.y + 2.2, T.z + (mid.z - T.z) * 0.3),
    to: new THREE.Vector3(T.x + (mid.x - T.x) * 0.18, T.y + 1.6, T.z + (mid.z - T.z) * 0.18),
    look: new THREE.Vector3(T.x, T.y + 1.2, T.z),
  };
  return {
    from: camera.position.clone(),
    to: new THREE.Vector3(T.x, T.y + 4, T.z + 8),
    look: new THREE.Vector3(T.x, T.y + 1, T.z),
  };
}

function nextCutLine() {
  cut.line += 1;
  if (cut.line >= CUT_LINES.length) { endCutscene(); return; }
  const L2 = CUT_LINES[cut.line];
  const cam = cutCam(L2.cam);
  cut.t = 0;
  cut.from = cam.from; cut.to = cam.to; cut.look = cam.look;
  cut.dur = L2.dur;
  ui.cutSpeaker.textContent = L2.who;
  ui.cutSpeaker.classList.toggle('hidden', !L2.who);
  ui.cutText.classList.toggle('system', !L2.who);
  ui.cutText.textContent = '';
  if (L2.cam === 'dive') sfx.attach();
}

function endCutscene() {
  cut = null;
  if (cutBody) {
    scene.remove(cutBody.group);
    scene.remove(cutBody.armL); scene.remove(cutBody.armR); scene.remove(cutBody.fist);
    cutBody = null;
  }
  ui.cutscene.classList.add('hidden');
  ui.crosshair.classList.remove('hidden');
  const T = roofPos();
  P.state = 'walk';
  playerRig.group.visible = true;
  P.pos.set(T.x, T.y + EYE, T.z);
  P.groundY = hideoutRoof;
  P.vel.set(0, 0, 0);
  P.heat = 70;
  yaw = Math.PI; pitch = -0.1;
  ui.hint.textContent = '\u{1F6A8} WANTED — HOLD E to swing. Click for shift-lock. Lose them, then follow the GOLD beam.';
  ui.hint.classList.remove('hidden');
  setTimeout(() => ui.hint.classList.add('hidden'), 8000);
  popTextScreen('NEW QUEST: ' + CHAIN[0].t);
}

function updateCutscene(dt) {
  if (!cut) return;
  cut.t += dt;
  const L2 = CUT_LINES[cut.line];
  const k = Math.min(1, cut.t / cut.dur);
  const e = k * k * (3 - 2 * k);
  camera.position.lerpVectors(cut.from, cut.to, e);
  camera.lookAt(cut.look);
  if (cutBody) poseArms(cutBody, elapsed, 0, null, null);
  const chars = Math.floor(cut.t * 42);
  ui.cutText.textContent = L2.text.slice(0, chars);
  if (cut.t >= cut.dur + (L2.cam === 'dive' ? 0 : 0.8)) nextCutLine();
}

function advanceCutscene() {
  if (!cut) return;
  const L2 = CUT_LINES[cut.line];
  if (ui.cutText.textContent.length < L2.text.length) {
    cut.t = Math.max(cut.t, L2.text.length / 42);
  } else {
    nextCutLine();
  }
}

// ---------------------------------------------------------- third-person camera
function updateCamera(dt) {
  if (!pointerLocked) {
    const dead = 0.12;
    if (Math.abs(mouse.x) > dead) {
      const m = (Math.abs(mouse.x) - dead) / (1 - dead);
      yaw += Math.sign(mouse.x) * m * m * 2.6 * dt;
    }
    pitch = THREE.MathUtils.clamp(-mouse.y * 0.7 - 0.1, -1.1, 0.9);
  }
  camFwd.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).normalize();

  // boom: behind and above the player, pulled in when a tower is in the way
  const boomLen = 7.5;
  const target = _v1.copy(P.pos).add(_v3.set(0, 1.1, 0)).clone();
  let camPos = target.clone().addScaledVector(camFwd, -boomLen);
  camPos.y = Math.max(camPos.y, 1.2);
  // simple occlusion: march along the boom, shorten if inside a building
  for (let k = 1; k <= 6; k++) {
    const t = k / 6;
    _v2.lerpVectors(target, camPos, t);
    let blocked = false;
    for (const b of buildings) {
      if (_v2.x > b.minX && _v2.x < b.maxX && _v2.z > b.minZ && _v2.z < b.maxZ && _v2.y < b.h) { blocked = true; break; }
    }
    if (blocked) {
      camPos = _v2.clone().lerp(target, 0.18);
      break;
    }
  }
  camera.position.lerp(camPos, 1 - Math.exp(-14 * dt));
  if (shake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * shake * 0.5;
    camera.position.y += (Math.random() - 0.5) * shake * 0.5;
    shake *= Math.exp(-6 * dt);
  }
  camera.lookAt(_v2.copy(target).addScaledVector(camFwd, 6));

  const speed = P.vel.length();
  fovTarget = 74 + Math.min(24, speed * 0.5);
  fov += (fovTarget - fov) * (1 - Math.exp(-6 * dt));
  camera.fov = fov;
  camera.updateProjectionMatrix();
}

// player body follows physics + faces movement
function updatePlayerRig(dt) {
  const g = playerRig.group;
  g.position.set(P.pos.x, P.pos.y - EYE, P.pos.z);
  // face where you're going (or the camera direction when idle)
  let fx = camFwd.x, fz = camFwd.z;
  if (P.vel.lengthSq() > 4) { fx = P.vel.x; fz = P.vel.z; }
  const targetYaw = Math.atan2(fx, fz);
  let dy = targetYaw - g.rotation.y;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  g.rotation.y += dy * (1 - Math.exp(-10 * dt));
  // lean into swings
  g.rotation.x = P.state === 'swing' ? THREE.MathUtils.clamp(P.vel.length() * 0.012, 0, 0.5) : 0;

  let reach = null;
  if (P.state === 'swing' && swing) reach = swing.anchor;
  else if (P.attackAnim) reach = P.attackAnim.reach;
  poseArms(playerRig, elapsed, 0, reach, P.vel);
}

// ---------------------------------------------------------- HUD
function updateHUD() {
  ui.hp.style.width = P.hp + '%';
  ui.hp.classList.toggle('low', P.hp <= 30);
  ui.score.textContent = P.score;
  const stars = wantedStars();
  ui.wanted.textContent = mode === 'story' ? (stars > 0 ? '🚨' + '★'.repeat(stars) + '☆'.repeat(3 - stars) : '☆☆☆') : '';
  ui.wanted.classList.toggle('hot', mode === 'story' && stars > 0);

  if (mode === 'story' && P.state !== 'menu' && P.state !== 'cutscene' && chainIdx < CHAIN.length && P.state !== 'won') {
    ui.questBar.classList.remove('hidden');
    const C = CHAIN[chainIdx];
    ui.questTitle.textContent = C.t;
    let obj = C.o;
    if (C.n) obj += ` (${questN}/${C.n})`;
    const t = C.tgt();
    if (t) obj += ` · ${Math.round(Math.hypot(t.x - P.pos.x, t.z - P.pos.z))}m`;
    ui.questObj.textContent = obj;
  } else {
    ui.questBar.classList.add('hidden');
  }

  if (mode === 'match' && !matchOver) {
    ui.matchHud.classList.remove('hidden');
    const m = Math.floor(Math.max(0, matchTime) / 60);
    const s = Math.floor(Math.max(0, matchTime) % 60);
    ui.matchTimer.textContent = `${m}:${String(s).padStart(2, '0')}`;
    ui.matchScore.textContent = `KOs ${P.kos} · Deaths ${P.deaths}`;
  } else {
    ui.matchHud.classList.add('hidden');
  }

  if (elapsed - P.comboT > 1.4 && P.comboCount > 0) {
    P.comboCount = 0;
    ui.combo.classList.add('hidden');
  }

  const canHit = (P.state === 'walk' || P.state === 'air' || P.state === 'swing') && nearestTarget(MELEE_RANGE);
  ui.crosshair.classList.toggle('lock', !!canHit);
}

function updateScoreboard() {
  const rows = [{ name: 'You (Splort)', kos: P.kos, deaths: P.deaths, you: true }]
    .concat(bots.map((b) => ({ name: b.name, kos: b.kos, deaths: b.deaths })));
  rows.sort((a, b) => b.kos - a.kos || a.deaths - b.deaths);
  ui.boardRows.innerHTML = rows.map((r) =>
    `<div class="brow${r.you ? ' you' : ''}"><span>${r.name}</span><span>${r.kos}</span><span>${r.deaths}</span></div>`
  ).join('');
  return rows;
}

// ---------------------------------------------------------- match flow
function startQuickMatch() {
  audioCtx();
  ui.overlay.classList.add('hidden');
  ui.mm.classList.remove('hidden');
  ui.mmList.innerHTML = '<div class="mm-row">Searching the galaxy for swingers<span class="dots">...</span></div>';
  const names = [];
  const pool = BOT_NAMES.slice();
  for (let i = 0; i < 3; i++) names.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  names.forEach((n, i) => {
    setTimeout(() => {
      sfx.join();
      const row = document.createElement('div');
      row.className = 'mm-row found';
      row.textContent = `${n} joined · ${12 + Math.floor(Math.random() * 80)}ms`;
      ui.mmList.appendChild(row);
    }, 900 + i * 800);
  });
  setTimeout(() => {
    ui.mm.classList.add('hidden');
    showLobby(names);
  }, 900 + 3 * 800 + 700);
}

function showLobby(names) {
  ui.lobby.classList.remove('hidden');
  ui.lobbyList.innerHTML =
    `<div class="lb-row you"><span>You (Splort)</span><span class="rdy">READY</span></div>` +
    names.map((n) => `<div class="lb-row"><span>${n}</span><span class="rdy">READY</span></div>`).join('');
  let count = 3;
  ui.lobbyCount.textContent = count;
  sfx.count();
  const iv = setInterval(() => {
    count--;
    if (count > 0) {
      ui.lobbyCount.textContent = count;
      sfx.count();
    } else {
      clearInterval(iv);
      ui.lobby.classList.add('hidden');
      sfx.go();
      beginMatch(names);
    }
  }, 1000);
}

function beginMatch(names) {
  mode = 'match';
  matchOver = false;
  matchTime = MATCH_TIME;
  P.kos = 0; P.deaths = 0; P.score = 0; P.hp = 100;
  P.comboCount = 0;
  chainIdx = CHAIN.length; // no quest UI
  ui.killfeed.innerHTML = '';
  // clear old bots
  for (const b of bots) {
    scene.remove(b.group);
    scene.remove(b.rig.armL); scene.remove(b.rig.armR); scene.remove(b.rig.fist);
  }
  bots.length = 0;
  const namePool = names.slice();
  for (let i = 0; i < 3; i++) {
    const bot = spawnBot(i);
    if (namePool[i]) bot.name = namePool[i];
  }
  const s = randPick(spawnRoofs);
  P.pos.set(s.x, s.y, s.z);
  P.groundY = s.y - EYE;
  P.vel.set(0, 0, 0);
  P.state = 'walk';
  playerRig.group.visible = true;
  yaw = Math.atan2(-s.x, -s.z) + Math.PI; // face the city center
  popTextScreen('DEATHMATCH — most KOs in 3:00 wins. HOLD E to swing!');
  killfeed('Match started — Novoya Sprawl');
}

function endMatch() {
  matchOver = true;
  endSwing(true);
  P.state = 'won';
  saveBest();
  if (document.exitPointerLock) document.exitPointerLock();
  const rows = updateScoreboard();
  const winner = rows[0];
  const youWon = !!winner.you;
  sfx.win();
  ui.oTitle.textContent = youWon ? '🏆 VICTORY!' : `🏆 ${winner.name} WINS`;
  ui.oSub.innerHTML = rows.map((r, i) =>
    `${i + 1}. ${r.you ? '<b>' : ''}${r.name} — ${r.kos} KOs / ${r.deaths} deaths${r.you ? '</b>' : ''}`
  ).join('<br>');
  ui.oControls.classList.add('hidden');
  ui.playBtn.textContent = 'REMATCH';
  ui.storyBtn.textContent = 'MAIN MENU';
  ui.storyBtn.classList.remove('hidden');
  ui.overlay.classList.remove('hidden');
}

// ---------------------------------------------------------- main loop
const clock = new THREE.Clock();

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  switch (P.state) {
    case 'menu': {
      const a = elapsed * 0.1;
      const T = roofPos();
      camera.position.set(T.x + Math.cos(a) * 45, T.y + 18, T.z + Math.sin(a) * 45);
      camera.lookAt(T.x, T.y - 6, T.z);
      break;
    }
    case 'cutscene':
      updateCutscene(dt);
      break;
    case 'dead':
      if (elapsed > P.respawnAt) respawnMatch();
      break;
    case 'walk': {
      let mvF = 0, mvS = 0;
      if (!dlg) {
        if (keys['KeyW'] || keys['ArrowUp']) mvF += 1;
        if (keys['KeyS'] || keys['ArrowDown']) mvF -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) mvS += 1;
        if (keys['KeyA'] || keys['ArrowLeft']) mvS -= 1;
      }
      if (mvF !== 0 || mvS !== 0) {
        _v1.set(camFwd.x, 0, camFwd.z).normalize();
        _v2.crossVectors(_v1, _v3.set(0, 1, 0));
        const move = _v1.multiplyScalar(mvF).addScaledVector(_v2, mvS);
        move.normalize();
        const nx = P.pos.x + move.x * WALK_SPEED * dt;
        const nz = P.pos.z + move.z * WALK_SPEED * dt;
        const curG = P.groundY;
        const gBoth = groundAt(nx, nz);
        if (gBoth <= curG + 1.2) { P.pos.x = nx; P.pos.z = nz; }
        else {
          const gx = groundAt(nx, P.pos.z);
          const gz = groundAt(P.pos.x, nz);
          if (gx <= curG + 1.2) P.pos.x = nx;
          else if (gz <= curG + 1.2) P.pos.z = nz;
        }
        stepT -= dt;
        if (stepT <= 0) { stepT = 0.32; sfx.step(); }
      }
      const r = Math.hypot(P.pos.x, P.pos.z);
      if (r > CITY_R) { P.pos.x *= CITY_R / r; P.pos.z *= CITY_R / r; }
      const g = groundAt(P.pos.x, P.pos.z);
      if (g < P.groundY - 2.5) P.state = 'air';
      else {
        P.groundY = Math.max(g, 0.2);
        P.pos.y = P.groundY + EYE;
      }
      break;
    }
    case 'air': {
      P.vel.y -= 28 * dt;
      _v1.set(camFwd.x, 0, camFwd.z).normalize();
      if (keys['KeyW'] || keys['ArrowUp']) P.vel.addScaledVector(_v1, 7 * dt);
      P.pos.addScaledVector(P.vel, dt);
      collide();
      break;
    }
    case 'swing': {
      applySwingPhysics(dt);
      collide();
      break;
    }
  }

  // anchor preview
  if ((P.state === 'walk' || P.state === 'air') && !dlg) {
    const a = findAnchor();
    if (a) {
      anchorMarker.visible = true;
      anchorMarker.position.copy(a);
      anchorMarker.scale.setScalar(1 + Math.sin(elapsed * 8) * 0.2);
    } else anchorMarker.visible = false;
  } else anchorMarker.visible = false;

  for (const n of npcs) n.group.rotation.y = Math.atan2(P.pos.x - n.pos.x, P.pos.z - n.pos.z);
  mist.position.x = camera.position.x;
  mist.position.z = camera.position.z;
  ground.position.x = camera.position.x;
  ground.position.z = camera.position.z;
  skyGroup.position.x = camera.position.x;
  skyGroup.position.z = camera.position.z;

  const inGame = P.state !== 'menu' && P.state !== 'cutscene' && P.state !== 'won';
  if (inGame) {
    updateWanted(dt);
    if (mode === 'story') updateStory(dt);
    if (mode === 'match' && !matchOver) {
      matchTime -= dt;
      updateBots(dt);
      if (keys['Tab']) { ui.board.classList.remove('hidden'); updateScoreboard(); }
      else ui.board.classList.add('hidden');
      if (matchTime <= 0) endMatch();
    }
    updateAttack(dt);
  }
  updateCars(dt);
  updateEnemies(dt);
  updatePeds(dt);
  updateProjectiles(dt);
  updatePlayerShots(dt);
  updatePursuers(dt);
  updateParticles(dt);
  if (inGame && P.state !== 'dead') {
    updateCamera(dt);
    updatePlayerRig(dt);
  }
  playerRig.group.visible = inGame && P.state !== 'dead';
  playerRig.armL.visible = playerRig.group.visible;
  playerRig.armR.visible = playerRig.group.visible;
  if (!playerRig.group.visible) playerRig.fist.visible = false;
  updateHUD();

  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame);

// ---------------------------------------------------------- input
window.addEventListener('keydown', (ev) => {
  keys[ev.code] = true;
  if (ev.code === 'Tab') ev.preventDefault();
  if (ev.repeat) return;
  if (ev.code === 'ShiftLeft' || ev.code === 'ShiftRight') {
    if (pointerLocked) { if (document.exitPointerLock) document.exitPointerLock(); }
    else requestLock();
    return;
  }
  if (ev.code === 'KeyE') {
    if (P.state === 'walk' || P.state === 'air') startSwing();
    return;
  }
  if (ev.code === 'Space') {
    ev.preventDefault();
    if (dlg) { advanceDialog(); return; }
    if (P.state === 'cutscene') advanceCutscene();
    else if (P.state === 'walk') { P.vel.set(P.vel.x, 11, P.vel.z); P.state = 'air'; sfx.jump(); }
    return;
  }
  if (ev.code === 'KeyF') { attack(); return; }
});
window.addEventListener('keyup', (ev) => {
  keys[ev.code] = false;
  if (ev.code === 'KeyE' && P.state === 'swing') endSwing();
});

renderer.domElement.addEventListener('pointerdown', (ev) => {
  audioCtx();
  if (ev.button !== 0) return;
  if (dlg) { advanceDialog(); return; }
  if (P.state === 'cutscene') { advanceCutscene(); return; }
  if (P.state === 'menu' || P.state === 'won' || P.state === 'dead') return;
  if (!pointerLocked) requestLock();
  if (mode === 'story' && hasGun) fireZapper(); else attack();
});

ui.playBtn.addEventListener('click', () => {
  if (P.state === 'won' && mode === 'match') { ui.overlay.classList.add('hidden'); beginMatch(bots.map((b) => b.name)); return; }
  if (P.state === 'won') { window.location.reload(); return; }
  startQuickMatch();
});
ui.storyBtn.addEventListener('click', () => {
  if (P.state === 'won') { window.location.reload(); return; }
  startStory();
});
ui.cutSkip.addEventListener('pointerdown', (ev) => {
  ev.stopPropagation();
  if (dlg) { while (dlg) advanceDialog(); return; }
  if (cut) endCutscene();
});

// ---------------------------------------------------------- boot
function startStory() {
  audioCtx();
  mode = 'story';
  P.startTime = performance.now();
  ui.overlay.classList.add('hidden');
  ui.crosshair.classList.remove('hidden');
  if (objectiveBeam) objectiveBeam.visible = true;
  const T = roofPos();
  P.state = 'walk';
  P.groundY = hideoutRoof;
  P.pos.set(T.x, hideoutRoof + EYE, T.z);
  playerRig.group.visible = true;
  yaw = Math.PI; pitch = -0.1;
  if (!cutsceneSeen) startCutscene();
}

buildCity();
buildDistricts();
P.pos.set(L.spawn.x, 0.2 + EYE, L.spawn.z);

// exposed for automated smoke tests
window.__game = P;
window.__debug = {
  P, buildings, enemies, peds, pursuers, npcs, scraps, bots, L, spawnRoofs,
  chain: () => ({ chainIdx, questN, disguised, hasGun, hasFuel, alarm, mode, matchTime, matchOver }),
  advanceChain, setHeat: (h) => { P.heat = h; },
  dlgOpen: () => !!dlg, advanceDialog, clearTalk: () => { talkCd = 0; },
  giveGun: () => { hasGun = true; }, fire: fireZapper,
  startSwing, endSwing, findAnchor, swing: () => swing,
  camFwd: () => camFwd, setYaw: (y) => { yaw = y; }, setPitch: (p) => { pitch = p; },
  fuel: () => fuelCell, groundAt, attack, endMatch,
  startQuickMatch, beginMatch, startStory,
  endCutscene: () => cut && endCutscene(),
};

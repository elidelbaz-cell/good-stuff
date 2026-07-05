import * as THREE from 'three';

/* ============================================================
   TENTACLE TREETOPS — THE LAST ROCKET
   Act 1: the Galactic Patrol raids your hideout — escape
          through the grove (grapple QTE chase).
   Act 2: you wash up on Novoya Isle. Free-roam on foot (WASD)
          or by tentacle-grapple. Talk to the locals, follow the
          quest chain — get a disguise from the Mask Maker, earn
          a zapper from the Hunter, run scrap for the Junk
          Dealer, get the old rocket repaired, steal patrol fuel
          — and blast off the planet.
   ============================================================ */

const QTE_TIME = 3.5;
const ZIP_SPEED = 55;
const PUNCH_RANGE = 24;
const GRAPPLE_RANGE = 58;
const WALK_Y = 1.8;         // eye height standing on the island
const ISLE_R = 172;         // walkable island radius

// ---------------------------------------------------------- dom
const $ = (id) => document.getElementById(id);
const ui = {
  hp: $('hpbar'), score: $('stat-score'), best: $('stat-best'), wanted: $('stat-wanted'),
  questTitle: $('quest-title'), questObj: $('quest-obj'), questBar: $('questbar'),
  qte: $('qte'), qteNum: $('qte-num'), qteRing: $('qte-ring'), qteTime: $('qte-time'),
  qteCircle: $('qte-circle'), qteLabel: $('qte-label'),
  vignette: $('vignette'), flash: $('flash'), crosshair: $('crosshair'), fade: $('fade'),
  overlay: $('overlay'), oTitle: $('o-title'), oSub: $('o-sub'), oControls: $('o-controls'),
  playBtn: $('playbtn'), hint: $('hint'), pops: $('pops'),
  cutscene: $('cutscene'), cutSpeaker: $('cut-speaker'), cutText: $('cut-text'), cutSkip: $('cut-skip'),
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
  correct: () => { tone(660, 0.09, 'square', 0.12); setTimeout(() => tone(990, 0.12, 'square', 0.12), 60); },
  wrong: () => tone(140, 0.25, 'sawtooth', 0.18, 90),
  zip: () => { whoosh(0.5, 0.25); tone(300, 0.4, 'sine', 0.08, 900); },
  cannon: () => { whoosh(0.7, 0.3); tone(180, 0.6, 'square', 0.14, 600); },
  land: () => tone(520, 0.12, 'triangle', 0.14, 780),
  tick: () => tone(1200, 0.05, 'square', 0.07),
  pow: () => { tone(90, 0.18, 'square', 0.25, 55); whoosh(0.15, 0.2); },
  shot: (v) => tone(1500, 0.08, 'square', v, 500),
  pew: () => tone(1100, 0.12, 'sawtooth', 0.1, 300),
  hurt: () => tone(220, 0.2, 'sawtooth', 0.2, 110),
  splat: () => { tone(200, 0.5, 'sawtooth', 0.25, 40); whoosh(0.3, 0.3); },
  fall: () => tone(700, 1.0, 'sine', 0.15, 120),
  step: () => tone(180 + Math.random() * 40, 0.05, 'triangle', 0.03),
  pickup: () => { tone(880, 0.1, 'square', 0.12); setTimeout(() => tone(1320, 0.15, 'square', 0.1), 80); },
  quest: () => { tone(523, 0.12, 'square', 0.12); setTimeout(() => tone(659, 0.12, 'square', 0.12), 110); setTimeout(() => tone(880, 0.25, 'square', 0.12), 220); },
  talk: () => tone(440, 0.06, 'square', 0.08, 520),
  win: () => { tone(523, 0.15, 'square', 0.13); setTimeout(() => tone(659, 0.15, 'square', 0.13), 130); setTimeout(() => tone(784, 0.3, 'square', 0.13), 260); setTimeout(() => tone(1047, 0.5, 'square', 0.13), 420); },
  siren: () => { tone(620, 0.28, 'square', 0.09, 880); setTimeout(() => tone(880, 0.28, 'square', 0.09, 620), 300); },
};

// ---------------------------------------------------------- three setup
const SKY = 0x1d1140;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 45, 240);

const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.1, 600);
camera.position.set(0, 30, 14);

scene.add(new THREE.HemisphereLight(0x8a6cff, 0x1e4a55, 1.35));
const sun = new THREE.DirectionalLight(0xd0f0ff, 1.15);
sun.position.set(60, 120, 40);
scene.add(sun);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------- shared materials / geometries
const MAT = {
  trunk: new THREE.MeshLambertMaterial({ color: 0x3a3560 }),
  rock: new THREE.MeshLambertMaterial({ color: 0x4a4668 }),
  leafA: new THREE.MeshLambertMaterial({ color: 0x3a1f4d, emissive: 0xb03fd0, emissiveIntensity: 0.5 }),
  leafB: new THREE.MeshLambertMaterial({ color: 0x123c3a, emissive: 0x2ac5b5, emissiveIntensity: 0.5 }),
  leafC: new THREE.MeshLambertMaterial({ color: 0x2a1a55, emissive: 0x6a4fe8, emissiveIntensity: 0.5 }),
  pad: new THREE.MeshLambertMaterial({ color: 0x2a2438 }),
  padRing: new THREE.MeshBasicMaterial({ color: 0x4dffe1 }),
  tentacle: new THREE.MeshLambertMaterial({ color: 0x9a6ff0, emissive: 0x241040, emissiveIntensity: 1 }),
  sucker: new THREE.MeshLambertMaterial({ color: 0xd8c6ff, emissive: 0x4a2f80, emissiveIntensity: 0.6 }),
  body: new THREE.MeshLambertMaterial({ color: 0x7a4fd0 }),
  eyeW: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  skin: new THREE.MeshLambertMaterial({ color: 0x8de85c }),
  suit: new THREE.MeshLambertMaterial({ color: 0x2b2b3d }),
  suit2: new THREE.MeshLambertMaterial({ color: 0x3d2b3a }),
  npc1: new THREE.MeshLambertMaterial({ color: 0x6a4fd0 }),
  npc2: new THREE.MeshLambertMaterial({ color: 0xb8762a }),
  npc3: new THREE.MeshLambertMaterial({ color: 0xd0b32a }),
  npc4: new THREE.MeshLambertMaterial({ color: 0xd04f4f }),
  eyeB: new THREE.MeshBasicMaterial({ color: 0x0a0a12 }),
  gun: new THREE.MeshLambertMaterial({ color: 0x1c1c28 }),
  bullet: new THREE.MeshBasicMaterial({ color: 0xff4fd8 }),
  bolt: new THREE.MeshBasicMaterial({ color: 0x4dffe1 }),
  flash: new THREE.MeshBasicMaterial({ color: 0xffb3ee }),
  reticle: new THREE.MeshBasicMaterial({ color: 0x4dffe1, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }),
  reticleTwin: new THREE.MeshBasicMaterial({ color: 0xff4fd8, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }),
  spore: new THREE.MeshBasicMaterial({ color: 0xb03fd0 }),
  trail: new THREE.MeshBasicMaterial({ color: 0xc0a4ff }),
  hull: new THREE.MeshLambertMaterial({ color: 0x8a93b8 }),
  hullDark: new THREE.MeshLambertMaterial({ color: 0x3c4260 }),
  dome: new THREE.MeshLambertMaterial({ color: 0x7ef2dd, emissive: 0x2ac5b5, emissiveIntensity: 0.7, transparent: true, opacity: 0.85 }),
  beamGold: new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
  beamPurple: new THREE.MeshBasicMaterial({ color: 0xb03fd0, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide }),
  beamOrange: new THREE.MeshBasicMaterial({ color: 0xff9a3f, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide }),
  beamYellow: new THREE.MeshBasicMaterial({ color: 0xd0b32a, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide }),
  beamRed: new THREE.MeshBasicMaterial({ color: 0xff4f4f, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide }),
  beamWhite: new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.11, depthWrite: false, side: THREE.DoubleSide }),
  beamCyan: new THREE.MeshBasicMaterial({ color: 0x4dffe1, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
  shipLight: new THREE.MeshBasicMaterial({ color: 0xffe14d }),
  lightRed: new THREE.MeshBasicMaterial({ color: 0xff3b3b }),
  lightBlue: new THREE.MeshBasicMaterial({ color: 0x3b8cff }),
  scrap: new THREE.MeshLambertMaterial({ color: 0x5a6478, emissive: 0x2ac5b5, emissiveIntensity: 0.6 }),
  fuel: new THREE.MeshLambertMaterial({ color: 0x3a3a20, emissive: 0xffe14d, emissiveIntensity: 1.1 }),
  rocket: new THREE.MeshLambertMaterial({ color: 0xc8d2e8 }),
  rocketFin: new THREE.MeshLambertMaterial({ color: 0xd04f4f }),
  sand: new THREE.MeshLambertMaterial({ color: 0x9a8a6a }),
  grass: new THREE.MeshLambertMaterial({ color: 0x2f5b46 }),
  tent: new THREE.MeshLambertMaterial({ color: 0x7a3a2a }),
  mask: new THREE.MeshLambertMaterial({ color: 0xf0e8d8 }),
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
  beam: new THREE.CylinderGeometry(0.8, 0.8, 130, 8, 1, true),
};

// ---------------------------------------------------------- ground + sky
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(4000, 4000),
  new THREE.MeshLambertMaterial({ color: 0x14333d })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const mist = new THREE.Mesh(
  new THREE.PlaneGeometry(4000, 4000),
  new THREE.MeshBasicMaterial({ color: 0x2a1a4a, transparent: true, opacity: 0.55, depthWrite: false })
);
mist.rotation.x = -Math.PI / 2;
mist.position.y = 6;
scene.add(mist);

const skyGroup = new THREE.Group();
{
  const starGeo = new THREE.BufferGeometry();
  const pts = [];
  for (let i = 0; i < 700; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(430);
    if (v.y > -20) pts.push(v.x, v.y, v.z);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  skyGroup.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 2.2, sizeAttenuation: false, fog: false })));
  const planet = new THREE.Mesh(new THREE.SphereGeometry(34, 24, 24), new THREE.MeshBasicMaterial({ color: 0x5a4a9e, fog: false }));
  planet.position.set(150, 150, -300);
  skyGroup.add(planet);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(52, 5, 2, 48), new THREE.MeshBasicMaterial({ color: 0x8f7fd0, fog: false }));
  ring.position.copy(planet.position);
  ring.rotation.x = Math.PI / 2.4;
  ring.scale.z = 0.15;
  skyGroup.add(ring);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 16), new THREE.MeshBasicMaterial({ color: 0xd8b8e8, fog: false }));
  moon.position.set(-220, 110, -180);
  skyGroup.add(moon);
}
scene.add(skyGroup);

// ---------------------------------------------------------- helpers / world containers
function randPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _camR = new THREE.Vector3(), _camU = new THREE.Vector3(), _camF = new THREE.Vector3();

let worldGroup = new THREE.Group();
scene.add(worldGroup);

const trees = [];      // { top, anchor, group }
const enemies = [];    // gunners { group, muzzle, pos, dead, removed, cd, vel, spin, life, flashT, goon, guard, hostile }
const pursuers = [];   // patrol saucers { group, lightA, lightB, cd, phase, home, active, hp, crashed, respawnAt }
const npcs = [];       // { group, pos, name, talk }
const scraps = [];     // { mesh, taken }
const projectiles = [];// enemy bullets
const playerShots = [];// your zapper bolts
let objectiveBeam = null;
let fuelCell = null;
let rocket = null;
let act = 'grove';     // grove -> island

function makeBeam(pos, mat) {
  const m = new THREE.Mesh(GEO.beam, mat);
  m.position.set(pos.x, 65, pos.z);
  worldGroup.add(m);
  return m;
}

function clearWorld() {
  scene.remove(worldGroup);
  worldGroup.traverse((o) => { if (o.geometry && o.geometry !== GEO.beam) o.geometry.dispose(); });
  worldGroup = new THREE.Group();
  scene.add(worldGroup);
  trees.length = 0;
  enemies.length = 0;
  pursuers.length = 0;
  npcs.length = 0;
  scraps.length = 0;
  for (const pr of projectiles) scene.remove(pr.mesh);
  projectiles.length = 0;
  for (const s of playerShots) scene.remove(s.mesh);
  playerShots.length = 0;
  objectiveBeam = null;
  fuelCell = null;
  rocket = null;
}

// ---------------------------------------------------------- tree builder
function addTree(x, y, z, kind) {
  const group = new THREE.Group();
  if (kind === 'spire') {
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 3.2, y, 7), MAT.rock);
    spire.position.set(x, y / 2, z);
    group.add(spire);
  } else {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.7, y, 8), MAT.trunk);
    trunk.position.set(x, y / 2, z);
    group.add(trunk);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.random();
      const r = 2.6 + Math.random() * 1.2;
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2 + Math.random() * 1.4, 0), randPick([MAT.leafA, MAT.leafB, MAT.leafC]));
      blob.position.set(x + Math.cos(a) * r, y - 1.2 + Math.random() * 1.6, z + Math.sin(a) * r);
      blob.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      group.add(blob);
    }
  }
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 3.1, 0.5, 9), MAT.pad);
  pad.position.set(x, y + 0.25, z);
  group.add(pad);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.1, 6, 24), MAT.padRing);
  ring.position.set(x, y + 0.52, z);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  worldGroup.add(group);
  trees.push({
    top: new THREE.Vector3(x, y + 0.5, z),
    anchor: new THREE.Vector3(x, y + 1.1, z),
    group,
  });
}

// ---------------------------------------------------------- characters
function buildPerson(bodyMat) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(GEO.npcBody, bodyMat);
  body.position.y = 0.34;
  g.add(body);
  const head = new THREE.Mesh(GEO.head, MAT.skin);
  head.position.y = 0.88;
  g.add(head);
  for (const sx of [-0.09, 0.09]) {
    const eye = new THREE.Mesh(GEO.eye, MAT.eyeB);
    eye.position.set(sx, 0.92, 0.19);
    g.add(eye);
  }
  return g;
}

function spawnGunner(pos, flags) {
  const g = buildPerson(Math.random() < 0.5 ? MAT.suit : MAT.suit2);
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
    group: g, muzzle, pos: pos.clone(), dead: false, removed: false,
    cd: 1 + Math.random() * 2, vel: new THREE.Vector3(), spin: 0, life: 3, flashT: 0,
    goon: !!(flags && flags.goon), guard: !!(flags && flags.guard),
  });
}

function makeNPC(pos, mat, name, talk, prop) {
  const g = buildPerson(mat);
  if (prop === 'mask') {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.2, 8), MAT.mask);
    m.position.set(0, 0.9, 0.23);
    g.add(m);
  } else if (prop === 'hat') {
    const h = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.4, 6), MAT.tent);
    h.position.y = 1.2;
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

// ---------------------------------------------------------- ACT 1: the grove escape
let groveTarget = 1;
function buildGrove() {
  ground.material.color.set(0x14333d);
  let heading = 0;
  let px = 0, py = 26, pz = 120;
  addTree(px, py, pz, 'spire');
  for (let i = 1; i < 12; i++) {
    heading += (Math.random() - 0.5) * 1.0;
    const dist = 26 + Math.random() * 10;
    px += Math.sin(heading) * dist;
    pz -= Math.cos(heading) * dist;
    py = THREE.MathUtils.clamp(py + (Math.random() - 0.5) * 10, 18, 42);
    addTree(px, py, pz, 'tree');
  }
  const T = trees[0].top;
  makePatrolSaucer(new THREE.Vector3(T.x + 12, T.y + 6, T.z + 32));
  makePatrolSaucer(new THREE.Vector3(T.x - 14, T.y + 8, T.z + 29));
  groveTarget = 1;
}

function retryGrove(msg) {
  clearWorld();
  buildGrove();
  P.state = 'perched';
  P.currentTree = 0;
  P.pos.copy(trees[0].top).add(_v1.set(0, 1.5, 0));
  P.vel.set(0, 0, 0);
  P.hp = 100;
  P.heat = 70;
  yaw = 0; pitch = 0; roll = 0;
  tsTarget = 1; fovTarget = 74;
  ui.qte.classList.add('hidden');
  ui.vignette.classList.remove('on');
  for (const u of pursuers) u.active = true;
  popTextScreen(msg);
}

// ---------------------------------------------------------- ACT 2: Novoya Isle
const L = {
  spawn: new THREE.Vector3(0, WALK_Y, 150),
  mask: new THREE.Vector3(-45, 0, 85),
  hunter: new THREE.Vector3(105, 0, 25),
  camp: new THREE.Vector3(140, 0, 85),
  dealer: new THREE.Vector3(-115, 0, -25),
  rocket: new THREE.Vector3(-30, 0, -125),
  depot: new THREE.Vector3(95, 0, -105),
};

function hut(x, z, mat) {
  const h = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.2, 6), mat);
  h.position.set(x, 1.6, z);
  worldGroup.add(h);
}

function buildIsland() {
  ground.material.color.set(0x0e2f4e); // the endless ground becomes the sea
  // the island itself
  const beach = new THREE.Mesh(new THREE.CylinderGeometry(184, 190, 1.2, 28), MAT.sand);
  beach.position.y = -0.55;
  worldGroup.add(beach);
  const isle = new THREE.Mesh(new THREE.CylinderGeometry(ISLE_R + 2, 182, 1.6, 28), MAT.grass);
  isle.position.y = -0.6; // top at 0.2
  worldGroup.add(isle);

  // scattered grapple trees
  let tries = 0, placed = 0;
  while (placed < 55 && tries < 4000) {
    tries++;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * (ISLE_R - 15);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    let ok = true;
    for (const t of trees) {
      const dx = t.top.x - x, dz = t.top.z - z;
      if (dx * dx + dz * dz < 19 * 19) { ok = false; break; }
    }
    for (const key of Object.keys(L)) {
      const p = L[key];
      const dx = p.x - x, dz = p.z - z;
      if (dx * dx + dz * dz < 13 * 13) { ok = false; break; }
    }
    if (!ok) continue;
    addTree(x, 14 + Math.random() * 20, z, 'tree');
    placed++;
  }

  // --- locations & cast
  hut(L.mask.x + 3, L.mask.z - 1, MAT.npc1);
  makeNPC(new THREE.Vector3(L.mask.x, WALK_Y - 1.6, L.mask.z), MAT.npc1, 'THE MASK MAKER', talkMaskMaker, 'mask');
  makeBeam(L.mask, MAT.beamPurple);

  hut(L.hunter.x - 3, L.hunter.z + 2, MAT.npc2);
  makeNPC(new THREE.Vector3(L.hunter.x, WALK_Y - 1.6, L.hunter.z), MAT.npc2, 'OLD ZEB THE HUNTER', talkHunter, 'hat');
  makeBeam(L.hunter, MAT.beamOrange);

  // goon camp: tents + 4 beach goons
  for (const [tx, tz] of [[L.camp.x - 4, L.camp.z], [L.camp.x + 3, L.camp.z + 4], [L.camp.x, L.camp.z - 5]]) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(2, 2.4, 5), MAT.tent);
    t.position.set(tx, 1.2, tz);
    worldGroup.add(t);
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    spawnGunner(new THREE.Vector3(L.camp.x + Math.cos(a) * 5, WALK_Y - 1.6, L.camp.z + Math.sin(a) * 5), { goon: true });
  }
  makeBeam(L.camp, MAT.beamRed);

  // junk dealer yard
  for (let k = 0; k < 6; k++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1 + Math.random() * 1.5, 0.6 + Math.random(), 1 + Math.random()), MAT.hullDark);
    b.position.set(L.dealer.x + (Math.random() - 0.5) * 10, 0.6, L.dealer.z + (Math.random() - 0.5) * 10);
    b.rotation.y = Math.random() * 3;
    worldGroup.add(b);
  }
  makeNPC(new THREE.Vector3(L.dealer.x, WALK_Y - 1.6, L.dealer.z), MAT.npc3, 'RUSTY THE JUNK DEALER', talkDealer, 'hat');
  makeBeam(L.dealer, MAT.beamYellow);

  // rocket pad + mechanic
  const padDisc = new THREE.Mesh(new THREE.CylinderGeometry(9, 10, 0.8, 10), MAT.pad);
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
  const win1 = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), MAT.dome);
  win1.position.set(0, 6.5, 1.45);
  rocket.add(win1);
  rocket.position.set(L.rocket.x, 1, L.rocket.z);
  rocket.rotation.z = 0.12; // charmingly crooked until repaired
  worldGroup.add(rocket);
  makeNPC(new THREE.Vector3(L.rocket.x + 6, WALK_Y - 1.6, L.rocket.z + 3), MAT.npc4, 'PIA THE MECHANIC', talkMechanic, 'wrench');
  makeBeam(L.rocket, MAT.beamWhite);

  // patrol depot: slab, guards, saucers, fuel cell
  const slab = new THREE.Mesh(new THREE.CylinderGeometry(11, 12, 1, 10), MAT.hullDark);
  slab.position.set(L.depot.x, 0.7, L.depot.z);
  worldGroup.add(slab);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(10.4, 0.2, 6, 30), MAT.lightRed);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(L.depot.x, 1.3, L.depot.z);
  worldGroup.add(rim);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    spawnGunner(new THREE.Vector3(L.depot.x + Math.cos(a) * 7, WALK_Y - 1.6 + 1, L.depot.z + Math.sin(a) * 7), { guard: true });
  }
  for (let k = 0; k < 3; k++) {
    makePatrolSaucer(new THREE.Vector3(L.depot.x + (k - 1) * 6, 8, L.depot.z - 8));
  }
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), MAT.hullDark);
  crate.position.set(L.depot.x, 1.9, L.depot.z);
  worldGroup.add(crate);
  fuelCell = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 0.8), MAT.fuel);
  fuelCell.position.set(L.depot.x, 3.2, L.depot.z);
  worldGroup.add(fuelCell);
  makeBeam(L.depot, MAT.beamRed);

  // flavor villagers
  makeNPC(new THREE.Vector3(20, WALK_Y - 1.6, 120), MAT.npc3, 'BEACH LOAFER', () =>
    openDialog([{ who: 'BEACH LOAFER', text: 'New face? The Mask Maker makes those, funnily enough. Purple light, up the dune.' }]), null);
  makeNPC(new THREE.Vector3(-70, WALK_Y - 1.6, 40), MAT.npc2, 'MUSHROOM FARMER', () =>
    openDialog([{ who: 'MUSHROOM FARMER', text: 'The patrol depot? Red glow, north-east. I would NOT go there. So obviously you will.' }]), null);

  objectiveBeam = makeBeam(L.mask, MAT.beamGold);
}

// ---------------------------------------------------------- quest chain
const CHAIN = [
  { t: 'BLEND IN', o: 'Talk to the Mask Maker (follow the GOLD beam)', tgt: () => L.mask },
  { t: 'GET A WEAPON', o: 'Visit Old Zeb the Hunter', tgt: () => L.hunter },
  { t: 'CAMP CLEANOUT', o: 'Punch the beach goons', n: 4, tgt: () => L.camp },
  { t: 'CLAIM YOUR ZAPPER', o: 'Return to Old Zeb', tgt: () => L.hunter },
  { t: 'ROCKET RUMORS', o: 'Ask Rusty the Junk Dealer about the rocket', tgt: () => L.dealer },
  { t: 'SCRAP RUN', o: 'Collect scrap for the repairs', n: 4, tgt: () => nearestScrap() },
  { t: 'THE MECHANIC', o: 'Bring the scrap to Pia at the rocket pad', tgt: () => L.rocket },
  { t: 'FUEL HEIST', o: 'Steal a fuel cell from the patrol depot', tgt: () => L.depot },
  { t: 'LAUNCH!', o: 'Get back to the rocket — GO GO GO', tgt: () => L.rocket },
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
  // two on tree tops (grapple practice), two on the ground
  const spots = [];
  const treePicks = trees.filter((t) => t.top.distanceTo(L.dealer) < 90).slice(0, 2);
  for (const t of treePicks) spots.push(t.top.clone().add(new THREE.Vector3(0, 1.2, 0)));
  spots.push(new THREE.Vector3(L.dealer.x + 35, 1.2, L.dealer.z + 40));
  spots.push(new THREE.Vector3(L.dealer.x - 20, 1.2, L.dealer.z - 55));
  for (const p of spots) {
    const m = new THREE.Mesh(new THREE.TorusKnotGeometry(0.5, 0.16, 32, 6), MAT.scrap);
    m.position.copy(p);
    worldGroup.add(m);
    scraps.push({ mesh: m, taken: false });
  }
}

// --- NPC dialogue handlers
function talkMaskMaker() {
  if (chainIdx === 0) {
    openDialog([
      { who: 'THE MASK MAKER', text: 'Ohoho. A face the whole quadrant has on a poster. Hold still, fugitive...' },
      { who: 'THE MASK MAKER', text: 'There. Bark-fibre, spore-glue, two eye holes. Even your mother would walk right past you.' },
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
      { who: 'OLD ZEB', text: 'Beach goons took over my old camp east of here. Knock four of them into the surf, and we’ll talk hardware.' },
    ], () => advanceChain());
  } else if (chainIdx === 3) {
    openDialog([
      { who: 'OLD ZEB', text: 'HA! I watched the third one bounce. A deal’s a deal —' },
      { who: 'OLD ZEB', text: 'One ZAPPER. Slightly chewed. LEFT CLICK to fire. Try not to point it at me.' },
    ], () => {
      hasGun = true;
      popTextScreen('ZAPPER ACQUIRED — LEFT CLICK to shoot');
      advanceChain();
    });
  } else if (chainIdx === 2) {
    openDialog([{ who: 'OLD ZEB', text: `Four goons. You’ve tipped ${questN}. Get on with it.` }]);
  } else {
    openDialog([{ who: 'OLD ZEB', text: 'A rocket, eh? Rusty the junk dealer knows every bolt on this island.' }]);
  }
}

function talkDealer() {
  if (chainIdx === 4) {
    openDialog([
      { who: 'RUSTY', text: 'A rocket? There’s ONE. The old mail rocket on the north-west pad. Crooked as my back but she’ll fly.' },
      { who: 'RUSTY', text: 'Bring me 4 pieces of good scrap and I’ll send the parts over to Pia. Check the CYAN glows — two are up in the trees.' },
    ], () => advanceChain());
  } else if (chainIdx === 5) {
    openDialog([{ who: 'RUSTY', text: `Scrap count: ${questN}/4. The tree ones are the good stuff.` }]);
  } else {
    openDialog([{ who: 'RUSTY', text: 'No refunds.' }]);
  }
}

function talkMechanic() {
  if (chainIdx === 6) {
    openDialog([
      { who: 'PIA', text: 'Rusty’s scrap came through. Give me a second—' },
      { who: 'PIA', text: '*clang* *clang* ...Done. Straightened her right up. One problem: the tank is DRY.' },
      { who: 'PIA', text: 'The patrol depot keeps fuel cells. Steal one. This is the part of your day that gets LOUD.' },
    ], () => {
      rocket.rotation.z = 0; // she fixed it!
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

// ---------------------------------------------------------- dialogue box
let dlg = null; // { lines, idx, onDone }
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
function updateParticles(wdt) {
  for (const p of particles) {
    if (p.life <= 0) { p.mesh.visible = false; continue; }
    p.life -= wdt;
    p.vel.y -= 14 * wdt;
    p.mesh.position.addScaledVector(p.vel, wdt);
    p.mesh.rotation.x += 6 * wdt; p.mesh.rotation.y += 5 * wdt;
  }
}

// ---------------------------------------------------------- first-person tentacles
function makeTube() {
  const m = new THREE.Mesh(new THREE.BufferGeometry(), MAT.tentacle);
  m.frustumCulled = false;
  scene.add(m);
  return m;
}
const idleTubes = [makeTube(), makeTube()];
const grappleTube = makeTube();
grappleTube.visible = false;
const grappleFist = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 10), MAT.sucker);
grappleFist.visible = false;
scene.add(grappleFist);
const punchTube = makeTube();
punchTube.visible = false;
const punchFist = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 10), MAT.sucker);
punchFist.visible = false;
scene.add(punchFist);

function setTube(mesh, points, radius, tubular = 10) {
  mesh.geometry.dispose();
  mesh.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), tubular, radius, 6, false);
}

const reticle = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.45, 24), MAT.reticle);
reticle.visible = false;
scene.add(reticle);

// ---------------------------------------------------------- game state
const P = {
  state: 'menu', // menu | cutscene | perched | qte | zip | cannonball | falling(grove) | walk | airborne
  pos: new THREE.Vector3(), vel: new THREE.Vector3(),
  hp: 100, score: 0, punches: 0,
  currentTree: 0, targetTree: -1, chainTree: -1,
  qteNums: [], qteIdx: 0, qteTime: 0, qteTwin: false, cannonEarned: false, cannon: null,
  heat: 0, punchAnim: null, tumble: 0, gunCd: 0,
  startTime: 0,
};
let best = 0;
try { best = parseInt(localStorage.getItem('ttp_best') || '0', 10) || 0; } catch (e) {}
ui.best.textContent = best;

let ts = 1, tsTarget = 1;
let shake = 0;
let fov = 74, fovTarget = 74;
let roll = 0, rollTarget = 0;
let camFwd = new THREE.Vector3(0, 0, -1);
let yaw = 0, pitch = 0;
let elapsed = 0;
let lastTickSec = -1;
let trailT = 0;
let stepT = 0;
let escapeTimer = 0;
let lastSiren = -10;
let cutsceneSeen = false;
let cut = null;
let cutBody = null;
const mouse = { x: 0, y: 0 };
const keys = {};

// ---------------------------------------------------------- QTE
function renderQteNums() {
  ui.qteNum.innerHTML = P.qteNums.map((n, k) =>
    `<span class="qn${k < P.qteIdx ? ' done' : k === P.qteIdx ? ' active' : ''}">${n}</span>`
  ).join('');
}

function beginQTE() {
  P.state = 'qte';
  tsTarget = 0.12;
  fovTarget = 58;
  const twin = P.chainTree >= 0;
  P.qteTwin = twin;
  if (twin) {
    const a = 1 + Math.floor(Math.random() * 6);
    let b = 1 + Math.floor(Math.random() * 6);
    while (b === a) b = 1 + Math.floor(Math.random() * 6);
    P.qteNums = [a, b];
    ui.qteLabel.textContent = 'TWIN TREES — HIT BOTH TO CANNONBALL';
  } else {
    P.qteNums = [1 + Math.floor(Math.random() * 6)];
    ui.qteLabel.textContent = 'PRESS';
  }
  P.qteIdx = 0;
  P.qteTime = QTE_TIME;
  lastTickSec = -1;
  renderQteNums();
  ui.qte.classList.remove('hidden');
  ui.vignette.classList.add('on');
  ui.hint.classList.add('hidden');
}

function qteFail() {
  ui.qte.classList.add('hidden');
  ui.vignette.classList.remove('on');
  tsTarget = 1; fovTarget = 80;
  if (act === 'grove') {
    P.state = 'falling'; // fatal in the grove — nothing below but mist
    P.tumble = 2 + Math.random() * 2;
  } else {
    P.state = 'airborne'; // on the island you just eat sand
    P.tumble = 2 + Math.random() * 2;
  }
  sfx.fall();
}

function handleNumber(n) {
  if (P.state !== 'qte') return;
  if (n === P.qteNums[P.qteIdx]) {
    P.qteIdx += 1;
    renderQteNums();
    if (P.qteIdx >= P.qteNums.length) {
      sfx.correct();
      startZip(P.qteTwin);
    } else {
      tone(880, 0.08, 'square', 0.12);
    }
  } else {
    P.qteTime -= 0.75;
    sfx.wrong();
    ui.qteCircle.classList.remove('shake');
    void ui.qteCircle.offsetWidth;
    ui.qteCircle.classList.add('shake');
    shake = Math.min(1, shake + 0.3);
  }
}

// ---------------------------------------------------------- traversal
function pickGrappleTarget() {
  if (act === 'grove') return groveTarget < trees.length ? groveTarget : -1;
  let bi = -1, bs = 0.78;
  let fi = -1, fd = Infinity;
  for (let i = 0; i < trees.length; i++) {
    if (P.state === 'perched' && i === P.currentTree) continue;
    _v1.copy(trees[i].anchor).sub(P.pos);
    const d = _v1.length();
    if (d > GRAPPLE_RANGE || d < 5) continue;
    _v1.divideScalar(d);
    const dot = _v1.dot(camFwd);
    if (dot > bs) { bs = dot; bi = i; }
    if (dot > 0.35 && d < fd) { fd = d; fi = i; }
  }
  return bi >= 0 ? bi : fi;
}

function pickChainTree(ti) {
  if (act === 'grove') return -1;
  const A = trees[ti].anchor;
  _v2.copy(A).sub(P.pos).normalize();
  let bi = -1, bd = Infinity;
  for (let i = 0; i < trees.length; i++) {
    if (i === ti || (P.state === 'perched' && i === P.currentTree)) continue;
    const d = trees[i].anchor.distanceTo(A);
    if (d > 18 || d < 5) continue;
    _v1.copy(trees[i].anchor).sub(A).normalize();
    if (_v1.dot(_v2) < 0.35) continue;
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

function leap() {
  const ti = pickGrappleTarget();
  if (ti < 0) return false;
  P.targetTree = ti;
  P.chainTree = pickChainTree(ti);
  ui.hint.classList.add('hidden');
  _v1.copy(trees[ti].anchor).sub(P.pos).normalize();
  P.vel.set(_v1.x * 8, 11, _v1.z * 8);
  P.pos.y += 0.2;
  whoosh(0.25, 0.12);
  beginQTE();
  return true;
}

function startZip(cannonEarned) {
  P.state = 'zip';
  P.cannonEarned = !!cannonEarned;
  tsTarget = 1; fovTarget = 96;
  ui.qte.classList.add('hidden');
  ui.vignette.classList.remove('on');
  grappleTube.visible = true;
  grappleFist.visible = true;
  sfx.zip();
}

function landOn(ti) {
  const t = trees[ti];
  P.currentTree = ti;
  P.targetTree = -1;
  P.chainTree = -1;
  P.pos.copy(t.top).add(_v1.set(0, 1.5, 0));
  P.vel.set(0, 0, 0);
  P.hp = Math.min(100, P.hp + 3);
  P.score += 2;
  P.state = 'perched';
  tsTarget = 1; fovTarget = 74;
  grappleTube.visible = false;
  grappleFist.visible = false;
  yaw = Math.atan2(camFwd.x, -camFwd.z);
  pitch = 0;
  burst(t.top, MAT.spore, 8, 7, 6);
  sfx.land();
  shake = Math.min(1, shake + 0.2);
}

function arrive() {
  const ti = P.targetTree;
  P.pos.copy(trees[ti].anchor);
  grappleTube.visible = false;
  grappleFist.visible = false;

  if (act === 'grove') {
    P.score += 10;
    groveTarget = ti + 1;
    if (groveTarget >= trees.length) { startIslandTransition(); return; }
    P.currentTree = ti;
    P.targetTree = groveTarget;
    P.chainTree = -1;
    _v1.copy(trees[groveTarget].anchor).sub(P.pos).normalize();
    P.vel.set(_v1.x * 7, 10, _v1.z * 7);
    sfx.land();
    burst(trees[ti].top, MAT.spore, 8, 7, 6);
    beginQTE(); // the chase never lets up
    return;
  }

  if (P.cannonEarned && P.chainTree >= 0) {
    P.cannonEarned = false;
    const to = trees[P.chainTree].anchor;
    const T = 0.85, g = 24;
    P.vel.copy(to).sub(P.pos).divideScalar(T);
    P.vel.y += 0.5 * g * T;
    P.cannon = { t: 0, T, g };
    P.state = 'cannonball';
    P.targetTree = P.chainTree;
    P.chainTree = -1;
    tsTarget = 1; fovTarget = 104;
    P.score += 30;
    popText(P.pos, 'CANNONBALL!', 'pow');
    sfx.cannon();
    return;
  }
  landOn(ti);
}

// ---------------------------------------------------------- act transition
function startIslandTransition() {
  P.state = 'transition';
  tsTarget = 1;
  ui.qte.classList.add('hidden');
  ui.vignette.classList.remove('on');
  grappleTube.visible = false;
  grappleFist.visible = false;
  ui.fade.classList.add('on');
  sfx.zip();
  setTimeout(() => {
    clearWorld();
    buildIsland();
    act = 'island';
    chainIdx = 0;
    questN = 0;
    disguised = false;
    hasGun = false;
    hasFuel = false;
    alarm = false;
    P.state = 'walk';
    P.pos.copy(L.spawn);
    P.vel.set(0, 0, 0);
    P.heat = 40; // still hot until the Mask Maker fixes your face
    yaw = Math.PI; pitch = 0; roll = 0; // face into the island
    fovTarget = 74;
    ui.fade.classList.remove('on');
    ui.hint.textContent = 'You wash up on NOVOYA ISLE. WASD to walk · SPACE grapples when a tree is circled · talk to people by walking up to them.';
    ui.hint.classList.remove('hidden');
    setTimeout(() => ui.hint.classList.add('hidden'), 9000);
    popTextScreen('NEW QUEST: ' + CHAIN[0].t);
    sfx.quest();
  }, 1000);
}

// ---------------------------------------------------------- punch & zapper
function pickPunchTarget() {
  let bestE = null, bd = PUNCH_RANGE;
  for (const e of enemies) {
    if (e.dead || e.removed) continue;
    const d = e.group.position.distanceTo(P.pos);
    if (d > bd) continue;
    bd = d; bestE = e;
  }
  return bestE;
}

function tryPunch() {
  if (P.punchAnim) return;
  if (P.state === 'menu' || P.state === 'cutscene' || P.state === 'falling' || P.state === 'transition') return;
  const enemy = pickPunchTarget();
  const aim = enemy ? null : P.pos.clone().addScaledVector(camFwd, 10);
  P.punchAnim = { enemy, aim, t: 0, phase: 'out', end: new THREE.Vector3() };
  punchTube.visible = true;
  punchFist.visible = true;
  whoosh(0.15, 0.12);
}

function knockEnemy(e, label) {
  e.dead = true;
  _v1.copy(e.group.position).sub(P.pos).normalize();
  e.vel.set(_v1.x * 17 + (Math.random() - 0.5) * 4, 13, _v1.z * 17 + (Math.random() - 0.5) * 4);
  e.spin = 8 + Math.random() * 8;
  e.life = 2.5;
  P.punches += 1;
  P.score += 25;
  P.hp = Math.min(100, P.hp + 10);
  if (e.guard) P.heat = Math.min(100, P.heat + 26);
  shake = Math.min(1, shake + 0.5);
  burst(e.group.position, MAT.bullet, 8, 10, 8);
  popText(e.group.position, label, 'pow');
  sfx.pow();
  if (chainIdx === 2 && e.goon) {
    questN += 1;
    popTextScreen(`GOONS TIPPED: ${questN}/4`);
    if (questN >= 4) { advanceChain(); popTextScreen('Return to OLD ZEB for your zapper'); }
  }
}

function updatePunch(rdt) {
  const pa = P.punchAnim;
  if (!pa) return;
  const base = camPoint(-0.45, -0.42, 0.7);
  if (pa.phase === 'out') {
    pa.t += rdt / 0.13;
    const target = pa.enemy && !pa.enemy.removed ? pa.enemy.group.position : pa.aim;
    const k = Math.min(1, pa.t);
    pa.end.copy(base).lerp(target, k * k);
    if (pa.t >= 1) {
      if (pa.enemy && !pa.enemy.dead && !pa.enemy.removed) knockEnemy(pa.enemy, 'POW!');
      pa.phase = 'back';
      pa.t = 0;
    }
  } else {
    pa.t += rdt / 0.18;
    const k = Math.min(1, pa.t);
    pa.end.lerp(base, k);
    if (pa.t >= 1) {
      P.punchAnim = null;
      punchTube.visible = false;
      punchFist.visible = false;
      return;
    }
  }
  const mid = base.clone().lerp(pa.end, 0.5);
  mid.y += 0.4;
  setTube(punchTube, [base, mid, pa.end.clone()], 0.17, 10);
  punchFist.position.copy(pa.end);
}

function fireZapper() {
  if (!hasGun || P.gunCd > 0) return;
  P.gunCd = 0.28;
  // auto-aim: snap to the closest enemy or saucer near the crosshair
  let aimDir = camFwd.clone();
  let bs = 0.93;
  for (const e of enemies) {
    if (e.dead || e.removed) continue;
    _v1.copy(e.group.position).sub(P.pos);
    const d = _v1.length();
    if (d > 70) continue;
    _v1.divideScalar(d);
    if (_v1.dot(camFwd) > bs) { bs = _v1.dot(camFwd); aimDir = _v1.clone(); }
  }
  for (const u of pursuers) {
    if (!u.active || u.crashed) continue;
    _v1.copy(u.group.position).sub(P.pos);
    const d = _v1.length();
    if (d > 80) continue;
    _v1.divideScalar(d);
    if (_v1.dot(camFwd) > bs) { bs = _v1.dot(camFwd); aimDir = _v1.clone(); }
  }
  const m = new THREE.Mesh(GEO.bolt, MAT.bolt);
  m.position.copy(camPoint(0.35, -0.3, 0.8));
  scene.add(m);
  playerShots.push({ mesh: m, vel: aimDir.multiplyScalar(75), life: 1.4 });
  sfx.pew();
  shake = Math.min(1, shake + 0.1);
}

function updatePlayerShots(rdt) {
  P.gunCd = Math.max(0, P.gunCd - rdt);
  for (let i = playerShots.length - 1; i >= 0; i--) {
    const s = playerShots[i];
    s.mesh.position.addScaledVector(s.vel, rdt);
    s.life -= rdt;
    let hit = false;
    for (const e of enemies) {
      if (e.dead || e.removed) continue;
      if (e.group.position.distanceTo(s.mesh.position) < 1.6) {
        knockEnemy(e, 'ZAP!');
        P.score -= 10; // zapping is easier than punching — slightly less style
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
          sfx.pow();
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

// ---------------------------------------------------------- popups
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

// ---------------------------------------------------------- damage / respawn / win
function hurt(dmg) {
  if (P.state === 'menu' || P.state === 'won' || P.state === 'cutscene' || P.state === 'transition') return;
  P.hp -= dmg;
  sfx.hurt();
  shake = Math.min(1, shake + 0.35);
  ui.flash.classList.remove('on');
  void ui.flash.offsetWidth;
  ui.flash.classList.add('on');
  if (P.hp <= 0) {
    P.hp = 0;
    if (act === 'grove') retryGrove('SHOT DOWN! The chase resets. Again.');
    else respawnIsland('SHOT DOWN! You wake up on the beach. -50', 50);
  }
}

function respawnIsland(msg, penalty) {
  P.score = Math.max(0, P.score - penalty);
  P.hp = 100;
  P.state = 'walk';
  P.pos.copy(L.spawn);
  P.vel.set(0, 0, 0);
  P.punchAnim = null;
  punchTube.visible = false; punchFist.visible = false;
  grappleTube.visible = false; grappleFist.visible = false;
  ui.qte.classList.add('hidden');
  ui.vignette.classList.remove('on');
  tsTarget = 1; fovTarget = 74; roll = 0;
  yaw = Math.PI;
  P.heat = alarm ? 100 : (disguised ? 0 : 40);
  for (const u of pursuers) if (!u.crashed) u.group.position.copy(u.home);
  escapeTimer = 0;
  popTextScreen(msg);
  shake = 1;
}

function busted() {
  sfx.siren();
  if (act === 'grove') { retryGrove('BUSTED! ...They lost the paperwork. The chase resets.'); return; }
  respawnIsland('BUSTED! They fined you and dumped you on the beach. -100', 100);
}

function win() {
  P.state = 'won';
  P.score += 500;
  tsTarget = 0.25; fovTarget = 74;
  ui.qte.classList.add('hidden');
  ui.vignette.classList.remove('on');
  ui.crosshair.classList.add('hidden');
  if (P.score > best) {
    best = P.score;
    try { localStorage.setItem('ttp_best', String(best)); } catch (e) {}
  }
  ui.best.textContent = best;
  sfx.win();
  const mins = ((performance.now() - P.startTime) / 60000);
  ui.oTitle.textContent = '🚀 BLAST OFF!';
  ui.oSub.innerHTML = `The old mail rocket coughs, shudders — and LEAVES. Splort the Slippery escapes again.<br><b>${P.score}</b> score (best ${best}) &nbsp;·&nbsp; <b>${P.punches}</b> KOs &nbsp;·&nbsp; ${mins.toFixed(1)} min`;
  ui.oControls.classList.add('hidden');
  ui.playBtn.textContent = 'PLAY AGAIN';
  ui.overlay.classList.remove('hidden');
}

// ---------------------------------------------------------- wanted system
function wantedStars() { return P.heat <= 0 ? 0 : Math.min(3, 1 + Math.floor(P.heat / 34)); }

function updateWanted(rdt) {
  const stars = wantedStars();
  let active = 0;
  for (const u of pursuers) {
    if (u.crashed) { u.active = false; continue; }
    if (act === 'grove') { u.active = true; continue; }
    if (active < stars) { u.active = true; active++; } else { u.active = false; }
  }
  if (act === 'island' && !alarm) {
    const floor = disguised ? 0 : 40;
    let nearest = Infinity;
    for (const u of pursuers) if (u.active && !u.crashed) nearest = Math.min(nearest, u.group.position.distanceTo(P.pos));
    if (nearest > 70) {
      escapeTimer += rdt;
      if (escapeTimer > 4 && P.heat > floor) {
        P.heat = Math.max(floor, P.heat - 7 * rdt);
        if (P.heat === floor && floor === 0) popTextScreen('🚨 Heat: cold.');
      }
    } else {
      escapeTimer = 0;
    }
  }
}

function updatePursuers(rdt) {
  const hunting = P.state === 'perched' || P.state === 'qte' || P.state === 'zip' ||
    P.state === 'cannonball' || P.state === 'falling' || P.state === 'walk' || P.state === 'airborne';
  let minD = Infinity;
  for (const u of pursuers) {
    if (u.crashed) {
      // spiral down, smoke, then respawn at home
      if (u.group.position.y > 1.5) {
        u.group.position.addScaledVector(u.vel, rdt);
        u.group.position.y -= 9 * rdt;
        u.group.rotation.z += 3 * rdt;
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
      if (d > 5) u.group.position.addScaledVector(_v1.normalize(), Math.min(12 * rdt, d - 4.5));
      u.group.position.y = Math.max(u.group.position.y, 4); // saucers don't taxi
      u.group.rotation.y = Math.atan2(_v1.x, _v1.z);
      u.group.rotation.z = Math.sin(elapsed * 3 + u.phase) * 0.08;
      if (d < 6.5 && P.state !== 'falling' && P.state !== 'airborne') { busted(); return; }
      u.cd -= rdt;
      if (u.cd <= 0 && d < 70 && canBeShot()) {
        u.cd = 2.2 + Math.random() * 1.5;
        const lead = _v2.copy(P.pos).addScaledVector(P.vel, d / 30 * 0.4);
        lead.x += (Math.random() - 0.5) * 4;
        lead.y += (Math.random() - 0.5) * 4;
        lead.z += (Math.random() - 0.5) * 4;
        shootAt(u.group.position.clone().add(_v3.set(0, -0.4, 0)), lead, 30);
        sfx.shot(0.06);
      }
    } else {
      _v1.copy(u.home).sub(u.group.position);
      const d = _v1.length();
      if (d > 1) u.group.position.addScaledVector(_v1.normalize(), Math.min(10 * rdt, d));
      u.group.position.y = u.home.y + Math.sin(elapsed * 1.5 + u.phase) * 0.4;
      u.group.rotation.z = 0;
    }
  }
  if (isFinite(minD) && minD < 30 && elapsed - lastSiren > 1.6) { lastSiren = elapsed; sfx.siren(); }
}

// ---------------------------------------------------------- enemies (gunners)
function canBeShot() {
  return P.state === 'qte' || P.state === 'zip' || P.state === 'perched' ||
    P.state === 'cannonball' || P.state === 'walk' || P.state === 'airborne';
}

function enemyHostile(e) {
  if (e.guard) return true;                       // depot guards defend their turf
  if (e.goon) return chainIdx >= 2 || e.group.position.distanceTo(P.pos) < 10;
  return true; // grove gunners (none currently) default hostile
}

function shootAt(from, target, speed) {
  const m = new THREE.Mesh(GEO.bullet, MAT.bullet);
  m.position.copy(from);
  const dir = target.clone().sub(from).normalize();
  projectiles.push({ mesh: m, vel: dir.multiplyScalar(speed), life: 5 });
  scene.add(m);
}

function updateEnemies(wdt) {
  const shootable = canBeShot();
  for (const e of enemies) {
    if (e.removed) continue;
    if (e.dead) {
      e.vel.y -= 26 * wdt;
      e.group.position.addScaledVector(e.vel, wdt);
      e.group.rotation.x += e.spin * wdt;
      e.group.rotation.z += e.spin * 0.7 * wdt;
      e.life -= wdt;
      if (e.life <= 0) { e.removed = true; scene.remove(e.group); }
      continue;
    }
    const d = e.group.position.distanceTo(P.pos);
    if (d > 90) continue;
    e.group.rotation.y = Math.atan2(P.pos.x - e.group.position.x, P.pos.z - e.group.position.z);
    if (e.flashT > 0) {
      e.flashT -= wdt;
      e.muzzle.scale.setScalar(Math.max(0.01, e.flashT * 6));
    }
    const range = e.guard ? 45 : 26;
    if (!shootable || d < 3 || d > range || !enemyHostile(e)) continue;
    e.cd -= wdt;
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

function updateProjectiles(wdt) {
  const canHit = canBeShot();
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i];
    pr.mesh.position.addScaledVector(pr.vel, wdt);
    pr.life -= wdt;
    if (canHit && pr.mesh.position.distanceTo(P.pos) < 1.4) {
      hurt(12);
      burst(pr.mesh.position, MAT.bullet, 5, 6, 5);
      pr.life = 0;
    }
    if (pr.life <= 0) {
      scene.remove(pr.mesh);
      projectiles.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------- island interactions
function nearXZ(a, b, r, dy) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return dx * dx + dz * dz < r * r && Math.abs(a.y - b.y) < dy;
}

function updateIsland(rdt) {
  // talk to whoever you walk up to
  if (P.state === 'walk' && !dlg && elapsed > talkCd) {
    for (const n of npcs) {
      if (nearXZ(n.pos, P.pos, 3.6, 4)) { n.talk(); break; }
    }
  }
  // scrap pickups
  if (chainIdx === 5) {
    for (const s of scraps) {
      if (s.taken) continue;
      s.mesh.rotation.y += rdt * 2;
      s.mesh.rotation.x += rdt;
      if (nearXZ(s.mesh.position, P.pos, 4, 7)) {
        s.taken = true;
        worldGroup.remove(s.mesh);
        questN += 1;
        P.score += 15;
        burst(s.mesh.position, MAT.bolt, 8, 7, 6);
        sfx.pickup();
        popTextScreen(`SCRAP: ${questN}/4`);
        if (questN >= 4) { advanceChain(); }
      }
    }
  }
  // the depot alarm
  if (chainIdx === 7 && !alarm && nearXZ(P.pos, L.depot, 32, 40)) {
    alarm = true;
    P.heat = 100;
    sfx.siren();
    popTextScreen('🚨 DEPOT ALARM — GRAB THE CELL AND RUN!');
  }
  // the fuel cell
  if (chainIdx === 7 && fuelCell && nearXZ(fuelCell.position, P.pos, 3.2, 5)) {
    hasFuel = true;
    worldGroup.remove(fuelCell);
    fuelCell = null;
    sfx.pickup();
    advanceChain();
  }
  // the rocket
  if (chainIdx === 8 && nearXZ(P.pos, L.rocket, 8, 14)) {
    alarm = false;
    win();
  }
  // fuel cell bob
  if (fuelCell) fuelCell.position.y = 3.2 + Math.sin(elapsed * 2.2) * 0.15;
  // objective beam follows the chain
  if (objectiveBeam && chainIdx < CHAIN.length) {
    const t = CHAIN[chainIdx].tgt();
    objectiveBeam.position.x = t.x;
    objectiveBeam.position.z = t.z;
  }
}

// ---------------------------------------------------------- opening cutscene
const CUT_LINES = [
  { who: 'GALACTIC PATROL', text: 'SPLORT THE SLIPPERY! By order of the Galactic Patrol you are under arrest for 4,362 counts of grand larceny... and one (1) stolen moon.', dur: 6.0, cam: 'wide' },
  { who: 'GALACTIC PATROL', text: 'Put your tentacles where we can see them. Yes. BOTH of them.', dur: 4.2, cam: 'saucer' },
  { who: 'SPLORT', text: 'Heh... you’ll have to catch me first.', dur: 3.4, cam: 'hero' },
  { who: '', text: '\u{1F6A8} ESCAPE THROUGH THE GROVE!', dur: 1.5, cam: 'dive' },
];

function buildCutBody() {
  cutBody = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.55, 6, 12), MAT.body);
  cutBody.add(body);
  for (const sx of [-0.2, 0.2]) {
    const ew = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), MAT.eyeW);
    ew.position.set(sx, 0.28, 0.42);
    cutBody.add(ew);
    const eb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), MAT.eyeB);
    eb.position.set(sx, 0.28, 0.54);
    cutBody.add(eb);
  }
  for (const side of [-1, 1]) {
    const pts = [
      new THREE.Vector3(side * 0.35, -0.3, 0),
      new THREE.Vector3(side * 0.9, 0.1, 0.15),
      new THREE.Vector3(side * 1.15, 0.9, 0.1),
      new THREE.Vector3(side * 1.0, 1.5, -0.1),
    ];
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.11, 6, false), MAT.tentacle);
    cutBody.add(tube);
  }
  const T = trees[0].top;
  cutBody.position.set(T.x, T.y + 1.1, T.z);
  const mid = pursuers[0].group.position.clone().add(pursuers[1].group.position).multiplyScalar(0.5);
  cutBody.rotation.y = Math.atan2(mid.x - T.x, mid.z - T.z);
  scene.add(cutBody);
}

function cutCam(name) {
  const T = trees[0].top;
  const s0 = pursuers[0].group.position;
  const mid = s0.clone().add(pursuers[1].group.position).multiplyScalar(0.5);
  if (name === 'wide') return {
    from: new THREE.Vector3(T.x + 20, T.y + 9, T.z + 26),
    to: new THREE.Vector3(T.x + 14, T.y + 6, T.z + 22),
    look: mid.clone().lerp(T, 0.4),
  };
  if (name === 'saucer') return {
    from: s0.clone().add(new THREE.Vector3(5, 1.5, 5)),
    to: s0.clone().add(new THREE.Vector3(3, 0.6, 3)),
    look: s0.clone(),
  };
  if (name === 'hero') return {
    from: new THREE.Vector3(T.x + (mid.x - T.x) * 0.3, T.y + 1.6, T.z + (mid.z - T.z) * 0.3),
    to: new THREE.Vector3(T.x + (mid.x - T.x) * 0.18, T.y + 1.3, T.z + (mid.z - T.z) * 0.18),
    look: new THREE.Vector3(T.x, T.y + 1.4, T.z),
  };
  return {
    from: camera.position.clone(),
    to: new THREE.Vector3(T.x, T.y + 1.9, T.z),
    look: new THREE.Vector3(T.x, T.y + 1.9, T.z - 10),
  };
}

function startCutscene() {
  cutsceneSeen = true;
  P.state = 'cutscene';
  buildCutBody();
  ui.crosshair.classList.add('hidden');
  ui.hint.classList.add('hidden');
  ui.cutscene.classList.remove('hidden');
  ui.cutSkip.textContent = 'SKIP ▸▸';
  cut = { line: -1, t: 0, from: null, to: null, look: null, dur: 0 };
  nextCutLine();
  sfx.siren();
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
  if (L2.cam === 'dive') sfx.zip();
}

function endCutscene() {
  cut = null;
  if (cutBody) { cutBody.traverse((o) => o.geometry && o.geometry.dispose()); scene.remove(cutBody); cutBody = null; }
  ui.cutscene.classList.add('hidden');
  ui.crosshair.classList.remove('hidden');
  P.state = 'perched';
  P.heat = 70;
  for (const u of pursuers) u.active = true;
  yaw = 0; pitch = 0;
  ui.hint.textContent = '\u{1F6A8} SPACE to grapple — hit the numbers, stay ahead of the sirens!';
  ui.hint.classList.remove('hidden');
  setTimeout(() => ui.hint.classList.add('hidden'), 6000);
}

function updateCutscene(rdt) {
  if (!cut) return;
  cut.t += rdt;
  const L2 = CUT_LINES[cut.line];
  const k = Math.min(1, cut.t / cut.dur);
  const e = k * k * (3 - 2 * k);
  camera.position.lerpVectors(cut.from, cut.to, e);
  camera.lookAt(cut.look);
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

// ---------------------------------------------------------- tentacle rendering
function camPoint(x, y, z) {
  return _v1.copy(camera.position)
    .addScaledVector(_camR, x).addScaledVector(_camU, y).addScaledVector(_camF, z).clone();
}

function updateTentacles(rdt) {
  const t = elapsed;
  _camR.setFromMatrixColumn(camera.matrixWorld, 0);
  _camU.setFromMatrixColumn(camera.matrixWorld, 1);
  _camF.setFromMatrixColumn(camera.matrixWorld, 2).negate();

  const lagX = THREE.MathUtils.clamp(P.vel.dot(_camR) * -0.008, -0.4, 0.4);
  const lagY = THREE.MathUtils.clamp(P.vel.dot(_camU) * -0.008, -0.3, 0.3);
  const bases = [[-0.45, -0.38], [0.45, -0.38]];
  for (let i = 0; i < 2; i++) {
    const [bx, by] = bases[i];
    const sway = Math.sin(t * 5 + i * 2.1) * 0.2;
    const sway2 = Math.cos(t * 4 + i * 1.6) * 0.15;
    const base = camPoint(bx, by, 0.5);
    const p1 = camPoint(bx * 1.15 + sway * 0.5, by - 0.05 + sway2 * 0.3, 1.05);
    const p2 = camPoint(bx * 1.35 + sway + lagX, by - 0.08 + sway2 * 0.6 + lagY, 1.75);
    setTube(idleTubes[i], [base, p1, p2], 0.09, 8);
  }

  if (grappleTube.visible && P.targetTree >= 0) {
    const end = trees[P.targetTree].anchor;
    const start = camPoint(0.5, -0.45, 0.8);
    const mid = start.clone().lerp(end, 0.5);
    const d = start.distanceTo(end);
    const wig = Math.min(1.6, d * 0.08);
    mid.x += Math.sin(t * 22) * wig;
    mid.y += Math.cos(t * 19) * wig * 0.6 + d * 0.03;
    mid.z += Math.cos(t * 24) * wig;
    setTube(grappleTube, [start, mid, end.clone()], 0.13, 16);
    grappleFist.position.copy(end);
  }

  updatePunch(rdt);
}

// ---------------------------------------------------------- camera
function updateCamera(rdt) {
  camera.position.copy(P.pos).add(_v1.set(0, 0.4, 0));
  if (shake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * shake * 0.5;
    camera.position.y += (Math.random() - 0.5) * shake * 0.5;
    shake *= Math.exp(-6 * rdt);
  }

  if (P.state === 'perched' || P.state === 'walk') {
    const dead = 0.12;
    let turn = 0;
    if (Math.abs(mouse.x) > dead) {
      const m = (Math.abs(mouse.x) - dead) / (1 - dead);
      turn = Math.sign(mouse.x) * m * m * 2.6;
    }
    if (keys['KeyA'] || keys['ArrowLeft']) turn -= 2.2;
    if (keys['KeyD'] || keys['ArrowRight']) turn += 2.2;
    yaw += turn * rdt;
    pitch = THREE.MathUtils.clamp(-mouse.y * 0.55, -0.9, 0.9);
    camFwd.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).normalize();
    camera.lookAt(_v1.copy(camera.position).add(camFwd));
  } else {
    let lookDir = null;
    if (P.state === 'qte' || P.state === 'zip' || P.state === 'cannonball') {
      if (P.targetTree >= 0) lookDir = _v1.copy(trees[P.targetTree].anchor).sub(P.pos);
    } else if (P.state === 'falling' || P.state === 'airborne') {
      lookDir = _v1.copy(P.vel);
      lookDir.y *= 0.5;
    }
    if (lookDir && lookDir.lengthSq() > 0.01) {
      camFwd.lerp(lookDir.normalize(), 1 - Math.exp(-5 * rdt)).normalize();
    }
    _v2.crossVectors(camFwd, _v3.set(0, 1, 0)).normalize();
    const look = _v1.copy(camera.position).addScaledVector(camFwd, 10)
      .addScaledVector(_v2, mouse.x * 2.4)
      .add(_v3.set(0, -mouse.y * 1.6, 0));
    camera.lookAt(look);
  }

  if (P.state === 'cannonball' && P.cannon) {
    roll = (P.cannon.t / P.cannon.T) * Math.PI * 2;
  } else if (P.state === 'falling' || P.state === 'airborne') {
    roll += P.tumble * rdt * 0.5;
  } else if (P.state === 'zip') {
    rollTarget = Math.sin(elapsed * 9) * 0.06;
    roll += (rollTarget - roll) * (1 - Math.exp(-8 * rdt));
  } else {
    roll += (0 - roll) * (1 - Math.exp(-8 * rdt));
  }
  camera.rotateZ(roll);

  fov += (fovTarget - fov) * (1 - Math.exp(-6 * rdt));
  camera.fov = fov;
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------- HUD
function updateHUD() {
  ui.hp.style.width = P.hp + '%';
  ui.hp.classList.toggle('low', P.hp <= 30);
  ui.score.textContent = P.score;
  const stars = wantedStars();
  ui.wanted.textContent = stars > 0 ? '🚨' + '★'.repeat(stars) + '☆'.repeat(3 - stars) : '☆☆☆';
  ui.wanted.classList.toggle('hot', stars > 0);

  // quest bar
  if (P.state === 'menu' || P.state === 'cutscene') {
    ui.questBar.classList.add('hidden');
  } else if (act === 'grove') {
    ui.questBar.classList.remove('hidden');
    ui.questTitle.textContent = 'ESCAPE THE PATROL';
    ui.questObj.textContent = `${Math.max(0, trees.length - groveTarget)} trees to the coast — don't stop`;
  } else if (chainIdx < CHAIN.length && P.state !== 'won') {
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

  if (P.state === 'qte') {
    const frac = Math.max(0, P.qteTime / QTE_TIME);
    ui.qteRing.style.strokeDashoffset = String(283 * (1 - frac));
    ui.qteRing.style.stroke = frac > 0.4 ? '#4dffe1' : '#ff4fd8';
    ui.qteTime.textContent = Math.max(0, P.qteTime).toFixed(1);
  }
  const canPunch = !P.punchAnim && canBeShot() && pickPunchTarget();
  ui.crosshair.classList.toggle('lock', !!canPunch);
}

// ---------------------------------------------------------- main loop
const clock = new THREE.Clock();

function frame() {
  const rdt = Math.min(clock.getDelta(), 0.05);
  elapsed += rdt;
  ts += (tsTarget - ts) * (1 - Math.exp(-8 * rdt));
  const wdt = rdt * ts;

  switch (P.state) {
    case 'menu':
      if (trees.length) {
        const a = elapsed * 0.12;
        const c = trees[0].top;
        camera.position.set(c.x + Math.cos(a) * 30, c.y + 12, c.z + Math.sin(a) * 30);
        camera.lookAt(c.x, c.y - 2, c.z);
      }
      break;

    case 'cutscene':
      updateCutscene(rdt);
      break;

    case 'perched':
      P.pos.y = trees[P.currentTree].top.y + 1.5 + Math.sin(elapsed * 2.5) * 0.06;
      break;

    case 'walk': {
      let mv = 0;
      if (keys['KeyW'] || keys['ArrowUp']) mv = 1;
      else if (keys['KeyS'] || keys['ArrowDown']) mv = -1;
      if (mv !== 0 && !dlg) {
        _v1.set(camFwd.x, 0, camFwd.z).normalize();
        P.pos.addScaledVector(_v1, mv * 10 * rdt);
        stepT -= rdt;
        if (stepT <= 0) { stepT = 0.34; sfx.step(); }
      }
      // stay on the island
      const r = Math.hypot(P.pos.x, P.pos.z);
      if (r > ISLE_R) {
        P.pos.x *= ISLE_R / r;
        P.pos.z *= ISLE_R / r;
      }
      // gentle jump arc
      if (P.vel.y !== 0 || P.pos.y > WALK_Y) {
        P.vel.y -= 24 * rdt;
        P.pos.y += P.vel.y * rdt;
        if (P.pos.y <= WALK_Y) { P.pos.y = WALK_Y; P.vel.y = 0; }
      }
      break;
    }

    case 'airborne': {
      P.vel.y -= 26 * wdt;
      P.pos.addScaledVector(P.vel, wdt);
      if (P.pos.y <= WALK_Y) {
        P.pos.y = WALK_Y;
        if (P.vel.y < -34) { hurt(15); popTextScreen('OOF.'); }
        P.vel.set(0, 0, 0);
        P.state = 'walk';
        roll = 0; P.tumble = 0;
        sfx.land();
      }
      break;
    }

    case 'qte': {
      P.vel.y -= 10 * wdt;
      P.pos.addScaledVector(P.vel, wdt);
      P.qteTime -= rdt;
      const sec = Math.ceil(P.qteTime * 2);
      if (P.qteTime < 1.5 && sec !== lastTickSec) { lastTickSec = sec; sfx.tick(); }
      if (P.qteTime <= 0) qteFail();
      break;
    }

    case 'zip': {
      const anchor = trees[P.targetTree].anchor;
      _v1.copy(anchor).sub(P.pos);
      const d = _v1.length();
      const step = Math.min(d, ZIP_SPEED * wdt);
      P.pos.addScaledVector(_v1.normalize(), step);
      P.vel.copy(_v1).multiplyScalar(ZIP_SPEED);
      trailT -= rdt;
      if (trailT <= 0) { trailT = 0.03; burst(P.pos, MAT.trail, 1, 1, 1); }
      if (d < 3) arrive();
      break;
    }

    case 'cannonball': {
      const c = P.cannon;
      c.t += wdt;
      P.vel.y -= c.g * wdt;
      P.pos.addScaledVector(P.vel, wdt);
      trailT -= rdt;
      if (trailT <= 0) { trailT = 0.025; burst(P.pos, MAT.trail, 1, 1, 1); }
      for (const e of enemies) {
        if (!e.dead && !e.removed && e.group.position.distanceTo(P.pos) < 3.6) knockEnemy(e, 'SMUSHED!');
      }
      const d = P.pos.distanceTo(trees[P.targetTree].anchor);
      if (d < 3 || c.t > c.T * 1.6) { P.cannon = null; landOn(P.targetTree); }
      break;
    }

    case 'falling': { // grove only — fatal
      P.vel.y -= 28 * wdt;
      P.pos.addScaledVector(P.vel, wdt);
      if (P.pos.y < 1.2) {
        burst(P.pos, MAT.spore, 14, 9, 9);
        sfx.splat();
        retryGrove('SPLAT! The chase resets. Again.');
      }
      break;
    }
  }

  // reticle preview
  if ((P.state === 'perched' || P.state === 'walk' || P.state === 'airborne') && !dlg) {
    const ti = pickGrappleTarget();
    if (ti >= 0) {
      reticle.visible = true;
      const chain = act === 'island' ? pickChainTree(ti) : -1;
      reticle.material = chain >= 0 ? MAT.reticleTwin : MAT.reticle;
      reticle.position.copy(trees[ti].anchor);
    } else {
      reticle.visible = false;
    }
  } else if (P.state === 'qte' || P.state === 'zip') {
    reticle.visible = P.targetTree >= 0;
    if (P.targetTree >= 0) reticle.position.copy(trees[P.targetTree].anchor);
  } else {
    reticle.visible = false;
  }
  if (reticle.visible) {
    reticle.lookAt(camera.position);
    reticle.scale.setScalar(1 + Math.sin(elapsed * 8) * 0.12);
  }

  // ambient
  for (const n of npcs) n.group.rotation.y = Math.atan2(P.pos.x - n.pos.x, P.pos.z - n.pos.z);
  mist.position.x = camera.position.x;
  mist.position.z = camera.position.z;
  ground.position.x = camera.position.x;
  ground.position.z = camera.position.z;
  skyGroup.position.x = camera.position.x;
  skyGroup.position.z = camera.position.z;

  if (P.state !== 'menu' && P.state !== 'cutscene' && P.state !== 'won' && P.state !== 'transition') {
    updateWanted(rdt);
    if (act === 'island') updateIsland(rdt);
  }
  updateEnemies(wdt);
  updateProjectiles(wdt);
  updatePlayerShots(rdt);
  updatePursuers(rdt);
  updateParticles(Math.max(wdt, rdt * 0.3));
  if (P.state !== 'menu' && P.state !== 'cutscene') updateCamera(rdt);
  const firstPerson = canBeShot() || P.state === 'falling';
  for (const tube of idleTubes) tube.visible = firstPerson;
  updateTentacles(rdt);
  updateHUD();

  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame);

// ---------------------------------------------------------- input
window.addEventListener('keydown', (ev) => {
  keys[ev.code] = true;
  if (ev.repeat) return;
  const m = ev.code.match(/^(?:Digit|Numpad)([1-6])$/);
  if (m) { handleNumber(parseInt(m[1], 10)); return; }
  if (ev.code === 'Space') {
    ev.preventDefault();
    if (dlg) { advanceDialog(); return; }
    if (P.state === 'cutscene') advanceCutscene();
    else if (P.state === 'perched') {
      if (!leap()) { // no tree? hop off and drop down
        if (act === 'island') {
          P.state = 'airborne';
          P.vel.set(camFwd.x * 7, 3, camFwd.z * 7);
        }
      }
    } else if (P.state === 'walk') {
      if (!leap()) { if (P.pos.y <= WALK_Y + 0.01) P.vel.y = 9; } // jump
    } else if (P.state === 'airborne') {
      leap(); // tarzan chains allowed
    } else if (P.state === 'won') window.location.reload();
    else if (P.state === 'menu') startGame();
    return;
  }
  if (ev.code === 'KeyE' || ev.code === 'KeyF') { tryPunch(); return; }
});
window.addEventListener('keyup', (ev) => { keys[ev.code] = false; });

window.addEventListener('mousemove', (ev) => {
  mouse.x = (ev.clientX / window.innerWidth) * 2 - 1;
  mouse.y = (ev.clientY / window.innerHeight) * 2 - 1;
});

renderer.domElement.addEventListener('pointerdown', (ev) => {
  audioCtx();
  if (ev.button !== 0) return;
  if (dlg) { advanceDialog(); return; }
  if (P.state === 'cutscene') { advanceCutscene(); return; }
  if (P.state === 'menu' || P.state === 'won' || P.state === 'transition') return;
  // armed? shoot. otherwise punch.
  if (hasGun) fireZapper(); else tryPunch();
});

for (const btn of document.querySelectorAll('.qkey')) {
  btn.addEventListener('pointerdown', (ev) => {
    ev.stopPropagation();
    handleNumber(parseInt(btn.dataset.n, 10));
  });
}

ui.playBtn.addEventListener('click', () => {
  if (P.state === 'won') window.location.reload();
  else startGame();
});
ui.cutSkip.addEventListener('pointerdown', (ev) => {
  ev.stopPropagation();
  if (dlg) { while (dlg) advanceDialog(); return; }
  if (cut) endCutscene();
});

// ---------------------------------------------------------- boot
function startGame() {
  audioCtx();
  P.startTime = performance.now();
  ui.overlay.classList.add('hidden');
  ui.crosshair.classList.remove('hidden');
  P.state = 'perched';
  P.currentTree = 0;
  P.pos.copy(trees[0].top).add(_v1.set(0, 1.5, 0));
  yaw = 0; pitch = 0;
  if (!cutsceneSeen) startCutscene();
}

buildGrove();
P.pos.copy(trees[0].top).add(new THREE.Vector3(0, 1.5, 0));

// exposed for automated smoke tests
window.__game = P;
window.__debug = {
  P, trees, enemies, pursuers, npcs, scraps, L,
  chain: () => ({ chainIdx, questN, disguised, hasGun, hasFuel, alarm, act }),
  advanceChain, setHeat: (h) => { P.heat = h; },
  dlgOpen: () => !!dlg, advanceDialog, clearTalk: () => { talkCd = 0; },
  giveGun: () => { hasGun = true; }, shots: () => playerShots.length, fire: fireZapper,
  playerShots, camFwd: () => camFwd, camPos: () => camera.position, setYaw: (y) => { yaw = y; },
  startIslandTransition, leap,
  fuel: () => fuelCell, rocketRef: () => rocket,
};

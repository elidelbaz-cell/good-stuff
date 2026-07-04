import * as THREE from 'three';

/* ============================================================
   TENTACLE TREETOPS
   First-person alien tree parkour. Your ship is at the end of
   the grove. Every grapple is a slow-motion QTE — press the
   shown number (1-6) within 3.5 seconds or you fall. Twin trees
   show TWO numbers: hit both to cannonball through. Little
   gunners camp on floating platforms — left click auto-fires a
   tentacle punch at the nearest one.
   ============================================================ */

const QTE_TIME = 3.5;
const ZIP_SPEED = 55;
const PUNCH_RANGE = 24;

// ---------------------------------------------------------- dom
const $ = (id) => document.getElementById(id);
const ui = {
  hp: $('hpbar'), trees: $('stat-trees'), score: $('stat-score'), best: $('stat-best'),
  level: $('stat-level'), hops: $('stat-hops'),
  qte: $('qte'), qteNum: $('qte-num'), qteRing: $('qte-ring'), qteTime: $('qte-time'),
  qteCircle: $('qte-circle'), qteLabel: $('qte-label'),
  vignette: $('vignette'), flash: $('flash'), crosshair: $('crosshair'),
  overlay: $('overlay'), oTitle: $('o-title'), oSub: $('o-sub'), oControls: $('o-controls'),
  playBtn: $('playbtn'), hint: $('hint'), pops: $('pops'),
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
  hurt: () => tone(220, 0.2, 'sawtooth', 0.2, 110),
  splat: () => { tone(200, 0.5, 'sawtooth', 0.25, 40); whoosh(0.3, 0.3); },
  fall: () => tone(700, 1.0, 'sine', 0.15, 120),
  win: () => { tone(523, 0.15, 'square', 0.13); setTimeout(() => tone(659, 0.15, 'square', 0.13), 130); setTimeout(() => tone(784, 0.3, 'square', 0.13), 260); setTimeout(() => tone(1047, 0.5, 'square', 0.13), 420); },
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
  trunk2: new THREE.MeshLambertMaterial({ color: 0x2c2850 }),
  rock: new THREE.MeshLambertMaterial({ color: 0x4a4668 }),
  leafA: new THREE.MeshLambertMaterial({ color: 0x3a1f4d, emissive: 0xb03fd0, emissiveIntensity: 0.5 }),
  leafB: new THREE.MeshLambertMaterial({ color: 0x123c3a, emissive: 0x2ac5b5, emissiveIntensity: 0.5 }),
  leafC: new THREE.MeshLambertMaterial({ color: 0x2a1a55, emissive: 0x6a4fe8, emissiveIntensity: 0.5 }),
  pad: new THREE.MeshLambertMaterial({ color: 0x2a2438 }),
  padRing: new THREE.MeshBasicMaterial({ color: 0x4dffe1 }),
  platRing: new THREE.MeshBasicMaterial({ color: 0xff4fd8 }),
  tentacle: new THREE.MeshLambertMaterial({ color: 0x9a6ff0, emissive: 0x241040, emissiveIntensity: 1 }),
  sucker: new THREE.MeshLambertMaterial({ color: 0xd8c6ff, emissive: 0x4a2f80, emissiveIntensity: 0.6 }),
  skin: new THREE.MeshLambertMaterial({ color: 0x8de85c }),
  suit: new THREE.MeshLambertMaterial({ color: 0x2b2b3d }),
  suit2: new THREE.MeshLambertMaterial({ color: 0x3d2b3a }),
  eyeB: new THREE.MeshBasicMaterial({ color: 0x0a0a12 }),
  gun: new THREE.MeshLambertMaterial({ color: 0x1c1c28 }),
  bullet: new THREE.MeshBasicMaterial({ color: 0xff4fd8 }),
  flash: new THREE.MeshBasicMaterial({ color: 0xffb3ee }),
  reticle: new THREE.MeshBasicMaterial({ color: 0x4dffe1, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }),
  spore: new THREE.MeshBasicMaterial({ color: 0xb03fd0 }),
  trail: new THREE.MeshBasicMaterial({ color: 0xc0a4ff }),
  hull: new THREE.MeshLambertMaterial({ color: 0x8a93b8 }),
  hullDark: new THREE.MeshLambertMaterial({ color: 0x3c4260 }),
  dome: new THREE.MeshLambertMaterial({ color: 0x7ef2dd, emissive: 0x2ac5b5, emissiveIntensity: 0.7, transparent: true, opacity: 0.85 }),
  beam: new THREE.MeshBasicMaterial({ color: 0x4dffe1, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
  shipLight: new THREE.MeshBasicMaterial({ color: 0xffe14d }),
};
const GEO = {
  bullet: new THREE.SphereGeometry(0.22, 8, 8),
  bit: new THREE.BoxGeometry(0.22, 0.22, 0.22),
  head: new THREE.SphereGeometry(0.24, 10, 10),
  eye: new THREE.SphereGeometry(0.075, 8, 8),
  enemyBody: new THREE.CylinderGeometry(0.28, 0.34, 0.68, 8),
  gun: new THREE.BoxGeometry(0.1, 0.12, 0.55),
  muzzle: new THREE.SphereGeometry(0.16, 6, 6),
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

// starfield + ringed gas giant + moon follow the camera so the sky never runs out
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

// ---------------------------------------------------------- world
const trees = [];     // { anchor, top, group, twin }
const platforms = []; // { group, baseY, phase }
const enemies = [];   // { group, muzzle, platform, offset, dead, removed, cd, vel, spin, life, flashT }
let heading = 0;
let level = 1;
let ship = null;      // { group, anchor }

function randPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function treeCount() { return 14 + (level - 1) * 3; }
function platformChance() { return Math.min(0.85, 0.45 + level * 0.08); }
function twinChance() { return Math.min(0.5, 0.2 + level * 0.05); }

function makeDecorTree(group, x, z, h) {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.8, h, 6), MAT.trunk2);
  trunk.position.set(x, h / 2, z);
  group.add(trunk);
  const bulb = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6 + Math.random() * 1.4, 0), randPick([MAT.leafA, MAT.leafB, MAT.leafC]));
  bulb.position.set(x, h + 1.2, z);
  group.add(bulb);
}

function makeTree(i) {
  let x, y, z;
  const prev = trees[i - 1];
  const isPartner = !!(prev && prev.twin); // this tree completes a twin pair
  if (i === 0) { x = 0; y = 26; z = 0; heading = 0; }
  else if (isPartner) {
    heading += (Math.random() - 0.5) * 0.4;
    const dist = 10 + Math.random() * 3;
    x = prev.top.x + Math.sin(heading) * dist;
    z = prev.top.z - Math.cos(heading) * dist;
    y = THREE.MathUtils.clamp(prev.top.y + (Math.random() - 0.5) * 4, 18, 46);
  } else {
    heading += (Math.random() - 0.5) * 1.0;
    const dist = 26 + Math.random() * 12;
    x = prev.top.x + Math.sin(heading) * dist;
    z = prev.top.z - Math.cos(heading) * dist;
    y = THREE.MathUtils.clamp(prev.top.y + (Math.random() - 0.5) * 11, 18, 46);
  }
  const group = new THREE.Group();

  if (i === 0) {
    // crash-site rock spire — where your escape pod came down
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

  const nDecor = 2 + Math.floor(Math.random() * 2);
  for (let k = 0; k < nDecor; k++) {
    const a = Math.random() * Math.PI * 2;
    const r = 13 + Math.random() * 22;
    makeDecorTree(group, x + Math.cos(a) * r, z + Math.sin(a) * r, 6 + Math.random() * 16);
  }

  scene.add(group);
  const top = new THREE.Vector3(x, y + 0.5, z);
  const anchor = new THREE.Vector3(x, y + 1.1, z);
  const twin = !isPartner && i >= 2 && i < treeCount() - 2 && Math.random() < twinChance();
  trees.push({ anchor, top, group, twin });

  // floating gunner platform beside the hop we just created (never in a twin gap)
  if (i >= 2 && !isPartner && Math.random() < platformChance()) {
    makePlatform(prev.top, top);
  }
}

function makePlatform(a, b) {
  const mid = a.clone().lerp(b, 0.35 + Math.random() * 0.3);
  const dir = b.clone().sub(a).setY(0).normalize();
  const perp = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar((Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 6));
  const pos = mid.add(perp);
  pos.y += -1 + Math.random() * 5;

  const group = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 1.5, 0.55, 8), MAT.hullDark);
  group.add(disc);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.11, 6, 24), MAT.platRing);
  rim.position.y = 0.3;
  rim.rotation.x = Math.PI / 2;
  group.add(rim);
  const glow = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.6, 8), MAT.beam);
  glow.position.y = -1.0;
  glow.rotation.x = Math.PI;
  group.add(glow);
  group.position.copy(pos);
  scene.add(group);
  const plat = { group, baseY: pos.y, phase: Math.random() * Math.PI * 2 };
  platforms.push(plat);

  const n = Math.random() < 0.35 ? 2 : 1;
  for (let k = 0; k < n; k++) spawnEnemy(plat, k);
}

function spawnEnemy(plat, k) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(GEO.enemyBody, Math.random() < 0.5 ? MAT.suit : MAT.suit2);
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
  const gun = new THREE.Mesh(GEO.gun, MAT.gun);
  gun.position.set(0.26, 0.55, 0.2);
  g.add(gun);
  const muzzle = new THREE.Mesh(GEO.muzzle, MAT.flash);
  muzzle.position.set(0.26, 0.55, 0.55);
  muzzle.scale.setScalar(0.01);
  g.add(muzzle);
  const a = Math.random() * Math.PI * 2;
  const offset = new THREE.Vector3(Math.cos(a) * (0.6 + k * 0.6), 0.28, Math.sin(a) * (0.6 + k * 0.6));
  g.position.copy(plat.group.position).add(offset);
  scene.add(g);
  enemies.push({ group: g, muzzle, platform: plat, offset, dead: false, removed: false, cd: 1 + Math.random() * 2, vel: new THREE.Vector3(), spin: 0, life: 3, flashT: 0 });
}

function makeShip() {
  const last = trees[trees.length - 1].top;
  const dir = new THREE.Vector3(Math.sin(heading), 0, -Math.cos(heading));
  const pos = last.clone().addScaledVector(dir, 27);
  pos.y += 8;

  const group = new THREE.Group();
  const hullBottom = new THREE.Mesh(new THREE.SphereGeometry(3.6, 20, 12), MAT.hull);
  hullBottom.scale.set(1, 0.32, 1);
  group.add(hullBottom);
  const hullBand = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.5, 8, 28), MAT.hullDark);
  hullBand.rotation.x = Math.PI / 2;
  group.add(hullBand);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), MAT.dome);
  dome.position.y = 0.7;
  group.add(dome);
  const lights = new THREE.Group();
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 6), MAT.shipLight);
    l.position.set(Math.cos(a) * 3.1, -0.15, Math.sin(a) * 3.1);
    lights.add(l);
  }
  group.add(lights);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(2.4, 9, 16, 1, true), MAT.beam);
  beam.position.y = -5;
  group.add(beam);
  group.position.copy(pos);
  scene.add(group);
  ship = { group, lights, anchor: pos.clone().add(new THREE.Vector3(0, -1.2, 0)), baseY: pos.y, phase: 0 };
}

function disposeGroup(group) {
  group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  scene.remove(group);
}

function buildWorld() {
  heading = 0;
  const n = treeCount();
  for (let i = 0; i < n; i++) makeTree(i);
  makeShip();
}

function clearWorld() {
  for (const t of trees) disposeGroup(t.group);
  trees.length = 0;
  for (const p of platforms) disposeGroup(p.group);
  platforms.length = 0;
  for (const e of enemies) if (!e.removed) scene.remove(e.group);
  enemies.length = 0;
  for (const pr of projectiles) scene.remove(pr.mesh);
  projectiles.length = 0;
  for (const p of particles) { p.life = 0; p.mesh.visible = false; }
  if (ship) { disposeGroup(ship.group); ship = null; }
}

// ---------------------------------------------------------- projectiles & particles
const projectiles = []; // { mesh, vel, life }
function shootAt(from, target, speed) {
  const m = new THREE.Mesh(GEO.bullet, MAT.bullet);
  m.position.copy(from);
  const dir = target.clone().sub(from).normalize();
  projectiles.push({ mesh: m, vel: dir.multiplyScalar(speed), life: 5 });
  scene.add(m);
}

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
const idleTubes = [makeTube(), makeTube(), makeTube()];
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
  state: 'menu', // menu | perched | qte | zip | cannonball | falling | dead | won
  pos: new THREE.Vector3(), vel: new THREE.Vector3(),
  hp: 100, targetIndex: 1,
  treesChained: 0, punches: 0, score: 0,
  qteNums: [], qteIdx: 0, qteTime: 0, qteTwin: false,
  cannonEarned: false, cannon: null,
  deadReason: '', deadSub: '',
  punchAnim: null, tumble: 0,
};
let best = 0;
try { best = parseInt(localStorage.getItem('ttp_best') || '0', 10) || 0; } catch (e) {}
ui.best.textContent = best;

let ts = 1, tsTarget = 1;
let shake = 0;
let fov = 74, fovTarget = 74;
let roll = 0, rollTarget = 0;
let camFwd = new THREE.Vector3(0, 0, -1);
let elapsed = 0;
let lastTickSec = -1;
let trailT = 0;
const mouse = { x: 0, y: 0 };

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _camR = new THREE.Vector3(), _camU = new THREE.Vector3(), _camF = new THREE.Vector3();

function getTarget() {
  if (P.targetIndex < trees.length) return { pos: trees[P.targetIndex].anchor, ship: false };
  return { pos: ship.anchor, ship: true };
}

function reset(carryScore) {
  clearWorld();
  const keepScore = carryScore ? P.score : 0;
  const keepTrees = carryScore ? P.treesChained : 0;
  const keepPunches = carryScore ? P.punches : 0;
  Object.assign(P, {
    state: 'perched', hp: 100, targetIndex: 1,
    treesChained: keepTrees, punches: keepPunches, score: keepScore,
    qteNums: [], qteIdx: 0, qteTime: 0, qteTwin: false,
    cannonEarned: false, cannon: null,
    deadReason: '', deadSub: '', punchAnim: null, tumble: 0,
  });
  P.vel.set(0, 0, 0);
  buildWorld();
  P.pos.copy(trees[0].top).add(_v1.set(0, 1.5, 0));
  ts = 1; tsTarget = 1; shake = 0; roll = 0; rollTarget = 0;
  fovTarget = 74;
  punchTube.visible = false; punchFist.visible = false;
  grappleTube.visible = false; grappleFist.visible = false;
  ui.qte.classList.add('hidden');
  ui.vignette.classList.remove('on');
  ui.overlay.classList.add('hidden');
  ui.crosshair.classList.remove('hidden');
  ui.hint.textContent = 'Your ship is out there. SPACE or CLICK to leap!';
  ui.hint.classList.remove('hidden');
  ui.level.textContent = level;
}

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
  const twin = P.targetIndex < trees.length && trees[P.targetIndex].twin;
  P.qteTwin = twin;
  if (twin) {
    const a = 1 + Math.floor(Math.random() * 6);
    let b = 1 + Math.floor(Math.random() * 6);
    while (b === a) b = 1 + Math.floor(Math.random() * 6);
    P.qteNums = [a, b];
    ui.qteLabel.textContent = 'TWIN TREES — HIT BOTH TO CANNONBALL';
  } else {
    P.qteNums = [1 + Math.floor(Math.random() * 6)];
    ui.qteLabel.textContent = getTarget().ship ? 'LAST GRAPPLE — GET TO THE SHIP' : 'PRESS';
  }
  P.qteIdx = 0;
  P.qteTime = QTE_TIME;
  lastTickSec = -1;
  renderQteNums();
  ui.qte.classList.remove('hidden');
  ui.vignette.classList.add('on');
  ui.hint.classList.add('hidden');
  reticle.visible = true;
}

function qteFail() {
  ui.qte.classList.add('hidden');
  ui.vignette.classList.remove('on');
  reticle.visible = false;
  tsTarget = 1; fovTarget = 80;
  P.deadReason = 'TOO SLOW!';
  P.deadSub = `The number was ${P.qteNums[P.qteIdx]}. The tentacles gave up on you.`;
  P.state = 'falling';
  P.tumble = 2 + Math.random() * 2;
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

// ---------------------------------------------------------- zip / cannonball / arrive
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

function arrive() {
  const tgt = getTarget();
  P.pos.copy(tgt.pos);
  grappleTube.visible = false;
  grappleFist.visible = false;
  if (tgt.ship) { winLevel(); return; }

  P.treesChained += 1;
  P.score += 10;
  P.hp = Math.min(100, P.hp + 3);
  burst(trees[P.targetIndex].top, MAT.spore, 10, 8, 7);
  sfx.land();
  shake = Math.min(1, shake + 0.25);
  P.targetIndex += 1;

  if (P.cannonEarned) {
    // launch a ballistic spin over to the twin tree — no QTE needed, you earned it
    P.cannonEarned = false;
    const to = getTarget().pos;
    const T = 0.85, g = 24;
    P.vel.copy(to).sub(P.pos).divideScalar(T);
    P.vel.y += 0.5 * g * T;
    P.cannon = { t: 0, T, g };
    P.state = 'cannonball';
    tsTarget = 1; fovTarget = 104;
    P.score += 30;
    popText(P.pos, 'CANNONBALL!', 'pow');
    sfx.cannon();
    return;
  }

  _v1.copy(getTarget().pos).sub(P.pos).normalize();
  P.vel.set(_v1.x * 7, 10, _v1.z * 7);
  beginQTE();
}

function winLevel() {
  P.state = 'won';
  P.score += 100;
  tsTarget = 0.25; fovTarget = 74;
  reticle.visible = false;
  ui.qte.classList.add('hidden');
  ui.vignette.classList.remove('on');
  ui.crosshair.classList.add('hidden');
  if (P.score > best) {
    best = P.score;
    try { localStorage.setItem('ttp_best', String(best)); } catch (e) {}
  }
  ui.best.textContent = best;
  sfx.win();
  ui.oTitle.textContent = '🛸 YOU MADE IT HOME!';
  ui.oSub.innerHTML = `Level ${level} cleared. The saucer hums happily.<br><b>${P.treesChained}</b> trees chained &nbsp;·&nbsp; <b>${P.punches}</b> gunners punched &nbsp;·&nbsp; score <b>${P.score}</b> (best ${best})`;
  ui.oControls.classList.add('hidden');
  ui.playBtn.textContent = `NEXT LEVEL  [SPACE]`;
  ui.overlay.classList.remove('hidden');
}

// ---------------------------------------------------------- punch (auto tentacle on left click)
function pickPunchTarget() {
  let bestE = null, bd = PUNCH_RANGE;
  for (const e of enemies) {
    if (e.dead || e.removed) continue;
    const d = e.group.position.distanceTo(P.pos);
    if (d > bd) continue; // full auto-aim: nearest gunner in range, any direction
    bd = d; bestE = e;
  }
  return bestE;
}

function tryPunch() {
  if (P.punchAnim) return;
  if (P.state !== 'qte' && P.state !== 'zip' && P.state !== 'perched' && P.state !== 'cannonball') return;
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
  shake = Math.min(1, shake + 0.5);
  burst(e.group.position, MAT.bullet, 8, 10, 8);
  popText(e.group.position, label, 'pow');
  sfx.pow();
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

function popText(worldPos, text, cls) {
  _v1.copy(worldPos).project(camera);
  if (_v1.z > 1) return;
  const el = document.createElement('div');
  el.className = 'pop ' + (cls || '');
  el.textContent = text;
  el.style.left = ((_v1.x * 0.5 + 0.5) * 100) + '%';
  el.style.top = ((-_v1.y * 0.5 + 0.5) * 100) + '%';
  ui.pops.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

// ---------------------------------------------------------- death
function die(reason, sub) {
  P.state = 'dead';
  tsTarget = 1; fovTarget = 74;
  grappleTube.visible = false;
  grappleFist.visible = false;
  punchTube.visible = false;
  punchFist.visible = false;
  P.punchAnim = null;
  reticle.visible = false;
  ui.qte.classList.add('hidden');
  ui.vignette.classList.remove('on');
  ui.hint.classList.add('hidden');
  ui.crosshair.classList.add('hidden');
  if (P.score > best) {
    best = P.score;
    try { localStorage.setItem('ttp_best', String(best)); } catch (e) {}
  }
  ui.best.textContent = best;
  ui.oTitle.textContent = reason;
  ui.oSub.innerHTML = `${sub}<br><b>${P.treesChained}</b> trees chained &nbsp;·&nbsp; <b>${P.punches}</b> gunners punched &nbsp;·&nbsp; score <b>${P.score}</b> (best ${best})`;
  ui.oControls.classList.add('hidden');
  ui.playBtn.textContent = 'TRY AGAIN  [R]';
  ui.overlay.classList.remove('hidden');
}

function hurt(dmg) {
  if (P.state === 'dead' || P.state === 'menu' || P.state === 'won') return;
  P.hp -= dmg;
  sfx.hurt();
  shake = Math.min(1, shake + 0.35);
  ui.flash.classList.remove('on');
  void ui.flash.offsetWidth;
  ui.flash.classList.add('on');
  if (P.hp <= 0) {
    P.hp = 0;
    P.deadReason = 'SHOT DOWN!';
    P.deadSub = 'The little gunners got you.';
    ui.qte.classList.add('hidden');
    ui.vignette.classList.remove('on');
    reticle.visible = false;
    grappleTube.visible = false;
    grappleFist.visible = false;
    tsTarget = 1; fovTarget = 80;
    P.state = 'falling';
    P.tumble = 2 + Math.random() * 3;
    P.vel.multiplyScalar(0.3);
    sfx.fall();
  }
}

// ---------------------------------------------------------- enemies update
function canBeShot() {
  return P.state === 'qte' || P.state === 'zip' || P.state === 'perched' || P.state === 'cannonball';
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
    // ride the bobbing platform
    e.group.position.copy(e.platform.group.position).add(e.offset);
    const d = e.group.position.distanceTo(P.pos);
    if (d > 90) continue;
    e.group.rotation.y = Math.atan2(P.pos.x - e.group.position.x, P.pos.z - e.group.position.z);
    if (e.flashT > 0) {
      e.flashT -= wdt;
      e.muzzle.scale.setScalar(Math.max(0.01, e.flashT * 6));
    }
    if (!shootable || d < 4) continue;
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

// ---------------------------------------------------------- first-person tentacle rendering
function camPoint(x, y, z) {
  return _v1.copy(camera.position)
    .addScaledVector(_camR, x).addScaledVector(_camU, y).addScaledVector(_camF, z).clone();
}

function updateTentacles(rdt) {
  const t = elapsed;
  _camR.setFromMatrixColumn(camera.matrixWorld, 0);
  _camU.setFromMatrixColumn(camera.matrixWorld, 1);
  _camF.setFromMatrixColumn(camera.matrixWorld, 2).negate();

  // your own tentacles curling into view from the bottom of the screen.
  // Built entirely in camera space with z always in front of the lens, so
  // fast zips can never fold a tube back through the near plane.
  const lagX = THREE.MathUtils.clamp(P.vel.dot(_camR) * -0.008, -0.4, 0.4);
  const lagY = THREE.MathUtils.clamp(P.vel.dot(_camU) * -0.008, -0.3, 0.3);
  const bases = [[-0.45, -0.38], [0.45, -0.38], [0.0, -0.5]];
  for (let i = 0; i < 3; i++) {
    const [bx, by] = bases[i];
    const sway = Math.sin(t * 5 + i * 2.1) * 0.2;
    const sway2 = Math.cos(t * 4 + i * 1.6) * 0.15;
    const base = camPoint(bx, by, 0.5);
    const p1 = camPoint(bx * 1.15 + sway * 0.5, by - 0.05 + sway2 * 0.3, 1.05);
    const p2 = camPoint(bx * 1.35 + sway + lagX, by - 0.08 + sway2 * 0.6 + lagY, 1.75);
    setTube(idleTubes[i], [base, p1, p2], 0.09, 8);
  }

  // the grapple tentacle shooting out to the anchor
  if (grappleTube.visible) {
    const end = getTarget().pos;
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

// ---------------------------------------------------------- camera (first person)
function updateCamera(rdt) {
  camera.position.copy(P.pos).add(_v1.set(0, 0.4, 0));
  if (shake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * shake * 0.5;
    camera.position.y += (Math.random() - 0.5) * shake * 0.5;
    shake *= Math.exp(-6 * rdt);
  }

  let lookDir = null;
  if (P.state === 'perched' || P.state === 'qte' || P.state === 'zip' || P.state === 'cannonball') {
    lookDir = _v1.copy(getTarget().pos).sub(P.pos);
  } else if (P.state === 'falling') {
    lookDir = _v1.copy(P.vel);
    lookDir.y *= 0.5;
  }
  if (lookDir && lookDir.lengthSq() > 0.01) {
    camFwd.lerp(lookDir.normalize(), 1 - Math.exp(-5 * rdt)).normalize();
  }

  // subtle mouse parallax so you can look around while you fly
  _v2.crossVectors(camFwd, _v3.set(0, 1, 0)).normalize();
  const look = _v1.copy(camera.position).addScaledVector(camFwd, 10)
    .addScaledVector(_v2, mouse.x * 2.4)
    .add(_v3.set(0, -mouse.y * 1.6, 0));
  camera.lookAt(look);

  // roll: full 360 spin during a cannonball, sway during zips, tumble when falling
  if (P.state === 'cannonball' && P.cannon) {
    roll = (P.cannon.t / P.cannon.T) * Math.PI * 2;
  } else if (P.state === 'falling') {
    roll += P.tumble * rdt;
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
  ui.trees.textContent = P.treesChained;
  ui.score.textContent = P.score;
  ui.hops.textContent = Math.max(0, trees.length - P.targetIndex + 1);
  if (P.state === 'qte') {
    const frac = Math.max(0, P.qteTime / QTE_TIME);
    ui.qteRing.style.strokeDashoffset = String(283 * (1 - frac));
    ui.qteRing.style.stroke = frac > 0.4 ? '#4dffe1' : '#ff4fd8';
    ui.qteTime.textContent = Math.max(0, P.qteTime).toFixed(1);
  }
  const canPunch = !P.punchAnim && (P.state === 'qte' || P.state === 'zip' || P.state === 'perched' || P.state === 'cannonball') && pickPunchTarget();
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
        const a = elapsed * 0.15;
        const c = trees[1].top;
        camera.position.set(c.x + Math.cos(a) * 27, c.y + 10, c.z + Math.sin(a) * 27);
        camera.lookAt(c.x, c.y - 2, c.z);
      }
      break;

    case 'perched':
      P.pos.y = trees[0].top.y + 1.5 + Math.sin(elapsed * 2.5) * 0.06;
      reticle.visible = true;
      break;

    case 'qte': {
      P.vel.y -= 10 * wdt;
      P.pos.addScaledVector(P.vel, wdt);
      P.qteTime -= rdt; // the countdown runs in REAL time
      const sec = Math.ceil(P.qteTime * 2);
      if (P.qteTime < 1.5 && sec !== lastTickSec) { lastTickSec = sec; sfx.tick(); }
      if (P.qteTime <= 0) qteFail();
      break;
    }

    case 'zip': {
      const anchor = getTarget().pos;
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
      // smush any gunner you barrel through
      for (const e of enemies) {
        if (!e.dead && !e.removed && e.group.position.distanceTo(P.pos) < 3.6) knockEnemy(e, 'SMUSHED!');
      }
      const d = P.pos.distanceTo(getTarget().pos);
      if (d < 3 || c.t > c.T * 1.6) { P.cannon = null; arrive(); }
      break;
    }

    case 'falling': {
      P.vel.y -= 28 * wdt;
      P.pos.addScaledVector(P.vel, wdt);
      if (P.pos.y < 1.2) {
        burst(P.pos, MAT.spore, 14, 9, 9);
        sfx.splat();
        shake = 1;
        die(P.deadReason || 'SPLAT!', P.deadSub || 'The alien floor is not a trampoline.');
      }
      break;
    }
  }

  if (reticle.visible && (P.targetIndex < trees.length || ship)) {
    reticle.position.copy(getTarget().pos);
    reticle.lookAt(camera.position);
    const s = 1 + Math.sin(elapsed * 8) * 0.12;
    reticle.scale.setScalar(s);
  }

  // bob the floating platforms and the saucer
  for (const p of platforms) {
    p.group.position.y = p.baseY + Math.sin(elapsed * 1.2 + p.phase) * 0.5;
  }
  if (ship) {
    ship.group.position.y = ship.baseY + Math.sin(elapsed * 1.4) * 0.5;
    ship.lights.rotation.y = elapsed * 1.8;
  }

  mist.position.x = camera.position.x;
  mist.position.z = camera.position.z;
  ground.position.x = camera.position.x;
  ground.position.z = camera.position.z;
  skyGroup.position.x = camera.position.x;
  skyGroup.position.z = camera.position.z;

  updateEnemies(wdt);
  updateProjectiles(wdt);
  updateParticles(Math.max(wdt, rdt * 0.3));
  if (P.state !== 'menu') updateCamera(rdt);
  updateTentacles(rdt);
  updateHUD();

  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame);

// ---------------------------------------------------------- input
function leap() {
  if (P.state !== 'perched') return;
  ui.hint.classList.add('hidden');
  _v1.copy(getTarget().pos).sub(P.pos).normalize();
  P.vel.set(_v1.x * 8, 11, _v1.z * 8);
  P.pos.y += 0.2;
  whoosh(0.25, 0.12);
  beginQTE();
}

window.addEventListener('keydown', (ev) => {
  if (ev.repeat) return;
  const m = ev.code.match(/^(?:Digit|Numpad)([1-6])$/);
  if (m) { handleNumber(parseInt(m[1], 10)); return; }
  if (ev.code === 'Space') {
    ev.preventDefault();
    if (P.state === 'perched') leap();
    else if (P.state === 'dead') reset(false);
    else if (P.state === 'won') { level += 1; reset(true); }
    else if (P.state === 'menu') startGame();
    return;
  }
  if (ev.code === 'KeyE' || ev.code === 'KeyF') { tryPunch(); return; }
  if (ev.code === 'KeyR' && (P.state === 'dead' || P.state === 'falling')) { reset(false); return; }
});

window.addEventListener('mousemove', (ev) => {
  mouse.x = (ev.clientX / window.innerWidth) * 2 - 1;
  mouse.y = (ev.clientY / window.innerHeight) * 2 - 1;
});

renderer.domElement.addEventListener('pointerdown', (ev) => {
  audioCtx();
  if (ev.button !== 0) return;
  if (P.state === 'perched') {
    // punch if a gunner is already lined up, otherwise leap
    if (pickPunchTarget()) tryPunch(); else leap();
  } else if (P.state === 'qte' || P.state === 'zip' || P.state === 'cannonball') {
    tryPunch();
  }
});

for (const btn of document.querySelectorAll('.qkey')) {
  btn.addEventListener('pointerdown', (ev) => {
    ev.stopPropagation();
    handleNumber(parseInt(btn.dataset.n, 10));
  });
}

function startGame() {
  audioCtx();
  level = 1;
  reset(false);
}
ui.playBtn.addEventListener('click', () => {
  if (P.state === 'won') { level += 1; reset(true); }
  else if (P.state === 'dead') reset(false);
  else startGame();
});

// ---------------------------------------------------------- boot (menu backdrop)
buildWorld();
P.pos.copy(trees[0].top).add(new THREE.Vector3(0, 1.5, 0));

// exposed for automated smoke tests
window.__game = P;
window.__debug = { P, trees, platforms, enemies, beginQTE, getTarget, ship: () => ship };

import * as THREE from 'three';

/* ============================================================
   TENTACLE TREETOPS
   3D tree parkour: grapple through the canopy with tentacles.
   Every grapple is a slow-motion QTE — press the shown number
   (1-6) within 5 seconds or you fall. Little gunners shoot at
   you from the trees; get close and punch them off.
   ============================================================ */

// ---------------------------------------------------------- dom
const $ = (id) => document.getElementById(id);
const ui = {
  hp: $('hpbar'), trees: $('stat-trees'), score: $('stat-score'), best: $('stat-best'),
  qte: $('qte'), qteNum: $('qte-num'), qteRing: $('qte-ring'), qteTime: $('qte-time'),
  qteCircle: $('qte-circle'),
  vignette: $('vignette'), flash: $('flash'),
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
  land: () => tone(520, 0.12, 'triangle', 0.14, 780),
  tick: () => tone(1200, 0.05, 'square', 0.07),
  pow: () => { tone(90, 0.18, 'square', 0.25, 55); whoosh(0.15, 0.2); },
  shot: (v) => tone(1500, 0.08, 'square', v, 500),
  hurt: () => tone(220, 0.2, 'sawtooth', 0.2, 110),
  splat: () => { tone(200, 0.5, 'sawtooth', 0.25, 40); whoosh(0.3, 0.3); },
  fall: () => tone(700, 1.0, 'sine', 0.15, 120),
};

// ---------------------------------------------------------- three setup
const SKY = 0xbfe3d8;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 55, 230);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 30, 14);

scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x3e5f3e, 1.0));
const sun = new THREE.DirectionalLight(0xfff2d0, 1.4);
sun.position.set(60, 120, 40);
scene.add(sun);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------- shared materials / geometries
const MAT = {
  trunk: new THREE.MeshLambertMaterial({ color: 0x6b4a2f }),
  trunk2: new THREE.MeshLambertMaterial({ color: 0x59391f }),
  leafA: new THREE.MeshLambertMaterial({ color: 0x3f8f4f }),
  leafB: new THREE.MeshLambertMaterial({ color: 0x2f7a44 }),
  leafC: new THREE.MeshLambertMaterial({ color: 0x63aa5d }),
  platform: new THREE.MeshLambertMaterial({ color: 0x4d3a26 }),
  body: new THREE.MeshLambertMaterial({ color: 0x7a4fd0 }),
  tentacle: new THREE.MeshLambertMaterial({ color: 0x9a6ff0 }),
  sucker: new THREE.MeshLambertMaterial({ color: 0xd8c6ff }),
  eyeW: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  eyeB: new THREE.MeshBasicMaterial({ color: 0x1a1a1a }),
  shirt: new THREE.MeshLambertMaterial({ color: 0xe04b3a }),
  shirt2: new THREE.MeshLambertMaterial({ color: 0x3a6be0 }),
  skin: new THREE.MeshLambertMaterial({ color: 0xf2c090 }),
  gun: new THREE.MeshLambertMaterial({ color: 0x333333 }),
  bullet: new THREE.MeshBasicMaterial({ color: 0xffd23f }),
  flash: new THREE.MeshBasicMaterial({ color: 0xfff3a0 }),
  reticle: new THREE.MeshBasicMaterial({ color: 0xffe14d, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }),
  leafBit: new THREE.MeshBasicMaterial({ color: 0x63aa5d }),
  trail: new THREE.MeshBasicMaterial({ color: 0xc0a4ff }),
};
const GEO = {
  bullet: new THREE.SphereGeometry(0.22, 8, 8),
  leafBit: new THREE.BoxGeometry(0.22, 0.22, 0.22),
  head: new THREE.SphereGeometry(0.22, 10, 10),
  enemyBody: new THREE.CylinderGeometry(0.28, 0.34, 0.68, 8),
  gun: new THREE.BoxGeometry(0.1, 0.12, 0.55),
  muzzle: new THREE.SphereGeometry(0.16, 6, 6),
};

// ---------------------------------------------------------- ground
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(4000, 4000),
  new THREE.MeshLambertMaterial({ color: 0x2e5e37 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
// soft mist layer near the ground
const mist = new THREE.Mesh(
  new THREE.PlaneGeometry(4000, 4000),
  new THREE.MeshBasicMaterial({ color: SKY, transparent: true, opacity: 0.5, depthWrite: false })
);
mist.rotation.x = -Math.PI / 2;
mist.position.y = 6;
scene.add(mist);

// ---------------------------------------------------------- world (path of trees)
const trees = [];   // { anchor, top, group, culled }
const enemies = []; // { group, gun, muzzle, cell, hp, dead, cd, vel, spin, life }
let heading = 0;

function randPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function makeDecorTree(group, x, z, h) {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.8, h, 6), MAT.trunk2);
  trunk.position.set(x, h / 2, z);
  group.add(trunk);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(2.2 + Math.random() * 1.5, 5 + Math.random() * 4, 7), randPick([MAT.leafA, MAT.leafB, MAT.leafC]));
  cone.position.set(x, h + 2, z);
  group.add(cone);
}

function makeTree(i) {
  let x, y, z;
  if (i === 0) { x = 0; y = 26; z = 0; heading = 0; }
  else {
    const prev = trees[i - 1].top;
    heading += (Math.random() - 0.5) * 1.0;
    const dist = 26 + Math.random() * 12;
    x = prev.x + Math.sin(heading) * dist;
    z = prev.z - Math.cos(heading) * dist;
    y = THREE.MathUtils.clamp(prev.y + (Math.random() - 0.5) * 11, 18, 46);
  }
  const group = new THREE.Group();

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.7, y, 8), MAT.trunk);
  trunk.position.set(x, y / 2, z);
  group.add(trunk);

  // foliage blobs ringing the top
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.random();
    const r = 2.6 + Math.random() * 1.2;
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4 + Math.random() * 1.4, 0), randPick([MAT.leafA, MAT.leafB, MAT.leafC]));
    blob.position.set(x + Math.cos(a) * r, y - 1.2 + Math.random() * 1.6, z + Math.sin(a) * r);
    blob.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    group.add(blob);
  }

  // landing platform on top
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 3.1, 0.5, 9), MAT.platform);
  plat.position.set(x, y + 0.25, z);
  group.add(plat);

  // background scenery trees
  const nDecor = 2 + Math.floor(Math.random() * 2);
  for (let k = 0; k < nDecor; k++) {
    const a = Math.random() * Math.PI * 2;
    const r = 13 + Math.random() * 22;
    makeDecorTree(group, x + Math.cos(a) * r, z + Math.sin(a) * r, 6 + Math.random() * 16);
  }

  scene.add(group);
  const top = new THREE.Vector3(x, y + 0.5, z);
  const anchor = new THREE.Vector3(x, y + 1.1, z);
  trees.push({ anchor, top, group, culled: false });

  // little gunners on some trees
  if (i >= 3 && Math.random() < 0.55) {
    const n = Math.random() < 0.3 ? 2 : 1;
    for (let k = 0; k < n; k++) spawnEnemy(i, top, k);
  }
}

function spawnEnemy(cell, top, k) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(GEO.enemyBody, Math.random() < 0.5 ? MAT.shirt : MAT.shirt2);
  body.position.y = 0.34;
  g.add(body);
  const head = new THREE.Mesh(GEO.head, MAT.skin);
  head.position.y = 0.85;
  g.add(head);
  const gun = new THREE.Mesh(GEO.gun, MAT.gun);
  gun.position.set(0.26, 0.55, 0.2);
  g.add(gun);
  const muzzle = new THREE.Mesh(GEO.muzzle, MAT.flash);
  muzzle.position.set(0.26, 0.55, 0.55);
  muzzle.scale.setScalar(0.01);
  g.add(muzzle);
  const a = Math.random() * Math.PI * 2;
  g.position.set(top.x + Math.cos(a) * 1.6, top.y, top.z + Math.sin(a) * 1.6);
  scene.add(g);
  enemies.push({ group: g, gun, muzzle, cell, dead: false, cd: 1 + Math.random() * 2, vel: new THREE.Vector3(), spin: 0, life: 3, flashT: 0 });
}

function disposeGroup(group) {
  group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  scene.remove(group);
}

function ensureWorld() {
  while (trees.length < P.targetIndex + 10) makeTree(trees.length);
  for (let k = 0; k < P.targetIndex - 5; k++) {
    if (!trees[k].culled) {
      trees[k].culled = true;
      disposeGroup(trees[k].group);
      for (const e of enemies) if (e.cell === k && !e.removed) { e.removed = true; scene.remove(e.group); }
    }
  }
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
  const m = new THREE.Mesh(GEO.leafBit, MAT.leafBit);
  m.visible = false;
  scene.add(m);
  particles.push({ mesh: m, vel: new THREE.Vector3(), life: 0, mat: MAT.leafBit });
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

// ---------------------------------------------------------- player
const player = new THREE.Group();
const pBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.55, 6, 12), MAT.body);
player.add(pBody);
for (const sx of [-0.2, 0.2]) {
  const ew = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), MAT.eyeW);
  ew.position.set(sx, 0.28, -0.42);
  player.add(ew);
  const eb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), MAT.eyeB);
  eb.position.set(sx, 0.28, -0.54);
  player.add(eb);
}
scene.add(player);

// idle tentacles + grapple tentacle (tube geometry rebuilt each frame)
function makeTube() {
  const m = new THREE.Mesh(new THREE.BufferGeometry(), MAT.tentacle);
  m.frustumCulled = false;
  scene.add(m);
  return m;
}
const idleTubes = [makeTube(), makeTube(), makeTube(), makeTube()];
const grappleTube = makeTube();
grappleTube.visible = false;
const fist = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 10), MAT.sucker);
fist.visible = false;
scene.add(fist);

function setTube(mesh, points, radius, tubular = 10) {
  mesh.geometry.dispose();
  mesh.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), tubular, radius, 6, false);
}

// grapple target reticle
const reticle = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.45, 24), MAT.reticle);
reticle.visible = false;
scene.add(reticle);

// ---------------------------------------------------------- game state
const P = {
  state: 'menu', // menu | perched | qte | zip | punch | falling | dead
  pos: new THREE.Vector3(), vel: new THREE.Vector3(),
  hp: 100, targetIndex: 1,
  treesChained: 0, punches: 0, score: 0,
  qteNum: 0, qteTime: 0,
  deadReason: '', deadSub: '',
  punchData: null, tumble: 0,
};
let best = 0;
try { best = parseInt(localStorage.getItem('ttp_best') || '0', 10) || 0; } catch (e) {}
ui.best.textContent = best;

let ts = 1, tsTarget = 1;     // time scale (slow motion)
let shake = 0;
let fov = 72, fovTarget = 72;
let camFwd = new THREE.Vector3(0, 0, -1);
let elapsed = 0;
let lastTickSec = -1;
let trailT = 0;

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

function targetTree() { return trees[P.targetIndex]; }

function reset() {
  for (const t of trees) if (!t.culled) disposeGroup(t.group);
  trees.length = 0;
  for (const e of enemies) if (!e.removed) scene.remove(e.group);
  enemies.length = 0;
  for (const pr of projectiles) scene.remove(pr.mesh);
  projectiles.length = 0;
  for (const p of particles) { p.life = 0; p.mesh.visible = false; }
  heading = 0;
  Object.assign(P, {
    state: 'perched', hp: 100, targetIndex: 1,
    treesChained: 0, punches: 0, score: 0,
    qteNum: 0, qteTime: 0, deadReason: '', deadSub: '', punchData: null, tumble: 0,
  });
  P.vel.set(0, 0, 0);
  for (let i = 0; i < 12; i++) makeTree(i);
  P.pos.copy(trees[0].top).add(_v1.set(0, 0.9, 0));
  ts = 1; tsTarget = 1; shake = 0;
  camera.position.copy(P.pos).add(_v1.set(0, 3, 10));
  ui.qte.classList.add('hidden');
  ui.vignette.classList.remove('on');
  ui.overlay.classList.add('hidden');
  ui.hint.textContent = 'SPACE or CLICK to leap!';
  ui.hint.classList.remove('hidden');
  player.rotation.set(0, 0, 0);
}

// ---------------------------------------------------------- QTE
function beginQTE() {
  P.state = 'qte';
  tsTarget = 0.12;
  fovTarget = 62;
  P.qteNum = 1 + Math.floor(Math.random() * 6);
  P.qteTime = 5;
  lastTickSec = -1;
  ui.qteNum.textContent = P.qteNum;
  ui.qte.classList.remove('hidden');
  ui.vignette.classList.add('on');
  ui.hint.classList.add('hidden');
  reticle.visible = true;
}

function qteFail() {
  ui.qte.classList.add('hidden');
  ui.vignette.classList.remove('on');
  reticle.visible = false;
  tsTarget = 1; fovTarget = 72;
  P.deadReason = 'TOO SLOW!';
  P.deadSub = `The number was ${P.qteNum}. The tentacles gave up on you.`;
  P.state = 'falling';
  P.tumble = (Math.random() - 0.5) * 8;
  sfx.fall();
}

function handleNumber(n) {
  if (P.state !== 'qte') return;
  if (n === P.qteNum) {
    sfx.correct();
    startZip();
  } else {
    P.qteTime -= 1;
    sfx.wrong();
    ui.qteCircle.classList.remove('shake');
    void ui.qteCircle.offsetWidth; // restart css animation
    ui.qteCircle.classList.add('shake');
    shake = Math.min(1, shake + 0.3);
  }
}

// ---------------------------------------------------------- zip / arrive
function startZip() {
  P.state = 'zip';
  tsTarget = 1; fovTarget = 92;
  ui.qte.classList.add('hidden');
  ui.vignette.classList.remove('on');
  grappleTube.visible = true;
  fist.visible = true;
  sfx.zip();
}

function arrive() {
  const t = targetTree();
  P.pos.copy(t.anchor);
  P.treesChained += 1;
  P.score += 10;
  P.hp = Math.min(100, P.hp + 3);
  P.targetIndex += 1;
  ensureWorld();
  grappleTube.visible = false;
  fist.visible = false;
  burst(t.top, MAT.leafBit, 10, 8, 7);
  sfx.land();
  shake = Math.min(1, shake + 0.25);
  // launch up and onward, then straight into the next slow-mo QTE
  const next = targetTree().anchor;
  _v1.copy(next).sub(P.pos).normalize();
  P.vel.set(_v1.x * 7, 10, _v1.z * 7);
  beginQTE();
}

// ---------------------------------------------------------- punch
function tryPunch() {
  if (P.state !== 'qte' && P.state !== 'zip') return;
  let bestE = null, bd = 17;
  for (const e of enemies) {
    if (e.dead || e.removed) continue;
    const d = e.group.position.distanceTo(P.pos);
    if (d < bd) { bd = d; bestE = e; }
  }
  if (!bestE) { whoosh(0.12, 0.08); return; }
  P.punchData = { enemy: bestE, from: P.pos.clone(), t: 0, prev: P.state, prevQteTime: P.qteTime };
  P.state = 'punch';
  tsTarget = 1;
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

function resolvePunch() {
  const pd = P.punchData;
  const e = pd.enemy;
  e.dead = true;
  _v1.copy(e.group.position).sub(P.pos).normalize();
  e.vel.set(_v1.x * 16 + (Math.random() - 0.5) * 4, 13, _v1.z * 16 + (Math.random() - 0.5) * 4);
  e.spin = 8 + Math.random() * 8;
  e.life = 2.5;
  P.punches += 1;
  P.score += 25;
  P.hp = Math.min(100, P.hp + 10);
  shake = Math.min(1, shake + 0.5);
  burst(e.group.position, MAT.bullet, 8, 10, 8);
  popText(e.group.position, 'POW!', 'pow');
  sfx.pow();
  // resume what we were doing
  P.state = pd.prev;
  P.punchData = null;
  fist.visible = P.state === 'zip';
  grappleTube.visible = true;
  if (P.state === 'qte') {
    tsTarget = 0.12; fovTarget = 62;
    grappleTube.visible = false;
    P.vel.set(0, 7, 0);
  }
}

// ---------------------------------------------------------- death
function die(reason, sub) {
  P.state = 'dead';
  tsTarget = 1; fovTarget = 72;
  grappleTube.visible = false;
  fist.visible = false;
  reticle.visible = false;
  ui.qte.classList.add('hidden');
  ui.vignette.classList.remove('on');
  ui.hint.classList.add('hidden');
  if (P.score > best) {
    best = P.score;
    try { localStorage.setItem('ttp_best', String(best)); } catch (e) {}
  }
  ui.best.textContent = best;
  ui.oTitle.textContent = reason;
  ui.oSub.innerHTML = `${sub}<br><b>${P.treesChained}</b> trees chained &nbsp;·&nbsp; <b>${P.punches}</b> gunners punched &nbsp;·&nbsp; score <b>${P.score}</b> (best ${best})`;
  ui.oControls.classList.add('hidden');
  ui.playBtn.textContent = 'SWING AGAIN  [R]';
  ui.overlay.classList.remove('hidden');
}

function hurt(dmg) {
  if (P.state === 'dead' || P.state === 'menu') return;
  P.hp -= dmg;
  sfx.hurt();
  shake = Math.min(1, shake + 0.35);
  ui.flash.classList.remove('on');
  void ui.flash.offsetWidth;
  ui.flash.classList.add('on');
  if (P.hp <= 0) {
    P.hp = 0;
    P.deadReason = 'SHOT DOWN!';
    P.deadSub = 'The little people got you.';
    if (P.state === 'qte' || P.state === 'zip' || P.state === 'punch' || P.state === 'perched') {
      ui.qte.classList.add('hidden');
      ui.vignette.classList.remove('on');
      reticle.visible = false;
      grappleTube.visible = false;
      fist.visible = false;
      tsTarget = 1; fovTarget = 72;
      P.state = 'falling';
      P.tumble = (Math.random() - 0.5) * 9;
      P.vel.multiplyScalar(0.3);
      sfx.fall();
    }
  }
}

// ---------------------------------------------------------- enemies update
function updateEnemies(wdt) {
  const canBeShot = P.state === 'qte' || P.state === 'zip' || P.state === 'perched' || P.state === 'punch';
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
    // face the player (yaw only — they're standing on a branch)
    e.group.rotation.y = Math.atan2(P.pos.x - e.group.position.x, P.pos.z - e.group.position.z);
    if (e.flashT > 0) {
      e.flashT -= wdt;
      e.muzzle.scale.setScalar(Math.max(0.01, e.flashT * 6));
    }
    if (!canBeShot || d < 5) continue;
    e.cd -= wdt;
    if (e.cd <= 0) {
      e.cd = 1.5 + Math.random() * 1.7;
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
  const canHit = P.state === 'qte' || P.state === 'zip' || P.state === 'perched' || P.state === 'punch';
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i];
    pr.mesh.position.addScaledVector(pr.vel, wdt);
    pr.life -= wdt;
    if (canHit && pr.mesh.position.distanceTo(P.pos) < 1.5) {
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

// ---------------------------------------------------------- tentacles
function updateTentacles(rdt) {
  const t = elapsed;
  // 4 idle tentacles trailing behind, wiggling
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    _v1.set(Math.cos(a) * 0.32, -0.35, Math.sin(a) * 0.32).add(P.pos);
    const sway = Math.sin(t * 5 + i * 1.7) * 0.35;
    const sway2 = Math.cos(t * 4 + i * 2.3) * 0.35;
    const drag = _v2.copy(P.vel).multiplyScalar(-0.045);
    const p1 = _v1.clone().add(drag).add(_v3.set(Math.cos(a) * 0.5 + sway * 0.4, -0.5, Math.sin(a) * 0.5 + sway2 * 0.4));
    const p2 = p1.clone().add(drag).add(_v3.set(Math.cos(a) * 0.4 + sway, -0.55, Math.sin(a) * 0.4 + sway2));
    setTube(idleTubes[i], [_v1.clone(), p1, p2], 0.11, 8);
  }
  // the grapple tentacle
  if (grappleTube.visible) {
    let end;
    if (P.state === 'punch' && P.punchData) end = P.punchData.enemy.group.position.clone().add(_v3.set(0, 0.5, 0));
    else end = targetTree().anchor;
    const start = _v1.copy(P.pos).add(_v2.set(0, 0.3, 0)).clone();
    const mid = start.clone().lerp(end, 0.5);
    const d = start.distanceTo(end);
    const wig = Math.min(1.6, d * 0.08);
    mid.x += Math.sin(t * 22) * wig;
    mid.y += Math.cos(t * 19) * wig * 0.6 + d * 0.03;
    mid.z += Math.cos(t * 24) * wig;
    setTube(grappleTube, [start, mid, end], 0.15, 12);
    fist.position.copy(end);
  }
}

// ---------------------------------------------------------- camera
function updateCamera(rdt) {
  let focus = P.pos;
  if (P.state === 'qte' || P.state === 'zip') {
    _v1.copy(targetTree().anchor).sub(P.pos);
    _v1.y *= 0.3;
    if (_v1.lengthSq() > 0.01) camFwd.lerp(_v1.normalize(), 1 - Math.exp(-4 * rdt)).normalize();
  } else if (P.vel.lengthSq() > 1) {
    _v1.copy(P.vel); _v1.y *= 0.2;
    if (_v1.lengthSq() > 0.01) camFwd.lerp(_v1.normalize(), 1 - Math.exp(-3 * rdt)).normalize();
  }
  _v2.copy(P.pos).addScaledVector(camFwd, -8.5);
  _v2.y = Math.max(P.pos.y + 3.2, 4);
  camera.position.lerp(_v2, 1 - Math.exp(-5 * rdt));
  if (shake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * shake * 0.6;
    camera.position.y += (Math.random() - 0.5) * shake * 0.6;
    shake *= Math.exp(-6 * rdt);
  }
  fov += (fovTarget - fov) * (1 - Math.exp(-6 * rdt));
  camera.fov = fov;
  camera.updateProjectionMatrix();
  _v3.copy(focus).addScaledVector(P.vel, 0.12);
  camera.lookAt(_v3);
}

// ---------------------------------------------------------- HUD
function updateHUD() {
  ui.hp.style.width = P.hp + '%';
  ui.hp.classList.toggle('low', P.hp <= 30);
  ui.trees.textContent = P.treesChained;
  ui.score.textContent = P.score;
  if (P.state === 'qte') {
    const frac = Math.max(0, P.qteTime / 5);
    ui.qteRing.style.strokeDashoffset = String(283 * (1 - frac));
    ui.qteRing.style.stroke = frac > 0.4 ? '#ffe14d' : '#ff4d4d';
    ui.qteTime.textContent = Math.max(0, P.qteTime).toFixed(1);
  }
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
      // slow orbit around the first tree
      if (trees.length) {
        const a = elapsed * 0.15;
        const c = trees[0].top;
        camera.position.set(c.x + Math.cos(a) * 27, c.y + 10, c.z + Math.sin(a) * 27);
        camera.lookAt(c.x, c.y - 2, c.z);
      }
      break;

    case 'perched': {
      P.pos.y = trees[0].top.y + 0.9 + Math.sin(elapsed * 2.5) * 0.08;
      _v1.copy(targetTree().anchor).sub(P.pos); _v1.y = 0;
      camFwd.lerp(_v1.normalize(), 1 - Math.exp(-3 * rdt));
      reticle.visible = true;
      break;
    }

    case 'qte': {
      P.vel.y -= 10 * wdt;
      P.pos.addScaledVector(P.vel, wdt);
      P.qteTime -= rdt; // the 5s countdown runs in REAL time
      const sec = Math.ceil(P.qteTime);
      if (P.qteTime < 3 && sec !== lastTickSec) { lastTickSec = sec; sfx.tick(); }
      if (P.qteTime <= 0) qteFail();
      break;
    }

    case 'zip': {
      const anchor = targetTree().anchor;
      _v1.copy(anchor).sub(P.pos);
      const d = _v1.length();
      const step = Math.min(d, 55 * wdt);
      P.pos.addScaledVector(_v1.normalize(), step);
      P.vel.copy(_v1).multiplyScalar(55);
      trailT -= rdt;
      if (trailT <= 0) { trailT = 0.03; burst(P.pos, MAT.trail, 1, 1, 1); }
      if (d < 3) arrive();
      break;
    }

    case 'punch': {
      const pd = P.punchData;
      pd.t += rdt / 0.16;
      P.pos.copy(pd.from).lerp(pd.enemy.group.position, Math.min(1, pd.t));
      P.pos.y += 0.5;
      if (pd.t >= 1) resolvePunch();
      break;
    }

    case 'falling': {
      P.vel.y -= 28 * wdt;
      P.pos.addScaledVector(P.vel, wdt);
      player.rotation.x += P.tumble * wdt;
      player.rotation.z += P.tumble * 0.6 * wdt;
      if (P.pos.y < 1.2) {
        burst(P.pos, MAT.body, 14, 9, 9);
        sfx.splat();
        shake = 1;
        die(P.deadReason || 'SPLAT!', P.deadSub || 'The forest floor is not a trampoline.');
      }
      break;
    }
  }

  if (P.state !== 'falling' && P.state !== 'dead') {
    player.rotation.x *= 0.9; player.rotation.z *= 0.9;
    player.rotation.y = Math.atan2(camFwd.x, camFwd.z) + Math.PI;
  }
  player.position.copy(P.pos);

  if (reticle.visible && trees.length > P.targetIndex) {
    reticle.position.copy(targetTree().anchor);
    reticle.lookAt(camera.position);
    const s = 1 + Math.sin(elapsed * 8) * 0.12;
    reticle.scale.setScalar(s);
  }

  mist.position.x = camera.position.x;
  mist.position.z = camera.position.z;
  ground.position.x = camera.position.x;
  ground.position.z = camera.position.z;

  updateEnemies(wdt);
  updateProjectiles(wdt);
  updateParticles(Math.max(wdt, rdt * 0.3));
  updateTentacles(rdt);
  if (P.state !== 'menu') updateCamera(rdt);
  updateHUD();

  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame);

// ---------------------------------------------------------- input
function leap() {
  if (P.state !== 'perched') return;
  ui.hint.classList.add('hidden');
  _v1.copy(targetTree().anchor).sub(P.pos).normalize();
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
    else if (P.state === 'dead') reset();
    else if (P.state === 'menu') startGame();
    return;
  }
  if (ev.code === 'KeyE' || ev.code === 'KeyF') { tryPunch(); return; }
  if (ev.code === 'KeyR' && (P.state === 'dead' || P.state === 'falling')) { reset(); return; }
});

renderer.domElement.addEventListener('pointerdown', () => {
  audioCtx();
  if (P.state === 'perched') leap();
  else if (P.state === 'qte' || P.state === 'zip') tryPunch();
});

for (const btn of document.querySelectorAll('.qkey')) {
  btn.addEventListener('pointerdown', (ev) => {
    ev.stopPropagation();
    handleNumber(parseInt(btn.dataset.n, 10));
  });
}

function startGame() {
  audioCtx();
  reset();
}
ui.playBtn.addEventListener('click', startGame);

// ---------------------------------------------------------- boot (menu backdrop)
for (let i = 0; i < 12; i++) makeTree(i);
P.pos.copy(trees[0].top).add(new THREE.Vector3(0, 0.9, 0));
player.position.copy(P.pos);

// exposed for automated smoke tests
window.__game = P;

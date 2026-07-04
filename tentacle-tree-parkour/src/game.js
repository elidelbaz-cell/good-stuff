import * as THREE from 'three';

/* ============================================================
   TENTACLE TREETOPS — OPEN GROVE
   Free-roam first-person alien parkour. You are Splort the
   Slippery, the most wanted tentacle in the galaxy. Roam a big
   glowing world tree-to-tree (every grapple is a 3.5s slow-mo
   number QTE), fight and escape the Galactic Patrol (wanted
   meter), run quests for the villages, collect 3 ship parts,
   and find the LAST SPACESHIP to escape the planet.
   ============================================================ */

const QTE_TIME = 3.5;
const ZIP_SPEED = 55;
const PUNCH_RANGE = 24;
const GRAPPLE_RANGE = 58;
const WORLD_R = 300;        // world radius
const TREE_N = 150;         // grapple trees scattered in the world

// ---------------------------------------------------------- dom
const $ = (id) => document.getElementById(id);
const ui = {
  hp: $('hpbar'), score: $('stat-score'), best: $('stat-best'), parts: $('stat-parts'),
  wanted: $('stat-wanted'),
  quest: $('quest-line'),
  qte: $('qte'), qteNum: $('qte-num'), qteRing: $('qte-ring'), qteTime: $('qte-time'),
  qteCircle: $('qte-circle'), qteLabel: $('qte-label'),
  vignette: $('vignette'), flash: $('flash'), crosshair: $('crosshair'),
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
  hurt: () => tone(220, 0.2, 'sawtooth', 0.2, 110),
  splat: () => { tone(200, 0.5, 'sawtooth', 0.25, 40); whoosh(0.3, 0.3); },
  fall: () => tone(700, 1.0, 'sine', 0.15, 120),
  pickup: () => { tone(880, 0.1, 'square', 0.12); setTimeout(() => tone(1320, 0.15, 'square', 0.1), 80); },
  quest: () => { tone(523, 0.12, 'square', 0.12); setTimeout(() => tone(659, 0.12, 'square', 0.12), 110); setTimeout(() => tone(880, 0.25, 'square', 0.12), 220); },
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
  trunk2: new THREE.MeshLambertMaterial({ color: 0x2c2850 }),
  rock: new THREE.MeshLambertMaterial({ color: 0x4a4668 }),
  leafA: new THREE.MeshLambertMaterial({ color: 0x3a1f4d, emissive: 0xb03fd0, emissiveIntensity: 0.5 }),
  leafB: new THREE.MeshLambertMaterial({ color: 0x123c3a, emissive: 0x2ac5b5, emissiveIntensity: 0.5 }),
  leafC: new THREE.MeshLambertMaterial({ color: 0x2a1a55, emissive: 0x6a4fe8, emissiveIntensity: 0.5 }),
  pad: new THREE.MeshLambertMaterial({ color: 0x2a2438 }),
  padRing: new THREE.MeshBasicMaterial({ color: 0x4dffe1 }),
  villageRing: new THREE.MeshBasicMaterial({ color: 0x7dff6a }),
  platRing: new THREE.MeshBasicMaterial({ color: 0xff4fd8 }),
  tentacle: new THREE.MeshLambertMaterial({ color: 0x9a6ff0, emissive: 0x241040, emissiveIntensity: 1 }),
  sucker: new THREE.MeshLambertMaterial({ color: 0xd8c6ff, emissive: 0x4a2f80, emissiveIntensity: 0.6 }),
  body: new THREE.MeshLambertMaterial({ color: 0x7a4fd0 }),
  eyeW: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  skin: new THREE.MeshLambertMaterial({ color: 0x8de85c }),
  suit: new THREE.MeshLambertMaterial({ color: 0x2b2b3d }),
  suit2: new THREE.MeshLambertMaterial({ color: 0x3d2b3a }),
  villagerA: new THREE.MeshLambertMaterial({ color: 0x2a6b4f }),
  villagerB: new THREE.MeshLambertMaterial({ color: 0x6b5a2a }),
  eyeB: new THREE.MeshBasicMaterial({ color: 0x0a0a12 }),
  gun: new THREE.MeshLambertMaterial({ color: 0x1c1c28 }),
  bullet: new THREE.MeshBasicMaterial({ color: 0xff4fd8 }),
  flash: new THREE.MeshBasicMaterial({ color: 0xffb3ee }),
  reticle: new THREE.MeshBasicMaterial({ color: 0x4dffe1, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }),
  reticleTwin: new THREE.MeshBasicMaterial({ color: 0xff4fd8, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }),
  spore: new THREE.MeshBasicMaterial({ color: 0xb03fd0 }),
  sporeOrb: new THREE.MeshLambertMaterial({ color: 0x3a1f4d, emissive: 0xd44fd4, emissiveIntensity: 1.4 }),
  trail: new THREE.MeshBasicMaterial({ color: 0xc0a4ff }),
  hull: new THREE.MeshLambertMaterial({ color: 0x8a93b8 }),
  hullDark: new THREE.MeshLambertMaterial({ color: 0x3c4260 }),
  dome: new THREE.MeshLambertMaterial({ color: 0x7ef2dd, emissive: 0x2ac5b5, emissiveIntensity: 0.7, transparent: true, opacity: 0.85 }),
  beam: new THREE.MeshBasicMaterial({ color: 0x4dffe1, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
  beamGreen: new THREE.MeshBasicMaterial({ color: 0x7dff6a, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }),
  beamCyan: new THREE.MeshBasicMaterial({ color: 0x4dffe1, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
  beamGold: new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }),
  beamRed: new THREE.MeshBasicMaterial({ color: 0xff4f4f, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
  shield: new THREE.MeshLambertMaterial({ color: 0x3a5fbf, emissive: 0x2a4faf, emissiveIntensity: 0.4, transparent: true, opacity: 0.3, side: THREE.DoubleSide }),
  shipLight: new THREE.MeshBasicMaterial({ color: 0xffe14d }),
  lightRed: new THREE.MeshBasicMaterial({ color: 0xff3b3b }),
  lightBlue: new THREE.MeshBasicMaterial({ color: 0x3b8cff }),
  ringNext: new THREE.MeshBasicMaterial({ color: 0xffe14d, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
  ringWait: new THREE.MeshBasicMaterial({ color: 0x8a93b8, side: THREE.DoubleSide, transparent: true, opacity: 0.35 }),
};
const GEO = {
  bullet: new THREE.SphereGeometry(0.22, 8, 8),
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

// ---------------------------------------------------------- helpers
function randPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _camR = new THREE.Vector3(), _camU = new THREE.Vector3(), _camF = new THREE.Vector3();

function makeBeam(pos, mat) {
  const m = new THREE.Mesh(GEO.beam, mat);
  m.position.set(pos.x, 65, pos.z);
  scene.add(m);
  return m;
}

// ---------------------------------------------------------- world
const trees = [];      // { top, anchor, group, village: -1|idx }
const platforms = [];  // { group, baseY, phase }
const enemies = [];    // hostile gunners { group, muzzle, platform, offset, dead, removed, cd, vel, spin, life, flashT, marked }
const villagers = [];  // friendly NPCs { group, phase }
const pursuers = [];   // patrol saucers { group, lightA, lightB, cd, phase, home, active }
const spores = [];     // quest 1 orbs { mesh, taken, phase }
const rings = [];      // quest 3 checkpoints { mesh, pos, idx }
const beams = { villages: [], quest: [], ship: null, station: null };
const villages = [];   // { treeIdx, pos, giver }
let station = null;    // patrol station { pos, group }
let shipSite = null;   // { pos, group, dome }

function scatterTrees() {
  // crash-site spire at the center-south of the map
  addTree(new THREE.Vector3(0, 26, 120), 'spire');
  let tries = 0;
  while (trees.length < TREE_N && tries < 6000) {
    tries++;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * WORLD_R;
    const x = Math.cos(a) * r, z = Math.sin(a) * r - 40;
    let ok = true;
    for (const t of trees) {
      const dx = t.top.x - x, dz = t.top.z - z;
      if (dx * dx + dz * dz < 21 * 21) { ok = false; break; }
    }
    if (!ok) continue;
    const y = 18 + Math.random() * 26;
    addTree(new THREE.Vector3(x, y, z), 'tree');
  }
}

function addTree(posTop, kind) {
  const { x, z } = posTop;
  const y = posTop.y;
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
  scene.add(group);
  trees.push({
    top: new THREE.Vector3(x, y + 0.5, z),
    anchor: new THREE.Vector3(x, y + 1.1, z),
    group, village: -1, ring,
  });
}

function makeVillager(pos, mat) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(GEO.npcBody, mat);
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
  g.position.copy(pos);
  scene.add(g);
  villagers.push({ group: g, phase: Math.random() * Math.PI * 2 });
  return g;
}

function makeVillages() {
  // pick 3 far-apart trees as quest villages
  const picks = [];
  for (const want of [new THREE.Vector3(-190, 0, -60), new THREE.Vector3(180, 0, -140), new THREE.Vector3(60, 0, -260)]) {
    let bi = -1, bd = Infinity;
    for (let i = 1; i < trees.length; i++) {
      if (picks.includes(i)) continue;
      const d = (trees[i].top.x - want.x) ** 2 + (trees[i].top.z - want.z) ** 2;
      if (d < bd) { bd = d; bi = i; }
    }
    picks.push(bi);
  }
  picks.forEach((ti, vi) => {
    const t = trees[ti];
    t.village = vi;
    t.ring.material = MAT.villageRing;
    // a bigger friendly pad + huts
    const hut = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.8, 6), randPick([MAT.villagerA, MAT.villagerB]));
    hut.position.set(t.top.x + 1.6, t.top.y + 0.9, t.top.z + 0.8);
    t.group.add(hut);
    const giver = makeVillager(new THREE.Vector3(t.top.x - 1.2, t.top.y + 0.05, t.top.z - 0.6), MAT.villagerA);
    // "!" marker above the quest giver
    const mark = new THREE.Group();
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), MAT.shipLight);
    dot.position.y = 0;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.55, 6), MAT.shipLight);
    bar.position.y = 0.55;
    mark.add(dot); mark.add(bar);
    mark.position.set(t.top.x - 1.2, t.top.y + 2.1, t.top.z - 0.6);
    scene.add(mark);
    villages.push({ treeIdx: ti, pos: t.top.clone(), giver, mark });
    beams.villages.push(makeBeam(t.top, MAT.beamGreen));
  });
}

function makePlatformAt(pos) {
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
  return plat;
}

function makePlatforms() {
  let placed = 0, tries = 0;
  while (placed < 20 && tries < 2000) {
    tries++;
    const t = trees[1 + Math.floor(Math.random() * (trees.length - 1))];
    if (t.village >= 0) continue;
    const a = Math.random() * Math.PI * 2;
    const pos = t.top.clone().add(new THREE.Vector3(Math.cos(a) * 10, -1 + Math.random() * 5, Math.sin(a) * 10));
    let ok = true;
    for (const v of villages) if (pos.distanceTo(v.pos) < 40) { ok = false; break; }
    if (!ok) continue;
    makePlatformAt(pos);
    placed++;
  }
}

function spawnEnemy(plat, k) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(GEO.npcBody, Math.random() < 0.5 ? MAT.suit : MAT.suit2);
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
  enemies.push({ group: g, muzzle, platform: plat, offset, dead: false, removed: false, cd: 1 + Math.random() * 2, vel: new THREE.Vector3(), spin: 0, life: 3, flashT: 0, marked: false });
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
  scene.add(group);
  pursuers.push({ group, lightA, lightB, cd: 2 + Math.random(), phase: Math.random() * Math.PI * 2, home: pos.clone(), active: false });
}

function makeStation() {
  const pos = new THREE.Vector3(-60, 42, 190);
  const group = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.CylinderGeometry(7, 5, 1.4, 8), MAT.hullDark);
  group.add(slab);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(6.4, 0.2, 6, 28), MAT.lightRed);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.8;
  group.add(rim);
  group.position.copy(pos);
  scene.add(group);
  station = { pos, group };
  beams.station = makeBeam(pos, MAT.beamRed);
  for (let i = 0; i < 3; i++) {
    makePatrolSaucer(pos.clone().add(new THREE.Vector3((i - 1) * 5, 2.2, 0)));
  }
}

function makeShipSite() {
  const pos = new THREE.Vector3(-40, 0, -290);
  // find ground-ish clearing: put the ship on a mesa
  const group = new THREE.Group();
  const mesa = new THREE.Mesh(new THREE.CylinderGeometry(9, 13, 24, 9), MAT.rock);
  mesa.position.set(pos.x, 12, pos.z);
  group.add(mesa);
  const padTop = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 9.5, 0.6, 9), MAT.pad);
  padTop.position.set(pos.x, 24.3, pos.z);
  group.add(padTop);
  // THE LAST SHIP
  const ship = new THREE.Group();
  const hullBottom = new THREE.Mesh(new THREE.SphereGeometry(4.4, 20, 12), MAT.hull);
  hullBottom.scale.set(1, 0.32, 1);
  ship.add(hullBottom);
  const hullBand = new THREE.Mesh(new THREE.TorusGeometry(3.8, 0.6, 8, 28), MAT.hullDark);
  hullBand.rotation.x = Math.PI / 2;
  ship.add(hullBand);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.9, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), MAT.dome);
  dome.position.y = 0.8;
  ship.add(dome);
  const lights = new THREE.Group();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.24, 6, 6), MAT.shipLight);
    l.position.set(Math.cos(a) * 3.8, -0.15, Math.sin(a) * 3.8);
    lights.add(l);
  }
  ship.add(lights);
  ship.position.set(pos.x, 26.6, pos.z);
  group.add(ship);
  // energy shield until you have all 3 parts
  const shield = new THREE.Mesh(new THREE.SphereGeometry(8.2, 20, 14), MAT.shield);
  shield.position.set(pos.x, 27, pos.z);
  group.add(shield);
  scene.add(group);
  const sitePos = new THREE.Vector3(pos.x, 26.6, pos.z);
  shipSite = { pos: sitePos, group, ship, lights, shield, unlocked: false };
  beams.ship = makeBeam(pos, MAT.beamCyan);
}

// ---------------------------------------------------------- projectiles & particles
const projectiles = [];
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
const idleTubes = [makeTube(), makeTube()]; // exactly two tentacles — that's all Splort has
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
  state: 'menu', // menu | cutscene | perched | qte | zip | cannonball | falling | won
  pos: new THREE.Vector3(), vel: new THREE.Vector3(),
  hp: 100, score: 0, punches: 0, hops: 0,
  currentTree: 0, targetTree: -1, chainTree: -1,
  qteNums: [], qteIdx: 0, qteTime: 0, qteTwin: false, cannonEarned: false, cannon: null,
  parts: 0, heat: 0,
  punchAnim: null, tumble: 0,
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
let yaw = Math.PI, pitch = 0; // start facing -z... spire faces north into the map
let elapsed = 0;
let lastTickSec = -1;
let trailT = 0;
let escapeTimer = 0;   // seconds with no pursuer nearby (heat decay gate)
let lastSiren = -10;
let cutsceneSeen = false;
let cut = null;
let cutBody = null;
const mouse = { x: 0, y: 0 };
const keys = {};

// ---------------------------------------------------------- quests
const QUESTS = [
  {
    id: 'spores', village: 0, title: 'SPORE HARVEST', reward: 'FUEL CELL',
    lines: 'Our glow-spores drifted into the canopy! Snag all 6 and the ship FUEL CELL we found is yours.',
    count: 6,
  },
  {
    id: 'bullies', village: 1, title: 'BULLY BUSTERS', reward: 'IGNITION CRYSTAL',
    lines: 'Patrol goons set up camp around our grove. Punch 5 of the marked ones into orbit — we will trade you an IGNITION CRYSTAL. (The patrol WILL notice.)',
    count: 5,
  },
  {
    id: 'race', village: 2, title: 'THE SPORE-RUNNER RACE', reward: 'STAR MAP',
    lines: 'You look fast. Thread all 5 golden rings before 75 seconds die, and the STAR MAP is yours.',
    count: 5, time: 75,
  },
];
// state per quest: 'available' | 'active' | 'done'
let questState = ['available', 'available', 'available'];
let questProgress = [0, 0, 0];
let raceTimer = 0;
let activeQuest = -1;

function questSetup(qi) {
  const q = QUESTS[qi];
  const v = villages[q.village];
  if (q.id === 'spores') {
    // 6 glowing orbs on trees near village 0
    const near = trees
      .map((t, i) => ({ t, i, d: t.top.distanceTo(v.pos) }))
      .filter((o) => o.d > 15 && o.d < 130 && o.t.village < 0)
      .sort((a, b) => a.d - b.d)
      .slice(0, 6);
    for (const o of near) {
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), MAT.sporeOrb);
      mesh.position.copy(o.t.top).add(new THREE.Vector3(0, 3.5, 0));
      scene.add(mesh);
      spores.push({ mesh, taken: false, phase: Math.random() * 6 });
      beams.quest.push({ mesh: makeBeam(o.t.top, MAT.beamCyan), qi });
    }
  } else if (q.id === 'bullies') {
    // mark the 5 platforms nearest village 1
    const near = platforms
      .map((p) => ({ p, d: p.group.position.distanceTo(v.pos) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 5);
    for (const o of near) {
      for (const e of enemies) {
        if (e.platform === o.p && !e.dead && !e.removed) { e.marked = true; }
      }
      o.p.marked = true;
      beams.quest.push({ mesh: makeBeam(o.p.group.position, MAT.beamRed), qi });
    }
    // ensure at least 5 marked gunners
    let n = enemies.filter((e) => e.marked && !e.dead && !e.removed).length;
    for (const o of near) {
      while (n < 5) { spawnEnemy(o.p, n); enemies[enemies.length - 1].marked = true; n++; }
    }
  } else if (q.id === 'race') {
    // 5 rings leading away from village 2
    let cur = trees[villages[2].treeIdx];
    const used = new Set([villages[2].treeIdx]);
    for (let k = 0; k < 5; k++) {
      let bi = -1, bd = Infinity;
      for (let i = 1; i < trees.length; i++) {
        if (used.has(i)) continue;
        const d = trees[i].top.distanceTo(cur.top);
        if (d > 25 && d < 55 && d < bd) { bd = d; bi = i; }
      }
      if (bi < 0) break;
      used.add(bi);
      cur = trees[bi];
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.28, 8, 28), MAT.ringWait);
      mesh.position.copy(cur.top).add(new THREE.Vector3(0, 4, 0));
      scene.add(mesh);
      rings.push({ mesh, pos: mesh.position.clone(), idx: k });
    }
    raceTimer = QUESTS[2].time;
  }
}

function clearQuestBeams(qi) {
  for (let i = beams.quest.length - 1; i >= 0; i--) {
    if (qi === undefined || beams.quest[i].qi === qi) {
      scene.remove(beams.quest[i].mesh);
      beams.quest.splice(i, 1);
    }
  }
}

function acceptQuest(qi) {
  questState[qi] = 'active';
  activeQuest = qi;
  questProgress[qi] = 0;
  questSetup(qi);
  sfx.quest();
  popTextScreen(`QUEST: ${QUESTS[qi].title}`);
}

function completeQuest(qi) {
  questState[qi] = 'done';
  if (activeQuest === qi) activeQuest = QUESTS.findIndex((_, i) => questState[i] === 'active');
  P.parts += 1;
  P.score += 150;
  clearQuestBeams(qi);
  if (qi === 0) { for (const s of spores) scene.remove(s.mesh); spores.length = 0; }
  if (qi === 2) { for (const r of rings) scene.remove(r.mesh); rings.length = 0; }
  sfx.quest();
  popTextScreen(`${QUESTS[qi].reward} ACQUIRED! (${P.parts}/3 parts)`);
  const v = villages[QUESTS[qi].village];
  if (v) { scene.remove(v.mark); scene.remove(beams.villages[QUESTS[qi].village]); }
  if (P.parts >= 3) unlockShip();
}

function failRace() {
  questState[2] = 'available';
  if (activeQuest === 2) activeQuest = QUESTS.findIndex((_, i) => questState[i] === 'active');
  for (const r of rings) scene.remove(r.mesh);
  rings.length = 0;
  clearQuestBeams(2);
  popTextScreen('RACE FAILED — talk to the runner to retry');
  sfx.wrong();
}

function unlockShip() {
  shipSite.unlocked = true;
  shipSite.shield.visible = false;
  scene.remove(beams.ship);
  beams.ship = makeBeam(shipSite.pos, MAT.beamGold);
  P.heat = 100; // the patrol knows. RUN.
  popTextScreen('🛸 THE LAST SHIP IS YOURS TO TAKE — THE PATROL KNOWS. RUN!');
  sfx.siren();
  ui.hint.textContent = 'Follow the GOLD beam. Don’t get caught.';
  ui.hint.classList.remove('hidden');
  setTimeout(() => ui.hint.classList.add('hidden'), 5000);
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
  P.state = 'falling';
  P.fallReason = 'TOO SLOW! The tentacles gave up on you.';
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

// ---------------------------------------------------------- free-roam targeting & movement
function pickGrappleTarget() {
  // the tree closest to where you're looking, in range, not the one you're on
  let bi = -1, bs = 0.78; // tight cone first
  let fi = -1, fd = Infinity; // fallback: nearest tree in the front hemisphere
  for (let i = 0; i < trees.length; i++) {
    if (i === P.currentTree) continue;
    _v1.copy(trees[i].anchor).sub(P.pos);
    const d = _v1.length();
    if (d > GRAPPLE_RANGE || d < 6) continue;
    _v1.divideScalar(d);
    const dot = _v1.dot(camFwd);
    if (dot > bs) { bs = dot; bi = i; }
    if (dot > 0.25 && d < fd) { fd = d; fi = i; }
  }
  return bi >= 0 ? bi : fi;
}

function pickChainTree(ti) {
  // a second tree just past the target -> twin cannonball opportunity
  const A = trees[ti].anchor;
  _v2.copy(A).sub(P.pos).normalize();
  let bi = -1, bd = Infinity;
  for (let i = 0; i < trees.length; i++) {
    if (i === ti || i === P.currentTree) continue;
    const d = trees[i].anchor.distanceTo(A);
    if (d > 18 || d < 5) continue;
    _v1.copy(trees[i].anchor).sub(A).normalize();
    if (_v1.dot(_v2) < 0.35) continue;
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

function leap() {
  if (P.state !== 'perched') return;
  const ti = pickGrappleTarget();
  if (ti < 0) {
    popTextScreen('no tree in reach — look around');
    return;
  }
  P.targetTree = ti;
  P.chainTree = pickChainTree(ti);
  ui.hint.classList.add('hidden');
  _v1.copy(trees[ti].anchor).sub(P.pos).normalize();
  P.vel.set(_v1.x * 8, 11, _v1.z * 8);
  P.pos.y += 0.2;
  whoosh(0.25, 0.12);
  beginQTE();
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
  P.hops += 1;
  P.state = 'perched';
  tsTarget = 1; fovTarget = 74;
  grappleTube.visible = false;
  grappleFist.visible = false;
  yaw = Math.atan2(camFwd.x, -camFwd.z);
  pitch = 0;
  burst(t.top, MAT.spore, 8, 7, 6);
  sfx.land();
  shake = Math.min(1, shake + 0.2);
  if (t.village >= 0) villageArrive(t.village);
}

function arrive() {
  const ti = P.targetTree;
  P.pos.copy(trees[ti].anchor);
  grappleTube.visible = false;
  grappleFist.visible = false;

  if (P.cannonEarned && P.chainTree >= 0) {
    P.cannonEarned = false;
    const from = trees[ti].anchor;
    const to = trees[P.chainTree].anchor;
    P.pos.copy(from);
    const T = 0.85, g = 24;
    P.vel.copy(to).sub(from).divideScalar(T);
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

// ---------------------------------------------------------- villages & dialogue
let dialog = null; // { qi }
function villageArrive(vi) {
  const qi = QUESTS.findIndex((q) => q.village === vi);
  if (qi < 0) return;
  if (questState[qi] === 'available') {
    dialog = { qi };
    ui.cutscene.classList.remove('hidden');
    ui.cutSpeaker.textContent = `VILLAGE ELDER — ${QUESTS[qi].title}`;
    ui.cutSpeaker.classList.remove('hidden');
    ui.cutText.classList.remove('system');
    ui.cutText.textContent = QUESTS[qi].lines + '  [SPACE / CLICK to accept]';
    ui.cutSkip.textContent = 'ACCEPT ▸';
  } else if (questState[qi] === 'done') {
    popTextScreen('The village waves their tentacles at you.');
  }
}

function closeDialog(accept) {
  if (!dialog) return;
  const qi = dialog.qi;
  dialog = null;
  ui.cutscene.classList.add('hidden');
  if (accept) acceptQuest(qi);
}

// ---------------------------------------------------------- punch
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
  P.heat = Math.min(100, P.heat + 26); // assaulting patrol goons is, technically, a crime
  shake = Math.min(1, shake + 0.5);
  burst(e.group.position, MAT.bullet, 8, 10, 8);
  popText(e.group.position, label, 'pow');
  sfx.pow();
  if (questState[1] === 'active' && e.marked) {
    questProgress[1] += 1;
    if (questProgress[1] >= QUESTS[1].count) completeQuest(1);
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
  if (P.state === 'menu' || P.state === 'won' || P.state === 'cutscene') return;
  P.hp -= dmg;
  sfx.hurt();
  shake = Math.min(1, shake + 0.35);
  ui.flash.classList.remove('on');
  void ui.flash.offsetWidth;
  ui.flash.classList.add('on');
  if (P.hp <= 0) {
    P.hp = 0;
    respawn('SHOT DOWN!', 'The patrol scraped you off the canopy. -50', 50, false);
  }
}

function nearestSafeTree() {
  let bi = 0, bd = Infinity;
  const cands = [0, ...villages.map((v) => v.treeIdx)];
  for (const i of cands) {
    const d = trees[i].top.distanceTo(P.pos);
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

function respawn(title, subtitle, penalty, clearHeat) {
  P.score = Math.max(0, P.score - penalty);
  if (clearHeat) P.heat = 0;
  if (shipSite.unlocked) P.heat = 100; // the finale never cools off
  P.hp = 100;
  P.punchAnim = null;
  punchTube.visible = false; punchFist.visible = false;
  grappleTube.visible = false; grappleFist.visible = false;
  ui.qte.classList.add('hidden');
  ui.vignette.classList.remove('on');
  tsTarget = 1; fovTarget = 74; roll = 0;
  if (questState[2] === 'active') failRace();
  landOn(nearestSafeTree());
  P.hops -= 1; // don't count the respawn as a hop
  popTextScreen(`${title} ${subtitle}`);
  shake = 1;
  // shove the patrol back to base so you get a breather
  for (const u of pursuers) { u.group.position.copy(u.home); }
  escapeTimer = 0;
}

function busted() {
  sfx.siren();
  respawn('BUSTED!', 'They took a cut and let you slip away. -100', 100, true);
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
  ui.oTitle.textContent = '🛸 OFF-WORLD AT LAST!';
  ui.oSub.innerHTML = `Splort the Slippery escapes again. The patrol files a very long report.<br><b>${P.score}</b> score (best ${best}) &nbsp;·&nbsp; <b>${P.punches}</b> gunners punched &nbsp;·&nbsp; <b>${P.hops}</b> grapples &nbsp;·&nbsp; ${mins.toFixed(1)} min`;
  ui.oControls.classList.add('hidden');
  ui.playBtn.textContent = 'PLAY AGAIN';
  ui.overlay.classList.remove('hidden');
}

// ---------------------------------------------------------- wanted system
function wantedStars() { return P.heat <= 0 ? 0 : Math.min(3, 1 + Math.floor(P.heat / 34)); }

function updateWanted(rdt) {
  const stars = wantedStars();
  // activate as many saucers as stars
  let active = 0;
  for (const u of pursuers) {
    if (active < stars) { u.active = true; active++; } else { u.active = false; }
  }
  // heat decay: only when no active saucer is near you for a while
  let nearest = Infinity;
  for (const u of pursuers) if (u.active) nearest = Math.min(nearest, u.group.position.distanceTo(P.pos));
  if (!shipSite.unlocked) {
    if (nearest > 70) {
      escapeTimer += rdt;
      if (escapeTimer > 4) {
        const before = wantedStars();
        P.heat = Math.max(0, P.heat - 7 * rdt);
        if (before > 0 && wantedStars() === 0) popTextScreen('🚨 You lost them. Heat: cold.');
      }
    } else {
      escapeTimer = 0;
    }
  }
}

function updatePursuers(rdt) {
  const hunting = P.state === 'perched' || P.state === 'qte' || P.state === 'zip' || P.state === 'cannonball' || P.state === 'falling';
  let minD = Infinity;
  for (const u of pursuers) {
    u.lightA.visible = Math.sin(elapsed * 14 + u.phase) > 0 && (u.active || P.state === 'cutscene' || P.state === 'menu');
    u.lightB.visible = !u.lightA.visible && (u.active || P.state === 'cutscene' || P.state === 'menu');
    if (u.active && hunting) {
      _v1.copy(P.pos).sub(u.group.position);
      const d = _v1.length();
      minD = Math.min(minD, d);
      // the patrol flies in REAL time — your slow-mo doesn't slow them down
      if (d > 5) u.group.position.addScaledVector(_v1.normalize(), Math.min(12 * rdt, d - 4.5));
      u.group.rotation.y = Math.atan2(_v1.x, _v1.z);
      u.group.rotation.z = Math.sin(elapsed * 3 + u.phase) * 0.08;
      if (d < 6.5 && P.state !== 'falling') { busted(); return; }
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
      // drift home
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
    e.group.position.copy(e.platform.group.position).add(e.offset);
    const d = e.group.position.distanceTo(P.pos);
    if (d > 90) continue;
    e.group.rotation.y = Math.atan2(P.pos.x - e.group.position.x, P.pos.z - e.group.position.z);
    if (e.flashT > 0) {
      e.flashT -= wdt;
      e.muzzle.scale.setScalar(Math.max(0.01, e.flashT * 6));
    }
    if (!shootable || d < 4 || d > 60) continue;
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

// ---------------------------------------------------------- quest pickups
function nearXZ(a, b, r, dy) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return dx * dx + dz * dz < r * r && Math.abs(a.y - b.y) < dy;
}

function updateQuestPickups() {
  if (questState[0] === 'active') {
    for (const s of spores) {
      if (s.taken) continue;
      s.mesh.position.y += Math.sin(elapsed * 2 + s.phase) * 0.004;
      s.mesh.rotation.y += 0.02;
      if (nearXZ(s.mesh.position, P.pos, 5.5, 9)) {
        s.taken = true;
        scene.remove(s.mesh);
        questProgress[0] += 1;
        P.score += 10;
        burst(s.mesh.position, MAT.spore, 10, 8, 7);
        sfx.pickup();
        popText(s.mesh.position, `${questProgress[0]}/${QUESTS[0].count}`, '');
        if (questProgress[0] >= QUESTS[0].count) completeQuest(0);
      }
    }
  }
  if (questState[2] === 'active') {
    const next = rings.find((r) => r.idx === questProgress[2]);
    for (const r of rings) {
      r.mesh.material = r.idx === questProgress[2] ? MAT.ringNext : MAT.ringWait;
      r.mesh.rotation.y += r.idx === questProgress[2] ? 0.04 : 0.008;
    }
    if (next && nearXZ(next.pos, P.pos, 6.5, 8)) {
      questProgress[2] += 1;
      P.score += 10;
      burst(next.pos, MAT.trail, 10, 8, 7);
      sfx.pickup();
      popText(next.pos, `RING ${questProgress[2]}/${QUESTS[2].count}`, '');
      if (questProgress[2] >= QUESTS[2].count) completeQuest(2);
    }
  }
  // the ship itself
  if (shipSite && nearXZ(P.pos, shipSite.pos, 20, 28)) {
    if (shipSite.unlocked) {
      if (nearXZ(P.pos, shipSite.pos, 9, 22) && P.state !== 'won') win();
    } else if (elapsed - (shipSite.lastNag || 0) > 4) {
      shipSite.lastNag = elapsed;
      popTextScreen(`SHIELDED — the ship needs ${3 - P.parts} more part${3 - P.parts === 1 ? '' : 's'}`);
    }
  }
}

// ---------------------------------------------------------- opening cutscene
const CUT_LINES = [
  { who: 'GALACTIC PATROL', text: 'SPLORT THE SLIPPERY! By order of the Galactic Patrol you are under arrest for 4,362 counts of grand larceny... and one (1) stolen moon.', dur: 6.0, cam: 'wide' },
  { who: 'GALACTIC PATROL', text: 'Put your tentacles where we can see them. Yes. BOTH of them.', dur: 4.2, cam: 'saucer' },
  { who: 'SPLORT', text: 'Heh... you’ll have to catch me first. There’s one ship left off this rock — and it’s got my name on it.', dur: 4.2, cam: 'hero' },
  { who: '', text: '\u{1F6A8} WANTED — LOSE THEM IN THE TREES!', dur: 1.5, cam: 'dive' },
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
  // park two saucers menacingly close for the scene
  const T = trees[0].top;
  pursuers[0].group.position.set(T.x + 12, T.y + 6, T.z + 32);
  pursuers[1].group.position.set(T.x - 14, T.y + 8, T.z + 29);
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
  const L = CUT_LINES[cut.line];
  const cam = cutCam(L.cam);
  cut.t = 0;
  cut.from = cam.from; cut.to = cam.to; cut.look = cam.look;
  cut.dur = L.dur;
  ui.cutSpeaker.textContent = L.who;
  ui.cutSpeaker.classList.toggle('hidden', !L.who);
  ui.cutText.classList.toggle('system', !L.who);
  ui.cutText.textContent = '';
  if (L.cam === 'dive') sfx.zip();
}

function endCutscene() {
  cut = null;
  if (cutBody) { cutBody.traverse((o) => o.geometry && o.geometry.dispose()); scene.remove(cutBody); cutBody = null; }
  ui.cutscene.classList.add('hidden');
  ui.crosshair.classList.remove('hidden');
  P.state = 'perched';
  P.heat = 70; // wanted from the very first breath
  yaw = 0; pitch = 0; // face north, into the grove
  ui.hint.textContent = '\u{1F6A8} WANTED — look with the mouse, SPACE to grapple away. Lose them, then find the GREEN beams.';
  ui.hint.classList.remove('hidden');
  setTimeout(() => ui.hint.classList.add('hidden'), 7000);
}

function updateCutscene(rdt) {
  if (!cut) return;
  cut.t += rdt;
  const L = CUT_LINES[cut.line];
  const k = Math.min(1, cut.t / cut.dur);
  const e = k * k * (3 - 2 * k);
  camera.position.lerpVectors(cut.from, cut.to, e);
  camera.lookAt(cut.look);
  const chars = Math.floor(cut.t * 42);
  ui.cutText.textContent = L.text.slice(0, chars);
  if (cut.t >= cut.dur + (L.cam === 'dive' ? 0 : 0.8)) nextCutLine();
}

function advanceCutscene() {
  if (!cut) return;
  const L = CUT_LINES[cut.line];
  if (ui.cutText.textContent.length < L.text.length) {
    cut.t = Math.max(cut.t, L.text.length / 42);
  } else {
    nextCutLine();
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

  if (P.state === 'perched') {
    // free look: push the mouse toward the screen edge (or A/D) to turn
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
    } else if (P.state === 'falling') {
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
  ui.score.textContent = P.score;
  ui.parts.textContent = P.parts + '/3';
  const stars = wantedStars();
  ui.wanted.textContent = stars > 0 ? '🚨' + '★'.repeat(stars) + '☆'.repeat(3 - stars) : '☆☆☆';
  ui.wanted.classList.toggle('hot', stars > 0);

  // quest line
  let q = '';
  if (P.state !== 'menu' && P.state !== 'cutscene') {
    if (shipSite.unlocked && P.state !== 'won') {
      q = `🛸 GET TO THE LAST SHIP — ${Math.round(P.pos.distanceTo(shipSite.pos))}m (gold beam)`;
    } else if (questState.some((s) => s === 'active')) {
      q = QUESTS.map((Q, i) => {
        if (questState[i] !== 'active') return null;
        let s = `${Q.title}: ${questProgress[i]}/${Q.count}`;
        if (i === 2) s += ` — ${Math.max(0, raceTimer).toFixed(0)}s`;
        return s;
      }).filter(Boolean).join('  ·  ');
    } else {
      const open = QUESTS.filter((_, i) => questState[i] === 'available').length;
      if (open > 0) q = `Find the villages (green beams) — ${open} quest${open > 1 ? 's' : ''} left, ${3 - P.parts} parts needed`;
    }
  }
  ui.quest.textContent = q;
  ui.quest.classList.toggle('hidden', !q);

  if (P.state === 'qte') {
    const frac = Math.max(0, P.qteTime / QTE_TIME);
    ui.qteRing.style.strokeDashoffset = String(283 * (1 - frac));
    ui.qteRing.style.stroke = frac > 0.4 ? '#4dffe1' : '#ff4fd8';
    ui.qteTime.textContent = Math.max(0, P.qteTime).toFixed(1);
  }
  const canPunch = !P.punchAnim && (P.state === 'qte' || P.state === 'zip' || P.state === 'perched' || P.state === 'cannonball') && pickPunchTarget();
  ui.crosshair.classList.toggle('lock', !!canPunch);
}

// ---------------------------------------------------------- reset / boot
function buildWorld() {
  scatterTrees();
  makeVillages();
  makePlatforms();
  makeStation();
  makeShipSite();
}

function softReset() {
  // player state only — the world persists for the whole run
  Object.assign(P, {
    state: 'perched', hp: 100, score: 0, punches: 0, hops: 0,
    currentTree: 0, targetTree: -1, chainTree: -1,
    qteNums: [], qteIdx: 0, qteTime: 0, qteTwin: false, cannonEarned: false, cannon: null,
    parts: 0, heat: 0, punchAnim: null, tumble: 0,
  });
  P.vel.set(0, 0, 0);
  P.pos.copy(trees[0].top).add(_v1.set(0, 1.5, 0));
  P.startTime = performance.now();
  ts = 1; tsTarget = 1; shake = 0; roll = 0;
  yaw = 0; pitch = 0;
  escapeTimer = 0;
  ui.qte.classList.add('hidden');
  ui.vignette.classList.remove('on');
  ui.overlay.classList.add('hidden');
  ui.crosshair.classList.remove('hidden');
}

function fullRestart() {
  // wipe quest state & world back to fresh (used by PLAY AGAIN)
  window.location.reload();
}

function startGame() {
  audioCtx();
  softReset();
  if (!cutsceneSeen) startCutscene();
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

    case 'falling': {
      P.vel.y -= 28 * wdt;
      P.pos.addScaledVector(P.vel, wdt);
      if (P.pos.y < 1.2) {
        burst(P.pos, MAT.spore, 14, 9, 9);
        sfx.splat();
        respawn('SPLAT!', (P.fallReason || '') + ' -25', 25, false);
      }
      break;
    }
  }

  // race timer
  if (questState[2] === 'active' && P.state !== 'cutscene' && P.state !== 'menu') {
    raceTimer -= rdt;
    if (raceTimer <= 0) failRace();
  }

  // perched target preview
  if (P.state === 'perched') {
    const ti = pickGrappleTarget();
    if (ti >= 0) {
      reticle.visible = true;
      const chain = pickChainTree(ti);
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

  // ambient life
  for (const p of platforms) p.group.position.y = p.baseY + Math.sin(elapsed * 1.2 + p.phase) * 0.5;
  for (const v of villagers) v.group.rotation.y = Math.sin(elapsed * 0.7 + v.phase) * 0.6;
  for (const v of villages) if (v.mark.parent) v.mark.position.y = v.pos.y + 2.1 + Math.sin(elapsed * 2.4) * 0.15;
  if (shipSite) {
    shipSite.ship.position.y = 26.6 + Math.sin(elapsed * 1.1) * 0.25;
    shipSite.lights.rotation.y = elapsed * 1.6;
    if (!shipSite.unlocked) shipSite.shield.material.opacity = 0.24 + Math.sin(elapsed * 2) * 0.08;
  }

  mist.position.x = camera.position.x;
  mist.position.z = camera.position.z;
  ground.position.x = camera.position.x;
  ground.position.z = camera.position.z;
  skyGroup.position.x = camera.position.x;
  skyGroup.position.z = camera.position.z;

  if (P.state !== 'menu' && P.state !== 'cutscene' && P.state !== 'won') {
    updateWanted(rdt);
    updateQuestPickups();
  }
  updateEnemies(wdt);
  updateProjectiles(wdt);
  updatePursuers(rdt);
  updateParticles(Math.max(wdt, rdt * 0.3));
  if (P.state !== 'menu' && P.state !== 'cutscene') updateCamera(rdt);
  const firstPerson = P.state === 'perched' || P.state === 'qte' || P.state === 'zip' || P.state === 'cannonball' || P.state === 'falling';
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
    if (dialog) closeDialog(true);
    else if (P.state === 'cutscene') advanceCutscene();
    else if (P.state === 'perched') leap();
    else if (P.state === 'won') fullRestart();
    else if (P.state === 'menu') startGame();
    return;
  }
  if (ev.code === 'KeyE' || ev.code === 'KeyF') { tryPunch(); return; }
  if (ev.code === 'Escape' && dialog) { closeDialog(false); return; }
});
window.addEventListener('keyup', (ev) => { keys[ev.code] = false; });

window.addEventListener('mousemove', (ev) => {
  mouse.x = (ev.clientX / window.innerWidth) * 2 - 1;
  mouse.y = (ev.clientY / window.innerHeight) * 2 - 1;
});

renderer.domElement.addEventListener('pointerdown', (ev) => {
  audioCtx();
  if (ev.button !== 0) return;
  if (dialog) { closeDialog(true); return; }
  if (P.state === 'cutscene') {
    advanceCutscene();
  } else if (P.state === 'perched') {
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

ui.playBtn.addEventListener('click', () => {
  if (P.state === 'won') fullRestart();
  else startGame();
});
ui.cutSkip.addEventListener('pointerdown', (ev) => {
  ev.stopPropagation();
  if (dialog) { closeDialog(true); return; }
  if (cut) endCutscene();
});

// ---------------------------------------------------------- boot
buildWorld();
P.pos.copy(trees[0].top).add(new THREE.Vector3(0, 1.5, 0));

// exposed for automated smoke tests
window.__game = P;
window.__debug = {
  P, trees, platforms, enemies, pursuers, villages, spores, rings,
  ship: () => shipSite, quests: () => ({ questState, questProgress, activeQuest, raceTimer }),
  acceptQuest, completeQuest, landOn, beginQTE, endCutscene: () => cut && endCutscene(),
  setHeat: (h) => { P.heat = h; },
};

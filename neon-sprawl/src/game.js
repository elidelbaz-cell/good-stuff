/* ============================================================
   NEON SPRAWL — pixel edition
   2D side-scrolling alien city. You are Splort the Slippery,
   the most wanted tentacle in the galaxy.

   - HOLD E: your tentacle latches onto a rooftop and you SWING
     on pendulum physics (Spider-Man style). Release to fly.
   - A/D run · SPACE jump · LEFT CLICK punch (zapper later).
   - Wanted stars + patrol saucers. Crime raises heat.
   - The full quest line: arrest cutscene -> disguise from the
     Mask Maker -> earn Old Zeb's zapper -> Rusty's scrap run ->
     Pia fixes the rocket -> fuel heist -> LAUNCH.
   Rendered as chunky pixels on a 480x270 canvas.
   ============================================================ */

// ---------------------------------------------------------- canvas
const VW = 480, VH = 270;
const canvas = document.getElementById('game');
canvas.width = VW; canvas.height = VH;
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

function fitCanvas() {
  const s = Math.max(1, Math.floor(Math.min(window.innerWidth / VW, window.innerHeight / VH)));
  canvas.style.width = VW * s + 'px';
  canvas.style.height = VH * s + 'px';
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

// ---------------------------------------------------------- dom
const $ = (id) => document.getElementById(id);
const ui = {
  hp: $('hpbar'), wanted: $('stat-wanted'), score: $('stat-score'), best: $('stat-best'),
  questTitle: $('quest-title'), questObj: $('quest-obj'), questBar: $('questbar'), questArrow: $('quest-arrow'),
  hint: $('hint'), pops: $('pops'), flash: $('flash'),
  overlay: $('overlay'), oTitle: $('o-title'), oSub: $('o-sub'), oControls: $('o-controls'), playBtn: $('playbtn'),
  cutscene: $('cutscene'), cutSpeaker: $('cut-speaker'), cutText: $('cut-text'), cutSkip: $('cut-skip'),
};

// ---------------------------------------------------------- sfx
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
function zap(dur = 0.3, vol = 0.15) {
  const a = audioCtx(); if (!a) return;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource(); src.buffer = buf;
  const g = a.createGain(); g.gain.value = vol;
  src.connect(g); g.connect(a.destination); src.start();
}
const sfx = {
  attach: () => { zap(0.12, 0.1); tone(500, 0.12, 'sine', 0.1, 900); },
  release: () => tone(700, 0.12, 'sine', 0.07, 400),
  jump: () => tone(280, 0.12, 'square', 0.08, 460),
  land: () => tone(180, 0.08, 'triangle', 0.1, 120),
  pow: () => { tone(110, 0.15, 'square', 0.2, 60); zap(0.1, 0.12); },
  pew: () => tone(1100, 0.1, 'sawtooth', 0.09, 300),
  shot: () => tone(1500, 0.07, 'square', 0.05, 500),
  hurt: () => tone(220, 0.18, 'sawtooth', 0.16, 110),
  pickup: () => { tone(880, 0.08, 'square', 0.1); setTimeout(() => tone(1320, 0.12, 'square', 0.09), 70); },
  quest: () => { tone(523, 0.1, 'square', 0.1); setTimeout(() => tone(659, 0.1, 'square', 0.1), 100); setTimeout(() => tone(880, 0.2, 'square', 0.1), 200); },
  talk: () => tone(440, 0.05, 'square', 0.07, 520),
  siren: () => { tone(620, 0.25, 'square', 0.07, 880); setTimeout(() => tone(880, 0.25, 'square', 0.07, 620), 260); },
  win: () => { tone(523, 0.14, 'square', 0.11); setTimeout(() => tone(659, 0.14, 'square', 0.11), 120); setTimeout(() => tone(784, 0.25, 'square', 0.11), 240); setTimeout(() => tone(1047, 0.4, 'square', 0.11), 400); },
  rocket: () => zap(1.6, 0.3),
};

// ---------------------------------------------------------- helpers
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
function popTextScreen(text) {
  const stacked = ui.pops.querySelectorAll('.pop.sys').length;
  const el = document.createElement('div');
  el.className = 'pop sys';
  el.textContent = text;
  el.style.left = '50%';
  el.style.top = (30 + stacked * 8) + '%';
  ui.pops.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
function popAt(wx, wy, text, cls) {
  const el = document.createElement('div');
  el.className = 'pop ' + (cls || '');
  el.textContent = text;
  const r = canvas.getBoundingClientRect();
  el.style.left = (r.left + (wx - cam.x) / VW * r.width) + 'px';
  el.style.top = (r.top + (wy - cam.y) / VH * r.height) + 'px';
  ui.pops.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

// ---------------------------------------------------------- pixel sprites
function spr(rows, map) {
  const h = rows.length, w = rows[0].length;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === '.' || ch === ' ') continue;
      g.fillStyle = map[ch];
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}
function flip(c) {
  const f = document.createElement('canvas');
  f.width = c.width; f.height = c.height;
  const g = f.getContext('2d');
  g.translate(c.width, 0); g.scale(-1, 1);
  g.drawImage(c, 0, 0);
  return f;
}

const SPLORT_MAP = { P: '#8a5fe0', D: '#6a43b8', W: '#ffffff', B: '#14092a', M: '#e8d8c0' };
const splortBody = spr([
  '..PPPP..',
  '.PPPPPP.',
  'PPWBPPWB',
  'PPWBPPWB',
  'PPPPPPPP',
  '.PPPPPP.',
  '.PDPPDP.',
  '.PP..PP.',
], SPLORT_MAP);
const splortBodyL = flip(splortBody);
const splortMasked = spr([
  '..PPPP..',
  '.PPPPPP.',
  'PMMBPMMB',
  'PMMBPMMB',
  'PPMMMMPP',
  '.PPPPPP.',
  '.PDPPDP.',
  '.PP..PP.',
], SPLORT_MAP);
const splortMaskedL = flip(splortMasked);

function personSprite(shirt, skin) {
  return spr([
    '..SS..',
    '.SSSS.',
    '.SBSB.',
    '.SSSS.',
    'CCCCCC',
    '.CCCC.',
    '.CCCC.',
    '.C..C.',
  ], { S: skin, B: '#140a20', C: shirt });
}
const pedSprites = [
  personSprite('#3a7a5f', '#8de85c'),
  personSprite('#7a3a6f', '#5cc8e8'),
  personSprite('#3a5f7a', '#e85c9a'),
  personSprite('#8a6a2a', '#d0b32a'),
];
const goonSprite = spr([
  '..SS..',
  '.SSSS.',
  '.SBSB.',
  '.SSSS.',
  'CCCCCC',
  'GCCCC.',
  'GCCCC.',
  '.C..C.',
], { S: '#8de85c', B: '#140a20', C: '#3a3a4d', G: '#101018' });
const goonSpriteL = flip(goonSprite);
const npcSprites = {
  mask: spr(['..SS..', '.SMMS.', '.SMMS.', '.SSSS.', 'CCCCCC', '.CCCC.', '.CCCC.', '.C..C.'], { S: '#5cc8e8', M: '#f0e8d8', C: '#6a4fd0' }),
  zeb: spr(['.HHHH.', '..SS..', '.SBSB.', '.SSSS.', 'CCCCCC', '.CCCC.', '.CCCC.', '.C..C.'], { S: '#8de85c', B: '#140a20', C: '#b8762a', H: '#3c2a18' }),
  rusty: spr(['.HHHH.', '..SS..', '.SBSB.', '.SSSS.', 'CCCCCC', '.CCCC.', '.CCCC.', '.C..C.'], { S: '#d0b32a', B: '#140a20', C: '#8a6a2a', H: '#4a4a5a' }),
  pia: spr(['..RR..', '..SS..', '.SBSB.', '.SSSS.', 'CCCCCC', 'WCCCC.', '.CCCC.', '.C..C.'], { S: '#e85c9a', B: '#140a20', C: '#d04f4f', R: '#a03030', W: '#c8d2e8' }),
};
const saucerA = spr([
  '...DDDD...',
  '..DGGGGD..',
  'HHHHHHHHHH',
  'RHHHHHHHHB',
  '..H....H..',
], { D: '#7ef2dd', G: '#2a4a5a', H: '#8a93b8', R: '#ff3b3b', B: '#3b8cff' });
const saucerB = spr([
  '...DDDD...',
  '..DGGGGD..',
  'HHHHHHHHHH',
  'BHHHHHHHHR',
  '..H....H..',
], { D: '#7ef2dd', G: '#2a4a5a', H: '#8a93b8', R: '#ff3b3b', B: '#3b8cff' });
const rocketSpr = spr([
  '....RR....',
  '...RRRR...',
  '..RRRRRR..',
  '..WWWWWW..',
  '..WWDDWW..',
  '..WWDDWW..',
  '..WWWWWW..',
  '..WWWWWW..',
  '..WWWWWW..',
  '..WWWWWW..',
  '.FWWWWWWF.',
  'FFWWWWWWFF',
  'FF.WWWW.FF',
], { R: '#d04f4f', W: '#c8d2e8', D: '#7ef2dd', F: '#d04f4f' });
const scrapSpr = spr(['.CC.', 'C..C', 'C..C', '.CC.'], { C: '#6af2e0' });
const fuelSpr = spr(['.YY.', 'YYYY', 'YYYY', 'YYYY', '.YY.'], { Y: '#ffe14d' });

// ---------------------------------------------------------- world
const WORLD_W = 6400;
const GROUND = 244;
const NEON = ['#2ae8d8', '#e83fd0', '#5fe86a', '#ff9a3f', '#3f8cff', '#ffe14d'];
const buildings = []; // { x, w, top, neon, sign, seed }
const anchors = [];   // swing points: { x, y }

const L = {
  spawn: { x: 300 },
  hideout: { x: 480 },
  mask: { x: 1050 },
  hunter: { x: 1750 },
  camp: { x: 2250 },
  dealer: { x: 3000 },
  depot: { x: 4400 },
  rocket: { x: 5700 },
};
const RESERVED = [L.hideout.x, L.mask.x, L.hunter.x, L.camp.x, L.dealer.x, L.rocket.x, L.depot.x];

function addBuilding(x, w, h, opts = {}) {
  const top = GROUND - h;
  const b = { x, w, top, neon: opts.neon || NEON[Math.floor(Math.random() * NEON.length)], sign: opts.sign || null, seed: Math.random() * 1000 };
  buildings.push(b);
  anchors.push({ x: x + 2, y: top }, { x: x + w - 2, y: top });
  if (w > 60) anchors.push({ x: x + w / 2, y: top });
  return b;
}

function buildCity() {
  let x = 60;
  while (x < WORLD_W - 200) {
    const nearReserved = RESERVED.some((r) => Math.abs(r - (x + 30)) < 110);
    if (nearReserved) { x += 40; continue; }
    const w = rand(44, 92);
    const h = rand(60, 175);
    addBuilding(x, w, h);
    x += w + rand(18, 55);
  }
  // hideout tower (tall, magenta) — the cutscene rooftop
  addBuilding(L.hideout.x - 34, 68, 185, { neon: '#e83fd0' });
  // quest venues: low storefronts so you can walk in off the street
  addBuilding(L.mask.x - 40, 80, 46, { neon: '#e83fd0', sign: 'mask' });
  addBuilding(L.hunter.x - 40, 80, 52, { neon: '#ff9a3f', sign: 'zeb' });
  addBuilding(L.dealer.x - 45, 90, 44, { neon: '#ffe14d', sign: 'rusty' });
  addBuilding(L.depot.x - 60, 120, 64, { neon: '#ff3b3b', sign: 'depot' });
  buildings.sort((a, b2) => a.x - b2.x);
}

function groundAtX(px, py) {
  // highest walkable surface at x that is at-or-below py (feet)
  let g = GROUND;
  for (const b of buildings) {
    if (px >= b.x && px <= b.x + b.w && b.top >= py - 0.01 && b.top < g) g = b.top;
  }
  return g;
}
function buildingAt(px, py) {
  for (const b of buildings) {
    if (px >= b.x && px <= b.x + b.w && py > b.top) return b;
  }
  return null;
}

// ---------------------------------------------------------- entities
const peds = [];
const goons = [];
const saucers = [];
const bullets = [];
const bolts = [];
const scraps = [];
const parts = [];
const cars = [];
let fuelCell = null;
let rocketState = { x: L.rocket.x, launched: false, ry: 0 };
const npcs = [];

function spawnPed(x) {
  peds.push({ x, y: GROUND, dir: Math.random() < 0.5 ? 1 : -1, spr: pedSprites[Math.floor(Math.random() * pedSprites.length)], dead: false, removed: false, vx: 0, vy: 0, rot: 0, panic: 0, t: Math.random() * 9 });
}
function spawnGoon(x, flags) {
  goons.push({ x, y: GROUND, dir: -1, dead: false, removed: false, vx: 0, vy: 0, rot: 0, cd: rand(1, 2.5), ...flags });
}
function burst(x, y, color, n = 8, sp = 60) {
  for (let i = 0; i < n; i++) {
    parts.push({ x, y, vx: rand(-sp, sp), vy: rand(-sp * 1.4, -10), life: rand(0.3, 0.7), color });
  }
}

function buildEntities() {
  for (let i = 0; i < 26; i++) spawnPed(rand(150, WORLD_W - 300));
  for (let k = 0; k < 4; k++) spawnGoon(L.camp.x - 40 + k * 26, { goon: true });
  // depot guards flank the (solid) depot building on the sidewalk
  for (let k = 0; k < 5; k++) {
    spawnGoon(k < 3 ? L.depot.x + 68 + k * 14 : L.depot.x - 68 - (k - 3) * 14, { guard: true });
  }
  for (let k = 0; k < 3; k++) {
    saucers.push({ x: L.depot.x - 30 + k * 30, y: 60, homeX: L.depot.x - 30 + k * 30, homeY: 60, active: false, cd: rand(1, 3), phase: Math.random() * 6, hp: 3 });
  }
  for (let i = 0; i < 9; i++) {
    cars.push({ x: rand(0, WORLD_W), y: GROUND - rand(46, 90), v: rand(30, 70) * (Math.random() < 0.5 ? 1 : -1), c: NEON[Math.floor(Math.random() * NEON.length)], w: rand(14, 22) });
  }
  fuelCell = { x: L.depot.x, y: GROUND - 70, taken: false }; // on the depot roof
  // quest folk stand on the sidewalk beside their shops (the shops are solid)
  npcs.push({ x: L.mask.x + 48, name: 'THE MASK MAKER', spr: npcSprites.mask, talk: talkMaskMaker });
  npcs.push({ x: L.hunter.x + 48, name: 'OLD ZEB', spr: npcSprites.zeb, talk: talkHunter });
  npcs.push({ x: L.dealer.x + 53, name: 'RUSTY', spr: npcSprites.rusty, talk: talkDealer });
  npcs.push({ x: L.rocket.x - 30, name: 'PIA', spr: npcSprites.pia, talk: talkMechanic });
}

// ---------------------------------------------------------- player
const P = {
  x: 300, y: GROUND, vx: 0, vy: 0,
  onGround: true, facing: 1,
  hp: 100, heat: 0, score: 0, punches: 0,
  state: 'menu', // menu | cutscene | play | won
};
let swing = null; // { ax, ay, len }
let elapsed = 0;
let escapeTimer = 0, lastSiren = -10;
let shakeT = 0;
let punchAnimT = 0;
let best = 0;
try { best = parseInt(localStorage.getItem('ns_best') || '0', 10) || 0; } catch (e) {}
ui.best.textContent = best;

const keys = {};
const mouse = { x: VW / 2, y: VH / 2 };
const cam = { x: 0, y: 0 };

// ---------------------------------------------------------- quest chain
const CHAIN = [
  { t: 'BLEND IN', o: 'Find the Mask Maker and get a disguise', tx: () => L.mask.x },
  { t: 'GET A WEAPON', o: 'Visit Old Zeb at the pawn shop', tx: () => L.hunter.x },
  { t: 'ALLEY CLEANOUT', o: 'Punch the goons in the alley', n: 4, tx: () => L.camp.x },
  { t: 'CLAIM YOUR ZAPPER', o: 'Return to Old Zeb', tx: () => L.hunter.x },
  { t: 'ROCKET RUMORS', o: 'Ask Rusty at the scrapyard about the rocket', tx: () => L.dealer.x },
  { t: 'SCRAP RUN', o: 'Collect scrap — two are on ROOFTOPS, swing up!', n: 4, tx: () => nearestScrapX() },
  { t: 'THE MECHANIC', o: 'Bring the scrap to Pia at the launch pad', tx: () => L.rocket.x },
  { t: 'FUEL HEIST', o: 'Steal the fuel cell from the patrol depot roof', tx: () => L.depot.x },
  { t: 'LAUNCH!', o: 'Swing back to the rocket — GO GO GO', tx: () => L.rocket.x },
];
let chainIdx = 0, questN = 0;
let disguised = false, hasGun = false, hasFuel = false, alarm = false;

function nearestScrapX() {
  let bx = L.dealer.x, bd = Infinity;
  for (const s of scraps) {
    if (s.taken) continue;
    const d = Math.abs(s.x - P.x);
    if (d < bd) { bd = d; bx = s.x; }
  }
  return bx;
}
function advanceChain() {
  chainIdx++;
  questN = 0;
  sfx.quest();
  if (chainIdx < CHAIN.length) popTextScreen('NEW QUEST: ' + CHAIN[chainIdx].t);
  if (chainIdx === 5) spawnScraps();
}
function clearStreetX(fromX, dir) {
  // walk along the street until we're not inside a building
  let x = fromX;
  for (let i = 0; i < 200; i++) {
    if (!buildingAt(x, GROUND - 2)) return clamp(x, 40, WORLD_W - 40);
    x += dir * 10;
  }
  return fromX;
}
function spawnScraps() {
  // two rooftop, two street — near the scrapyard
  const roofs = buildings.filter((b) => Math.abs(b.x - L.dealer.x) < 700 && b.top < GROUND - 80).slice(0, 2);
  for (const b of roofs) scraps.push({ x: b.x + b.w / 2, y: b.top - 6, taken: false });
  scraps.push({ x: clearStreetX(L.dealer.x + 260, 1), y: GROUND - 6, taken: false });
  scraps.push({ x: clearStreetX(L.dealer.x - 320, -1), y: GROUND - 6, taken: false });
  while (scraps.length < 4) scraps.push({ x: clearStreetX(L.dealer.x + rand(-400, 400), 1), y: GROUND - 6, taken: false });
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
  } else openDialog([{ who: 'THE MASK MAKER', text: 'Nice face, stranger. Wink.' }]);
}
function talkHunter() {
  if (chainIdx === 1) {
    openDialog([
      { who: 'OLD ZEB', text: 'A zapper? Zappers ain’t free, masked stranger.' },
      { who: 'OLD ZEB', text: 'Goons set up camp in the alley east of here. Knock four of them over, and we’ll talk hardware.' },
    ], () => advanceChain());
  } else if (chainIdx === 3) {
    openDialog([
      { who: 'OLD ZEB', text: 'HA! I watched the third one bounce. A deal’s a deal —' },
      { who: 'OLD ZEB', text: 'One ZAPPER. Slightly chewed. LEFT CLICK to fire. Try not to point it at me.' },
    ], () => {
      hasGun = true;
      popTextScreen('ZAPPER ACQUIRED — LEFT CLICK now shoots');
      advanceChain();
    });
  } else if (chainIdx === 2) {
    openDialog([{ who: 'OLD ZEB', text: `Four goons. You’ve tipped ${questN}. Get on with it.` }]);
  } else openDialog([{ who: 'OLD ZEB', text: 'A rocket, eh? Rusty at the scrapyard knows every bolt in this city.' }]);
}
function talkDealer() {
  if (chainIdx === 4) {
    openDialog([
      { who: 'RUSTY', text: 'A rocket? There’s ONE. The old mail rocket on the east pad. Crooked as my back but she’ll fly.' },
      { who: 'RUSTY', text: 'Bring me 4 pieces of good scrap and I’ll send the parts to Pia. Check the CYAN glints — two are up on the towers.' },
    ], () => advanceChain());
  } else if (chainIdx === 5) {
    openDialog([{ who: 'RUSTY', text: `Scrap count: ${questN}/4. The rooftop ones are the good stuff. You DO know how to swing, right?` }]);
  } else openDialog([{ who: 'RUSTY', text: 'No refunds.' }]);
}
function talkMechanic() {
  if (chainIdx === 6) {
    openDialog([
      { who: 'PIA', text: 'Rusty’s scrap came through. Give me a second—' },
      { who: 'PIA', text: '*clang* *clang* ...Done. One problem: the tank is DRY.' },
      { who: 'PIA', text: 'The patrol depot keeps a fuel cell on its roof. Steal it. This is where your day gets LOUD.' },
    ], () => advanceChain());
  } else if (chainIdx === 7) {
    openDialog([{ who: 'PIA', text: 'Fuel cell. Depot roof. Loud. You know the plan.' }]);
  } else if (chainIdx === 8) {
    openDialog([{ who: 'PIA', text: 'GET IN THE ROCKET!' }]);
  } else openDialog([{ who: 'PIA', text: 'I fix things. It’s a living.' }]);
}

// ---------------------------------------------------------- dialogue
let dlg = null, talkCd = 0;
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
  } else { sfx.talk(); showDlgLine(); }
}

// ---------------------------------------------------------- swing mechanics
function findAnchor() {
  // aim from player toward the mouse; pick the best anchor point above
  const px = P.x, py = P.y - 8;
  const mx = cam.x + mouse.x, my = cam.y + mouse.y;
  let adx = mx - px, ady = my - py;
  const al = Math.hypot(adx, ady) || 1;
  adx /= al; ady /= al;
  if (ady > 0.5) { adx = P.facing; ady = -0.8; } // aiming at the floor? swing up-forward instead
  let bestA = null, bs = 0.2;
  for (const a of anchors) {
    const dx = a.x - px, dy = a.y - py;
    const d = Math.hypot(dx, dy);
    if (d < 24 || d > 190) continue;
    if (a.y > py + 60) continue; // roughly level or above — you can dive-swing off a tall roof
    const align = (dx * adx + dy * ady) / d;
    const score = align * 1.4 - d * 0.002 + (py - a.y) * 0.002;
    if (align > 0.1 && score > bs) { bs = score; bestA = a; }
  }
  return bestA;
}
function startSwing() {
  const a = findAnchor();
  if (!a) { sfx.release(); return false; }
  const d = Math.hypot(a.x - P.x, a.y - (P.y - 8));
  swing = { ax: a.x, ay: a.y, len: Math.max(20, Math.min(d * 0.97, 175)) };
  if (P.onGround) { P.vy = Math.min(P.vy, -60); P.onGround = false; }
  sfx.attach();
  return true;
}
function endSwing(silent) {
  swing = null;
  if (!silent) sfx.release();
}

// ---------------------------------------------------------- combat
function punchables() {
  const list = [];
  for (const g of goons) if (!g.dead && !g.removed) list.push({ kind: g.guard ? 'guard' : 'goon', e: g });
  for (const p of peds) if (!p.dead && !p.removed) list.push({ kind: 'ped', e: p });
  return list;
}
function knock(t, label, dirX) {
  const e = t.e;
  e.dead = true;
  e.vx = dirX * rand(120, 180);
  e.vy = -rand(120, 200);
  e.rot = dirX * rand(6, 10);
  P.punches++;
  burst(e.x, e.y - 6, '#ff4fd8', 8, 90);
  sfx.pow();
  shakeT = 0.18;
  if (t.kind === 'ped') {
    P.heat = Math.min(100, P.heat + 30);
    popAt(e.x, e.y - 16, 'ASSAULT! 🚨', 'pow');
  } else {
    P.score += 25;
    P.hp = Math.min(100, P.hp + 8);
    if (t.kind === 'guard') P.heat = Math.min(100, P.heat + 26);
    popAt(e.x, e.y - 16, label, 'pow');
    if (chainIdx === 2 && t.kind === 'goon') {
      questN++;
      popTextScreen(`GOONS TIPPED: ${questN}/4`);
      if (questN >= 4) { advanceChain(); popTextScreen('Return to OLD ZEB for your zapper'); }
    }
  }
}
function punch() {
  let hitAny = false;
  for (const t of punchables()) {
    const e = t.e;
    const dx = e.x - P.x, dy = (e.y - 6) - (P.y - 6);
    if (Math.abs(dy) > 18) continue;
    if (dx * P.facing < -4 || Math.abs(dx) > 26) continue;
    knock(t, 'POW!', P.facing);
    hitAny = true;
    break;
  }
  if (!hitAny) sfx.release();
  punchAnimT = 0.18;
}
function fireZapper() {
  const mx = cam.x + mouse.x, my = cam.y + mouse.y;
  let dx = mx - P.x, dy = my - (P.y - 8);
  const l = Math.hypot(dx, dy) || 1;
  bolts.push({ x: P.x + (dx / l) * 8, y: P.y - 8 + (dy / l) * 8, vx: dx / l * 320, vy: dy / l * 320, life: 1.2 });
  sfx.pew();
  punchAnimT = 0.15;
}

// ---------------------------------------------------------- wanted
function wantedStars() { return P.heat <= 0 ? 0 : Math.min(3, 1 + Math.floor(P.heat / 34)); }
function updateWanted(dt) {
  const stars = wantedStars();
  let active = 0;
  for (const s of saucers) {
    if (s.hp <= 0) { s.active = false; continue; }
    s.active = active < stars;
    if (s.active) active++;
  }
  if (!alarm) {
    const floor = disguised ? 0 : 40;
    let nearest = Infinity;
    for (const s of saucers) if (s.active) nearest = Math.min(nearest, Math.abs(s.x - P.x));
    if (nearest > 260) {
      escapeTimer += dt;
      if (escapeTimer > 4 && P.heat > floor) {
        P.heat = Math.max(floor, P.heat - 8 * dt);
        if (P.heat === floor && floor === 0) popTextScreen('🚨 Heat: cold.');
      }
    } else escapeTimer = 0;
  }
}
function busted() {
  sfx.siren();
  respawn('BUSTED! Fined and dumped at the plaza. -100', 100);
}
function respawn(msg, fine) {
  P.score = Math.max(0, P.score - fine);
  P.hp = 100;
  P.x = L.spawn.x; P.y = GROUND;
  P.vx = 0; P.vy = 0;
  P.onGround = true;
  endSwing(true);
  P.heat = alarm ? 100 : (disguised ? 0 : 40);
  for (const s of saucers) { s.x = s.homeX; s.y = s.homeY; }
  escapeTimer = 0;
  popTextScreen(msg);
  shakeT = 0.4;
}
function damage(n, src) {
  if (P.state !== 'play') return;
  P.hp -= n;
  sfx.hurt();
  shakeT = 0.25;
  ui.flash.classList.remove('on');
  void ui.flash.offsetWidth;
  ui.flash.classList.add('on');
  if (P.hp <= 0) respawn(`KNOCKED OUT by ${src}! You wake up at the plaza. -50`, 50);
}

// ---------------------------------------------------------- updates
function updatePlayer(dt) {
  const left = keys['KeyA'] || keys['ArrowLeft'];
  const right = keys['KeyD'] || keys['ArrowRight'];
  const acc = P.onGround ? 900 : 320;
  const maxV = 110;
  if (!dlg) {
    if (left) { P.vx = Math.max(-maxV, P.vx - acc * dt); P.facing = -1; }
    if (right) { P.vx = Math.min(maxV, P.vx + acc * dt); P.facing = 1; }
  }
  if (!left && !right && P.onGround && !swing) P.vx *= Math.max(0, 1 - 10 * dt);

  const prevY = P.y;
  if (swing) {
    P.vy += 620 * dt;
    if (left) P.vx -= 260 * dt;
    if (right) P.vx += 260 * dt;
    P.x += P.vx * dt; P.y += P.vy * dt;
    const dx = P.x - swing.ax, dy = (P.y - 8) - swing.ay;
    const d = Math.hypot(dx, dy);
    if (d > swing.len) {
      const nx = dx / d, ny = dy / d;
      P.x = swing.ax + nx * swing.len;
      P.y = swing.ay + ny * swing.len + 8;
      const radial = P.vx * nx + P.vy * ny;
      if (radial > 0) { P.vx -= radial * nx; P.vy -= radial * ny; }
    }
    P.vx *= (1 - 0.12 * dt);
  } else {
    P.vy += 620 * dt;
    P.x += P.vx * dt;
    P.y += P.vy * dt;
  }
  P.x = clamp(P.x, 8, WORLD_W - 8);
  if (P.y < 14) { P.y = 14; P.vy = Math.max(P.vy, 0); }

  // building side collision (only when clearly below the roof)
  const b = buildingAt(P.x, P.y - 2);
  if (b && P.y - 2 > b.top + 4) {
    if (P.x < b.x + b.w / 2) { P.x = b.x - 0.5; if (P.vx > 0) P.vx = 0; }
    else { P.x = b.x + b.w + 0.5; if (P.vx < 0) P.vx = 0; }
  }
  // landing: use the pre-move feet position so fast falls can't tunnel through roofs
  const g = groundAtX(P.x, prevY);
  const wasAir = !P.onGround;
  if (P.vy >= 0 && prevY <= g + 0.5 && P.y >= g) {
    const impact = P.vy;
    P.y = g;
    P.vy = 0;
    P.onGround = true;
    if (swing) endSwing(true);
    if (wasAir) {
      sfx.land();
      if (impact > 540) damage(Math.floor((impact - 500) / 14), 'the pavement');
    }
  }
  // walked off an edge?
  if (P.onGround) {
    const under = groundAtX(P.x, P.y);
    if (under > P.y + 1) P.onGround = false;
  }
}

function updateNPCsAndTalk() {
  if (P.state !== 'play' || dlg || elapsed < talkCd) return;
  if (!P.onGround || Math.abs(P.y - GROUND) > 4) return;
  for (const n of npcs) {
    if (Math.abs(n.x - P.x) < 14) { n.talk(); break; }
  }
}

function updatePeds(dt) {
  for (const p of peds) {
    if (p.removed) continue;
    if (p.dead) {
      p.vy += 620 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += dt * 10;
      if (p.y > GROUND + 60) p.removed = true;
      continue;
    }
    const near = Math.abs(p.x - P.x) < 60 && wantedStars() > 0;
    if (near) p.panic = 1.5;
    if (p.panic > 0) {
      p.panic -= dt;
      p.dir = p.x < P.x ? -1 : 1;
      p.x += p.dir * 55 * dt;
    } else {
      p.t -= dt;
      if (p.t <= 0) { p.t = rand(2, 6); p.dir = Math.random() < 0.5 ? -1 : 1; }
      p.x += p.dir * 18 * dt;
    }
    p.x = clamp(p.x, 20, WORLD_W - 20);
  }
}

function updateGoons(dt) {
  for (const g of goons) {
    if (g.removed) continue;
    if (g.dead) {
      g.vy += 620 * dt;
      g.x += g.vx * dt; g.y += g.vy * dt;
      g.rot += dt * 10;
      if (g.y > GROUND + 60) g.removed = true;
      continue;
    }
    const hostile = g.guard || chainIdx >= 2;
    const d = Math.abs(g.x - P.x);
    g.dir = P.x < g.x ? -1 : 1;
    if (!hostile || d > 200 || Math.abs(P.y - g.y) > 90) continue;
    g.cd -= dt;
    if (g.cd <= 0) {
      g.cd = rand(1.3, 2.4);
      const dx = P.x - g.x, dy = (P.y - 8) - (g.y - 6);
      const l = Math.hypot(dx, dy) || 1;
      bullets.push({ x: g.x, y: g.y - 6, vx: dx / l * 190, vy: dy / l * 190 - 8, life: 2 });
      sfx.shot();
    }
  }
}

function updateSaucers(dt) {
  let minD = Infinity;
  for (const s of saucers) {
    if (s.hp <= 0) {
      s.y += 120 * dt;
      if (s.y > GROUND - 4) s.y = GROUND - 4;
      s.respawnT = (s.respawnT || 12) - dt;
      if (s.respawnT <= 0) { s.hp = 3; s.respawnT = 12; s.x = s.homeX; s.y = s.homeY; }
      continue;
    }
    if (s.active && P.state === 'play') {
      const tx = P.x, ty = Math.min(P.y - 30, GROUND - 40);
      const dx = tx - s.x, dy = ty - s.y;
      const d = Math.hypot(dx, dy) || 1;
      minD = Math.min(minD, Math.hypot(P.x - s.x, P.y - s.y));
      const sp = 52;
      s.x += dx / d * sp * dt;
      s.y += dy / d * sp * dt + Math.sin(elapsed * 3 + s.phase) * 6 * dt;
      if (Math.hypot(P.x - s.x, (P.y - 8) - s.y) < 16) { busted(); return; }
      s.cd -= dt;
      if (s.cd <= 0 && d < 240) {
        s.cd = rand(1.8, 3);
        const bx = P.x - s.x, by = (P.y - 8) - s.y;
        const bl = Math.hypot(bx, by) || 1;
        bullets.push({ x: s.x, y: s.y + 3, vx: bx / bl * 200, vy: by / bl * 200, life: 2.2 });
        sfx.shot();
      }
    } else {
      const dx = s.homeX - s.x, dy = s.homeY - s.y;
      const d = Math.hypot(dx, dy);
      if (d > 2) { s.x += dx / d * 40 * dt; s.y += dy / d * 40 * dt; }
      s.y += Math.sin(elapsed * 2 + s.phase) * 4 * dt;
    }
  }
  if (isFinite(minD) && minD < 120 && elapsed - lastSiren > 1.8) { lastSiren = elapsed; sfx.siren(); }
}

function updateProjectiles(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (P.state === 'play' && Math.abs(b.x - P.x) < 5 && Math.abs(b.y - (P.y - 7)) < 8) {
      damage(12, 'patrol fire');
      burst(b.x, b.y, '#ff4fd8', 5, 60);
      b.life = 0;
    }
    if (b.life <= 0) bullets.splice(i, 1);
  }
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let hit = false;
    for (const t of punchables()) {
      const e = t.e;
      if (Math.abs(e.x - b.x) < 6 && Math.abs((e.y - 6) - b.y) < 9) {
        knock(t, 'ZAP!', Math.sign(b.vx) || 1);
        burst(e.x, e.y - 6, '#4dffe1', 8, 80);
        hit = true;
        break;
      }
    }
    if (!hit) {
      for (const s of saucers) {
        if (s.hp <= 0) continue;
        if (Math.abs(s.x - b.x) < 8 && Math.abs(s.y - b.y) < 6) {
          s.hp--;
          burst(b.x, b.y, '#4dffe1', 6, 70);
          sfx.pow();
          if (s.hp <= 0) { P.score += 50; popAt(s.x, s.y - 10, 'SAUCER DOWN!', 'pow'); }
          hit = true;
          break;
        }
      }
    }
    if (hit || b.life <= 0) bolts.splice(i, 1);
  }
}

function updateQuestStuff(dt) {
  if (chainIdx === 5) {
    for (const s of scraps) {
      if (s.taken) continue;
      if (Math.abs(s.x - P.x) < 10 && Math.abs(s.y - (P.y - 6)) < 14) {
        s.taken = true;
        questN++;
        P.score += 15;
        burst(s.x, s.y, '#6af2e0', 8, 70);
        sfx.pickup();
        popTextScreen(`SCRAP: ${questN}/4`);
        if (questN >= 4) advanceChain();
      }
    }
  }
  if (chainIdx === 7 && !alarm && Math.abs(P.x - L.depot.x) < 140) {
    alarm = true;
    P.heat = 100;
    sfx.siren();
    popTextScreen('🚨 DEPOT ALARM — GRAB THE CELL AND RUN!');
  }
  if (chainIdx === 7 && fuelCell && !fuelCell.taken &&
      Math.abs(fuelCell.x - P.x) < 12 && Math.abs(fuelCell.y - (P.y - 6)) < 14) {
    fuelCell.taken = true;
    hasFuel = true;
    sfx.pickup();
    advanceChain();
  }
  if (chainIdx === 8 && Math.abs(P.x - L.rocket.x) < 20 && P.y > GROUND - 8 && !rocketState.launched) {
    alarm = false;
    winGame();
  }
  if (rocketState.launched) {
    rocketState.ry += (30 + rocketState.ry * 1.6) * dt;
    if (Math.random() < 0.6) burst(rocketState.x, GROUND - rocketState.ry, '#ff9a3f', 3, 50);
  }
}

function winGame() {
  P.state = 'won';
  P.score += 500;
  rocketState.launched = true;
  endSwing(true);
  sfx.rocket();
  setTimeout(() => sfx.win(), 900);
  if (P.score > best) {
    best = P.score;
    try { localStorage.setItem('ns_best', String(best)); } catch (e) {}
  }
  ui.best.textContent = best;
  setTimeout(() => {
    ui.oTitle.textContent = '🚀 BLAST OFF!';
    ui.oSub.innerHTML = `The old mail rocket coughs, shudders — and LEAVES. Splort the Slippery escapes again.<br><b>${P.score}</b> score (best ${best}) · <b>${P.punches}</b> KOs`;
    ui.oControls.classList.add('hidden');
    ui.playBtn.textContent = 'PLAY AGAIN';
    ui.overlay.classList.remove('hidden');
  }, 2400);
}

function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.vy += 300 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (p.life <= 0) parts.splice(i, 1);
  }
}

// ---------------------------------------------------------- cutscene
const CUT_LINES = [
  { who: 'GALACTIC PATROL', text: 'SPLORT THE SLIPPERY! By order of the Galactic Patrol you are under arrest for 4,362 counts of grand larceny... and one (1) stolen moon.', dur: 6.0 },
  { who: 'GALACTIC PATROL', text: 'Put your tentacles where we can see them. Yes. BOTH of them.', dur: 4.2 },
  { who: 'SPLORT', text: 'Heh... you’ll have to catch me first. This city has ONE rocket left — and it’s got my name on it.', dur: 4.4 },
  { who: '', text: '🚨 WANTED — HOLD E TO SWING!', dur: 1.6 },
];
let cut = null;
let cutsceneSeen = false;
function hideoutRoofY() {
  // the tallest roof at the hideout x — never a shorter overlapping one
  let top = GROUND - 185;
  for (const b of buildings) {
    if (L.hideout.x > b.x && L.hideout.x < b.x + b.w && b.top < top) top = b.top;
  }
  return top;
}
function startCutscene() {
  cutsceneSeen = true;
  P.state = 'cutscene';
  cut = { line: -1, t: 0 };
  ui.cutscene.classList.remove('hidden');
  ui.cutSkip.textContent = 'SKIP ▸▸';
  nextCutLine();
  sfx.siren();
}
function nextCutLine() {
  cut.line++;
  if (cut.line >= CUT_LINES.length) { endCutscene(); return; }
  cut.t = 0;
  const L2 = CUT_LINES[cut.line];
  ui.cutSpeaker.textContent = L2.who;
  ui.cutSpeaker.classList.toggle('hidden', !L2.who);
  ui.cutText.classList.toggle('system', !L2.who);
  ui.cutText.textContent = '';
}
function endCutscene() {
  cut = null;
  ui.cutscene.classList.add('hidden');
  P.state = 'play';
  P.heat = 70;
  popTextScreen('NEW QUEST: ' + CHAIN[0].t);
  ui.hint.textContent = '🚨 WANTED — HOLD E to swing (aim with the mouse). Lose the saucers, then head EAST to the Mask Maker.';
  ui.hint.classList.remove('hidden');
  setTimeout(() => ui.hint.classList.add('hidden'), 9000);
}
function updateCutscene(dt) {
  if (!cut) return;
  cut.t += dt;
  const L2 = CUT_LINES[cut.line];
  ui.cutText.textContent = L2.text.slice(0, Math.floor(cut.t * 42));
  if (cut.t >= L2.dur + 0.6) nextCutLine();
}
function advanceCutscene() {
  if (!cut) return;
  const L2 = CUT_LINES[cut.line];
  if (ui.cutText.textContent.length < L2.text.length) cut.t = Math.max(cut.t, L2.text.length / 42);
  else nextCutLine();
}

// ---------------------------------------------------------- rendering
function draw() {
  const targetX = clamp(P.x - VW / 2, 0, WORLD_W - VW);
  cam.x += (targetX - cam.x) * 0.15;
  cam.y = 0;
  let sx = 0, sy = 0;
  if (shakeT > 0) { sx = rand(-2, 2); sy = rand(-2, 2); }

  // sky
  const grd = ctx.createLinearGradient(0, 0, 0, VH);
  grd.addColorStop(0, '#120a28');
  grd.addColorStop(0.6, '#241245');
  grd.addColorStop(1, '#3a1a5e');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, VW, VH);

  // stars (parallax)
  ctx.fillStyle = '#cfd8ff';
  for (let i = 0; i < 60; i++) {
    const x = ((i * 137 + 40 - cam.x * 0.1) % (VW + 20) + VW + 20) % (VW + 20) - 10;
    const y = (i * 53) % 150;
    ctx.globalAlpha = 0.4 + (i % 3) * 0.2;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.globalAlpha = 1;

  // ringed planet + moon
  const px = 380 - cam.x * 0.05;
  ctx.fillStyle = '#8a6fc0';
  ctx.beginPath(); ctx.arc(px, 52, 18, 0, 7); ctx.fill();
  ctx.strokeStyle = '#b0a0e0';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(px, 52, 30, 7, -0.3, 0, 7); ctx.stroke();
  ctx.fillStyle = '#d8c8f0';
  ctx.beginPath(); ctx.arc(120 - cam.x * 0.08, 80, 8, 0, 7); ctx.fill();

  // far skyline
  ctx.fillStyle = '#1b1038';
  for (let i = 0; i < 30; i++) {
    const bx = ((i * 260 - cam.x * 0.3) % (WORLD_W * 0.3 + VW));
    if (bx < -80 || bx > VW) continue;
    const bh = 60 + (i * 37) % 90;
    ctx.fillRect(bx, GROUND - bh - 20, 50 + (i * 13) % 40, bh + 20);
  }

  ctx.save();
  ctx.translate(-Math.round(cam.x) + sx, sy);

  // hover cars (behind buildings)
  for (const c of cars) {
    ctx.fillStyle = c.c;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(c.x, c.y, c.w, 4);
    ctx.globalAlpha = 1;
  }

  // buildings
  for (const b of buildings) {
    if (b.x + b.w < cam.x - 20 || b.x > cam.x + VW + 20) continue;
    const h = GROUND - b.top;
    ctx.fillStyle = '#241d45';
    ctx.fillRect(b.x, b.top, b.w, h);
    ctx.fillStyle = '#1c1638';
    ctx.fillRect(b.x + 2, b.top + 2, b.w - 4, h - 2);
    // windows
    ctx.fillStyle = b.neon;
    let wi = 0;
    for (let wy = b.top + 8; wy < GROUND - 8; wy += 12) {
      for (let wx = b.x + 6; wx < b.x + b.w - 6; wx += 10) {
        wi++;
        if ((wi * 7 + Math.floor(b.seed)) % 3 === 0) continue;
        ctx.globalAlpha = 0.5 + ((wi * 13) % 5) * 0.1;
        ctx.fillRect(wx, wy, 4, 6);
      }
    }
    ctx.globalAlpha = 1;
    // neon roof edge
    ctx.fillStyle = b.neon;
    ctx.fillRect(b.x - 1, b.top - 1, b.w + 2, 2);
    // signs
    if (b.sign) {
      ctx.fillStyle = '#0d0a1a';
      ctx.fillRect(b.x + b.w / 2 - 16, b.top - 14, 32, 12);
      ctx.strokeStyle = b.neon;
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x + b.w / 2 - 16.5, b.top - 14.5, 33, 13);
      ctx.fillStyle = b.neon;
      ctx.font = '7px monospace';
      ctx.textAlign = 'center';
      const label = { mask: 'MASKS', zeb: 'PAWN', rusty: 'SCRAP', depot: 'PATROL' }[b.sign];
      ctx.fillText(label, b.x + b.w / 2, b.top - 5);
    }
  }

  // street
  ctx.fillStyle = '#131022';
  ctx.fillRect(cam.x - 20, GROUND, VW + 40, VH - GROUND);
  ctx.fillStyle = '#2ae8d8';
  ctx.globalAlpha = 0.35;
  for (let lx = Math.floor(cam.x / 24) * 24; lx < cam.x + VW + 24; lx += 24) ctx.fillRect(lx, GROUND + 6, 12, 1);
  ctx.globalAlpha = 1;
  for (let lx = Math.floor((cam.x - 60) / 180) * 180; lx < cam.x + VW + 60; lx += 180) {
    ctx.fillStyle = '#3c4260';
    ctx.fillRect(lx, GROUND - 26, 2, 26);
    ctx.fillStyle = '#ffe14d';
    ctx.fillRect(lx - 2, GROUND - 28, 6, 3);
  }

  // launch pad + rocket
  ctx.fillStyle = '#3c4260';
  ctx.fillRect(L.rocket.x - 26, GROUND - 4, 52, 4);
  ctx.drawImage(rocketSpr, L.rocket.x - 5, GROUND - 4 - 26 - rocketState.ry, 10, 26);

  // scraps / fuel
  for (const s of scraps) if (!s.taken) {
    ctx.drawImage(scrapSpr, s.x - 2, s.y - 2 + Math.sin(elapsed * 3 + s.x) * 1.5, 4, 4);
    ctx.fillStyle = 'rgba(106,242,224,0.25)';
    ctx.fillRect(s.x - 1, s.y - 20, 2, 18);
  }
  if (fuelCell && !fuelCell.taken) {
    ctx.drawImage(fuelSpr, fuelCell.x - 2, fuelCell.y - 3 + (chainIdx >= 7 ? Math.sin(elapsed * 2.5) * 1.5 : 0), 4, 5);
    if (chainIdx >= 7) {
      ctx.fillStyle = 'rgba(255,225,77,0.3)';
      ctx.fillRect(fuelCell.x - 1, fuelCell.y - 24, 2, 20);
    }
  }

  // quest objective beam
  if (P.state === 'play' && chainIdx < CHAIN.length) {
    const tx = CHAIN[chainIdx].tx();
    ctx.fillStyle = 'rgba(255,225,77,0.16)';
    ctx.fillRect(tx - 3, 0, 6, GROUND);
  }

  // npcs
  for (const n of npcs) {
    ctx.drawImage(n.spr, n.x - 3, GROUND - 8, 6, 8);
    const gives = (n.name === 'THE MASK MAKER' && chainIdx === 0) || (n.name === 'OLD ZEB' && (chainIdx === 1 || chainIdx === 3)) ||
      (n.name === 'RUSTY' && chainIdx === 4) || (n.name === 'PIA' && chainIdx === 6);
    if (gives) {
      ctx.fillStyle = '#ffe14d';
      const by = GROUND - 14 + Math.sin(elapsed * 4) * 1.5;
      ctx.fillRect(n.x - 0.5, by - 4, 1.5, 3);
      ctx.fillRect(n.x - 0.5, by, 1.5, 1.5);
    }
  }

  // peds & goons
  for (const p of peds) { if (!p.removed) drawPerson(p, p.spr, p.spr); }
  for (const g of goons) { if (!g.removed) drawPerson(g, goonSprite, goonSpriteL); }

  // saucers
  for (const s of saucers) {
    const img = Math.sin(elapsed * 10 + s.phase) > 0 ? saucerA : saucerB;
    ctx.drawImage(img, s.x - 7, s.y - 4, 14, 7);
    if (s.hp <= 0) {
      ctx.fillStyle = 'rgba(255,120,60,0.6)';
      ctx.fillRect(s.x - 2, s.y - 8, 4, 3);
    }
  }

  // projectiles
  ctx.fillStyle = '#ff4fd8';
  for (const b of bullets) ctx.fillRect(b.x - 1, b.y - 1, 3, 3);
  ctx.fillStyle = '#4dffe1';
  for (const b of bolts) ctx.fillRect(b.x - 2, b.y - 1, 4, 2);

  // particles
  for (const p of parts) {
    ctx.globalAlpha = Math.max(0, p.life * 2);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
  }
  ctx.globalAlpha = 1;

  // swing anchor preview
  if (P.state === 'play' && !swing) {
    const a = findAnchor();
    if (a) {
      ctx.strokeStyle = 'rgba(77,255,225,0.8)';
      ctx.lineWidth = 1;
      const r = 3 + Math.sin(elapsed * 8) * 1;
      ctx.strokeRect(a.x - r, a.y - r, r * 2, r * 2);
    }
  }

  drawSplort();

  ctx.restore();
  shakeT = Math.max(0, shakeT - 0.016);
}

function drawPerson(p, sprR, sprL) {
  ctx.save();
  ctx.translate(p.x, p.y - 4);
  if (p.rot) ctx.rotate(p.rot * 0.3);
  const img = p.dir >= 0 ? sprR : (sprL || sprR);
  ctx.drawImage(img, -3, -4, 6, 8);
  ctx.restore();
}

function drawSplort() {
  const bx = P.x, by = P.y - 8;
  const wig = Math.sin(elapsed * 6) * 2;
  // left idle tentacle
  ctx.strokeStyle = '#8a5fe0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(bx - 2, by + 4);
  ctx.quadraticCurveTo(bx - 5 - P.vx * 0.02, by + 7 + wig, bx - 6 - P.vx * 0.04, by + 10 + wig);
  ctx.stroke();
  // right tentacle: THE grapple — from body to anchor when swinging
  if (swing) {
    ctx.strokeStyle = '#a87ff0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bx + 2, by + 2);
    const mx = (bx + swing.ax) / 2 + Math.sin(elapsed * 20) * 1.5;
    const my = (by + swing.ay) / 2;
    ctx.quadraticCurveTo(mx, my, swing.ax, swing.ay);
    ctx.stroke();
    ctx.fillStyle = '#d8c6ff';
    ctx.fillRect(swing.ax - 1.5, swing.ay - 1.5, 3, 3);
  } else if (punchAnimT > 0) {
    ctx.strokeStyle = '#a87ff0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx + P.facing * 2, by + 2);
    ctx.lineTo(bx + P.facing * (10 + punchAnimT * 60), by + 2);
    ctx.stroke();
    ctx.fillStyle = '#d8c6ff';
    ctx.fillRect(bx + P.facing * (10 + punchAnimT * 60) - 1.5, by + 0.5, 3, 3);
  } else {
    ctx.strokeStyle = '#8a5fe0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bx + 2, by + 4);
    ctx.quadraticCurveTo(bx + 5 - P.vx * 0.02, by + 7 - wig, bx + 6 - P.vx * 0.04, by + 10 - wig);
    ctx.stroke();
  }
  // body
  ctx.save();
  ctx.translate(bx, by);
  if (swing) ctx.rotate(clamp(P.vx * 0.003, -0.5, 0.5));
  const img = disguised
    ? (P.facing >= 0 ? splortMasked : splortMaskedL)
    : (P.facing >= 0 ? splortBody : splortBodyL);
  ctx.drawImage(img, -4, -4, 8, 8);
  ctx.restore();
}

// ---------------------------------------------------------- HUD
function updateHUD() {
  ui.hp.style.width = P.hp + '%';
  ui.hp.classList.toggle('low', P.hp <= 30);
  ui.score.textContent = P.score;
  const stars = wantedStars();
  ui.wanted.textContent = stars > 0 ? '🚨' + '★'.repeat(stars) + '☆'.repeat(3 - stars) : '☆☆☆';
  ui.wanted.classList.toggle('hot', stars > 0);
  if (P.state === 'play' && chainIdx < CHAIN.length) {
    ui.questBar.classList.remove('hidden');
    const C = CHAIN[chainIdx];
    ui.questTitle.textContent = C.t;
    let obj = C.o;
    if (C.n) obj += ` (${questN}/${C.n})`;
    const tx = C.tx();
    const d = Math.round(Math.abs(tx - P.x) / 8);
    ui.questObj.textContent = obj + ` · ${d}m`;
    ui.questArrow.textContent = tx > P.x + 20 ? '→' : tx < P.x - 20 ? '←' : '⌖';
  } else {
    ui.questBar.classList.add('hidden');
  }
}

// ---------------------------------------------------------- input
window.addEventListener('keydown', (ev) => {
  keys[ev.code] = true;
  if (ev.code === 'Space') ev.preventDefault();
  if (ev.repeat) return;
  if (ev.code === 'KeyE') {
    if (P.state === 'play' && !dlg && !swing) startSwing();
    return;
  }
  if (ev.code === 'Space') {
    if (dlg) { advanceDialog(); return; }
    if (P.state === 'cutscene') { advanceCutscene(); return; }
    if (P.state === 'play' && P.onGround) { P.vy = -250; P.onGround = false; sfx.jump(); }
    return;
  }
});
window.addEventListener('keyup', (ev) => {
  keys[ev.code] = false;
  if (ev.code === 'KeyE' && swing) endSwing();
});
canvas.addEventListener('mousemove', (ev) => {
  const r = canvas.getBoundingClientRect();
  mouse.x = (ev.clientX - r.left) / r.width * VW;
  mouse.y = (ev.clientY - r.top) / r.height * VH;
});
canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
canvas.addEventListener('pointerdown', (ev) => {
  audioCtx();
  if (dlg) { advanceDialog(); return; }
  if (P.state === 'cutscene') { advanceCutscene(); return; }
  if (P.state !== 'play') return;
  if (ev.button === 0) {
    if (hasGun) fireZapper(); else punch();
  }
});
ui.playBtn.addEventListener('click', () => {
  audioCtx();
  if (P.state === 'won') { window.location.reload(); return; }
  P.state = 'play';
  ui.overlay.classList.add('hidden');
  P.x = L.hideout.x;
  P.y = hideoutRoofY();
  P.onGround = true;
  if (!cutsceneSeen) startCutscene();
});
ui.cutSkip.addEventListener('pointerdown', (ev) => {
  ev.stopPropagation();
  if (dlg) { while (dlg) advanceDialog(); return; }
  if (cut) endCutscene();
});

// ---------------------------------------------------------- main loop
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.033);
  last = now;
  elapsed += dt;

  if (P.state === 'cutscene') {
    updateCutscene(dt);
    P.x = L.hideout.x; P.y = hideoutRoofY();
  } else if (P.state === 'play' || P.state === 'won') {
    if (P.state === 'play') {
      updatePlayer(dt);
      updateNPCsAndTalk();
      updateWanted(dt);
    }
    updatePeds(dt);
    updateGoons(dt);
    updateSaucers(dt);
    updateProjectiles(dt);
    updateQuestStuff(dt);
  }
  for (const c of cars) {
    c.x += c.v * dt;
    if (c.x > WORLD_W + 30) c.x = -30;
    if (c.x < -30) c.x = WORLD_W + 30;
  }
  updateParts(dt);
  punchAnimT = Math.max(0, punchAnimT - dt);

  draw();
  updateHUD();
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------- boot
buildCity();
buildEntities();
requestAnimationFrame(frame);

// exposed for automated smoke tests
window.__game = P;
window.__debug = {
  P, buildings, anchors, peds, goons, saucers, scraps, npcs, L,
  chain: () => ({ chainIdx, questN, disguised, hasGun, hasFuel, alarm }),
  swing: () => swing, startSwing, endSwing, findAnchor,
  dlgOpen: () => !!dlg, advanceDialog, clearTalk: () => { talkCd = 0; },
  giveGun: () => { hasGun = true; }, fire: fireZapper, punch,
  setHeat: (h) => { P.heat = h; }, wantedStars,
  fuel: () => fuelCell, mouse, cam, groundAtX, hideoutRoofY,
  endCutscene: () => cut && endCutscene(),
  rocket: () => rocketState,
};

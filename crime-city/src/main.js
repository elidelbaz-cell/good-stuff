import * as THREE from 'three';
import { bus } from './core/bus.js';
import { Input } from './core/input.js';
import { AudioSys } from './core/audio.js';
import { defaultState, loadGame, saveGame } from './core/state.js';
import { City } from './world/city.js';
import { Sky } from './world/sky.js';
import { Traffic } from './world/traffic.js';
import { Pedestrians } from './world/pedestrians.js';
import { Pigeons } from './world/pigeons.js';
import { Player } from './player/controller.js';
import { HUD } from './ui/hud.js';
import { Minimap } from './ui/minimap.js';
import { Menus } from './ui/menus.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const G = {
  scene: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1400),
  renderer, canvas,
  state: null,
  running: false,
  paused: false,
  targets: [],            // shootable things: {kind, ref, alive(), hitTest(), pos(), damage()}
  dynamicColliders: [],   // moving AABBs (cars), rebuilt every frame
  interact: null,         // {text, frac?} set by whichever system owns the prompt this frame
  objectiveMarker: null,  // {x, z} shown on minimap
};
window.__G = G;

G.input = new Input(canvas);
G.audio = new AudioSys();
G.city = new City(G);
G.sky = new Sky(G);
G.traffic = new Traffic(G);
G.peds = new Pedestrians(G);
G.pigeons = new Pigeons(G);
G.player = new Player(G);
G.hud = new HUD(G);
G.minimap = new Minimap(G);

function applyState() {
  G.hud.setMob(G.state.mobName, G.state.mobColor);
  G.sky.setNight(G.state.night);
  G.base?.applyMobStyle();
  G.weapons?.syncFromState();
  G.squad?.syncFromState();
  G.player.reset(true);
}

function begin() {
  applyState();
  G.running = true;
  G.paused = false;
  G.menus.hide();
  G.hud.show(true);
  G.audio.ensure();
  G.input.lock();
}

G.menus = new Menus(G, {
  onNewGame(name, color) {
    G.state = defaultState(name, color);
    begin();
    G.hud.banner(name, 'take the city — earn a $10,000,000 bounty', 'gold', 4);
    G.hud.headline(`new crew calling themselves "${name}" spotted at the docks`);
  },
  onContinue() {
    G.state = loadGame() || defaultState();
    begin();
    G.hud.banner('WELCOME BACK, BOSS', G.state.mobName, 'gold', 3);
  },
  onQuit() {
    if (G.state) saveGame(G.state);
    G.running = false;
    G.paused = false;
    G.finale?.stopMusic();
    G.hud.show(false);
    G.menus.show('main');
  },
  onRespawn() {
    bus.emit('respawn');
    G.paused = false;
    G.menus.hide();
    G.input.lock();
  },
  onWinContinue() {
    G.paused = false;
    G.menus.hide();
    G.input.lock();
  },
  onRetry() {
    bus.emit('retryFinale');
    G.paused = false;
    G.menus.hide();
    G.input.lock();
  },
});
G.menus.show('main');

function handleGlobalKeys() {
  const inp = G.input;
  if (inp.pressed('KeyN')) {
    G.state.night = G.sky.toggle();
    G.hud.toast(G.state.night ? 'night falls on New Amsterdam' : 'the sun comes up');
  }
  // testing / debug keys (documented in Controls)
  if (inp.pressed('BracketLeft') && G.economy) G.economy.addBounty(250_000, 'debug', true);
  if (inp.pressed('BracketRight') && G.economy) G.economy.addCash(5_000);
  if (inp.pressed('KeyK') && G.police) G.police.addHeat(1);
}

const clock = new THREE.Clock();
let menuAngle = 0.6;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (G.running && !G.paused) {
    G.dynamicColliders.length = 0;
    G.interact = null;

    G.traffic.update(dt);
    G.peds.update(dt);
    G.pigeons.update(dt);
    G.player.update(dt);
    G.weapons?.update(dt);
    G.police?.update(dt);
    G.squad?.update(dt);
    G.base?.update(dt);
    G.economy?.update(dt);
    G.activities?.update(dt);
    G.finale?.update(dt);
    G.fx?.update(dt);
    G.city.update(dt);
    G.sky.update(dt, G.player.pos);
    G.hud.update(dt);
    G.minimap.update();

    G.state.stats.time += dt;
    handleGlobalKeys();
  } else {
    // slow aerial orbit behind the menus
    if (!G.running) {
      menuAngle += dt * 0.04;
      G.dynamicColliders.length = 0;
      G.camera.position.set(Math.cos(menuAngle) * 180, 100, Math.sin(menuAngle) * 180);
      G.camera.lookAt(-40, 6, 0);
      G.traffic.update(dt);
      G.peds.update(dt);
      G.pigeons.update(dt);
      G.city.update(dt);
      G.sky.update(dt, G.camera.position);
      G.fx?.update(dt);
    }
  }

  renderer.render(G.scene, G.camera);
  G.input.endFrame();
}
tick();

addEventListener('resize', () => {
  G.camera.aspect = innerWidth / innerHeight;
  G.camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

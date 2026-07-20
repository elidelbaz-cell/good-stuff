// ============================================================================
// THE CALMING — boot + game state machine.
// States: title → cutscene → chase → piano (death respawns at the last
// checkpoint: chase start or piano start — never the cutscene).
//
// Dev entry points (also how each delivery step is shown runnable):
//   ?scene=cutscene | chase | piano    start directly in a scene
//   ?debug=1                           live state overlay
//   ?nolock=1                          mouse look without pointer lock
// ============================================================================
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { AudioEngine } from './engine/audio.js';
import { Assets } from './engine/assets.js';
import { HUD } from './game/hud.js';
import { Player } from './game/player.js';
import { Ghost } from './game/ghost.js';
import { DeathHandler } from './game/death.js';
import { ChaseScene, LAYOUT } from './game/chase.js';
import { PianoScene } from './game/piano.js';
import { CutsceneScene } from './game/cutscene.js';

const params = new URLSearchParams(location.search);
if (params.get('nolock')) window.__noPointerLock = true;

class Game {
  constructor() {
    this.state = 'title';
    this.checkpoint = 'chase';
    this.keys = new Set();

    // renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    document.getElementById('app').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020203);
    this.scene.fog = new THREE.FogExp2(0x020203, 0.035);

    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 300);

    // dim world light + a lamp that follows the player
    this.scene.add(new THREE.HemisphereLight(0x4a5468, 0x14100a, 1.0));
    this.playerLight = new THREE.PointLight(0xffd9a8, 42, 17, 1.6);
    this.scene.add(this.playerLight);

    this.hud = new HUD();
    this.audio = new AudioEngine();
    this.assets = new Assets();
    this.player = new Player(this.camera, window);
    this.scene.add(this.player.root);
    this.player.onStep = v => this.audio.playFootstep(0.05 + 0.07 * v);

    this.death = new DeathHandler(this);
    this.chase = new ChaseScene(this);
    this.piano = new PianoScene(this);
    this.cutscene = new CutsceneScene(this);

    window.addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      this.keys.add(e.code);
      const m = e.code.match(/^(?:Digit|Numpad)([1-7])$/);
      if (m && this.state === 'piano' && !this.death.active) this.piano.onKey(Number(m[1]));
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    this.renderer.domElement.addEventListener('click', () => this._lockPointer());
  }

  _lockPointer() {
    if (window.__noPointerLock) return;
    if (document.pointerLockElement !== this.renderer.domElement) {
      this.renderer.domElement.requestPointerLock?.();
    }
  }

  async build() {
    const [beatmap, timeline, triggers, pianoKeys] = await Promise.all([
      this.assets.getJSON('beatmap'),
      this.assets.getJSON('cutsceneTimeline'),
      this.assets.getJSON('chaseTriggers'),
      this.assets.getJSON('pianoKeys'),
    ]);

    const shadowMesh = await this.assets.getModel('shadow');
    shadowMesh.visible = false;
    this.scene.add(shadowMesh);
    this.ghost = new Ghost(shadowMesh, this.audio);

    await this.chase.build(this.scene, this.assets, triggers);
    await this.piano.build(this.scene, this.assets, pianoKeys, beatmap, {
      piano: LAYOUT.piano,
      bench: LAYOUT.bench,
      ghostFrom: LAYOUT.ghostFrom,
      ghostTo: LAYOUT.ghostTo,
    });
    await this.cutscene.build(this.scene, this.assets, timeline, beatmap);
  }

  // ------------------------------------------------------ state changes ----
  startCutscene() {
    this.state = 'cutscene';
    this.cutscene.start();
  }

  startChase() {
    this.state = 'chase';
    this.hud.showSkip(false);
    if (!this.camera.parent || this.camera.parent !== this.player.head) {
      this.camera.parent?.remove(this.camera);
      this.player.head.add(this.camera);
      this.camera.position.set(0, 0, 0);
      this.camera.rotation.set(0, 0, 0);
    }
    this.chase.start();
  }

  startPiano() {
    this.state = 'piano';
    this.piano.start();
  }

  respawn() { // from the death handler — last checkpoint, never the cutscene
    this.audio.restoreAll();
    if (this.checkpoint === 'piano') {
      this.piano.reset();
      this.state = 'piano';
    } else {
      this.chase.reset();
      this.state = 'chase';
    }
    this.hud.fadeIn(1.2);
  }

  // ---------------------------------------------------------------- loop ----
  update(dt) {
    if (this.death.active) {
      this.death.update(dt);
      // the ghost keeps drifting toward you while the camera is seized
      if (this.state === 'piano') this.ghost.updateApproach(dt);
    } else if (this.state === 'cutscene') {
      this.cutscene.update(dt, this.keys);
    } else if (this.state === 'chase') {
      this.chase.update(dt);
    } else if (this.state === 'piano') {
      this.player.update(dt, { floorY: 0 });
      this.piano.update(dt);
    }

    // the lamp follows whichever rig holds the camera
    const eye = new THREE.Vector3();
    this.camera.getWorldPosition(eye);
    this.playerLight.position.set(eye.x, eye.y + 0.4, eye.z);

    if (params.get('debug')) {
      const g = this.ghost;
      this.hud.setDebug(
        `state    ${this.state}${this.death.active ? ' (death)' : ''}\n` +
        `chkpt    ${this.checkpoint}\n` +
        `playerS  ${this.chase.playerS.toFixed(1)} / door ${this.chase.doorS.toFixed(0)}\n` +
        `gap      ${g && g.mode === 'chase' ? g.gapTo(this.chase.playerS).toFixed(2) : '-'}\n` +
        `ghostD   ${g && g.mode === 'approach' ? g.distance.toFixed(2) : '-'}\n` +
        `staggers ${this.chase.staggerCount}\n` +
        `streak   ${this.piano.streak}  songT ${this.piano.song ? (this.piano.songTimeMs / 1000).toFixed(1) : '-'}\n` +
        `pos      ${this.player.position.x.toFixed(1)}, ${this.player.position.z.toFixed(1)}`);
    }

    this.renderer.render(this.scene, this.camera);
  }

  run() {
    let last = performance.now();
    const loop = now => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.update(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

// -------------------------------------------------------------------- boot --
const game = new Game();
window.game = game;   // console access for tuning

// The title click is live from the first frame — it just waits for the build
// if you click early. The subtitle shows LOADING… until everything is ready.
const titleEl = document.getElementById('title');
const subtitleEl = titleEl.querySelector('p');
subtitleEl.textContent = 'LOADING…';

const ready = game.build().then(() => {
  subtitleEl.textContent = 'CLICK TO BEGIN — HEADPHONES ON';
}).catch(err => {
  console.error('[THE CALMING] boot failed', err);
  subtitleEl.textContent = 'BOOT FAILED — SEE CONSOLE';
  throw err;
});

let started = false;
titleEl.addEventListener('click', async () => {
  if (started) return;
  started = true;
  try { await ready; } catch (_) { started = false; return; }

  game.audio.init();
  game.audio.resume();
  game.hud.hideTitle();
  game._lockPointer();

  const scene = params.get('scene') || 'cutscene';
  if (scene === 'chase') { game.hud.clearBlack(); game.startChase(); }
  else if (scene === 'piano') { game.hud.clearBlack(); game.startPiano(); }
  else game.startCutscene();

  game.run();
});

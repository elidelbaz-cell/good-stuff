// ============================================================================
// SCENE 1 — the cutscene. 90–120s, no player control, first person throughout.
// An editable timeline of NAMED BEATS — retime any beat in
// assets/data/cutscene_timeline.json; the handlers here map 1:1 to the names.
// The only input is the optional hold-F-to-skip.
//
// Open decision (placeholder until confirmed): the shape in beats 5–6 is the
// `shadow`. To make it the `human`/uncle instead, change ONE line in
// _enterTurn() below (marked OPEN DECISION).
// ============================================================================
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { makeHandMesh } from '../engine/placeholders.js';
import { LAYOUT } from './chase.js';

// The two cutscene sets live far from the library so they never intersect it.
const DEAL = new THREE.Vector3(400, 0, 0);
const HOUSE = new THREE.Vector3(500, 0, 0);

export class CutsceneScene {
  constructor(game) {
    this.game = game;
    this.rig = new THREE.Group();      // the scripted first-person camera
    this.tMs = 0;
    this.beatIdx = 0;
    this.beats = [];
    this.running = false;
    this.tweens = [];
    this.lookTarget = new THREE.Vector3();
    this.walkFrom = null; this.walkTo = null; this.walkT0 = 0; this.walkDur = 0;
    this.skipHeld = 0;
    this.practice = null;
    this.props = {};
  }

  async build(scene, assets, timeline, beatmap) {
    this.beats = [...timeline.beats].sort((a, b) => a.at - b.at);
    this.beatmap = beatmap;
    scene.add(this.rig);

    const dark = new THREE.MeshStandardMaterial({ color: 0x18130e, roughness: 0.95 });

    // ---- set: the deal (library after hours) --------------------------------
    const deal = new THREE.Group();
    deal.position.copy(DEAL);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(24, 0.1, 24), dark);
    floor.position.y = -0.05;
    const table = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 1.0),
      new THREE.MeshStandardMaterial({ color: 0x2b2116, roughness: 0.7 }));
    table.position.set(0, 0.75, 0);
    const tableLegs = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.71, 0.8), dark);
    tableLegs.position.set(0, 0.355, 0);
    // the window the silhouette is backlit against
    const window_ = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 4.2),
      new THREE.MeshBasicMaterial({ color: 0x25324d }));
    window_.position.set(0, 2.1, -3.4);
    const moon = new THREE.PointLight(0x8fa5cc, 14, 18, 1.6);
    moon.position.set(0, 2.6, -3.0);
    // shelves boxing the space in (placeholder set dressing)
    for (const [x, z, ry] of [[-5, -1, 0], [5, -1, 0], [-3.4, 4, Math.PI / 2], [3.4, 4, Math.PI / 2]]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.9, 0.5), dark);
      s.position.set(x, 1.45, z); s.rotation.y = ry;
      deal.add(s);
    }
    // the envelope of cash
    const envelope = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.025, 0.13),
      new THREE.MeshStandardMaterial({ color: 0xcfc4a2, roughness: 0.8 }));
    envelope.position.set(0, 0.805, -0.28);   // his side of the table
    deal.add(floor, table, tableLegs, window_, moon, envelope);
    scene.add(deal);
    this.props.envelope = envelope;

    // the man who pays — stays a silhouette against the window
    const silhouette = await this.game.assets.getModel('human');
    silhouette.position.copy(DEAL).add(new THREE.Vector3(0, 0, -1.15));
    silhouette.rotation.y = Math.PI;   // facing the player across the table
    scene.add(silhouette);
    this.props.silhouette = silhouette;

    // the player's hands (rigid, camera-space)
    const handL = makeHandMesh(true), handR = makeHandMesh(false);
    handL.visible = handR.visible = false;
    this.rig.add(handL, handR);
    // the camera sits flipped in the rig (see start()), so the view axis is
    // +Z in rig space — hands park below the frame on that side
    handL.position.set(-0.16, -0.9, 0.35);
    handR.position.set(0.16, -0.9, 0.35);
    this.props.handL = handL; this.props.handR = handR;

    // ---- set: the house hallway ---------------------------------------------
    const house = new THREE.Group();
    house.position.copy(HOUSE);
    const hFloor = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 16),
      new THREE.MeshStandardMaterial({ color: 0x1f1811, roughness: 0.9 }));
    hFloor.position.y = -0.05;
    const hCeil = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 16), dark);
    hCeil.position.y = 2.5;
    house.add(hFloor, hCeil);
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.6, 16), dark);
      wall.position.set(1.2 * side, 1.25, 0);
      house.add(wall);
    }
    const endWall = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 0.2), dark);
    endWall.position.set(0, 1.3, -8);
    house.add(endWall);
    // TV light spilling from a side room (flickers in update)
    this.props.tvLight = new THREE.PointLight(0x6a86b8, 0, 7, 1.8);
    this.props.tvLight.position.copy(HOUSE).add(new THREE.Vector3(-1.0, 1.2, 2.5));
    scene.add(this.props.tvLight);
    const hallLamp = new THREE.PointLight(0xffd9a0, 2.2, 9, 2);
    hallLamp.position.copy(HOUSE).add(new THREE.Vector3(0, 2.3, -4));
    scene.add(hallLamp);
    scene.add(house);
    this.props.house = house;

    // the shape for "the turn" — OPEN DECISION: shadow or human/uncle?
    // Placeholder: the shadow. Swap 'shadow' → 'human' here when decided.
    const shape = await this.game.assets.getModel('shadow');
    shape.visible = false;
    shape.position.copy(HOUSE).add(new THREE.Vector3(0, 0, 7.2)); // end of the hall
    scene.add(shape);
    this.props.shape = shape;
  }

  // --------------------------------------------------------------------------
  start() {
    const g = this.game;
    this.running = true;
    this.tMs = 0;
    this.beatIdx = 0;
    this.tweens = [];
    this.skipHeld = 0;
    // the cutscene owns the camera. Group.lookAt() aims the rig's +Z at the
    // target while cameras render down -Z, so the camera sits flipped in it.
    g.player.head.remove(g.camera);
    this.rig.add(g.camera);
    g.camera.rotation.set(0, Math.PI, 0);
    g.camera.position.set(0, 0, 0);
    g.player.enabled = false;
    g.player.lookEnabled = false;
    g.hud.showDot(false);
    g.hud.showSkip(true);
    g.hud.blackout();
  }

  _tween(setter, from, to, delaySec, durSec, ease = true) {
    this.tweens.push({ setter, from, to, t0: this.tMs / 1000 + delaySec, dur: durSec, ease, done: false });
  }

  _pose(pos, look) {
    this.rig.position.copy(pos);
    this.baseY = pos.y;
    this.lookTarget.copy(look);
    this.walkFrom = null;
  }

  _walk(from, to, look, durSec) {
    this.rig.position.copy(from);
    this.baseY = from.y;
    this.lookTarget.copy(look);
    this.walkFrom = from.clone(); this.walkTo = to.clone();
    this.walkT0 = this.tMs / 1000; this.walkDur = durSec;
  }

  // ------------------------------------------------------------ the beats ----
  _enter(name) {
    const g = this.game;
    const P = this.props;
    switch (name) {
      case 'deal': {
        // library after hours: across the table from the silhouette
        this._pose(DEAL.clone().add(new THREE.Vector3(0, 1.18, 1.35)),
                   DEAL.clone().add(new THREE.Vector3(0, 1.35, -1.15)));
        g.hud.fadeIn(2.5);
        g.audio.playPaper();
        break;
      }
      case 'deal_envelope': {
        // the envelope of cash slides across the table
        g.audio.playPaper();
        const e = P.envelope;
        this._tween(v => { e.position.z = DEAL.z + v; }, -0.28, 0.30, 0, 2.6);
        this.lookTarget.copy(DEAL).add(new THREE.Vector3(0, 0.82, 0.1)); // eyes drop to it
        break;
      }
      case 'deal_hands': {
        // the player's hands come up and take it
        P.handL.visible = P.handR.visible = true;
        const L = P.handL.position, R = P.handR.position;
        this._tween(v => { L.y = R.y = v; }, -0.9, -0.30, 0, 1.4);
        this._tween(v => { L.z = R.z = v; }, 0.35, 0.55, 0, 1.4);
        this._tween(v => { L.x = -v; R.x = v; }, 0.16, 0.09, 0, 1.4);
        // envelope leaves the table with them
        this._tween(v => { P.envelope.position.y = DEAL.y + v; }, 0.805, 0.98, 1.5, 1.2);
        this._tween(v => { P.envelope.position.z = DEAL.z + v; }, 0.30, 0.62, 1.5, 1.2);
        this._tween(v => { L.y = R.y = v; }, -0.30, -0.9, 3.0, 1.6);
        this._tween(v => { P.envelope.position.y = DEAL.y + v; }, 0.98, 0.2, 3.0, 1.6);
        g.audio.playPaper();
        break;
      }
      case 'house': {
        // hard cut to the dark hallway; domestic sound; slow walk forward
        g.hud.blackout();
        setTimeout(() => g.hud.fadeIn(1.2), 350);
        P.handL.visible = P.handR.visible = false;
        this._walk(HOUSE.clone().add(new THREE.Vector3(0, 1.55, 5.5)),
                   HOUSE.clone().add(new THREE.Vector3(0, 1.55, -3.5)),
                   HOUSE.clone().add(new THREE.Vector3(0, 1.35, -8)),
                   (this._beatAt('act_black') - this._beatAt('house')) / 1000);
        g.audio.startTvMurmur();
        // the uncle practising the melody badly upstairs — the same melody
        this.practice = g.audio.startPracticePiano(this.beatmap, 16);
        break;
      }
      case 'act_black': {
        // THE ACT. Cut to black on the moment. Never show it. Audio only.
        g.hud.blackout();
        this.walkFrom = null;
        break;
      }
      case 'act_piano_stops': {
        if (this.practice) { this.practice.stop(); this.practice = null; }
        break;
      }
      case 'act_chair': {
        g.audio.playChairFall();
        setTimeout(() => g.audio.stopTvMurmur(), 900);   // then silence
        break;
      }
      case 'aftermath': {
        // fade back in. the player stands still. the house is silent.
        this._pose(HOUSE.clone().add(new THREE.Vector3(0, 1.55, -2.0)),
                   HOUSE.clone().add(new THREE.Vector3(0, 1.35, -8)));
        g.hud.fadeIn(3.5);
        break;
      }
      case 'turn': {
        // the head turns on its own. a shape at the end of the hall. it does
        // not move. (OPEN DECISION: shadow vs human — see build())
        this.props.shape.visible = true;
        const from = HOUSE.clone().add(new THREE.Vector3(0, 1.35, -8));
        const to = HOUSE.clone().add(new THREE.Vector3(0, 1.5, 7.2));
        this._tween(v => { this.lookTarget.lerpVectors(from, to, v); }, 0, 1, 0.8, 3.2);
        break;
      }
      case 'hardcut': {
        this.finish();
        break;
      }
    }
  }

  _beatAt(name) {
    const b = this.beats.find(x => x.name === name);
    return b ? b.at : 0;
  }

  // Hard cut to the present-day library. Same camera, no fade, no loading —
  // control arrives seamlessly into the chase.
  finish() {
    if (!this.running) return;
    this.running = false;
    const g = this.game;
    if (this.practice) { this.practice.stop(); this.practice = null; }
    g.audio.stopTvMurmur();
    this.props.shape.visible = false;
    g.hud.showSkip(false);
    g.hud.clearBlack();               // hard cut — no fade
    // hand the camera back to the player rig
    this.rig.remove(g.camera);
    g.player.head.add(g.camera);
    g.camera.position.set(0, 0, 0);
    g.camera.rotation.set(0, 0, 0);
    g.startChase();                   // control arrives this frame
  }

  update(dt, keys) {
    if (!this.running) return;
    this.tMs += dt * 1000;

    // fire beats
    while (this.beatIdx < this.beats.length && this.beats[this.beatIdx].at <= this.tMs) {
      this._enter(this.beats[this.beatIdx].name);
      this.beatIdx++;
      if (!this.running) return;
    }

    // hold-F skip (the only input)
    if (keys.has('KeyF')) {
      this.skipHeld += dt;
      this.game.hud.setSkipProgress(Math.min(1, this.skipHeld / CONFIG.cutscene.skipHoldSeconds));
      if (this.skipHeld >= CONFIG.cutscene.skipHoldSeconds) { this.finish(); return; }
    } else {
      this.skipHeld = Math.max(0, this.skipHeld - dt * 2);
      this.game.hud.setSkipProgress(this.skipHeld / CONFIG.cutscene.skipHoldSeconds);
    }

    // tweens
    const tSec = this.tMs / 1000;
    for (const tw of this.tweens) {
      if (tw.done || tSec < tw.t0) continue;
      let f = Math.min(1, (tSec - tw.t0) / tw.dur);
      if (tw.ease) f = f * f * (3 - 2 * f);
      tw.setter(tw.from + (tw.to - tw.from) * f);
      if (f >= 1) tw.done = true;
    }

    // scripted slow walk + breathing (offsets applied over a stored base —
    // never accumulated into position)
    let baseY = this.baseY;
    if (this.walkFrom) {
      const f = Math.min(1, (tSec - this.walkT0) / this.walkDur);
      this.rig.position.lerpVectors(this.walkFrom, this.walkTo, f);
      baseY = this.rig.position.y + Math.sin(tSec * 6.2) * 0.02; // heavy steps
    }
    this.rig.position.y = baseY + Math.sin(tSec * 1.4) * 0.008;  // breathing
    this.rig.lookAt(this.lookTarget);

    // TV flicker
    if (this.props.tvLight && this.tMs > this._beatAt('house') && this.tMs < this._beatAt('act_chair')) {
      this.props.tvLight.intensity = 2.2 + Math.random() * 2.4;
    } else if (this.props.tvLight) {
      this.props.tvLight.intensity = 0;
    }
  }
}

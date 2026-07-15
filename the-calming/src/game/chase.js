// ============================================================================
// SCENE 2 — the library chase.
//
// The corridor is built along a PathLine spine. Player collision is "stay
// within the corridor width" (walls come free, L-corners work). The ghost
// glides on the same spine. Bookshelves topple at scripted trigger points
// (assets/data/chase_triggers.json): 'jump' lands flat (low barrier),
// 'slide' lands leaning (gap underneath). Mistime → 0.5s stagger; three
// staggers → caught. The corridor branches once and reconverges — no dead
// ends. Lights fail behind the player as the ghost passes them.
// Ends in the reading room: doors slam, ghost waits at the threshold,
// control soft-locks onto the piano.
// ============================================================================
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { PathLine } from '../engine/path.js';
import { makeBook } from '../engine/placeholders.js';

const C = CONFIG.chase;
const G = CONFIG.ghost;
const _v = new THREE.Vector3();

// Path spine. First 20 m sit BEHIND the player spawn — the ghost walks in
// from there at the cutscene handoff. Widths per segment; the last, wider
// segment is the reading room.
const WAYPOINTS = [
  new THREE.Vector3(0, 0, 20),
  new THREE.Vector3(0, 0, -60),
  new THREE.Vector3(30, 0, -60),
  new THREE.Vector3(30, 0, -140),
  new THREE.Vector3(30, 0, -180),   // branch: divider island sits -145..-175
  new THREE.Vector3(30, 0, -240),
  new THREE.Vector3(30, 0, -262),   // final stretch tapers to funnel the door
  new THREE.Vector3(30, 0, -282),
];
// final 4 m stretch: the corridor-clamp boundary (±2.0 incl. player radius)
// meets the 4 m door gap flush, so the sprint funnels cleanly through it
const WIDTHS = [8, 8, 8, 8, 8, 4, 14];

export const LAYOUT = {
  playerSpawn: new THREE.Vector3(0, 0, 0),
  spawnYaw: Math.PI,                              // facing the shape up the stacks
  doorPos: new THREE.Vector3(30, 0, -262),
  piano: new THREE.Vector3(30, 0, -279.4),        // piano faces +Z, back to the wall
  bench: new THREE.Vector3(30, 0, -278.0),        // player stands here, facing -Z
  ghostFrom: new THREE.Vector3(34.6, 0, -266.5),  // approach line: in on the right…
  ghostTo: new THREE.Vector3(30.9, 0, -277.6),    // …ending at the right shoulder
};

function aabb(cx, cy, cz, hx, hy, hz) {
  return new THREE.Box3(
    new THREE.Vector3(cx - hx, cy - hy, cz - hz),
    new THREE.Vector3(cx + hx, cy + hy, cz + hz));
}

export class ChaseScene {
  constructor(game) {
    this.game = game;
    this.path = new PathLine(WAYPOINTS, WIDTHS);
    this.doorS = this.path.progressOf(LAYOUT.doorPos);
    this.solids = [];        // AABBs the player is pushed out of
    this.shelfTraps = [];    // toppling shelves
    this.lights = [];
    this.books = [];         // flying book bursts
    this.doors = null;
    this.state = 'idle';     // idle | run | ending
    this.staggerCount = 0;
    this.playerS = 0;
    this.endT = 0;
    this._lightFailAudioT = 0;
  }

  // --- level construction (called once at boot) ------------------------------
  async build(scene, assets, triggerData) {
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a140f, roughness: 0.95 });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.9 });
    const shelfMat = new THREE.MeshStandardMaterial({ color: 0x201810, roughness: 0.9 });

    // floor + ceiling + outer shells per segment
    for (const seg of this.path.segs) {
      const len = seg.len + seg.width;   // overshoot fills the corners
      const mid = _v.copy(seg.a).add(seg.b).multiplyScalar(0.5);
      const alongX = Math.abs(seg.dir.x) > 0.5;
      const sx = alongX ? len : seg.width;
      const sz = alongX ? seg.width : len;

      const floor = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.1, sz), floorMat);
      floor.position.set(mid.x, -0.05, mid.z);
      scene.add(floor);
      const ceil = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.1, sz), dark);
      ceil.position.set(mid.x, 3.6, mid.z);
      scene.add(ceil);

      // outer dark shells just past the shelf walls
      for (const side of [-1, 1]) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(
          alongX ? len : 0.3, 4.0, alongX ? 0.3 : len), dark);
        const off = (seg.width / 2 + 0.55) * side;
        wall.position.set(mid.x + (alongX ? 0 : off), 1.8, mid.z + (alongX ? off : 0));
        scene.add(wall);
      }
    }

    // shelf-lined walls: instanced blocks every 3 m along each side
    // (PLACEHOLDER set dressing — flagged for real wall-shelf assets)
    const unit = new THREE.BoxGeometry(2.8, 3.1, 0.5);
    const positions = [];
    for (const seg of this.path.segs.slice(0, 6)) {  // not the reading room
      for (let d = 2; d < seg.len - 2; d += 3) {
        for (const side of [-1, 1]) {
          const p = _v.copy(seg.dir).multiplyScalar(d).add(seg.a);
          const px = p.x + -seg.dir.z * (seg.width / 2 - 0.25) * side;
          const pz = p.z + seg.dir.x * (seg.width / 2 - 0.25) * side;
          // skip the door gap
          if (Math.abs(pz - LAYOUT.doorPos.z) < 3 && Math.abs(px - 30) < 5) continue;
          positions.push({ x: px, z: pz, ry: Math.abs(seg.dir.x) > 0.5 ? Math.PI / 2 : 0 });
        }
      }
    }
    const inst = new THREE.InstancedMesh(unit, shelfMat, positions.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1);
    positions.forEach((p, i) => {
      q.setFromEuler(new THREE.Euler(0, p.ry, 0));
      m4.compose(new THREE.Vector3(p.x, 1.55, p.z), q, s1);
      inst.setMatrixAt(i, m4);
    });
    scene.add(inst);

    // the branch divider island — both routes reconverge, no dead ends
    const island = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.1, 30), shelfMat);
    island.position.set(30, 1.55, -160);
    scene.add(island);
    this.solids.push(aabb(30, 1.55, -160, 1.2, 1.55, 15));

    // reading-room walls
    const roomWall = new THREE.Mesh(new THREE.BoxGeometry(14.6, 4, 0.4), dark);
    roomWall.position.set(30, 2, -282.2);
    scene.add(roomWall);
    for (const side of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 20.6), dark);
      w.position.set(30 + 7.3 * side, 2, -272);
      scene.add(w);
    }
    // wall pieces beside the door gap (door is 4 m wide at x 28..32)
    for (const side of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(4.8, 4, 0.4), dark);
      w.position.set(30 + 4.4 * side, 2, -262);
      scene.add(w);
      this.solids.push(aabb(30 + 4.4 * side, 2, -262, 2.4, 2, 0.25));
    }

    // the doors that slam behind the player
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x2c221a, roughness: 0.8 });
    const mkDoor = side => {
      const d = new THREE.Mesh(new THREE.BoxGeometry(2.15, 3.2, 0.18), doorMat);
      d.position.set(30 + 3.1 * side, 1.6, -262); // recessed open
      return d;
    };
    this.doors = { left: mkDoor(-1), right: mkDoor(1), closed: false, anim: 0 };
    scene.add(this.doors.left, this.doors.right);

    // ceiling light strips along the path — these fail as the ghost passes
    const lightGeo = new THREE.BoxGeometry(0.35, 0.06, 2.2);
    for (let s = 26; s < this.path.length - 16; s += C.lightSpacingS) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x111111, emissive: 0xfff2cc, emissiveIntensity: 1.6,
      });
      const mesh = new THREE.Mesh(lightGeo, mat);
      const p = this.path.pointAt(s);
      const dir = this.path.dirAt(s);
      mesh.position.set(p.x, 3.5, p.z);
      mesh.rotation.y = Math.abs(dir.x) > 0.5 ? Math.PI / 2 : 0;
      scene.add(mesh);
      this.lights.push({ mesh, mat, s, on: true, flicker: 0 });
    }
    // a small pool of real lights that sit at the nearest still-alive strips —
    // when a strip fails its light leaves with it, so darkness follows the ghost
    this.lightPool = [];
    for (let i = 0; i < 3; i++) {
      const pl = new THREE.PointLight(0xffe6bb, 30, 15, 1.6);
      scene.add(pl);
      this.lightPool.push(pl);
    }

    // toppling shelf traps from editable trigger data.
    // Full-corridor traps are a PAIR of stacks, one from each wall: falling
    // flat they meet in the middle (jump over), falling to ~70° they jam into
    // a leaning tent (slide under the gap). Branch-lane traps are one stack.
    for (const trig of triggerData.triggers) {
      const p = this.path.pointAt(trig.s);
      const dir = this.path.dirAt(trig.s);
      const perp = new THREE.Vector3(-dir.z, 0, dir.x);
      const lane = trig.span === 'lane';

      const offsets = lane ? [trig.offset] : [Math.abs(trig.offset), -Math.abs(trig.offset)];
      const pivots = [];
      for (const off of offsets) {
        const model = await assets.getModel('bookshelf');
        // scaled into a taller library stack (placement transform only —
        // the same scaling applies when the real FBX lands)
        model.scale.set(1.5, 1.55, 1.0);
        const pivot = new THREE.Group();
        pivot.position.copy(p).addScaledVector(perp, off);
        // wide face parallel to the wall; topples toward the centreline,
        // hinging on the base edge facing the corridor
        pivot.rotation.y = Math.atan2(perp.x, perp.z) + (off > 0 ? Math.PI : 0);
        model.position.z = -0.21;
        pivot.add(model);
        this.game.scene.add(pivot);
        pivots.push(pivot);
      }

      const targetAngle = trig.mode === 'jump' ? Math.PI / 2 : (lane ? 1.12 : 1.22);
      // world-space barrier AABB at the landing spot. Default spans the whole
      // corridor; span:"lane" (branch section) blocks only that lane.
      const alongX = Math.abs(dir.x) > 0.5;
      const bc = lane
        ? _v.copy(p).addScaledVector(perp, Math.sign(trig.offset) * 2.6)
        : p;
      const across = lane ? 1.6 : 3.6;
      const barrier = trig.mode === 'jump'
        ? aabb(bc.x, C.jumpBarrierHeight / 2, bc.z,
               alongX ? 0.9 : across, C.jumpBarrierHeight / 2, alongX ? across : 0.9)
        : aabb(bc.x, (C.slideBarrierClearance + 3.2) / 2, bc.z,
               alongX ? 0.8 : across, (3.2 - C.slideBarrierClearance) / 2, alongX ? across : 0.8);

      this.shelfTraps.push({
        trig, pivots, targetAngle, barrier,
        state: 'armed',       // armed | falling | fallen | disarmed
        angle: 0,
      });
    }
  }

  // --- run --------------------------------------------------------------------
  start() {
    const g = this.game;
    g.checkpoint = 'chase';
    this.state = 'run';
    this.staggerCount = 0;
    g.player.teleport(LAYOUT.playerSpawn, LAYOUT.spawnYaw, 0);
    g.player.enabled = true;
    g.player.lookEnabled = true;
    g.player.setLookClamp(null);
    this.playerS = this.path.progressOf(g.player.position);
    g.ghost.startChase(this.path, this.playerS);
    g.audio.startDrone();
    g.hud.showDot(true);
    g.hud.showMessage('RUN', 1800);
  }

  reset() { // respawn after death — restart of the chase, never the cutscene
    for (const t of this.shelfTraps) {
      t.state = 'armed'; t.angle = 0;
      for (const pv of t.pivots) pv.rotation.x = 0;
    }
    for (const l of this.lights) {
      l.on = true; l.flicker = 0; l.mat.emissiveIntensity = 1.6;
    }
    if (this.doors.closed) {
      this.doors.closed = false; this.doors.anim = 0;
      this.doors.left.position.x = 30 - 3.1;
      this.doors.right.position.x = 30 + 3.1;
    }
    this.endT = 0;
    this.start();
  }

  // player collision hook: corridor clamp + solid AABBs
  collide = (player) => {
    this.path.clampToCorridor(player.root.position, CONFIG.player.radius);
    const p = player.root.position;
    const r = CONFIG.player.radius;
    for (const box of this.solids) {
      this._pushOut(p, r, player.bodyHeight, box);
    }
    if (this.doors && this.doors.closed) {
      this._pushOut(p, r, player.bodyHeight, aabb(30, 1.6, -262, 2.2, 1.6, 0.15));
    }
  };

  _pushOut(p, r, h, box) {
    if (p.x + r < box.min.x || p.x - r > box.max.x) return;
    if (p.z + r < box.min.z || p.z - r > box.max.z) return;
    if (p.y > box.max.y || p.y + h < box.min.y) return;
    // push out along the shallowest horizontal axis
    const dxMin = (p.x + r) - box.min.x, dxMax = box.max.x - (p.x - r);
    const dzMin = (p.z + r) - box.min.z, dzMax = box.max.z - (p.z - r);
    const m = Math.min(dxMin, dxMax, dzMin, dzMax);
    if (m === dxMin) p.x = box.min.x - r;
    else if (m === dxMax) p.x = box.max.x + r;
    else if (m === dzMin) p.z = box.min.z - r;
    else p.z = box.max.z + r;
  }

  _playerIntersects(box) {
    const p = this.game.player.root.position;
    const r = CONFIG.player.radius;
    const h = this.game.player.bodyHeight;
    return !(p.x + r < box.min.x || p.x - r > box.max.x ||
             p.z + r < box.min.z || p.z - r > box.max.z ||
             p.y > box.max.y || p.y + h < box.min.y);
  }

  _burstBooks(pos, count) {
    for (let i = 0; i < count; i++) {
      const b = makeBook();
      b.position.set(pos.x + (Math.random() - 0.5) * 2, 1 + Math.random() * 1.5,
                     pos.z + (Math.random() - 0.5) * 2);
      b.userData.vel = new THREE.Vector3(
        (Math.random() - 0.5) * 4, 1 + Math.random() * 3, (Math.random() - 0.5) * 4);
      b.userData.rot = new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      b.userData.life = 2.4;
      this.game.scene.add(b);
      this.books.push(b);
    }
  }

  update(dt) {
    const g = this.game;

    // flying books
    for (let i = this.books.length - 1; i >= 0; i--) {
      const b = this.books[i];
      b.userData.life -= dt;
      b.userData.vel.y -= 9.8 * dt;
      b.position.addScaledVector(b.userData.vel, dt);
      if (b.position.y < 0.03) { b.position.y = 0.03; b.userData.vel.set(0, 0, 0); b.userData.rot.set(0, 0, 0); }
      b.rotation.x += b.userData.rot.x * dt;
      b.rotation.z += b.userData.rot.z * dt;
      if (b.userData.life <= 0) { g.scene.remove(b); this.books.splice(i, 1); }
    }

    if (this.state === 'ending') { this._updateEnding(dt); return; }
    if (this.state !== 'run') return;

    const player = g.player;
    player.update(dt, { floorY: 0, collide: this.collide });
    this.playerS = this.path.progressOf(player.position);

    // shelf traps
    for (const trap of this.shelfTraps) {
      if (trap.state === 'armed' && this.playerS > trap.trig.s - C.shelfTriggerLead) {
        trap.state = 'falling';
        g.audio.playShelfFall();
      }
      if (trap.state === 'falling') {
        trap.angle = Math.min(trap.targetAngle, trap.angle + dt * (trap.targetAngle / C.shelfToppleTime) * (0.4 + trap.angle * 1.2));
        for (const pv of trap.pivots) pv.rotation.x = trap.angle;
        if (trap.angle >= trap.targetAngle) {
          trap.state = 'fallen';
          g.audio.playBooksScatter();
          this._burstBooks(this.path.pointAt(trap.trig.s), C.bookBurstCount);
        }
      }
      if (trap.state === 'fallen' && this._playerIntersects(trap.barrier)) {
        // mistimed — stagger, and the ghost closes
        trap.state = 'disarmed';           // stumble through, keep the flow
        this.staggerCount++;
        player.stagger(C.staggerDuration);
        g.hud.staggerFlash();
        g.audio.playShelfFall();
        g.ghost.closeBy(G.staggerCloseBonus);
        if (this.staggerCount >= G.staggersToDeath) g.ghost.lunge();
      }
    }

    // the ghost — one rigid object on the spline, never AI
    const gap = g.ghost.updateChase(dt, this.playerS, player.horizontalSpeed);
    if (gap <= G.killDistance) {
      this.state = 'idle';
      g.death.trigger();
      return;
    }

    // lights fail behind the player as the ghost passes; darkness follows it
    this._lightFailAudioT -= dt;
    for (const l of this.lights) {
      if (l.on && g.ghost.s > l.s) {
        l.on = false; l.flicker = 0.4;
        if (Math.abs(l.s - this.playerS) < 55 && this._lightFailAudioT <= 0) {
          g.audio.playLightFail();
          this._lightFailAudioT = 0.35;
        }
        if (Math.random() < 0.5) this._burstBooks(this.path.pointAt(l.s), 4); // paper flies
      }
      if (l.flicker > 0) {
        l.flicker -= dt;
        l.mat.emissiveIntensity = l.flicker <= 0 ? 0.0
          : (Math.random() < 0.4 ? 1.6 : 0.1);
      }
    }
    // park the light pool at the closest strips that are still alive
    const alive = this.lights.filter(l => l.on)
      .sort((a, b) => Math.abs(a.s - this.playerS) - Math.abs(b.s - this.playerS));
    this.lightPool.forEach((pl, i) => {
      const l = alive[i];
      pl.visible = !!l;
      if (l) pl.position.set(l.mesh.position.x, 3.2, l.mesh.position.z);
      if (l && l.flicker > 0) pl.intensity = l.mat.emissiveIntensity > 0.5 ? 30 : 4;
      else pl.intensity = 30;
    });

    // reading room reached → doors slam, ghost waits at the threshold
    if (this.playerS > this.doorS + 1.5 && !this.doors.closed) {
      this.doors.closed = true;
      g.audio.playDoorSlam();
      g.ghost.freezeAt(this.doorS - 2.5);
      this.state = 'ending';
      this.endT = 0;
      // soft control lock — aim the player at the piano
      player.enabled = false;
      this._endFrom = player.root.position.clone();
      this._endFromYaw = player.yaw;
      this._endFromPitch = player.pitch;
    }
  }

  _updateEnding(dt) {
    const g = this.game;
    this.endT += dt;

    // doors slam fast
    const da = Math.min(1, this.endT / 0.3);
    this.doors.left.position.x = 30 - 3.1 + 2.1 * da;
    this.doors.right.position.x = 30 + 3.1 - 2.1 * da;

    // glide the player to the piano bench
    const f = Math.min(1, this.endT / 1.7);
    const e = f * f * (3 - 2 * f);
    const p = g.player.root.position;
    p.lerpVectors(this._endFrom, LAYOUT.bench, e);
    let dy = 0 - this._endFromYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    g.player.yaw = this._endFromYaw + dy * e;
    g.player.pitch = this._endFromPitch + (-0.55 - this._endFromPitch) * e;
    g.player._sync();

    if (this.endT > 2.0) {
      this.state = 'idle';
      g.hud.showDot(false);
      g.startPiano();
    }
  }
}

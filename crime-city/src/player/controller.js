// Pointer-lock first-person controller: WASD + sprint + jump, AABB collision.
import * as THREE from 'three';
import { PLAYER } from '../core/config.js';
import { bus } from '../core/bus.js';
import { clamp, damp, resolveStatic, resolveCircleRect } from '../core/utils.js';

const SPAWN = new THREE.Vector3(-200, 0, 7);
const SPAWN_YAW = Math.PI / 2 + 0.5; // facing the base sign

export class Player {
  constructor(G) {
    this.G = G;
    this.pos = new THREE.Vector3().copy(SPAWN);
    this.vel = new THREE.Vector3();
    this.yaw = SPAWN_YAW;
    this.pitch = 0;
    this.onGround = true;
    this.hp = PLAYER.hp;
    this.maxHp = PLAYER.hp;
    this.sinceDamage = 99;
    this.bobPhase = 0;
    this.bob = 0;
    this.fov = 75;
    this.dead = false;
    this.shake = 0;
    this._fwd = new THREE.Vector3();
  }

  reset(full = true) {
    this.pos.copy(SPAWN);
    this.vel.set(0, 0, 0);
    this.yaw = SPAWN_YAW; this.pitch = 0;
    if (full) this.hp = this.maxHp;
    this.dead = false;
    this.sinceDamage = 99;
  }

  forwardDir(out) {
    out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    return out;
  }

  aimDir(out) {
    this.G.camera.getWorldDirection(out);
    return out;
  }

  damage(amt, silent = false) {
    if (this.dead) return;
    if (this.G.state?.wonGame) amt *= 0.4; // after winning, the boss is harder to hurt
    this.hp -= amt;
    this.sinceDamage = 0;
    this.shake = Math.min(this.shake + 0.12, 0.4);
    if (!silent) this.G.audio.hurt();
    bus.emit('playerHurt');
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      bus.emit('playerDown');
    }
  }

  update(dt) {
    const { input, camera } = this.G;

    // while driving, the vehicle system owns movement + camera
    if (this.G.vehicle) {
      this.pos.copy(this.G.vehicle.pos);
      this.vel.set(0, 0, 0);
      this.onGround = true;
      this.sinceDamage += dt;
      if (!this.dead && this.sinceDamage > PLAYER.regenDelay && this.hp < this.maxHp) {
        this.hp = Math.min(this.maxHp, this.hp + PLAYER.regen * dt);
      }
      return;
    }

    // ----- look -----
    this.yaw -= input.dx * 0.0022;
    this.pitch = clamp(this.pitch - input.dy * 0.0022, -1.52, 1.52);

    // ----- move -----
    const f = this._fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const rx = -f.z, rz = f.x; // right vector
    let mx = 0, mz = 0;
    if (!this.dead) {
      if (input.down('KeyW')) { mx += f.x; mz += f.z; }
      if (input.down('KeyS')) { mx -= f.x; mz -= f.z; }
      if (input.down('KeyD')) { mx += rx; mz += rz; }
      if (input.down('KeyA')) { mx -= rx; mz -= rz; }
    }
    const moving = (mx || mz);
    const sprint = moving && input.down('ShiftLeft') && input.down('KeyW');
    const speed = sprint ? PLAYER.sprint : PLAYER.walk;
    if (moving) {
      const l = Math.hypot(mx, mz);
      mx /= l; mz /= l;
      this.vel.x = damp(this.vel.x, mx * speed, this.onGround ? 12 : 3, dt);
      this.vel.z = damp(this.vel.z, mz * speed, this.onGround ? 12 : 3, dt);
    } else if (this.onGround) {
      this.vel.x = damp(this.vel.x, 0, 14, dt);
      this.vel.z = damp(this.vel.z, 0, 14, dt);
    }
    if (!this.dead && this.onGround && input.pressed('Space')) {
      this.vel.y = PLAYER.jump;
      this.onGround = false;
    }
    this.vel.y += PLAYER.gravity * dt;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= 0) { this.pos.y = 0; this.vel.y = 0; this.onGround = true; }

    resolveStatic(this.pos, PLAYER.radius, this.G.city.grid, this.pos.y);
    for (const c of this.G.dynamicColliders) resolveCircleRect(this.pos, PLAYER.radius, c, this.pos.y);

    // ----- regen -----
    this.sinceDamage += dt;
    if (!this.dead && this.sinceDamage > PLAYER.regenDelay && this.hp < this.maxHp) {
      const inBase = this.G.base?.playerInside();
      const rate = inBase ? (this.G.state.upgrades.medical ? 60 : PLAYER.regenBase) : PLAYER.regen;
      this.hp = Math.min(this.maxHp, this.hp + rate * dt);
    }

    // ----- camera -----
    const speed2d = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && speed2d > 1) {
      this.bobPhase += dt * (sprint ? 13 : 9);
      this.bob = damp(this.bob, 1, 8, dt);
    } else {
      this.bob = damp(this.bob, 0, 8, dt);
    }
    const bobY = Math.abs(Math.sin(this.bobPhase)) * 0.055 * this.bob;
    this.shake = damp(this.shake, 0, 7, dt);
    const shX = (Math.random() - 0.5) * this.shake;
    const shY = (Math.random() - 0.5) * this.shake;

    camera.position.set(this.pos.x + shX * 0.3, this.pos.y + PLAYER.eye + bobY + shY * 0.3, this.pos.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(this.pitch + shY * 0.06, this.yaw + shX * 0.06, 0);

    this.fov = damp(this.fov, sprint ? 82 : 75, 6, dt);
    if (Math.abs(camera.fov - this.fov) > 0.05) {
      camera.fov = this.fov;
      camera.updateProjectionMatrix();
    }
  }
}

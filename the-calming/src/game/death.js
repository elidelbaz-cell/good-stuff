// ============================================================================
// The ONE death handler, shared by chase and piano.
// Camera is seized and turned to face the ghost — no cut-away. Hold 2s.
// Cut to black. Silence — no stinger, no scream. Restart from the last
// checkpoint (start of chase or start of piano — NEVER the cutscene).
// ============================================================================
import { CONFIG } from '../config.js';

const D = CONFIG.death;

export class DeathHandler {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.phase = null;   // 'turn' | 'hold' | 'black'
    this.t = 0;
    this.fromYaw = 0; this.fromPitch = 0;
    this.toYaw = 0; this.toPitch = 0;
  }

  trigger() {
    if (this.active) return;
    this.active = true;
    this.phase = 'turn';
    this.t = 0;

    const player = this.game.player;
    player.enabled = false;
    player.lookEnabled = false;
    player.vel.set(0, 0, 0);
    player.setLookClamp(null);

    // face the ghost — do not cut away
    const eye = player.eyePosition;
    const g = this.game.ghost.mesh.position;
    const dx = g.x - eye.x, dy = (g.y + 1.8) - eye.y, dz = g.z - eye.z;
    this.fromYaw = player.yaw;
    this.fromPitch = player.pitch;
    this.toYaw = Math.atan2(-dx, -dz);   // player forward is -Z at yaw 0
    // shortest arc
    while (this.toYaw - this.fromYaw > Math.PI) this.toYaw -= Math.PI * 2;
    while (this.toYaw - this.fromYaw < -Math.PI) this.toYaw += Math.PI * 2;
    this.toPitch = Math.atan2(dy, Math.hypot(dx, dz));
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const player = this.game.player;

    if (this.phase === 'turn') {
      const f = Math.min(1, this.t / D.faceGhostTime);
      const e = f * f * (3 - 2 * f); // smoothstep
      player.yaw = this.fromYaw + (this.toYaw - this.fromYaw) * e;
      player.pitch = this.fromPitch + (this.toPitch - this.fromPitch) * e;
      player._sync();
      if (this.t >= D.faceGhostTime) { this.phase = 'hold'; this.t = 0; }
    } else if (this.phase === 'hold') {
      // held on the ghost. it keeps coming. nothing else happens.
      if (this.t >= D.holdTime) {
        this.phase = 'black';
        this.t = 0;
        this.game.hud.blackout();
        this.game.audio.silenceAll();
      }
    } else if (this.phase === 'black') {
      if (this.t >= D.blackTime) {
        this.active = false;
        this.phase = null;
        this.game.respawn();  // last checkpoint — never the cutscene
      }
    }
  }
}

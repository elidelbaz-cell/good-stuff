// Canvas minimap: static city baked once, dynamic dots per frame.
import { CITY, ROADS, BASE } from '../core/config.js';

const WORLD = 560;             // world units covered by the static canvas
const HALF = WORLD / 2;

export class Minimap {
  constructor(G) {
    this.G = G;
    this.canvas = document.getElementById('minimap');
    this.ctx = this.canvas.getContext('2d');
    this.zoom = 1.9;           // screen px per world unit
    this.bakeStatic();
  }

  bakeStatic() {
    const c = document.createElement('canvas');
    c.width = WORLD; c.height = WORLD;
    const x = c.getContext('2d');
    // water
    x.fillStyle = '#173d54';
    x.fillRect(0, 0, WORLD, WORLD);
    // land / asphalt
    x.fillStyle = '#33363e';
    x.fillRect(CITY.waterX + HALF, 0, WORLD, WORLD);
    // dock strip
    x.fillStyle = '#5c5f66';
    x.fillRect(CITY.dock.x0 + HALF, 0, CITY.dock.x1 - CITY.dock.x0, WORLD);
    // blocks
    for (let i = 0; i < CITY.blocks; i++) for (let j = 0; j < CITY.blocks; j++) {
      const bx = -150 + i * 60, bz = -150 + j * 60;
      const isPark = i === CITY.parkBlock[0] && j === CITY.parkBlock[1];
      x.fillStyle = '#6b6f78';
      x.fillRect(bx - 24 + HALF, bz - 24 + HALF, 48, 48);
      x.fillStyle = isPark ? '#3f7d3f' : '#4a4e57';
      x.fillRect(bx - 20 + HALF, bz - 20 + HALF, 40, 40);
    }
    // base building
    x.fillStyle = '#8a6d1f';
    x.fillRect(BASE.x0 + HALF, BASE.z0 + HALF, BASE.x1 - BASE.x0, BASE.z1 - BASE.z0);
    this.static = c;
  }

  update() {
    const G = this.G;
    const p = G.player;
    if (!p) return;
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const z = this.zoom;
    ctx.clearRect(0, 0, W, H);

    // static backdrop centered on player
    const srcW = W / z, srcH = H / z;
    ctx.drawImage(this.static,
      p.pos.x + HALF - srcW / 2, p.pos.z + HALF - srcH / 2, srcW, srcH,
      0, 0, W, H);

    const dot = (wx, wz, color, r = 3.5) => {
      const sx = (wx - p.pos.x) * z + W / 2;
      const sy = (wz - p.pos.z) * z + H / 2;
      if (sx < -8 || sx > W + 8 || sy < -8 || sy > H + 8) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    };

    // base marker
    const mob = G.state?.mobColor || '#ffd24a';
    dot((BASE.x0 + BASE.x1) / 2, (BASE.z0 + BASE.z1) / 2, mob, 5);

    // turf
    for (const t of G.city.turfSpots) dot(t.x, t.z, t.owned ? mob : '#9aa0ad', 3);
    // bodegas
    for (const b of G.city.bodegas) dot(b.x, b.z, '#ffd24a', 2.2);
    // drug corners
    for (const s of G.activities?.drugSpots || []) dot(s.x, s.z, '#2fbf4f', 2.4);
    // drivable vehicles (heli / ship / cars)
    for (const v of G.vehicles?.list || []) {
      if (v.driven) continue;
      dot(v.pos.x, v.pos.z, v.type === 'heli' || v.type === 'ship' ? '#22d3ee' : '#c9c9d6', v.type === 'ship' ? 5 : 3);
    }
    // henchmen
    if (G.squad) for (const u of G.squad.units) if (u.state !== 'down') dot(u.pos.x, u.pos.z, '#6dff7a', 2.4);
    // cops (lookout upgrade, or always during the finale)
    if (G.police && (G.state?.upgrades.lookout || G.finale?.active)) {
      for (const c of G.police.cops) if (c.alive) dot(c.pos.x, c.pos.z, '#ff4a3d', 2.6);
      for (const c of G.police.cars) if (!c.dead) dot(c.grp.position.x, c.grp.position.z, '#ff4a3d', 3.2);
    }
    // objective marker
    if (G.objectiveMarker) {
      const t = performance.now() / 300;
      dot(G.objectiveMarker.x, G.objectiveMarker.z, `rgba(255,210,74,${0.5 + 0.5 * Math.sin(t)})`, 5);
    }

    // player arrow
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-p.yaw);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

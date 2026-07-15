// ============================================================================
// PathLine — the chase spine. A polyline with arc-length parametrisation.
// The ghost glides along it (this IS the "spline" — no AI), the player's
// progress is measured against it, and the corridor is collided against it
// (the player is kept within `width` of the centreline — walls for free).
// ============================================================================
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

export class PathLine {
  // points: THREE.Vector3[] (axis-aligned segments recommended)
  // widths: per-segment corridor width (metres) or a single number
  constructor(points, widths = 8) {
    this.pts = points;
    this.segs = [];
    let cum = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const dir = _v.copy(b).sub(a);
      const len = dir.length();
      this.segs.push({
        a, b,
        dir: dir.clone().normalize(),
        len,
        s0: cum,
        width: Array.isArray(widths) ? widths[i] : widths,
      });
      cum += len;
    }
    this.length = cum;
  }

  pointAt(s, out = new THREE.Vector3()) {
    s = Math.max(0, Math.min(this.length, s));
    for (const seg of this.segs) {
      if (s <= seg.s0 + seg.len || seg === this.segs[this.segs.length - 1]) {
        return out.copy(seg.dir).multiplyScalar(s - seg.s0).add(seg.a);
      }
    }
    return out.copy(this.pts[this.pts.length - 1]);
  }

  dirAt(s, out = new THREE.Vector3()) {
    s = Math.max(0, Math.min(this.length, s));
    for (const seg of this.segs) {
      if (s <= seg.s0 + seg.len || seg === this.segs[this.segs.length - 1]) {
        return out.copy(seg.dir);
      }
    }
    return out.copy(this.segs[this.segs.length - 1].dir);
  }

  // Progress of a world position: the furthest s among segments whose lateral
  // corridor contains the point (at corners both corridors count — take max).
  progressOf(pos) {
    let insideBest = -1, nearestS = 0, nearestD = Infinity;
    for (const seg of this.segs) {
      const t = Math.max(0, Math.min(seg.len, _v.copy(pos).sub(seg.a).dot(seg.dir)));
      _w.copy(seg.dir).multiplyScalar(t).add(seg.a);
      const d = Math.hypot(pos.x - _w.x, pos.z - _w.z);
      const s = seg.s0 + t;
      if (d < seg.width * 0.5 + 0.001 && s > insideBest) insideBest = s;
      if (d < nearestD) { nearestD = d; nearestS = s; }
    }
    return insideBest >= 0 ? insideBest : nearestS;
  }

  // Keep pos within the corridor (XZ only). Valid if inside ANY segment's
  // corridor (this is what makes L-corners work). Otherwise push into the
  // nearest one. radius = player radius.
  clampToCorridor(pos, radius) {
    let bestSeg = null, bestPush = Infinity, bestPoint = null;
    for (const seg of this.segs) {
      const t = Math.max(0, Math.min(seg.len, _v.copy(pos).sub(seg.a).dot(seg.dir)));
      _w.copy(seg.dir).multiplyScalar(t).add(seg.a);
      const dx = pos.x - _w.x, dz = pos.z - _w.z;
      const d = Math.hypot(dx, dz);
      const limit = seg.width * 0.5 - radius;
      if (d <= limit) return;                       // inside somewhere → fine
      const pen = d - limit;
      if (pen < bestPush) { bestPush = pen; bestSeg = seg; bestPoint = _w.clone(); }
    }
    if (!bestSeg) return;
    const limit = bestSeg.width * 0.5 - radius;
    const dx = pos.x - bestPoint.x, dz = pos.z - bestPoint.z;
    const d = Math.hypot(dx, dz) || 1;
    pos.x = bestPoint.x + (dx / d) * limit;
    pos.z = bestPoint.z + (dz / d) * limit;
  }
}

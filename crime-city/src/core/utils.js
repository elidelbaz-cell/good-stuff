import * as THREE from 'three';

export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
// framerate-independent exponential smoothing
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export const fmtMoney = (n) => '$' + Math.round(n).toLocaleString('en-US');

// ---------- geometry / material caches ----------
const geoCache = new Map();
export function box(w, h, d) {
  const key = `${w},${h},${d}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(key);
}
const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
  return matCache.get(key);
}
export function mesh(w, h, d, color, opts) {
  const m = new THREE.Mesh(box(w, h, d), mat(color, opts));
  m.castShadow = true;
  return m;
}

// ---------- AABB collision ----------
// collider: { x0, x1, z0, z1, y1 } (y0 assumed 0). Entities are circles on XZ.

export class ColliderGrid {
  constructor(cell = 40) { this.cell = cell; this.map = new Map(); this.all = []; }
  key(cx, cz) { return cx + ',' + cz; }
  add(c) {
    this.all.push(c);
    const c0x = Math.floor(c.x0 / this.cell), c1x = Math.floor(c.x1 / this.cell);
    const c0z = Math.floor(c.z0 / this.cell), c1z = Math.floor(c.z1 / this.cell);
    for (let cx = c0x; cx <= c1x; cx++) for (let cz = c0z; cz <= c1z; cz++) {
      const k = this.key(cx, cz);
      if (!this.map.has(k)) this.map.set(k, []);
      this.map.get(k).push(c);
    }
  }
  query(x, z, r, out) {
    out.length = 0;
    const c0x = Math.floor((x - r) / this.cell), c1x = Math.floor((x + r) / this.cell);
    const c0z = Math.floor((z - r) / this.cell), c1z = Math.floor((z + r) / this.cell);
    for (let cx = c0x; cx <= c1x; cx++) for (let cz = c0z; cz <= c1z; cz++) {
      const list = this.map.get(this.key(cx, cz));
      if (list) for (const c of list) if (!out.includes(c)) out.push(c);
    }
    return out;
  }
}

const _q = [];
// Push a circle (x,z,r) out of static colliders. pos is THREE.Vector3; only pushes if feet below collider top.
export function resolveStatic(pos, r, grid, feetY = 0) {
  grid.query(pos.x, pos.z, r + 1, _q);
  for (const c of _q) resolveCircleRect(pos, r, c, feetY);
}
export function resolveCircleRect(pos, r, c, feetY = 0) {
  if (c.y1 !== undefined && feetY >= c.y1 - 0.01) return;
  const cx = clamp(pos.x, c.x0, c.x1);
  const cz = clamp(pos.z, c.z0, c.z1);
  let dx = pos.x - cx, dz = pos.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2), push = (r - d) / d;
    pos.x += dx * push; pos.z += dz * push;
  } else {
    // center inside rect: push out along smallest overlap
    const l = pos.x - c.x0, rr = c.x1 - pos.x, t = pos.z - c.z0, b = c.z1 - pos.z;
    const m = Math.min(l, rr, t, b);
    if (m === l) pos.x = c.x0 - r; else if (m === rr) pos.x = c.x1 + r;
    else if (m === t) pos.z = c.z0 - r; else pos.z = c.z1 + r;
  }
}

// Ray vs collider set (2D-ish slab test with height check). o, d are THREE.Vector3, d normalized.
export function raycastColliders(o, d, maxDist, grid) {
  let best = Infinity;
  // coarse: walk cells along the ray
  const step = grid.cell * 0.9;
  const seen = new Set();
  for (let t = 0; t <= maxDist + step; t += step) {
    const x = o.x + d.x * Math.min(t, maxDist), z = o.z + d.z * Math.min(t, maxDist);
    const k = Math.floor(x / grid.cell) + ',' + Math.floor(z / grid.cell);
    if (seen.has(k)) continue;
    seen.add(k);
    const list = grid.map.get(k);
    if (!list) continue;
    for (const c of list) {
      const hit = rayAABB(o, d, c);
      if (hit !== null && hit < best && hit <= maxDist) best = hit;
    }
  }
  return best === Infinity ? null : best;
}

export function rayAABB(o, d, c) {
  const y0 = 0, y1 = c.y1 ?? 100;
  let tmin = 0, tmax = Infinity;
  const axes = [[o.x, d.x, c.x0, c.x1], [o.y, d.y, y0, y1], [o.z, d.z, c.z0, c.z1]];
  for (const [ov, dv, lo, hi] of axes) {
    if (Math.abs(dv) < 1e-9) { if (ov < lo || ov > hi) return null; continue; }
    let t1 = (lo - ov) / dv, t2 = (hi - ov) / dv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

// Ray vs vertical cylinder (entity). Returns dist or null.
export function rayCylinder(o, d, cx, cz, r, y0, y1, maxDist) {
  const ox = o.x - cx, oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  const b = 2 * (ox * d.x + oz * d.z);
  const cc = ox * ox + oz * oz - r * r;
  if (a < 1e-9) return null;
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) t = (-b + sq) / (2 * a);
  if (t < 0 || t > maxDist) return null;
  const y = o.y + d.y * t;
  if (y < y0 || y > y1) return null;
  return t;
}

export function dist2D(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); }

export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

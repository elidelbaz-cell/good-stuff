/* =========================================================================
 * util.js — shared config, math helpers, small utilities
 * Loaded as a classic script; top-level `const`/`class` are shared across
 * all game scripts via the global lexical scope.
 * ========================================================================= */

const CFG = {
  // Pitch dimensions (arcade / Volta-style indoor scale). z = length, x = width.
  FIELD:  { length: 84, width: 54, halfL: 42, halfW: 27 },
  LINES:  { halfL: 40, halfW: 25 },      // painted markings sit inside the boards
  GOAL:   { halfWidth: 5, height: 3.2, depth: 2.4, postR: 0.13, lineZ: 40 },
  BALL:   { r: 0.36, gravity: 22, restitution: 0.5, airDrag: 0.16 },
  PLAYER: {
    eye: 1.62, radius: 0.55, height: 1.8,
    walk: 5.5, run: 9.2, sprint: 13.0,
    accel: 55, turn: 12,
  },
  CONTROL: { radius: 1.55, dribbleAhead: 1.15, kickRange: 2.1 },
  TEAM_SIZE: 5,                          // includes the goalkeeper
  MATCH: { half: 90 },                   // match-clock seconds shown per half
  colors: {
    home: 0x2f6bff, homeDark: 0x1b3fa0, homeName: 'BLU',
    away: 0xff3b3b, awayDark: 0x9a1616, awayName: 'RED',
    skin: 0xdca079, boots: 0x1c1c22, grass: 0x2f9e44,
  },
};

// --- tiny math helpers -----------------------------------------------------
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp  = (a, b, t) => a + (b - a) * t;
const rand  = (a, b) => a + Math.random() * (b - a);
const sign  = (v) => (v < 0 ? -1 : 1);
const TAU   = Math.PI * 2;

// Move `cur` toward `target` by at most `maxStep` (scalar, for angles/speeds).
function approach(cur, target, maxStep) {
  const d = target - cur;
  if (Math.abs(d) <= maxStep) return target;
  return cur + Math.sign(d) * maxStep;
}

// Shortest signed angular difference b-a wrapped to [-PI, PI].
function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// Horizontal (xz-plane) distance between two THREE.Vector3.
function distXZ(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return Math.hypot(dx, dz);
}

// Reusable scratch vectors to avoid per-frame allocation.
const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

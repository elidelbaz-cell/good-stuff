// Chunky low-poly people built from cached boxes. Group origin is at the feet.
import * as THREE from 'three';
import { box, mat, pick } from '../core/utils.js';

const SKINS = ['#e8b48c', '#c98d5f', '#8a5a34', '#f0c8a0', '#6e4526'];
const SHIRTS = ['#c94f4f', '#4f7dc9', '#4fc96a', '#c9b04f', '#9a4fc9', '#c97f4f', '#7d8a99', '#e3e3e3'];
const PANTS = ['#2e3440', '#4a3b2a', '#37474f', '#5c4033', '#263238'];

export function makePerson({ shirt, pants, skin, hat = null, hatColor = '#222633', prop = null } = {}) {
  shirt = shirt || pick(SHIRTS);
  pants = pants || pick(PANTS);
  skin = skin || pick(SKINS);

  const group = new THREE.Group();
  const part = (w, h, d, color, x, y, z, parent = group) => {
    const m = new THREE.Mesh(box(w, h, d), mat(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  // legs (pivot at hip)
  const legL = new THREE.Group(); legL.position.set(-0.15, 0.85, 0); group.add(legL);
  const legR = new THREE.Group(); legR.position.set(0.15, 0.85, 0); group.add(legR);
  part(0.22, 0.85, 0.26, pants, 0, -0.425, 0, legL);
  part(0.22, 0.85, 0.26, pants, 0, -0.425, 0, legR);

  // torso
  const torso = part(0.62, 0.62, 0.34, shirt, 0, 1.16, 0);

  // arms (pivot at shoulder)
  const armL = new THREE.Group(); armL.position.set(-0.4, 1.42, 0); group.add(armL);
  const armR = new THREE.Group(); armR.position.set(0.4, 1.42, 0); group.add(armR);
  part(0.17, 0.62, 0.2, shirt, 0, -0.26, 0, armL);
  part(0.17, 0.62, 0.2, shirt, 0, -0.26, 0, armR);

  // head
  const head = part(0.34, 0.36, 0.32, skin, 0, 1.66, 0);

  if (hat === 'cap') {
    part(0.38, 0.11, 0.38, hatColor, 0, 1.89, 0);
    part(0.32, 0.05, 0.18, hatColor, 0, 1.86, 0.26);
  } else if (hat === 'helmet') {
    part(0.42, 0.3, 0.44, hatColor, 0, 1.92, 0);
  } else if (hat === 'fedora') {
    part(0.52, 0.05, 0.52, hatColor, 0, 1.85, 0);
    part(0.32, 0.2, 0.36, hatColor, 0, 1.96, 0);
  }

  // handheld prop, attached to the right arm so aim poses carry it
  let propMesh = null;
  if (prop === 'pistol') {
    propMesh = part(0.08, 0.12, 0.34, '#1d2026', 0, -0.55, -0.18, armR);
  } else if (prop === 'tommy') {
    propMesh = part(0.1, 0.2, 0.7, '#3a2b1c', 0, -0.55, -0.3, armR);
  } else if (prop === 'shotgun') {
    propMesh = part(0.09, 0.12, 0.85, '#4a352c', 0, -0.55, -0.32, armR);
  } else if (prop === 'rifle') {
    propMesh = part(0.08, 0.12, 0.95, '#2b2f36', 0, -0.55, -0.35, armR);
  } else if (prop === 'bat') {
    propMesh = part(0.09, 0.8, 0.09, '#b08d57', 0, -0.7, 0, armR);
  } else if (prop === 'shield') {
    propMesh = part(0.5, 0.9, 0.06, '#1c2c47', 0, -0.4, -0.3, armL);
  }

  return { group, legL, legR, armL, armR, torso, head, propMesh };
}

export function walkAnim(p, phase, amp = 0.65) {
  const s = Math.sin(phase);
  p.legL.rotation.x = s * amp;
  p.legR.rotation.x = -s * amp;
  p.armL.rotation.x = -s * amp * 0.7;
  if (!p.aiming) p.armR.rotation.x = s * amp * 0.7;
  p.group.position.y = Math.abs(Math.cos(phase)) * 0.05;
}

export function aimPose(p, on) {
  p.aiming = on;
  p.armR.rotation.x = on ? -1.45 : 0;
}

export function stillPose(p) {
  p.legL.rotation.x = 0; p.legR.rotation.x = 0;
  p.armL.rotation.x = 0;
  if (!p.aiming) p.armR.rotation.x = 0;
}

// Simple screen-space health bar out of two sprites, anchored above the head.
const barMat = () => new THREE.SpriteMaterial({ depthTest: false });
export function makeHealthBar(color = '#6dff7a', y = 2.25, w = 1.1) {
  const grp = new THREE.Group();
  grp.position.y = y;
  const bg = new THREE.Sprite(barMat());
  bg.material.color.set('#14161f');
  bg.center.set(0.5, 0.5);
  bg.scale.set(w, 0.12, 1);
  const fg = new THREE.Sprite(barMat());
  fg.material.color.set(color);
  fg.center.set(0, 0.5);
  fg.position.x = 0;
  fg.scale.set(w - 0.04, 0.08, 1);
  grp.add(bg, fg);
  grp.renderOrder = 5;
  const set = (frac) => {
    fg.scale.x = Math.max(0.001, (w - 0.04) * frac);
    fg.material.color.set(frac > 0.5 ? color : frac > 0.25 ? '#ffd24a' : '#ff4a3d');
    // keep the fill visually anchored to the bar's left edge
    fg.position.x = -(w - 0.04) / 2;
  };
  set(1);
  return { grp, set, bg, fg };
}

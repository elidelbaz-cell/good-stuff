// ============================================================================
// Placeholder model factories — boxes and capsules, per the golden rule.
// Each factory returns a fresh Group whose pivot is bottom-centre, matching
// what importMeshyFBX() produces, so swapping placeholder → real asset is a
// manifest change and nothing else.
// root.userData.material is the primary material (the ghost's emissive is
// driven through it exactly as the real emission map will be).
// ============================================================================
import * as THREE from 'three';

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0, ...opts });
}

export const Placeholders = {

  // The ghost — a tall drifting shadow. One rigid object, no skeleton.
  shadow() {
    const root = new THREE.Group();
    const m = mat(0x08080e, {
      emissive: new THREE.Color(0x7f8cff),
      emissiveIntensity: 0.3,
      roughness: 1.0,
      transparent: true,
      opacity: 0.92,
    });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.62, 2.2, 8), m);
    body.position.y = 1.1;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 6), m);
    head.position.y = 2.28;
    // ragged hem
    for (let i = 0; i < 5; i++) {
      const rag = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.5 + Math.random() * 0.35, 5), m);
      const a = (i / 5) * Math.PI * 2;
      rag.position.set(Math.cos(a) * 0.42, 0.28, Math.sin(a) * 0.42);
      rag.rotation.x = Math.PI;
      root.add(rag);
    }
    root.add(body, head);
    root.userData.material = m;
    root.userData.isPlaceholder = true;
    return root;
  },

  // Silhouette man / family / body. Static.
  human() {
    const root = new THREE.Group();
    const m = mat(0x15151a, { roughness: 1.0 });
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.85, 0.24), m);
    legs.position.y = 0.425;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.62, 0.26), m);
    torso.position.y = 1.16;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8), m);
    head.position.y = 1.62;
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.12), m);
    armL.position.set(-0.29, 1.15, 0);
    const armR = armL.clone(); armR.position.x = 0.29;
    root.add(legs, torso, head, armL, armR);
    root.userData.material = m;
    root.userData.isPlaceholder = true;
    return root;
  },

  // Piano body only — the 7 key-caps/hitboxes are built separately by
  // src/game/piano.js from assets/data/piano_keys.json and layered on top.
  piano() {
    const root = new THREE.Group();
    const m = mat(0x14100e, { roughness: 0.4, metalness: 0.15 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.05, 0.62), m);
    body.position.set(0, 0.725, -0.05);
    const keybed = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.3), mat(0x0a0806));
    keybed.position.set(0, 0.745, 0.3);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.08), m);
    legL.position.set(-0.62, 0.21, 0.32);
    const legR = legL.clone(); legR.position.x = 0.62;
    root.add(body, keybed, legL, legR);
    root.userData.material = m;
    root.userData.isPlaceholder = true;
    return root;
  },

  // Falling bookshelf — one mesh, reused, topples as a rigid body.
  bookshelf() {
    const root = new THREE.Group();
    const frame = mat(0x2a2018);
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.2, 0.42), frame);
    side.position.set(-0.62, 1.1, 0);
    const side2 = side.clone(); side2.position.x = 0.62;
    root.add(side, side2);
    for (let i = 0; i < 5; i++) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.045, 0.42), frame);
      shelf.position.y = 0.12 + i * 0.5;
      root.add(shelf);
      // spines
      const books = new THREE.Mesh(
        new THREE.BoxGeometry(1.18, 0.34, 0.3),
        mat(new THREE.Color().setHSL(0.05 + Math.random() * 0.1, 0.25, 0.16)));
      books.position.set(0, 0.32 + i * 0.5, -0.02);
      root.add(books);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.2, 0.03), frame);
    back.position.set(0, 1.1, -0.19);
    root.add(back);
    root.userData.material = frame;
    root.userData.isPlaceholder = true;
    return root;
  },
};

// A single loose book — for the scatter bursts in the chase.
export function makeBook() {
  const m = mat(new THREE.Color().setHSL(Math.random() * 0.12, 0.3, 0.15 + Math.random() * 0.15));
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.2), m);
  return b;
}

// A rigid placeholder hand (no skeleton — pure position-lerp object).
export function makeHandMesh(isLeft) {
  const root = new THREE.Group();
  const skin = mat(0x8a7362, { roughness: 0.9 });
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.03, 0.1), skin);
  root.add(palm);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.022, 0.065), skin);
    f.position.set(-0.031 + i * 0.021, -0.004, 0.075);
    f.rotation.x = 0.35;
    root.add(f);
  }
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.02, 0.05), skin);
  thumb.position.set(isLeft ? 0.052 : -0.052, -0.006, 0.02);
  thumb.rotation.y = isLeft ? -0.5 : 0.5;
  root.add(thumb);
  root.userData.material = skin;
  return root;
}

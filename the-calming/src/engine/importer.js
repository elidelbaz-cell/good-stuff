// ============================================================================
// Meshy FBX import pipeline.
//
// Every FBX we receive is a static mesh whose PBR maps ship as loose PNGs
// next to it (<base>_texture/_normal/_metallic/_roughness/_emission.png).
// The FBX does NOT embed them and carries broken/absolute paths, so we
// reconnect each map to the material BY FILENAME — otherwise it imports grey.
//
// We also assume each file is wrong in at least one of: scale, up-axis,
// pivot. So every import is: rescale to targetHeight metres, optional up-axis
// fix, re-centre pivot to bottom-centre, bake. QA every asset in
// tools/turntable.html?asset=<name> before wiring it into a scene.
// ============================================================================
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const MAP_SLOTS = [
  ['map',          '_texture'],
  ['normalMap',    '_normal'],
  ['metalnessMap', '_metallic'],
  ['roughnessMap', '_roughness'],
  ['emissiveMap',  '_emission'],
];

async function tryLoadTexture(url) {
  // Probe first so a missing map is silent, not a console error storm.
  try {
    const head = await fetch(url, { method: 'HEAD' });
    if (!head.ok) return null;
    return await new THREE.TextureLoader().loadAsync(url);
  } catch (_) { return null; }
}

export async function importMeshyFBX(def) {
  // def: { file, targetHeight, upAxisFix, yaw } — see assets/manifest.js
  const group = await new FBXLoader().loadAsync(def.file);

  const dir = def.file.slice(0, def.file.lastIndexOf('/') + 1);
  const base = def.file.slice(def.file.lastIndexOf('/') + 1).replace(/\.fbx$/i, '');

  // --- reconnect the texture set by filename -------------------------------
  const params = {};
  for (const [slot, suffix] of MAP_SLOTS) {
    const tex = await tryLoadTexture(`${dir}${base}${suffix}.png`);
    if (tex) {
      if (slot === 'map') tex.colorSpace = THREE.SRGBColorSpace;
      params[slot] = tex;
    }
  }
  const material = new THREE.MeshStandardMaterial({
    ...params,
    emissive: params.emissiveMap ? 0xffffff : 0x000000,
    emissiveIntensity: params.emissiveMap ? 1.0 : 0.0,
  });
  // Meshy exports one texture set per file → one material for all sub-meshes.
  group.traverse(o => { if (o.isMesh) o.material = material; });

  // --- orientation fixes ----------------------------------------------------
  if (def.upAxisFix === 'z-up') group.rotation.x = -Math.PI / 2;
  if (def.yaw) group.rotation.y += THREE.MathUtils.degToRad(def.yaw);
  group.updateMatrixWorld(true);

  // --- normalise scale to metres -------------------------------------------
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  if (size.y > 0 && def.targetHeight) group.scale.multiplyScalar(def.targetHeight / size.y);
  group.updateMatrixWorld(true);

  // --- re-centre pivot to bottom-centre, bake into a clean root -------------
  const box2 = new THREE.Box3().setFromObject(group);
  const c = box2.getCenter(new THREE.Vector3());
  group.position.x -= c.x;
  group.position.z -= c.z;
  group.position.y -= box2.min.y;

  const root = new THREE.Group();
  root.name = `import:${base}`;
  root.add(group);
  root.userData.material = material;   // handle for emissive driving etc.
  root.userData.isPlaceholder = false;
  return root;
}

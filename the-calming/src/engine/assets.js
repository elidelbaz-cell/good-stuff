// ============================================================================
// Asset resolver. The game asks for logical names; this returns the real
// import when the manifest points at a file, the placeholder when it doesn't.
// Swapping placeholder → real is a single manifest edit — no code changes.
// ============================================================================
import { MANIFEST } from '../../assets/manifest.js';
import { importMeshyFBX } from './importer.js';
import { Placeholders } from './placeholders.js';

export class Assets {
  // Returns a fresh Object3D each call (models are placed multiple times).
  async getModel(name) {
    const def = MANIFEST.models[name];
    if (def && def.file) {
      try {
        return await importMeshyFBX(def);
      } catch (e) {
        console.error(`[assets] import of "${name}" (${def.file}) failed — falling back to placeholder`, e);
      }
    }
    const factory = Placeholders[name];
    if (!factory) throw new Error(`[assets] unknown model "${name}"`);
    return factory();
  }

  // Preload every audio file the manifest actually points at.
  async loadAllAudio(audioEngine) {
    const jobs = [];
    for (const [name, def] of Object.entries(MANIFEST.audio)) {
      if (def.file) jobs.push(audioEngine.loadBuffer(name, def.file));
    }
    await Promise.all(jobs);
  }

  async getJSON(key) {
    const url = MANIFEST.data[key];
    const res = await fetch(url);
    if (!res.ok) throw new Error(`[assets] failed to load data "${key}" from ${url}`);
    return res.json();
  }
}

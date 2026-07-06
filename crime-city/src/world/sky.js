// Day/night cycle: lighting, fog, sky color, and every "lights up at night" material.
import * as THREE from 'three';
import { damp, lerp } from '../core/utils.js';

const DAY = { sky: new THREE.Color('#87c5ea'), sun: new THREE.Color('#fff2d8'), sunI: 1.15, hemiI: 0.85, fog: [260, 900] };
const NIGHT = { sky: new THREE.Color('#0b1026'), sun: new THREE.Color('#8fa8ff'), sunI: 0.22, hemiI: 0.3, fog: [170, 650] };

export class Sky {
  constructor(G) {
    this.G = G;
    this.factor = 0;       // 0 = day, 1 = night
    this.target = 0;

    this.hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a63, DAY.hemiI);
    G.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(DAY.sun, DAY.sunI);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80;
    sc.near = 10; sc.far = 320;
    this.sun.shadow.bias = -0.0004;
    G.scene.add(this.sun, this.sun.target);

    G.scene.background = DAY.sky.clone();
    G.scene.fog = new THREE.Fog(DAY.sky.clone(), ...DAY.fog);

    this._sky = new THREE.Color();
  }

  setNight(n) { this.target = n ? 1 : 0; }
  get isNight() { return this.target === 1; }
  toggle() { this.target = 1 - this.target; return this.isNight; }

  update(dt, playerPos) {
    this.factor = damp(this.factor, this.target, 2.2, dt);
    const f = this.factor;

    this._sky.copy(DAY.sky).lerp(NIGHT.sky, f);
    this.G.scene.background.copy(this._sky);
    this.G.scene.fog.color.copy(this._sky);
    this.G.scene.fog.near = lerp(DAY.fog[0], NIGHT.fog[0], f);
    this.G.scene.fog.far = lerp(DAY.fog[1], NIGHT.fog[1], f);

    this.sun.color.copy(DAY.sun).lerp(NIGHT.sun, f);
    this.sun.intensity = lerp(DAY.sunI, NIGHT.sunI, f);
    this.hemi.intensity = lerp(DAY.hemiI, NIGHT.hemiI, f);

    // shadow frustum follows the player
    this.sun.position.set(playerPos.x + 70, 110, playerPos.z + 40);
    this.sun.target.position.set(playerPos.x, 0, playerPos.z);

    // everything that glows at night
    const mats = this.G.city?.nightMats;
    if (mats) for (const m of mats) m.emissiveIntensity = f * (m.userData.nightMax ?? 1);
  }
}

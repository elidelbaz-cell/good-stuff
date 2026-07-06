/* =========================================================================
 * world.js — builds the static scene: sky, lights, pitch, goals, stadium.
 * ========================================================================= */

class World {
  constructor(scene) {
    this.scene = scene;
    this.goals = {};          // { home:{...}, away:{...} } post geometry for physics
    this._build();
  }

  _build() {
    const scene = this.scene;
    const F = CFG.FIELD, GO = CFG.GOAL;

    // sky + distance fog
    scene.background = new THREE.Color(0x86c5ff);
    scene.fog = new THREE.Fog(0x9fd0ff, 120, 300);

    // lighting: soft sky/ground fill + a warm key light (kept calm so the
    // grass reads as rich green rather than blowing out)
    scene.add(new THREE.HemisphereLight(0xbfe0ff, 0x2e6b34, 0.72));
    const sun = new THREE.DirectionalLight(0xfff2d8, 0.8);
    sun.position.set(40, 80, 20);
    scene.add(sun);

    // grass runoff base (larger than boards, textured pitch on top)
    const baseMat = new THREE.MeshLambertMaterial({ color: 0x287a34 });
    const base = new THREE.Mesh(new THREE.PlaneGeometry(F.width + 60, F.length + 60), baseMat);
    base.rotation.x = -Math.PI / 2;
    base.position.y = -0.02;
    scene.add(base);

    const pitchMat = new THREE.MeshLambertMaterial({ map: Textures.pitch() });
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(F.width, F.length), pitchMat);
    pitch.rotation.x = -Math.PI / 2;
    scene.add(pitch);

    this._buildBoards();
    this._buildStadium();
    this._buildGoal('home', -1);   // blue defends -z, so blue's goal is at z=-40
    this._buildGoal('away', +1);   // red's goal at z=+40 (blue attacks this one)
  }

  // Low sponsor boards ringing the touchlines / goal lines.
  _buildBoards() {
    const F = CFG.FIELD;
    const mat = new THREE.MeshLambertMaterial({ map: Textures.ads() });
    const h = 1.0, t = 0.2;
    const add = (w, x, z, ry) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), mat);
      m.position.set(x, h / 2, z); m.rotation.y = ry; this.scene.add(m);
    };
    const gap = 1.5;
    add(F.width, 0, -(F.halfL + gap), 0);
    add(F.width, 0, F.halfL + gap, 0);
    add(F.length, -(F.halfW + gap), 0, Math.PI / 2);
    add(F.length, F.halfW + gap, 0, Math.PI / 2);
  }

  // Crowd stands: a ring of tall walls set well outside the boards so the
  // pitch and plenty of sky stay visible. Each is a raked plane (leaning
  // back, away from the pitch) sitting on a dark fascia wall.
  _buildStadium() {
    const F = CFG.FIELD;
    const crowdMat = new THREE.MeshLambertMaterial({
      map: Textures.crowd(), side: THREE.DoubleSide,
    });
    const fasciaMat = new THREE.MeshLambertMaterial({ color: 0x2b303c });
    const H = 11, tilt = 0.22, base = 1.4;

    // one stand: `len` wide, centred `dist` out along its facing axis.
    const build = (len, dist, axis) => {
      const grp = new THREE.Group();
      // dark fascia (the barrier below the seating)
      const fascia = new THREE.Mesh(new THREE.BoxGeometry(len, base, 0.6), fasciaMat);
      fascia.position.set(0, base / 2, 0);
      grp.add(fascia);
      // raked crowd wall, bottom anchored at the fascia top, leaning outward
      const crowd = new THREE.Mesh(new THREE.PlaneGeometry(len, H), crowdMat);
      crowd.rotation.x = tilt;                 // top leans away from pitch (+z local = outward)
      crowd.position.set(0, base + Math.cos(tilt) * H / 2, Math.sin(tilt) * H / 2);
      grp.add(crowd);
      // place: axis 'z-' faces +z (behind blue goal), etc.
      if (axis === 'z-') grp.position.set(0, 0, -dist);
      else if (axis === 'z+') { grp.position.set(0, 0, dist); grp.rotation.y = Math.PI; }
      else if (axis === 'x-') { grp.position.set(-dist, 0, 0); grp.rotation.y = Math.PI / 2; }
      else { grp.position.set(dist, 0, 0); grp.rotation.y = -Math.PI / 2; }
      this.scene.add(grp);
    };
    build(F.width + 26, F.halfL + 5, 'z-');
    build(F.width + 26, F.halfL + 5, 'z+');
    build(F.length + 26, F.halfW + 5, 'x-');
    build(F.length + 26, F.halfW + 5, 'x+');
  }

  // A goal: posts, crossbar, and a translucent net. `dir` = which end (-1 / +1).
  _buildGoal(key, dir) {
    const GO = CFG.GOAL;
    const z = dir * GO.lineZ;
    const grp = new THREE.Group();
    const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const post = (x) => {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(GO.postR, GO.postR, GO.height, 8), white);
      m.position.set(x, GO.height / 2, z);
      grp.add(m);
    };
    post(-GO.halfWidth); post(GO.halfWidth);
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(GO.postR, GO.postR, GO.halfWidth * 2 + GO.postR * 2, 8), white);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, GO.height, z);
    grp.add(bar);

    // net: three translucent panels (back + two sides) tucked behind the line
    const netMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.14, side: THREE.DoubleSide,
      depthWrite: false,
    });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(GO.halfWidth * 2, GO.height), netMat);
    back.position.set(0, GO.height / 2, z + dir * GO.depth);
    grp.add(back);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(GO.depth, GO.height), netMat);
      side.rotation.y = Math.PI / 2;
      side.position.set(s * GO.halfWidth, GO.height / 2, z + dir * GO.depth / 2);
      grp.add(side);
    }
    const top = new THREE.Mesh(new THREE.PlaneGeometry(GO.halfWidth * 2, GO.depth), netMat);
    top.rotation.x = Math.PI / 2;
    top.position.set(0, GO.height, z + dir * GO.depth / 2);
    grp.add(top);

    this.scene.add(grp);
    this.goals[key] = { z, dir, halfWidth: GO.halfWidth, height: GO.height };
  }
}

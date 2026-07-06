/* =========================================================================
 * textures.js — procedural canvas textures (pitch markings, crowd, ad boards)
 * Everything is generated at runtime so the game needs no external assets.
 * ========================================================================= */

const Textures = {
  // Full pitch: mowing stripes + white markings, matched to CFG.FIELD.
  pitch() {
    const W = 1024, H = 1600;               // proportional to width:length ~ 54:84
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');

    // map world coords -> texture pixels
    const F = CFG.FIELD, L = CFG.LINES, GO = CFG.GOAL;
    const px = (x) => (x / F.width + 0.5) * W;   // world x -> px
    const pz = (z) => (0.5 - z / F.length) * H;  // world z -> py
    const sx = (m) => (m / F.width) * W;         // scale x
    const sz = (m) => (m / F.length) * H;        // scale z

    // grass base + mowing stripes running across the width
    const stripes = 14;
    for (let i = 0; i < stripes; i++) {
      g.fillStyle = i % 2 ? '#2f9e44' : '#37ab4e';
      g.fillRect(0, (i / stripes) * H, W, H / stripes + 1);
    }

    g.strokeStyle = 'rgba(255,255,255,0.92)';
    g.lineWidth = 5;
    const line = (x1, z1, x2, z2) => {
      g.beginPath(); g.moveTo(px(x1), pz(z1)); g.lineTo(px(x2), pz(z2)); g.stroke();
    };
    const rect = (x, z, w, h) => {
      g.strokeRect(px(x) - sx(w) / 2, pz(z) - sz(h) / 2, sx(w), sz(h));
    };
    const circle = (x, z, r) => {
      g.beginPath();
      g.ellipse(px(x), pz(z), sx(r), sz(r), 0, 0, TAU); g.stroke();
    };
    const dot = (x, z) => {
      g.fillStyle = 'rgba(255,255,255,0.92)';
      g.beginPath(); g.ellipse(px(x), pz(z), 6, 6, 0, 0, TAU); g.fill();
    };

    // outer boundary + halfway line + centre circle & spot
    rect(0, 0, L.halfW * 2, L.halfL * 2);
    line(-L.halfW, 0, L.halfW, 0);
    circle(0, 0, 9.15);
    dot(0, 0);

    // penalty box (40x16) + goal box (18x6) at both ends, plus penalty spot
    for (const s of [1, -1]) {
      const edge = s * L.halfL;
      const boxRect = (w, depth) => {
        const zInner = edge - s * depth;            // depth measured inward
        const yTop = Math.min(pz(edge), pz(zInner));
        g.strokeRect(px(-w / 2), yTop, sx(w), Math.abs(pz(edge) - pz(zInner)));
      };
      boxRect(40, 16);
      boxRect(18, 6);
      dot(0, s * (L.halfL - 11));                    // penalty spot
    }

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  },

  // Crowd texture: colourful noise to suggest a packed stand.
  crowd() {
    const W = 256, H = 128;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#20252f'; g.fillRect(0, 0, W, H);
    const cols = ['#f2f2f7', '#e85d5d', '#5d8fe8', '#ffd23f', '#5fbf6a', '#c98bd6', '#f0975a'];
    for (let i = 0; i < 3400; i++) {
      g.fillStyle = cols[(Math.random() * cols.length) | 0];
      g.globalAlpha = 0.65 + Math.random() * 0.35;
      g.fillRect(Math.random() * W, Math.random() * H, 3, 3);
    }
    g.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(20, 1);
    return tex;
  },

  // Sponsor board texture around the pitch.
  ads() {
    const W = 512, H = 64;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const blocks = ['#0a2540', '#12805c', '#7a1020', '#243b6b', '#0e5a5a'];
    const words = ['VOLTA', 'LOW·POLY', 'FC', 'KICKOFF', 'ARENA', 'GOAL·TV'];
    let x = 0;
    while (x < W) {
      const w = 96 + Math.random() * 40;
      g.fillStyle = blocks[(Math.random() * blocks.length) | 0];
      g.fillRect(x, 0, w, H);
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.font = 'bold 26px sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(words[(Math.random() * words.length) | 0], x + w / 2, H / 2);
      x += w;
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(8, 1);
    return tex;
  },
};

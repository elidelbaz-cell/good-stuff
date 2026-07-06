import * as THREE from 'three';

export function textTexture(text, { w = 512, h = 128, bg = '#0d0f16', fg = '#ffd24a', font = 'bold 72px Impact, Arial Black, sans-serif', pad = 10 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.strokeStyle = '#000'; x.lineWidth = 8; x.strokeRect(0, 0, w, h);
  x.fillStyle = fg;
  x.font = font;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  // shrink to fit
  let size = parseInt(font.match(/(\d+)px/)[1], 10);
  while (x.measureText(text).width > w - pad * 2 && size > 10) {
    size -= 4;
    x.font = font.replace(/\d+px/, size + 'px');
  }
  x.fillText(text, w / 2, h / 2 + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function windowTexture({ cols = 6, rows = 14, litChance = 0.55, color = '#ffdf9e' } = {}) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 64, 128);
  const cw = 64 / cols, ch = 128 / rows;
  x.fillStyle = color;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    if (Math.random() < litChance) {
      x.globalAlpha = 0.5 + Math.random() * 0.5;
      x.fillRect(i * cw + cw * 0.22, j * ch + ch * 0.25, cw * 0.56, ch * 0.5);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

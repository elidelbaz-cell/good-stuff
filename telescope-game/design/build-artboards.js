/* Generates the Claude Design artboards (one per planet + the index sheet)
 * from the same planet catalogue the game uses, so model and game never drift.
 * Usage: node design/build-artboards.js
 */
const fs = require('fs');
const path = require('path');
const PLANETS = require('../planets.js');
const out = __dirname;

const ZOOMS = [1, 2, 4, 8, 16, 32];
const zoomNeeded = p => { for (const z of ZOOMS) { if (p.size * (340 / (60 / z)) >= 18) return z; } return 32; };
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const head = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&amp;display=swap">
  <style>
    body { margin: 0; background: #070b14; color: #e8e6df; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; }
    a { color: #c9a15a; } a:hover { color: #e7c987; }
  </style>
</helmet>`;
const tail = `</x-dc>
</body>
</html>
`;

const spec = p => [`Faintness ${p.mag}`, `Zoom ×${zoomNeeded(p)}`, p.needsFilter ? 'Nebula filter' : null].filter(Boolean);
const chip = t => `<div style="padding: 6px 12px; border-radius: 999px; border: 1px solid #22304d; background: #141c31; font-size: 12px; white-space: nowrap; color: #8b95ad; letter-spacing: 0.02em;">${t}</div>`;

// One artboard per planet
for (const p of PLANETS) {
  const file = `${p.name.replace(/[^A-Za-z0-9]/g, '')}.dc.html`;
  const html = `${head}
<div style="width: 480px; height: 640px; box-sizing: border-box; padding: 36px 36px 32px; background: radial-gradient(circle at 50% 30%, #101a30 0%, #070b14 65%); display: flex; flex-direction: column; align-items: center; gap: 18px;">
  <div style="width: 300px; height: 300px; filter: drop-shadow(0 20px 40px rgba(0,0,0,0.7));">${p.svg.replace('<svg ', '<svg style="width: 100%; height: 100%; display: block;" ')}</div>
  <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
    <h1 style="margin: 0; font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; font-size: 40px; line-height: 1.1; color: #e8e6df;">${esc(p.name)}</h1>
    <div style="font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: #8b95ad;">${esc(p.kind)}</div>
  </div>
  <p style="margin: 0; font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic; font-size: 19px; line-height: 1.4; text-align: center; color: #e8e6df; text-wrap: pretty;">${esc(p.lore)}</p>
  <div style="display: flex; gap: 8px; justify-content: center; margin-top: auto;">${spec(p).map(chip).join('')}</div>
</div>
${tail}`;
  fs.writeFileSync(path.join(out, file), html);
}

// Index sheet
const cell = p => `
    <div style="display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 22px 16px 18px; border-radius: 16px; border: 1px solid #22304d; background: #0e1424;">
      <div style="width: 150px; height: 150px; filter: drop-shadow(0 12px 24px rgba(0,0,0,0.65));">${p.svg.replace('<svg ', '<svg style="width: 100%; height: 100%; display: block;" ')}</div>
      <div style="font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; font-size: 26px; line-height: 1.1; color: #e8e6df;">${esc(p.name)}</div>
      <div style="font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #8b95ad;">${esc(p.kind)}</div>
      <div style="font-size: 12px; color: #c9a15a;">${spec(p).join(' · ')}</div>
    </div>`;
const main = `${head}
<div style="width: 1240px; height: 1080px; box-sizing: border-box; padding: 48px 56px; background: #070b14; display: flex; flex-direction: column; gap: 28px;">
  <div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 24px;">
    <div style="display: flex; flex-direction: column; gap: 6px;">
      <h1 style="margin: 0; font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; font-size: 44px; line-height: 1; color: #e8e6df;">Starfinder — Planetary Index</h1>
      <div style="font-size: 14px; color: #8b95ad;">Twelve worlds to find through the eyepiece. Every model here is the one the game draws in the sky and in the index.</div>
    </div>
    <div style="display: flex; gap: 8px;">${chip('Ordered easiest to hardest')}${chip('200 × 200 SVG')}</div>
  </div>
  <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px;">${PLANETS.map(cell).join('')}
  </div>
</div>
${tail}`;
fs.writeFileSync(path.join(out, 'Main.dc.html'), main);

// Canvas layout
const artboards = [{ file: 'Main.dc.html', x: 0, y: 0, w: 1240, h: 1080, title: 'Planetary Index sheet' }];
PLANETS.forEach((p, i) => {
  const col = i % 4, row = Math.floor(i / 4);
  artboards.push({ file: `${p.name.replace(/[^A-Za-z0-9]/g, '')}.dc.html`, x: col * 580, y: 1240 + row * 780, w: 480, h: 640, title: p.name });
});
const canvas = {
  artboards,
  annotations: [{ id: 'model-note', x: 1320, y: 0, w: 300, text: 'Planet models for Starfinder.\nThe sheet above is the full set; each card below is one model at a larger size.\nEdit a model here and re-export it into planets.js to change it in the game.' }],
  launch: { view: 'canvas' }
};
fs.writeFileSync(path.join(out, 'canvas.json'), JSON.stringify(canvas, null, 2) + '\n');
console.log('wrote', artboards.length, 'artboards');

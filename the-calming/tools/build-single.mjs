// Builds dist/the-calming.html — the WHOLE game in one self-contained file.
// Double-click it and play; no server, no network, works from file://.
// (Real FBX/WAV assets can't ride along in this build — it is the placeholder
// game. The served version in this folder is the one that loads real assets.)
//
// Usage:  npm install && npm run build     (from the the-calming/ folder)
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// bundle every module (game + vendored three.js) into one script
const result = await esbuild.build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  write: false,
  alias: {
    'three/addons': path.join(root, 'vendor/addons'),
    'three': path.join(root, 'vendor/three.module.js'),
  },
  logLevel: 'warning',
});
const bundle = result.outputFiles[0].text;

// inline the editable data files (Assets.getJSON reads this global first)
const data = {};
for (const [key, rel] of Object.entries({
  beatmap: 'assets/beatmaps/melody_main.json',
  cutsceneTimeline: 'assets/data/cutscene_timeline.json',
  chaseTriggers: 'assets/data/chase_triggers.json',
  pianoKeys: 'assets/data/piano_keys.json',
})) {
  data[key] = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

// take index.html, drop the importmap + module script, inject the payload.
// Replacer FUNCTIONS insert verbatim — a plain replacement string would have
// its "$&" sequences (which minified JS is full of) expanded by String.replace.
// Also escape anything that would close the <script> tag early.
const safeBundle = bundle.replace(/<\/script/gi, '<\\/script');
const safeData = JSON.stringify(data).replace(/</g, '\\u003c');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html
  .replace(/<script type="importmap">[\s\S]*?<\/script>\n?/, '')
  .replace(/<script type="module" src="\.\/src\/main\.js"><\/script>\n?/, () =>
    `<script>window.__INLINE_DATA=${safeData};</script>\n` +
    `<script>${safeBundle}</script>\n`);

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'the-calming.html');
fs.writeFileSync(out, html);
console.log(`built ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);

// Bundles the Vite build into ONE self-contained crime-city.html you can
// double-click to play offline — Three.js and all code inlined, no assets
// (every texture is canvas-generated and all audio is synthesized at runtime).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');
const assets = join(dist, 'assets');

let html = readFileSync(join(dist, 'index.html'), 'utf8');
const files = readdirSync(assets);
const jsFile = files.find((f) => f.endsWith('.js'));
const cssFile = files.find((f) => f.endsWith('.css'));

// escape any literal </script> so it can't close the inline script tag early
const js = readFileSync(join(assets, jsFile), 'utf8').replace(/<\/script>/gi, '<\\/script>');
const css = cssFile ? readFileSync(join(assets, cssFile), 'utf8') : '';

// inline CSS: replace the built <link rel="stylesheet"> with a <style>
html = html.replace(
  /<link[^>]*rel="stylesheet"[^>]*>/,
  `<style>\n${css}\n</style>`,
);
// inline JS: replace the built module <script src=...> with the code itself
html = html.replace(
  /<script[^>]*type="module"[^>]*src="[^"]*"[^>]*><\/script>/,
  `<script type="module">\n${js}\n</script>`,
);

const out = join(root, 'crime-city.html');
writeFileSync(out, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`wrote ${out} (${kb} KB, self-contained)`);

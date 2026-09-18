// Bundles src/ into a single self-contained index.html.
// Usage: npm install && node build.mjs
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

const result = await esbuild.build({
  entryPoints: [path.join(root, 'src/game.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  write: false,
});
const js = result.outputFiles[0].text.replace(/<\/script>/g, '<\\/script>');
const css = fs.readFileSync(path.join(root, 'src/style.css'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'src/ui.html'), 'utf8');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Neon Sprawl</title>
<style>
${css}</style>
</head>
<body>
${ui}<script>
${js}</script>
</body>
</html>
`;
fs.writeFileSync(path.join(root, 'index.html'), html);
console.log(`built index.html (${(html.length / 1024).toFixed(0)} KB)`);

if (process.env.BODY_OUT) {
  const body = `<title>Neon Sprawl</title>
<style>
${css}</style>
${ui}<script>
${js}</script>
`;
  fs.writeFileSync(process.env.BODY_OUT, body);
  console.log(`built ${process.env.BODY_OUT}`);
}

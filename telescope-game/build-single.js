/* Bundles the game into one HTML file (dist/starfinder.html) so it can be
 * opened from a single link or file on a phone. Usage: node build-single.js
 */
const fs = require('fs');
const path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const css = read('style.css');
const js = read('planets.js') + '\n' + read('game.js').replace("'serviceWorker' in navigator", 'false');
let html = read('index.html');
html = html.replace(/<link rel="stylesheet" href="style.css">/, `<style>\n${css}\n</style>`)
  .replace(/<link rel="manifest"[^>]*>\s*/g, '').replace(/<link rel="(icon|apple-touch-icon)"[^>]*>\s*/g, '')
  .replace(/<script src="planets.js"><\/script>\s*<script src="game.js"><\/script>/, `<script>\n${js}\n</script>`);
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'starfinder.html'), html);
// Body-only variant for hosts that supply their own document skeleton.
const inner = html.replace(/^[\s\S]*?<head>/, '').replace(/<\/head>\s*<body>/, '').replace(/<\/body>\s*<\/html>\s*$/, '')
  .replace(/<meta [^>]*>\s*/g, '');
if (process.argv[2]) fs.writeFileSync(process.argv[2], inner);
console.log('built dist/starfinder.html', (html.length / 1024).toFixed(0) + ' KB');

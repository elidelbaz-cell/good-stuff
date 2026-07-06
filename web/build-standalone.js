/* Bundles the multi-file game into a single self-contained HTML file.
 * Run:  node web/build-standalone.js   ->   volta-soccer.html (repo root)
 * Reads index.html and inlines the stylesheet and every <script src>. */
const fs = require('fs');
const path = require('path');

const webDir = __dirname;
const read = (p) => fs.readFileSync(path.join(webDir, p), 'utf8');

let html = read('index.html');

// inline the stylesheet
const css = read('css/style.css');
html = html.replace(
  /<link rel="stylesheet" href="css\/style\.css"\s*\/?>/,
  `<style>\n${css}\n</style>`,
);

// inline every external script in order
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  const code = read(src);
  if (code.includes('</script>')) throw new Error(`refusing to inline ${src}: contains </script>`);
  return `<script>\n${code}\n</script>`;
});

// the screenshot/title note lives in README; nothing else to rewrite
const out = path.join(webDir, '..', 'volta-soccer.html');
fs.writeFileSync(out, html);
console.log('wrote', out, '(' + (html.length / 1024).toFixed(0) + ' KB)');

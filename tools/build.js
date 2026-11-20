'use strict';
// Bundles src/ui/main.js and src/styles.css into one self-contained dist/index.html.
//   node tools/build.js [--minify]
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const root = path.join(__dirname, '..');
const minify = process.argv.includes('--minify');

const js = esbuild.buildSync({
  entryPoints: [path.join(root, 'src/ui/main.js')],
  bundle: true, format: 'iife', target: 'es2020', minify, write: false, legalComments: 'none', charset: 'utf8',
}).outputFiles[0].text;
const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
let html = fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8');
// function replacers so "$" in the code is never treated as a replacement pattern
html = html.replace('/*{{CSS}}*/', () => css).replace('/*{{JS}}*/', () => js.replace(/<\/script>/gi, '<\\/script>'));
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/index.html'), html);
console.log('dist/index.html', (html.length / 1024).toFixed(1) + ' KB');

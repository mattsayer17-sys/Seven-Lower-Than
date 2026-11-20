// Bundle the edge function: server/entry.mjs + handler + table + the engine, into dist/fn/index.ts.
// Usage: node tools/build-fn.js
'use strict';
const esbuild = require('esbuild');
const fs = require('fs');
const crypto = require('crypto');
fs.mkdirSync('dist/fn', { recursive: true });
esbuild.buildSync({ entryPoints: ['server/entry.mjs'], bundle: true, format: 'esm', platform: 'neutral', mainFields: ['module', 'main'], external: ['jsr:*'], outfile: 'dist/fn/index.ts', minifyWhitespace: true, minifySyntax: true, logLevel: 'warning' });
const src = '// @ts-nocheck\n' + fs.readFileSync('dist/fn/index.ts', 'utf8');
fs.writeFileSync('dist/fn/index.ts', src);
console.log('dist/fn/index.ts ' + (src.length / 1024).toFixed(1) + ' KB sha ' + crypto.createHash('sha256').update(src).digest('hex').slice(0, 12));

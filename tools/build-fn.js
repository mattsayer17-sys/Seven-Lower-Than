// Bundle the edge function: server/entry.mjs + handler + table + the engine, into dist/fn/index.ts.
// Usage: node tools/build-fn.js
'use strict';
const esbuild = require('esbuild');
const fs = require('fs');
const crypto = require('crypto');
fs.mkdirSync('dist/fn', { recursive: true });
esbuild.buildSync({ entryPoints: ['server/entry.mjs'], bundle: true, format: 'esm', platform: 'neutral', mainFields: ['module', 'main'], external: ['jsr:*'], outfile: 'dist/fn/index.ts', minifyWhitespace: true, minifySyntax: true, charset: 'ascii', logLevel: 'warning' });
const src = '// @ts-nocheck\n' + fs.readFileSync('dist/fn/index.ts', 'utf8');
fs.writeFileSync('dist/fn/index.ts', src);
console.log('dist/fn/index.ts ' + (src.length / 1024).toFixed(1) + ' KB sha ' + crypto.createHash('sha256').update(src).digest('hex').slice(0, 12));

// The server handler on its own, as an ES module with a content-hashed name. Vercel serves it from dist/srv, and a tiny
// entry file imports it by URL. Deploying the edge function then means sending dist/fn/remote-index.ts only, after Vercel has published the matching handler file.
fs.mkdirSync('dist/srv', { recursive: true });
const hb = esbuild.buildSync({ stdin: { contents: "import h from './server/handler.js'; export default h;", resolveDir: '.', sourcefile: 'srv.mjs' }, bundle: true, format: 'esm', platform: 'neutral', mainFields: ['module', 'main'], minifyWhitespace: true, minifySyntax: true, charset: 'ascii', write: false, logLevel: 'warning' });
const hsrc = hb.outputFiles[0].text;
const hsha = crypto.createHash('sha256').update(hsrc).digest('hex').slice(0, 12);
for (const f of fs.readdirSync('dist/srv')) fs.unlinkSync('dist/srv/' + f);
fs.writeFileSync('dist/srv/handler-' + hsha + '.mjs', hsrc);
const entry = fs.readFileSync('server/entry.mjs', 'utf8').replace("import handler from './handler.js';", "import handler from 'https://seven-lower-than.vercel.app/srv/handler-" + hsha + ".mjs';");
fs.writeFileSync('dist/fn/remote-index.ts', '// @ts-nocheck\n' + entry);
console.log('dist/srv/handler-' + hsha + '.mjs ' + (hsrc.length / 1024).toFixed(1) + ' KB, entry dist/fn/remote-index.ts');

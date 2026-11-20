'use strict';
// Plays the reference build and the current build through the same scripted session and compares them.
//   node tools/compare.js [baseline.html] [seed ...]
// Same transcript and zero page errors in the current build = no behaviour change.
const { spawnSync } = require('child_process');
const path = require('path');
const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const baseline = args[0] && args[0].endsWith('.html') ? args.shift() : 'src/reference.html';
const seeds = args.length ? args : ['42', '7', '2026'];
const run = (file, seed) => {
  const r = spawnSync('node', [path.join(__dirname, 'drive.js'), file, '3'], { cwd: root, env: { ...process.env, SEED: seed }, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 240000 });
  if (r.status !== 0) throw new Error('driver failed on ' + file + ' seed ' + seed + '\n' + r.stderr.slice(0, 600));
  return JSON.parse(r.stdout);
};
let bad = 0;
for (const seed of seeds) {
  const a = run(baseline, seed), b = run('dist/index.html', seed);
  let diff = 0;
  for (let i = 0; i < Math.max(a.transcript.length, b.transcript.length); i++) {
    // innerText spacing depends on whether a panel is on screen, so compare with spaces removed
    const squash = t => String(t).replace(/\s+/g, '');
    if (squash(a.transcript[i]) !== squash(b.transcript[i])) { if (++diff <= 3) console.log('  differs at ' + i + '\n    baseline: ' + a.transcript[i] + '\n    current : ' + b.transcript[i]); }
  }
  const ok = diff === 0 && b.errors.length === 0;
  if (!ok) bad++;
  console.log((ok ? 'PASS' : 'FAIL') + ' seed ' + seed + ': ' + b.transcript.length + ' steps, ' + diff + ' differences, page errors baseline ' + a.errors.length + ' / current ' + b.errors.length);
  if (b.errors.length) console.log(b.errors.join('\n'));
}
process.exit(bad ? 1 : 0);

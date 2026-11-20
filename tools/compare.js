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
// Deliberate wording changes since the reference build. Applied to the baseline only, so behaviour still has to match exactly.
const REWORD = [
  ["You're the Mouse", 'Wooden Spoon for you'],
  ['Back to the shed.', 'Shuffle up and get revenge.'],
  [/ is the Mouse this round\./g, ' gets the Wooden Spoon this round.'],
  [/ is the Mouse\./g, ' gets the Wooden Spoon.'],
  ['is the Mouse.', 'gets the Wooden Spoon.'],
  [/· Mouse (\d+)/g, '· 🥄 $1'],
  [/1ST (\d+) MOUSE/g, '1ST $1 SPOONS'],
  ['🧀 Escape artist Avoid being the Mouse 5 games running', '😅 Escape artist Dodge the Wooden Spoon 5 games running'],
  [/Profile 🐭 /g, 'Profile 🦊 '],
  ['The Mouse Shed', 'Seven Lower Than'],
];
const reword = t => REWORD.reduce((s, [a, b]) => typeof a === 'string' ? s.split(a).join(b) : s.replace(a, b), String(t));
let bad = 0;
for (const seed of seeds) {
  const a = run(baseline, seed), b = run('dist/index.html', seed);
  let diff = 0;
  for (let i = 0; i < Math.max(a.transcript.length, b.transcript.length); i++) {
    // innerText spacing depends on whether a panel is on screen, so compare with spaces removed
    const squash = t => String(t).replace(/\s+/g, '');
    if (squash(reword(a.transcript[i])) !== squash(b.transcript[i])) { if (++diff <= 3) console.log('  differs at ' + i + '\n    baseline: ' + a.transcript[i] + '\n    current : ' + b.transcript[i]); }
  }
  const ok = diff === 0 && b.errors.length === 0;
  if (!ok) bad++;
  console.log((ok ? 'PASS' : 'FAIL') + ' seed ' + seed + ': ' + b.transcript.length + ' steps, ' + diff + ' differences, page errors baseline ' + a.errors.length + ' / current ' + b.errors.length);
  if (b.errors.length) console.log(b.errors.join('\n'));
}
process.exit(bad ? 1 : 0);

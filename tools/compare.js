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
  ["You're the Mouse", 'You hit Rock Bottom'],
  ['Back to the shed.', 'Shuffle up and get revenge.'],
  [/ is the Mouse this round\./g, ' hits Rock Bottom this round.'],
  [/ is the Mouse\./g, ' hits Rock Bottom.'],
  ['is the Mouse.', 'hits Rock Bottom.'],
  [/· Mouse (\d+)/g, '· 🪨 $1'],
  [/1ST (\d+) MOUSE/g, '1ST $1 🪨 LAST'],
  ['🧀 Escape artist Avoid being the Mouse 5 games running', '😅 Escape artist Stay off Rock Bottom 5 games running'],
  [/Profile 🐭 /g, 'Profile 🦊 '],
  ['The Mouse Shed', 'Shiphead'],
  // 21 Nov 2026: grammar fix in the move line
  [/\(You is out,/g, '(You are out,'],
  // Setup sheet headings: + Play against, + More, + Add a card rule, - Your own special cards, - Or pick one yourself
  [/^setup 7$/, 'setup 8'],
  // 21 Nov 2026: a stinger rule now lives in its own Stinger tick row, not the list of your own rules
  [/^custom 3 plays on anything\. Only the same rank can be played on it.*Your own rule×$/, 'custom '],
  [/^blocked \|2$/, 'blocked |1'],
  ['Games against other people will show here once online tables open. Records are saved on this device.', 'Play friends online and your record against each of them builds here, the same on their phone as on yours.'],
];
// Achievements added 20 Nov 2026. The current build lists and unlocks these on top of the original 13, so drop them from
// the current transcript and don't compare the unlocked count; which of the original 13 unlock is still compared via "ach=".
const NEW_ACH = ['clean', 'nosting', 'gotyou', 'lastcard', 'flawless', 'shutout', 'burn3', 'comeback', 'streak3', 'quick', 'full', 'win50', 'games25', 'daily7', 'banter', 'rules', 'host', 'collector'];
// the new ones are listed after the original 13, between the daily streak badge and the Add profile box
const NEW_ACH_TEXT = /(3 days in a row).*?(?= Add profile)/u;
const unNew = t => String(t)
  .replace(/ach=([\w,]*)/, (m, l) => 'ach=' + l.split(',').filter(x => x && !NEW_ACH.includes(x)).join(','))
  .replace(NEW_ACH_TEXT, '$1')
  .replace(/ACHIEVEMENTS \d+\/\d+/i, 'ACHIEVEMENTS #');
const reword = t => REWORD.reduce((s, [a, b]) => typeof a === 'string' ? s.split(a).join(b) : s.replace(a, b), String(t));
let bad = 0;
for (const seed of seeds) {
  const a = run(baseline, seed), b = run('dist/index.html', seed);
  let diff = 0;
  for (let i = 0; i < Math.max(a.transcript.length, b.transcript.length); i++) {
    // innerText spacing depends on whether a panel is on screen, so compare with spaces removed
    // and case-insensitively: labels moved from CSS capitals to sentence case on 21 Nov 2026, which changes innerText, not behaviour
    const squash = t => String(t).replace(/\s+/g, '').toLowerCase();
    if (squash(unNew(reword(a.transcript[i]))) !== squash(unNew(b.transcript[i]))) { if (++diff <= 3) console.log('  differs at ' + i + '\n    baseline: ' + a.transcript[i] + '\n    current : ' + b.transcript[i]); }
  }
  const ok = diff === 0 && b.errors.length === 0;
  if (!ok) bad++;
  console.log((ok ? 'PASS' : 'FAIL') + ' seed ' + seed + ': ' + b.transcript.length + ' steps, ' + diff + ' differences, page errors baseline ' + a.errors.length + ' / current ' + b.errors.length);
  if (b.errors.length) console.log(b.errors.join('\n'));
}
process.exit(bad ? 1 : 0);

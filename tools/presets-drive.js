// Headless check of rule presets and share codes in Setup. Usage: node tools/presets-drive.js dist/index.html
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const assert = require('node:assert/strict');
const P = require('../src/presets.js');
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 900 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.evaluateOnNewDocument(() => { window.__MS_FAST = true; localStorage.clear(); });
  await page.goto('file://' + path.resolve(process.argv[2]));
  const ev = (fn, ...a) => page.evaluate(fn, ...a);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const until = async (fn, label) => { for (let i = 0; i < 300; i++) { if (await ev(fn)) return; await wait(20); } throw new Error('timeout: ' + label); };
  const text = sel => ev(s => (document.querySelector(s) || {}).textContent || '', sel);
  const pick = (sel, v) => ev((s, val) => { const e = document.querySelector(s); e.value = val; e.dispatchEvent(new Event('change', { bubbles: true })); }, sel, v);
  const state = () => ev(() => ({
    sev: document.querySelector('#rSev').checked, tr: document.querySelector('#rTr').checked, trR: document.querySelector('#rTrRank').value,
    sk: document.querySelector('#rSk').checked, skR: document.querySelector('#rSkRank').value, four: document.querySelector('#rFour').checked,
    preset: document.querySelector('#rPreset').value, rows: document.querySelectorAll('#customRows .row').length,
  }));
  const paste = code => ev(c => { document.querySelector('#codeIn').value = c; document.querySelector('#codeUse').click(); }, code);
  const steps = []; const ok = n => steps.push('ok  ' + n);

  await until(() => window.__ms && window.__ms.game() && !window.__ms.ui().busy, 'ready');
  await ev(() => document.querySelector('#bNew').click());
  await until(() => !!document.querySelector('#rPreset'), 'setup');
  let s = await state();
  assert.equal(s.preset, 'classic'); assert.equal(s.sev, true); assert.equal(s.four, true);
  ok('opens on Classic');

  await pick('#rPreset', 'chaos');
  s = await state();
  assert.deepEqual([s.sev, s.tr, s.trR, s.sk, s.skR, s.four, s.rows, s.preset], [true, true, '4', true, '8', true, 2, 'chaos']);
  assert.match(await text('#presetBlurb'), /Jacks reverse/);
  ok('Chaos sets the boxes, cards and two own rules');

  await pick('#rPreset', 'plain');
  s = await state();
  assert.deepEqual([s.sev, s.tr, s.sk, s.four, s.rows], [false, false, false, false, 0]);
  ok('Plain clears them, including own rules');

  // editing by hand leaves "Your own mix"
  await ev(() => { const c = document.querySelector('#rSev'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });
  s = await state();
  assert.equal(s.preset, 'mix');
  await ev(() => { const c = document.querySelector('#rTr'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });
  await pick('#rTrRank', '6');
  s = await state();
  assert.equal(s.preset, 'mix'); assert.match(await text('#presetBlurb'), /own mix/);
  ok('changing a rule by hand shows Your own mix');

  // copy code gives a code that loads back
  await ev(() => document.querySelector('#codeCopy').click());
  await wait(100);
  const copied = await ev(() => (document.querySelector('.copyta') || {}).value || null);
  const code = copied || P.encode({ sevensLower: true, transparentOn: true, transparentRank: '6' });
  assert.match(code, /^H1-/);
  assert.equal(P.decode(code).ok, true);
  ok('Copy code produces a valid code' + (copied ? '' : ' (clipboard path)'));

  await pick('#rPreset', 'classic');
  await paste(code);
  s = await state();
  assert.deepEqual([s.sev, s.tr, s.trR, s.preset], [true, true, '6', 'mix']);
  ok('pasting the code restores the rules');

  // bad codes
  await paste('H1-garbage-000');
  assert.match(await text('#codeNote'), /typo|damaged/);
  await paste('banana');
  assert.match(await text('#codeNote'), /does not look like/);
  await paste(' ');
  assert.match(await text('#codeNote'), /does not look like/);
  s = await state();
  assert.deepEqual([s.tr, s.trR], [true, '6']);
  ok('bad codes say why and change nothing');

  // a forged code that clashes is refused
  const body = { n: '', s: 1, t: 4, k: 4, f: 1, c: [] };
  const payload = Buffer.from(JSON.stringify(body)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  let h = 0x811c9dc5; for (let i = 0; i < payload.length; i++) { h ^= payload.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  await paste('H1-' + payload + '-' + (h % 46656).toString(36).padStart(3, '0'));
  assert.match(await text('#codeNote'), /already used/);
  s = await state(); assert.deepEqual([s.tr, s.trR], [true, '6']);
  ok('a clashing code is refused');

  // shared name comes through, and Start plays with the rules
  await paste(P.encode(P.PRESETS.find(p => p.id === 'chaos').opts, 'Friday night'));
  assert.equal(await text('#codeNote'), 'Loaded Friday night.');
  assert.equal((await state()).preset, 'chaos');
  await ev(() => document.querySelector('#rNew').click());
  await until(() => window.__ms.game() && window.__ms.game().phase === 'swap', 'game');
  const r = await ev(() => { const g = window.__ms.game(); return [g.rules.ranks['4'].effect, g.rules.ranks['8'].effect, g.rules.ranks['J'].effect, g.rules.ranks['K'].effect]; });
  assert.deepEqual(r, ['transparent', 'skip', 'reverse', 'pickup']);
  ok('Start plays with the loaded rules ' + JSON.stringify(r));

  // and it was saved
  await ev(() => document.querySelector('#bNew').click());
  await until(() => !!document.querySelector('#rPreset'), 'setup again');
  assert.equal((await state()).preset, 'chaos');
  ok('the choice is remembered');

  assert.deepEqual(errors, []);
  console.log(steps.join('\n') + '\npage errors: 0');
  await browser.close();
})().catch(e => { console.error('PRESETS DRIVE FAILED:', e.message); process.exit(1); });

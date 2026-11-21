// Headless check of the Setup sheet: tabs, the Start button staying in view, and the rule clash checks. Usage: node tools/setup-drive.js dist/index.html
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const assert = require('node:assert/strict');
let steps0 = [];
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 700 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.evaluateOnNewDocument(() => { window.__MS_FAST = true; localStorage.clear(); });
  await page.goto('file://' + path.resolve(process.argv[2]));
  const ev = (fn, ...a) => page.evaluate(fn, ...a);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const until = async (fn, label) => { for (let i = 0; i < 300; i++) { if (await ev(fn)) return; await wait(20); } throw new Error('timeout: ' + label); };
  const text = sel => ev(s => (document.querySelector(s) || {}).textContent || '', sel);
  const click = sel => ev(s => document.querySelector(s).click(), sel);
  const pick = (sel, v) => ev((s, val) => { const e = document.querySelector(s); e.value = val; e.dispatchEvent(new Event('change', { bubbles: true })); }, sel, v);
  const tick = (sel, on) => ev((s, v) => { const e = document.querySelector(s); e.checked = v; e.dispatchEvent(new Event('change', { bubbles: true })); }, sel, on);
  const checked = sel => ev(s => document.querySelector(s).checked, sel);
  const shown = sel => ev(s => { const e = document.querySelector(s); return !!e && !e.classList.contains('hidden') && e.offsetParent !== null; }, sel);
  const steps = steps0 = []; const ok = n => steps.push('ok  ' + n);

  await until(() => window.__ms && window.__ms.game() && !window.__ms.ui().busy, 'ready');
  await click('#bNew');
  await until(() => !!document.querySelector('#tabGame'), 'setup');

  // tabs
  assert.equal(await ev(() => document.querySelector('.tabs').getAttribute('role')), 'tablist');
  assert.deepEqual(await ev(() => [...document.querySelectorAll('.tab')].map(t => t.getAttribute('aria-selected'))), ['true', 'false', 'false']);
  assert.deepEqual([await shown('#pGame'), await shown('#pRules'), await shown('#pLook')], [true, false, false]);
  ok('opens on the Game tab, the other two hidden');
  assert.equal(await ev(() => !!document.querySelector('#seg') && !!document.querySelector('#voteBtn') && !document.querySelector('#rPreset').offsetParent), true);
  await click('#tabRules');
  assert.deepEqual([await shown('#pGame'), await shown('#pRules'), await shown('#pLook')], [false, true, false]);
  assert.equal(await ev(() => document.querySelector('#tabRules').getAttribute('aria-selected')), 'true');
  ok('Rules tab shows the rules and hides the rest');

  // keyboard: arrows, Home, End
  await ev(() => document.querySelector('#tabRules').focus());
  await page.keyboard.press('ArrowRight');
  assert.equal(await ev(() => document.activeElement.id), 'tabLook');
  assert.equal(await shown('#pLook'), true);
  await page.keyboard.press('ArrowRight');
  assert.equal(await ev(() => document.activeElement.id), 'tabGame');
  await page.keyboard.press('End');
  assert.equal(await ev(() => document.activeElement.id), 'tabLook');
  await page.keyboard.press('Home');
  assert.equal(await ev(() => document.activeElement.id), 'tabGame');
  assert.deepEqual(await ev(() => [...document.querySelectorAll('.tab')].map(t => t.tabIndex)), [0, -1, -1]);
  ok('arrow keys, Home and End move between tabs (only the chosen tab is in the tab order)');

  // Start is always on screen
  for (const t of ['#tabGame', '#tabRules', '#tabLook']) {
    await click(t);
    const r = await ev(() => { const b = document.querySelector('#rNew').getBoundingClientRect(); return { top: b.top, bottom: b.bottom, vh: window.innerHeight }; });
    assert.ok(r.top >= 0 && r.bottom <= r.vh, t + ' Start at ' + JSON.stringify(r));
  }
  ok('Start stays inside the screen on every tab (390 by 700)');

  // the tab is remembered, and Change rules opens Rules
  await click('#tabLook');
  await click('#rClose');
  await until(() => document.querySelector('#modal').classList.contains('hidden'), 'closed');
  await click('#bNew');
  await until(() => !!document.querySelector('#tabLook'), 'reopen');
  assert.equal(await ev(() => document.querySelector('#tabLook').getAttribute('aria-selected')), 'true');
  await click('#rClose');
  await click('#bRules');
  await until(() => !!document.querySelector('#lSetup'), 'legend');
  await click('#lSetup');
  await until(() => !!document.querySelector('#coach.on #qrows'), 'house rules card from legend');
  assert.equal(await ev(() => document.querySelectorAll('#coach .qrow').length), 6);
  await click('#wGo');
  await until(() => !document.querySelector('#coach'), 'house rules card closed');
  ok('Setup reopens on the last tab; "Change rules" opens the house rules card on the felt');
  await click('#bNew');
  await until(() => !!document.querySelector('#tabRules'), 'setup again');
  await click('#tabRules');

  // rule clashes, now decided by rules-meta
  await pick('#rPreset', 'classic');
  await pick('#mRank', '8'); await pick('#mEff', 'burn');
  await click('#mAdd');
  assert.equal(await ev(() => document.querySelectorAll('#customRows .row').length), 1);
  await tick('#rSk', true);
  assert.equal(await checked('#rSk'), false);
  assert.match(await text('#aiNote'), /Can't tick that\. 8 is already used by your own rule for 8\./);
  ok('skip a go cannot sit on a card your own rule already uses');

  await ev(() => { const c = document.querySelector('#customRows input[data-t]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); });
  await tick('#rSk', true);
  assert.equal(await checked('#rSk'), true);
  ok('untick your rule and the card is free');

  await ev(() => { const c = document.querySelector('#customRows input[data-t]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.equal(await checked('#customRows input[data-t]'), false);
  assert.match(await text('#aiNote'), /8 is already used by the skip a go rule/);
  ok('and your rule cannot be ticked back on while skip holds the card');

  assert.equal(await ev(() => { const o = document.querySelector('#mRank option[value="8"]'); return o.disabled && /in use/.test(o.textContent); }), true);
  ok('the builder greys out a card that is already in use');
  await ev(() => { document.querySelector('#mRank').value = '8'; document.querySelector('#mEff').value = 'reverse'; });
  await click('#mAdd');
  assert.match(await text('#aiNote'), /8 is already used by the skip a go rule/);
  assert.equal(await ev(() => document.querySelectorAll('#customRows .row').length), 1);
  ok('adding an own rule on a held card is refused with the reason');

  await pick('#mRank', '9'); await pick('#mEff', 'reverse');
  await click('#mAdd');
  assert.equal(await ev(() => document.querySelectorAll('#customRows .row').length), 2);
  ok('a free card is accepted');

  // Start applies it
  await click('#rNew');
  await until(() => window.__ms.game() && window.__ms.game().phase === 'swap', 'game');
  const r = await ev(() => { const g = window.__ms.game(); return [g.rules.ranks['8'].effect, g.rules.ranks['9'].effect]; });
  assert.deepEqual(r, ['skip', 'reverse']);
  ok('Start plays with the chosen rules ' + JSON.stringify(r));

  // Card effects speed: Normal by default, Fast and Off change the shared timing variable, and effects fire without errors
  await click('#bNew');
  await until(() => !!document.querySelector('#rMotion'), 'setup again');
  assert.equal(await ev(() => document.querySelector('#rMotion').value), 'normal');
  const fxk = () => ev(() => document.documentElement.style.getPropertyValue('--fxk'));
  assert.equal(await fxk(), '1');
  await pick('#rMotion', 'fast');
  assert.equal(await fxk(), '0.55');
  await pick('#rMotion', 'off');
  assert.equal(await fxk(), '0.35');
  assert.equal(await ev(() => JSON.parse(localStorage.getItem('ms.settings')).motion), 'off');
  await pick('#rMotion', 'normal');
  await ev(() => { const id = window.__ms.game().players[0].up[0].id; window.__ms.fx.burn(); window.__ms.fx.stung(1); window.__ms.fx.sting(id); window.__ms.fx.ghost(id); });
  assert.ok(await ev(() => !!document.querySelector('#fx .stung') && !!document.querySelector('#fx .wash')));
  ok('card effects setting: Normal, Fast, Off saved, and all four effects fire');

  // saved rule sets and the colour builder
  await click('#tabRules');
  await pick('#rPreset', 'classic');
  await pick('#mEff', 'blackNext');
  await ev(() => { const r = document.querySelector('#mRank'); r.value = 'Q'; r.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.match(await text('#mDesc'), /When a Q is played: next card must be black/);
  await click('#mAdd');
  assert.match(await text('#customRows'), /Q\s*next card must be black/);
  await click('#saveBtn');
  await ev(() => { document.querySelector('#saveName').value = 'Pub rules'; });
  await click('#saveGo');
  assert.equal(await ev(() => document.querySelector('#rPreset').value), 'saved:0');
  assert.match(await text('#saveLbl'), /Saved as Pub rules/);
  await pick('#rPreset', 'classic');
  assert.equal(await ev(() => document.querySelectorAll('#customRows .row').length), 0);
  await pick('#rPreset', 'saved:0');
  assert.match(await text('#customRows'), /next card must be black/);
  await click('#savedDel');
  assert.equal(await ev(() => JSON.parse(localStorage.getItem('ms.settings')).saved.length), 0);
  ok('colour rule picked as an action; rules saved by name, reloaded from Preset, deleted');

  assert.deepEqual(errors, []);
  console.log(steps.join('\n') + '\npage errors: 0');
  await browser.close();
})().catch(e => { console.error(steps0.join('\n') + '\nSETUP DRIVE FAILED:', e.message); process.exit(1); });

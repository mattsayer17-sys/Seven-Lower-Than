// Headless check of first-run onboarding. Usage: node tools/onboarding-drive.js dist/index.html
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const assert = require('node:assert/strict');
let steps0 = [];
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 760 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // wipe storage on the first load of each run only, so a reload keeps what the page saved
  await page.evaluateOnNewDocument(() => { window.__MS_FAST = true; window.__MS_WELCOME = true; if (!sessionStorage.getItem('seen')) { localStorage.clear(); sessionStorage.setItem('seen', '1'); } });
  const url = 'file://' + path.resolve(process.argv[2]);
  const ev = (fn, ...a) => page.evaluate(fn, ...a);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const until = async (fn, label, n = 300) => { for (let i = 0; i < n; i++) { if (await ev(fn)) return; await wait(20); } throw new Error('timeout: ' + label); };
  const text = sel => ev(s => (document.querySelector(s) || {}).textContent || '', sel);
  const click = sel => ev(s => document.querySelector(s).click(), sel);
  const modalOpen = () => ev(() => !document.querySelector('#modal').classList.contains('hidden'));
  const nameless = () => ev(() => [...document.querySelectorAll('#modal button, #modal input')].filter(e => !((e.getAttribute('aria-label') || '') + e.textContent).trim()).map(e => e.id));
  const steps = steps0 = []; const ok = n => steps.push('ok  ' + n);
  const fresh = async () => { await ev(() => { sessionStorage.clear(); localStorage.clear(); }); await page.goto(url); };

  // 1. a new player lands straight in a dealt game: no pop-up, no name, just a small card on the felt
  await page.goto(url);
  await until(() => window.__ms && !!document.querySelector('#coach.on'), 'getting-started card', 400);
  const w = await ev(() => { const c = document.querySelector('#coach'); return { modal: !document.querySelector('#modal').classList.contains('hidden'), role: c.getAttribute('role'), label: c.getAttribute('aria-label'), name: !!document.querySelector('#wName'), buttons: ['#wWatch', '#wRead'].map(x => document.querySelector(x).textContent), x: document.querySelector('#wPlay').getAttribute('aria-label'), cards: document.querySelectorAll('#cards .card').length }; });
  assert.equal(w.modal, false, 'nothing modal on first launch');
  assert.equal(w.role, 'region'); assert.equal(w.label, 'Getting started'); assert.equal(w.name, false, 'no name field before playing');
  assert.deepEqual(w.buttons, ['Show me · 30 s', 'Rules']); assert.equal(w.x, 'Just play');
  assert.equal(w.cards, 52);
  const nm = await ev(() => window.__ms.prof().name);
  assert.match(nm, /^[A-Z][a-z]+ [A-Z][a-z]+ \d\d$/, 'a name was suggested quietly: ' + nm);
  ok('first launch: cards dealt, no pop-up, no form, a small card offers the rules; name "' + nm + '" suggested quietly');

  // 2. Rules opens the written version
  await click('#wRead');
  await until(() => !!document.querySelector('.primer'), 'primer');
  assert.equal(await ev(() => document.querySelectorAll('.primer > li').length), 6);
  const spec = await text('.primer ul');
  assert.match(spec, /2: /); assert.match(spec, /10: /); assert.match(spec, /7: /); assert.match(spec, /Four of a kind/);
  assert.equal(await ev(() => !!document.querySelector('#coach')), false);
  ok('Rules: written walkthrough lists this table\'s special cards, the card goes away');
  await click('#pmDone');
  assert.equal(await modalOpen(), false);

  // 3. once only
  await page.goto(url);
  await until(() => window.__ms && !window.__ms.ui().busy, 'ready again');
  await wait(2500);
  assert.equal(await modalOpen(), false);
  assert.equal(await ev(() => !!document.querySelector('#coach')), false);
  ok('after a reload the card does not come back');

  // 4. someone who has already played is not welcomed
  await ev(() => { const P = JSON.parse(localStorage.getItem('ms.profiles')); P.list[0].flags = {}; P.list[0].g = 3; localStorage.setItem('ms.profiles', JSON.stringify(P)); });
  await page.goto(url);
  await until(() => window.__ms && !window.__ms.ui().busy, 'ready played');
  await wait(2500);
  assert.equal(await ev(() => !!document.querySelector('#coach')), false);
  ok('an existing player (games played) skips it');

  // 5. Setup has the read button too
  await click('#bNew');
  await until(() => !!document.querySelector('#primerBtn'), 'setup');
  await click('#primerBtn');
  await until(() => !!document.querySelector('.primer'), 'primer from setup');
  assert.equal(await text('#sheetTitle'), 'How it works');
  await page.keyboard.press('Escape');
  await wait(50);
  assert.equal(await modalOpen(), false);
  ok('Setup: "Read" opens the same text, Escape closes it');

  // 6. Watch starts the walkthrough, and Skip ends it
  await fresh();
  await until(() => window.__ms && !!document.querySelector('#wWatch'), 'welcome 2', 400);
  await click('#wWatch');
  await until(() => !document.querySelector('#cap').classList.contains('hidden'), 'tour caption', 400);
  ok('Watch starts the walkthrough (caption on screen)');
  await click('#capSkip');
  await until(() => document.querySelector('#cap').classList.contains('hidden') && !window.__ms.tour(), 'tour skipped', 600);
  ok('Skip ends it');

  // 7. Just play dismisses it and remembers
  await fresh();
  await until(() => window.__ms && !!document.querySelector('#wPlay'), 'welcome 3', 400);
  await click('#wPlay');
  await until(() => !document.querySelector('#coach'), 'card closed');
  assert.equal(await ev(() => window.__ms.prof().flags.welcomed), true);
  ok('× closes it and remembers');

  // 7b. or just play a card: your first move puts it away
  await fresh();
  await until(() => window.__ms && !!document.querySelector('#coach.on'), 'welcome 3b', 400);
  await until(() => { const g = window.__ms.game(), ui = window.__ms.ui(); return g.phase === 'swap' && !ui.busy && !ui.intro; }, 'swap ready', 400);
  await click('#bReady');
  await until(() => { const g = window.__ms.game(), ui = window.__ms.ui(); return g.phase === 'play' && (g.turn !== 0 || !ui.busy); }, 'play', 600);
  for (let i = 0; i < 300 && await ev(() => !!document.querySelector('#coach')); i++) {
    await ev(() => { const g = window.__ms.game(), ui = window.__ms.ui(); if (g.turn !== 0 || ui.busy || ui.intro) return; const gr = window.Shed.legalGroups(g, 0); if (!gr.length) return document.querySelector('#bPick').click(); gr[0].forEach(c => document.querySelector('#cards .card[data-id="' + c.id + '"]').click()); const b = document.querySelector('#bPlay'); if (b && !b.disabled) b.click(); });
    await wait(30);
  }
  assert.equal(await ev(() => !!document.querySelector('#coach')), false);
  ok('playing your first card puts it away, no tap on the card needed');

  // 8. Escape also dismisses and the sheet is not shown again
  await fresh();
  await until(() => window.__ms && !!document.querySelector('#wPlay'), 'welcome 4', 400);
  await page.keyboard.press('Escape');
  await until(() => !document.querySelector('#coach'), 'escape closed');
  assert.equal(await ev(() => window.__ms.prof().flags.welcomed), true);
  ok('Escape dismisses it too');

  assert.deepEqual(errors, []);
  console.log(steps.join('\n') + '\npage errors: 0');
  await browser.close();
})().catch(e => { console.error(steps0.join('\n') + '\nONBOARDING DRIVE FAILED:', e.message); process.exit(1); });

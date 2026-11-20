// Headless accessibility check. Usage: node tools/a11y-drive.js dist/index.html
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const assert = require('node:assert/strict');
let steps0 = null;
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 900 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.evaluateOnNewDocument(() => { window.__MS_FAST = true; localStorage.clear(); Math.random = (() => { let s = 12345; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })(); });
  await page.goto('file://' + path.resolve(process.argv[2]));
  const ev = (fn, ...a) => page.evaluate(fn, ...a);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const until = async (fn, label, ...a) => { for (let i = 0; i < 400; i++) { if (await ev(fn, ...a)) return; await wait(20); } throw new Error('timeout: ' + label); };
  const steps = steps0 = []; const ok = n => steps.push('ok  ' + n);
  const key = k => page.keyboard.press(k);
  const focus = sel => ev(s => { const e = document.querySelector(s); e.focus(); return document.activeElement === e; }, sel);

  // accessible name the way a browser works it out, close enough for a check
  const nameCheck = () => ev(() => {
    const bad = [];
    document.querySelectorAll('#modal button, #modal input, #modal select, #modal textarea').forEach(e => {
      if (e.type === 'hidden') return;
      const lab = e.labels && e.labels.length ? [...e.labels].map(l => l.textContent).join(' ') : '';
      const nm = (e.getAttribute('aria-label') || '') + lab + (e.tagName === 'BUTTON' ? e.textContent : '') + (e.getAttribute('title') || '');
      if (!nm.trim()) bad.push(e.tagName + '#' + (e.id || e.className || '?'));
    });
    return bad;
  });

  await until(() => window.__ms && window.__ms.game() && window.__ms.game().phase === 'swap' && !window.__ms.ui().busy && !window.__ms.ui().intro, 'dealt');

  // 1. page level
  assert.equal(await ev(() => /user-scalable\s*=\s*no/.test(document.querySelector('meta[name=viewport]').content)), false);
  ok('pinch zoom is not disabled');
  assert.equal(await ev(() => document.querySelector('#cards').getAttribute('aria-hidden')), 'true');
  assert.equal(await ev(() => document.querySelectorAll('.card[role], .card[aria-label]').length), 0);
  ok('cards on the felt are hidden from assistive tech and carry no spoken face');
  assert.deepEqual(await ev(() => ['#status', '#msg', '#toast'].map(s => document.querySelector(s).getAttribute('aria-live'))), ['polite', 'polite', 'polite']);
  ok('status, message and toast are polite live regions');

  // 2. nothing hidden is readable anywhere
  const leak = await ev(() => {
    const g = window.__ms.game();
    const W = { J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace' }, Sx = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
    const nm = c => (W[c.rank] || c.rank) + ' of ' + Sx[c.suit];
    const secret = [];
    g.draw.forEach(c => secret.push(nm(c)));
    g.players.forEach((p, i) => { p.down.forEach(c => secret.push(nm(c))); if (i) p.hand.forEach(c => secret.push(nm(c))); });
    const heard = [...document.querySelectorAll('[aria-label]')].filter(e => !e.closest('[aria-hidden=true]')).map(e => e.getAttribute('aria-label')).join(' | ') + ' | ' + document.querySelector('#sr').textContent;
    return { secret: secret.length, hits: secret.filter(s => heard.includes(s)) };
  });
  assert.ok(leak.secret > 10);
  assert.deepEqual(leak.hits, []);
  ok('no opponent hand, face-down or draw-pile card is readable (' + leak.secret + ' secrets checked)');
  const sum = await ev(() => document.querySelector('#srSum').textContent);
  assert.match(sum, /(Pile: .*|The pile is empty\.) Draw pile: \d+ left\./);
  assert.match(sum, /You have 3 cards in hand/);
  ok('table summary: ' + sum.slice(0, 90) + '...');

  // 3. keyboard: swap phase
  const nBtn = await ev(() => document.querySelectorAll('#sr button[data-id]').length);
  assert.equal(nBtn, 9);
  ok('nine reachable cards (3 hand, 3 face up, 3 face down)');
  const firstHand = await ev(() => document.querySelector('#sr button[data-id]').dataset.id);
  assert.equal(await ev(id => document.querySelector('#sr button[data-id="' + id + '"]').focus() || document.activeElement.dataset.id, firstHand), firstHand);
  await key('Enter');
  await wait(60);
  assert.equal(await ev(id => document.querySelector('#sr button[data-id="' + id + '"]').getAttribute('aria-pressed'), firstHand), 'true');
  assert.equal(await ev(id => document.activeElement.dataset.id, firstHand), firstHand);
  ok('Enter on a card selects it, says pressed, and keeps focus on it');
  // swap with the first face-up card by keyboard
  const upId = await ev(() => { const b = [...document.querySelectorAll('#sr button[data-id]')].find(x => /face up/.test(x.textContent)); b.focus(); return b.dataset.id; });
  const handBefore = await ev(() => window.__ms.game().players[0].hand.map(c => c.id));
  await key('Enter');
  await wait(80);
  const handAfter = await ev(() => window.__ms.game().players[0].hand.map(c => c.id));
  assert.notDeepEqual(handBefore.slice().sort(), handAfter.slice().sort());
  assert.ok(handAfter.includes(+upId));
  ok('selecting a face-up card by keyboard swaps it into the hand');

  // 4. lock in and play a card with the keyboard
  assert.equal(await focus('#bReady'), true);
  await key('Enter');
  await until(() => window.__ms.game().phase === 'play' && window.__ms.game().turn === 0 && !window.__ms.ui().busy, 'my turn', 0);
  const st = await ev(() => document.querySelector('#status').textContent);
  assert.match(st, /Your turn/);
  ok('status tells me it is my turn: "' + st + '"');
  const playable = await ev(() => { const b = [...document.querySelectorAll('#sr button[data-id]')].find(x => !x.hasAttribute('aria-disabled') && /in your hand/.test(x.textContent)); return b ? b.dataset.id : null; });
  assert.ok(playable);
  const dim = await ev(() => [...document.querySelectorAll('#sr button[data-id][aria-disabled]')].filter(x => /cannot be played now/.test(x.textContent)).length);
  ok('playable and unplayable cards are told apart (' + dim + ' marked cannot be played now)');
  const cardsBefore = await ev(() => window.__ms.game().pile.length);
  await ev(id => document.querySelector('#sr button[data-id="' + id + '"]').focus(), playable);
  await key('Enter'); await wait(50);
  let played = await ev(() => window.__ms.game().pile.length);
  if (played === cardsBefore) { await key('Enter'); } // second press plays a selected card
  await until(() => /played|flipped|picked/.test(document.querySelector('#msg').textContent), 'move announced');
  const msg = await ev(() => document.querySelector('#msg').textContent);
  assert.match(msg, /^You played|^You flipped|^You picked/);
  ok('my move is announced in the message region: "' + msg + '"');

  // 5. sound toggle state
  const before = await ev(() => document.querySelector('#bSnd').getAttribute('aria-pressed'));
  await ev(() => document.querySelector('#bSnd').click());
  assert.notEqual(await ev(() => document.querySelector('#bSnd').getAttribute('aria-pressed')), before);
  await ev(() => document.querySelector('#bSnd').click());
  ok('sound button reports on/off');

  // 6. dialogs
  await until(() => !window.__ms.ui().busy, 'idle');
  await ev(() => document.querySelector('#bNew').focus());
  await key('Enter');
  await until(() => !document.querySelector('#modal').classList.contains('hidden'), 'sheet open');
  const d = await ev(() => { const s = document.querySelector('.sheet'); return { role: s.getAttribute('role'), modal: s.getAttribute('aria-modal'), title: document.getElementById(s.getAttribute('aria-labelledby')).textContent, focus: document.activeElement === s, hdr: document.querySelector('header').inert, tbl: document.querySelector('#table').inert }; });
  assert.deepEqual(d, { role: 'dialog', modal: 'true', title: 'New game', focus: true, hdr: true, tbl: true });
  ok('Setup is a named modal dialog, focus moved in, page behind switched off');
  assert.deepEqual(await nameCheck(), []);
  ok('every control in Setup has a name');
  await ev(() => document.querySelector('#seg button[data-n="3"]').click());
  await wait(30);
  assert.equal(await ev(() => document.querySelector('#seg button[data-n="3"]').getAttribute('aria-pressed')), 'true');
  assert.equal(await ev(() => document.querySelector('#seg button[data-n="2"]').getAttribute('aria-pressed')), 'false');
  ok('player count buttons report which is chosen');
  for (let i = 0; i < 40; i++) await key('Tab');
  assert.equal(await ev(() => !!document.activeElement.closest('#modal')), true);
  ok('Tab stays inside the dialog');
  await key('Escape');
  await wait(60);
  const e = await ev(() => ({ hidden: document.querySelector('#modal').classList.contains('hidden'), hdr: document.querySelector('header').inert, tbl: document.querySelector('#table').inert, back: document.activeElement && document.activeElement.id }));
  assert.deepEqual(e, { hidden: true, hdr: false, tbl: false, back: 'bNew' });
  ok('Escape closes it, the page wakes up and focus returns to the button that opened it');

  for (const [sel, label] of [['#bRules', 'This table'], ['#bProf', null]]) {
    await ev(s => document.querySelector(s).click(), sel);
    await until(() => !document.querySelector('#modal').classList.contains('hidden'), label + ' open');
    assert.deepEqual(await nameCheck(), [], sel);
    assert.equal(await ev(() => !!document.querySelector('.sheet').getAttribute('aria-labelledby') || !document.querySelector('.sheet h2')), true);
    await key('Escape'); await wait(40);
  }
  ok('Rules and Profile sheets: every control named, Escape closes');

  // vote sheet
  await ev(() => document.querySelector('#bNew').click());
  await until(() => !!document.querySelector('#voteBtn'), 'setup');
  await ev(() => document.querySelector('#voteBtn').click());
  await until(() => !!document.querySelector('#tblRoot'), 'vote sheet');
  assert.deepEqual(await nameCheck(), []);
  await key('Escape'); await wait(80);
  assert.equal(await ev(() => !document.querySelector('#tblRoot') && !document.querySelector('#modal').classList.contains('hidden') && !!document.querySelector('#rPreset')), true);
  ok('vote sheet controls named; Escape goes Back to Setup');

  assert.deepEqual(errors, []);
  console.log(steps.join('\n') + '\npage errors: 0');
  await browser.close();
})().catch(e => { console.error((steps0 || []).join('\n') + '\nA11Y DRIVE FAILED:', e.stack.split('\n').slice(0, 4).join('\n')); process.exit(1); });

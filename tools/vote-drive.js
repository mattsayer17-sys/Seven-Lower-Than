// Headless check of the table rules vote sheet. Usage: node tools/vote-drive.js dist/index.html
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const assert = require('node:assert/strict');
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
  const until = async (fn, label, ...a) => { for (let i = 0; i < 300; i++) { if (await ev(fn, ...a)) return; await wait(20); } throw new Error('timeout: ' + label); };
  const text = sel => ev(s => (document.querySelector(s) || {}).textContent || '', sel);
  const pick = (sel, v) => ev((s, val) => { const e = document.querySelector(s); e.value = val; e.dispatchEvent(new Event('change', { bubbles: true })); }, sel, v);
  const steps = [];
  const ok = (name) => steps.push('ok  ' + name);

  await until(() => window.__ms && window.__ms.game() && !window.__ms.ui().busy, 'game ready');
  await ev(() => document.querySelector('#bNew').click());
  await until(() => !!document.querySelector('#voteBtn'), 'setup sheet');
  await ev(() => document.querySelector('#voteBtn').click());
  await until(() => !!document.querySelector('#tblRoot'), 'table sheet');
  const players = await text('#tblPlayers');
  assert.match(players, /host/); assert.match(players, /Tali/); assert.match(players, /Dave/);
  ok('sheet opens with host and two guests');
  assert.match(await text('#tblRules'), /Four of a kind/);

  // 1. propose a rule with a card: you (yes) + Tali (yes) = majority
  await pick('#tblChange', 'flag:skipOn');
  assert.equal(await ev(() => !document.querySelector('#tblRankBox').classList.contains('hidden')), true);
  await pick('#tblRank', '9');
  await ev(() => document.querySelector('#tblPropose').click());
  assert.match(await text('#tblVote'), /Player 1 proposes/);
  assert.equal(await ev(() => document.querySelector('#tblPropose').disabled), true);
  ok('proposal opens a vote and locks the propose button');
  await until(() => /Passed/.test(document.querySelector('#tblLast').textContent), 'vote passes');
  assert.equal(await text('#tblLast'), 'Passed: Turn on Skip a go (9s)');
  assert.match(await text('#tblRules'), /9: Next player misses/);
  assert.equal(await ev(() => document.querySelector('#tblPropose').disabled), false);
  ok('majority passes it and the rule list updates');

  // 2. a clash is refused straight away
  await pick('#tblChange', 'flag:transparentOn');
  await pick('#tblRank', '9');
  await ev(() => document.querySelector('#tblPropose').click());
  assert.equal(await text('#tblNote'), 'Not allowed: 9 is already used by the skip a go rule.');
  assert.equal(await ev(() => !!document.querySelector('.votecard')), false);
  ok('a card that already has a rule is refused');

  // 3. a guest proposes, you and Tali vote it down before Dave's answer matters
  await ev(() => { const t = window.__ms.table; t.dispatch({ type: 'propose', by: 'dave', change: { type: 'flag', key: 'fourBurns', value: false } }); t.dispatch({ type: 'vote', by: 'me', choice: 'no' }); t.dispatch({ type: 'vote', by: 'tali', choice: 'no' }); });
  assert.equal(await text('#tblLast'), 'Voted down: Turn off Four of a kind burns');
  assert.match(await text('#tblRules'), /Four of a kind/);
  ok('a vote can fail and leaves the rules alone');

  // 4. your own Yes/No buttons
  await ev(() => window.__ms.table.dispatch({ type: 'propose', by: 'dave', change: { type: 'flag', key: 'sevensLower', value: false } }));
  await until(() => !!document.querySelector('#vYes') || /Passed|Voted/.test(document.querySelector('#tblLast').textContent), 'vote card');
  await until(() => document.querySelector('#tblLast').textContent.includes('7s'), 'sevens vote settled');
  ok('guests vote on their own');

  // 5. custom rule and the clash with it
  await pick('#tblChange', 'custom');
  await pick('#tblCRank', 'J'); await pick('#tblCEff', 'reverse');
  await ev(() => document.querySelector('#tblPropose').click());
  await until(() => /Add a rule/.test(document.querySelector('#tblLast').textContent), 'custom settled');
  ok('own rule proposal: ' + await text('#tblLast'));

  // 6. start: the rules reach the game
  await ev(() => document.querySelector('#tblStart').click());
  await until(() => document.querySelector('#modal').classList.contains('hidden') && window.__ms.game() && window.__ms.game().phase === 'swap', 'game started');
  const r = await ev(() => { const g = window.__ms.game(); return { skip9: g.rules.ranks['9'].effect, seven: g.rules.ranks['7'].effect || null, four: g.rules.fourOfAKindBurns }; });
  assert.deepEqual(r, { skip9: 'skip', seven: null, four: true });
  ok('start applies the voted rules to the game ' + JSON.stringify(r));
  assert.deepEqual(errors, []);
  console.log(steps.join('\n') + '\npage errors: 0');
  await browser.close();
})().catch(e => { console.error('VOTE DRIVE FAILED:', e.message); process.exit(1); });

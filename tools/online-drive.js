// Headless check of online play in the real page. The page is one seat; bots in node are the others.
// The server code and an in-memory database run in node, bridged into the page as its transport.
// Usage: node tools/online-drive.js dist/index.html
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const assert = require('node:assert/strict');
const Shed = require('../src/engine.js');
const Online = require('../src/online.js');
const { handle } = require('../server/handler.js');
const { FakeDb, lobbyOf, mineOf, chatOf } = require('../server/fakedb.js');

function decide(g) {
  const p = g.players[0];
  if (g.phase === 'swap') return p.ready ? null : { type: 'ready' };
  if (g.phase !== 'play' || g.turn !== 0) return null;
  const z = Shed.zone(g, p);
  if (z === 'down') return { type: 'blind', id: p.down[0].id };
  const gr = Shed.legalGroups(g, 0).sort((a, b) => Shed.power(g.rules, a[0]) - Shed.power(g.rules, b[0]));
  return gr.length ? { type: 'play', ids: gr[0].map(c => c.id) } : { type: 'pickup' };
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 900 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const db = new FakeDb();
  const view = (uid, code) => { const r = db.t.shed_views.find(x => x.code === code && x.user_id === uid); return r ? { version: r.version, view: JSON.parse(JSON.stringify(r.view)) } : null; };
  await page.exposeFunction('__bridge', async (op, arg) => {
    if (op === 'call') return handle(db, 'ui', arg);
    if (op === 'view') return view('ui', arg);
    if (op === 'lobby') return lobbyOf(db, arg);
    if (op === 'mine') return mineOf(db, 'ui');
    if (op === 'chat') return chatOf(db, arg.code, arg.after);
    if (op === 'chatHead') { const c = chatOf(db, arg, 0); return c.length ? c[c.length - 1].id : 0; }
  });
  await page.evaluateOnNewDocument(() => {
    window.__MS_FAST = true;
    if (!sessionStorage.getItem('kept')) { localStorage.clear(); sessionStorage.setItem('kept', '1'); }
    window.__MS_TRANSPORT = { uid: 'ui', call: b => window.__bridge('call', b), view: c => window.__bridge('view', c), lobby: c => window.__bridge('lobby', c), mine: () => window.__bridge('mine'), chat: (code, after) => window.__bridge('chat', { code, after }), chatHead: c => window.__bridge('chatHead', c) };
  });
  await page.goto('file://' + path.resolve(process.argv[2]));
  const ev = (fn, ...a) => page.evaluate(fn, ...a);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const until = async (fn, label, ...a) => { for (let i = 0; i < 600; i++) { if (await ev(fn, ...a)) return; await wait(20); } throw new Error('timeout: ' + label); };
  const text = sel => ev(s => (document.querySelector(s) || {}).textContent || '', sel);
  const click = sel => ev(s => document.querySelector(s).click(), sel);
  const steps = [];
  const ok = n => steps.push('ok  ' + n);

  async function makeBots(n) {
    const bots = [];
    for (let i = 0; i < n; i++) {
      const uid = 'bot' + i;
      const c = new Online.Client({ call: b => handle(db, uid, b), view: async code => view(uid, code), lobby: async code => lobbyOf(db, code) });
      await c.profile('Bot' + (i + 1));
      bots.push({ uid, c });
    }
    return bots;
  }
  async function botsMove(bots, code) {
    // a human opponent is slower than a bot: let the page catch up first, or it would have to resync
    const v = view('ui', code);
    if (v && !(await ev(x => !window.__ms.game() || window.__ms.game().version >= x, v.version))) return 'wait';
    for (const b of bots) {
      const r = view(b.uid, code);
      if (!r) continue;
      const a = decide(Online.fromView(r.view));
      if (a) { await handle(db, b.uid, { op: 'act', code, action: a }); return true; }
    }
    return false;
  }
  const cardCount = () => ev(() => document.querySelectorAll('#cards .card').length);
  const uiMove = () => ev(() => {
    const g = window.__ms.game(), ui = window.__ms.ui();
    if (g.phase === 'swap') { if (!ui.busy && !ui.intro) { document.querySelector('#bReady').click(); return 'ready'; } return null; }
    if (g.phase !== 'play' || g.turn !== 0 || ui.busy || ui.intro) return null;
    const me = g.players[0];
    if (!me.hand.length && !me.up.length) { const c = me.down[0]; document.querySelector('#cards .card[data-id="' + c.id + '"]').click(); return 'blind'; }
    const gr = window.Shed.legalGroups(g, 0).sort((a, b) => window.Shed.power(g.rules, a[0]) - window.Shed.power(g.rules, b[0]));
    if (!gr.length) { document.querySelector('#bPick').click(); return 'pickup'; }
    const ids = gr[0].map(c => c.id);
    const el = id => document.querySelector('#cards .card[data-id="' + id + '"]');
    ids.forEach(id => el(id).click());
    document.querySelector('#bPlay').click();
    return 'play';
  });

  async function scenario(label, nBots, settings, reloadAt) {
    await until(() => window.__ms && window.__ms.game() && !window.__ms.ui().busy, 'game ready');
    await ev(s => window.__ms.setSettings(s), settings);
    await click('#bNew');
    await until(() => !!document.querySelector('#mode'), 'setup sheet');
    await click('#mode button[data-m="online"]');
    await click('#rNew');
    await until(() => !!document.querySelector('#olMake'), 'online sheet');
    await ev(() => { document.querySelector('#olName').value = 'Matt'; });
    await click('#olMake');
    await until(() => /Table [A-Z2-9]{5}/.test(document.querySelector('.sheet h2').textContent), 'waiting room');
    const code = (await text('.sheet h2')).replace('Table ', '').trim();
    assert.equal(await ev(() => document.querySelector('#olStart').disabled), true);
    ok(label + ': table ' + code + ' made, Start locked while alone');
    const inv = await ev(() => ({ wa: document.querySelector('#olWa').getAttribute('href'), copy: !!document.querySelector('#olCopy') }));
    assert.match(decodeURIComponent(inv.wa), new RegExp('\\?join=' + code));
    assert.ok(inv.copy);
    await click('#olQr');
    assert.equal(await ev(() => !!document.querySelector('#olQrBox svg')), true);
    await click('#olQr');
    ok(label + ': invite by WhatsApp link, copy link and QR code all carry ?join=' + code);
    await wait(1800); await page.screenshot({ path: '/tmp/online-lobby-' + nBots + '.png' });
    const bots = await makeBots(nBots);
    for (const b of bots) await b.c.join(code);
    await until(() => document.querySelectorAll('#olSeats .row').length === 1 + (window.__n || 0), 'seats', 0).catch(() => {});
    await until(n => document.querySelectorAll('#olSeats .row').length === n, 'seats listed', nBots + 1);
    assert.match(await text('#olSeats'), /Matt/); assert.match(await text('#olSeats'), /Bot1/);
    await until(() => !document.querySelector('#olStart').disabled, 'start unlocked');
    ok(label + ': seats listed live, Start unlocked');
    if (nBots === 1) {
      // a house rule vote in the waiting room: a bot proposes, the page sees it, votes, and the rules change
      assert.match(await text('#olRules'), /7: /);
      await bots[0].c.propose({ type: 'flag', key: 'sevensLower', value: false });
      await until(() => !!document.querySelector('#vYes'), 'vote card shown');
      assert.equal(await ev(() => document.querySelector('#olStart').disabled), true, 'Start waits for the vote');
      await click('#vYes');
      await until(() => !document.querySelector('#vYes'), 'vote settled');
      assert.match(await text('#olLast'), /^Passed/);
      assert.doesNotMatch(await text('#olRules'), /7: /);
      await until(() => !document.querySelector('#olStart').disabled, 'start unlocked after the vote');
      ok(label + ': a vote from another player showed up, passed 2 to 0, rules changed, Start unlocked');
    }
    await click('#olStart');
    await until(n => window.__ms.game().online === true && window.__ms.game().players.length === n && window.__ms.game().phase !== 'over', 'game online', nBots + 1);
    await until(() => !window.__ms.ui().intro && !window.__ms.ui().hideui, 'deal finished');
    assert.equal(await cardCount(), 52);
    ok(label + ': game started in the page, 52 card elements');
    if (nBots === 1) { assert.equal(await ev(() => window.__ms.game().rules.ranks['7'].effect), null); ok(label + ': the game was dealt with the voted rules'); }
    // reactions: another player's shows over their seat, mine reaches the server, no free-text box
    await until(() => window.__ms.remote().chatAfter != null, 'chat baseline');
    const before = db.t.shed_chat.length;
    assert.equal((await handle(db, bots[0].uid, { op: 'react', code, text: '😂' })).status, 200);
    await until(() => [...document.querySelectorAll('#fx .bubble')].some(b => b.textContent === '😂' && !b.classList.contains('me')), 'bot reaction bubble');
    assert.match(await text('#chatlog'), /Bot1/);
    await click('#chatBtn');
    assert.equal(await ev(() => document.querySelector('#chatTextRow').classList.contains('hidden')), true);
    await click('#chatPanel .e[data-e="👍"]');
    for (let i = 0; i < 200 && !db.t.shed_chat.some(c => c.user_id === 'ui' && c.body === '👍'); i++) await wait(20);
    assert.ok(db.t.shed_chat.some(c => c.user_id === 'ui' && c.body === '👍'), 'my reaction reached the server');
    assert.equal(db.t.shed_chat.length, before + 2);
    await wait(200);
    assert.equal((await text('#chatlog')).split('👍').length - 1, 1, 'my own reaction is not echoed back');
    ok(label + ': reactions relayed both ways (bot 😂 bubble over its seat, my 👍 stored once), preset-only panel');
    await page.screenshot({ path: '/tmp/online-start-' + nBots + '.png' });
    // play it out
    let shot = false;
    let reloaded = false, moves = 0;
    for (let guard = 0; guard < 6000; guard++) {
      const phase = await ev(() => window.__ms.game().phase);
      if (phase === 'over') break;
      if (reloadAt && !reloaded && moves >= reloadAt) {
        reloaded = true;
        await page.reload();
        await until(() => window.__ms && window.__ms.game() && !window.__ms.ui().busy, 'reloaded');
        await click('#bNew');
        await until(() => !!document.querySelector('#mode'), 'setup sheet 2');
        await click('#mode button[data-m="online"]');
        await click('#rNew');
        await until(() => !!document.querySelector('.olRes'), 'your tables list');
        assert.match(await text('#olMine'), new RegExp(code));
        assert.match(await text('#olMine'), /Your turn|Their turn/);
        await click('.olRes');
        await until(() => window.__ms.game().online === true && window.__ms.game().phase !== 'swap', 'resumed in play');
        await until(() => !window.__ms.ui().intro && !window.__ms.ui().hideui, 'resume deal');
        assert.equal(await cardCount(), 52);
        ok(label + ': page reloaded mid game and resumed at the right place');
      }
      if (!shot && moves > 12 && await ev(() => !window.__ms.ui().busy && window.__ms.game().turn === 0)) { shot = true; await page.screenshot({ path: '/tmp/online-mid-' + nBots + '.png' }); }
      const bm = await botsMove(bots, code);
      if (bm === 'wait') { await wait(10); continue; }
      if (bm) { moves++; await wait(5); continue; }
      const m = await uiMove();
      if (m) moves++;
      await wait(15);
      // the page and the server must agree about the table
      if (moves % 15 === 0) {
        const r = view('ui', code);
        await until(v => window.__ms.digest() === v || window.__ms.ui().busy, 'digest check', Online.digest(Online.fromView(r.view)));
      }
    }
    await until(() => window.__ms.game().phase === 'over', 'game over');
    if (!reloadAt) assert.equal(await ev(() => window.__ms.remote().playResyncs), 0);
    await until(() => /Back to online/.test(document.querySelector('#modal').textContent), 'over sheet');
    assert.equal(await cardCount(), 52);
    ok(label + ': played to the end in ' + moves + ' moves, over sheet offers Back to online');
    await click('#again');
    await until(() => !!document.querySelector('#olMake'), 'back to online sheet');
    await click('#olClose');
  }

  await scenario('2 players', 1, { players: 2 });
  await scenario('4 players, house rules, reload', 3, { players: 4, transparentOn: true, skipOn: true }, 25);

  console.log(steps.join('\n'));
  assert.deepEqual(errors, []);
  console.log('page errors: 0');
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });

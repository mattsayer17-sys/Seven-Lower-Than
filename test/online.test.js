'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Shed = require('../src/engine.js');
const Presets = require('../src/presets.js');
const Online = require('../src/online.js');
const { handle } = require('../server/handler.js');
const { FakeDb } = require('../server/fakedb.js');

// A transport that talks straight to the handler and reads the caller's own view row.
const local = (db, uid) => ({
  call: (body) => handle(db, uid, body),
  view: async (code) => { const r = db.t.shed_views.find(x => x.code === code && x.user_id === uid); return r ? { version: r.version, view: JSON.parse(JSON.stringify(r.view)) } : null; },
});

async function setup(n, opts) {
  const db = new FakeDb(), cs = [];
  for (let i = 0; i < n; i++) { const c = new Online.Client(local(db, 'u' + i)); await c.profile('P' + i); cs.push(c); }
  const code = await cs[0].create(opts || {}, 5);
  for (let i = 1; i < n; i++) await cs[i].join(code);
  await cs[0].start();
  return { db, cs, code };
}

function decide(g) {
  const p = g.players[0];
  if (g.phase === 'swap') return p.ready ? null : { type: 'ready' };
  if (g.phase !== 'play' || g.turn !== 0) return null;
  const z = Shed.zone(g, p);
  if (z === 'down') return { type: 'blind', id: p.down[0].id };
  const gr = Shed.legalGroups(g, 0).sort((a, b) => Shed.power(g.rules, a[0]) - Shed.power(g.rules, b[0]));
  return gr.length ? { type: 'play', ids: gr[0].map(c => c.id) } : { type: 'pickup' };
}

test('the adapted game puts me at seat 0 and keeps everyone else in order', async () => {
  const { db, cs } = await setup(3);
  const real = db.t.shed_games[0].state;
  for (let me = 0; me < 3; me++) {
    const g = await cs[me].refresh();
    assert.equal(g.players[0].name, real.players[me].name);
    for (let i = 0; i < 3; i++) assert.equal(g.players[i].name, real.players[(me + i) % 3].name);
    assert.deepEqual(g.players[0].hand.map(c => c.id), real.players[me].hand.map(c => c.id));
    assert.ok(g.players[0].down.every((c, j) => c.id === real.players[me].down[j].id), 'my own down card ids are usable');
    for (let i = 1; i < 3; i++) {
      assert.ok(g.players[i].hand.every(c => c.hidden && c.id < 0), 'their hand is placeholders');
      assert.ok(g.players[i].down.every(c => c.hidden && c.id < 0));
      assert.equal(g.players[i].hand.length, real.players[(me + i) % 3].hand.length);
    }
    assert.equal(g.draw.length, real.draw.length);
    const ids = [].concat(...g.players.map(p => p.hand.concat(p.down).map(c => c.id)), g.draw.map(c => c.id));
    assert.equal(new Set(ids.filter(x => x < 0)).size, ids.filter(x => x < 0).length, 'placeholder ids are unique');
  }
});

test('turn, winner and events are rotated with the seats', async () => {
  const { db, cs } = await setup(4);
  for (const c of cs) await c.act({ type: 'ready' });
  const real = db.t.shed_games[0].state;
  for (let me = 0; me < 4; me++) {
    const g = await cs[me].refresh();
    assert.equal(g.turn, (real.turn - me + 4) % 4);
    assert.equal(cs[me].myTurn, real.turn === me);
  }
});

test('refresh only returns something when the game moved', async () => {
  const { cs } = await setup(2);
  assert.ok(await cs[0].refresh());
  assert.equal(await cs[0].refresh(), null);
});

test('errors from the server surface as messages', async () => {
  const { cs } = await setup(2);
  await assert.rejects(() => cs[0].act({ type: 'pickup' }), /./);
  await assert.rejects(() => new Online.Client(local(new FakeDb(), 'zz')).create({}), /name/i);
});

test('full games played through the clients, 2 to 4 players, every preset', async () => {
  for (const n of [2, 3, 4, 5]) for (const p of Presets.PRESETS) {
    const { db, cs, code } = await setup(n, p.opts);
    for (let step = 0; step < 4000; step++) {
      if (db.t.shed_tables.find(t => t.code === code).status === 'over') break;
      let moved = false;
      for (const c of cs) {
        const g = await c.refresh() || (c.view && Online.fromView(c.view));
        const a = g && decide(g);
        if (a) { await c.act(a); moved = true; break; }
      }
      assert.ok(moved, 'stuck at step ' + step);
    }
    assert.equal(db.t.shed_tables[0].status, 'over');
    const g = await cs[0].refresh() || Online.fromView(cs[0].view);
    assert.equal(g.phase, 'over');
    assert.ok(g.loser >= 0 && g.loser < n);
  }
});

// ---- shadows: every seat replays every move, and may never need a resync once play has started ----
async function shadowGame(n, opts, stats) {
  const { db, cs, code } = await setup(n, opts);
  const G = [];
  for (let i = 0; i < n; i++) { const r = await cs[i].t.view(code); G[i] = Online.fromView(r.view); G[i].version = r.version; }
  const syncAll = async (actor) => {
    for (let i = 0; i < n; i++) {
      const r = await cs[i].t.view(code);
      const was = G[i].phase;
      const out = Online.reconcile(G[i], r.view, r.version);
      // a stalemate (turn cap) is settled by seat order, which a rotated shadow cannot repeat, so the last move may resync
      if (out.mode === 'resync') { if (was === 'play' && !(out.game.phase === 'over' && out.game.stalemate)) { stats.resyncs++; stats.log.push('seat ' + i + ' after seat ' + actor + ': ' + out.why + ' ' + (out.extra || '')); } G[i] = out.game; }
      else if (out.mode === 'step') stats.steps++;
      else if (out.mode === 'mine') stats.mine++;
    }
  };
  for (let step = 0; step < 4000; step++) {
    if (db.t.shed_tables.find(t => t.code === code).status === 'over') break;
    let moved = false;
    for (let i = 0; i < n; i++) {
      const g = G[i], a = decide(g);
      if (!a) continue;
      if (a.type === 'ready') { await cs[i].act(a); }
      else if (a.type === 'blind') {
        g.pending = true;
        await cs[i].act(a);
        const r = await cs[i].t.view(code);
        const cards = r.view.lastEvent.cards;
        for (const c of cards) Online.revealMine(g, c);
        if (cards.length > 1) stats.follows = (stats.follows || 0) + 1;
        assert.ok(Shed.playBlind(g, 0, a.id, { extra: cards.slice(1).map(c => c.id) }).ok);
      } else {
        g.pending = true;
        const res = a.type === 'play' ? Shed.play(g, 0, a.ids) : Shed.pickUp(g, 0);
        assert.ok(res.ok, JSON.stringify(a));
        await cs[i].act(a);
      }
      await syncAll(i);
      moved = true; break;
    }
    assert.ok(moved, 'stuck');
  }
  return { db, G };
}

test('shadows follow every move without a resync, 2 to 4 players, every preset', async () => {
  const stats = { resyncs: 0, steps: 0, mine: 0, log: [] };
  for (const n of [2, 3, 4, 5]) for (const p of Presets.PRESETS) {
    const { G } = await shadowGame(n, p.opts, stats);
    for (const g of G) assert.equal(g.phase, 'over');
  }
  assert.equal(stats.resyncs, 0, stats.log.slice(0, 5).join('; '));
  assert.ok(stats.steps > 500 && stats.mine > 300, JSON.stringify(stats));
});

test('a seat that missed moves resyncs to the right picture', async () => {
  const { db, cs, code } = await setup(2);
  for (const c of cs) await c.act({ type: 'ready' });
  let g1 = Online.fromView((await cs[1].t.view(code)).view); g1.version = 2;
  // seat 0 and 1 play a few moves while the shadow for seat 1 is not looking
  for (let k = 0; k < 6; k++) {
    for (const c of cs) { const g = Online.fromView(c.view || (await c.t.view(code)).view); const a = decide(g); if (a) { await c.act(a); break; } c.view = null; }
    for (const c of cs) c.view = (await c.t.view(code)).view;
  }
  const r = await cs[1].t.view(code);
  const out = Online.reconcile(g1, r.view, r.version);
  assert.equal(out.mode, 'resync');
  assert.equal(Online.digest(out.game), Online.digest(Online.fromView(r.view)));
});

test('face-down follow-up: shadows stay in step and nobody else learns the turned card', async () => {
  const stats = { resyncs: 0, steps: 0, mine: 0, log: [], follows: 0 };
  for (const n of [2, 3, 4]) for (const p of Presets.PRESETS) {
    const { db } = await shadowGame(n, Object.assign({}, p.opts, { blindFollow: true }), stats);
    for (const v of db.t.shed_views) {
      const me = v.view.me;
      v.view.players.forEach((q, i) => { if (i !== me) assert.equal(q.myKnown, undefined); });
    }
  }
  assert.equal(stats.resyncs, 0, stats.log.slice(0, 5).join('; '));
  assert.ok(stats.follows > 0, 'no follow-up happened in ' + JSON.stringify(stats));
});

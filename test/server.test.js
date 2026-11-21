'use strict';
// The edge function's logic against an in-memory database: lobby, start, whole games, hidden cards, bad input.
const test = require('node:test');
const assert = require('node:assert/strict');
const Shed = require('../src/engine.js');
const Presets = require('../src/presets.js');
const { handle } = require('../server/handler.js');
const T = require('../server/table.js');

const { FakeDb } = require('../server/fakedb.js');

const U = ['u1', 'u2', 'u3', 'u4', 'u5'];
const NAMES = ['Ann', 'Ben', 'Cat', 'Dan', 'Eve'];
async function lobby(db, n, rules, max) {
  for (let i = 0; i < n; i++) assert.equal((await handle(db, U[i], { op: 'profile', name: NAMES[i] })).status, 200);
  const c = await handle(db, 'u1', { op: 'create', rules: rules || {}, max: max || 5 });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  for (let i = 1; i < n; i++) assert.equal((await handle(db, U[i], { op: 'join', code: c.body.code })).status, 200);
  return c.body.code;
}
const views = (db, code) => db.t.shed_views.filter(v => v.code === code);

// A player who only knows what its own view says.
function choose(v) {
  const p = v.players[v.me];
  if (v.phase === 'swap') return p.ready ? null : { type: 'ready' };
  if (v.phase !== 'play' || v.turn !== v.me) return null;
  const z = p.hand.length ? 'hand' : p.up.length ? 'up' : 'down';
  if (z === 'down') return { type: 'blind', id: p.myDown[0] };
  const by = {};
  for (const c of p[z]) (by[c.rank] = by[c.rank] || []).push(c);
  const ok = Object.values(by).filter(g => Shed.canPlayCard(v.rules, g[0], v.pile)).sort((a, b) => v.rules.ranks[a[0].rank].power - v.rules.ranks[b[0].rank].power);
  return ok.length ? { type: 'play', ids: ok[0].map(c => c.id) } : { type: 'pickup' };
}

// every card object found in a view, with the path it was found at
function cardsIn(x, path, out) {
  if (Array.isArray(x)) x.forEach((e, i) => cardsIn(e, path + '[' + i + ']', out));
  else if (x && typeof x === 'object') {
    if (typeof x.rank === 'string' && typeof x.suit === 'string') out.push({ id: x.id, path });
    else for (const k of Object.keys(x)) cardsIn(x[k], path + '.' + k, out);
  }
  return out;
}
function checkHidden(code, db) {
  const st = db.t.shed_games.find(g => g.code === code).state;
  for (const row of views(db, code)) {
    const v = row.view, me = v.me;
    const found = cardsIn(v, 'view', []);
    for (const c of found) {
      const okHand = c.path.startsWith('view.players[' + me + '].hand');
      assert.ok(okHand || /^view\.players\[\d+\]\.up/.test(c.path) || c.path.startsWith('view.pile') || c.path.startsWith('view.lastEvent'), 'card leaked at ' + c.path);
    }
    v.players.forEach((p, i) => { if (i !== me) { assert.ok(p.hand.every(c => c === null)); assert.equal(p.myDown, undefined); } assert.ok(p.down.every(c => c === null)); });
    assert.equal(v.draw, undefined);
    // and nothing that is secretly in the state shows up at a public spot by accident
    const secret = new Set(st.draw.map(c => c.id));
    st.players.forEach((p, i) => { p.down.forEach(c => secret.add(c.id)); if (i !== me) p.hand.forEach(c => secret.add(c.id)); });
    // lastEvent shows cards everyone just saw (played, flipped, or taken from the pile), so it is checked by the path rule above
    for (const c of found) if (!c.path.startsWith('view.lastEvent')) assert.ok(!secret.has(c.id), 'secret card ' + c.id + ' visible at ' + c.path);
  }
}

async function playOut(db, code, cap) {
  for (let step = 0; step < (cap || 4000); step++) {
    const tbl = db.t.shed_tables.find(t => t.code === code);
    if (tbl.status === 'over') return step;
    let moved = false;
    for (const row of views(db, code)) {
      const a = choose(row.view);
      if (!a) continue;
      const r = await handle(db, row.user_id, { op: 'act', code, action: a });
      assert.equal(r.status, 200, 'seat ' + row.view.me + ' ' + JSON.stringify(a) + ' -> ' + JSON.stringify(r.body));
      checkHidden(code, db);
      moved = true;
      break;
    }
    assert.ok(moved, 'nobody could move at step ' + step);
  }
  throw new Error('game did not finish');
}

test('a profile comes first', async () => {
  const db = new FakeDb();
  assert.equal((await handle(db, 'u1', { op: 'create', rules: {} })).status, 400);
  assert.equal((await handle(db, 'u1', { op: 'profile', name: '   ' })).status, 400);
  assert.equal((await handle(db, 'u1', { op: 'profile', name: '<b>Ann</b>\u0000' })).status, 200);
  assert.equal(db.t.shed_profiles[0].name, 'bAnn/b');
});

test('creating a table gives a five character code, one seat, and clean rules', async () => {
  const db = new FakeDb();
  await handle(db, 'u1', { op: 'profile', name: 'Ann' });
  const r = await handle(db, 'u1', { op: 'create', rules: {} });
  assert.match(r.body.code, /^[A-Z2-9]{5}$/);
  assert.deepEqual(db.t.shed_seats.map(s => [s.user_id, s.seat]), [['u1', 0]]);
  assert.equal(db.t.shed_tables[0].status, 'lobby');
  assert.deepEqual(Presets.normalise(db.t.shed_tables[0].rules), Presets.normalise({}));
});

test('rules that clash are refused, and unknown junk is cleaned away', async () => {
  const db = new FakeDb();
  await handle(db, 'u1', { op: 'profile', name: 'Ann' });
  const clash = await handle(db, 'u1', { op: 'create', rules: { transparentOn: true, transparentRank: '8', skipOn: true, skipRank: '8' } });
  assert.equal(clash.status, 400);
  assert.match(clash.body.error, /clash/);
  const own = await handle(db, 'u1', { op: 'create', rules: { sevensLower: true, custom: [{ rank: '7', effect: 'burn' }] } });
  assert.equal(own.status, 400, 'a rule on a card that already has one');
  const junk = await handle(db, 'u1', { op: 'create', rules: { skipOn: true, evil: 'x', custom: 'nope' } });
  assert.equal(junk.status, 200);
  assert.equal(db.t.shed_tables.at(-1).rules.evil, undefined);
});

test('join, duplicate join, full table, unknown code', async () => {
  const db = new FakeDb();
  const code = await lobby(db, 2, {}, 2);
  assert.equal((await handle(db, 'u2', { op: 'join', code })).status, 200, 'joining twice is harmless');
  assert.equal(db.t.shed_seats.length, 2);
  await handle(db, 'u3', { op: 'profile', name: 'Cat' });
  const full = await handle(db, 'u3', { op: 'join', code });
  assert.equal(full.status, 409); assert.match(full.body.error, /full/);
  assert.equal((await handle(db, 'u3', { op: 'join', code: 'ZZZZZ' })).status, 404);
  assert.equal((await handle(db, 'u3', { op: 'join', code: code.toLowerCase() })).status, 409, 'codes are not case sensitive');
});

test('only the host starts, and only with two or more', async () => {
  const db = new FakeDb();
  await handle(db, 'u1', { op: 'profile', name: 'Ann' });
  const c = (await handle(db, 'u1', { op: 'create', rules: {} })).body.code;
  assert.equal((await handle(db, 'u1', { op: 'start', code: c })).status, 409, 'alone');
  await handle(db, 'u2', { op: 'profile', name: 'Ben' });
  await handle(db, 'u2', { op: 'join', code: c });
  assert.equal((await handle(db, 'u2', { op: 'start', code: c })).status, 403);
  assert.equal((await handle(db, 'u1', { op: 'start', code: c })).status, 200);
  assert.equal((await handle(db, 'u1', { op: 'start', code: c })).status, 409, 'twice');
  assert.equal(views(db, c).length, 2);
  assert.ok(views(db, c).every(v => v.version === 1));
  await handle(db, 'u3', { op: 'profile', name: 'Cat' });
  assert.equal((await handle(db, 'u3', { op: 'join', code: c })).status, 409, 'too late to join');
});

test('leaving: a guest frees a seat, the host closes the table, nobody leaves mid game', async () => {
  const db = new FakeDb();
  const code = await lobby(db, 3);
  await handle(db, 'u3', { op: 'leave', code });
  assert.deepEqual(db.t.shed_seats.map(s => s.user_id).sort(), ['u1', 'u2']);
  await handle(db, 'u1', { op: 'start', code });
  assert.equal((await handle(db, 'u2', { op: 'leave', code })).status, 409);
  const db2 = new FakeDb();
  const c2 = await lobby(db2, 2);
  await handle(db2, 'u1', { op: 'leave', code: c2 });
  assert.equal(db2.t.shed_tables.length, 0);
  assert.equal(db2.t.shed_seats.length, 0);
});

test('whole games, 2 to 4 players, every preset, played from nothing but each seat\'s own view', async () => {
  let games = 0;
  for (const players of [2, 3, 4, 5]) {
    for (const p of Presets.PRESETS) {
      const db = new FakeDb();
      const code = await lobby(db, players, p.opts);
      assert.equal((await handle(db, 'u1', { op: 'start', code })).status, 200);
      checkHidden(code, db);
      await playOut(db, code);
      const res = db.t.shed_results.filter(r => r.code === code);
      assert.equal(res.length, players);
      assert.deepEqual(res.map(r => r.place).sort(), Array.from({ length: players }, (_, i) => i + 1));
      assert.equal(db.t.shed_tables[0].status, 'over');
      games++;
    }
  }
  assert.equal(games, 20);
});

test('a game with your own rules, stingers included, plays out', async () => {
  const db = new FakeDb();
  const rules = { transparentOn: true, transparentRank: '4', skipOn: true, skipRank: '8', custom: [{ rank: '3', effect: 'stinger' }, { rank: 'K', effect: 'pickup' }, { rank: 'J', effect: 'reverse' }] };
  const code = await lobby(db, 3, rules);
  await handle(db, 'u1', { op: 'start', code });
  await playOut(db, code);
  const st = db.t.shed_games[0].state;
  assert.equal(st.phase, 'over');
  assert.equal(st.rules.ranks['3'].effect, 'stinger');
});

test('bad actions change nothing', async () => {
  const db = new FakeDb();
  const code = await lobby(db, 2);
  await handle(db, 'u1', { op: 'start', code });
  const before = JSON.stringify(db.t.shed_games[0]);
  const bad = [
    [{ type: 'play', ids: [1] }, 'u1'],              // still swapping
    [{ type: 'nonsense' }, 'u1'], [null, 'u1'], [{}, 'u1'],
    [{ type: 'swap', hand: -1, up: 2 }, 'u1'], [{ type: 'swap', hand: 'a', up: 'b' }, 'u1'], [{ type: 'swap', hand: 1e9, up: 1 }, 'u1'],
    [{ type: 'ready' }, 'stranger'],
  ];
  for (const [a, who] of bad) {
    const r = await handle(db, who, { op: 'act', code, action: a });
    assert.ok(r.status === 400, JSON.stringify(a) + ' -> ' + r.status + ' ' + JSON.stringify(r.body));
  }
  assert.equal(JSON.stringify(db.t.shed_games[0]), before);
  // move to play, then bad plays
  for (const u of ['u1', 'u2']) await handle(db, u, { op: 'act', code, action: { type: 'ready' } });
  const g = db.t.shed_games[0].state;
  assert.equal(g.phase, 'play');
  const mover = g.seats[g.turn], other = g.seats[1 - g.turn];
  const v0 = db.t.shed_games[0].version;
  const hand = g.players[g.turn].hand;
  const worse = [
    [{ type: 'play', ids: [] }, mover], [{ type: 'play', ids: 'x' }, mover], [{ type: 'play', ids: [hand[0].id, hand[0].id] }, mover],
    [{ type: 'play', ids: [1, 2, 3, 4, 5] }, mover], [{ type: 'play', ids: [-1] }, mover], [{ type: 'play', ids: [hand[0].id] }, other],
    [{ type: 'blind', id: 999 }, mover], [{ type: 'pickup' }, other],
  ];
  for (const [a, who] of worse) assert.equal((await handle(db, who, { op: 'act', code, action: a })).status, 400, JSON.stringify(a));
  assert.equal(db.t.shed_games[0].version, v0);
});

test('a card you do not hold cannot be played, and a swap needs your own cards', async () => {
  const db = new FakeDb();
  const code = await lobby(db, 2);
  await handle(db, 'u1', { op: 'start', code });
  const g = db.t.shed_games[0].state;
  const theirs = g.players[1].hand[0].id, mineUp = g.players[0].up[0].id;
  assert.equal((await handle(db, 'u1', { op: 'act', code, action: { type: 'swap', hand: theirs, up: mineUp } })).status, 400);
  for (const u of ['u1', 'u2']) await handle(db, u, { op: 'act', code, action: { type: 'ready' } });
  const st = db.t.shed_games[0].state;
  const mover = st.seats[st.turn], oppHand = st.players[1 - st.turn].hand[0].id;
  assert.equal((await handle(db, mover, { op: 'act', code, action: { type: 'play', ids: [oppHand] } })).status, 400);
});

test('a stale write is refused instead of overwriting', async () => {
  const db = new FakeDb();
  const code = await lobby(db, 2);
  await handle(db, 'u1', { op: 'start', code });
  const real = db.from.bind(db);
  db.from = name => {
    const q = real(name);
    if (name === 'shed_games') { const run = q.run.bind(q); q.run = () => { const r = run(); if (q.op === 'select' && r.data) r.data.version = 0; return r; }; }
    return q;
  };
  const r = await handle(db, 'u1', { op: 'act', code, action: { type: 'ready' } });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /Out of date/);
});

test('acting before the game starts, after it ends, or at a table that does not exist', async () => {
  const db = new FakeDb();
  const code = await lobby(db, 2);
  assert.equal((await handle(db, 'u1', { op: 'act', code, action: { type: 'ready' } })).status, 409);
  await handle(db, 'u1', { op: 'start', code });
  await playOut(db, code);
  assert.equal((await handle(db, 'u1', { op: 'act', code, action: { type: 'pickup' } })).status, 409);
  assert.equal((await handle(db, 'u1', { op: 'act', code: 'NOPE2', action: {} })).status, 404);
  assert.equal((await handle(db, 'u1', { op: 'weird', code })).status, 400);
});

test('the view hides everything it should, for every seat, at the start', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const players = [2, 3, 4, 5][seed % 3];
    const g = T.createTable({ rules: Shed.makeRuleset(), seed, players: Array.from({ length: players }, (_, i) => ({ id: 'u' + i, name: 'P' + i })) });
    for (let i = 0; i < players; i++) {
      const v = T.projectView(g, i);
      const secret = new Set(g.draw.map(c => c.id));
      g.players.forEach((p, k) => { p.down.forEach(c => secret.add(c.id)); if (k !== i) p.hand.forEach(c => secret.add(c.id)); });
      const text = JSON.stringify(v);
      for (const id of secret) assert.ok(!new RegExp('"id":' + id + ',"rank"').test(text), 'seed ' + seed + ' seat ' + i + ' sees card ' + id);
      assert.equal(v.players[i].myDown.length, 3);
    }
  }
});

test('the deployed bundle carries the current engine, not an old copy', () => {
  const esbuild = require('esbuild');
  const out = esbuild.buildSync({ entryPoints: ['server/entry.mjs'], bundle: true, format: 'esm', platform: 'neutral', mainFields: ['module', 'main'], external: ['jsr:*'], write: false, logLevel: 'silent' }).outputFiles[0].text;
  for (const must of ['takePile', 'Plays on anything. Only the same rank can be played on it', 'ce === "transparent") return te !== "skip"', 'if (ce === "stinger") return true']) assert.ok(out.includes(must), 'bundle is missing: ' + must);
});

// ---- house rule votes before the game ----
const flip = { type: 'flag', key: 'sevensLower', value: false };
const row = (db, code) => db.t.shed_tables.find(t => t.code === code);

test('votes: a majority changes the rules, and the host can then start', async () => {
  const db = new FakeDb(), code = await lobby(db, 3);
  assert.equal((await handle(db, 'u2', { op: 'propose', code, change: flip })).status, 200);
  assert.equal(row(db, code).vote.status, 'open', 'the proposer is one yes of three');
  assert.equal((await handle(db, 'u1', { op: 'start', code })).status, 409, 'cannot start with a vote open');
  assert.equal((await handle(db, 'u3', { op: 'vote', code, choice: 'no' })).status, 200);
  assert.equal(row(db, code).vote.status, 'open', 'one yes, one no, one to go');
  assert.equal((await handle(db, 'u1', { op: 'vote', code, choice: 'yes' })).status, 200);
  const t = row(db, code);
  assert.equal(t.vote, null);
  assert.equal(t.rules.sevensLower, false, 'the passed change is applied');
  assert.match(t.note, /^Passed/);
  assert.equal((await handle(db, 'u1', { op: 'start', code })).status, 200);
  assert.equal(db.t.shed_games[0].state.rules.ranks['7'].effect, null, 'the game uses the voted rules');
});

test('votes: a tie goes to the host', async () => {
  const db = new FakeDb(), code = await lobby(db, 2);
  await handle(db, 'u2', { op: 'propose', code, change: flip });
  await handle(db, 'u2', { op: 'vote', code, choice: 'yes' });
  assert.equal(row(db, code).rules.sevensLower, true, 'one yes is not enough yet');
  await handle(db, 'u1', { op: 'vote', code, choice: 'no' });
  assert.equal(row(db, code).vote, null);
  assert.equal(row(db, code).rules.sevensLower, true, 'host said no on a tie');
  assert.match(row(db, code).note, /Voted down/);
});

test('votes: only seated players, one vote each, one open vote, real changes only', async () => {
  const db = new FakeDb(), code = await lobby(db, 4);
  await handle(db, 'u5', { op: 'profile', name: 'Eve' });
  assert.equal((await handle(db, 'u5', { op: 'propose', code, change: flip })).status, 403);
  assert.equal((await handle(db, 'u1', { op: 'propose', code, change: { type: 'nonsense' } })).status, 400);
  assert.equal((await handle(db, 'u1', { op: 'propose', code, change: 'x' })).status, 400);
  assert.equal((await handle(db, 'u1', { op: 'propose', code, change: flip })).status, 200);
  assert.equal((await handle(db, 'u2', { op: 'propose', code, change: flip })).status, 400, 'a vote is already open');
  assert.equal((await handle(db, 'u2', { op: 'vote', code, choice: 'maybe' })).status, 400);
  assert.equal((await handle(db, 'u5', { op: 'vote', code, choice: 'yes' })).status, 403);
  assert.equal((await handle(db, 'u2', { op: 'vote', code, choice: 'yes' })).status, 200);
  assert.equal(row(db, code).vote.status, 'open', 'two of four is not a majority');
  assert.equal((await handle(db, 'u2', { op: 'vote', code, choice: 'no' })).status, 400, 'no changing your mind');
  assert.equal((await handle(db, 'u3', { op: 'cancel', code })).status, 400, 'only the proposer or host can withdraw');
  assert.equal((await handle(db, 'u1', { op: 'cancel', code })).status, 200);
  assert.equal(row(db, code).vote, null);
  assert.match(row(db, code).note, /^Withdrawn/);
});

test('votes: running out of time ends the vote, and a stale write is refused', async () => {
  const db = new FakeDb(), code = await lobby(db, 3);
  await handle(db, 'u2', { op: 'propose', code, change: flip });
  assert.equal((await handle(db, 'u1', { op: 'tick', code })).status, 200);
  assert.ok(row(db, code).vote, 'not expired yet');
  row(db, code).vote.deadline = Date.now() - 1;
  assert.equal((await handle(db, 'u3', { op: 'tick', code })).status, 200);
  assert.equal(row(db, code).vote, null, 'expired vote is settled');
  assert.match(row(db, code).note, /time ran out|Voted down|Passed/);
  // two writers racing on the same revision: the second must be told to retry
  await handle(db, 'u2', { op: 'propose', code, change: flip });
  const rev = row(db, code).rev;
  const orig = db.from.bind(db);
  let bumped = false;
  db.from = n => { const q = orig(n); if (n === 'shed_tables' && !bumped) { const run = q.run.bind(q); q.run = function () { if (this.op === 'update' && !bumped) { bumped = true; row(db, code).rev = rev + 5; } return run(); }; } return q; };
  assert.equal((await handle(db, 'u1', { op: 'vote', code, choice: 'yes' })).status, 409);
});

test('votes: a voter leaving can settle the vote', async () => {
  const db = new FakeDb(), code = await lobby(db, 4);
  await handle(db, 'u1', { op: 'propose', code, change: flip });
  await handle(db, 'u2', { op: 'vote', code, choice: 'yes' });
  assert.equal(row(db, code).vote.status, 'open');
  await handle(db, 'u4', { op: 'leave', code });
  assert.equal(db.t.shed_seats.filter(x => x.code === code).length, 3);
  assert.equal(row(db, code).vote, null, 'two yes of three voters is a majority');
  assert.equal(row(db, code).rules.sevensLower, false);
});

test('votes: nothing once the game is running', async () => {
  const db = new FakeDb(), code = await lobby(db, 2);
  await handle(db, 'u1', { op: 'start', code });
  assert.equal((await handle(db, 'u1', { op: 'propose', code, change: flip })).status, 409);
});

test('names: rude ones refused by the server, clean ones saved', async () => {
  const db = new FakeDb();
  assert.equal((await handle(db, 'u1', { op: 'profile', name: 'f.u.c.k' })).status, 400);
  assert.equal((await handle(db, 'u1', { op: 'profile', name: 'f.u.c.k' })).body.error, 'Try another name');
  assert.equal(db.t.shed_profiles.length, 0);
  assert.equal((await handle(db, 'u1', { op: 'profile', name: '  Lucky   Fox 42 ' })).status, 200);
  assert.equal(db.t.shed_profiles[0].name, 'Lucky Fox 42');
  assert.equal(db.t.shed_profiles[0].avatar, '🦊');
  assert.equal((await handle(db, 'u1', { op: 'profile', name: 'Big4ss' })).status, 400);
  assert.equal(db.t.shed_profiles[0].name, 'Lucky Fox 42');
});

test('reactions: seated players only, fixed list only, throttled, gone with the table', async () => {
  const db = new FakeDb();
  let now = 1e12;
  const realNow = Date.now;
  Date.now = () => now;
  db.now = () => now;
  try {
    const code = await lobby(db, 2);
    await handle(db, 'u5', { op: 'profile', name: 'Eve' });
    assert.equal((await handle(db, 'u5', { op: 'react', code, text: '👍' })).status, 403);
    assert.equal((await handle(db, 'u1', { op: 'react', code, text: 'you are rubbish' })).status, 400);
    assert.equal((await handle(db, 'u1', { op: 'react', code, text: '' })).status, 400);
    assert.equal((await handle(db, 'u1', { op: 'react', code, text: '😂' })).status, 200);
    assert.equal((await handle(db, 'u1', { op: 'react', code, text: '🔥' })).status, 429);
    assert.equal((await handle(db, 'u2', { op: 'react', code, text: 'Nice one' })).status, 200);
    now += 1300;
    assert.equal((await handle(db, 'u1', { op: 'react', code, text: '🔥' })).status, 200);
    assert.deepEqual(db.t.shed_chat.map(c => [c.user_id, c.body]), [['u1', '😂'], ['u2', 'Nice one'], ['u1', '🔥']]);
    assert.equal((await handle(db, 'u1', { op: 'react', code: 'ZZZZZ', text: '👍' })).status, 404);
    await handle(db, 'u1', { op: 'leave', code });
    assert.equal(db.t.shed_chat.length, 0);
  } finally { Date.now = realNow; }
});

test('peek: an invite shows whose table, how full and the rules, before you pick a name', async () => {
  const db = new FakeDb();
  const code = await lobby(db, 2);
  const r = await handle(db, 'stranger', { op: 'peek', code });
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.host, r.body.seated, r.body.max, r.body.status, r.body.mine], ['Ann', 2, 5, 'lobby', false]);
  assert.ok(r.body.rules && typeof r.body.rules === 'object');
  assert.equal((await handle(db, 'u2', { op: 'peek', code })).body.mine, true);
  assert.equal((await handle(db, 'stranger', { op: 'peek', code: 'NOPE1' })).status, 404);
  assert.equal(db.t.shed_profiles.some(p => p.id === 'stranger'), false);
});

test('face-down follow-up: only the owner sees a face-down card they turned over', () => {
  const T = require('../server/table.js');
  const g = T.createTable({ rules: require('../src/engine.js').makeRuleset({ blindFollow: true }), seed: 5, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] });
  g.phase = 'play'; g.turn = 0; g.pile = [];
  const p = g.players[0];
  p.hand = []; p.up = [];
  const r = T.applyAction(g, 'a', { type: 'blind', id: p.down[0].id });
  assert.equal(r.ok, true);
  if (!p.down.length) return;
  assert.equal(p.known.length, 1);
  const mine = T.projectView(g, 0), theirs = T.projectView(g, 1);
  assert.equal(mine.players[0].myKnown.length, 1);
  assert.equal(mine.players[0].myKnown[0].id, p.known[0]);
  assert.equal(theirs.players[0].myKnown, undefined);
  assert.ok(theirs.players[0].down.every(c => c === null));
  assert.ok(!JSON.stringify(theirs).includes('"known"'));
});

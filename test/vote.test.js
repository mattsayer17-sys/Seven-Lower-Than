'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Meta = require('../src/rules-meta.js');
const Vote = require('../src/vote.js');
const Room = require('../src/room.js');

// ---------- rules-meta ----------
test('heldRanks: defaults hold 2, 7 and 10', () => {
  assert.deepEqual(Object.keys(Meta.heldRanks({})).sort(), ['10', '2', '7']);
});

test('heldRanks follows the house rules and active own rules only', () => {
  const h = Meta.heldRanks({ sevensLower: false, transparentOn: true, skipOn: true, skipRank: '9', custom: [{ rank: 'J', effect: 'reverse' }, { rank: 'Q', effect: 'none' }, { rank: 'K', effect: 'burn', on: false }] });
  assert.equal(h['7'], undefined);
  assert.equal(h['4'], 'the transparent card rule');
  assert.equal(h['9'], 'the skip a go rule');
  assert.equal(h['J'], 'your own rule for J');
  assert.equal(h['Q'], undefined, 'a plain-card rule holds nothing');
  assert.equal(h['K'], undefined, 'an unticked rule holds nothing');
});

test('applyChange never changes the options it was given', () => {
  const o = { skipOn: false, custom: [] };
  const before = JSON.stringify(o);
  Meta.applyChange(o, { type: 'flag', key: 'skipOn', value: true });
  Meta.applyChange(o, { type: 'addCustom', rank: '5', effect: 'burn' });
  assert.equal(JSON.stringify(o), before);
});

test('flag on and off', () => {
  let r = Meta.applyChange({}, { type: 'flag', key: 'skipOn', value: true });
  assert.equal(r.ok, true);
  assert.equal(r.opts.skipOn, true);
  r = Meta.applyChange(r.opts, { type: 'flag', key: 'skipOn', value: false });
  assert.equal(r.opts.skipOn, false);
  assert.equal(Meta.applyChange({}, { type: 'flag', key: 'fourBurns', value: false }).opts.fourBurns, false);
});

test('flag: unknown rule and non-boolean values are refused', () => {
  assert.equal(Meta.applyChange({}, { type: 'flag', key: 'nope', value: true }).ok, false);
  assert.equal(Meta.applyChange({}, { type: 'flag', key: 'skipOn', value: 'yes' }).ok, false);
  assert.equal(Meta.applyChange({}, null).ok, false);
  assert.equal(Meta.applyChange({}, { type: 'wat' }).ok, false);
});

test('a card with a rule cannot be given another one', () => {
  // skip on the same rank transparent already holds
  let r = Meta.applyChange({ transparentOn: true, transparentRank: '8', skipRank: '8' }, { type: 'flag', key: 'skipOn', value: true });
  assert.deepEqual([r.ok, r.error], [false, '8 is already used by the transparent card rule']);
  // 7s lower when an own rule holds 7
  r = Meta.applyChange({ sevensLower: false, custom: [{ rank: '7', effect: 'burn' }] }, { type: 'flag', key: 'sevensLower', value: true });
  assert.deepEqual([r.ok, r.error], [false, '7 is already used by your own rule for 7']);
  // transparent onto a card an own rule holds
  r = Meta.applyChange({ custom: [{ rank: '4', effect: 'reverse' }] }, { type: 'flag', key: 'transparentOn', value: true });
  assert.equal(r.ok, false);
  assert.match(r.error, /^4 is already used by your own rule for 4/);
});

test('rank moves: pickable, not the other house rule, not an own rule', () => {
  assert.equal(Meta.applyChange({}, { type: 'rank', key: 'skipRank', value: '9' }).opts.skipRank, '9');
  assert.equal(Meta.applyChange({}, { type: 'rank', key: 'skipRank', value: '7' }).ok, false);
  assert.equal(Meta.applyChange({}, { type: 'rank', key: 'skipRank', value: '10' }).ok, false);
  const other = Meta.applyChange({ transparentRank: '4' }, { type: 'rank', key: 'skipRank', value: '4' });
  assert.deepEqual([other.ok, other.error], [false, '4 is already used by the transparent card rule']);
  const own = Meta.applyChange({ custom: [{ rank: 'J', effect: 'again' }] }, { type: 'rank', key: 'transparentRank', value: 'J' });
  assert.equal(own.ok, false);
  assert.equal(Meta.applyChange({}, { type: 'rank', key: 'bogus', value: '5' }).ok, false);
});

test('addCustom: free rank works, taken rank and junk are refused', () => {
  const ok = Meta.applyChange({}, { type: 'addCustom', rank: '5', effect: 'burn' });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.opts.custom, [{ rank: '5', effect: 'burn', on: true }]);
  const taken = Meta.applyChange({ skipOn: true }, { type: 'addCustom', rank: '8', effect: 'reverse' });
  assert.deepEqual([taken.ok, taken.error], [false, '8 is already used by the skip a go rule']);
  assert.equal(Meta.applyChange({}, { type: 'addCustom', rank: 'Z', effect: 'burn' }).ok, false);
  assert.equal(Meta.applyChange({}, { type: 'addCustom', rank: '5', effect: 'explode' }).ok, false);
  // a plain card with a different power is not an "active rule", so it is allowed anywhere
  assert.equal(Meta.applyChange({ skipOn: true }, { type: 'addCustom', rank: '8', effect: 'none', power: 3 }).ok, true);
});

test('removeCustom and toggleCustom', () => {
  const o = { custom: [{ rank: 'J', effect: 'reverse', on: true }] };
  assert.deepEqual(Meta.applyChange(o, { type: 'removeCustom', rank: 'J' }).opts.custom, []);
  assert.equal(Meta.applyChange(o, { type: 'removeCustom', rank: 'Q' }).ok, false);
  assert.equal(Meta.applyChange(o, { type: 'toggleCustom', rank: 'J', value: false }).opts.custom[0].on, false);
  // switching an own rule back on when another rule has taken its card
  const clash = Meta.applyChange({ skipOn: true, custom: [{ rank: '8', effect: 'reverse', on: false }] }, { type: 'toggleCustom', rank: '8', value: true });
  assert.equal(clash.ok, false);
  assert.equal(Meta.applyChange({ custom: [{ rank: '8', effect: 'reverse', on: false }] }, { type: 'toggleCustom', rank: '8', value: true }).ok, true);
});

test('describeChange reads like a sentence', () => {
  assert.equal(Meta.describeChange({ type: 'flag', key: 'skipOn', value: true }, {}), 'Turn on Skip a go (8s)');
  assert.equal(Meta.describeChange({ type: 'flag', key: 'transparentOn', value: true }, { transparentRank: '9' }), 'Turn on Transparent card (9s)');
  assert.equal(Meta.describeChange({ type: 'flag', key: 'sevensLower', value: false }, {}), 'Turn off Lower than');
  assert.equal(Meta.describeChange({ type: 'flag', key: 'fourBurns', value: false }, {}), 'Turn off Four of a kind burns');
  assert.equal(Meta.describeChange({ type: 'rank', key: 'skipRank', value: '9' }, {}), 'Move Skip a go to 9s');
  assert.equal(Meta.describeChange({ type: 'addCustom', rank: '3', effect: 'stinger' }, {}), 'Add a rule: 3: plays on anything. Only the same rank can be played on it (invisible cards still allowed). Burned, not picked up, if the pile is taken');
  assert.equal(Meta.describeChange({ type: 'removeCustom', rank: 'J' }, {}), 'Remove the rule on Js');
});

test('summarise lists the active rules', () => {
  const s = Meta.summarise({ skipOn: true });
  assert.ok(s.some(l => l.startsWith('2:')));
  assert.ok(s.some(l => l.startsWith('8:')));
  assert.ok(s.includes('Four of a kind in a row burns the pile'));
});

// ---------- vote ----------
const open = (voters, proposer, host) => Vote.open({ id: 1, proposer, change: { type: 'flag', key: 'skipOn', value: true }, voters, hostId: host || voters[0] });

test('the proposer counts as a yes', () => {
  const v = open(['a', 'b', 'c'], 'b');
  assert.equal(v.votes.b, 'yes');
  assert.equal(v.status, 'open');
  assert.deepEqual(Vote.tally(v), { yes: 1, no: 0, total: 3, pending: 2 });
});

test('simple majority passes or fails the vote, as soon as it is decided', () => {
  let v = open(['a', 'b', 'c'], 'b');
  v = Vote.cast(v, 'a', 'yes');
  assert.deepEqual([v.status, v.by], ['passed', 'majority']);
  let w = open(['a', 'b', 'c'], 'b');
  w = Vote.cast(w, 'a', 'no');
  assert.equal(w.status, 'open');
  w = Vote.cast(w, 'c', 'no');
  assert.deepEqual([w.status, w.by], ['failed', 'majority']);
});

test('a tie goes the way the host voted', () => {
  // host a votes no, guest b proposed (yes): 1-1
  let v = open(['a', 'b'], 'b', 'a');
  v = Vote.cast(v, 'a', 'no');
  assert.deepEqual([v.status, v.by], ['failed', 'host']);
  // host proposes and wins the tie
  let w = open(['a', 'b'], 'a', 'a');
  w = Vote.cast(w, 'b', 'no');
  assert.deepEqual([w.status, w.by], ['passed', 'host']);
});

test('four voters split 2-2: the host decides', () => {
  let v = open(['h', 'b', 'c', 'd'], 'b', 'h');
  v = Vote.cast(v, 'c', 'no');
  v = Vote.cast(v, 'd', 'no');
  assert.equal(v.status, 'open');
  v = Vote.cast(v, 'h', 'yes');
  assert.deepEqual([v.status, v.by], ['passed', 'host']);
  let w = open(['h', 'b', 'c', 'd'], 'b', 'h');
  w = Vote.cast(w, 'h', 'no'); w = Vote.cast(w, 'c', 'yes'); w = Vote.cast(w, 'd', 'no');
  assert.equal(w.status, 'failed');
});

test('time up: more yes than no passes, more no fails, a dead heat is the host (silent host = no)', () => {
  let v = open(['a', 'b', 'c', 'd'], 'b', 'a');
  v = Vote.cast(v, 'c', 'yes'); // 2 yes, 0 no, 2 silent
  assert.equal(v.status, 'open');
  assert.deepEqual([Vote.expire(v).status, Vote.expire(v).by], ['passed', 'deadline']);
  let w = open(['a', 'b', 'c', 'd'], 'b', 'a');
  w = Vote.cast(w, 'c', 'no');
  assert.equal(w.status, 'open'); // 1-1
  const e = Vote.expire(w);
  assert.deepEqual([e.status, e.by], ['failed', 'host']);
});

test('one vote each, non-voters and nonsense are ignored', () => {
  const v = open(['a', 'b', 'c'], 'a');
  assert.equal(Vote.cast(v, 'a', 'no'), v, 'cannot change a vote');
  assert.equal(Vote.cast(v, 'zed', 'yes'), v, 'not at the table');
  assert.equal(Vote.cast(v, 'b', 'maybe'), v);
  const done = Vote.cast(v, 'b', 'yes');
  assert.equal(done.status, 'passed');
  assert.equal(Vote.cast(done, 'c', 'no'), done, 'vote is over');
});

test('someone leaving stops counting', () => {
  let v = open(['a', 'b', 'c'], 'a', 'a');
  v = Vote.cast(v, 'b', 'no');
  assert.equal(v.status, 'open');
  v = Vote.dropVoter(v, 'c'); // 1-1, nobody left to vote, the host decides
  assert.deepEqual([v.status, v.by], ['passed', 'host']);
  let w = open(['a', 'b', 'c'], 'a', 'a');
  w = Vote.dropVoter(w, 'b');
  assert.equal(w.status, 'open');
  assert.equal(w.voters.length, 2);
});

test('a solo table passes its own proposal at once', () => {
  assert.equal(open(['a'], 'a').status, 'passed');
});

test('a vote with nobody left is cancelled', () => {
  let v = open(['a', 'b'], 'zed', 'a');
  v = Vote.dropVoter(Vote.dropVoter(v, 'a'), 'b');
  assert.equal(v.status, 'cancelled');
});

test('only the proposer or the host can withdraw it', () => {
  const v = open(['h', 'b', 'c'], 'b', 'h');
  assert.equal(Vote.cancel(v, 'c'), v);
  assert.equal(Vote.cancel(v, 'b').status, 'cancelled');
  assert.equal(Vote.cancel(v, 'h').status, 'cancelled');
});

test('duplicate voter ids are counted once', () => {
  assert.equal(open(['a', 'a', 'b'], 'a').voters.length, 2);
});

// ---------- room ----------
const table = () => Room.createRoom({ hostId: 'me', players: [{ id: 'me', name: 'You' }, { id: 'tali', name: 'Tali' }, { id: 'dave', name: 'Dave' }], opts: {}, voteMs: 1000 });
const skipOn = { type: 'flag', key: 'skipOn', value: true };

test('a proposal opens a vote, the second yes passes it and the rules change', () => {
  let r = Room.reduce(table(), { type: 'propose', by: 'tali', change: skipOn }, 0);
  assert.equal(r.state.vote.status, 'open');
  assert.equal(r.events[0].text, 'Tali proposes: Turn on Skip a go (8s)');
  assert.equal(r.state.opts.skipOn, undefined, 'nothing changes until it passes');
  r = Room.reduce(r.state, { type: 'vote', by: 'me', choice: 'yes' }, 10);
  assert.equal(r.state.vote, null);
  assert.equal(r.state.opts.skipOn, true);
  assert.equal(r.events.find(e => e.type === 'result').text, 'Passed: Turn on Skip a go (8s)');
});

test('a vote that fails leaves the rules alone', () => {
  let r = Room.reduce(table(), { type: 'propose', by: 'tali', change: skipOn }, 0);
  r = Room.reduce(r.state, { type: 'vote', by: 'me', choice: 'no' }, 1);
  r = Room.reduce(r.state, { type: 'vote', by: 'dave', choice: 'no' }, 2);
  assert.equal(r.state.opts.skipOn, undefined);
  assert.equal(r.events.find(e => e.type === 'result').text, 'Voted down: Turn on Skip a go (8s)');
});

test('only one vote at a time', () => {
  const r = Room.reduce(table(), { type: 'propose', by: 'tali', change: skipOn }, 0);
  const again = Room.reduce(r.state, { type: 'propose', by: 'dave', change: { type: 'flag', key: 'fourBurns', value: false } }, 1);
  assert.equal(again.events[0].reason, 'a vote is already open');
  assert.equal(again.state, r.state);
});

test('a clashing proposal is refused before anyone votes on it', () => {
  const s = Object.assign(table(), { opts: { transparentOn: true, transparentRank: '8', skipRank: '8' } });
  const r = Room.reduce(s, { type: 'propose', by: 'tali', change: skipOn }, 0);
  assert.equal(r.state.vote, null);
  assert.equal(r.events[0].reason, '8 is already used by the transparent card rule');
});

test('two at the table: the host wins a disagreement and the result says so', () => {
  const s = Room.createRoom({ hostId: 'me', players: [{ id: 'me', name: 'You' }, { id: 'tali', name: 'Tali' }], opts: {} });
  let r = Room.reduce(s, { type: 'propose', by: 'tali', change: skipOn }, 0);
  r = Room.reduce(r.state, { type: 'vote', by: 'me', choice: 'no' }, 1);
  assert.equal(r.state.opts.skipOn, undefined);
  assert.equal(r.events.find(e => e.type === 'result').text, 'Voted down: Turn on Skip a go (8s) (host broke the tie)');
});

test('people who are not at the table cannot propose or vote', () => {
  assert.equal(Room.reduce(table(), { type: 'propose', by: 'stranger', change: skipOn }, 0).events[0].reason, 'you are not at this table');
  const r = Room.reduce(table(), { type: 'propose', by: 'tali', change: skipOn }, 0);
  assert.equal(Room.reduce(r.state, { type: 'vote', by: 'stranger', choice: 'yes' }, 1).events[0].reason, 'that vote was not counted');
  assert.equal(Room.reduce(table(), { type: 'vote', by: 'me', choice: 'yes' }, 0).events[0].reason, 'there is no open vote');
});

test('the clock: nothing before the deadline, then the vote is settled', () => {
  let r = Room.reduce(table(), { type: 'propose', by: 'tali', change: skipOn }, 0);
  assert.equal(r.state.vote.deadline, 1000);
  assert.deepEqual(Room.reduce(r.state, { type: 'tick', now: 999 }, 999).events, []);
  r = Room.reduce(r.state, { type: 'vote', by: 'dave', choice: 'no' }, 500); // 1 yes, 1 no, host silent
  r = Room.reduce(r.state, { type: 'tick', now: 1000 }, 1000);
  assert.equal(r.state.vote, null);
  assert.equal(r.state.opts.skipOn, undefined, 'silent host means a tie is a no');
  assert.match(r.events[0].text, /^Voted down: .*\(host broke the tie\)$/);
});

test('withdrawing', () => {
  let r = Room.reduce(table(), { type: 'propose', by: 'tali', change: skipOn }, 0);
  assert.equal(Room.reduce(r.state, { type: 'cancel', by: 'dave' }, 1).events[0].reason, 'only the proposer or the host can withdraw it');
  r = Room.reduce(r.state, { type: 'cancel', by: 'tali' }, 1);
  assert.equal(r.state.vote, null);
  assert.equal(r.events[0].text, 'Withdrawn: Turn on Skip a go (8s)');
});

test('leaving: the host role passes on and an open vote is re-counted', () => {
  let r = Room.reduce(table(), { type: 'propose', by: 'tali', change: skipOn }, 0);
  r = Room.reduce(r.state, { type: 'vote', by: 'dave', choice: 'no' }, 1);
  r = Room.reduce(r.state, { type: 'leave', by: 'me' }, 2); // host leaves: tali (yes) vs dave (no), tali is now host
  assert.equal(r.state.hostId, 'tali');
  assert.equal(r.state.vote, null);
  assert.equal(r.state.opts.skipOn, true, 'the new host broke the tie their way');
  assert.ok(r.events.some(e => e.type === 'host'));
});

test('the last person leaving closes the table', () => {
  let s = Room.createRoom({ hostId: 'me', players: [{ id: 'me', name: 'You' }], opts: {} });
  s = Room.reduce(s, { type: 'leave', by: 'me' }, 0).state;
  assert.equal(s.closed, true);
  assert.equal(Room.reduce(s, { type: 'propose', by: 'me', change: skipOn }, 1).events[0].reason, 'the table is closed');
});

test('only the host starts, never in the middle of a vote, and rules lock once started', () => {
  let r = Room.reduce(table(), { type: 'start', by: 'tali' }, 0);
  assert.equal(r.events[0].reason, 'only the host can start');
  r = Room.reduce(table(), { type: 'propose', by: 'tali', change: skipOn }, 0);
  assert.equal(Room.reduce(r.state, { type: 'start', by: 'me' }, 1).events[0].reason, 'finish the vote first');
  let s = Room.reduce(table(), { type: 'start', by: 'me' }, 0);
  assert.equal(s.events[0].type, 'started');
  assert.equal(Room.reduce(s.state, { type: 'propose', by: 'tali', change: skipOn }, 1).events[0].reason, 'the game has started');
});

test('a lone player at a table passes their own change instantly', () => {
  const s = Room.createRoom({ hostId: 'me', players: [{ id: 'me', name: 'You' }], opts: {} });
  const r = Room.reduce(s, { type: 'propose', by: 'me', change: skipOn }, 0);
  assert.equal(r.state.opts.skipOn, true);
  assert.deepEqual(r.events.map(e => e.type), ['proposed', 'result']);
});

test('a passed change that no longer fits is reported, not applied', () => {
  // the rules moved under the vote: skip's card got taken before the result landed
  let r = Room.reduce(table(), { type: 'propose', by: 'tali', change: skipOn }, 0);
  const moved = Object.assign({}, r.state, { opts: { custom: [{ rank: '8', effect: 'reverse' }] } });
  r = Room.reduce(moved, { type: 'vote', by: 'me', choice: 'yes' }, 1);
  assert.equal(r.state.opts.skipOn, undefined);
  assert.match(r.events.find(e => e.type === 'result').text, /^Passed, but it no longer fits: 8 is already used by your own rule for 8$/);
});

// ---------- rule and card in one proposal ----------
test('turning a rule on can name its card in the same change', () => {
  const r = Meta.applyChange({}, { type: 'flag', key: 'skipOn', value: true, rank: '9' });
  assert.equal(r.ok, true);
  assert.deepEqual([r.opts.skipOn, r.opts.skipRank], [true, '9']);
  assert.equal(Meta.describeChange({ type: 'flag', key: 'skipOn', value: true, rank: '9' }, {}), 'Turn on Skip a go (9s)');
});

test('the card named with a rule is checked like any other', () => {
  assert.equal(Meta.applyChange({}, { type: 'flag', key: 'skipOn', value: true, rank: '7' }).ok, false);
  const clash = Meta.applyChange({ transparentOn: true, transparentRank: '9' }, { type: 'flag', key: 'skipOn', value: true, rank: '9' });
  assert.equal(clash.ok, false);
  assert.equal(Meta.applyChange({ custom: [{ rank: '9', effect: 'burn' }] }, { type: 'flag', key: 'skipOn', value: true, rank: '9' }).ok, false);
  assert.equal(Meta.applyChange({}, { type: 'flag', key: 'skipOn', value: false, rank: '9' }).ok, false);
  assert.equal(Meta.applyChange({}, { type: 'flag', key: 'fourBurns', value: false, rank: '9' }).ok, false);
});

// ---------- table glue ----------
const Table = require('../src/table.js');
test('settings and table options round-trip without touching other settings', () => {
  const s = { sound: true, players: 3, skipOn: true, skipRank: '9', custom: [{ rank: 'J', effect: 'reverse', on: true }] };
  const o = Table.optsFromSettings(s);
  assert.equal(o.sound, undefined);
  assert.equal(o.players, undefined);
  o.custom.push({ rank: 'Q', effect: 'again', on: true });
  assert.equal(s.custom.length, 1, 'a copy, not the same array');
  Table.applyToSettings(s, o);
  assert.equal(s.custom.length, 2);
  assert.equal(s.sound, true);
  assert.equal(s.players, 3);
});

test('the proposal menu flips each rule and offers removing own rules', () => {
  const m = Table.menu({ skipOn: true, custom: [{ rank: 'J', effect: 'reverse' }] });
  const by = id => m.find(x => x.id === id);
  assert.equal(by('flag:skipOn').label, 'Turn off Skip a go');
  assert.equal(by('flag:skipOn').rankKey, null);
  assert.equal(by('flag:transparentOn').label, 'Turn on Transparent card');
  assert.equal(by('flag:transparentOn').rankKey, 'transparentRank');
  assert.equal(by('flag:sevensLower').label, 'Turn off Lower than', 'sevens default on');
  assert.equal(by('rm:J').change.type, 'removeCustom');
});

test('every menu item is a change the rules accept from a fresh table', () => {
  for (const item of Table.menu({})) {
    const change = item.rankKey ? Object.assign({}, item.change, { rank: '5' }) : item.change;
    assert.equal(Meta.applyChange({}, change).ok, true, item.label);
  }
});

test('pretend guests vote predictably', () => {
  const tali = Table.GUESTS.find(g => g.id === 'tali'), dave = Table.GUESTS.find(g => g.id === 'dave');
  assert.equal(tali.vote({ type: 'addCustom' }), 'yes');
  assert.equal(dave.vote({ type: 'addCustom' }), 'no');
  assert.equal(dave.vote({ type: 'flag' }), 'yes');
});

test('lower than: moves card, reads plainly, and clashes only with rules that are on', () => {
  assert.equal(Meta.LABEL.sevensLower, 'Lower than');
  assert.equal(Meta.PICKABLE.includes('7'), true);
  assert.equal(Meta.applyChange({}, { type: 'rank', key: 'lowerRank', value: '6' }).opts.lowerRank, '6');
  assert.equal(Meta.applyChange({ skipOn: true }, { type: 'rank', key: 'lowerRank', value: '8' }).ok, false);
  assert.equal(Meta.applyChange({}, { type: 'rank', key: 'lowerRank', value: '8' }).ok, true);
  assert.equal(Meta.describeChange({ type: 'rank', key: 'lowerRank', value: '6' }), 'Move Lower than to 6s');
});

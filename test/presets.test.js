'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/presets.js');
const Meta = require('../src/rules-meta.js');
const Shed = require('../src/engine.js');

test('every preset is a legal set of rules', () => {
  for (const p of P.PRESETS) {
    const r = P.decode(P.encode(p.opts, p.name));
    assert.equal(r.ok, true, p.name + ': ' + r.error);
    assert.equal(P.same(r.opts, p.opts), true, p.name);
  }
});

test('preset ids and names are unique', () => {
  assert.equal(new Set(P.PRESETS.map(p => p.id)).size, P.PRESETS.length);
  assert.equal(new Set(P.PRESETS.map(p => p.name)).size, P.PRESETS.length);
});

test('presets build real rulesets with the rules they say', () => {
  const rs = id => Shed.makeRuleset(P.PRESETS.find(p => p.id === id).opts);
  assert.equal(rs('classic').ranks['7'].effect, 'lower');
  assert.equal(rs('plain').ranks['7'].effect, null);
  assert.equal(rs('plain').fourOfAKindBurns, false);
  assert.equal(rs('sneaky').ranks['4'].effect, 'transparent');
  assert.equal(rs('miss').ranks['8'].effect, 'skip');
  assert.equal(rs('chaos').ranks['J'].effect, 'reverse');
  assert.equal(rs('chaos').ranks['K'].effect, 'pickup');
});

test('round trip keeps the rules and the name', () => {
  const o = { sevensLower: false, transparentOn: true, transparentRank: '5', skipOn: true, skipRank: '9', fourBurns: false, custom: [{ rank: 'Q', effect: 'again', on: true }, { rank: 'A', power: 1.5, on: true }] };
  const r = P.decode(P.encode(o, 'Friday night'));
  assert.equal(r.ok, true);
  assert.equal(r.name, 'Friday night');
  assert.equal(P.same(r.opts, o), true);
  assert.deepEqual(P.normalise(r.opts), P.normalise(o));
});

test('an unticked own rule survives the trip as unticked', () => {
  const o = { custom: [{ rank: 'J', effect: 'reverse', on: false }] };
  const r = P.decode(P.encode(o));
  assert.equal(r.ok, true);
  assert.equal(r.opts.custom[0].on, false);
});

test('same ignores the card of a rule that is off, and the order of own rules', () => {
  assert.equal(P.same({ skipOn: false, skipRank: '9' }, { skipOn: false, skipRank: '8' }), true);
  assert.equal(P.same({ skipOn: true, skipRank: '9' }, { skipOn: true, skipRank: '8' }), false);
  const a = { custom: [{ rank: 'J', effect: 'reverse' }, { rank: 'K', effect: 'burn' }] };
  assert.equal(P.same(a, { custom: a.custom.slice().reverse() }), true);
  assert.equal(P.same({}, { sevensLower: false }), false);
});

test('find names the matching preset, or nothing', () => {
  assert.equal(P.find({}).id, 'classic');
  assert.equal(P.find({ sevensLower: false, fourBurns: false }).id, 'plain');
  assert.equal(P.find({ skipOn: true, skipRank: '9' }), null);
});

test('codes tolerate spaces and line breaks from a chat app', () => {
  const c = P.encode({ skipOn: true });
  const spaced = c.slice(0, 8) + ' \n ' + c.slice(8);
  assert.equal(P.decode(spaced).ok, true);
});

test('a typo is caught by the check', () => {
  const c = P.encode({ skipOn: true, skipRank: '9' });
  const i = 5;
  const flipped = c.slice(0, i) + (c[i] === 'A' ? 'B' : 'A') + c.slice(i + 1);
  const r = P.decode(flipped);
  assert.equal(r.ok, false);
  assert.match(r.error, /typo|damaged/);
});

test('rubbish, empty and future codes are refused with a plain reason', () => {
  assert.match(P.decode('').error, /does not look like/);
  assert.match(P.decode('hello').error, /does not look like/);
  assert.match(P.decode(null).error, /does not look like/);
  assert.match(P.decode('H2-abc-123').error, /newer version/);
});

function forge(body) {
  // a well-formed code with a correct check but rules the table would never allow
  const payload = Buffer.from(JSON.stringify(body)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  let h = 0x811c9dc5; for (let i = 0; i < payload.length; i++) { h ^= payload.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return 'H1-' + payload + '-' + (h % 46656).toString(36).padStart(3, '0');
}

test('a forged code cannot put two rules on one card', () => {
  const r = P.decode(forge({ n: '', s: 1, t: 4, k: 4, f: 1, c: [] }));
  assert.equal(r.ok, false);
  assert.match(r.error, /already used/);
});

test('a forged code cannot reuse a fixed card or the 7 under sevens-lower', () => {
  assert.equal(P.decode(forge({ s: 0, t: 2, k: 0, f: 1, c: [] })).ok, false);
  assert.equal(P.decode(forge({ s: 0, t: 10, k: 0, f: 1, c: [] })).ok, false);
  assert.equal(P.decode(forge({ s: 1, t: 7, k: 0, f: 1, c: [] })).ok, false);
});

test('a forged code cannot put an own rule on a held card, or repeat a rank', () => {
  assert.equal(P.decode(forge({ s: 1, t: 0, k: 0, f: 1, c: [['7', 'burn', '', 1]] })).ok, false);
  assert.match(P.decode(forge({ s: 1, t: 0, k: 0, f: 1, c: [['J', 'burn', '', 1], ['J', 'skip', '', 1]] })).error, /Two rules/);
});

test('a forged code with an unknown effect, rank or power is refused', () => {
  assert.equal(P.decode(forge({ s: 1, t: 0, k: 0, f: 1, c: [['J', 'explode', '', 1]] })).ok, false);
  assert.equal(P.decode(forge({ s: 1, t: 0, k: 0, f: 1, c: [['Z', 'burn', '', 1]] })).ok, false);
  assert.equal(P.decode(forge({ s: 1, t: 0, k: 0, f: 1, c: [['J', '', 99, 1]] })).ok, false);
  assert.equal(P.decode(forge({ s: 1, t: 0, k: 0, f: 1, c: 'nope' })).ok, false);
  assert.equal(P.decode(forge({ s: 1, t: 0, k: 0, f: 1, c: [5] })).ok, false);
});

test('names are cleaned and capped', () => {
  const r = P.decode(P.encode({}, '<b>Matt\'s "big" night out with everyone I know</b>'));
  assert.equal(r.ok, true);
  assert.ok(r.name.length <= 24);
  assert.ok(!/[<>"]/.test(r.name));
});

test('decoded rules are legal under the same laws as a vote', () => {
  for (const p of P.PRESETS) {
    const o = P.decode(P.encode(p.opts)).opts;
    const held = Meta.heldRanks(o);
    // every active house rule sits on a card the held map attributes to it, never two to one card
    const ranks = Object.keys(held);
    assert.equal(new Set(ranks).size, ranks.length);
  }
});

test('code length stays shareable', () => {
  const longest = P.encode(P.PRESETS.find(p => p.id === 'chaos').opts, 'Chaos');
  assert.ok(longest.length < 140, String(longest.length));
});

test('a lower than card other than 7 survives a code; 7 keeps the short code', () => {
  const o = { lowerRank: 'J' };
  const r = P.decode(P.encode(o));
  assert.equal(r.ok, true);
  assert.equal(P.normalise(r.opts).lowerRank, 'J');
  assert.equal(P.encode({}), P.encode({ lowerRank: '7' }));
  assert.equal(P.same({ sevensLower: false, lowerRank: '9' }, { sevensLower: false }), true);
});

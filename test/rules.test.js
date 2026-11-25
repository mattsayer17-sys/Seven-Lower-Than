'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { S, cards, card, setup, ids, names } = require('./helpers.js');

const can = (rules, spec, pile) => S.canPlayCard(rules, card(spec), cards(pile));

test('ruleset defaults: 2 resets, 7 lowers, 10 burns, nothing else has an effect', () => {
  const r = S.makeRuleset();
  assert.equal(r.ranks['2'].effect, 'reset');
  assert.equal(r.ranks['7'].effect, 'lower');
  assert.equal(r.ranks['10'].effect, 'burn');
  for (const k of ['3', '4', '5', '6', '8', '9', 'J', 'Q', 'K', 'A']) assert.equal(r.ranks[k].effect, undefined, k);
  assert.equal(r.fourOfAKindBurns, true);
  assert.equal(r.handSize, 3);
});

test('ranks are ordered 2..A by power', () => {
  const r = S.makeRuleset();
  const p = S.RANK_LIST.map(k => r.ranks[k].power);
  assert.deepEqual(p, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
});

test('house rules: sevensLower off, transparent and skip pick their rank', () => {
  assert.equal(S.makeRuleset({ sevensLower: false }).ranks['7'].effect, null);
  const t = S.makeRuleset({ transparentOn: true });
  assert.equal(t.ranks['4'].effect, 'transparent');
  const t8 = S.makeRuleset({ transparentOn: true, transparentRank: '8' });
  assert.equal(t8.ranks['8'].effect, 'transparent');
  assert.equal(t8.ranks['4'].effect, undefined);
  const s = S.makeRuleset({ skipOn: true });
  assert.equal(s.ranks['8'].effect, 'skip');
  const s9 = S.makeRuleset({ skipOn: true, skipRank: '9' });
  assert.equal(s9.ranks['9'].effect, 'skip');
  assert.equal(s9.ranks['8'].effect, undefined);
  assert.equal(S.makeRuleset({ fourBurns: false }).fourOfAKindBurns, false);
});

test('custom rules override effect and power; off rules are ignored', () => {
  const r = S.makeRuleset({ custom: [{ rank: '5', effect: 'burn' }, { rank: '6', power: 12.5 }, { rank: '9', effect: 'again', on: false }] });
  assert.equal(r.ranks['5'].effect, 'burn');
  assert.equal(r.ranks['6'].power, 12.5);
  assert.equal(r.ranks['9'].effect, undefined);
  assert.equal(r.custom.length, 2);
});

test('custom "none" strips an effect (also a house-rule one)', () => {
  const r = S.makeRuleset({ skipOn: true, custom: [{ rank: '8', effect: 'none' }, { rank: '10', effect: 'none' }] });
  assert.equal(r.ranks['8'].effect, null);
  assert.equal(r.ranks['10'].effect, null);
});

test('validateCustom: accepts, normalises and rejects', () => {
  assert.deepEqual(S.validateCustom([{ rank: 'j', effect: 'skip' }]).rules, [{ rank: 'J', effect: 'skip', on: true }]);
  assert.deepEqual(S.validateCustom('nope'), { rules: [], rejected: ['not a list'] });
  const bad = S.validateCustom([
    { rank: 'X', effect: 'burn' },
    { rank: '5', effect: 'explode' },
    { rank: '5', power: 0 },
    { rank: '5', power: 21 },
    { rank: '5', power: 'abc' },
    { rank: '5' },
    null,
  ]);
  assert.equal(bad.rules.length, 0);
  assert.equal(bad.rejected.length, 7);
});

test('validateCustom: later rule for the same rank merges over the earlier', () => {
  const { rules } = S.validateCustom([{ rank: '5', effect: 'burn' }, { rank: '5', power: 9 }]);
  assert.equal(rules.length, 1);
  assert.deepEqual(rules[0], { rank: '5', effect: 'burn', power: 9, on: true });
});

test('validateCustom: only the first 20 entries are read', () => {
  const list = Array.from({ length: 20 }, () => ({ rank: '3', power: 3 })).concat([{ rank: '4', power: 4 }]);
  const { rules } = S.validateCustom(list);
  assert.deepEqual(rules.map(r => r.rank), ['3']);
});

test('every effect named in the UI list is a known effect with a description', () => {
  for (const e of S.EFFECTS) assert.ok(S.EFFECT_INFO[e], e);
  assert.equal(S.describeRule({ rank: '5', effect: 'burn', power: 9 }), '5: burns the pile, you go again, counts as 9');
  assert.equal(S.describeRule({ rank: '8', effect: 'none' }), '8: plain card');
});

// ---------- legality ----------
test('anything goes on an empty pile', () => {
  const r = S.makeRuleset();
  for (const k of S.RANK_LIST) assert.ok(can(r, k + 'S', []), k);
});

test('ascending: equal or higher only', () => {
  const r = S.makeRuleset();
  assert.ok(can(r, '5H', ['5S']));
  assert.ok(can(r, '6H', ['5S']));
  assert.ok(!can(r, '4H', ['5S']));
  assert.ok(!can(r, '3H', ['KS']));
});

test('2 and 10 go on anything', () => {
  const r = S.makeRuleset();
  assert.ok(can(r, '2H', ['AS']));
  assert.ok(can(r, '10H', ['AS']));
});

test('a 2 resets: anything goes on a 2', () => {
  const r = S.makeRuleset();
  assert.ok(can(r, '3H', ['2S']));
  assert.ok(can(r, '2H', ['2S']));
});

test('seven: next card must be equal or lower', () => {
  const r = S.makeRuleset();
  assert.ok(can(r, '7H', ['7S']));
  assert.ok(can(r, '6H', ['7S']));
  assert.ok(!can(r, '8H', ['7S']));
  assert.ok(!can(r, 'AH', ['7S']));
  assert.ok(can(r, '2H', ['7S']));
  assert.ok(can(r, '10H', ['7S']));
});

test('seven is a plain card when sevensLower is off', () => {
  const r = S.makeRuleset({ sevensLower: false });
  assert.ok(!can(r, '6H', ['7S']));
  assert.ok(can(r, '8H', ['7S']));
});

test('transparent: the card underneath still counts', () => {
  const r = S.makeRuleset({ transparentOn: true });
  assert.ok(!can(r, '8H', ['9S', '4D']));
  assert.ok(can(r, '9H', ['9S', '4D']));
  assert.ok(can(r, '10H', ['9S', '4D']));
  assert.ok(!can(r, '5H', ['9S', '4D', '4C']));
});

test('transparent on an empty pile leaves the pile open', () => {
  const r = S.makeRuleset({ transparentOn: true });
  assert.ok(can(r, '3H', ['4S']));
  assert.equal(S.effectiveTop(r, cards(['4S'])), null);
});

test('transparent over a seven keeps the lower rule in force', () => {
  const r = S.makeRuleset({ transparentOn: true });
  assert.ok(!can(r, '8H', ['7S', '4D']));
  assert.ok(can(r, '6H', ['7S', '4D']));
});

test('a transparent card plays on anything', () => {
  const r = S.makeRuleset({ transparentOn: true });
  assert.ok(can(r, '4H', ['9S']));
});

test('an invisible card plays on a skip card, and the skip card still counts underneath', () => {
  // Matt, 25 Nov 2026 (reverses the earlier skip exception): invisible goes on anything.
  const r = S.makeRuleset({ transparentOn: true, skipOn: true });
  assert.ok(can(r, '4H', ['8S']));
  assert.ok(!can(r, '6H', ['8S', '4H']), 'the 8 still counts under the invisible card');
  assert.ok(can(r, '9H', ['8S', '4H']));
});

test('stinger: only the same rank, or a transparent card', () => {
  const r = S.makeRuleset({ transparentOn: true, custom: [{ rank: '9', effect: 'stinger' }] });
  assert.ok(can(r, '9H', ['9S']));
  assert.ok(!can(r, 'AH', ['9S']));
  assert.ok(!can(r, '10H', ['9S']), '10 cannot burn a stinger');
  assert.ok(!can(r, '2H', ['9S']), '2 cannot reset a stinger');
  assert.ok(can(r, '4H', ['9S']), 'transparent allowed');
});

test('stinger stays in force underneath a transparent card', () => {
  const r = S.makeRuleset({ transparentOn: true, custom: [{ rank: '9', effect: 'stinger' }] });
  assert.ok(!can(r, '5H', ['9S', '4D']));
  assert.ok(can(r, '9H', ['9S', '4D']));
});

test('legalGroups groups by rank and only returns playable ranks', () => {
  const g = setup({ hands: [['5S', '5H', '9D', '3C']], pile: ['6S'] });
  const groups = S.legalGroups(g, 0).map(grp => names(grp).sort());
  assert.deepEqual(groups, [['9D']]);
  const g2 = setup({ hands: [['5S', '5H', '9D', '3C']], pile: ['4S'] });
  const r2 = S.legalGroups(g2, 0).map(grp => names(grp).sort()).sort();
  assert.deepEqual(r2, [['5H', '5S'], ['9D']]);
});

test('legalGroups is empty for the blind zone; canAnyPlay is always true there', () => {
  const g = setup({ hands: [[]], downs: [['3S']], pile: ['KS'] });
  assert.equal(S.zone(g, g.players[0]), 'down');
  assert.deepEqual(S.legalGroups(g, 0), []);
  assert.equal(S.canAnyPlay(g, 0), true);
});

test('canAnyPlay is false when nothing in hand is legal', () => {
  const g = setup({ hands: [['3S', '4H']], pile: ['KS'] });
  assert.equal(S.canAnyPlay(g, 0), false);
});

test('zone order: hand, then face-up, then face-down', () => {
  const g = setup({ hands: [['3S']], ups: [['4S']], downs: [['5S']] });
  const p = g.players[0];
  assert.equal(S.zone(g, p), 'hand');
  p.hand = [];
  assert.equal(S.zone(g, p), 'up');
  p.up = [];
  assert.equal(S.zone(g, p), 'down');
  p.down = [];
  assert.equal(S.zone(g, p), null);
});

test('the stinger itself plays on anything, whatever its own power', () => {
  const r = S.makeRuleset({ custom: [{ rank: '3', effect: 'stinger' }] });
  assert.ok(can(r, '3H', ['AS']), 'a low stinger goes on an ace');
  assert.ok(can(r, '3H', ['9S']));
  assert.ok(can(r, '3H', []), 'and on an empty pile');
  const lower = S.makeRuleset({ custom: [{ rank: '3', effect: 'stinger' }] });
  assert.ok(can(lower, '3H', ['7S']), 'and on a 7 that forces lower, whatever the 3 counts as');
});

test('once a stinger is down only its own rank follows, even another stinger', () => {
  const r = S.makeRuleset({ custom: [{ rank: '3', effect: 'stinger' }, { rank: '5', effect: 'stinger' }] });
  assert.ok(can(r, '3D', ['3S']));
  assert.ok(!can(r, '5D', ['3S']), 'a different stinger cannot follow');
  assert.ok(!can(r, 'AD', ['3S']));
});

test('a transparent card plays on any card, high or low, and on an empty pile', () => {
  const r = S.makeRuleset({ transparentOn: true, transparentRank: '4' });
  for (const top of ['AS', 'KH', '9D', '5C', '7S', '2H', '10S']) assert.ok(can(r, '4H', [top]), '4 on ' + top);
  assert.ok(can(r, '4H', []));
});

test('a transparent card goes on a skip card, whichever rank skips', () => {
  const r = S.makeRuleset({ transparentOn: true, transparentRank: '4', skipOn: true, skipRank: '8' });
  assert.ok(can(r, '4H', ['8S']));
  assert.ok(can(r, '4H', ['3D', '8S']));
  const r9 = S.makeRuleset({ transparentOn: true, transparentRank: '4', skipOn: true, skipRank: '9' });
  assert.ok(can(r9, '4H', ['9S']));
  const own = S.makeRuleset({ transparentOn: true, transparentRank: '4', custom: [{ rank: '5', effect: 'skip' }] });
  assert.ok(can(own, '4H', ['5S']), 'a skip from your own rule too');
});

test('a transparent card is still fine on a stinger, a lower card and a reset', () => {
  const r = S.makeRuleset({ transparentOn: true, transparentRank: '4', custom: [{ rank: '3', effect: 'stinger' }] });
  assert.ok(can(r, '4H', ['3S']));
  assert.ok(can(r, '4H', ['7S']));
  assert.ok(can(r, '4H', ['2S']));
});

test('only the card showing matters: a skip buried under an ordinary card does not block', () => {
  const r = S.makeRuleset({ transparentOn: true, transparentRank: '4', skipOn: true, skipRank: '8' });
  assert.ok(can(r, '4H', ['8S', '6D']), 'the 6 on top is what counts');
});

test('colour demand: next card must be that colour, any rank; only an invisible card gets round it', () => {
  const r = S.makeRuleset({ transparentOn: true, custom: [{ rank: 'Q', effect: 'redNext' }, { rank: 'J', effect: 'blackNext' }] });
  assert.ok(can(r, '3H', ['QS']), 'a red 3 goes on a red-demand Q');
  assert.ok(can(r, '7D', ['QC']), 'a red 7 is legal');
  assert.ok(!can(r, 'AS', ['QH']), 'a black ace is not');
  assert.ok(!can(r, '10C', ['QH']), 'a black 10 cannot burn it');
  assert.ok(can(r, '10H', ['QH']), 'a red 10 can');
  assert.ok(can(r, '4S', ['QH']), 'the invisible 4 gets round it');
  assert.ok(!can(r, 'KS', ['QH', '4C']), 'the demand stays in force under the invisible card');
  assert.ok(can(r, '5S', ['JD']) && !can(r, '5H', ['JD']), 'black demand');
  assert.deepEqual(S.validateCustom([{ rank: 'Q', effect: 'redNext' }]).rejected, []);
});

test('lower than can sit on another card, never on 2 or 10', () => {
  const r9 = S.makeRuleset({ lowerRank: '9' });
  assert.equal(r9.ranks['9'].effect, 'lower');
  assert.equal(r9.ranks['7'].effect, null);
  assert.equal(can(r9, '8H', ['9S']), true);
  assert.equal(can(r9, 'JH', ['9S']), false);
  assert.equal(S.makeRuleset({ lowerRank: '10' }).ranks['10'].effect, 'burn');
  assert.equal(S.makeRuleset({ lowerRank: '9', sevensLower: false }).ranks['9'].effect, undefined);
});

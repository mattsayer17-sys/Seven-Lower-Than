'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/engine.js');
const A = require('../src/a11y.js');
const H = require('./helpers.js');

const ctxAll = (over) => Object.assign({ tappable: () => true, legal: () => true, selected: [], swapSel: null, picking: false }, over || {});

test('cardName spells out court cards and suits', () => {
  assert.equal(A.cardName({ rank: 'Q', suit: 'H' }), 'Queen of hearts');
  assert.equal(A.cardName({ rank: 'A', suit: 'S' }), 'Ace of spades');
  assert.equal(A.cardName({ rank: '10', suit: 'C' }), '10 of clubs');
  assert.equal(A.cardName({ rank: '7', suit: 'D' }), '7 of diamonds');
});

test('the summary never names a hidden card (opponent hand, face down, draw pile), over many deals', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const g = S.newGame({ rules: S.makeRuleset(), players: 2 + (seed % 3), seed });
    g.phase = 'play'; g.turn = 0;
    const text = A.summary(g);
    const secret = [];
    g.draw.forEach(c => secret.push(c));
    g.players.forEach((p, i) => { p.down.forEach(c => secret.push(c)); if (i > 0) p.hand.forEach(c => secret.push(c)); });
    for (const c of secret) assert.ok(!text.includes(A.cardName(c)), 'seed ' + seed + ' leaked ' + A.cardName(c));
    // what is public is there: every face-up card
    g.players.forEach(p => p.up.forEach(c => assert.ok(text.includes(A.cardName(c)), 'missing face-up ' + A.cardName(c))));
  }
});

test('my items name my hand and face-up cards, and never name a face-down card', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const g = S.newGame({ rules: S.makeRuleset(), players: 2, seed });
    g.phase = 'play'; g.turn = 0;
    const items = A.myItems(g, ctxAll());
    const me = g.players[0];
    assert.equal(items.length, me.hand.length + me.up.length + me.down.length);
    me.down.forEach(c => { const it = items.find(i => i.id === c.id); assert.match(it.label, /^Face-down card \d of 3/); assert.ok(!it.label.includes(A.cardName(c))); });
    me.hand.forEach(c => assert.ok(items.find(i => i.id === c.id).label.startsWith(A.cardName(c))));
  }
});

test('items carry selection and playability', () => {
  const g = H.setup({ hands: [['5S', '9H'], ['3C']], ups: [['KD'], ['4C']], downs: [['2C'], ['6C']] });
  const [five, nine] = g.players[0].hand;
  const items = A.myItems(g, ctxAll({ selected: [five.id], legal: c => c.id !== nine.id }));
  const f = items.find(i => i.id === five.id), n = items.find(i => i.id === nine.id);
  assert.equal(f.pressed, true); assert.match(f.label, /selected/);
  assert.equal(n.disabled, true); assert.match(n.label, /cannot be played now/);
  assert.equal(f.disabled, false);
});

test('a card that cannot be tapped is disabled and does not claim to be unplayable', () => {
  const g = H.setup({ hands: [['5S'], ['3C']] });
  const items = A.myItems(g, ctxAll({ tappable: () => false }));
  assert.ok(items.every(i => i.disabled));
  assert.ok(items.every(i => !/cannot be played/.test(i.label)));
});

test('face-down cards say tap to flip only when it is time to pick one', () => {
  const g = H.setup({ hands: [[], ['3C']], ups: [[], ['4C']], downs: [['2C', '6D'], ['6C']] });
  assert.match(A.myItems(g, ctxAll({ picking: true }))[0].label, /tap to flip/);
  assert.doesNotMatch(A.myItems(g, ctxAll({ picking: false }))[0].label, /tap to flip/);
});

test('the pile, draw count, direction and whose turn are in the summary', () => {
  const g = H.setup({ turn: 1, dir: -1, pile: ['4S', '9H'], draw: ['3C', '5D', '8S'], hands: [['5S'], ['3C']] });
  const t = A.summary(g);
  assert.match(t, /Pile: 9 of hearts on top, 2 cards\./);
  assert.match(t, /Draw pile: 3 left\./);
  assert.match(t, /counter-clockwise/);
  assert.match(t, /It is P1's turn\./);
});

test('singular wording and an empty pile', () => {
  const g = H.setup({ pile: [], draw: [], hands: [['5S'], ['3C']] });
  const t = A.summary(g);
  assert.match(t, /The pile is empty\./);
  assert.match(t, /The draw pile is empty\./);
  assert.match(t, /You have 1 card in hand/);
  assert.match(t, /It is your turn\./);
});

test('an invisible card on top says what still counts', () => {
  const g = H.setup({ rules: { transparentOn: true, transparentRank: '4' }, pile: ['9H', '4S'] });
  const t = A.summary(g);
  assert.match(t, /Pile: 4 of spades on top/);
  assert.match(t, /invisible, so 9 of hearts still counts/);
});

test('a player who is out is reported as out, with place', () => {
  const g = H.setup({ players: 3, hands: [['5S'], [], ['3C']], ups: [['KD'], [], ['4C']], downs: [['2C'], [], ['6C']] });
  g.players[1].out = true; g.finished = [1];
  const t = A.summary(g);
  assert.match(t, /P1 is out \(1st\)\./);
});

test('a flipped face-down card stops counting as face down', () => {
  const g = H.setup({ hands: [[], ['3C']], ups: [[], ['4C']], downs: [['2C', '6D', '8H'], ['6C']] });
  const open = g.players[0].down[1];
  assert.match(A.summary(g), /3 cards face down/);
  assert.match(A.summary(g, open.id), /2 cards face down/);
});

test('swap phase is explained', () => {
  const g = H.setup({});
  g.phase = 'swap';
  assert.match(A.summary(g), /Swap phase/);
});

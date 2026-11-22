'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { S, setup, ids, names, cards } = require('./helpers.js');

const playSpecs = (g, pi, zone, specs) => S.play(g, pi, ids(g, pi, zone, specs));

// ---------- basic play ----------
test('play rejects out-of-turn, mixed ranks, illegal and unknown cards', () => {
  const g = setup({ hands: [['5S', '6S', '3H']], pile: ['5D'] });
  assert.deepEqual(S.play(g, 1, [1]), { ok: false, err: 'not your turn' });
  assert.equal(playSpecs(g, 0, 'hand', ['5S', '6S']).err, 'mixed ranks');
  assert.equal(playSpecs(g, 0, 'hand', ['3H']).err, 'illegal');
  assert.equal(S.play(g, 0, [99999]).err, 'bad cards');
  assert.equal(S.play(g, 0, []).err, 'bad cards');
});

test('a rejected play changes nothing', () => {
  const g = setup({ hands: [['5S', '3H']], pile: ['9D'] });
  const before = JSON.stringify([g.pile, g.players[0].hand, g.turn]);
  playSpecs(g, 0, 'hand', ['3H']);
  assert.equal(JSON.stringify([g.pile, g.players[0].hand, g.turn]), before);
});

test('play is refused outside the play phase', () => {
  const g = setup({ hands: [['5S']] });
  g.phase = 'swap';
  assert.equal(S.play(g, 0, [g.players[0].hand[0].id]).err, 'not your turn');
});

test('a legal play moves the card to the pile and passes the turn', () => {
  const g = setup({ hands: [['5S', '9H']], pile: ['3D'] });
  const r = playSpecs(g, 0, 'hand', ['5S']);
  assert.equal(r.ok, true);
  assert.deepEqual(names(g.pile), ['3D', '5S']);
  assert.equal(g.turn, 1);
  assert.equal(g.turns, 1);
});

test('several cards of one rank go down together', () => {
  const g = setup({ hands: [['5S', '5H', '9H']], draw: ['KS', 'QS'] });
  const r = playSpecs(g, 0, 'hand', ['5S', '5H']);
  assert.equal(r.ok, true);
  assert.deepEqual(names(g.pile), ['5S', '5H']);
});

test('hand refills to three from the draw pile, nothing after it runs out', () => {
  const g = setup({ hands: [['5S', '5H', '9H']], draw: ['KS', 'QS'] });
  playSpecs(g, 0, 'hand', ['5S', '5H']);
  assert.equal(g.players[0].hand.length, 3);
  assert.equal(g.draw.length, 0);
  const g2 = setup({ hands: [['5S', '9H']], draw: ['KS'] });
  playSpecs(g2, 0, 'hand', ['5S']);
  assert.equal(g2.players[0].hand.length, 2);
});

test('hand is kept sorted by power', () => {
  const g = setup({ hands: [['5S', '9H']], draw: ['3S', 'KD'] });
  playSpecs(g, 0, 'hand', ['5S']);
  const p = g.players[0].hand.map(c => S.power(g.rules, c));
  assert.deepEqual(p, [...p].sort((a, b) => a - b));
});

test('with an empty hand you play from face-up cards, and they are not refilled', () => {
  const g = setup({ hands: [[]], ups: [['5H', '5S']], downs: [['3C']], draw: ['KS'] });
  const r = playSpecs(g, 0, 'up', ['5H', '5S']);
  assert.equal(r.ok, true);
  assert.equal(r.event.from, 'up');
  assert.equal(g.players[0].hand.length, 0);
  assert.equal(g.draw.length, 1);
});

test('face-down cards cannot be played with play()', () => {
  const g = setup({ hands: [[]], downs: [['3C']] });
  assert.equal(S.play(g, 0, [g.players[0].down[0].id]).err, 'bad zone');
});

// ---------- burn ----------
test('a 10 burns the pile and the burner goes again', () => {
  const g = setup({ hands: [['10S', '3S']], pile: ['KS', 'AS'] });
  const r = playSpecs(g, 0, 'hand', ['10S']);
  assert.equal(r.burned, true);
  assert.equal(g.pile.length, 0);
  assert.equal(g.burned.length, 3);
  assert.equal(g.lastBurn.length, 3);
  assert.equal(g.turn, 0);
});

test('a 10 burns even when it is not the first card of a multiple', () => {
  const g = setup({ hands: [['10S', '10H', '3S']], pile: ['KS'] });
  playSpecs(g, 0, 'hand', ['10S', '10H']);
  assert.equal(g.pile.length, 0);
  assert.equal(g.turn, 0);
});

test('four of a kind burns, including when four are played at once', () => {
  const g = setup({ hands: [['5S', '5H', '5D', '5C', '9S']] });
  playSpecs(g, 0, 'hand', ['5S', '5H', '5D', '5C']);
  assert.equal(g.pile.length, 0);
  assert.equal(g.turn, 0);
});

test('four of a kind built across several players burns', () => {
  const g = setup({ hands: [['5C', '9S']], pile: ['5S', '5H', '5D'] });
  const r = playSpecs(g, 0, 'hand', ['5C']);
  assert.equal(r.burned, true);
  assert.equal(g.pile.length, 0);
});

test('four of a kind needs strict adjacency: a card in between stops the burn', () => {
  const g = setup({ rules: { transparentOn: true }, hands: [['5C', '9S']], pile: ['5S', '5H', '4C', '5D'] });
  const r = playSpecs(g, 0, 'hand', ['5C']);
  assert.equal(r.burned, false);
  assert.equal(g.pile.length, 5);
});

test('three of a kind does not burn', () => {
  const g = setup({ hands: [['5C', '9S']], pile: ['5S', '5H'] });
  assert.equal(playSpecs(g, 0, 'hand', ['5C']).burned, false);
});

test('three of a kind on top of a different card does not burn (pile of 4+)', () => {
  const g = setup({ hands: [['5C', '9S']], pile: ['3D', '5S', '5H'] });
  assert.equal(playSpecs(g, 0, 'hand', ['5C']).burned, false);
  assert.equal(g.pile.length, 4);
});

test('four of a kind burn can be switched off', () => {
  const g = setup({ rules: { fourBurns: false }, hands: [['5C', '9S']], pile: ['5S', '5H', '5D'] });
  assert.equal(playSpecs(g, 0, 'hand', ['5C']).burned, false);
  assert.equal(g.pile.length, 4);
});

test('burning with your last card ends your turn properly (turn moves on)', () => {
  const g = setup({ players: 3, hands: [['10S'], ['9S'], ['9H']], pile: ['KS'] });
  const r = playSpecs(g, 0, 'hand', ['10S']);
  assert.equal(r.out, true);
  assert.equal(g.turn, 1);
});

// ---------- skip ----------
test('one skip card skips one player (3 players)', () => {
  const g = setup({ rules: { skipOn: true }, players: 3, hands: [['8S', '3S']] });
  const r = playSpecs(g, 0, 'hand', ['8S']);
  assert.equal(g.turn, 2);
  assert.equal(r.event.skipped, 1);
});

test('two skip cards in a 3-player game bring it back to you', () => {
  const g = setup({ rules: { skipOn: true }, players: 3, hands: [['8S', '8H', '3S']] });
  const r = playSpecs(g, 0, 'hand', ['8S', '8H']);
  assert.equal(g.turn, 0);
  assert.deepEqual(r.event.skippedAll, [1, 2]);
});

test('two skip cards in a 4-player game land on the 4th player', () => {
  const g = setup({ rules: { skipOn: true }, players: 4, hands: [['8S', '8H', '3S']] });
  playSpecs(g, 0, 'hand', ['8S', '8H']);
  assert.equal(g.turn, 3);
});

test('in a 2-player game one skip card means you go again', () => {
  const g = setup({ rules: { skipOn: true }, hands: [['8S', '3S']] });
  playSpecs(g, 0, 'hand', ['8S']);
  assert.equal(g.turn, 0);
});

test('in a 2-player game two skip cards still just bring it back to you', () => {
  const g = setup({ rules: { skipOn: true }, hands: [['8S', '8H', '3S']] });
  playSpecs(g, 0, 'hand', ['8S', '8H']);
  assert.equal(g.turn, 0);
});

test('three skip cards in a 4-player game skip all three others', () => {
  const g = setup({ rules: { skipOn: true }, players: 4, hands: [['8S', '8H', '8D', '3S']] });
  playSpecs(g, 0, 'hand', ['8S', '8H', '8D']);
  assert.equal(g.turn, 0);
});

test('skips pass over players who are already out', () => {
  const g = setup({ rules: { skipOn: true }, players: 4, hands: [['8S', '3S'], ['9S'], [], ['9H']] });
  g.players[2].out = true;
  playSpecs(g, 0, 'hand', ['8S']);
  assert.equal(g.turn, 3);
});

test('four skip cards burn instead of skipping (four of a kind)', () => {
  const g = setup({ rules: { skipOn: true }, players: 4, hands: [['8S', '8H', '8D', '8C', '3S']] });
  playSpecs(g, 0, 'hand', ['8S', '8H', '8D', '8C']);
  assert.equal(g.pile.length, 0);
  assert.equal(g.turn, 0);
});

// ---------- other effects ----------
test('reverse flips direction (3 players)', () => {
  const g = setup({ rules: { custom: [{ rank: '9', effect: 'reverse' }] }, players: 3, hands: [['9S', '3S']] });
  const r = playSpecs(g, 0, 'hand', ['9S']);
  assert.equal(g.dir, -1);
  assert.equal(g.turn, 2);
  assert.equal(r.event.reversed, true);
});

test('reverse with 2 players means you go again', () => {
  const g = setup({ rules: { custom: [{ rank: '9', effect: 'reverse' }] }, hands: [['9S', '3S']] });
  playSpecs(g, 0, 'hand', ['9S']);
  assert.equal(g.turn, 0);
});

test('"again" lets you play again', () => {
  const g = setup({ rules: { custom: [{ rank: '9', effect: 'again' }] }, players: 3, hands: [['9S', '3S']] });
  const r = playSpecs(g, 0, 'hand', ['9S']);
  assert.equal(g.turn, 0);
  assert.equal(r.event.again, true);
});

test('"pickup" forces the next player to take the pile and loses them their turn', () => {
  const g = setup({ rules: { custom: [{ rank: '9', effect: 'pickup' }] }, players: 3, hands: [['9S', '3S'], ['6S'], ['6H']], pile: ['5S'] });
  const r = playSpecs(g, 0, 'hand', ['9S']);
  assert.equal(g.pile.length, 0);
  assert.equal(r.event.forced.pi, 1);
  assert.equal(r.event.forced.count, 2);
  assert.equal(g.players[1].hand.length, 3);
  assert.equal(g.turn, 2);
});

test('a stinger on the pile means a player with no matching rank picks up', () => {
  const g = setup({ rules: { custom: [{ rank: '9', effect: 'stinger' }] }, hands: [['3S', 'AH']], pile: ['9D'] });
  assert.equal(S.canAnyPlay(g, 0), false);
  const r = S.pickUp(g, 0);
  assert.equal(r.ok, true);
  assert.equal(r.event.stung, true);
});

// ---------- pick up ----------
test('pickUp: refused while you still have a legal play', () => {
  const g = setup({ hands: [['9S']], pile: ['5D'] });
  assert.equal(S.pickUp(g, 0).err, 'you can play');
});

test('pickUp: refused out of turn', () => {
  const g = setup({ hands: [['3S'], ['3H']], pile: ['KD'] });
  assert.equal(S.pickUp(g, 1).err, 'not your turn');
});

test('pickUp takes the whole pile into your hand, sorted, and passes the turn', () => {
  const g = setup({ hands: [['3S', '4H']], pile: ['KS', 'QD'] });
  const r = S.pickUp(g, 0);
  assert.equal(r.ok, true);
  assert.equal(r.event.count, 2);
  assert.equal(r.event.stung, false);
  assert.equal(g.pile.length, 0);
  assert.equal(g.players[0].hand.length, 4);
  const p = g.players[0].hand.map(c => S.power(g.rules, c));
  assert.deepEqual(p, [...p].sort((a, b) => a - b));
  assert.equal(g.turn, 1);
});

// ---------- blind cards ----------
test('blind: refused unless you are down to your face-down cards', () => {
  const g = setup({ hands: [['3S']], downs: [['5S']] });
  assert.equal(S.playBlind(g, 0, g.players[0].down[0].id).err, 'bad zone');
});

test('blind: unknown card id is refused', () => {
  const g = setup({ hands: [[]], downs: [['5S']] });
  assert.equal(S.playBlind(g, 0, 424242).err, 'no card');
});

test('blind success: the card plays like any other', () => {
  const g = setup({ hands: [[]], downs: [['9S', '3S']], pile: ['6D'] });
  const r = S.playBlind(g, 0, ids(g, 0, 'down', ['9S'])[0]);
  assert.equal(r.event.success, true);
  assert.deepEqual(names(g.pile), ['6D', '9S']);
  assert.equal(g.turn, 1);
});

test('blind failure: you take the pile and the flipped card', () => {
  const g = setup({ hands: [[]], downs: [['3S', '9S']], pile: ['6D', 'KD'] });
  const r = S.playBlind(g, 0, ids(g, 0, 'down', ['3S'])[0]);
  assert.equal(r.event.success, false);
  assert.equal(r.event.picked, 3);
  assert.equal(g.pile.length, 0);
  assert.equal(g.players[0].hand.length, 3);
  assert.equal(g.players[0].down.length, 1);
  assert.equal(g.turn, 1);
});

test('blind failure on your very last card does not put you out', () => {
  const g = setup({ hands: [[], ['9S']], downs: [['3S']], pile: ['KD'] });
  S.playBlind(g, 0, g.players[0].down[0].id);
  assert.equal(g.players[0].out, false);
  assert.equal(g.players[0].hand.length, 2);
});

test('blind 10 burns and you go again', () => {
  const g = setup({ hands: [[]], downs: [['10S', '3S']], pile: ['KD'] });
  const r = S.playBlind(g, 0, ids(g, 0, 'down', ['10S'])[0]);
  assert.equal(r.burned, true);
  assert.equal(g.turn, 0);
});

test('blind failure against a stinger is flagged as a sting', () => {
  const g = setup({ rules: { custom: [{ rank: '9', effect: 'stinger' }] }, hands: [[]], downs: [['3S', '5S']], pile: ['9D'] });
  const r = S.playBlind(g, 0, ids(g, 0, 'down', ['3S'])[0]);
  assert.equal(r.event.stung, true);
});

// ---------- finishing ----------
test('going out ends in order: winner first, last player is the loser', () => {
  const g = setup({ players: 3, hands: [['5S'], ['6S'], ['9S', '9H']] });
  let r = playSpecs(g, 0, 'hand', ['5S']);
  assert.equal(r.out, true);
  assert.equal(g.phase, 'play');
  assert.equal(g.turn, 1);
  r = playSpecs(g, 1, 'hand', ['6S']);
  assert.equal(r.over, true);
  assert.equal(g.phase, 'over');
  assert.equal(g.winner, 0);
  assert.equal(g.loser, 2);
  assert.deepEqual(g.finished, [0, 1, 2]);
});

test('a player who is out is skipped in turn order', () => {
  const g = setup({ players: 3, hands: [['5S'], ['6S', '3H'], ['9S', '9H']] });
  playSpecs(g, 0, 'hand', ['5S']);
  playSpecs(g, 1, 'hand', ['6S']);
  assert.equal(g.turn, 2);
  S.play(g, 2, [g.players[2].hand[0].id]);
  assert.equal(g.turn, 1);
});

test('nothing can be played once the game is over', () => {
  const g = setup({ hands: [['5S'], ['9S', '9H']] });
  playSpecs(g, 0, 'hand', ['5S']);
  assert.equal(g.phase, 'over');
  assert.equal(S.play(g, 1, [g.players[1].hand[0].id]).err, 'not your turn');
});

test('stalemate safety net: after maxTurns the player with most cards is the mouse', () => {
  const g = setup({ rules: { maxTurns: 2 }, players: 2, hands: [['9S', 'KH', 'QH'], ['9D', 'AD']], pile: [] });
  S.play(g, 0, [g.players[0].hand.find(c => c.rank === '9').id]);
  S.play(g, 1, [g.players[1].hand.find(c => c.rank === '9').id]);
  assert.equal(g.phase, 'over');
  assert.equal(g.stalemate, true);
  assert.equal(g.loser, 0, 'holds 2 cards vs 1');
  assert.equal(g.winner, 1);
});

// ---------- start of play ----------
test('lowest non-effect card in hand starts the game', () => {
  const g = S.newGame({ rules: S.makeRuleset(), players: 3, seed: 5 });
  g.players[0].hand = cards(['9S', '10S', '2S']);
  g.players[1].hand = cards(['5S', 'KS', 'AS']);
  g.players[2].hand = cards(['6S', '8S', 'QS']);
  S.startPlay(g);
  assert.equal(g.turn, 1);
  assert.equal(g.phase, 'play');
});

test('sevens are skipped when choosing who starts (they carry an effect)', () => {
  const g = S.newGame({ rules: S.makeRuleset(), players: 2, seed: 5 });
  g.players[0].hand = cards(['7S', '8S', 'AS']);
  g.players[1].hand = cards(['9S', 'JS', 'KS']);
  S.startPlay(g);
  assert.equal(g.turn, 0);
});

test('a tie for the lowest card goes to the earlier seat', () => {
  const g = S.newGame({ rules: S.makeRuleset(), players: 2, seed: 5 });
  g.players[0].hand = cards(['5S', 'KS', 'AS']);
  g.players[1].hand = cards(['5H', 'JS', 'QS']);
  S.startPlay(g);
  assert.equal(g.turn, 0);
});

test('hands made only of effect cards fall back to seat 0', () => {
  const g = S.newGame({ rules: S.makeRuleset(), players: 2, seed: 5 });
  g.players[0].hand = cards(['2S', '10S', '7H']);
  g.players[1].hand = cards(['2H', '10H', '7D']);
  S.startPlay(g);
  assert.equal(g.turn, 0);
});

// ---------- swap ----------
test('swap exchanges a hand card with a face-up card, only during the swap phase', () => {
  const g = S.newGame({ rules: S.makeRuleset(), players: 2, seed: 7 });
  const p = g.players[0];
  const h = p.hand[0], u = p.up[0];
  assert.equal(S.swap(g, 0, h.id, u.id), true);
  assert.ok(p.up.some(c => c.id === h.id));
  assert.ok(p.hand.some(c => c.id === u.id));
  assert.equal(S.swap(g, 0, 99999, u.id), false);
  assert.equal(S.swap(g, 0, h.id, 99999), false);
  S.startPlay(g);
  assert.equal(S.swap(g, 0, u.id, h.id), false);
});

test('cpuSwap never loses or duplicates a card', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const g = S.newGame({ rules: S.makeRuleset(), players: 2, seed });
    const before = g.players[1].hand.concat(g.players[1].up).map(c => c.id).sort((a, b) => a - b);
    S.cpuSwap(g, 1);
    const after = g.players[1].hand.concat(g.players[1].up).map(c => c.id).sort((a, b) => a - b);
    assert.deepEqual(after, before);
    assert.equal(g.players[1].hand.length, 3);
    assert.equal(g.players[1].up.length, 3);
  }
});

// ---------- stingers are used up ----------
const STING = { custom: [{ rank: '3', effect: 'stinger' }] };
const inHand = (g, pi, spec) => g.players[pi].hand.some(c => c.rank === spec.slice(0, -1) && c.suit === spec.slice(-1));
const inBurn = (g, spec) => g.burned.some(c => c.rank === spec.slice(0, -1) && c.suit === spec.slice(-1));

test('picking up the pile leaves the stinger behind in the burn pile', () => {
  const g = setup({ rules: STING, hands: [['AH'], ['9S']], pile: ['9D', '6C', '3S'] });
  const r = S.pickUp(g, 0);
  assert.equal(r.ok, true);
  assert.equal(r.event.count, 2);
  assert.equal(r.event.stingers, 1);
  assert.equal(inHand(g, 0, '9D'), true);
  assert.equal(inHand(g, 0, '6C'), true);
  assert.equal(inHand(g, 0, '3S'), false);
  assert.equal(inBurn(g, '3S'), true);
  assert.deepEqual(g.pile, []);
});

test('two stingers in one pile are both burned', () => {
  const g = setup({ rules: STING, hands: [['AH'], ['9S']], pile: ['3H', '5C', '3S'] });
  const r = S.pickUp(g, 0);
  assert.equal(r.event.stingers, 2);
  assert.equal(r.event.count, 1);
  assert.equal(g.burned.filter(c => c.rank === '3').length, 2);
});

test('a pile of nothing but a stinger leaves the picker with no cards from it', () => {
  const g = setup({ rules: STING, hands: [['AH'], ['9S']], pile: ['3S'] });
  const before = g.players[0].hand.length;
  const r = S.pickUp(g, 0);
  assert.equal(r.ok, true);
  assert.equal(r.event.count, 0);
  assert.equal(g.players[0].hand.length, before);
  assert.equal(inBurn(g, '3S'), true);
});

test('which rank is the stinger is up to the rules, not the card', () => {
  const g = setup({ rules: { custom: [{ rank: 'J', effect: 'stinger' }] }, hands: [['AH'], ['9S']], pile: ['3D', 'JS'] });
  S.pickUp(g, 0);
  assert.equal(inHand(g, 0, '3D'), true, 'a 3 is an ordinary card here');
  assert.equal(inBurn(g, 'JS'), true);
});

test('a blind flip that fails picks up everything but stingers', () => {
  const g = setup({ rules: STING, hands: [[]], downs: [['5S']], pile: ['9D', '3C'] });
  const r = S.playBlind(g, 0, g.players[0].down[0].id);
  assert.equal(r.ok, true);
  assert.equal(r.event.success, false);
  assert.equal(r.event.stingers, 1);
  assert.equal(r.event.picked, 2);
  assert.equal(inBurn(g, '3C'), true);
  assert.equal(inHand(g, 0, '5S'), true);
});

test('a forced pick-up burns the stinger too', () => {
  const g = setup({ rules: { custom: [{ rank: '3', effect: 'stinger' }, { rank: 'K', effect: 'pickup' }] }, hands: [['KH', '5C'], ['9S']], pile: ['3S', '9D'] });
  const r = S.play(g, 0, [g.players[0].hand[0].id]);
  assert.equal(r.ok, true);
  assert.equal(r.event.forced.pi, 1);
  assert.equal(r.event.forced.stingers, 1);
  assert.equal(r.event.forced.count, 2);
  assert.equal(inBurn(g, '3S'), true);
  assert.equal(g.players[1].hand.some(c => c.rank === '3'), false);
  assert.equal(inHand(g, 1, '9D'), true);
  assert.equal(inHand(g, 1, 'KH'), true);
});

test('no card is lost or made up when stingers are burned', () => {
  const g = setup({ rules: STING, hands: [['AH'], ['9S']], pile: ['3H', '5C', '3S'] });
  const total = () => g.draw.length + g.pile.length + g.burned.length + g.players.reduce((n, p) => n + p.hand.length + p.up.length + p.down.length, 0);
  const before = total();
  S.pickUp(g, 0);
  assert.equal(total(), before);
});

// ---------- face-down follow-up ----------
const BF = { blindFollow: true };
test('follow-up off: a face-down card plays alone and nothing is turned over', () => {
  const g = setup({ hands: [[]], downs: [['9S', '9H', '3C']], pile: ['5D'] });
  const r = S.playBlind(g, 0, ids(g, 0, 'down', ['9S'])[0]);
  assert.equal(r.event.cards.length, 1);
  assert.deepEqual(g.players[0].known || [], []);
  assert.equal(g.turn, 1);
});
test('follow-up on: after a face-down card goes on, the go stays open and nothing else can happen', () => {
  const g = setup({ rules: BF, hands: [[]], downs: [['9S', '9H', '3C']], pile: ['5D'] });
  const r = S.playBlind(g, 0, ids(g, 0, 'down', ['9S'])[0]);
  assert.equal(r.event.open, true);
  assert.equal(g.turn, 0);
  assert.deepEqual(g.follow && [g.follow.pi, g.follow.rank, g.follow.count], [0, '9', 1]);
  assert.equal(S.pickUp(g, 0).ok, false);
  // nothing was turned for the owner alone
  assert.deepEqual(g.players[0].known || [], []);
});
test('follow-up: tapping a matching card puts it on, and the go stays open while cards are left', () => {
  const g = setup({ rules: BF, hands: [[]], downs: [['9S', '9H', '3C']], pile: ['5D'] });
  S.playBlind(g, 0, ids(g, 0, 'down', ['9S'])[0]);
  const r = S.playBlind(g, 0, ids(g, 0, 'down', ['9H'])[0]);
  assert.equal(r.event.type, 'follow');
  assert.equal(r.event.matched, true);
  assert.equal(g.pile.length, 3);
  assert.equal(g.turn, 0);
  assert.equal(g.follow.count, 2);
});
test('follow-up: a card that does not match goes into the hand and the go passes', () => {
  const g = setup({ rules: BF, hands: [[]], downs: [['9S', 'KH', '3C']], pile: ['5D'] });
  S.playBlind(g, 0, ids(g, 0, 'down', ['9S'])[0]);
  const r = S.playBlind(g, 0, ids(g, 0, 'down', ['KH'])[0]);
  assert.equal(r.event.matched, false);
  assert.deepEqual(g.players[0].hand.map(c => c.rank + c.suit), ['KH']);
  assert.deepEqual(g.players[0].down.map(c => c.rank + c.suit), ['3C']);
  assert.equal(g.follow, null);
  assert.equal(g.turn, 1);
});
test('follow-up: Done ends the go and the turn moves on', () => {
  const g = setup({ rules: BF, hands: [[]], downs: [['9S', 'KH', '3C']], pile: ['5D'] });
  S.playBlind(g, 0, ids(g, 0, 'down', ['9S'])[0]);
  assert.equal(S.followDone(g, 0).ok, true);
  assert.equal(g.follow, null);
  assert.equal(g.turn, 1);
  assert.equal(S.followDone(g, 1).ok, false);
});
test('follow-up: a matching card not allowed on the pile does not go on (colour rule)', () => {
  const g = setup({ rules: Object.assign({ custom: [{ rank: 'J', effect: 'redNext' }] }, BF), hands: [[]], downs: [['JH', 'JS', '3C']], pile: ['5D'] });
  S.playBlind(g, 0, ids(g, 0, 'down', ['JH'])[0]);
  const r = S.playBlind(g, 0, ids(g, 0, 'down', ['JS'])[0]);
  assert.equal(r.event.matched, false);
  assert.equal(g.players[0].hand.length, 1);
});
test('follow-up: four of a kind made by a follow-up burns, and the player goes again', () => {
  const g = setup({ rules: BF, hands: [[]], downs: [['9S', '9H', '3C']], pile: ['9D', '9C'] });
  S.playBlind(g, 0, ids(g, 0, 'down', ['9S'])[0]);
  const r = S.playBlind(g, 0, ids(g, 0, 'down', ['9H'])[0]);
  assert.equal(r.burned, true);
  assert.equal(g.follow, null);
  assert.equal(g.turn, 0);
});
test('follow-up: two skip cards played this way skip two once the go ends', () => {
  const g = setup({ players: 3, rules: Object.assign({ skipOn: true, skipRank: '8' }, BF), hands: [[], ['5S'], ['5H']], downs: [['8S', '8H', '3C']], pile: ['5D'] });
  S.playBlind(g, 0, ids(g, 0, 'down', ['8S'])[0]);
  S.playBlind(g, 0, ids(g, 0, 'down', ['8H'])[0]);
  const r = S.followDone(g, 0);
  assert.deepEqual(r.event.skippedAll, [1, 2]);
  assert.equal(g.turn, 0);
});
test('follow-up: the last face-down cards going on together finish the player', () => {
  const g = setup({ rules: BF, hands: [[], ['5S']], downs: [['9S', '9H']], pile: ['5D'] });
  S.playBlind(g, 0, ids(g, 0, 'down', ['9S'])[0]);
  const r = S.playBlind(g, 0, ids(g, 0, 'down', ['9H'])[0]);
  assert.equal(r.out, true);
  assert.equal(g.follow, null);
});
test('follow-up: a computer player with the go open either tries a card or stops', () => {
  const g = setup({ rules: BF, hands: [[], []], downs: [['5S'], ['9S', '9H', '3C']], pile: ['5D'] });
  g.turn = 1;
  S.playBlind(g, 1, ids(g, 1, 'down', ['9S'])[0]);
  const r = S.cpuTurn(g, 1);
  assert.equal(r.ok, true);
  assert.equal(r.event.type, 'follow');
});

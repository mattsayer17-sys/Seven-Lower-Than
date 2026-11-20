'use strict';
// What a screen reader should be told about the table. Pure: takes the game, returns words and lists.
// Rule: only say what the player could see. Other hands, face-down cards and the draw pile never appear here.
const Shed = require('./engine.js');

const RANK_WORD = { J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace' };
const SUIT_WORD = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
const cardName = c => (RANK_WORD[c.rank] || c.rank) + ' of ' + SUIT_WORD[c.suit];
const count = (n, one, many) => n + ' ' + (n === 1 ? one : many || one + 's');
const ORD = ['1st', '2nd', '3rd', '4th', '5th'];
const nameOf = (g, i) => (i === 0 ? 'You' : g.players[i].name);
const list = a => (a.length < 3 ? a.join(' and ') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);

// One sentence per player: how many cards in hand, the face-up ones, how many face down.
function playerLine(g, i, revealed) {
  const p = g.players[i];
  if (p.out) return nameOf(g, i) + (i === 0 ? ' are' : ' is') + ' out' + (g.finished && g.finished.indexOf(i) >= 0 ? ' (' + ORD[g.finished.indexOf(i)] + ')' : '') + '.';
  const bits = [];
  bits.push(count(p.hand.length, 'card') + ' in hand');
  if (p.up.length) bits.push('face up: ' + list(p.up.map(cardName)));
  const down = p.down.filter(c => c.id !== revealed);
  if (down.length) bits.push(count(down.length, 'card') + ' face down');
  return nameOf(g, i) + (i === 0 ? ' have ' : ' has ') + bits.join(', ') + '.';
}

// The whole table in a few sentences. revealed = id of a face-down card that has just been flipped.
function summary(g, revealed) {
  const out = [];
  const top = g.pile.length ? g.pile[g.pile.length - 1] : null;
  if (!top) out.push('The pile is empty.');
  else {
    const eff = Shed.effectiveTop(g.rules, g.pile);
    out.push('Pile: ' + cardName(top) + ' on top, ' + count(g.pile.length, 'card') + '.' + (eff && eff !== top ? ' It is invisible, so ' + cardName(eff) + ' still counts.' : ''));
  }
  out.push(g.draw.length ? 'Draw pile: ' + g.draw.length + ' left.' : 'The draw pile is empty.');
  out.push('Play goes ' + (g.dir === 1 ? 'clockwise' : 'counter-clockwise') + '.');
  for (let i = 0; i < g.players.length; i++) out.push(playerLine(g, i, revealed));
  if (g.phase === 'swap') out.push('Swap phase: trade hand cards with face-up cards, then lock in.');
  else if (g.phase === 'play') out.push(g.turn === 0 ? 'It is your turn.' : "It is " + g.players[g.turn].name + "'s turn.");
  return out.join(' ');
}

// The cards the player can reach, in a sensible order: hand, face up, face down.
// ctx: { tappable(c) -> bool, legal(c) -> bool, selected: [ids], swapSel: id|null, picking: bool, top: card|null }
function myItems(g, ctx) {
  const me = g.players[0], items = [];
  const add = (c, where, extra) => {
    const sel = ctx.selected.includes(c.id) || ctx.swapSel === c.id;
    const act = ctx.tappable(c);
    const say = [cardName(c), where];
    if (sel) say.push('selected');
    if (act && ctx.legal && !ctx.legal(c)) say.push('cannot be played now');
    items.push({ id: c.id, label: say.join(', '), pressed: sel, disabled: !act || (!!ctx.legal && !ctx.legal(c)), extra: extra || null });
  };
  me.hand.forEach(c => add(c, 'in your hand'));
  me.up.forEach(c => add(c, 'face up on your table'));
  me.down.forEach((c, i) => {
    const slot = (c._slot == null ? i : c._slot) + 1;
    items.push({ id: c.id, label: 'Face-down card ' + slot + ' of 3' + (ctx.picking ? ', tap to flip' : ''), pressed: false, disabled: !ctx.tappable(c), extra: 'down' });
  });
  return items;
}

module.exports = { cardName, summary, myItems, playerLine };

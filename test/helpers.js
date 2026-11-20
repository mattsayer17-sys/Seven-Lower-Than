'use strict';
const S = require('../src/engine.js');

// '5H' -> { rank: '5', suit: 'H' }, '10S' -> { rank: '10', suit: 'S' }
let nextId = 1000;
function card(spec) {
  const suit = spec.slice(-1);
  const rank = spec.slice(0, -1);
  return { id: nextId++, rank, suit };
}
const cards = list => (list || []).map(card);

// Build a game in the play phase with exact zones. Anything not given gets a harmless default
// so no seat is accidentally "out".
//   rules:  options for makeRuleset
//   hands/ups/downs: arrays (per player) of card specs
//   pile, draw: arrays of card specs (pile top is the LAST item, draw is popped from the end)
function setup(o) {
  o = o || {};
  const n = o.players || 2;
  const rules = S.makeRuleset(o.rules || {});
  const g = S.newGame({ rules, players: n, seed: 1 });
  g.phase = 'play';
  g.turn = o.turn || 0;
  g.dir = o.dir || 1;
  g.draw = cards(o.draw);
  g.pile = cards(o.pile);
  g.burned = [];
  g.players.forEach((p, i) => {
    p.hand = cards(o.hands && o.hands[i] !== undefined ? o.hands[i] : (i === g.turn ? ['5S'] : ['9S', '9H']));
    p.up = cards(o.ups && o.ups[i]);
    p.down = cards(o.downs && o.downs[i]);
    p.out = false;
  });
  return g;
}
const ids = (g, pi, zone, specs) => specs.map(s => {
  const c = g.players[pi][zone].find(x => x.rank + x.suit === s);
  if (!c) throw new Error('card ' + s + ' not in player ' + pi + ' ' + zone);
  return c.id;
});
const names = list => list.map(c => c.rank + c.suit);

// Every card must be in exactly one place, 52 in total.
function allCardIds(g) {
  const a = [];
  g.draw.forEach(c => a.push(c.id));
  g.pile.forEach(c => a.push(c.id));
  g.burned.forEach(c => a.push(c.id));
  g.players.forEach(p => p.hand.concat(p.up, p.down).forEach(c => a.push(c.id)));
  return a;
}

module.exports = { S, card, cards, setup, ids, names, allCardIds };

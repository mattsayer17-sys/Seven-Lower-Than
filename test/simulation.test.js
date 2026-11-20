'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { S, allCardIds } = require('./helpers.js');

// ---------- deck and deal ----------
test('a new game deals 3 down, 3 up and 3 in hand to each seat from a 52-card deck', () => {
  for (const n of [2, 3, 4]) {
    const g = S.newGame({ rules: S.makeRuleset(), players: n, seed: 11 });
    for (const p of g.players) {
      assert.equal(p.down.length, 3);
      assert.equal(p.up.length, 3);
      assert.equal(p.hand.length, 3);
    }
    assert.equal(g.draw.length, 52 - 9 * n);
    const ids = allCardIds(g);
    assert.equal(ids.length, 52);
    assert.equal(new Set(ids).size, 52);
    assert.equal(g.phase, 'swap');
  }
});

test('the deck has every rank in every suit exactly once', () => {
  const g = S.newGame({ rules: S.makeRuleset(), players: 2, seed: 3 });
  const all = [...g.draw, ...g.players.flatMap(p => p.hand.concat(p.up, p.down))];
  const keys = new Set(all.map(c => c.rank + c.suit));
  assert.equal(keys.size, 52);
  for (const r of S.RANK_LIST) for (const s of S.SUITS) assert.ok(keys.has(r + s), r + s);
});

test('same seed deals the same game, different seeds differ', () => {
  const sig = g => JSON.stringify(g.players.map(p => p.hand.map(c => c.id)));
  const a = S.newGame({ rules: S.makeRuleset(), players: 3, seed: 99 });
  const b = S.newGame({ rules: S.makeRuleset(), players: 3, seed: 99 });
  const c = S.newGame({ rules: S.makeRuleset(), players: 3, seed: 100 });
  assert.equal(sig(a), sig(b));
  assert.notEqual(sig(a), sig(c));
});

test('names and human flags are carried onto the seats', () => {
  const g = S.newGame({ rules: S.makeRuleset(), players: 2, seed: 1, names: ['You', 'CPU'], humans: [true, false] });
  assert.equal(g.players[0].name, 'You');
  assert.equal(g.players[0].human, true);
  assert.equal(g.players[1].human, false);
});

// ---------- law 3: no hard-coded ranks in the engine ----------
test('engine source has no hard-coded rank or power comparisons outside the ruleset schema', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'engine.js'), 'utf8');
  // cut the schema builder and the rank list out, those are where rank names are allowed to live
  const body = src
    .replace(/function makeRuleset[\s\S]*?\n  }\n/, '')
    .replace(/const RANK_LIST[^\n]*\n/, '');
  const offenders = [];
  const patterns = [
    /\.rank\s*[!=]==?\s*['"]/,          // card.rank === '7'
    /['"][2-9AJQK]|10['"]\s*[!=]==?\s*\w*\.?rank/, // '7' === card.rank
    /\.rank\s*[<>]/,                    // card.rank > x
    /power\([^)]*\)\s*[<>!=]+\s*\d/,    // power(rules, c) > 9
    /ranks\[\s*['"][^'"]+['"]\s*\]/,    // ranks['10']
  ];
  body.split('\n').forEach((line, i) => {
    if (line.trim().startsWith('//')) return;
    for (const p of patterns) if (p.test(line)) offenders.push((i + 1) + ': ' + line.trim());
  });
  assert.deepEqual(offenders, []);
});

// ---------- full games, many seeds ----------
const RULESETS = {
  classic: {},
  houseRules: { transparentOn: true, skipOn: true },
  noSevens: { sevensLower: false, fourBurns: false },
  exotic: { transparentOn: true, custom: [
    { rank: '9', effect: 'stinger' }, { rank: 'J', effect: 'reverse' }, { rank: 'Q', effect: 'again' }, { rank: 'K', effect: 'pickup' } ] },
  skipNine: { skipOn: true, skipRank: '9', transparentOn: true, transparentRank: '8' },
};

function playOut(opts, check) {
  const g = S.newGame({ rules: S.makeRuleset(opts.rules), players: opts.players, seed: opts.seed });
  for (let i = 0; i < g.players.length; i++) S.cpuSwap(g, i);
  S.startPlay(g);
  let guard = 0;
  while (g.phase === 'play') {
    assert.ok(++guard < 20000, 'game did not terminate');
    const r = S.cpuTurn(g, g.turn);
    assert.equal(r.ok, true, 'cpu made an illegal move: ' + JSON.stringify(r));
    if (check) check(g);
  }
  return g;
}

test('cpu games always finish with a consistent result', () => {
  const stalemates = {};
  for (const [name, rules] of Object.entries(RULESETS)) {
    stalemates[name] = 0;
    for (const players of [2, 3, 4]) {
      for (let seed = 1; seed <= 25; seed++) {
        const g = playOut({ rules, players, seed });
        assert.equal(g.phase, 'over', name);
        if (g.stalemate) stalemates[name]++;
        assert.notEqual(g.loser, null);
        assert.equal(g.finished.length, players, name + ' seed ' + seed);
        assert.equal(new Set(g.finished).size, players);
        assert.equal(g.winner, g.finished[0]);
        assert.equal(g.loser, g.finished[players - 1]);
        // everyone except the mouse has gone out. In a normal finish the mouse still holds cards.
        assert.ok(g.players.every(p => p.out || p.id === g.loser));
        if (!g.stalemate) {
          const m = g.players[g.loser];
          assert.ok(m.hand.length + m.up.length + m.down.length > 0, 'mouse has no cards left');
        }
      }
    }
  }
  console.log('stalemates per ruleset out of 75 games:', JSON.stringify(stalemates));
});

test('no card is ever lost or duplicated during play, for any rule set', () => {
  for (const [name, rules] of Object.entries(RULESETS)) {
    for (const players of [2, 3, 4]) {
      for (let seed = 1; seed <= 8; seed++) {
        playOut({ rules, players, seed }, g => {
          const ids = allCardIds(g);
          assert.equal(ids.length, 52, name + ' lost cards');
          assert.equal(new Set(ids).size, 52, name + ' duplicated cards');
        });
      }
    }
  }
});

test('the pile never holds a burned four of a kind (it always burns)', () => {
  for (let seed = 1; seed <= 30; seed++) {
    playOut({ rules: RULESETS.classic, players: 3, seed }, g => {
      const n = g.pile.length;
      if (n >= 4) {
        const r = g.pile[n - 1].rank;
        assert.ok(!g.pile.slice(n - 4).every(c => c.rank === r), 'unburned four of a kind');
      }
    });
  }
});

test('a game is fully reproducible from its seed', () => {
  const run = () => {
    const g = playOut({ rules: RULESETS.houseRules, players: 3, seed: 2024 });
    return JSON.stringify([g.finished, g.turns, g.burned.length]);
  };
  assert.equal(run(), run());
});

test('game state is never left on a player who is out', () => {
  for (let seed = 1; seed <= 20; seed++) {
    playOut({ rules: RULESETS.classic, players: 4, seed }, g => {
      if (g.phase === 'play') assert.equal(g.players[g.turn].out, false);
    });
  }
});

// Seven Lower Than engine. Pure logic, no DOM. All rank behaviour comes from the ruleset schema.
(function (root) {
  const SUITS = ['S', 'H', 'D', 'C'];
  const RED = { H: true, D: true };

  // Every rank has a power (its order) and at most one effect. Nothing else in the engine knows about specific ranks.
  const EFFECT_INFO = {
    reset: 'Plays on anything, next player starts fresh',
    burn: 'Burns the pile, you go again',
    lower: 'Next player must play equal or lower',
    transparent: 'Invisible, the card underneath still counts. Plays on anything except a skip card',
    skip: 'Next player misses their turn',
    reverse: 'Reverses the direction of play (with 2 players you go again)',
    again: 'You play again',
    pickup: 'Next player must pick up the pile',
    stinger: 'Plays on anything. Only the same rank can be played on it (invisible cards still allowed). Burned, not picked up, if the pile is taken',
  };
  const EFFECTS = Object.keys(EFFECT_INFO);
  const RANK_LIST = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

  // Validate rules coming from the UI or from an AI. Returns { rules, rejected }.
  function validateCustom(list) {
    const rules = [], rejected = [];
    if (!Array.isArray(list)) return { rules, rejected: ['not a list'] };
    for (const r of list.slice(0, 20)) {
      const rank = r && String(r.rank).toUpperCase();
      const ok = {};
      if (!RANK_LIST.includes(rank)) { rejected.push('unknown rank ' + (r && r.rank)); continue; }
      ok.rank = rank;
      const eff = r.effect === 'none' || r.effect === null || r.effect === '' ? 'none' : r.effect;
      if (r.effect !== undefined) {
        if (eff !== 'none' && !EFFECTS.includes(eff)) { rejected.push('unknown effect ' + r.effect); continue; }
        ok.effect = eff;
      }
      if (r.power !== undefined && r.power !== null) {
        const pw = Number(r.power);
        if (!Number.isFinite(pw) || pw < 1 || pw > 20) { rejected.push('bad power for ' + rank); continue; }
        ok.power = Math.round(pw * 10) / 10;
      }
      if (ok.effect === undefined && ok.power === undefined) { rejected.push('nothing to change for ' + rank); continue; }
      ok.on = r.on === false ? false : true;
      // later rules for the same rank replace earlier ones
      const i = rules.findIndex(x => x.rank === rank);
      if (i >= 0) rules[i] = Object.assign({}, rules[i], ok); else rules.push(ok);
    }
    return { rules, rejected };
  }

  function describeRule(r) {
    const bits = [];
    if (r.effect !== undefined) bits.push(r.effect === 'none' ? 'plain card' : EFFECT_INFO[r.effect].replace(/^./, c => c.toLowerCase()));
    if (r.power !== undefined) bits.push('counts as ' + r.power);
    return r.rank + ': ' + bits.join(', ');
  }

  function makeRuleset(opts) {
    opts = opts || {};
    const ranks = {
      '2': { power: 2, effect: 'reset' },
      '3': { power: 3 }, '4': { power: 4 }, '5': { power: 5 }, '6': { power: 6 },
      '7': { power: 7, effect: opts.sevensLower === false ? null : 'lower' },
      '8': { power: 8 },
      '9': { power: 9 },
      '10': { power: 10, effect: 'burn' },
      'J': { power: 11 }, 'Q': { power: 12 }, 'K': { power: 13 }, 'A': { power: 14 },
    };
    // House rules that pick their own rank. Ranks with a fixed job (2, 7, 10) are never offered for these.
    if (opts.transparentOn && ranks[opts.transparentRank || '4']) ranks[opts.transparentRank || '4'].effect = 'transparent';
    if (opts.skipOn && ranks[opts.skipRank || '8']) ranks[opts.skipRank || '8'].effect = 'skip';
    const v = validateCustom((opts.custom || []).filter(r => r && r.on !== false));
    for (const r of v.rules) {
      if (r.effect !== undefined) ranks[r.rank].effect = r.effect === 'none' ? null : r.effect;
      if (r.power !== undefined) ranks[r.rank].power = r.power;
    }
    return {
      ranks,
      fourOfAKindBurns: opts.fourBurns !== false,
      handSize: 3,
      maxTurns: opts.maxTurns || 1500,
      custom: v.rules,
      name: opts.name || 'Classic',
    };
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeDeck(rules) {
    const deck = []; let id = 0;
    for (const s of SUITS) for (const r of Object.keys(rules.ranks)) deck.push({ id: id++, rank: r, suit: s });
    return deck;
  }
  function shuffle(a, rng) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // A card the client has not been shown yet (online play) has no rank. It counts as nothing and does nothing.
  const power = (rules, c) => (c.hidden ? 0 : rules.ranks[c.rank].power);
  const effect = (rules, c) => (c.hidden ? null : rules.ranks[c.rank].effect || null);

  // The pile top that matters: skip transparent cards.
  function effectiveTop(rules, pile) {
    for (let i = pile.length - 1; i >= 0; i--) {
      if (effect(rules, pile[i]) !== 'transparent') return pile[i];
    }
    return null;
  }
  function canPlayCard(rules, card, pile) {
    const top = effectiveTop(rules, pile);
    if (!top) return true;
    const ce = effect(rules, card);
    const te = effect(rules, top);
    // Stinger: only the same rank goes on it. An invisible card is the one exception, and the stinger stays in force underneath it.
    if (te === 'stinger') return card.rank === top.rank || ce === 'transparent';
    // The stinger itself goes on anything (except another stinger, handled above).
    if (ce === 'stinger') return true;
    // An invisible card plays on anything, except a skip card: it would let the skip be dodged.
    if (ce === 'transparent') return te !== 'skip';
    if (ce === 'reset' || ce === 'burn') return true;
    if (te === 'lower') return power(rules, card) <= power(rules, top);
    if (te === 'reset') return true;
    return power(rules, card) >= power(rules, top);
  }

  function newGame(opts) {
    opts = opts || {};
    const rules = opts.rules || makeRuleset();
    const rng = mulberry32(opts.seed != null ? opts.seed : (Math.random() * 2 ** 31) | 0);
    const deck = shuffle(makeDeck(rules), rng);
    const n = opts.players || 2;
    const players = [];
    for (let i = 0; i < n; i++) {
      players.push({
        id: i, name: (opts.names && opts.names[i]) || ('P' + i), human: !!(opts.humans && opts.humans[i]),
        hand: [], up: [], down: [], ready: false, out: false,
      });
    }
    for (let k = 0; k < 3; k++) for (const p of players) p.down.push(deck.pop());
    for (let k = 0; k < 3; k++) for (const p of players) p.up.push(deck.pop());
    for (let k = 0; k < rules.handSize; k++) for (const p of players) p.hand.push(deck.pop());
    return {
      rules, rng, players, draw: deck, pile: [], burned: [], phase: 'swap', turn: 0, dir: 1,
      winner: null, loser: null, finished: [], log: [], lastEvent: null, lastBurn: null, turns: 0, stalemate: false,
    };
  }

  function sortHand(rules, hand) { hand.sort((a, b) => power(rules, a) - power(rules, b) || a.suit.localeCompare(b.suit)); }

  function swap(g, pi, handCardId, upCardId) {
    if (g.phase !== 'swap') return false;
    const p = g.players[pi];
    const hi = p.hand.findIndex(c => c.id === handCardId), ui = p.up.findIndex(c => c.id === upCardId);
    if (hi < 0 || ui < 0) return false;
    const t = p.hand[hi]; p.hand[hi] = p.up[ui]; p.up[ui] = t;
    return true;
  }

  function cardValue(r, c) {
    const e = effect(r, c);
    if (e === 'burn') return 100; if (e === 'reset') return 99;
    if (e) return 60 + power(r, c) * 0.1;
    return power(r, c);
  }
  // CPU swap: strongest keepers go face up, weakest stay in hand.
  function cpuSwap(g, pi) {
    const p = g.players[pi], r = g.rules;
    for (let guard = 0; guard < 9; guard++) {
      let bestHand = null, worstUp = null;
      for (const c of p.hand) if (!bestHand || cardValue(r, c) > cardValue(r, bestHand)) bestHand = c;
      for (const c of p.up) if (!worstUp || cardValue(r, c) < cardValue(r, worstUp)) worstUp = c;
      if (bestHand && worstUp && cardValue(r, bestHand) > cardValue(r, worstUp) + 1) swap(g, pi, bestHand.id, worstUp.id); else break;
    }
  }

  function startPlay(g) {
    for (const p of g.players) sortHand(g.rules, p.hand);
    let best = -1, bestPow = Infinity;
    g.players.forEach((p, i) => {
      for (const c of p.hand) {
        if (effect(g.rules, c)) continue;
        if (power(g.rules, c) < bestPow) { bestPow = power(g.rules, c); best = i; }
      }
    });
    g.turn = best < 0 ? 0 : best;
    g.phase = 'play';
  }

  function zone(g, p) {
    if (p.hand.length) return 'hand';
    if (p.up.length) return 'up';
    if (p.down.length) return 'down';
    return null;
  }

  function legalGroups(g, pi) {
    const p = g.players[pi], z = zone(g, p);
    if (!z || z === 'down') return [];
    const by = {};
    for (const c of p[z]) (by[c.rank] = by[c.rank] || []).push(c);
    const out = [];
    for (const r of Object.keys(by)) if (canPlayCard(g.rules, by[r][0], g.pile)) out.push(by[r]);
    return out;
  }
  function canAnyPlay(g, pi) {
    const p = g.players[pi], z = zone(g, p);
    if (z === 'down') return true;
    return legalGroups(g, pi).length > 0;
  }

  function refill(g, p) {
    while (g.draw.length && p.hand.length < g.rules.handSize) p.hand.push(g.draw.pop());
    sortHand(g.rules, p.hand);
  }

  function checkOut(g, pi) {
    const p = g.players[pi];
    if (p.out || p.hand.length || p.up.length || p.down.length) return false;
    p.out = true;
    g.finished.push(pi);
    if (g.winner == null) g.winner = pi;
    const left = g.players.filter(q => !q.out);
    if (left.length <= 1) {
      g.loser = left.length ? left[0].id : g.finished[g.finished.length - 1];
      if (left.length) g.finished.push(g.loser);
      g.phase = 'over';
    }
    return true;
  }

  function nextTurn(g) {
    const n = g.players.length;
    let t = g.turn;
    for (let i = 0; i < n; i++) { t = (t + g.dir + n) % n; if (!g.players[t].out) { g.turn = t; return; } }
  }

  // Safety net for wild custom rules: if a game drags on, whoever holds the most cards gets the Wooden Spoon.
  function checkStalemate(g) {
    if (g.phase !== 'play' || g.turns < g.rules.maxTurns) return;
    const left = g.players.filter(q => !q.out);
    const tot = q => q.hand.length + q.up.length + q.down.length;
    left.sort((a, b) => tot(a) - tot(b));
    for (const q of left) { q.out = true; g.finished.push(q.id); }
    if (g.winner == null) g.winner = g.finished[0];
    g.loser = g.finished[g.finished.length - 1];
    g.phase = 'over'; g.stalemate = true;
  }

  function topFourOfAKind(g) {
    if (!g.rules.fourOfAKindBurns || g.pile.length < 4) return false;
    const n = g.pile.length, r = g.pile[n - 1].rank;
    for (let i = 1; i < 4; i++) if (g.pile[n - 1 - i].rank !== r) return false;
    return true;
  }

  function applyPlayedCards(g, pi, cards) {
    for (const c of cards) g.pile.push(c);
    const last = cards[cards.length - 1];
    let burned = false;
    g.lastBurn = null;
    if (effect(g.rules, last) === 'burn' || topFourOfAKind(g)) {
      g.lastBurn = g.pile.slice();
      for (const c of g.pile) g.burned.push(c);
      g.pile = []; burned = true;
    }
    return burned;
  }

  // Everything that happens after a successful play: who goes next, and the effects of the last card.
  function afterPlay(g, pi, last, burned, ev, count) {
    count = count || 1;
    const out = g.players[pi].out;
    if (g.phase === 'over') return;
    if (burned) { if (out) nextTurn(g); return; }       // burner goes again
    const eff = effect(g.rules, last);
    const active = g.players.filter(q => !q.out).length;
    if (eff === 'again' && !out) { ev.again = true; return; }
    if (eff === 'reverse') {
      g.dir = -g.dir; ev.reversed = true;
      if (active === 2 && !out) { ev.again = true; return; }
    }
    nextTurn(g);
    // Skip cards skip one player per card played together. Invisible cards do the same when two or more go down together.
    const skips = eff === 'skip' ? count : 0;
    if (skips) {
      // Each card skips one more player in turn order, never the player who played them.
      const skipped = [];
      const k = Math.min(skips, Math.max(active - 1, 0));
      for (let i = 0; i < k; i++) { skipped.push(g.turn); nextTurn(g); }
      if (skipped.length) { ev.skipped = skipped[0]; ev.skippedAll = skipped; }
    }
    if (eff === 'pickup' && g.pile.length) {
      const v = g.players[g.turn];
      const t = takePile(g, v);
      ev.forced = { pi: v.id, count: t.taken.length, cards: t.taken, stingers: t.stingers };
      nextTurn(g);
    }
  }

  function play(g, pi, cardIds) {
    if (g.phase !== 'play' || g.turn !== pi) return { ok: false, err: 'not your turn' };
    const p = g.players[pi], z = zone(g, p);
    if (z !== 'hand' && z !== 'up') return { ok: false, err: 'bad zone' };
    const cards = cardIds.map(id => p[z].find(c => c.id === id));
    if (!cards.length || cards.some(c => !c)) return { ok: false, err: 'bad cards' };
    if (cards.some(c => c.rank !== cards[0].rank)) return { ok: false, err: 'mixed ranks' };
    if (!canPlayCard(g.rules, cards[0], g.pile)) return { ok: false, err: 'illegal' };
    p[z] = p[z].filter(c => !cardIds.includes(c.id));
    const burned = applyPlayedCards(g, pi, cards);
    if (z === 'hand') refill(g, p);
    g.turns++;
    const ev = { type: 'play', pi, cards, burned, from: z };
    g.lastEvent = ev;
    const out = checkOut(g, pi);
    afterPlay(g, pi, cards[cards.length - 1], burned, ev, cards.length);
    checkStalemate(g);
    return { ok: true, burned, event: ev, out, over: g.phase === 'over' };
  }

  function playBlind(g, pi, cardId) {
    if (g.phase !== 'play' || g.turn !== pi) return { ok: false, err: 'not your turn' };
    const p = g.players[pi];
    if (zone(g, p) !== 'down') return { ok: false, err: 'bad zone' };
    const c = p.down.find(x => x.id === cardId);
    if (!c) return { ok: false, err: 'no card' };
    p.down = p.down.filter(x => x.id !== cardId);
    g.turns++;
    if (canPlayCard(g.rules, c, g.pile)) {
      const burned = applyPlayedCards(g, pi, [c]);
      const ev = { type: 'blind', pi, cards: [c], burned, success: true };
      g.lastEvent = ev;
      const out = checkOut(g, pi);
      afterPlay(g, pi, c, burned, ev);
      checkStalemate(g);
      return { ok: true, burned, event: ev, out, over: g.phase === 'over' };
    }
    const stung = stungTop(g);
    const t = takePile(g, p, [c]);
    const ev = { type: 'blind', pi, cards: [c], success: false, picked: t.taken.length, stung, stingers: t.stingers };
    g.lastEvent = ev;
    nextTurn(g);
    checkStalemate(g);
    return { ok: true, event: ev, over: g.phase === 'over' };
  }

  // True when the pile top is a stinger, so anyone who can't match it is stung.
  function stungTop(g) { const t = effectiveTop(g.rules, g.pile); return !!t && effect(g.rules, t) === 'stinger'; }
  // Picking up the pile: every card goes to the hand except stingers, which are used up and go to the burn pile.
  function takePile(g, p, extra) {
    const all = g.pile.concat(extra || []);
    g.pile = [];
    const taken = [], gone = [];
    for (const c of all) (effect(g.rules, c) === 'stinger' ? gone : taken).push(c);
    for (const c of gone) g.burned.push(c);
    p.hand.push(...taken);
    sortHand(g.rules, p.hand);
    return { taken, stingers: gone.length };
  }

  // force skips the 'you can play' check. Online, the client replays another player's pick-up without seeing their hand.
  function pickUp(g, pi, force) {
    if (g.phase !== 'play' || g.turn !== pi) return { ok: false, err: 'not your turn' };
    if (!force && canAnyPlay(g, pi)) return { ok: false, err: 'you can play' };
    const p = g.players[pi];
    if (!g.pile.length) return { ok: false, err: 'empty pile' };
    const stung = stungTop(g);
    const t = takePile(g, p);
    g.turns++;
    const ev = { type: 'pickup', pi, count: t.taken.length, stung, stingers: t.stingers };
    g.lastEvent = ev;
    nextTurn(g);
    checkStalemate(g);
    return { ok: true, event: ev, over: g.phase === 'over' };
  }

  // ---------- CPU ----------
  function cpuChoose(g, pi) {
    const p = g.players[pi], r = g.rules, z = zone(g, p);
    if (z === 'down') {
      const c = p.down[Math.floor(g.rng() * p.down.length)];
      return { kind: 'blind', id: c.id };
    }
    const groups = legalGroups(g, pi);
    if (!groups.length) return { kind: 'pickup' };
    const rankVal = grp => cardValue(r, grp[0]);
    const sorted = groups.slice().sort((a, b) => rankVal(a) - rankVal(b));
    let pick = sorted[0];
    if (sorted.length > 1 && g.rng() < (p.rp != null ? p.rp : 0.12)) pick = sorted[Math.floor(g.rng() * sorted.length)];
    const opps = g.players.filter((q, i) => i !== pi && !q.out).map(q => q.hand.length + q.up.length + q.down.length);
    const oppMin = opps.length ? Math.min(...opps) : 99;
    const bigPile = g.pile.length >= 6;
    const burner = sorted.find(grp => effect(r, grp[0]) === 'burn');
    const tactical = p.rp == null || p.rp < 0.3;
    if (tactical && burner && (bigPile || oppMin <= 3) && sorted.length > 1) pick = burner;
    // a pickup card is a weapon: use it when the pile is big
    const weapon = sorted.find(grp => effect(r, grp[0]) === 'pickup');
    if (tactical && weapon && bigPile) pick = weapon;
    return { kind: 'play', ids: pick.map(c => c.id) };
  }

  function cpuTurn(g, pi) {
    const d = cpuChoose(g, pi);
    if (d.kind === 'blind') return playBlind(g, pi, d.id);
    if (d.kind === 'pickup') return pickUp(g, pi);
    return play(g, pi, d.ids);
  }

  const api = { sortHand, SUITS, RED, EFFECTS, EFFECT_INFO, RANK_LIST, validateCustom, describeRule, makeRuleset, newGame, swap, cpuSwap, startPlay, zone, legalGroups, canAnyPlay, canPlayCard, play, playBlind, pickUp, cpuChoose, cpuTurn, effectiveTop, power, effect, mulberry32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Shed = api;
})(typeof window !== 'undefined' ? window : globalThis);

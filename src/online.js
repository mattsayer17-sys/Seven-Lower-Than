'use strict';
// Client side of online play, with no DOM and no network of its own.
// 1. fromView turns the server's per-seat view into a game object the existing UI can draw,
//    rotated so the person looking is always seat 0 (the UI assumes that), with placeholder cards for hidden ones.
// 2. Client sends actions through a transport and keeps the latest view.
(function (root) {
  // Every placeholder gets an id nobody else has had, so a card element can follow it around the table.
  let nextHidden = 0;
  const hiddenCard = () => ({ id: --nextHidden, rank: '?', suit: '?', hidden: true });

  function rotate(arr, me) { const n = arr.length; return arr.map((_, i) => arr[(i + me) % n]); }

  // seat index in the server's numbering -> index in the rotated game
  const to = (i, me, n) => (i == null ? i : (i - me + n) % n);

  function fromView(v) {
    const n = v.players.length, me = v.me;
    const fill = (a) => a.map(c => (c === null ? hiddenCard() : c));
    const players = rotate(v.players, me).map((p, i) => ({
      id: i, name: p.name, human: i === 0, out: p.out, ready: p.ready,
      hand: fill(p.hand), up: p.up, down: i === 0 ? p.down.map((c, j) => c || { id: p.myDown[j], rank: '?', suit: '?', hidden: true }) : fill(p.down),
    }));
    const ev = v.lastEvent ? remapEvent(v.lastEvent, me, n) : null;
    return {
      rules: v.rules, players, draw: Array.from({ length: v.drawCount }, () => hiddenCard()), pile: v.pile.slice(),
      burned: Array.from({ length: v.burnedCount }, () => hiddenCard()), phase: v.phase, turn: to(v.turn, me, n), dir: v.dir || 1,
      winner: to(v.winner, me, n), loser: to(v.loser, me, n), finished: (v.finished || []).map(i => to(i, me, n)),
      log: [], lastEvent: ev, lastBurn: null, turns: 0, stalemate: !!v.stalemate, online: true, seats: rotate(v.seats, me),
    };
  }

  function remapEvent(e, me, n) {
    const o = Object.assign({}, e);
    if (o.pi != null) o.pi = to(o.pi, me, n);
    if (o.skipped != null) o.skipped = to(o.skipped, me, n);
    if (o.skippedAll) o.skippedAll = o.skippedAll.map(i => to(i, me, n));
    if (o.forced) o.forced = Object.assign({}, o.forced, { pi: to(o.forced.pi, me, n) });
    return o;
  }

  // ---- keeping a shadow game in step with the server ----
  // A shadow is a game the UI can draw and the engine can run. Other people's unseen cards are placeholders.
  // When someone else moves, we replay their move on the shadow with the same engine calls solo play uses,
  // so every animation works unchanged. Each server snapshot then checks the shadow, and a mismatch means resync.
  const Shed = require('./engine.js');

  function digest(g) {
    const ids = a => a.map(c => c.id).sort((x, y) => x - y);
    return JSON.stringify({
      ph: g.phase, t: g.turn, d: g.dir, pile: g.pile.map(c => c.id), dr: g.draw.length, bu: g.burned.length,
      w: g.winner, l: g.loser, f: g.finished,
      p: g.players.map((p, i) => ({ o: p.out, h: i === 0 ? ids(p.hand) : p.hand.length, u: ids(p.up), dn: p.down.length })),
    });
  }

  function placeholderIn(list) { const i = list.findIndex(c => c.hidden); return i; }

  // Put the real card where a placeholder was. Returns the pair so the UI can move the element across.
  function bindInto(list, card, rekeys) {
    const at = list.findIndex(c => c.id === card.id);
    if (at >= 0) { if (list[at].hidden) { rekeys.push({ from: list[at], to: card }); list[at] = card; } return true; }
    const i = placeholderIn(list);
    if (i < 0) return false;
    rekeys.push({ from: list[i], to: card });
    // the card keeps the slot the placeholder had on the table
    card._slot = list[i]._slot; card._uslot = list[i]._uslot;
    list[i] = card;
    return true;
  }

  // My own face-down card is turned over: it already has its real id, now it gets its face.
  function revealMine(g, card) {
    const mine = g.players[0].down.find(c => c.id === card.id);
    if (!mine) return null;
    const from = Object.assign({}, mine);
    mine.rank = card.rank; mine.suit = card.suit; mine.hidden = false;
    return { from, to: mine, same: true };
  }

  // Replay someone else's last move. Returns the engine result, or null if it cannot be replayed.
  function replay(g, ev, rekeys) {
    const pi = ev.pi, p = g.players[pi];
    if (!p || pi === 0) return null;
    if (ev.type === 'pickup') return Shed.pickUp(g, pi, true);
    if (ev.type === 'play') {
      const zone = ev.from === 'up' ? p.up : p.hand;
      for (const c of ev.cards) if (!bindInto(zone, c, rekeys)) return null;
      return Shed.play(g, pi, ev.cards.map(c => c.id));
    }
    if (ev.type === 'blind') {
      if (!bindInto(p.down, ev.cards[0], rekeys)) return null;
      return Shed.playBlind(g, pi, ev.cards[0].id);
    }
    return null;
  }

  // Decide how the shadow g catches up to the server's snapshot (view, version).
  // Returns { mode: 'same' } | { mode: 'step', result, rekeys } | { mode: 'mine', rekeys } | { mode: 'resync', game }
  function reconcile(g, view, version) {
    const snap = fromView(view), n = view.players.length, me = view.me;
    const resync = (why, extra) => { snap.version = version; return { mode: 'resync', game: snap, why, extra }; };
    if (version <= (g.version || 0)) return { mode: 'same' };
    const ev = snap.lastEvent, rekeys = [];
    const inPlay = g.phase === 'play' && snap.phase !== 'swap';
    if (!inPlay || version !== g.version + 1 || !ev) return resync('not a single step');
    let result = null, mode;
    if (ev.pi === 0) {
      if (!g.pending) return resync('my move, none pending');
      mode = 'mine';
    } else {
      if (g.pending) return resync('their move while mine pending');
      try { result = replay(g, ev, rekeys); } catch (e) { return resync('replay threw', e.message); }
      if (!result || !result.ok) return resync('replay refused', JSON.stringify([ev, result && result.err]));
      mode = 'step';
    }
    // my own cards drawn from the pile arrive as placeholders until the server tells us what they are
    for (const c of snap.players[0].hand) if (!bindInto(g.players[0].hand, c, rekeys)) return resync('could not bind my hand');
    Shed.sortHand(g.rules, g.players[0].hand);
    if (digest(g) !== digest(snap)) return resync('digest', JSON.stringify([ev, digest(g), digest(snap)]));
    g.version = version; g.pending = false;
    return mode === 'mine' ? { mode, rekeys } : { mode, result, rekeys };
  }

  // transport: { call(body) -> Promise<{status, body}>, view(code) -> Promise<{version, view}|null> }
  class Client {
    constructor(transport) { this.t = transport; this.code = null; this.version = 0; this.view = null; }
    async _do(body) { const r = await this.t.call(body); if (r.status !== 200) throw new Error(r.body && r.body.error || 'Something went wrong'); return r.body; }
    profile(name, avatar) { return this._do({ op: 'profile', name, avatar }); }
    async create(rules, max) { const r = await this._do({ op: 'create', rules, max }); this.code = r.code; return r.code; }
    async join(code) { const r = await this._do({ op: 'join', code }); this.code = r.code; return r.code; }
    leave() { return this._do({ op: 'leave', code: this.code }); }
    start() { return this._do({ op: 'start', code: this.code }); }
    act(action) { return this._do({ op: 'act', code: this.code, action }); }
    propose(change) { return this._do({ op: 'propose', code: this.code, change }); }
    vote(choice) { return this._do({ op: 'vote', code: this.code, choice }); }
    cancelVote() { return this._do({ op: 'cancel', code: this.code }); }
    tick() { return this._do({ op: 'tick', code: this.code }); }
    react(text) { return this._do({ op: 'react', code: this.code, text }); }
    // Fetch my latest view. Returns the game if it changed since last time, else null.
    async refresh() {
      const r = await this.t.view(this.code);
      if (!r || r.version <= this.version) return null;
      this.version = r.version; this.view = r.view;
      return Object.assign(fromView(r.view), { version: r.version });
    }
    get myTurn() { return !!this.view && this.view.phase === 'play' && this.view.turn === this.view.me; }
  }

  const api = { fromView, rotate, hiddenCard, Client, reconcile, revealMine, digest };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Online = api;
})(typeof window !== 'undefined' ? window : globalThis);

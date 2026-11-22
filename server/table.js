'use strict';
// The server's view of a table: build a game, hide what a seat must not see, apply one action.
// Pure and transport free. It uses the same engine file as the solo game, so the rules can never drift apart.
const Shed = require('../src/engine.js');
const Presets = require('../src/presets.js');

// Rules arrive from a player's phone, so they are rebuilt from nothing through the same checks a vote uses.
// Throws if they clash. Returns the full, normalised house-rule options.
function cleanRules(o) {
  const r = Presets.decode(Presets.encode(o || {}));
  if (!r.ok) throw new Error(r.error);
  return r.opts;
}

function createTable({ rules, seed, players }) {
  const g = Shed.newGame({ rules, seed, players: players.length, names: players.map(p => p.name), humans: players.map(() => true) });
  g.seats = players.map(p => p.id);
  delete g.rng;
  return g;
}

const seatOf = (g, userId) => g.seats.indexOf(userId);

// What one seat is allowed to know. Other hands and every face-down card are replaced by nulls.
function projectView(g, pi) {
  const hid = n => Array.from({ length: n }, () => null);
  return {
    phase: g.phase, turn: g.turn, me: pi, rules: g.rules, seats: g.seats, dir: g.dir,
    players: g.players.map((p, i) => ({
      id: p.id, name: p.name, out: p.out, ready: p.ready,
      hand: i === pi ? p.hand : hid(p.hand.length),
      up: p.up, down: hid(p.down.length),
      myDown: i === pi ? p.down.map(c => c.id) : undefined,
      // face-down cards this seat has turned over for itself (face-down follow-up). Only its owner gets the faces.
      myKnown: i === pi && p.known && p.known.length ? p.down.filter(c => p.known.includes(c.id)) : undefined,
    })),
    drawCount: g.draw.length, pile: g.pile, burnedCount: g.burned.length,
    winner: g.winner, loser: g.loser, finished: g.finished, stalemate: !!g.stalemate, lastEvent: g.lastEvent || null,
    follow: g.follow ? { pi: g.follow.pi, rank: g.follow.rank, count: g.follow.count, last: g.follow.last } : null,
  };
}

const isId = v => Number.isInteger(v) && v >= 0 && v < 1000;

// One action from one user. Returns the engine's result, or { ok: false, err }.
function applyAction(g, userId, a) {
  const pi = seatOf(g, userId);
  if (pi < 0) return { ok: false, err: 'not at this table' };
  if (g.phase === 'over') return { ok: false, err: 'game over' };
  switch (a && a.type) {
    case 'swap': {
      if (g.phase !== 'swap') return { ok: false, err: 'not swapping' };
      if (g.players[pi].ready) return { ok: false, err: 'already locked in' };
      if (!isId(a.hand) || !isId(a.up)) return { ok: false, err: 'bad swap' };
      return Shed.swap(g, pi, a.hand, a.up) ? { ok: true } : { ok: false, err: 'bad swap' };
    }
    case 'ready': {
      if (g.phase !== 'swap') return { ok: false, err: 'not swapping' };
      g.players[pi].ready = true;
      if (g.players.every(p => p.ready)) Shed.startPlay(g);
      return { ok: true, started: g.phase === 'play' };
    }
    case 'play': {
      if (!Array.isArray(a.ids) || a.ids.length < 1 || a.ids.length > 4 || !a.ids.every(isId) || new Set(a.ids).size !== a.ids.length) return { ok: false, err: 'bad cards' };
      return Shed.play(g, pi, a.ids);
    }
    case 'blind': return isId(a.id) ? Shed.playBlind(g, pi, a.id) : { ok: false, err: 'bad card' };
    case 'done': return Shed.followDone(g, pi);
    case 'pickup': return Shed.pickUp(g, pi);
    default: return { ok: false, err: 'unknown action' };
  }
}

module.exports = { cleanRules, createTable, projectView, applyAction, seatOf };

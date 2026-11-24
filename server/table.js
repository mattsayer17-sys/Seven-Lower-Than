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
  const g = Shed.newGame({ rules, seed, players: players.length, names: players.map(p => p.name), humans: players.map(p => !p.bot) });
  g.seats = players.map(p => p.id);
  g.bots = players.map((p, i) => (p.bot ? i : -1)).filter(i => i >= 0); // seats the computer plays
  g.left = [];        // seats whose player left or timed out too often; the computer plays them, they finish last
  g.timeouts = {};    // seat -> turns the computer had to take for an idle player
  g.seed = seed;
  delete g.rng;
  // the computer locks in its own swaps straight away
  for (const i of g.bots) { Shed.cpuSwap(g, i); g.players[i].ready = true; }
  return g;
}

// Whose move the server is waiting for: the seat that must act now, or null.
function actor(g) {
  if (g.phase === 'swap') { const i = g.players.findIndex(p => !p.ready); return i < 0 ? null : i; }
  if (g.phase !== 'play') return null;
  return g.follow ? g.follow.pi : g.turn;
}
const isBot = (g, i) => (g.bots || []).includes(i) || (g.left || []).includes(i);

// One move by the computer for seat `pi` (a bot, a player who left, or an idle player). Uses a seed per move so the
// stored game needs no random state. Returns the engine's result.
function cpuMove(g, pi) {
  let n = 0;
  g.rng = Shed.mulberry32(((g.seed | 0) + g.turns * 7919 + pi * 104729 + (g.pile.length + 1) * 31) >>> 0);
  try {
    if (g.phase === 'swap') {
      Shed.cpuSwap(g, pi);
      g.players[pi].ready = true;
      if (g.players.every(p => p.ready)) Shed.startPlay(g);
      return { ok: true };
    }
    let r = Shed.cpuTurn(g, pi);
    // never get stuck: anything refused becomes Done or a pick-up
    while (!r.ok && n++ < 3) r = g.follow && g.follow.pi === pi ? Shed.followDone(g, pi) : Shed.pickUp(g, pi, true);
    return r;
  } finally { delete g.rng; }
}

// Final places, leavers last (in the order they left), for the results table.
function places(g) {
  const left = g.left || [];
  const order = g.finished.filter(i => !left.includes(i)).concat(left.filter(i => g.finished.includes(i)));
  for (const i of g.players.keys()) if (!order.includes(i)) order.push(i);
  return order;
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
    bots: g.bots || [], left: g.left || [],
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
  if ((g.left || []).includes(pi)) return { ok: false, err: 'you left this game' };
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

module.exports = { cleanRules, createTable, projectView, applyAction, seatOf, actor, isBot, cpuMove, places };

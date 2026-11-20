'use strict';
// Everything the edge function does, minus the web plumbing. `db` is a Supabase-style client (service role).
// handle() returns { status, body }. The same code runs under test against an in-memory db.
const Shed = require('../src/engine.js');
const T = require('./table.js');
const Room = require('../src/room.js');
const Presets = require('../src/presets.js');
const Names = require('../src/names.js');
const Reactions = require('../src/reactions.js');

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const cleanName = n => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20);
const reply = (body, status = 200) => ({ status, body });

// House rule votes before the game starts. The same Room reducer solo play uses, run here with the server's clock.
// Each write is checked against `rev`, so two people voting at the same instant cannot overwrite each other.
async function roomAct(db, table, seats, uid, action) {
  const pr = await db.from('shed_profiles').select('id,name').in('id', seats.map(x => x.user_id));
  const nm = Object.fromEntries((pr.data || []).map(x => [x.id, x.name]));
  const room = Room.createRoom({ hostId: table.host, players: seats.map(x => ({ id: x.user_id, name: nm[x.user_id] || 'Player' })), opts: table.rules });
  room.vote = table.vote || null;
  room.voteSeq = table.vote_seq || 0;
  const now = Date.now();
  let r = Room.reduce(room, { type: 'tick' }, now), state = r.state, events = r.events;
  let rejected = null;
  if (action) {
    r = Room.reduce(state, Object.assign({}, action, { by: uid }), now);
    state = r.state;
    rejected = r.events.find(e => e.type === 'rejected') || null;
    events = events.concat(r.events);
  }
  const result = events.filter(e => e.type === 'result').pop();
  const opts = Presets.normalise(state.opts);
  const changed = JSON.stringify([opts, state.vote, state.voteSeq]) !== JSON.stringify([Presets.normalise(table.rules), table.vote || null, table.vote_seq || 0]);
  let next = table;
  if (changed) {
    const patch = { rules: opts, vote: state.vote, vote_seq: state.voteSeq, note: result ? result.text : table.note || '', rev: (table.rev || 0) + 1 };
    const up = await db.from('shed_tables').update(patch).eq('code', table.code).eq('rev', table.rev || 0).select('code');
    if (!up.data || !up.data.length) return { status: 409, body: { error: 'Out of date, try again' } };
    next = Object.assign({}, table, patch);
  }
  if (rejected) return { status: 400, body: { error: rejected.reason.charAt(0).toUpperCase() + rejected.reason.slice(1) }, table: next };
  return { status: 200, body: { ok: true }, table: next };
}

async function handle(db, uid, b) {
  b = b || {};
  if (b.name !== undefined) {
    const nc = Names.check(cleanName(b.name));
    if (!nc.ok) return reply({ error: nc.error }, 400);
    const name = nc.name;
    const { error } = await db.from('shed_profiles').upsert({ id: uid, name, avatar: String(b.avatar || '🦊').slice(0, 4) });
    if (error) return reply({ error: error.message }, 400);
  }
  const prof = await db.from('shed_profiles').select('id,name').eq('id', uid).maybeSingle();
  if (!prof.data) return reply({ error: 'Pick a name first' }, 400);
  if (b.op === 'profile') return reply({ ok: true });

  if (b.op === 'create') {
    let opts;
    try { opts = T.cleanRules(b.rules); } catch (e) { return reply({ error: 'Those rules clash: ' + e.message }, 400); }
    const max = Math.min(5, Math.max(2, b.max | 0 || 5));
    for (let i = 0; i < 8; i++) {
      const code = newCode();
      const ins = await db.from('shed_tables').insert({ code, host: uid, rules: opts, max_players: max });
      if (ins.error) { if (ins.error.code === '23505') continue; return reply({ error: ins.error.message }, 400); }
      await db.from('shed_seats').insert({ code, user_id: uid, seat: 0 });
      return reply({ ok: true, code });
    }
    return reply({ error: 'Try again' }, 500);
  }

  const code = String(b.code || '').toUpperCase().trim();
  const tb = await db.from('shed_tables').select('*').eq('code', code).maybeSingle();
  if (!tb.data) return reply({ error: 'No table with that code' }, 404);
  const table = tb.data;
  const seatsQ = await db.from('shed_seats').select('user_id,seat').eq('code', code).order('seat');
  const seats = seatsQ.data || [];

  if (b.op === 'join') {
    if (seats.some(s => s.user_id === uid)) return reply({ ok: true, code });
    if (table.status !== 'lobby') return reply({ error: 'That game has already started' }, 409);
    if (seats.length >= table.max_players) return reply({ error: 'That table is full' }, 409);
    const next = seats.reduce((m, s) => Math.max(m, s.seat), -1) + 1;
    const ins = await db.from('shed_seats').insert({ code, user_id: uid, seat: next });
    if (ins.error) return reply({ error: 'Someone joined at the same moment, try again' }, 409);
    return reply({ ok: true, code });
  }

  if (b.op === 'propose' || b.op === 'vote' || b.op === 'cancel' || b.op === 'tick') {
    if (table.status !== 'lobby') return reply({ error: 'The game has started' }, 409);
    if (!seats.some(x => x.user_id === uid)) return reply({ error: 'You are not at this table' }, 403);
    let action = null;
    if (b.op === 'propose') {
      if (!b.change || typeof b.change !== 'object' || Array.isArray(b.change)) return reply({ error: 'Not a change' }, 400);
      action = { type: 'propose', change: b.change };
    } else if (b.op === 'vote') {
      if (b.choice !== 'yes' && b.choice !== 'no') return reply({ error: 'Vote yes or no' }, 400);
      action = { type: 'vote', choice: b.choice };
    } else if (b.op === 'cancel') action = { type: 'cancel' };
    const r = await roomAct(db, table, seats, uid, action);
    return reply(r.body, r.status);
  }

  // A quick reaction at the table. Only the fixed list, one per player every GAP_MS, only by someone seated.
  // Readers get them straight from shed_chat, where the read policy already hides anyone they have blocked.
  if (b.op === 'react') {
    if (!seats.some(x => x.user_id === uid)) return reply({ error: 'You are not at this table' }, 403);
    if (!Reactions.allowed(b.text)) return reply({ error: 'Pick one of the reactions' }, 400);
    const last = await db.from('shed_chat').select('created_at').eq('code', code).eq('user_id', uid).order('id', { ascending: false }).limit(1);
    const at = last.data && last.data[0] && Date.parse(last.data[0].created_at);
    if (at && Date.now() - at < Reactions.GAP_MS) return reply({ error: 'Slow down' }, 429);
    const ins = await db.from('shed_chat').insert({ code, user_id: uid, body: b.text });
    if (ins.error) return reply({ error: ins.error.message }, 400);
    return reply({ ok: true });
  }

  if (b.op === 'leave') {
    if (table.status !== 'lobby') return reply({ error: 'Game in progress' }, 409);
    if (table.host === uid) await db.from('shed_tables').delete().eq('code', code);
    else {
      if (table.vote) await roomAct(db, table, seats, uid, { type: 'leave' });
      await db.from('shed_seats').delete().eq('code', code).eq('user_id', uid);
    }
    return reply({ ok: true });
  }

  if (b.op === 'start') {
    if (table.host !== uid) return reply({ error: 'Only the host can start' }, 403);
    if (table.status !== 'lobby') return reply({ error: 'Already started' }, 409);
    if (seats.length < 2) return reply({ error: 'Need at least 2 players' }, 409);
    let startTable = table;
    if (table.vote) {
      const r = await roomAct(db, table, seats, uid, null);
      if (r.status !== 200) return reply(r.body, r.status);
      startTable = r.table;
      if (startTable.vote) return reply({ error: 'Finish the vote first' }, 409);
    }
    const ids = seats.map(s => s.user_id);
    const pr = await db.from('shed_profiles').select('id,name').in('id', ids);
    const nameOf = Object.fromEntries((pr.data || []).map(p => [p.id, p.name]));
    const rules = Shed.makeRuleset(startTable.rules);
    const g = T.createTable({ rules, seed: (Math.random() * 2 ** 31) | 0, players: ids.map(id => ({ id, name: nameOf[id] || 'Player' })) });
    const up = await db.from('shed_tables').update({ status: 'playing' }).eq('code', code).eq('status', 'lobby').eq('rev', startTable.rev || 0).select('code');
    if (!up.data || !up.data.length) return reply({ error: 'Already started' }, 409);
    await db.from('shed_games').upsert({ code, state: g, version: 1 });
    await db.from('shed_views').upsert(ids.map(id => ({ code, user_id: id, view: T.projectView(g, T.seatOf(g, id)), version: 1 })));
    return reply({ ok: true });
  }

  if (b.op === 'act') {
    if (table.status !== 'playing') return reply({ error: 'Game is not running' }, 409);
    const gr = await db.from('shed_games').select('state,version').eq('code', code).maybeSingle();
    if (!gr.data) return reply({ error: 'No game' }, 404);
    const g = gr.data.state;
    const r = T.applyAction(g, uid, b.action);
    if (!r.ok) return reply({ error: r.err || 'Not allowed' }, 400);
    const version = gr.data.version + 1;
    const up = await db.from('shed_games').update({ state: g, version }).eq('code', code).eq('version', gr.data.version).select('code');
    if (!up.data || !up.data.length) return reply({ error: 'Out of date, try again' }, 409);
    await db.from('shed_views').upsert(g.seats.map((id, i) => ({ code, user_id: id, view: T.projectView(g, i), version })));
    if (g.phase === 'over') {
      await db.from('shed_tables').update({ status: 'over' }).eq('code', code);
      await db.from('shed_results').upsert(g.finished.map((pi, k) => ({ code, user_id: g.seats[pi], place: k + 1, players: g.seats.length })));
    }
    return reply({ ok: true });
  }
  return reply({ error: 'Unknown request' }, 400);
}

module.exports = { handle, cleanName };

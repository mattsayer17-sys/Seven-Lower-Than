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
const H2H_GAMES = 1000; // most recent games counted for head to head

// Abuse and cost limits. Fixed windows counted in the database (shed_hit), so they hold across edge function instances.
const LIMITS = {
  user: [120, 60],      // any request: 120 a minute per user (a fast game is well under 40)
  ip: [600, 60],        // any request: 600 a minute per network (a family on one wifi still fits)
  create: [20, 3600],   // new tables and rematches: 20 an hour per user
  join: [60, 3600],     // sitting down: 60 an hour per user
  report: [10, 3600],   // reports: 10 an hour per user
};
const REPORT_REASONS = ['name', 'behaviour', 'cheating', 'other'];
const MAX_HOSTING = 3;  // tables in the lobby or playing that one user hosts
const MAX_SEATED = 8;   // unfinished tables one user sits at
async function over(db, key, [n, secs]) {
  if (!db.rpc) return false;
  const r = await db.rpc('shed_hit', { p_key: key, p_limit: n, p_window: secs });
  return r.data === false; // a database hiccup lets the request through rather than lock everyone out
}
async function openCounts(db, uid) {
  const hosting = ((await db.from('shed_tables').select('code,status').eq('host', uid)).data || []).filter(t => t.status !== 'over').length;
  const seated = (await db.from('shed_seats').select('code').eq('user_id', uid)).data || [];
  const tabs = seated.length ? (await db.from('shed_tables').select('code,status').in('code', seated.map(s => s.code))).data || [] : [];
  return { hosting, seated: tabs.filter(t => t.status !== 'over').length };
}

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

async function handle(db, uid, b, ip) {
  b = b || {};
  if (await over(db, 'u:' + uid, LIMITS.user)) return reply({ error: 'Slow down a little' }, 429);
  if (ip && await over(db, 'ip:' + ip, LIMITS.ip)) return reply({ error: 'Too many requests from this network' }, 429);
  // Delete my account and everything that is mine (App Store 5.1.1(v)). Works with or without a name.
  // Any game I am still in is ended for the others first, so nobody is left waiting on a seat that no longer exists.
  if (b.op === 'delete_me') {
    if (b.confirm !== 'DELETE') return reply({ error: 'Confirm first' }, 400);
    const seated = (await db.from('shed_seats').select('code').eq('user_id', uid)).data || [];
    if (seated.length) await db.from('shed_tables').update({ status: 'over' }).in('code', seated.map(s => s.code)).eq('status', 'playing');
    await db.from('shed_tables').delete().eq('host', uid).eq('status', 'lobby');
    const del = await db.auth.admin.deleteUser(uid);
    if (del && del.error) return reply({ error: 'Could not delete, try again' }, 500);
    return reply({ ok: true });
  }
  if (b.name !== undefined) {
    const nc = Names.check(cleanName(b.name));
    if (!nc.ok) return reply({ error: nc.error }, 400);
    const name = nc.name;
    const { error } = await db.from('shed_profiles').upsert({ id: uid, name, avatar: String(b.avatar || '🦊').slice(0, 4) });
    if (error) return reply({ error: error.message }, 400);
  }
  // What an invite link shows before you sit down: whose table, how full, the rules. Needs no name yet.
  if (b.op === 'peek') {
    const code = String(b.code || '').toUpperCase().trim();
    const t = (await db.from('shed_tables').select('host,status,rules,max_players').eq('code', code).maybeSingle()).data;
    if (!t) return reply({ error: 'No table with that code' }, 404);
    const seats = (await db.from('shed_seats').select('user_id').eq('code', code)).data || [];
    const host = (await db.from('shed_profiles').select('name').eq('id', t.host).maybeSingle()).data;
    return reply({ host: host ? host.name : 'A friend', seated: seats.length, max: t.max_players, status: t.status, rules: t.rules, mine: seats.some(x => x.user_id === uid) });
  }
  // Head to head against the people I have played online, worked out from the results table so every phone shows the same
  // score. For each opponent: games together, my wins (I finished ahead), losses, and Rock Bottom both ways (last place).
  if (b.op === 'h2h') {
    const others = [...new Set((Array.isArray(b.with) ? b.with : []).map(String))].filter(x => x && x !== uid && /^[\w-]{1,64}$/.test(x)).slice(0, 20);
    const out = {};
    if (!others.length) return reply({ ok: true, h2h: out });
    const mine = (await db.from('shed_results').select('code,place,players').eq('user_id', uid).order('finished_at', { ascending: false }).limit(H2H_GAMES)).data || [];
    if (!mine.length) return reply({ ok: true, h2h: out });
    const me = Object.fromEntries(mine.map(r => [r.code, r]));
    const theirs = (await db.from('shed_results').select('code,user_id,place').in('user_id', others).in('code', mine.map(r => r.code))).data || [];
    for (const r of theirs) {
      const m = me[r.code];
      if (!m) continue;
      const h = out[r.user_id] = out[r.user_id] || { n: 0, w: 0, l: 0, meRb: 0, theyRb: 0 };
      h.n++;
      if (m.place < r.place) h.w++; else h.l++;
      if (m.place === m.players) h.meRb++;
      if (r.place === m.players) h.theyRb++;
    }
    return reply({ ok: true, h2h: out });
  }
  const prof = await db.from('shed_profiles').select('id,name').eq('id', uid).maybeSingle();
  if (!prof.data) return reply({ error: 'Pick a name first' }, 400);
  if (b.op === 'profile') return reply({ ok: true });

  // Block or unblock a player: their reactions are hidden from me and they can't sit at tables I host.
  // Report a player for their name or behaviour at a table. Both are checked here (App Store 1.2).
  if (b.op === 'block' || b.op === 'unblock' || b.op === 'report') {
    const who = String(b.user || '');
    if (!/^[\w-]{1,64}$/.test(who) || who === uid) return reply({ error: 'Pick a player' }, 400);
    const target = (await db.from('shed_profiles').select('id,name').eq('id', who).maybeSingle()).data;
    if (!target) return reply({ error: 'That player has gone' }, 404);
    if (b.op === 'unblock') { await db.from('shed_blocks').delete().eq('blocker', uid).eq('blocked', who); return reply({ ok: true }); }
    if (b.op === 'block') { await db.from('shed_blocks').upsert({ blocker: uid, blocked: who }); return reply({ ok: true }); }
    if (!REPORT_REASONS.includes(b.reason)) return reply({ error: 'Pick a reason' }, 400);
    if (await over(db, 'r:' + uid, LIMITS.report)) return reply({ error: 'Thanks, we have your reports. Try again later' }, 429);
    const ins = await db.from('shed_reports').insert({ reporter: uid, target: who, code: String(b.code || '').toUpperCase().slice(0, 8) || null, reason: b.reason, name_seen: target.name });
    if (ins.error) return reply({ error: 'Could not send, try again' }, 500);
    if (b.block) await db.from('shed_blocks').upsert({ blocker: uid, blocked: who });
    return reply({ ok: true });
  }

  if (b.op === 'create') {
    if (await over(db, 'c:' + uid, LIMITS.create)) return reply({ error: 'That is a lot of new tables, try again later' }, 429);
    const oc = await openCounts(db, uid);
    if (oc.hosting >= MAX_HOSTING) return reply({ error: 'You already have ' + MAX_HOSTING + ' tables open. Finish or leave one first' }, 409);
    if (oc.seated >= MAX_SEATED) return reply({ error: 'You are at too many tables. Finish or leave one first' }, 409);
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
    if (await over(db, 'j:' + uid, LIMITS.join)) return reply({ error: 'Too many tables joined, try again later' }, 429);
    if (table.host && (await db.from('shed_blocks').select('blocker').eq('blocker', table.host).eq('blocked', uid)).data.length) return reply({ error: "You can't join that table" }, 403);
    if ((await openCounts(db, uid)).seated >= MAX_SEATED) return reply({ error: 'You are at too many tables. Finish or leave one first' }, 409);
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

  // Rematch: once a game is over, the first player to ask opens a new table with the same rules and the old one points to it.
  // Anyone else who asks is seated at that same new table, so a rematch is one tap for everybody.
  if (b.op === 'rematch') {
    if (table.status !== 'over') return reply({ error: 'The game is still going' }, 409);
    if (!seats.some(x => x.user_id === uid)) return reply({ error: 'You are not at this table' }, 403);
    const sitAt = async next => {
      const ns = (await db.from('shed_seats').select('user_id,seat').eq('code', next)).data || [];
      if (ns.some(s => s.user_id === uid)) return reply({ ok: true, code: next, made: false });
      const nt = (await db.from('shed_tables').select('status,max_players').eq('code', next).maybeSingle()).data;
      if (!nt || nt.status !== 'lobby') return reply({ error: 'That rematch has already started' }, 409);
      if (ns.length >= nt.max_players) return reply({ error: 'That table is full' }, 409);
      const ins = await db.from('shed_seats').insert({ code: next, user_id: uid, seat: ns.reduce((m, s) => Math.max(m, s.seat), -1) + 1 });
      return ins.error ? reply({ error: 'Someone joined at the same moment, try again' }, 409) : reply({ ok: true, code: next, made: false });
    };
    if (table.next_code) return sitAt(table.next_code);
    if (await over(db, 'c:' + uid, LIMITS.create)) return reply({ error: 'That is a lot of new tables, try again later' }, 429);
    for (let i = 0; i < 8; i++) {
      const code2 = newCode();
      const ins = await db.from('shed_tables').insert({ code: code2, host: uid, rules: table.rules, max_players: table.max_players });
      if (ins.error) { if (ins.error.code === '23505') continue; return reply({ error: ins.error.message }, 400); }
      await db.from('shed_seats').insert({ code: code2, user_id: uid, seat: 0 });
      // only one rematch per table: if someone else got there first, drop mine and sit at theirs
      const up = await db.from('shed_tables').update({ next_code: code2 }).eq('code', code).is('next_code', null).select('code');
      if (up.data && up.data.length) return reply({ ok: true, code: code2, made: true });
      await db.from('shed_tables').delete().eq('code', code2);
      const again = (await db.from('shed_tables').select('next_code').eq('code', code).maybeSingle()).data;
      return again && again.next_code ? sitAt(again.next_code) : reply({ error: 'Try again' }, 409);
    }
    return reply({ error: 'Try again' }, 500);
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
    const up = await db.from('shed_games').update({ state: g, version, updated_at: new Date().toISOString() }).eq('code', code).eq('version', gr.data.version).select('code');
    if (!up.data || !up.data.length) return reply({ error: 'Out of date, try again' }, 409);
    // Results go in before the views, so by the time a phone sees the game is over its head to head already counts it.
    if (g.phase === 'over') await db.from('shed_results').upsert(g.finished.map((pi, k) => ({ code, user_id: g.seats[pi], place: k + 1, players: g.seats.length })));
    await db.from('shed_views').upsert(g.seats.map((id, i) => ({ code, user_id: id, view: T.projectView(g, i), version })));
    if (g.phase === 'over') await db.from('shed_tables').update({ status: 'over' }).eq('code', code);
    return reply({ ok: true });
  }
  return reply({ error: 'Unknown request' }, 400);
}

module.exports = { handle, cleanName, REPORT_REASONS, LIMITS, MAX_HOSTING, MAX_SEATED };

'use strict';
// A tiny in-memory stand-in for the Supabase client: only the calls the handler makes. Used by tests and the local preview.
const PK = { shed_push: ['token'], shed_blocks: ['blocker', 'blocked'], shed_reports: ['id'], shed_profiles: ['id'], shed_tables: ['code'], shed_seats: ['code', 'user_id'], shed_games: ['code'], shed_views: ['code', 'user_id'], shed_results: ['code', 'user_id'], shed_chat: ['id'] };
const clone = v => JSON.parse(JSON.stringify(v));
class Q {
  constructor(db, name) { this.db = db; this.name = name; this.f = []; this.op = 'select'; this.ret = false; this.one = false; this.ord = null; this.desc = false; this.lim = null; }
  select() { if (this.op === 'update') this.ret = true; return this; }
  eq(c, v) { this.f.push(r => r[c] === v); return this; }
  is(c, v) { this.f.push(r => (r[c] === undefined ? null : r[c]) === v); return this; }
  in(c, a) { this.f.push(r => a.includes(r[c])); return this; }
  order(c, o) { this.ord = c; this.desc = !!(o && o.ascending === false); return this; }
  limit(n) { this.lim = n; return this; }
  maybeSingle() { this.one = true; return this; }
  insert(row) { this.op = 'insert'; this.row = row; return this; }
  upsert(rows) { this.op = 'upsert'; this.row = rows; return this; }
  update(p) { this.op = 'update'; this.patch = p; return this; }
  delete() { this.op = 'delete'; return this; }
  then(res, rej) { return Promise.resolve(this.run()).then(res, rej); }
  run() {
    const rows = this.db.t[this.name];
    const pk = PK[this.name];
    const match = r => this.f.every(fn => fn(r));
    const same = (a, b) => pk.every(k => a[k] === b[k]);
    if (this.op === 'select') {
      let out = rows.filter(match).map(clone);
      if (this.ord) out.sort((a, b) => (a[this.ord] - b[this.ord]) * (this.desc ? -1 : 1));
      if (this.lim != null) out = out.slice(0, this.lim);
      return { data: this.one ? out[0] || null : out, error: null };
    }
    if (this.op === 'insert') {
      const r = clone(this.row);
      if (this.name === 'shed_tables') { if (r.status === undefined) r.status = 'lobby'; Object.assign(r, { vote: null, vote_seq: 0, note: '', rev: 0 }); }
      if (this.name === 'shed_reports') { this.db.repId = (this.db.repId || 0) + 1; r.id = this.db.repId; }
      if (this.name === 'shed_chat') { this.db.chatId = (this.db.chatId || 0) + 1; Object.assign(r, { id: this.db.chatId, created_at: new Date(this.db.now ? this.db.now() : Date.now()).toISOString() }); }
      if (rows.some(x => same(x, r))) return { data: null, error: { code: '23505', message: 'duplicate' } };
      rows.push(r);
      return { data: null, error: null };
    }
    if (this.op === 'upsert') {
      for (const r of [].concat(clone(this.row))) { const i = rows.findIndex(x => same(x, r)); if (i >= 0) rows[i] = Object.assign({}, rows[i], r); else rows.push(r); }
      return { data: null, error: null };
    }
    if (this.op === 'update') {
      const hit = rows.filter(match);
      hit.forEach(r => Object.assign(r, clone(this.patch)));
      return { data: this.ret ? hit.map(clone) : null, error: null };
    }
    if (this.op === 'delete') {
      const keep = rows.filter(r => !match(r));
      this.db.t[this.name] = keep;
      if (this.name === 'shed_tables') for (const n of ['shed_seats', 'shed_games', 'shed_views', 'shed_chat']) this.db.t[n] = this.db.t[n].filter(r => this.db.t.shed_tables.some(t => t.code === r.code));
      return { data: null, error: null };
    }
  }
}
class FakeDb {
  constructor() {
    this.t = { shed_profiles: [], shed_tables: [], shed_seats: [], shed_games: [], shed_views: [], shed_results: [], shed_chat: [], shed_blocks: [], shed_reports: [], shed_push: [] };
    this.hits = {};
    this.deleted = [];
    // auth.admin.deleteUser, with the cascades the real foreign keys make
    this.auth = { admin: { deleteUser: async uid => {
      this.deleted.push(uid);
      const t = this.t;
      t.shed_profiles = t.shed_profiles.filter(r => r.id !== uid);
      for (const n of ['shed_seats', 'shed_views', 'shed_results', 'shed_chat', 'shed_push']) t[n] = t[n].filter(r => r.user_id !== uid);
      t.shed_blocks = t.shed_blocks.filter(r => r.blocker !== uid && r.blocked !== uid);
      t.shed_reports = t.shed_reports.filter(r => r.reporter !== uid);
      t.shed_tables.forEach(r => { if (r.host === uid) r.host = null; });
      return { error: null };
    } } };
  }
  from(n) { return new Q(this, n); }
  // shed_hit: fixed-window counter. Off unless db.limitsOn, since tests play whole games in a few milliseconds.
  async rpc(fn, a) {
    if (fn !== 'shed_hit') return { data: null, error: { message: 'unknown rpc' } };
    if (!this.limitsOn) return { data: true, error: null };
    const now = this.now ? this.now() : Date.now();
    const k = a.p_key + '@' + Math.floor(now / 1000 / a.p_window);
    this.hits[k] = (this.hits[k] || 0) + 1;
    return { data: this.hits[k] <= a.p_limit, error: null };
  }
}
// What a lobby screen needs to know about a table.
function lobbyOf(db, code) {
  const t = db.t.shed_tables.find(x => x.code === code);
  if (!t) return null;
  const seats = db.t.shed_seats.filter(x => x.code === code).sort((a, b) => a.seat - b.seat);
  const name = id => (db.t.shed_profiles.find(p => p.id === id) || {}).name || 'Player';
  return { status: t.status, host: t.host, rules: t.rules, max: t.max_players, vote: t.vote || null, note: t.note || '', next: t.next_code || null, seats: seats.map(s => ({ id: s.user_id, name: name(s.user_id) })) };
}
// The tables a user is seated at that are not finished.
function mineOf(db, uid) {
  return db.t.shed_seats.filter(s => s.user_id === uid).map(s => {
    const t = db.t.shed_tables.find(x => x.code === s.code);
    const v = db.t.shed_views.find(x => x.code === s.code && x.user_id === uid);
    return t && t.status !== 'over' ? { code: s.code, status: t.status, myTurn: !!v && v.view.phase === 'play' && v.view.turn === v.view.me, swapping: !!v && v.view.phase === 'swap' } : null;
  }).filter(Boolean).sort((a, b) => (b.myTurn - a.myTurn) || (a.code < b.code ? -1 : 1));
}
// Reactions at a table after a given id, as the read policy would return them to `uid` (blocks are not modelled).
function chatOf(db, code, after) {
  return db.t.shed_chat.filter(c => c.code === code && c.id > (after || 0)).sort((a, b) => a.id - b.id).map(c => ({ id: c.id, user_id: c.user_id, body: c.body }));
}
module.exports = { FakeDb, lobbyOf, mineOf, chatOf };

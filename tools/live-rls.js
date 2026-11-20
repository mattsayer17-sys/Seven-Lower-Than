'use strict';
// Checks that, on the live project, a player cannot read other seats' views or the raw game, and cannot write to the tables.
const Net = require('../src/net.js');
const Online = require('../src/online.js');
const cfg = { url: process.env.MS_URL || 'https://fmgyzabdkityfyakmqhg.supabase.co', key: process.env.MS_KEY || 'sb_publishable_i67wYdkcK7HxkGIBnCHbjw_-6ry88QV' };
(async () => {
  const mk = async (n) => { const t = Net.supabaseTransport(cfg); const c = new Online.Client(t); await c.profile(n); return { t, c }; };
  const a = await mk('A'), b = await mk('B'), spy = await mk('Spy');
  const code = await a.c.create({}, 4); await b.c.join(code); await a.c.start();
  const tok = async (x) => { await x.t.view(code); return JSON.parse(x.t.session ? '{}' : '{}'); };
  // raw REST with each user's own token, through the transport's session
  const get = async (x, path) => { const r = await fetch(cfg.url + '/rest/v1/' + path, { headers: { apikey: cfg.key, Authorization: 'Bearer ' + x.t.token } }); return { s: r.status, j: await r.json().catch(() => null) }; };
  const out = [];
  const ok = (name, cond) => { out.push((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) process.exitCode = 1; };
  const v1 = await get(spy, 'shed_views?code=eq.' + code + '&select=user_id,view');
  ok('a stranger sees no views', Array.isArray(v1.j) && v1.j.length === 0);
  const v2 = await get(a, 'shed_views?code=eq.' + code + '&select=user_id,view');
  ok('a player sees only their own view', Array.isArray(v2.j) && v2.j.length === 1 && v2.j[0].user_id === a.t.uid);
  const g = await get(a, 'shed_games?select=state');
  ok('raw game state is not readable', !Array.isArray(g.j) || g.j.length === 0);
  const w = await fetch(cfg.url + '/rest/v1/shed_views?code=eq.' + code, { method: 'PATCH', headers: { apikey: cfg.key, Authorization: 'Bearer ' + a.t.token, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ version: 999 }) });
  const wj = await w.json().catch(() => null);
  ok('a player cannot edit their view', !(Array.isArray(wj) && wj.length));
  const w2 = await fetch(cfg.url + '/rest/v1/shed_tables?code=eq.' + code, { method: 'PATCH', headers: { apikey: cfg.key, Authorization: 'Bearer ' + a.t.token, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ status: 'over' }) });
  const w2j = await w2.json().catch(() => null);
  ok('a player cannot edit the table', !(Array.isArray(w2j) && w2j.length));
  const w3 = await fetch(cfg.url + '/rest/v1/shed_seats', { method: 'POST', headers: { apikey: cfg.key, Authorization: 'Bearer ' + spy.t.token, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ code, user_id: spy.t.uid, seat: 3 }) });
  ok('a stranger cannot seat themselves', w3.status >= 400);
  const j = await spy.c.join(code).then(() => 'joined', e => e.message);
  ok('a stranger cannot join a running game', /started/.test(j));
  const act = await spy.c.act({ type: 'ready' }).then(() => 'acted', e => e.message);
  ok('a stranger cannot act', act !== 'acted');
  const mine = await a.t.mine();
  ok('Your tables lists this table with whose turn it is', mine.length === 1 && mine[0].code === code && typeof mine[0].myTurn === 'boolean' && mine[0].swapping === true);
  ok('a stranger has no tables', (await spy.t.mine()).length === 0);
  console.log(out.join('\n')); console.log('USERS ' + [a, b, spy].map(x => x.t.uid).join(',') + '\nCODES ' + code);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });

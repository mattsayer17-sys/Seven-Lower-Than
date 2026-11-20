'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Net = require('../src/net.js');
const cfg = { url: 'https://x.supabase.co/', key: 'pub' };

function fakeFetch(script) {
  const calls = [];
  const f = async (url, opt) => { calls.push({ url, opt }); const r = script(url, opt, calls.length); return { ok: r.status < 400, status: r.status, json: async () => r.body }; };
  return { f, calls };
}
const login = (n = 1) => ({ status: 200, body: { access_token: 'tok' + n, refresh_token: 'ref' + n, expires_in: 3600, user: { id: 'u' + n } } });

test('signs in anonymously once, then reuses the session', async () => {
  const { f, calls } = fakeFetch(url => (url.includes('/auth/v1/signup') ? login() : { status: 200, body: { ok: true } }));
  global.fetch = f;
  const t = Net.supabaseTransport(cfg);
  await t.call({ op: 'profile', name: 'A' });
  await t.call({ op: 'profile', name: 'A' });
  assert.equal(calls.filter(c => c.url.includes('/auth/v1/signup')).length, 1);
  const last = calls.at(-1);
  assert.equal(last.url, 'https://x.supabase.co/functions/v1/shed');
  assert.equal(last.opt.headers.Authorization, 'Bearer tok1');
  assert.equal(last.opt.headers.apikey, 'pub');
  assert.equal(t.uid, 'u1');
});

test('a 401 from the function signs in again and retries once', async () => {
  let fn = 0;
  const { f, calls } = fakeFetch(url => {
    if (url.includes('/auth/v1/signup')) return login(calls.filter(c => c.url.includes('signup')).length);
    return ++fn === 1 ? { status: 401, body: { error: 'Please sign in' } } : { status: 200, body: { ok: true } };
  });
  global.fetch = f;
  const t = Net.supabaseTransport(cfg);
  const r = await t.call({ op: 'profile', name: 'A' });
  assert.equal(r.status, 200);
  assert.equal(calls.filter(c => c.url.includes('/auth/v1/signup')).length, 2);
});

test('an expired session is refreshed, and a failed refresh signs in fresh', async () => {
  const mem = { 'ms.online.session': JSON.stringify({ access: 'old', refresh: 'r', uid: 'u0', exp: Date.now() - 1000 }) };
  const store = { getItem: k => mem[k] || null, setItem: (k, v) => { mem[k] = v; } };
  let { f, calls } = fakeFetch(url => (url.includes('grant_type=refresh_token') ? login(7) : { status: 200, body: [] }));
  global.fetch = f;
  const t = Net.supabaseTransport(cfg, store);
  await t.view('ABCDE');
  assert.ok(calls[0].url.includes('refresh_token'));
  assert.equal(JSON.parse(mem['ms.online.session']).access, 'tok7');
  ({ f, calls } = fakeFetch(url => (url.includes('grant_type=refresh_token') ? { status: 400, body: {} } : url.includes('signup') ? login(9) : { status: 200, body: [] })));
  global.fetch = f;
  mem['ms.online.session'] = JSON.stringify({ access: 'old', refresh: 'bad', uid: 'u0', exp: 0 });
  await Net.supabaseTransport(cfg, store).view('ABCDE');
  assert.ok(calls.some(c => c.url.includes('signup')));
});

test('view asks for my own row only, and the lobby joins seats with names', async () => {
  const { f, calls } = fakeFetch(url => {
    if (url.includes('signup')) return login();
    if (url.includes('shed_views')) return { status: 200, body: [{ version: 3, view: { me: 0 } }] };
    if (url.includes('shed_tables')) return { status: 200, body: [{ status: 'lobby', host: 'u1', rules: {}, max_players: 4 }] };
    if (url.includes('shed_seats')) return { status: 200, body: [{ user_id: 'u1', seat: 0 }, { user_id: 'u2', seat: 1 }] };
    if (url.includes('shed_profiles')) return { status: 200, body: [{ id: 'u1', name: 'Ann' }] };
    return { status: 404, body: {} };
  });
  global.fetch = f;
  const t = Net.supabaseTransport(cfg);
  await t.call({ op: 'profile', name: 'A' }).catch(() => {});
  const v = await t.view('AB CDE');
  assert.equal(v.version, 3);
  assert.ok(calls.at(-1).url.includes('code=eq.AB%20CDE') && calls.at(-1).url.includes('user_id=eq.u1'));
  const l = await t.lobby('ABCDE');
  assert.deepEqual(l.seats.map(s => s.name), ['Ann', 'Player']);
  assert.equal(l.max, 4);
});

test('a missing table reads as null, and network failure is an error', async () => {
  global.fetch = fakeFetch(url => (url.includes('signup') ? login() : { status: 200, body: [] })).f;
  const t = Net.supabaseTransport(cfg);
  assert.equal(await t.lobby('NOPE2'), null);
  global.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(() => Net.supabaseTransport(cfg).call({}), /fetch/);
});

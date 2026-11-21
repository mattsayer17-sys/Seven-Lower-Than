'use strict';
// Talks to the Supabase project with plain fetch: anonymous sign-in, the "shed" function, and reading my own rows.
// No SDK, no DOM. `store` is anything with getItem/setItem (localStorage in the browser, a Map wrapper in tests).
(function (root) {
  function supabaseTransport(cfg, store) {
    const mem = {};
    const kv = store || { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; } };
    const KEY = 'ms.online.session';
    const base = cfg.url.replace(/\/$/, '');
    const plain = { apikey: cfg.key, 'Content-Type': 'application/json' };
    let session = null;
    try { session = JSON.parse(kv.getItem(KEY) || 'null'); } catch (e) { session = null; }

    const save = s => { session = s; try { kv.setItem(KEY, JSON.stringify(s)); } catch (e) {} };
    const keep = j => save({ access: j.access_token, refresh: j.refresh_token, uid: j.user.id, exp: Date.now() + (j.expires_in || 3600) * 1000 - 60000 });

    async function signIn() {
      const r = await fetch(base + '/auth/v1/signup', { method: 'POST', headers: plain, body: JSON.stringify({ data: {} }) });
      if (!r.ok) throw new Error('Could not sign in');
      keep(await r.json());
    }
    async function refresh() {
      const r = await fetch(base + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: plain, body: JSON.stringify({ refresh_token: session.refresh }) });
      if (!r.ok) return signIn();
      keep(await r.json());
    }
    async function token() {
      if (!session) await signIn();
      else if (Date.now() > session.exp) await refresh();
      return session.access;
    }
    const auth = async () => ({ apikey: cfg.key, Authorization: 'Bearer ' + (await token()), 'Content-Type': 'application/json' });

    async function rest(path) {
      const r = await fetch(base + '/rest/v1/' + path, { headers: await auth() });
      if (!r.ok) throw new Error('Could not reach the table');
      return r.json();
    }

    return {
      get uid() { return session && session.uid; },
      get token() { return session && session.access; },
      async call(body) {
        let r = await fetch(base + '/functions/v1/shed', { method: 'POST', headers: await auth(), body: JSON.stringify(body) });
        if (r.status === 401) { await signIn(); r = await fetch(base + '/functions/v1/shed', { method: 'POST', headers: await auth(), body: JSON.stringify(body) }); }
        let j = {};
        try { j = await r.json(); } catch (e) { j = { error: 'Bad reply' }; }
        return { status: r.status, body: j };
      },
      async view(code) {
        const rows = await rest('shed_views?code=eq.' + encodeURIComponent(code) + '&user_id=eq.' + session.uid + '&select=version,view');
        return rows[0] || null;
      },
      // The tables I am sitting at that are not finished, with whether it is my go.
      async mine() {
        await token();
        const seats = await rest('shed_seats?user_id=eq.' + session.uid + '&select=code');
        if (!seats.length) return [];
        const list = seats.map(s => s.code).join(',');
        const tables = await rest('shed_tables?code=in.(' + list + ')&select=code,status');
        const views = await rest('shed_views?user_id=eq.' + session.uid + '&code=in.(' + list + ')&select=code,turn:view->>turn,me:view->>me,phase:view->>phase');
        const v = Object.fromEntries(views.map(x => [x.code, x]));
        return tables.filter(t => t.status !== 'over').map(t => ({ code: t.code, status: t.status, myTurn: !!v[t.code] && v[t.code].phase === 'play' && v[t.code].turn === v[t.code].me, swapping: !!v[t.code] && v[t.code].phase === 'swap' }))
          .sort((a, b) => (b.myTurn - a.myTurn) || (a.code < b.code ? -1 : 1));
      },
      // Reactions at my table newer than `after`. The read policy only returns them to seated players and hides anyone I blocked.
      async chat(code, after) {
        return rest('shed_chat?code=eq.' + encodeURIComponent(code) + '&id=gt.' + (after | 0) + '&select=id,user_id,body&order=id.asc&limit=20');
      },
      async chatHead(code) {
        const rows = await rest('shed_chat?code=eq.' + encodeURIComponent(code) + '&select=id&order=id.desc&limit=1');
        return rows[0] ? rows[0].id : 0;
      },
      async lobby(code) {
        const t = (await rest('shed_tables?code=eq.' + encodeURIComponent(code) + '&select=status,host,rules,max_players,vote,note,next_code'))[0];
        if (!t) return null;
        const seats = await rest('shed_seats?code=eq.' + encodeURIComponent(code) + '&select=user_id,seat&order=seat');
        const ids = seats.map(s => s.user_id);
        const prof = ids.length ? await rest('shed_profiles?id=in.(' + ids.join(',') + ')&select=id,name') : [];
        const name = Object.fromEntries(prof.map(p => [p.id, p.name]));
        return { status: t.status, host: t.host, rules: t.rules, max: t.max_players, vote: t.vote || null, note: t.note || '', next: t.next_code || null, seats: seats.map(s => ({ id: s.user_id, name: name[s.user_id] || 'Player' })) };
      },
    };
  }
  const api = { supabaseTransport };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Net = api;
})(typeof window !== 'undefined' ? window : globalThis);

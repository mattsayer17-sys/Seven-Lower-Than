'use strict';
// Plays whole games against the deployed Supabase function with real anonymous users. Needs network.
//   node tools/live-test.js [games]
// Prints the user ids it created so they can be cleaned up.
const Shed = require('../src/engine.js');
const Online = require('../src/online.js');
const Net = require('../src/net.js');
const cfg = { url: process.env.MS_URL || 'https://fmgyzabdkityfyakmqhg.supabase.co', key: process.env.MS_KEY || 'sb_publishable_i67wYdkcK7HxkGIBnCHbjw_-6ry88QV' };

function decide(g) {
  const p = g.players[0];
  if (g.phase === 'swap') return p.ready ? null : { type: 'ready' };
  if (g.phase !== 'play' || g.turn !== 0) return null;
  // face-down follow-up go open: try the next card on alternate turns, otherwise Done
  if (g.follow && g.follow.pi === 0) return p.down.length && g.pile.length % 2 ? { type: 'blind', id: p.down[0].id } : { type: 'done' };
  const z = Shed.zone(g, p);
  if (z === 'down') return { type: 'blind', id: p.down[0].id };
  const gr = Shed.legalGroups(g, 0).sort((a, b) => Shed.power(g.rules, a[0]) - Shed.power(g.rules, b[0]));
  return gr.length ? { type: 'play', ids: gr[0].map(c => c.id) } : { type: 'pickup' };
}

(async () => {
  const games = +process.argv[2] || 1, made = [], codes = [], all = [];
  for (let k = 0; k < games; k++) {
    const players = 2 + (k % 4);
    const cs = [];
    for (let i = 0; i < players; i++) { const t = Net.supabaseTransport(cfg); const c = new Online.Client(t); await c.profile('Test' + i); made.push(t.uid); cs.push(c); }
    const code = await cs[0].create(k % 2 ? { transparentOn: true, skipOn: true, blindFollow: true } : { blindFollow: true }, 5); codes.push(code);
    // v5: the invite peek, before sitting down
    const pk = await cs[1].t.call({ op: 'peek', code });
    if (pk.status !== 200 || pk.body.host !== 'Test0' || !pk.body.rules.blindFollow) throw new Error('peek: ' + JSON.stringify(pk));
    if (k === 0) { const bad = await cs[1].t.call({ op: 'profile', name: 'b1tch' }); if (bad.status !== 400) throw new Error('rude name was accepted'); console.log('  peek ok, rude name refused'); }
    for (let i = 1; i < players; i++) await cs[i].join(code);
    const lob = await cs[0].t.lobby(code);
    if (lob.seats.length !== players) throw new Error('lobby shows ' + lob.seats.length);
    if (players >= 3) {
      // house rule vote on the live server: a non-host proposes, the others vote yes, the rules change
      await cs[1].propose({ type: 'flag', key: 'sevensLower', value: false });
      let open = (await cs[0].t.lobby(code)).vote;
      if (!open) throw new Error('vote did not open');
      for (const i of [0, ...Array.from({ length: players - 2 }, (_, j) => j + 2)]) {
        if (!open) break;
        await cs[i].vote('yes');
        open = (await cs[0].t.lobby(code)).vote;
      }
      const after = await cs[0].t.lobby(code);
      if (after.vote || after.rules.sevensLower !== false || !/^Passed/.test(after.note)) throw new Error('vote did not pass: ' + JSON.stringify([after.vote, after.rules, after.note]));
      console.log('  vote passed on the live server: ' + after.note);
    }
    await cs[0].start();
    if (k === 0) { const rx = await cs[1].react('\u{1F602}'); await new Promise(r => setTimeout(r, 1400)); const go = await cs[1].t.call({ op: 'react', code, text: 'Your go!' }); if (go.status !== 200) throw new Error('Your go! refused: ' + JSON.stringify(go)); await new Promise(r => setTimeout(r, 1400)); const bad = await cs[1].t.call({ op: 'react', code, text: 'hello' }); if (!rx.ok || bad.status !== 400) throw new Error('react: ' + JSON.stringify(bad)); console.log('  reaction relayed, free text refused'); }
    const G = [];
    for (let i = 0; i < players; i++) { const r = await cs[i].t.view(code); G[i] = Online.fromView(r.view); G[i].version = r.version; }
    let steps = 0, resyncs = 0, follows = 0;
    for (let guard = 0; guard < 3000; guard++) {
      let moved = false;
      for (let i = 0; i < players; i++) {
        const g = G[i], a = decide(g);
        if (!a) continue;
        if (a.type === 'ready') await cs[i].act(a);
        else if (a.type === 'blind') {
          g.pending = true; await cs[i].act(a);
          const r = await cs[i].t.view(code); const lev = r.view.lastEvent;
          Online.revealMine(g, lev.type === 'follow' ? lev.card : lev.cards[0]); if (lev.type === 'follow') follows++; Shed.playBlind(g, 0, a.id);
        } else if (a.type === 'done') { g.pending = true; Shed.followDone(g, 0); await cs[i].act(a);
        } else { g.pending = true; if (a.type === 'play') Shed.play(g, 0, a.ids); else Shed.pickUp(g, 0); await cs[i].act(a); }
        for (let j = 0; j < players; j++) {
          const r = await cs[j].t.view(code); const was = G[j].phase;
          const out = Online.reconcile(G[j], r.view, r.version);
          if (out.mode === 'resync') { if (was === 'play') resyncs++; G[j] = out.game; } else if (out.mode === 'step') steps++;
        }
        moved = true; break;
      }
      if (!moved) throw new Error('stuck');
      if (G[0].phase === 'over') break;
    }
    const lob2 = await cs[0].t.lobby(code);
    console.log('game ' + (k + 1) + ': ' + players + ' players, code ' + code + ', status ' + lob2.status + ', loser seat ' + G[0].loser + ', replayed ' + steps + ' moves, resyncs in play ' + resyncs + ', face-down follow-ups ' + follows);
    if (lob2.status !== 'over' || resyncs) process.exitCode = 1;
    // v9: head to head from the results table. Fresh users, so one game against each opponent, wins and losses add up.
    const hh = await cs[0].t.call({ op: 'h2h', with: cs.slice(1).map(c => c.t.uid) });
    const rows = Object.values((hh.body && hh.body.h2h) || {});
    const fine = hh.status === 200 && rows.length === players - 1 && rows.every(x => x.n === 1 && x.w + x.l === 1) && rows.filter(x => x.theyRb).length + rows[0].meRb === 1;
    console.log('  head to head ' + (fine ? 'ok' : 'WRONG ' + JSON.stringify(hh.body)));
    if (!fine) process.exitCode = 1;
    // v11: report and block go through the server; a blocked player cannot sit at the blocker's next table
    if (k === 0) {
      const rep = await cs[0].t.call({ op: 'report', user: cs[1].t.uid, code, reason: 'name', block: true });
      const nt = await cs[0].t.call({ op: 'create', rules: {}, max: 5 });
      const jn = await cs[1].t.call({ op: 'join', code: nt.body.code });
      const fineR = rep.status === 200 && nt.status === 200 && jn.status === 403;
      console.log('  report + block ' + (fineR ? 'ok' : 'WRONG ' + JSON.stringify([rep, nt, jn])));
      if (!fineR) process.exitCode = 1;
    }
    all.push(...cs);
  }
  // v11: every test user deletes itself (App Store 5.1.1(v)), which also leaves nothing behind in the database
  let deleted = 0;
  for (const c of all) { const d = await c.t.call({ op: 'delete_me', confirm: 'DELETE' }); if (d.status === 200) deleted++; }
  console.log('  delete my data ' + (deleted === all.length ? 'ok, ' + deleted + ' test users removed' : 'WRONG ' + deleted + '/' + all.length));
  if (deleted !== all.length) process.exitCode = 1;
  console.log('USERS ' + made.join(','));
  console.log('CODES ' + codes.join(','));
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });

// Online play: the lobby (make or join a table by code), then the game itself.
// The server owns the game. This file keeps a shadow of it on screen (see src/online.js) and sends my moves.
import Shed from '../engine.js';
import Online from '../online.js';
import Net from '../net.js';
import Table from '../table.js';
import Meta from '../rules-meta.js';
import CFG from '../online-config.js';
import { $, esc } from './dom.js';
import { FAST, later, store, who } from './state.js';
import { prof } from './profile.js';
import { hideModal, showModal } from './sheets.js';
import { advance, afterAction, newGame } from './flow.js';
import { hint, render, setMsg } from './render.js';
import { adoptElements, rekeyCard } from './cards.js';
import { fillChange, proposeHTML, readChange, voteCard } from './vote.js';

const POLL = FAST ? 40 : 1300;
let transport = null;

function getTransport() {
  if (window.__MS_TRANSPORT) return window.__MS_TRANSPORT;
  if (!transport) {
    let kv;
    try { kv = window.localStorage; kv.getItem('x'); } catch (e) { kv = null; }
    transport = Net.supabaseTransport(CFG, kv);
  }
  return transport;
}

const friendly = e => (/fetch|network|Failed|reach|sign in/i.test(e.message || '') ? "Can't reach the online service from here. Check your connection, or open the web version" : e.message || 'Something went wrong');

// ---------- the game, once it is running ----------
function makeRemote(client, code) {
  const r = { client, code, busy: false, inflight: 0, chain: Promise.resolve(), timer: null, playResyncs: 0 };
  const g = () => store.game;
  const fail = (e) => { setMsg(friendly(e)); r.inflight = Math.max(0, r.inflight - 1); r.busy = false; resync(); };

  r.send = action => {
    if (action.type === 'play' || action.type === 'pickup') g().pending = true;
    r.inflight++;
    r.chain = r.chain.then(() => client.act(action)).then(() => { r.inflight--; pollSoon(); }, fail);
  };

  r.ready = () => {
    g().players[0].ready = true;
    setMsg('Locked in. Waiting for the others');
    render();
    r.send({ type: 'ready' });
  };

  // My face-down card: the server has to turn it over first, because I do not know what it is.
  r.blind = id => {
    store.ui.busy = true;
    r.busy = true;
    g().pending = true;
    r.inflight++;
    r.chain = r.chain.then(() => client.act({ type: 'blind', id })).then(async () => {
      const res = await client.t.view(code);
      const card = res.view.lastEvent && res.view.lastEvent.cards[0];
      const game = g();
      const rk = card && Online.revealMine(game, card);
      if (!rk) throw new Error('Out of step');
      rekeyCard(rk.from, rk.to);
      store.ui.reveal = id;
      render();
      later(() => {
        store.ui.reveal = null;
        afterAction(Shed.playBlind(game, 0, id));
        r.inflight--;
        const out = Online.reconcile(game, res.view, res.version);
        if (out.mode === 'resync') resync(out.game, res.version);
      }, 950);
    }, fail);
  };

  r.afterDeal = () => {
    const game = g();
    if (game.phase === 'swap') {
      store.ui.busy = !!game.players[0].ready;
      hint(store.ui.busy ? 'Locked in. Waiting for the others' : 'Swap a hand card with a face-up one, then lock in');
      render();
    } else advance();
  };

  async function poll() {
    if (store.remote !== r) return clearInterval(r.timer);
    if (r.busy || r.inflight || store.ui.intro || store.ui.drag) return;
    let res;
    try { res = await client.t.view(code); } catch (e) { return; }
    if (store.remote !== r || r.busy || r.inflight || !res) return;
    const game = g();
    if (res.version <= (game.version || 0)) return;
    const out = Online.reconcile(game, res.view, res.version);
    if (out.mode === 'resync') return resync(out.game, res.version);
    if (out.mode === 'step') {
      out.rekeys.forEach(k => rekeyCard(k.from, k.to));
      afterAction(out.result);
    } else if (out.mode === 'mine') {
      out.rekeys.forEach(k => rekeyCard(k.from, k.to));
      render();
    }
  }
  const pollSoon = () => setTimeout(poll, FAST ? 5 : 200);
  async function resync(fresh, version) {
    if (store.remote !== r) return;
    if (!fresh) {
      try { const res = await client.t.view(code); if (!res) return; fresh = Online.fromView(res.view); version = res.version; } catch (e) { return; }
    }
    const was = g() && g().phase;
    if (was === 'play') r.playResyncs++;
    fresh.version = version;
    fresh.players[0].name = 'You';
    fresh.meta = { tour: false, daily: null, keys: [], online: true };
    adoptElements(fresh);
    store.game = fresh;
    store.ui.sel = [];
    store.ui.hold = null;
    store.ui.reveal = null;
    r.busy = false;
    if (was === 'swap' && fresh.phase === 'play') setMsg(who(fresh.turn) + (fresh.turn === 0 ? ' go' : ' goes') + ' first (lowest card)');
    advance();
  }
  r.over = () => { clearInterval(r.timer); };
  r.timer = setInterval(poll, POLL);
  r.resync = resync;
  return r;
}

function startGame(client, code, res) {
  const game = Online.fromView(res.view);
  game.version = res.version;
  game.players[0].name = 'You';
  const r = makeRemote(client, code);
  store.remote = r;
  hideModal();
  newGame({ remote: { game } });
}

// ---------- the lobby ----------
let lobbyTimer = null;
const stopLobby = () => { clearInterval(lobbyTimer); lobbyTimer = null; };
const note = t => { const n = $('#olNote'); if (n) { n.textContent = t || ''; n.className = 'note' + (t ? ' err' : ''); } };

function showOnline() {
  stopLobby();
  const p = prof();
  const nm = p && p.name && p.name !== 'You' && p.name !== 'Player 1' ? p.name : '';
  showModal('<h2>Play online</h2><p>Make a table and share the code, or join a friend\'s. You can leave a game and come back to it later.</p>' +
    '<div class="inp"><input id="olName" maxlength="16" placeholder="Your name" aria-label="Your name" autocomplete="off" value="' + esc(nm) + '"></div>' +
    '<div class="btns col"><button class="btn primary" id="olMake">Make a table with my rules</button></div>' +
    '<h3>Join with a code</h3><div class="inp"><input id="olCode" maxlength="5" placeholder="5 letter code" aria-label="Table code" autocomplete="off" autocapitalize="characters" style="text-transform:uppercase"></div>' +
    '<div class="btns col"><button class="btn" id="olJoin">Join</button></div>' +
    '<div id="olMine"></div><div id="olNote" class="note" role="status"></div><div class="btns"><button class="btn" id="olClose">Close</button></div>');
  const ident = async () => {
    const name = $('#olName').value.trim();
    if (!name) { note('Pick a name first'); $('#olName').focus(); return null; }
    if (p && name !== p.name) { p.name = name.slice(0, 16); }
    const c = new Online.Client(getTransport());
    await c.profile(name.slice(0, 16));
    return c;
  };
  const guard = fn => async () => { note(''); try { await fn(); } catch (e) { note(friendly(e)); } };
  $('#olClose').onclick = hideModal;
  $('#olMake').onclick = guard(async () => { const c = await ident(); if (!c) return; await c.create(Table.optsFromSettings(store.settings), Math.min(5, Math.max(2, store.settings.players | 0 || 2))); showWaiting(c); });
  $('#olJoin').onclick = guard(async () => { const c = await ident(); if (!c) return; const code = $('#olCode').value.trim().toUpperCase(); if (code.length < 5) return note('Enter the 5 letter code'); await c.join(code); showWaiting(c); });
  // tables I am already in, so a game can be picked up again later
  const t = getTransport();
  if (t.mine) t.mine().then(list => {
    const box = $('#olMine');
    if (!box || !list.length) return;
    box.innerHTML = '<h3>Your tables</h3>' + list.map(x => '<div class="row"><span><b>' + esc(x.code) + '</b><small>' + (x.status === 'lobby' ? 'Waiting to start' : x.swapping ? 'Choose your cards' : x.myTurn ? 'Your turn' : 'Their turn') + '</small></span><span class="ctl"><button class="btn sm' + (x.myTurn ? ' primary' : '') + ' olRes" data-code="' + esc(x.code) + '">' + (x.status === 'lobby' ? 'Open' : 'Resume') + '</button></span></div>').join('');
    box.querySelectorAll('.olRes').forEach(b => { b.onclick = () => { const c = new Online.Client(t); c.code = b.dataset.code; showWaiting(c); }; });
  }, () => {});
}

function showWaiting(c) {
  stopLobby();
  const code = c.code;
  showModal('<h2>Table ' + esc(code) + '</h2><p>Share this code. The host starts the game when everyone is here.</p>' +
    '<div class="codebig" style="font-size:34px;letter-spacing:.2em;text-align:center;margin:6px 0" aria-label="Table code ' + esc(code.split('').join(' ')) + '">' + esc(code) + '</div>' +
    '<div id="olSeats"></div><div id="olRules"></div><div id="olVote"></div><div id="olLast" class="note"></div>' + proposeHTML() +
    '<p class="ex">Anyone can propose a change. Everyone votes, the majority wins, and the host settles a tie.</p><div id="olNote" class="note" role="status"></div>' +
    '<div class="btns"><button class="btn" id="olLeave">Leave</button><button class="btn primary" id="olStart" disabled>Start</button></div>');
  let cur = null, ticked = null;
  const act = fn => async () => { note(''); try { await fn(); } catch (e) { note(friendly(e)); } tick(); };
  $('#tblChange').onchange = () => { if (cur) fillChange(cur.rules); };
  $('#tblPropose').onclick = act(async () => { const ch = cur && readChange(cur.rules); if (ch) await c.propose(ch); });
  const tick = async () => {
    if (!$('#olSeats')) return stopLobby();
    let lob;
    try { lob = await c.t.lobby(code); } catch (e) { return note(friendly(e)); }
    if (!$('#olSeats')) return;
    if (!lob) { stopLobby(); return showOnline(), note('That table has closed'); }
    $('#olSeats').innerHTML = lob.seats.map((s, i) => '<div class="row"><span><b>' + esc(s.name) + '</b>' + (s.id === lob.host ? ' · host' : '') + '</span><span class="ctl"><small>Seat ' + (i + 1) + '</small></span></div>').join('');
    $('#olRules').innerHTML = '<h3>Rules</h3>' + Meta.summarise(lob.rules).map(l => '<div class="row"><span>' + esc(l) + '</span></div>').join('');
    cur = lob;
    const mine = c.t.uid === lob.host;
    const room = { players: lob.seats, hostId: lob.host, opts: lob.rules, vote: lob.vote };
    $('#olVote').innerHTML = lob.vote ? voteCard(room, c.t.uid) : '';
    if (lob.vote) {
      $('#vYes').onclick = act(() => c.vote('yes'));
      $('#vNo').onclick = act(() => c.vote('no'));
      const w = $('#vWithdraw'); if (w) w.onclick = act(() => c.cancelVote());
      // time is up: ask the server to settle it (it checks its own clock)
      if (Date.now() > lob.vote.deadline + 200 && ticked !== lob.vote.id) { ticked = lob.vote.id; c.tick().catch(() => {}); }
    }
    $('#olLast').textContent = lob.note || '';
    $('#tblPropose').disabled = !!lob.vote;
    $('#tblPropose').textContent = lob.vote ? 'Vote open' : 'Propose';
    fillChange(lob.rules);
    $('#olStart').style.display = mine ? '' : 'none';
    $('#olStart').disabled = lob.seats.length < 2 || !!lob.vote;
    if (lob.status === 'playing' || lob.status === 'over') {
      stopLobby();
      const res = await c.t.view(code);
      if (res) startGame(c, code, res);
    }
  };
  $('#olLeave').onclick = async () => { stopLobby(); try { await c.leave(); } catch (e) {} showOnline(); };
  $('#olStart').onclick = async () => { note(''); try { await c.start(); tick(); } catch (e) { note(friendly(e)); } };
  tick();
  lobbyTimer = setInterval(tick, POLL * 1.2);
}

export { showOnline };

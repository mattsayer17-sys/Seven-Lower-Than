// Online play: the lobby (make or join a table by code), then the game itself.
// The server owns the game. This file keeps a shadow of it on screen (see src/online.js) and sends my moves.
import Shed from '../engine.js';
import Online from '../online.js';
import Net from '../net.js';
import Table from '../table.js';
import Meta from '../rules-meta.js';
import CFG from '../online-config.js';
import Reactions from '../reactions.js';
import Names from '../names.js';
import { $, esc } from './dom.js';
import { FAST, later, save, store, who } from './state.js';
import { AVATARS, prof, unlock, updateStats } from './profile.js';
import { hideModal, showModal } from './sheets.js';
import { advance, afterAction, newGame } from './flow.js';
import { hint, render, setMsg } from './render.js';
import { adoptElements, rekeyCard } from './cards.js';
import { chatFrom, chatOn } from './chat.js';
import { fillChange, proposeHTML, readChange, voteCard } from './vote.js';
import qrcode from 'qrcode-generator';

// ---------- invites: a link that opens straight into the table, sent by WhatsApp, the share sheet, a copy or a QR code ----------
const SITE = 'https://seven-lower-than.vercel.app/';
function inviteLink(code) {
  const web = /^https?:$/.test(location.protocol) && !/localhost|127\.0\.0\.1/.test(location.hostname);
  return (web ? location.origin + location.pathname : SITE) + '?join=' + encodeURIComponent(code);
}
const inviteText = code => 'Join my Seven Lower Than table. Tap to sit down: ' + inviteLink(code) + ' (code ' + code + ')';
function qrSvg(text) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
}
function inviteHTML(code) {
  return '<div class="invite"><a class="btn wa" id="olWa" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(inviteText(code)) + '">WhatsApp</a>' +
    (navigator.share ? '<button class="btn" id="olShare">Share</button>' : '') +
    '<button class="btn" id="olCopy">Copy link</button><button class="btn" id="olQr" aria-expanded="false">QR code</button></div>' +
    '<div id="olQrBox" class="qrbox hidden" aria-label="QR code for the invite link"></div>';
}
function wireInvite(code) {
  const sh = $('#olShare');
  if (sh) sh.onclick = () => navigator.share({ title: 'Seven Lower Than', text: 'Join my Seven Lower Than table (code ' + code + ')', url: inviteLink(code) }).catch(() => {});
  $('#olCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(inviteLink(code)); $('#olCopy').textContent = 'Copied'; } catch (e) { $('#olCopy').textContent = 'Copy failed'; }
    setTimeout(() => { if ($('#olCopy')) $('#olCopy').textContent = 'Copy link'; }, 1500);
  };
  $('#olQr').onclick = () => {
    const box = $('#olQrBox'), open = box.classList.toggle('hidden') === false;
    $('#olQr').setAttribute('aria-expanded', String(open));
    if (open && !box.innerHTML) box.innerHTML = qrSvg(inviteLink(code)) + '<small>Scan with a phone camera to join</small>';
  };
}


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
  // ---- reactions from the others at the table ----
  r.chatAfter = null;
  r.react = text => client.react(text).catch(() => {}); // a refused or throttled reaction is simply dropped
  async function chatPoll() {
    if (store.remote !== r) return clearInterval(r.chatTimer);
    const t = client.t;
    if (!t.chat || !chatOn()) return;
    try {
      // start from now: reactions sent before I sat down (or before a reload) are not replayed
      if (r.chatAfter == null) { r.chatAfter = await t.chatHead(code); return; }
      const rows = await t.chat(code, r.chatAfter);
      for (const m of rows) {
        r.chatAfter = Math.max(r.chatAfter, m.id);
        if (m.user_id === t.uid || !Reactions.allowed(m.body)) continue;
        const game = g(), i = game && game.seats ? game.seats.indexOf(m.user_id) : -1;
        if (i > 0) chatFrom(i, game.players[i].name, m.body);
      }
    } catch (e) { /* try again next time */ }
  }
  r.over = () => { clearInterval(r.timer); };
  r.timer = setInterval(poll, POLL);
  r.chatTimer = setInterval(chatPoll, FAST ? 60 : 1600);
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

// Who I will be at the table: one line with my avatar and name, and Change to edit them in place.
// Never a form in the way: a name is suggested, so a first-timer can just tap the big button.
function identHTML(nm, av) {
  return '<div class="me-card" id="olMe"><span class="me-av" id="olMeAv">' + esc(av) + '</span><span class="me-txt"><small>You\'ll play as</small><b id="olMeName">' + esc(nm) + '</b></span>' +
    '<button class="btn sm" id="olEdit" aria-expanded="false" aria-controls="olEditBox">Change</button></div>' +
    '<div id="olEditBox" class="me-edit hidden"><div class="inp"><input id="olName" maxlength="16" aria-label="Your name" autocomplete="off" autocapitalize="words" spellcheck="false" value="' + esc(nm) + '">' +
    '<button class="btn" id="olRoll" aria-label="Suggest another name">🎲</button></div>' +
    '<div class="avs" role="radiogroup" aria-label="Avatar">' + AVATARS.map(a => '<button class="av' + (a === av ? ' on' : '') + '" role="radio" aria-checked="' + (a === av) + '" data-a="' + a + '">' + a + '</button>').join('') + '</div></div>' +
    '<div id="olNameNote" class="note" role="status"></div>';
}
// Wire the identity line. onValid(ok) lets the sheet enable or disable its main button as you type.
function wireIdent(onValid) {
  const p = prof();
  let av = (p && p.av) || '🦊';
  const check = () => {
    const nc = Names.check($('#olName').value);
    const n = $('#olNameNote');
    n.textContent = nc.ok || !$('#olName').value.trim() ? '' : nc.error;
    n.className = 'note' + (nc.ok ? '' : ' err');
    $('#olMeName').textContent = nc.ok ? nc.name : $('#olName').value.trim() || '…';
    if (onValid) onValid(nc.ok);
    return nc;
  };
  $('#olEdit').onclick = () => {
    const box = $('#olEditBox'), open = box.classList.toggle('hidden') === false;
    $('#olEdit').setAttribute('aria-expanded', String(open));
    $('#olEdit').textContent = open ? 'Done' : 'Change';
    if (open) { $('#olName').focus(); $('#olName').select(); }
  };
  $('#olName').addEventListener('input', check);
  $('#olRoll').onclick = () => { $('#olName').value = Names.suggest(); check(); };
  document.querySelectorAll('#olEditBox .av').forEach(b => b.onclick = () => {
    av = b.dataset.a;
    document.querySelectorAll('#olEditBox .av').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); });
    $('#olMeAv').textContent = av;
  });
  check();
  // Sign in (silently, anonymous) and register the name. Returns a client, or null with the reason shown.
  return async () => {
    const nc = check();
    if (!nc.ok) {
      if ($('#olEditBox').classList.contains('hidden')) $('#olEdit').click();
      $('#olNameNote').textContent = nc.error === 'Pick a name' ? 'Pick a name first' : nc.error;
      $('#olNameNote').className = 'note err';
      $('#olName').focus();
      return null;
    }
    if (p && (nc.name !== p.name || av !== p.av)) { p.name = nc.name; p.av = av; save(); updateStats(); }
    const c = new Online.Client(getTransport());
    await c.profile(nc.name, av);
    return c;
  };
}
const defaultName = p => (p && p.name && p.name !== 'You' && p.name !== 'Player 1' && Names.check(p.name).ok ? p.name : Names.suggest());

function showOnline(opts) {
  const joinCode = opts && opts.join ? String(opts.join).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5) : '';
  if (joinCode) return showInvite(joinCode);
  stopLobby();
  const p = prof();
  showModal('<h2>Play with friends</h2>' + identHTML(defaultName(p), (p && p.av) || '🦊') +
    '<div class="btns col"><button class="btn primary big" id="olMake">Make a table<small>Your house rules. Send friends a link</small></button></div>' +
    '<div class="joinrow"><span>Got a code?</span><div class="inp"><input id="olCode" maxlength="5" placeholder="ABCDE" aria-label="Table code" autocomplete="off" autocapitalize="characters" spellcheck="false" style="text-transform:uppercase"><button class="btn" id="olJoin">Join</button></div></div>' +
    '<div id="olMine"></div><div id="olNote" class="note" role="status"></div><div class="btns"><button class="btn" id="olClose">Close</button></div>');
  const ident = wireIdent(ok => { $('#olMake').disabled = !ok; $('#olJoin').disabled = !ok; });
  const guard = fn => async () => { note(''); try { await fn(); } catch (e) { note(friendly(e)); } };
  $('#olClose').onclick = hideModal;
  $('#olMake').onclick = guard(async () => { const c = await ident(); if (!c) return; await c.create(Table.optsFromSettings(store.settings), Math.min(5, Math.max(2, store.settings.players | 0 || 2))); unlock('host'); showWaiting(c); });
  $('#olJoin').onclick = guard(async () => { const code = $('#olCode').value.trim().toUpperCase(); if (code.length < 5) { $('#olCode').focus(); return note('Enter the 5 letter code'); } const c = await ident(); if (!c) return; await c.join(code); showWaiting(c); });
  $('#olCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('#olJoin').click(); });
  // tables I am already in, so a game can be picked up again later
  const t = getTransport();
  if (t.mine) t.mine().then(list => {
    const box = $('#olMine');
    if (!box || !list.length) return;
    box.innerHTML = '<h3>Your tables</h3>' + list.map(x => '<div class="row"><span><b>' + esc(x.code) + '</b><small>' + (x.status === 'lobby' ? 'Waiting to start' : x.swapping ? 'Choose your cards' : x.myTurn ? 'Your turn' : 'Their turn') + '</small></span><span class="ctl"><button class="btn sm' + (x.myTurn ? ' primary' : '') + ' olRes" data-code="' + esc(x.code) + '">' + (x.status === 'lobby' ? 'Open' : 'Resume') + '</button></span></div>').join('');
    box.querySelectorAll('.olRes').forEach(b => { b.onclick = () => { const c = new Online.Client(t); c.code = b.dataset.code; showWaiting(c); }; });
  }, () => {});
}

// Someone tapped an invite link. One screen: whose table, the rules in brief, who I'll be, and one big Sit down.
function showInvite(code) {
  stopLobby();
  const p = prof();
  showModal('<h2><span id="olInvTitle">You\'re invited</span></h2><p class="lead" id="olInvSub">Table ' + esc(code) + ' · Seven Lower Than</p><div id="olInvRules" class="invrules"></div>' +
    identHTML(defaultName(p), (p && p.av) || '🦊') +
    '<div class="btns col"><button class="btn primary big" id="olSit">Sit down</button></div><div id="olNote" class="note" role="status"></div>' +
    '<div class="btns"><button class="btn quiet" id="olNotNow">Not now</button></div>');
  const ident = wireIdent(ok => { $('#olSit').disabled = !ok; });
  $('#olNotNow').onclick = hideModal;
  const t = getTransport();
  t.call({ op: 'peek', code }).then(r => {
    // only a real "no such table" says closed; any other failure keeps the plain invite and Sit down still works
    if (!$('#olInvTitle') || (r.status !== 200 && r.status !== 404)) return;
    const info = r.status === 200 ? r.body : null;
    if (!info) { $('#olInvTitle').textContent = 'That table has closed'; $('#olInvSub').textContent = 'Ask your friend for a new link, or play the computer for now.'; $('#olSit').textContent = 'Play the computer'; $('#olSit').onclick = hideModal; return; }
    $('#olInvTitle').textContent = info.host + ' invited you';
    $('#olInvSub').textContent = 'Table ' + code + ' · ' + info.seated + ' of ' + info.max + ' seats taken';
    $('#olInvRules').innerHTML = '<small>House rules</small>' + Meta.summarise(info.rules).slice(0, 4).map(l => '<div>' + esc(l) + '</div>').join('');
    if (info.status !== 'lobby' && !info.mine) { $('#olInvSub').textContent = 'That game has already started. Ask for a link to the next one.'; $('#olSit').textContent = 'Play the computer'; $('#olSit').onclick = hideModal; }
  }, () => {});
  $('#olSit').onclick = async () => {
    note('');
    $('#olSit').disabled = true;
    try { const c = await ident(); if (c) { await c.join(code); showWaiting(c); return; } } catch (e) { note(friendly(e)); }
    if ($('#olSit')) $('#olSit').disabled = false;
  };
}

function showWaiting(c) {
  stopLobby();
  const code = c.code;
  showModal('<h2>Table ' + esc(code) + '</h2><p>Send the invite. Friends tap the link and sit straight down. The host starts the game when everyone is here.</p>' +
    '<div class="codebig" style="font-size:34px;letter-spacing:.2em;text-align:center;margin:6px 0" aria-label="Table code ' + esc(code.split('').join(' ')) + '">' + esc(code) + '</div>' +
    inviteHTML(code) +
    '<div id="olSeats"></div><div id="olRules"></div><div id="olVote"></div><div id="olLast" class="note"></div>' + proposeHTML() +
    '<p class="ex">Anyone can propose a change. Everyone votes, the majority wins, and the host settles a tie.</p><div id="olNote" class="note" role="status"></div>' +
    '<div class="btns"><button class="btn" id="olLeave">Leave</button><button class="btn primary" id="olStart" disabled>Start</button></div>');
  wireInvite(code);
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

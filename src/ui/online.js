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
import { hideWelcome } from './welcome.js';
import { advance, afterAction, newGame } from './flow.js';
import { hint, refreshStatus, render, setMsg } from './render.js';
import { adoptElements, rekeyCard } from './cards.js';
import { chatFrom, chatOn, reactHint } from './chat.js';
import { finalFlip, isFinalFlip } from './reveal.js';
import { fillChange, proposeHTML, readChange, voteCard } from './vote.js';
import qrcode from 'qrcode-generator';

// ---------- invites: a link that opens straight into the table, sent by WhatsApp, the share sheet, a copy or a QR code ----------
const SITE = 'https://shiphead.vercel.app/';
function inviteLink(code) {
  const web = /^https?:$/.test(location.protocol) && !/localhost|127\.0\.0\.1/.test(location.hostname);
  return (web ? location.origin + location.pathname : SITE) + '?join=' + encodeURIComponent(code);
}
const inviteText = code => 'Join my Shiphead table. Tap to sit down: ' + inviteLink(code) + ' (code ' + code + ')';
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
  if (sh) sh.onclick = () => navigator.share({ title: 'Shiphead', text: 'Join my Shiphead table (code ' + code + ')', url: inviteLink(code) }).catch(() => {});
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

// An invisible Cloudflare Turnstile check, only when a new online account is made. Loaded on first use, never for solo play.
function turnstileToken() {
  return new Promise((resolve, reject) => {
    const go = () => {
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:99';
      document.body.appendChild(box);
      window.turnstile.render(box, {
        sitekey: CFG.turnstile, appearance: 'interaction-only',
        callback: t => { box.remove(); resolve(t); },
        'error-callback': () => { box.remove(); reject(new Error('Could not sign in')); },
      });
    };
    if (window.turnstile) return go();
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.async = true;
    s.onload = go;
    s.onerror = () => reject(new Error('Could not sign in'));
    document.head.appendChild(s);
  });
}

function getTransport() {
  if (window.__MS_TRANSPORT) return window.__MS_TRANSPORT;
  if (!transport) {
    let kv;
    try { kv = window.localStorage; kv.getItem('x'); } catch (e) { kv = null; }
    transport = Net.supabaseTransport(CFG.turnstile ? Object.assign({}, CFG, { captcha: turnstileToken }) : CFG, kv);
  }
  return transport;
}

// Head to head against these people, from the server, so both phones show the same score.
// Never signs anyone in: with no online session on this device there is nothing to fetch.
async function fetchRivals(uids) {
  const t = getTransport();
  uids = (uids || []).filter(Boolean);
  if (!t.uid || !uids.length) return null;
  try { const r = await t.call({ op: 'h2h', with: uids }); return r.status === 200 && r.body.h2h ? r.body.h2h : null; } catch (e) { return null; }
}

// Delete this player's online account and everything the server holds for them. With no session on this device there is
// nothing online to delete. Returns true when the server is clear (or there was nothing there).
async function deleteOnline() {
  const t = getTransport();
  if (!t.uid) return true;
  try { const r = await t.call({ op: 'delete_me', confirm: 'DELETE' }); if (r.status !== 200) return false; } catch (e) { return false; }
  if (t.forget) t.forget();
  return true;
}

const friendly = e => (/fetch|network|Failed|reach|sign in/i.test(e.message || '') ? "Can't reach the online service from here. Check your connection, or open the web version" : e.message || 'Something went wrong');

// who we are still waiting on to lock in, by name
function waitingFor() {
  const g = store.game, left = g ? g.players.filter((p, i) => i > 0 && !p.ready).map(p => p.name) : [];
  return 'Locked in. Waiting for ' + (left.length ? left.join(' and ') : 'the others');
}

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
    setMsg(waitingFor());
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
      const lev = res.view.lastEvent;
      // a face-down follow-up try comes back as a 'follow' event with the one card it turned
      const card = lev ? (lev.type === 'follow' ? lev.card : (lev.cards || [])[0]) : null;
      const game = g();
      const rk = card && Online.revealMine(game, card);
      if (!rk) throw new Error('Out of step');
      rekeyCard(rk.from, rk.to);
      const finish = () => {
        afterAction(Shed.playBlind(game, 0, id));
        r.inflight--;
        const out = Online.reconcile(game, res.view, res.version);
        if (out.mode === 'resync') resync(out.game, res.version);
      };
      if (isFinalFlip(game, 0, id)) return finalFlip(id, Shed.canPlayCard(game.rules, game.players[0].down[0], game.pile), render, finish);
      store.ui.reveal = id;
      render();
      later(() => {
        store.ui.reveal = null;
        afterAction(Shed.playBlind(game, 0, id));
        r.inflight--;
        const out = Online.reconcile(game, res.view, res.version);
        if (out.mode === 'resync') resync(out.game, res.version);
      }, store.ui.beat === 0 ? 1700 : 950);
    }, fail);
  };

  // finishing a face-down follow-up go: nothing hidden, so it applies straight away
  r.done = () => {
    const game = g();
    game.pending = true;
    afterAction(Shed.followDone(game, 0));
    r.send({ type: 'done' });
  };

  r.afterDeal = () => {
    const game = g();
    if (game.phase === 'swap') {
      store.ui.busy = !!game.players[0].ready;
      hint(store.ui.busy ? waitingFor() : 'Swap a hand card with a face-up one, then lock in');
      render();
    } else advance();
  };

  async function poll() {
    if (store.remote !== r) return;
    if (r.busy || r.inflight || store.ui.intro || store.ui.drag) return;
    let res;
    try { res = await client.t.view(code); } catch (e) { return; }
    if (store.remote !== r || r.busy || r.inflight || !res) return;
    const game = g();
    if (res.version <= (game.version || 0)) return;
    // someone else turned over their last face-down card: show everyone the card turning before anything moves
    const lev = res.view.lastEvent, me = res.view.me, n = res.view.players.length;
    if (lev && lev.type === 'blind' && res.version === (game.version || 0) + 1 && !r.flipping) {
      const pi = (lev.pi - me + n) % n, p = game.players[pi], slot = p && p.down.length === 1 ? p.down[0] : null;
      if (pi !== 0 && slot && slot.hidden && isFinalFlip(game, pi, slot.id)) {
        const card = lev.cards[0];
        const from = Object.assign({}, slot);
        Object.assign(slot, { id: card.id, rank: card.rank, suit: card.suit, hidden: false });
        rekeyCard(from, slot);
        r.flipping = true;
        r.busy = true;
        return finalFlip(card.id, Shed.canPlayCard(game.rules, slot, game.pile), render, () => { r.flipping = false; r.busy = false; poll(); });
      }
    }
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
  // Poll fast while waiting for someone else, slowly while it's my go (nothing changes until I move).
  const waiting = () => { const gm = g(); return !gm || gm.phase !== 'play' || gm.turn !== 0 || gm.players[0].out; };
  const loop = async () => {
    if (store.remote !== r || r.stopped) return;
    r.polling = true;
    try { await poll(); } finally { r.polling = false; }
    refreshStatus();
    if (store.remote !== r || r.stopped) return;
    const soon = r.soon;
    r.soon = false;
    r.timer = setTimeout(loop, FAST ? POLL : soon ? 60 : waiting() ? 450 : 1500);
  };
  r.over = () => { r.stopped = true; clearTimeout(r.timer); };
  // one loop only: if a poll is on its way, the next one just comes sooner
  r.pollNow = () => { if (r.stopped) return; if (r.polling) { r.soon = true; return; } clearTimeout(r.timer); r.timer = setTimeout(loop, FAST ? 5 : 60); };
  r.timer = setTimeout(loop, POLL);
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
  wireHold();
  hideModal();
  hideWelcome(); // the getting-started card is for solo play; online it would cover the other player's cards
  newGame({ remote: { game } });
  later(() => reactHint(), FAST ? 10 : 6000);
}

// ---------- block and report (App Store 1.2) ----------
// Press and hold another player's name at an online table. A sheet offers block, or report with an optional block.
// The game keeps running underneath; the sheet never takes a turn.
const REASONS = [['name', 'Offensive name'], ['behaviour', 'Abusive reactions'], ['cheating', 'Cheating or stalling'], ['other', 'Something else']];
function playerSheet(pi) {
  const g = store.game, r = store.remote;
  if (!g || !g.online || !r || !g.seats || !g.seats[pi]) return;
  const uid = g.seats[pi], name = g.players[pi].name;
  const t = r.client.t;
  const done = msg => {
    showModal('<h2>' + esc(msg) + '</h2><div class="btns"><button class="btn primary" id="psOk">Back to the game</button></div>');
    $('#psOk').onclick = hideModal;
  };
  const call = async body => {
    try { const x = await t.call(body); return x.status === 200 ? null : (x.body.error || 'Could not send'); } catch (e) { return friendly(e); }
  };
  showModal('<h2>' + esc(name) + '</h2><p>Blocking hides their reactions from you and stops them joining tables you host. Reports are read by a person.</p>' +
    '<div class="btns col"><button class="btn" id="psBlock">Block ' + esc(name) + '</button></div>' +
    '<h3>Report</h3><div class="chips" id="psWhy">' + REASONS.map(([k, l]) => '<button class="chip" data-k="' + k + '">' + l + '</button>').join('') + '</div>' +
    '<label class="tick"><input type="checkbox" id="psAlso" checked> Block them too</label><div class="note err" id="psNote" role="status"></div>' +
    '<div class="btns"><button class="btn" id="psCancel">Cancel</button><button class="btn primary" id="psSend" disabled>Send report</button></div>');
  let why = null;
  document.querySelectorAll('#psWhy .chip').forEach(c => c.onclick = () => {
    why = c.dataset.k;
    document.querySelectorAll('#psWhy .chip').forEach(x => x.classList.toggle('on', x === c));
    $('#psSend').disabled = false;
  });
  $('#psCancel').onclick = hideModal;
  $('#psBlock').onclick = async () => { const e = await call({ op: 'block', user: uid }); if (e) $('#psNote').textContent = e; else done(name + ' is blocked'); };
  $('#psSend').onclick = async () => {
    $('#psSend').disabled = true;
    const e = await call({ op: 'report', user: uid, code: r.code, reason: why, block: $('#psAlso').checked });
    if (e) { $('#psNote').textContent = e; $('#psSend').disabled = false; } else done('Thanks, report sent');
  };
}
let holdWired = false;
function wireHold() {
  if (holdWired) return;
  holdWired = true;
  let timer = null;
  const target = e => { const l = e.target.closest && e.target.closest('[id^="lblP"]'); return l && store.game && store.game.online ? +l.id.slice(4) : null; };
  document.addEventListener('pointerdown', e => {
    const pi = target(e);
    if (pi == null) return;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; playerSheet(pi); }, 550);
  });
  const stop = () => { clearTimeout(timer); timer = null; };
  ['pointerup', 'pointercancel', 'pointerleave', 'scroll'].forEach(n => document.addEventListener(n, stop, true));
  document.addEventListener('contextmenu', e => { const pi = target(e); if (pi != null) { e.preventDefault(); stop(); playerSheet(pi); } });
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
  showModal('<h2><span id="olInvTitle">You\'re invited</span></h2><p class="lead" id="olInvSub">Table ' + esc(code) + ' · Shiphead</p><div id="olInvRules" class="invrules"></div>' +
    identHTML(defaultName(p), (p && p.av) || '🦊') +
    '<div class="btns col"><button class="btn primary big" id="olSit">Sit down</button></div><div id="olNote" class="note" role="status"></div>' +
    '<div class="btns"><button class="btn quiet" id="olNotNow">Not now</button></div>');
  const ident = wireIdent(ok => { $('#olSit').disabled = !ok; });
  // a first-timer has only a made-up name: show the name box straight away so they can put their own in.
  // Tapping it selects the suggestion, so typing replaces it.
  if (!(p && p.name && p.name !== 'You' && p.name !== 'Player 1' && Names.check(p.name).ok)) {
    $('#olEditBox').classList.remove('hidden');
    $('#olEdit').setAttribute('aria-expanded', 'true');
    $('#olEdit').textContent = 'Done';
    $('#olMe').querySelector('small').textContent = 'Your name at the table';
  }
  $('#olName').addEventListener('focus', () => $('#olName').select());
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
  // One job per screen: the status line says what happens next, Start stays in reach at the bottom,
  // and the rules and the vote form are folded away until someone wants them.
  showModal('<h2>Table ' + esc(code) + '</h2><p class="olstatus" id="olStatus" role="status">Getting the table…</p>' +
    '<div id="olInv">' + inviteHTML(code) + '</div>' +
    '<h3>Players</h3><div id="olSeats"></div><div id="olVote"></div><div id="olLast" class="note"></div>' +
    '<details class="fold" id="olRulesBox"><summary id="olRulesSum">House rules</summary><div id="olRules"></div></details>' +
    '<details class="fold" id="olPropBox"><summary>Suggest a rule change</summary>' + proposeHTML() +
    '<p class="ex">Everyone votes, the majority wins, and the host settles a tie.</p></details><div id="olNote" class="note" role="status"></div>' +
    '<div class="btns stick"><button class="btn" id="olLeave">Leave</button><button class="btn primary" id="olStart" disabled>Start game</button></div>');
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
    const lines = Meta.summarise(lob.rules);
    $('#olRules').innerHTML = lines.map(l => '<div class="row"><span>' + esc(l) + '</span></div>').join('');
    $('#olRulesSum').textContent = 'House rules · ' + lines.length;
    cur = lob;
    const mine = c.t.uid === lob.host;
    const hostName = (lob.seats.find(s => s.id === lob.host) || {}).name || 'the host';
    const others = lob.seats.filter(s => s.id !== c.t.uid).map(s => s.name);
    $('#olStatus').textContent = lob.vote ? 'A rule change is being voted on' : mine ? (others.length ? others.join(' and ') + (others.length > 1 ? ' are' : ' is') + ' here. Start when you\'re ready' : 'Send the invite. Your friend taps it and sits straight down') : 'You\'re in. Waiting for ' + hostName + ' to start';
    // the invite stays up until the table is full; a guest can still bring someone else
    $('#olInv').classList.toggle('hidden', lob.seats.length >= (lob.max || 5));
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
    $('#olLeave').classList.toggle('wide', !mine);
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

// The game-over sheet of an online game: Rematch is the big button. If someone else asked first, it says so and one tap sits you down.
function wireRematch() {
  const r = store.remote;
  if (!r || !r.code || !$('#again')) return;
  const old = r.code, t = getTransport();
  $('#setup').textContent = 'Back to online';
  $('#setup').onclick = showOnline;
  $('#again').textContent = 'Rematch';
  const go = async () => {
    $('#again').disabled = true;
    $('#again').textContent = 'Setting the table…';
    try {
      const c2 = new Online.Client(t);
      c2.code = old;
      await c2.rematch();
      clearInterval(timer);
      showWaiting(c2);
    } catch (e) {
      if ($('#again')) { $('#again').disabled = false; $('#again').textContent = 'Rematch'; }
      const p = document.querySelector('#modal .sheet p');
      if (p) p.textContent = friendly(e);
    }
  };
  $('#again').onclick = go;
  // someone else may ask first: say who, so the tap feels like accepting
  const look = async () => {
    if (!$('#again') || $('#again').disabled) return clearInterval(timer);
    let lob;
    try { lob = await t.lobby(old); } catch (e) { return; }
    if (!lob || !lob.next || !$('#again')) return;
    let who = 'Your friend';
    try { const pk = await t.call({ op: 'peek', code: lob.next }); if (pk.status === 200) { if (pk.body.mine) return; who = pk.body.host; } } catch (e) {}
    $('#again').textContent = who + ' wants a rematch · Sit down';
  };
  const timer = setInterval(look, FAST ? 60 : 1500);
  look();
}

export { deleteOnline, playerSheet, fetchRivals, showOnline, wireRematch };

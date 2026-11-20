import { $, esc } from './dom.js';
import { store } from './state.js';
import { SFX } from './audio.js';
import { prof, unlock } from './profile.js';

// ---------- chat and quick reactions: float over the felt, never take space from the cards ----------
// Against the computer the CPUs banter back now and then, so the reactions are part of every game.
let chatMsgs = [],
  chatOpen = false,
  chatUnread = 0,
  peekT = null;

const chatOn = () => !!(store.game && store.game.meta && !store.game.meta.tour && store.settings.chat !== false);
const online = () => !!(store.game && store.game.meta && store.game.meta.online);

// CPU banter draws its own random numbers so it can never change the game's.
let seed = (Date.now() ^ 0x2545f491) >>> 0;
const rnd = () => {
  seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
const pick = a => a[rnd() * a.length | 0];

// A speech bubble over a player's seat, gone after a few seconds.
function bubble(i, text) {
  const seat = i === 0 ? $('#lblMe') : $('#lblP' + i),
    t = $('#table');
  if (!seat || !t) return;
  const r = seat.getBoundingClientRect(),
    tr = t.getBoundingClientRect();
  const b = document.createElement('div');
  b.className = 'bubble' + (i === 0 ? ' me' : '');
  b.textContent = text;
  b.style.left = Math.min(tr.width - 70, Math.max(70, r.left - tr.left + r.width / 2)) + 'px';
  b.style.top = (r.top - tr.top) + 'px';
  $('#fx').appendChild(b);
  setTimeout(() => b.remove(), 2800);
}

let lastBanter = 0;
function cpuSay(i, lines, chance) {
  if (online() || !chatOn() || i <= 0 || rnd() > chance || Date.now() - lastBanter < 3500) return;
  lastBanter = Date.now();
  const line = pick(lines);
  setTimeout(() => {
    if (!store.game || !store.game.players[i]) return;
    bubble(i, line);
    chatMsgs.push({ n: store.game.players[i].name, t: line });
    chatDraw();
  }, 500 + rnd() * 600);
}
const cpus = () => store.game.players.filter(p => p.id > 0 && !p.out).map(p => p.id);

// CPUs react to the big moments, not every card.
function reactTo(ev) {
  if (!store.game || online() || !chatOn()) return;
  const others = cpus();
  if (!others.length) return;
  if (ev.stung && ev.pi === 0) return cpuSay(pick(others), ['😂', 'Stung! 😂', 'Ouch 😬', 'Unlucky!', 'Enjoy those'], .7);
  if (ev.stung && ev.pi > 0) return cpuSay(ev.pi, ['😬', 'Ouch', 'Not again 😤'], .6);
  if (ev.burned && ev.pi === 0) return cpuSay(pick(others), ['🔥', 'Cold water, really? 💧', 'Hmm 😤'], .35);
  const big = ev.type === 'pickup' ? ev.count : ev.type === 'blind' && !ev.success ? ev.picked : 0;
  if (big >= 8 && ev.pi === 0) return cpuSay(pick(others), ['Heavy bag 🎒', '😂', 'Rock Bottom here you come 🪨'], .6);
  if (big >= 8 && ev.pi > 0) return cpuSay(ev.pi, ['😩', 'Great.', 'Don\'t say it'], .5);
}

function cpuReply(t) {
  const others = cpus();
  if (!others.length) return;
  const lines = t === '😂' ? ['😂', 'Laugh now 😏'] : t === '👍' ? ['👍', 'Cheers'] : t === '🔥' ? ['🔥', 'Calm down'] : t === '🪨' ? ['Not me 🪨', 'We\'ll see 😏'] : t === 'Nice one' ? ['Ta 😎', '👍'] : t === 'Unlucky!' ? ['Was it though 😏', '😤'] : t === 'Too slow' ? ['Thinking!', '🙄'] : ['😏', 'Bring it', 'Ha!'];
  lastBanter = 0;
  cpuSay(pick(others), lines, .6);
}

function chatDraw() {
  $('#chatlog').innerHTML = chatMsgs.slice(-2).map(m => '<div><b>' + esc(m.n) + '</b> ' + esc(m.t) + '</div>').join('');
}

function chatSync() {
  const on = chatOn();
  // reactions only, online too: a fixed list means nothing rude can be typed at the table
  $('#chatTextRow').classList.add('hidden');
  $('#chatTitle').textContent = 'React';
  $('#chatBtn').setAttribute('aria-label', 'React');
  $('#chatBtn').classList.toggle('hidden', !on || chatOpen);
  $('#chatPanel').classList.toggle('hidden', !on || !chatOpen);
  if (!on) $('#chatPeek').classList.add('hidden');
}

function chatReset() {
  chatMsgs = [];
  chatOpen = false;
  chatUnread = 0;
  clearTimeout(peekT);
  $('#chatBadge').classList.add('hidden');
  $('#chatBtn').classList.remove('unread');
  $('#chatPeek').classList.add('hidden');
  chatDraw();
  chatSync();
}

function chatIncoming(name, text) {
  if (!chatOn()) return;
  chatMsgs.push({
    n: name,
    t: String(text).slice(0, 40)
  });
  if (chatMsgs.length > 40) chatMsgs.shift();
  chatDraw();
  SFX.chat();
  if (chatOpen) return;
  chatUnread++;
  const bd = $('#chatBadge');
  bd.textContent = chatUnread > 9 ? '9+' : chatUnread;
  bd.classList.remove('hidden');
  const b = $('#chatBtn');
  b.classList.remove('unread');
  void b.offsetWidth;
  b.classList.add('unread');
  const pk = $('#chatPeek');
  pk.innerHTML = '<b>' + esc(name) + '</b> ' + esc(String(text).slice(0, 40));
  pk.classList.remove('hidden');
  clearTimeout(peekT);
  peekT = setTimeout(() => pk.classList.add('hidden'), 4000);
}

function chatSend(t) {
  t = String(t || '').trim().slice(0, 40);
  if (!t || !chatOn()) return;
  chatMsgs.push({
    n: prof().name,
    t
  });
  if (chatMsgs.length > 40) chatMsgs.shift();
  chatDraw();
  bubble(0, t);
  unlock('banter');
  // a quick reaction closes the panel so it never sits over your cards
  chatMin();
  if (!online()) cpuReply(t);
  else if (store.remote && store.remote.react) store.remote.react(t);
}

// A reaction from another player at an online table: a bubble over their seat and a line in the log.
function chatFrom(i, name, text) {
  if (!chatOn()) return;
  bubble(i, text);
  chatIncoming(name, text);
}

function chatOpenIt() {
  chatOpen = true;
  chatUnread = 0;
  $('#chatBadge').classList.add('hidden');
  $('#chatBtn').classList.remove('unread');
  $('#chatPeek').classList.add('hidden');
  chatDraw();
  chatSync();
}

function chatMin() {
  chatOpen = false;
  chatSync();
}

export function initChat() {
$('#chatBtn').onclick = chatOpenIt;
$('#chatMin').onclick = chatMin;
$('#chatPanel').querySelectorAll('.e, .q').forEach(b => b.onclick = () => chatSend(b.dataset.e));
$('#chatSend').onclick = () => {
  const i = $('#chatIn');
  chatSend(i.value);
  i.value = '';
};
$('#chatIn').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    chatSend(e.target.value);
    e.target.value = '';
  }
});
}


export { chatFrom, chatIncoming, chatOn, chatReset, chatSync, reactTo };

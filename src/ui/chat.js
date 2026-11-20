import { $, esc } from './dom.js';
import { store } from './state.js';
import { SFX } from './audio.js';
import { prof } from './profile.js';

// ---------- chat: humans only, floats over the felt, never takes space from the cards ----------
let chatMsgs = [],
  chatOpen = false,
  chatUnread = 0,
  peekT = null;

const chatOn = () => !!(store.game && store.game.meta && store.game.meta.online);

function chatDraw() {
  $('#chatlog').innerHTML = chatMsgs.slice(-2).map(m => '<div><b>' + esc(m.n) + '</b> ' + esc(m.t) + '</div>').join('');
}

function chatSync() {
  const on = chatOn();
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
  // when online tables exist, this is where the message is sent to the other players
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
$('#chatPanel').querySelectorAll('.e').forEach(b => b.onclick = () => chatSend(b.dataset.e));
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


export { chatIncoming, chatReset, chatSync };

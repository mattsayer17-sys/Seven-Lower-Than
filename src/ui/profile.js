import Shed from '../engine.js';
import { $, esc } from './dom.js';
import { save, store } from './state.js';
import { SFX } from './audio.js';
import { isSting } from './flow.js';
import { dailyStreak } from './daily.js';
import { hideModal, showModal } from './sheets.js';

// ---------- profiles, records, achievements ----------
const AVATARS = ['🐭', '🦊', '🐸', '🐙', '🦉', '🐢'];

const mkProfile = (id, name, old) => ({
  id,
  name,
  av: '🦊',
  w: old && old.w || 0,
  m: old && old.m || 0,
  g: old ? (old.w || 0) + (old.m || 0) : 0,
  h2h: {},
  ach: {},
  daily: {},
  safe: 0,
  flags: {}
});

const prof = () => store.P.list.find(p => p.id === store.P.cur);

const keyName = k => k.indexOf('cpu-') === 0 ? 'CPU ' + ({
  easy: 'Easy',
  normal: 'Medium',
  hard: 'Hard'
}[k.slice(4)] || k.slice(4)) : k.slice(2);

const ACH = [{
  id: 'tour',
  n: 'Learned the ropes',
  d: 'Finish the how to play tour',
  i: '🎓'
}, {
  id: 'win1',
  n: 'First out',
  d: 'Win a game',
  i: '🏆'
}, {
  id: 'win10',
  n: 'Regular',
  d: 'Win 10 games',
  i: '🥇'
}, {
  id: 'burn',
  n: 'Cold water',
  d: 'Pour cold water on the pile',
  i: '💧'
}, {
  id: 'four',
  n: 'Four of a kind',
  d: 'Burn the pile with four matching cards',
  i: '🃏'
}, {
  id: 'skip',
  n: 'Not so fast',
  d: 'Make another player miss a go',
  i: '⏭️'
}, {
  id: 'dskip',
  n: 'Double skip',
  d: 'Play two skip cards at once',
  i: '⏩'
}, {
  id: 'sting',
  n: 'Sting in the tail',
  d: 'Play a stinger card',
  i: '🔒'
}, {
  id: 'bag',
  n: 'Heavy bag',
  d: 'Pick up 10 or more cards in one go',
  i: '🎒'
}, {
  id: 'hard',
  n: 'Hard mode',
  d: 'Beat a Hard CPU',
  i: '💪'
}, {
  id: 'safe5',
  n: 'Escape artist',
  d: 'Stay off Rock Bottom 5 games running',
  i: '😅'
}, {
  id: 'daily1',
  n: 'Daily deal',
  d: 'Finish a daily deal',
  i: '📅'
}, {
  id: 'daily3',
  n: 'Three days running',
  d: 'Finish the daily deal 3 days in a row',
  i: '📆'
}];

const toastQ = [];

let toastBusy = false;

function toast(a) {
  toastQ.push(a);
  if (!toastBusy) nextToast();
}

// Sit the unlock just above your own hand, near the bottom of the screen, where your eyes already are.
function placeToast(t) {
  let top = window.innerHeight * .62;
  try {
    const g = store.game,
      ids = g && g.players[0] ? g.players[0].hand.concat(g.players[0].up).map(c => c.id) : [];
    const tops = ids.map(id => store.els[id]).filter(Boolean).map(el => el.getBoundingClientRect().top).filter(y => y > window.innerHeight * .4);
    if (tops.length) top = Math.min(...tops);
  } catch (e) {}
  t.style.top = Math.max(60, top - 12) + 'px';
}

function nextToast() {
  const a = toastQ.shift();
  if (!a) {
    toastBusy = false;
    return;
  }
  toastBusy = true;
  const t = $('#toast');
  t.innerHTML = '<span>' + a.i + '</span><div><em>Achievement unlocked</em><b>' + esc(a.n) + '</b><small>' + esc(a.d) + '</small></div>';
  placeToast(t);
  t.classList.add('on');
  // long enough to read and enjoy; it never blocks a tap, so play carries on underneath
  setTimeout(() => {
    t.classList.remove('on');
    setTimeout(nextToast, 300);
  }, 4500);
}

function unlock(id) {
  const p = prof(),
    a = ACH.find(x => x.id === id);
  if (!p || !a || p.ach[id]) return;
  p.ach[id] = Date.now();
  save();
  toast(a);
  SFX.ach();
}

function trackEvent(ev) {
  if (!store.game || store.game.meta && store.game.meta.tour) return;
  if (ev.pi === 0) {
    const last = ev.cards && ev.cards[ev.cards.length - 1],
      e = last && Shed.effect(store.game.rules, last);
    if (ev.burned) {
      unlock('burn');
      if (e !== 'burn') unlock('four');
    }
    if (ev.skipped != null) {
      unlock('skip');
      if (e === 'skip' && ev.cards.length >= 2) unlock('dskip');
    }
    if (isSting(ev)) unlock('sting');
  }
  const bag = ev.type === 'pickup' && ev.pi === 0 ? ev.count : ev.type === 'blind' && !ev.success && ev.pi === 0 ? ev.picked : ev.forced && ev.forced.pi === 0 ? ev.forced.count : 0;
  if (bag >= 10) unlock('bag');
}

function recordGame(g, meIdx, youMouse) {
  const p = prof();
  if (!g.meta || g.meta.tour || g.meta.online) {
    updateStats();
    return;
  }
  if (g._rec) return;
  g._rec = true;
  p.g++;
  if (meIdx === 0) p.w++;
  if (youMouse) p.m++;
  p.safe = youMouse ? 0 : p.safe + 1;
  g.players.forEach((q, i) => {
    if (i === 0) return;
    const k = g.meta.keys[i - 1] || 'cpu-normal',
      h = p.h2h[k] = p.h2h[k] || {
        w: 0,
        l: 0
      };
    if (g.finished.indexOf(0) < g.finished.indexOf(i)) h.w++;else h.l++;
  });
  const lo = g.players[g.loser];
  if (g.meta.daily && !p.daily[g.meta.daily]) p.daily[g.meta.daily] = {
    res: meIdx === 0 ? 'win' : youMouse ? 'mouse' : 'safe',
    turns: g.turns,
    left: lo ? lo.hand.length + lo.up.length + lo.down.length : 0
  };
  if (meIdx === 0) {
    unlock('win1');
    if (p.w >= 10) unlock('win10');
    if (g.meta.keys.indexOf('cpu-hard') >= 0) unlock('hard');
  }
  if (p.safe >= 5) unlock('safe5');
  if (g.meta.daily) {
    unlock('daily1');
    if (dailyStreak(p) >= 3) unlock('daily3');
  }
  save();
  updateStats();
}

function showProfile() {
  const p = prof(),
    ks = Object.keys(p.h2h);
  const rows = ks.length ? ks.map(k => {
    const h = p.h2h[k],
      t = h.w + h.l;
    return '<div class="row"><span>' + esc(keyName(k)) + '<small>' + t + ' game' + (t === 1 ? '' : 's') + '</small></span><b>' + h.w + ' – ' + h.l + '</b></div>';
  }).join('') : '<div class="row"><span>No games yet<small>Your record against each opponent builds here</small></span></div>';
  const human = ks.some(k => k.indexOf('h:') === 0);
  const ach = ACH.map(a => '<div class="ach' + (p.ach[a.id] ? ' on' : '') + '"><i>' + a.i + '</i><span><b>' + esc(a.n) + '</b><small>' + esc(a.d) + '</small></span></div>').join('');
  const profs = store.P.list.map(q => '<button class="chip pb' + (q.id === p.id ? ' on' : '') + '" data-id="' + q.id + '">' + q.av + ' ' + esc(q.name) + '</button>').join('');
  const avs = AVATARS.map(a => '<button class="av' + (a === p.av ? ' on' : '') + '" data-a="' + a + '">' + a + '</button>').join('');
  showModal('<h2>Profile</h2><div class="chips">' + profs + '</div>' + '<div class="inp"><input id="pName" maxlength="16" value="' + esc(p.name) + '" aria-label="Name"><button class="btn" id="pSave">Rename</button></div>' + '<div class="avs">' + avs + '</div>' + '<h3>Record</h3><div class="stat3"><div><b>' + p.g + '</b><small>Games</small></div><div><b>' + p.w + '</b><small>1st</small></div><div><b>' + p.m + '</b><small>🪨 Last</small></div></div>' + '<h3>Head to head</h3>' + rows + (human ? '' : '<p class="note" style="margin-top:8px">Games against other people will show here once online tables open. Records are saved on this device.</p>') + '<h3>Achievements ' + Object.keys(p.ach).length + '/' + ACH.length + '</h3><div class="achs">' + ach + '</div>' + '<div class="inp" style="margin-top:14px"><input id="pNew" maxlength="16" placeholder="New profile name" aria-label="New profile name"><button class="btn" id="pAdd">Add profile</button></div>' + '<div class="btns"><button class="btn primary" id="pClose">Done</button></div>');
  document.querySelectorAll('.pb').forEach(b => b.onclick = () => {
    store.P.cur = b.dataset.id;
    save();
    updateStats();
    showProfile();
  });
  document.querySelectorAll('.avs .av').forEach(b => b.onclick = () => {
    p.av = b.dataset.a;
    save();
    updateStats();
    showProfile();
  });
  $('#pSave').onclick = () => {
    const v = $('#pName').value.trim();
    if (v) {
      p.name = v.slice(0, 16);
      save();
      updateStats();
    }
    showProfile();
  };
  $('#pAdd').onclick = () => {
    const v = $('#pNew').value.trim();
    if (!v) return;
    const id = 'p' + Date.now();
    store.P.list.push(mkProfile(id, v.slice(0, 16)));
    store.P.cur = id;
    save();
    updateStats();
    showProfile();
  };
  $('#pClose').onclick = hideModal;
}

// ---------- daily deal ----------

function updateStats() {
  const p = prof();
  $('#stats').textContent = p.name + ' · 1st ' + p.w + ' · 🪨 ' + p.m;
  $('#bProf').textContent = p.av;
}

export function loadProfiles() {
(function () {
  try {
    const j = JSON.parse(localStorage.getItem('ms.profiles') || 'null');
    if (j && Array.isArray(j.list) && j.list.length) store.P = j;
  } catch (e) {}
  if (!store.P.list.length) store.P = {
    cur: 'p1',
    list: [mkProfile('p1', 'Player 1', store.stats)]
  };
  if (!store.P.list.some(p => p.id === store.P.cur)) store.P.cur = store.P.list[0].id;
})();
}


// for screenshots and the test driver: show an unlock pop-up without unlocking anything
const toastTest = id => toast(ACH.find(x => x.id === id) || ACH[0]);

export { prof, recordGame, showProfile, toastTest, trackEvent, unlock, updateStats };

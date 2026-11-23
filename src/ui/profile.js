import Shed from '../engine.js';
import Names from '../names.js';
import { $, esc } from './dom.js';
import { save, store } from './state.js';
import { SFX } from './audio.js';
import { isSting } from './flow.js';
import { dailyStreak } from './daily.js';
import { hideModal, showModal } from './sheets.js';
import { fetchRivals } from './online.js';

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
}, {
  id: 'clean',
  n: 'Untouchable',
  d: 'Finish a game without picking up once',
  i: '🧤'
}, {
  id: 'nosting',
  n: 'Stingproof',
  d: 'Finish a game with stingers in it without getting stung',
  i: '🛡️'
}, {
  id: 'gotyou',
  n: 'Got you',
  d: 'Sting another player with your stinger',
  i: '🦂'
}, {
  id: 'lastcard',
  n: 'Down to the wire',
  d: 'Win with your very last face-down card',
  i: '🎯'
}, {
  id: 'flawless',
  n: 'Clean sweep',
  d: 'Win before anyone else reaches their face-up cards',
  i: '🧹'
}, {
  id: 'shutout',
  n: 'Lights out',
  d: 'Win before anyone else reaches their face-down cards',
  i: '🌙'
}, {
  id: 'burn3',
  n: 'Fire brigade',
  d: 'Burn the pile three times in one game',
  i: '🚒'
}, {
  id: 'comeback',
  n: 'Comeback',
  d: 'Win after picking up 10 or more cards in one go',
  i: '🔄'
}, {
  id: 'streak3',
  n: 'Hat-trick',
  d: 'Win 3 games in a row',
  i: '🎩'
}, {
  id: 'quick',
  n: 'Speed run',
  d: 'Win a game in 40 turns or fewer',
  i: '⚡'
}, {
  id: 'full',
  n: 'Full table',
  d: 'Win a 5-player game',
  i: '👑'
}, {
  id: 'win50',
  n: 'Card shark',
  d: 'Win 50 games',
  i: '🦈'
}, {
  id: 'games25',
  n: 'Pull up a chair',
  d: 'Play 25 games',
  i: '🪑'
}, {
  id: 'daily7',
  n: 'Week of deals',
  d: 'Finish the daily deal 7 days in a row',
  i: '🗓️'
}, {
  id: 'banter',
  n: 'Banter',
  d: 'Send a reaction at the table',
  i: '💬'
}, {
  id: 'rules',
  n: 'House rules',
  d: 'Save your own set of rules',
  i: '📜'
}, {
  id: 'host',
  n: 'Host',
  d: 'Make an online table for friends',
  i: '🏠'
}, {
  id: 'collector',
  n: 'Collector',
  d: 'Unlock 20 achievements',
  i: '🏅'
}];

// What happened this game, for the end-of-game achievements. Kept on the game object so a new deal starts clean.
function gameLog() {
  const g = store.game;
  return g._ach || (g._ach = { picked: false, stung: false, burns: 0, bag: false, oppUp: false, oppDown: false, lastBlind: false, stingBy: -1 });
}

const toastQ = [];

let toastBusy = false;

function toast(a) {
  toastQ.push(a);
  if (!toastBusy) nextToast();
}

// The unlock sits along the top, over the header, so it never covers any card you might need to see or tap.
function placeToast(t) {
  t.style.top = 6 + t.offsetHeight + 'px';
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
  if (id !== 'collector' && Object.keys(p.ach).length >= 20) unlock('collector');
}

function trackEvent(ev) {
  if (!store.game || store.game.meta && store.game.meta.tour) return;
  const L = gameLog();
  if (ev.pi === 0) {
    if (ev.burned) L.burns++;
    L.lastBlind = ev.type === 'blind' && !!ev.success;
    if (ev.type === 'pickup' || ev.type === 'blind' && !ev.success) L.picked = true;
    if (ev.stung) L.stung = true;
  } else {
    if (ev.from === 'up') L.oppUp = true;
    if (ev.type === 'blind') { L.oppUp = true; L.oppDown = true; }
    if (ev.stung && L.stingBy === 0) unlock('gotyou');
  }
  if (ev.forced && ev.forced.pi === 0) L.picked = true;
  if (isSting(ev)) L.stingBy = ev.pi;
  if (L.burns >= 3) unlock('burn3');
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
  if (bag >= 10) {
    unlock('bag');
    L.bag = true;
  }
}

function recordGame(g, meIdx, youMouse) {
  const p = prof();
  if (!g.meta || g.meta.tour) {
    updateStats();
    return;
  }
  if (g._rec) return;
  g._rec = true;
  p.g++;
  if (meIdx === 0) p.w++;
  if (youMouse) p.m++;
  p.safe = youMouse ? 0 : p.safe + 1;
  // Head to head: against each CPU level, and online against each person by their account, so it survives a rename.
  // For people it also keeps the Rock Bottom tally both ways, because that is the bit friends rib each other about.
  g.players.forEach((q, i) => {
    if (i === 0) return;
    const human = g.meta.online && g.seats && g.seats[i];
    const k = human ? 'h:' + g.seats[i] : g.meta.keys[i - 1] || 'cpu-normal',
      h = p.h2h[k] = p.h2h[k] || {
        w: 0,
        l: 0
      };
    if (g.finished.indexOf(0) < g.finished.indexOf(i)) h.w++;else h.l++;
    if (human) {
      h.n = q.name;
      if (g.loser === i) h.theyRb = (h.theyRb || 0) + 1;
      if (g.loser === 0) h.meRb = (h.meRb || 0) + 1;
      h.at = Date.now();
    }
  });
  const lo = g.players[g.loser];
  if (g.meta.daily && !p.daily[g.meta.daily]) p.daily[g.meta.daily] = {
    res: meIdx === 0 ? 'win' : youMouse ? 'mouse' : 'safe',
    turns: g.turns,
    left: lo ? lo.hand.length + lo.up.length + lo.down.length : 0
  };
  p.ws = meIdx === 0 ? (p.ws || 0) + 1 : 0;
  const L = g._ach || {};
  const hasSting = Shed.RANK_LIST.some(k => g.rules.ranks[k].effect === 'stinger');
  if (!youMouse && !L.picked) unlock('clean');
  if (!youMouse && hasSting && !L.stung) unlock('nosting');
  if (meIdx === 0) {
    unlock('win1');
    if (p.w >= 10) unlock('win10');
    if (p.w >= 50) unlock('win50');
    if (g.meta.keys.indexOf('cpu-hard') >= 0) unlock('hard');
    if (L.lastBlind) unlock('lastcard');
    if (!L.oppDown) unlock('shutout');
    if (!L.oppUp) unlock('flawless');
    if (L.bag) unlock('comeback');
    if (p.ws >= 3) unlock('streak3');
    if (g.turns <= 40) unlock('quick');
    if (g.players.length === 5) unlock('full');
  }
  if (p.safe >= 5) unlock('safe5');
  if (p.g >= 25) unlock('games25');
  if (g.meta.daily) {
    unlock('daily1');
    if (dailyStreak(p) >= 3) unlock('daily3');
    if (dailyStreak(p) >= 7) unlock('daily7');
  }
  save();
  updateStats();
}

// One line per opponent: people first, most played first, then the CPU levels.
function h2hRows(p) {
  const ks = Object.keys(p.h2h);
  const tot = k => p.h2h[k].w + p.h2h[k].l;
  ks.sort((a, b) => (b.indexOf('h:') === 0) - (a.indexOf('h:') === 0) || tot(b) - tot(a));
  return ks.length ? ks.map(k => {
    const h = p.h2h[k],
      t = h.w + h.l,
      nm = h.n || keyName(k),
      rb = k.indexOf('h:') === 0 && (h.theyRb || h.meRb) ? ' · 🪨 ' + nm + ' ' + (h.theyRb || 0) + ', you ' + (h.meRb || 0) : '';
    return '<div class="row"><span>' + esc(nm) + '<small>' + t + ' game' + (t === 1 ? '' : 's') + esc(rb) + '</small></span><b>' + h.w + ' – ' + h.l + '</b></div>';
  }).join('') : '<div class="row"><span>No games yet<small>Your record against each opponent builds here</small></span></div>';
}

// The server's count wins for people played online; the copy on the device is only a cache for when it can't be reached.
// Returns true if anything changed.
function applyRivals(map) {
  const p = prof();
  if (!p || !map) return false;
  let changed = false;
  for (const uid of Object.keys(map)) {
    const s = map[uid], k = 'h:' + uid, h = p.h2h[k] = p.h2h[k] || { w: 0, l: 0 };
    for (const f of ['w', 'l', 'meRb', 'theyRb']) if ((h[f] || 0) !== (s[f] || 0)) { h[f] = s[f] || 0; changed = true; }
  }
  if (changed) save();
  return changed;
}

// Bring the online records up to date from the server, then redraw whatever is showing them.
function syncRivals(uids, redraw) {
  fetchRivals(uids).then(m => { if (applyRivals(m) && redraw) redraw(); });
}

function showProfile() {
  const p = prof(),
    ks = Object.keys(p.h2h);
  const rows = '<div id="pH2h">' + h2hRows(p) + '</div>';
  const human = ks.some(k => k.indexOf('h:') === 0);
  const ach = ACH.map(a => '<div class="ach' + (p.ach[a.id] ? ' on' : '') + '"><i>' + a.i + '</i><span><b>' + esc(a.n) + '</b><small>' + esc(a.d) + '</small></span></div>').join('');
  const profs = store.P.list.map(q => '<button class="chip pb' + (q.id === p.id ? ' on' : '') + '" data-id="' + q.id + '">' + q.av + ' ' + esc(q.name) + '</button>').join('');
  const avs = AVATARS.map(a => '<button class="av' + (a === p.av ? ' on' : '') + '" data-a="' + a + '">' + a + '</button>').join('');
  showModal('<h2>Profile</h2><div class="chips">' + profs + '</div>' + '<div class="inp"><input id="pName" maxlength="16" value="' + esc(p.name) + '" aria-label="Name"><button class="btn" id="pSave">Rename</button></div><div class="note err" id="pNote" role="status"></div>' + '<div class="avs">' + avs + '</div>' + '<h3>Record</h3><div class="stat3"><div><b>' + p.g + '</b><small>Games</small></div><div><b>' + p.w + '</b><small>1st</small></div><div><b>' + p.m + '</b><small>🪨 Last</small></div></div>' + '<h3>Head to head</h3>' + rows + (human ? '' : '<p class="note" style="margin-top:8px">Play friends online and your record against each of them builds here, the same on their phone as on yours.</p>') + '<h3>Achievements ' + Object.keys(p.ach).length + '/' + ACH.length + '</h3><div class="achs">' + ach + '</div>' + '<div class="inp" style="margin-top:14px"><input id="pNew" maxlength="16" placeholder="New profile name" aria-label="New profile name"><button class="btn" id="pAdd">Add profile</button></div>' + '<div class="btns"><button class="btn primary" id="pClose">Done</button></div>');
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
    const nc = Names.check($('#pName').value);
    if (!nc.ok) { $('#pNote').textContent = nc.error; return; }
    p.name = nc.name;
    save();
    updateStats();
    showProfile();
  };
  $('#pAdd').onclick = () => {
    const nc = Names.check($('#pNew').value);
    if (!nc.ok) { if ($('#pNew').value.trim()) $('#pNote').textContent = nc.error; return; }
    const v = nc.name;
    const id = 'p' + Date.now();
    store.P.list.push(mkProfile(id, v.slice(0, 16)));
    store.P.cur = id;
    save();
    updateStats();
    showProfile();
  };
  $('#pClose').onclick = hideModal;
  const people = ks.filter(k => k.indexOf('h:') === 0).map(k => k.slice(2));
  if (people.length) syncRivals(people, () => { const el = $('#pH2h'); if (el) el.innerHTML = h2hRows(prof()); });
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

// The running tally against the people at this table, for the game-over sheet: "You 7 – 4 Tali".
function rivalryHTML(g) {
  const p = prof();
  if (!p || !g.meta || !g.meta.online || !g.seats) return '';
  const lines = g.seats.slice(1).map((uid, j) => {
    const h = p.h2h['h:' + uid];
    if (!h) return '';
    return '<div class="rival"><span>You <b>' + h.w + ' – ' + h.l + '</b> ' + esc(h.n || g.players[j + 1].name) + '</span>' + (h.theyRb || h.meRb ? '<small>🪨 ' + esc(h.n || '') + ' ' + (h.theyRb || 0) + ' · you ' + (h.meRb || 0) + '</small>' : '') + '</div>';
  }).join('');
  return lines ? '<div class="rivals" id="rivals">' + lines + '</div>' : '';
}

export { AVATARS, prof, recordGame, rivalryHTML, syncRivals, showProfile, toastTest, trackEvent, unlock, updateStats };

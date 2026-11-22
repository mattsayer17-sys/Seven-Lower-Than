// First launch: a welcome sheet, shown once per profile. Three ways in: watch the walkthrough, read how it works, or just play.
// The written version also serves anyone who cannot follow the animated tour.
import Meta from '../rules-meta.js';
import Names from '../names.js';
import Shed from '../engine.js';
import { $, esc } from './dom.js';
import { FAST, save, store } from './state.js';
import { prof, updateStats } from './profile.js';
import { hideModal, showModal } from './sheets.js';
import { startDemo } from './tour.js';

// First launch: nothing stands between opening the app and playing. The cards are already dealt.
// Once the deal settles, a small card on the felt (not a pop-up) offers the rules. Ignoring it is fine:
// your first move puts it away. No name is asked here; one is suggested and only shown when going online.
export function maybeWelcome() {
  const p = prof();
  if (!p || (FAST && !window.__MS_WELCOME)) return false;
  // not new: has played, or already met the old walkthrough offer
  if (p.flags.welcomed || p.flags.offer || p.g > 0) return false;
  // an online game is play already: no getting-started card over someone else's cards, now or later
  if (store.remote || (store.game && store.game.online)) { p.flags.welcomed = true; save(); return true; }
  if (store.tour || store.demo || store.ui.intro || store.ui.busy || !$('#modal').classList.contains('hidden')) return false;
  p.flags.welcomed = true;
  if (!p.name || p.name === 'Player 1' || p.name === 'You') p.name = Names.suggest();
  save();
  updateStats();
  showWelcome();
  return true;
}

let coachKeys = null;
export function hideWelcome() {
  const c = $('#coach');
  if (!c) return;
  c.classList.remove('on');
  setTimeout(() => c.remove(), FAST ? 0 : 250);
  if (coachKeys) document.removeEventListener('keydown', coachKeys);
  coachKeys = null;
}

// The house rules people already play by, right on the felt: the fixed ones in a line, the usual extras as switches
// with the card picker beside them. Change a switch and the game that's dealt plays by it. No pop-up, no form.
const QUICK = [
  { key: 'sevensLower', name: 'Seven lower than', tip: 'After a 7, play 7 or lower' },
  { key: 'skipOn', rank: 'skipRank', name: 'Skip a go', tip: 'Next player misses a turn' },
  { key: 'transparentOn', rank: 'transparentRank', name: 'Invisible card', tip: 'Plays on anything, the card under still counts' },
  { key: 'stinger', rank: 'stinger', name: 'Stinger', tip: 'Only the same card can go on it' },
  { key: 'fourBurns', name: 'Four of a kind burns', tip: 'Four the same in a row clears the pile' },
  { key: 'blindFollow', name: 'Face-down follow-up', tip: 'After a face-down card goes on, try another: a match goes on, a miss goes in your hand' }
];
const stIdx = () => store.settings.custom.findIndex(r => r.effect === 'stinger');
const isOn = q => q.key === 'stinger' ? stIdx() >= 0 && store.settings.custom[stIdx()].on !== false : !!store.settings[q.key];
const rankOf = q => q.key === 'stinger' ? (stIdx() >= 0 ? store.settings.custom[stIdx()].rank : store.settings.stingerRank || '9') : store.settings[q.rank] || (q.key === 'skipOn' ? '8' : '4');
// ranks taken by the other rules, so two rules never share a card
function taken(q) {
  const o = Object.assign({}, store.settings, { custom: store.settings.custom.filter((r, j) => !(q.key === 'stinger' && j === stIdx())) });
  if (q.key === 'skipOn') o.skipOn = false;
  if (q.key === 'transparentOn') o.transparentOn = false;
  return Meta.heldRanks(o);
}
function quickRows() {
  return QUICK.map((q, i) => {
    const pick = q.rank ? '<select class="qr" data-i="' + i + '" aria-label="' + q.name + ' card">' + Meta.PICKABLE.map(k => { const t = taken(q)[k]; return '<option value="' + k + '"' + (k === rankOf(q) ? ' selected' : '') + (t && k !== rankOf(q) ? ' disabled' : '') + '>' + k + '</option>'; }).join('') + '</select>' : q.key === 'sevensLower' ? '<i class="qfix">7</i>' : '';
    return '<label class="qrow"><input type="checkbox" switch class="qs" data-i="' + i + '"' + (isOn(q) ? ' checked' : '') + '><span><b>' + q.name + '</b><small>' + q.tip + '</small></span>' + pick + '</label>';
  }).join('');
}
// apply the switches to the settings, and to the dealt game while no card has been played
function applyQuick(i, rank) {
  const q = QUICK[i], on = $('.qs[data-i="' + i + '"]').checked;
  // switching on with a card another rule already uses: move to the first free card
  if (on && q.rank) {
    const t = taken(q), want = rank || rankOf(q);
    rank = t[want] ? Meta.PICKABLE.find(k => !t[k]) || want : want;
  }
  if (q.key === 'stinger') {
    const list = store.settings.custom.filter((r, j) => j !== stIdx());
    const rk = rank || rankOf(q);
    store.settings.stingerRank = rk;
    store.settings.custom = on ? list.concat([{ rank: rk, effect: 'stinger', on: true }]) : list;
  } else {
    store.settings[q.key] = on;
    if (q.rank && rank) store.settings[q.rank] = rank;
  }
  save();
  const g = store.game;
  if (g && !g.online && !g.meta.daily && !g.meta.tour && (g.phase === 'swap' || g.turns === 0)) g.rules = Shed.makeRuleset(store.settings);
  $('#qrows').innerHTML = quickRows();
  wireQuick();
}
function wireQuick() {
  document.querySelectorAll('#qrows .qs').forEach(x => x.onchange = () => applyQuick(+x.dataset.i));
  document.querySelectorAll('#qrows .qr').forEach(x => {
    x.onclick = e => e.stopPropagation();
    x.onchange = () => { const cb = $('.qs[data-i="' + x.dataset.i + '"]'); cb.checked = true; applyQuick(+x.dataset.i, x.value); };
  });
}

export function showWelcome() {
  hideWelcome();
  const g = store.game, live = !!(g && g.phase === 'play' && g.turns > 0);
  const c = document.createElement('section');
  c.id = 'coach';
  c.setAttribute('role', 'region');
  c.setAttribute('aria-label', 'Getting started');
  c.innerHTML = '<button class="x" id="wPlay" aria-label="Just play">×</button>' +
    '<b>Get rid of all your cards</b><span>Play the same or higher. Whoever\'s left holding cards hits Rock Bottom. <button class="lnk" id="wWatch">Show me (30 s)</button></span>' +
    '<h4>Your house rules</h4><p class="qfixed">Always on: 2 resets · 10 burns · Ace high</p>' +
    '<div id="qrows">' + quickRows() + '</div>' +
    '<div class="cbtns"><button class="btn sm" id="wRead">How to play</button><button class="btn sm primary" id="wGo">Play</button></div>' +
    '<p class="qmore">' + (live ? 'Changes start with your next game. ' : '') + 'More in New → Rules: your own card rules, saved sets, share codes</p>';
  $('#table').appendChild(c);
  void c.offsetWidth;
  c.classList.add('on');
  wireQuick();
  $('#wWatch').onclick = () => { hideWelcome(); startDemo(); };
  $('#wRead').onclick = () => { hideWelcome(); showPrimer(); };
  $('#wPlay').onclick = hideWelcome;
  $('#wGo').onclick = hideWelcome;
  coachKeys = e => { if (e.key === 'Escape' && $('#modal').classList.contains('hidden')) hideWelcome(); };
  document.addEventListener('keydown', coachKeys);
}

export function showPrimer() {
  const specials = Meta.summarise(store.settings).map(t => '<li>' + esc(t) + '</li>').join('');
  showModal('<h2>How it works</h2><ol class="primer">' +
    '<li><b>Deal and swap.</b> You get three cards in hand, three face up and three face down. Before play you get one chance to swap hand cards with your face-up cards, then lock in.</li>' +
    '<li><b>Play.</b> The lowest card starts. Play a card equal to or higher than the one on top of the pile.</li>' +
    '<li><b>Special cards at this table.</b><ul>' + specials + '</ul></li>' +
    '<li><b>Stuck?</b> Pick up the pile. While the draw pile lasts, your hand refills to three after you play.</li>' +
    '<li><b>Running low.</b> When your hand is gone, play your face-up cards. After those, flip face-down cards without looking. If one cannot be played, you pick up the pile.</li>' +
    '<li><b>Winning.</b> Get rid of everything and you are out. The last player holding cards hits Rock Bottom.</li></ol>' +
    '<div class="btns"><button class="btn" id="pmWatch">Watch the walkthrough</button><button class="btn primary" id="pmDone">Got it</button></div>');
  $('#pmWatch').onclick = () => { hideModal(); startDemo(); };
  $('#pmDone').onclick = hideModal;
}

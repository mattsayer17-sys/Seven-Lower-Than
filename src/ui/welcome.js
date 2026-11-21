// First launch: a welcome sheet, shown once per profile. Three ways in: watch the walkthrough, read how it works, or just play.
// The written version also serves anyone who cannot follow the animated tour.
import Meta from '../rules-meta.js';
import Names from '../names.js';
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

export function showWelcome() {
  hideWelcome();
  const c = document.createElement('section');
  c.id = 'coach';
  c.setAttribute('role', 'region');
  c.setAttribute('aria-label', 'Getting started');
  c.innerHTML = '<button class="x" id="wPlay" aria-label="Just play">×</button>' +
    '<b>Get rid of all your cards</b><span>Play the same or higher. Whoever\'s left holding cards hits Rock Bottom.</span>' +
    '<div class="cbtns"><button class="btn sm primary" id="wWatch">Show me (30 s)</button><button class="btn sm" id="wRead">Rules</button></div>';
  $('#table').appendChild(c);
  void c.offsetWidth;
  c.classList.add('on');
  $('#wWatch').onclick = () => { hideWelcome(); startDemo(); };
  $('#wRead').onclick = () => { hideWelcome(); showPrimer(); };
  $('#wPlay').onclick = hideWelcome;
  coachKeys = e => { if (e.key === 'Escape' && $('#modal').classList.contains('hidden')) hideWelcome(); };
  document.addEventListener('keydown', coachKeys);
}

// The same story as the walkthrough, in words, using this table's own special cards.
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

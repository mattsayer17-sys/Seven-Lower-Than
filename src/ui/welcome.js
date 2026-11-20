// First launch: a welcome sheet, shown once per profile. Three ways in: watch the walkthrough, read how it works, or just play.
// The written version also serves anyone who cannot follow the animated tour.
import Meta from '../rules-meta.js';
import Names from '../names.js';
import { $, esc } from './dom.js';
import { FAST, save, store } from './state.js';
import { prof, updateStats } from './profile.js';
import { hideModal, showModal } from './sheets.js';
import { startDemo } from './tour.js';

// Called on a timer after launch. True once it has shown the sheet, so the timer can stop.
export function maybeWelcome() {
  const p = prof();
  if (!p || (FAST && !window.__MS_WELCOME)) return false;
  // not new: has played, or already met the old walkthrough offer
  if (p.flags.welcomed || p.flags.offer || p.g > 0) return false;
  if (store.tour || store.demo || store.ui.intro || store.ui.busy || !$('#modal').classList.contains('hidden')) return false;
  p.flags.welcomed = true;
  save();
  showWelcome();
  return true;
}

export function showWelcome() {
  const p = prof();
  // a ready-made name so anyone can tap straight through; 🎲 rolls another
  const named = p.name && p.name !== 'You' && p.name !== 'Player 1' ? p.name : Names.suggest();
  showModal('<h2>Welcome to Seven Lower Than</h2>' +
    '<p>Get rid of all your cards. Whoever is left holding cards hits Rock Bottom.</p>' +
    '<div class="inp"><input id="wName" maxlength="16" placeholder="What should we call you?" aria-label="Your name" autocomplete="off" value="' + esc(named) + '"><button class="btn" id="wRoll" aria-label="Suggest another name">🎲</button></div><div class="note" id="wNote" role="status"></div>' +
    '<div class="btns col"><button class="btn primary" id="wWatch">Watch a short walkthrough</button><button class="btn" id="wRead">Read how it works</button><button class="btn" id="wPlay">Just play</button></div>' +
    '<p class="ex">The walkthrough and the written version are in Setup any time, and so is the switch for table tips.</p>');
  // false (and a note) if the name cannot be used, so the sheet stays open
  const saveName = () => {
    const nc = Names.check($('#wName').value);
    $('#wNote').textContent = '';
    if (!nc.ok) {
      if (!$('#wName').value.trim()) return true; // blank: keep whatever name the profile has
      $('#wNote').textContent = nc.error;
      $('#wNote').className = 'note err';
      $('#wName').focus();
      return false;
    }
    if (nc.name !== p.name) {
      p.name = nc.name;
      save();
      updateStats();
    }
    return true;
  };
  $('#wRoll').onclick = () => { $('#wName').value = Names.suggest(); saveName(); };
  $('#wName').onchange = saveName;
  $('#wName').addEventListener('keydown', e => { if (e.key === 'Enter' && saveName()) $('#wWatch').focus(); });
  $('#wWatch').onclick = () => { if (!saveName()) return; hideModal(); startDemo(); };
  $('#wRead').onclick = () => { if (saveName()) showPrimer(); };
  $('#wPlay').onclick = () => { if (saveName()) hideModal(); };
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

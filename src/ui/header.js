import { $, esc } from './dom.js';
import { save, store } from './state.js';
import { SFX } from './audio.js';
import { render } from './render.js';
import { showProfile } from './profile.js';
import { startDemo } from './tour.js';
import { hideModal, showLegend, showModal } from './sheets.js';
import { showSetup } from './setup.js';

const sndIcon = () => {
  const b = $('#bSnd');
  b.textContent = store.settings.sound ? '\u{1F50A}' : '\u{1F507}';
  b.setAttribute('aria-label', 'Sound');
  b.setAttribute('aria-pressed', String(!!store.settings.sound));
};

export function initHeader() {
$('#msg').onclick = () => {
  if (!store.game || !store.ui.log || !store.ui.log.length) return;
  showModal('<h2>Recent moves</h2>' + store.ui.log.slice().reverse().map(t => '<div class="row"><span>' + esc(t) + '</span></div>').join('') + '<div class="btns"><button class="btn primary" id="lgClose">Close</button></div>');
  $('#lgClose').onclick = hideModal;
};
$('#bProf').onclick = showProfile;
$('#stats').onclick = showProfile;
$('#capSkip').onclick = () => {
  if (store.demo) {
    store.demo.abort = true;
    if (store.demo.release) store.demo.release();
  }
};
$('#capNext').onclick = () => {
  if (store.demo && store.demo.release) store.demo.release();
};
$('#offNo').onclick = () => $('#offer').classList.add('hidden');
$('#offYes').onclick = () => {
  $('#offer').classList.add('hidden');
  startDemo();
};

// ---------- sheets ----------
$('#bSnd').onclick = () => {
  store.settings.sound = !store.settings.sound;
  save();
  sndIcon();
  if (store.settings.sound) SFX.play();
};
sndIcon();
$('#bRules').onclick = () => {
  if (store.game) showLegend();
};
// Mid online game, New would quietly walk out on the others. Ask first, and say how to get back.
$('#bNew').onclick = () => {
  const g = store.game;
  if (!(store.remote && g && g.online && g.phase !== 'over')) return showSetup();
  showModal('<h2>Leave this game?</h2><p>The others will be left waiting for you. You can come back to it from Play online, under Your tables.</p>' +
    '<div class="btns"><button class="btn" id="lvGo">Leave for now</button><button class="btn primary" id="lvStay">Keep playing</button></div>');
  $('#lvStay').onclick = hideModal;
  $('#lvGo').onclick = showSetup;
};
window.addEventListener('resize', () => render());
}


export { sndIcon };

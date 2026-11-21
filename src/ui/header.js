import { $, esc } from './dom.js';
import { save, store } from './state.js';
import { SFX } from './audio.js';
import { render } from './render.js';
import { showProfile } from './profile.js';
import { startDemo } from './tour.js';
import { hideModal, showLegend, showModal } from './sheets.js';
import { showSetup } from './setup.js';

const SND_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
const SND_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/></svg>';
const sndIcon = () => {
  const b = $('#bSnd');
  b.innerHTML = store.settings.sound ? SND_ON : SND_OFF;
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
$('#bNew').onclick = showSetup;
window.addEventListener('resize', () => render());
}


export { sndIcon };

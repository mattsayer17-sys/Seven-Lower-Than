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
// Mid online game, New would quietly walk out on the others. Ask first, and say how to get back.
$('#bNew').onclick = () => {
  const g = store.game;
  if (!(store.remote && g && g.online && g.phase !== 'over')) return showSetup();
  showModal('<h2>Leave this game?</h2><p>Leave for now and come back from Play online, under Your tables. If you are away for 90 seconds on your go, the computer plays it for you.</p><p>Leave for good and the computer takes your seat. You finish last.</p>' +
    '<div class="btns col"><button class="btn primary" id="lvStay">Keep playing</button><button class="btn" id="lvGo">Leave for now</button><button class="btn danger" id="lvQuit">Leave for good</button></div>');
  $('#lvStay').onclick = hideModal;
  $('#lvGo').onclick = showSetup;
  $('#lvQuit').onclick = async () => {
    const r = store.remote;
    $('#lvQuit').disabled = true;
    try { if (r) await r.client.t.call({ op: 'leave_game', code: r.code }); } catch (e) { /* the 90s rule covers it */ }
    showSetup();
  };
};
window.addEventListener('resize', () => render());
}


export { sndIcon };

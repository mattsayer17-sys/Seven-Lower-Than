import Shed from '../engine.js';
import { $, esc } from './dom.js';
import { later, ordinal, store } from './state.js';
import { SFX } from './audio.js';
import { newGame } from './flow.js';
import { recordGame } from './profile.js';
import { dailyBlock, wireShare } from './daily.js';
import { showSetup } from './setup.js';
import { showOnline, wireRematch } from './online.js';

// ---------- sheets ----------
// A sheet may set m.onchange / m.onclick. They are cleared whenever a sheet opens or closes,
// so a handler from an earlier sheet never runs against a later one.
let returnTo = null;
const walking = () => $('#app').classList.contains('walk');
const seen = () => !$('#modal').classList.contains('hidden');

// buttons that act as a choice report which one is chosen
export function syncPressed() {
  document.querySelectorAll('#modal .seg button, #modal .sw button').forEach(b => b.setAttribute('aria-pressed', String(b.classList.contains('on'))));
}

function showModal(html) {
  const m = $('#modal');
  if (!seen() && !walking()) returnTo = document.activeElement;
  m.onchange = null;
  m.onclick = null;
  m.innerHTML = '<div class="sheet">' + html + '</div>';
  m.classList.remove('hidden');
  syncPressed();
  if (walking()) return;
  // a sheet is a dialog: named by its heading, the page behind it is switched off, focus moves in
  const sh = m.firstChild, h = sh.querySelector('h2');
  sh.setAttribute('role', 'dialog');
  sh.setAttribute('aria-modal', 'true');
  sh.tabIndex = -1;
  if (h) { h.id = 'sheetTitle'; sh.setAttribute('aria-labelledby', 'sheetTitle'); }
  ['header', '#table'].forEach(s => { const e = $(s); if (e) e.inert = true; });
  sh.focus({ preventScroll: true });
}

function hideModal() {
  const m = $('#modal');
  m.onchange = null;
  m.onclick = null;
  m.classList.add('hidden');
  ['header', '#table'].forEach(s => { const e = $(s); if (e) e.inert = false; });
  const r = returnTo;
  returnTo = null;
  if (r && r.isConnected && r.focus && !walking()) r.focus({ preventScroll: true });
}

// Escape closes a sheet the way its own Back / Keep playing / Close button would. Pressed state follows clicks.
function initDialogs() {
  const m = $('#modal');
  const after = () => setTimeout(syncPressed, 0);
  m.addEventListener('click', after);
  m.addEventListener('change', after);
  // Tab and Shift+Tab wrap round inside an open sheet, so focus never drops out to the page behind
  document.addEventListener('keydown', e => {
    if (e.key !== 'Tab' || !seen() || walking()) return;
    const f = [...m.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null && x.tabIndex >= 0);
    if (!f.length) return;
    const first = f[0],
      last = f[f.length - 1],
      a = document.activeElement;
    if (e.shiftKey && (a === first || !m.contains(a))) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && (a === last || !m.contains(a))) { e.preventDefault(); first.focus(); }
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !seen() || walking()) return;
    const b = ['#tblLeave', '#rClose', '#lClose', '#lgClose', '#pClose', '#olClose', '#lvStay'].map(s => m.querySelector(s)).find(Boolean);
    e.preventDefault();
    if (b) b.click(); else hideModal();
  });
}

function showOver() {
  const g = store.game,
    meIdx = g.finished.indexOf(0),
    youMouse = g.loser === 0;
  recordGame(g, meIdx, youMouse);
  (youMouse ? SFX.lose : SFX.win)();
  const head = youMouse ? "You hit Rock Bottom" : meIdx === 0 ? "You're out first!" : "You're safe";
  let sub = youMouse ? 'Last one holding cards. Shuffle up and get revenge.' : meIdx === 0 ? 'Every card gone before anyone else. ' + g.players[g.loser].name + ' hits Rock Bottom.' : g.players[g.loser].name + ' hits Rock Bottom this round.';
  if (g.stalemate) sub = 'This one ran long, so the most cards left decided it. ' + sub;
  const rows = g.finished.map((id, i) => '<div class="place' + (id === 0 ? ' me' : '') + '"><span>' + (i === g.finished.length - 1 ? '🪨 Last' : ordinal(i + 1)) + '</span><b>' + g.players[id].name + '</b></div>').join('');
  later(() => {
    const dh = g.meta && g.meta.daily ? dailyBlock(g.meta.daily) : '';
    showModal('<h2>' + head + '</h2><p>' + sub + '</p>' + rows + dh + '<div class="btns"><button class="btn" id="setup">Setup</button><button class="btn primary" id="again">' + (g.online ? 'Back to online' : 'Play again') + '</button></div>');
    $('#again').onclick = g.online ? showOnline : () => newGame();
    $('#setup').onclick = showSetup;
    if (g.online) wireRematch();
    wireShare(g.meta && g.meta.daily);
  }, 500);
}

function showLegend() {
  const r = store.game.rules;
  const order = Shed.RANK_LIST.slice().sort((a, b) => r.ranks[a].power - r.ranks[b].power || Shed.RANK_LIST.indexOf(a) - Shed.RANK_LIST.indexOf(b));
  const sp = Shed.RANK_LIST.filter(k => r.ranks[k].effect);
  const rows = sp.map(k => '<div class="row"><span><b style="color:var(--brass2)">' + k + '</b> &nbsp;' + esc(Shed.EFFECT_INFO[r.ranks[k].effect]) + '</span></div>').join('') || '<div class="row"><span>No special cards</span></div>';
  showModal('<h2>This table</h2><p>Lowest card starts. Play equal or higher than the pile.' + (r.fourOfAKindBurns ? ' Four of a kind in a row burns the pile.' : '') + '</p>' + '<h3>Special cards</h3>' + rows + '<h3>Order, low to high</h3><p>' + order.join(' › ') + '</p>' + '<div class="btns"><button class="btn" id="lClose">Close</button><button class="btn primary" id="lSetup">Change rules</button></div>');
  $('#lClose').onclick = hideModal;
  $('#lSetup').onclick = () => showSetup('rules');
}

export { hideModal, initDialogs, showLegend, showModal, showOver };

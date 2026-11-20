// Screen reader and keyboard support for the table.
// The cards on the felt are pictures: they are hidden from assistive tech (so a face-down or opponent card can never be read out).
// In their place #sr holds a plain description of the table and one real button per card the player can reach.
import Access from '../a11y.js';
import { $, esc } from './dom.js';
import { store } from './state.js';

// main.js plugs the real tap handler in here, which avoids an import loop with input.js
export const hooks = { tap: null };
let sig = '';
let sr = null;

export function initAccess() {
  ['#cards', '#ring', '#wm', '#flash', '#fx', '#dir', '#drawCount', '#lock'].forEach(s => $(s).setAttribute('aria-hidden', 'true'));
  [['#status', 'status'], ['#msg', 'status'], ['#toast', 'status']].forEach(([s, r]) => { const e = $(s); e.setAttribute('role', r); e.setAttribute('aria-live', 'polite'); e.setAttribute('aria-atomic', 'true'); });
  const log = $('#chatlog');
  log.setAttribute('role', 'log');
  log.setAttribute('aria-live', 'polite');
  sr = document.createElement('section');
  sr.id = 'sr';
  sr.className = 'sr';
  sr.setAttribute('aria-label', 'Table');
  $('#table').insertBefore(sr, $('#table').firstChild);
  sr.addEventListener('click', e => {
    const b = e.target.closest('button[data-id]');
    if (b && hooks.tap) hooks.tap(+b.dataset.id);
  });
  sr.addEventListener('focusin', e => { const b = e.target.closest('button[data-id]'); const el = b && store.els[b.dataset.id]; if (el) el.classList.add('kfocus'); });
  sr.addEventListener('focusout', e => { const b = e.target.closest('button[data-id]'); const el = b && store.els[b.dataset.id]; if (el) el.classList.remove('kfocus'); });
  // the score chip in the header is a button for the eyes, so make it one for the keyboard too
  const st = $('#stats');
  st.tabIndex = 0;
  st.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); st.click(); } });
}

// ctx: { tap: Set of ids that can be tapped now, dim: Set of ids that can be tapped but not played, picking: bool }
export function syncMirror(g, ctx) {
  if (!sr) return;
  const items = Access.myItems(g, { tappable: c => ctx.tap.has(c.id), legal: c => !ctx.dim.has(c.id), selected: store.ui.sel, swapSel: store.ui.swapSel, picking: ctx.picking });
  const text = Access.summary(g, store.ui.reveal);
  const s = text + '|' + items.map(i => [i.id, i.label, i.pressed, i.disabled].join(':')).join(',');
  if (s === sig) return;
  sig = s;
  const a = document.activeElement;
  const had = a && a.closest && a.closest('#sr') && a.dataset ? a.dataset.id : null;
  Object.keys(store.els).forEach(id => store.els[id].classList.remove('kfocus'));
  sr.innerHTML = '<p id="srSum">' + esc(text) + '</p><div role="group" aria-label="Your cards">' +
    items.map(i => '<button type="button" data-id="' + i.id + '"' + (i.extra === 'down' ? '' : ' aria-pressed="' + i.pressed + '"') + (i.disabled ? ' aria-disabled="true"' : '') + '>' + esc(i.label) + '</button>').join('') + '</div>';
  if (had != null) {
    const back = sr.querySelector('button[data-id="' + had + '"]') || sr.querySelector('button[data-id]');
    if (back) back.focus();
  }
}

// forget what was drawn, for a new game
export function resetMirror() { sig = ''; }

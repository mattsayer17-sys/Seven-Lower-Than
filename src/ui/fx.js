import { $, table } from './dom.js';
import { store } from './state.js';
import { SFX } from './audio.js';
import { isSting } from './flow.js';

// ---------- effects: motion that explains play ----------
const fxEl = () => $('#fx');

function relPos(el) {
  const r = el.getBoundingClientRect(),
    t = table.getBoundingClientRect();
  return {
    x: r.left - t.left + r.width / 2,
    y: r.top - t.top + r.height / 2
  };
}

const seatEl = i => i === 0 ? $('#lblMe') : $('#lblP' + i);

function addFx(cls, x, y, html, ms, css) {
  const d = document.createElement('div');
  d.className = cls;
  d.style.left = x + 'px';
  d.style.top = y + 'px';
  if (css) d.style.cssText += ';' + css;
  if (html) d.textContent = html;
  fxEl().appendChild(d);
  setTimeout(() => d.remove(), ms || 1200);
  return d;
}

function burnFx() {
  const L = store.lastL;
  if (!L) return;
  addFx('glowring', L.pileX, L.centerCy, '', 700, 'width:' + store.cw * 1.2 + 'px;height:' + store.cw * 1.2 + 'px');
  for (let i = 0; i < 16; i++) {
    const dx = (Math.random() * 2 - 1) * store.cw * .6;
    addFx('ember', L.pileX + (Math.random() * 2 - 1) * store.cw * .5, L.centerCy + (Math.random() * .8 - .2) * store.ch * .5, '', 1150, '--dx:' + dx.toFixed(0) + 'px;animation-delay:' + (Math.random() * 220 | 0) + 'ms');
  }
}

function skipFx(i) {
  const s = seatEl(i);
  if (!s) return;
  const p = relPos(s);
  s.classList.remove('skipfx');
  void s.offsetWidth;
  s.classList.add('skipfx');
  setTimeout(() => s.classList.remove('skipfx'), 800);
  addFx('ftag skip', p.x, p.y, 'SKIP', 1000);
  addFx('slash', p.x - 60, p.y, '', 700);
}

function pickFx(i, n) {
  const s = seatEl(i);
  if (!s) return;
  const p = relPos(s);
  if (n >= 10) return bigPick(i, n, p);
  if (n > 1) addFx('ftag pick', p.x, p.y, '+' + n + ' cards', 1050);
}

function bigPick(i, n, p) {
  const L = store.lastL || {
    pileX: p.x,
    centerCy: p.y
  };
  const t = $('#table');
  t.classList.remove('quake');
  void t.offsetWidth;
  t.classList.add('quake');
  setTimeout(() => t.classList.remove('quake'), 650);
  addFx('boomflash', 0, 0, '', 800);
  [0, 140].forEach(d => addFx('shock', p.x, p.y, '', 950, 'width:' + store.cw * 1.6 + 'px;height:' + store.cw * 1.6 + 'px;animation-delay:' + d + 'ms'));
  for (let k = 0; k < 18; k++) {
    const a = Math.random() * Math.PI * 2,
      r = store.cw * (1.2 + Math.random() * 2.2);
    addFx('debris', p.x, p.y, '', 1100, '--dx:' + (Math.cos(a) * r).toFixed(0) + 'px;--dy:' + (Math.sin(a) * r).toFixed(0) + 'px;--rot:' + (Math.random() * 720 - 360 | 0) + 'deg;animation-delay:' + (Math.random() * 120 | 0) + 'ms');
  }
  const word = 'OUCH';
  const d = addFx('bigtag', (p.x + L.pileX) / 2, (p.y + L.centerCy) / 2, '', 1600);
  d.innerHTML = '<b>+' + n + '</b><small>' + word + '</small>';
  SFX.boom(i === 0);
}

function lockFx() {
  const lk = $('#lock'),
    L = store.lastL;
  lk.classList.remove('snap');
  void lk.offsetWidth;
  lk.classList.add('snap');
  if (L) addFx('glowring', L.pileX, L.centerCy - store.ch * .5 - 10, '', 650, 'width:' + store.cw * .9 + 'px;height:' + store.cw * .9 + 'px;border-color:#e58b7a;box-shadow:0 0 18px 4px rgba(229,139,122,.55)');
}

function fxForEvent(ev) {
  if (ev.burned) burnFx();
  if (ev.skipped != null) (ev.skippedAll || [ev.skipped]).forEach(skipFx);
  if (isSting(ev) && !ev.burned) lockFx();
  if (ev.forced) pickFx(ev.forced.pi, ev.forced.count);else if (ev.type === 'pickup') pickFx(ev.pi, ev.count);else if (ev.type === 'blind' && !ev.success) pickFx(ev.pi, ev.picked);
}

// ---------- how to play: an animated walkthrough on the real screens ----------

export { fxForEvent, pickFx };

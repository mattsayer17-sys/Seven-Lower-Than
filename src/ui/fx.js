import { $, table } from './dom.js';
import Shed from '../engine.js';
import { store } from './state.js';
import { SFX } from './audio.js';
import { isSting } from './flow.js';

// ---------- effects speed: Normal, Fast or Off (settings), Off when the phone asks for reduced motion ----------
const reduced = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    return false;
  }
};
const fxMode = () => reduced() ? 'off' : ['normal', 'fast', 'off'].includes(store.settings.motion) ? store.settings.motion : 'normal';
const fxK = () => fxMode() === 'fast' ? .55 : fxMode() === 'off' ? .35 : 1;
const fxOn = () => fxMode() !== 'off';
const kms = ms => Math.round(ms * fxK());
// Effects draw their own random numbers so they never shift the game's. keepStream advances Math.random exactly as the
// reference build's effects did (16 embers x4 on a burn, 18 debris x4 on a 10+ pick-up), so new-game seeds and CPU timing
// stay identical to src/reference.html and tools/compare.js keeps proving there is no behaviour change.
let fxSeed = (Date.now() ^ 0x5bd1e995) >>> 0;
const rnd = () => {
  fxSeed = fxSeed + 0x6D2B79F5 | 0;
  let t = Math.imul(fxSeed ^ fxSeed >>> 15, 1 | fxSeed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
const keepStream = n => {
  for (let i = 0; i < n; i++) Math.random();
};
// CSS reads --fxk so every effect animation runs at the same speed as its timers.
function applyMotion() {
  document.documentElement.style.setProperty('--fxk', String(fxK()));
}

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
  setTimeout(() => d.remove(), kms(ms || 1200));
  return d;
}

// Burn: a bucket of cold water over the pile. Bucket tips, water lands, splash, a puff of steam. About half a second.
const BUCKET = '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M7 10h26l-3 25H10z" fill="#8a96a3" stroke="#3d4650" stroke-width="2" stroke-linejoin="round"/><path d="M7 10h26" stroke="#c9d3dc" stroke-width="3"/><path d="M9 11c0-9 22-9 22 0" fill="none" stroke="#3d4650" stroke-width="2"/><path d="M10 13h20" stroke="#5fb3ff" stroke-width="3"/></svg>';

function burnFx() {
  const L = store.lastL;
  if (!L) return;
  const cw = store.cw,
    ch = store.ch,
    x = L.pileX,
    y = L.centerCy;
  addFx('bucket', x + cw * .62, y - ch * .92, '', 520, 'width:' + cw + 'px;height:' + cw + 'px').innerHTML = BUCKET;
  addFx('stream', x + cw * .12, y - ch * .78, '', 440, 'width:' + cw * .3 + 'px;height:' + ch * .85 + 'px');
  addFx('wash', x, y, '', 560, 'width:' + cw * 1.35 + 'px;height:' + ch * 1.05 + 'px');
  for (let i = 0; i < 14; i++) {
    const a = Math.PI * (1.05 + rnd() * .9),
      r = cw * (.6 + rnd() * .7);
    addFx('drop', x + (rnd() * 2 - 1) * cw * .35, y + ch * .3, '', 560, '--dx:' + (Math.cos(a) * r * (rnd() < .5 ? -1 : 1)).toFixed(0) + 'px;--dy:' + (Math.sin(a) * r * .55).toFixed(0) + 'px;animation-delay:' + kms(200 + (rnd() * 60 | 0)) + 'ms');
  }
  for (let i = 0; i < 6; i++) addFx('steam', x + (rnd() * 2 - 1) * cw * .45, y + (rnd() * .3 - .1) * ch, '', 760, 'width:' + cw * .5 + 'px;height:' + cw * .5 + 'px;--dx:' + ((rnd() * 2 - 1) * cw * .3).toFixed(0) + 'px;animation-delay:' + kms(280 + i * 30) + 'ms');
}

// Stinger played: the card's outline flares red, then it is a normal card again.
function stingGlow(ev) {
  const c = ev.cards[ev.cards.length - 1],
    el = c && store.els[c.id];
  if (!el) return;
  el.classList.remove('stingfx');
  void el.offsetWidth;
  el.classList.add('stingfx');
  setTimeout(() => el.classList.remove('stingfx'), kms(560));
}

// Invisible card played: it flickers see-through, then settles back.
function ghostFx(ev) {
  ev.cards.filter(c => Shed.effect(store.game.rules, c) === 'transparent').forEach(c => {
    const el = store.els[c.id];
    if (!el) return;
    el.classList.remove('ghostfx');
    void el.offsetWidth;
    el.classList.add('ghostfx');
    setTimeout(() => el.classList.remove('ghostfx'), kms(520));
  });
}

// Stung: STUNG bursts into flame over the pile, where everyone is looking, and the stung player's seat pulses red.
function stungFx(i) {
  const L = store.lastL,
    s = seatEl(i);
  if (s) {
    s.classList.remove('stungseat');
    void s.offsetWidth;
    s.classList.add('stungseat');
    setTimeout(() => s.classList.remove('stungseat'), kms(900));
  }
  if (!L) return;
  addFx('stung', L.pileX, L.centerCy, 'STUNG', 1050);
  for (let k = 0; k < 12; k++) {
    const dx = (rnd() * 2 - 1) * store.cw * .5;
    addFx('ember', L.pileX + (rnd() * 2 - 1) * store.cw * .9, L.centerCy + store.ch * .12, '', 900, '--dx:' + dx.toFixed(0) + 'px;animation-delay:' + kms(rnd() * 200 | 0) + 'ms');
  }
  SFX.stung(i === 0);
}

function skipFx(i) {
  const s = seatEl(i);
  if (!s) return;
  const p = relPos(s);
  s.classList.remove('skipfx');
  void s.offsetWidth;
  s.classList.add('skipfx');
  setTimeout(() => s.classList.remove('skipfx'), kms(800));
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
  setTimeout(() => t.classList.remove('quake'), kms(650));
  addFx('boomflash', 0, 0, '', 800);
  [0, 140].forEach(d => addFx('shock', p.x, p.y, '', 950, 'width:' + store.cw * 1.6 + 'px;height:' + store.cw * 1.6 + 'px;animation-delay:' + d + 'ms'));
  for (let k = 0; k < 18; k++) {
    const a = rnd() * Math.PI * 2,
      r = store.cw * (1.2 + rnd() * 2.2);
    addFx('debris', p.x, p.y, '', 1100, '--dx:' + (Math.cos(a) * r).toFixed(0) + 'px;--dy:' + (Math.sin(a) * r).toFixed(0) + 'px;--rot:' + (rnd() * 720 - 360 | 0) + 'deg;animation-delay:' + (rnd() * 120 | 0) + 'ms');
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
  const picked = ev.forced ? ev.forced.count : ev.type === 'pickup' ? ev.count : ev.type === 'blind' && !ev.success ? ev.picked : 0;
  if (ev.burned) keepStream(64);
  if (picked >= 10) keepStream(72);
  if (!fxOn()) return;
  const played = ev.cards && ev.type !== 'pickup' && (ev.type !== 'blind' || ev.success);
  if (ev.burned) burnFx();
  if (played && !ev.burned) ghostFx(ev);
  if (ev.skipped != null) (ev.skippedAll || [ev.skipped]).forEach(skipFx);
  if (isSting(ev) && !ev.burned) {
    lockFx();
    stingGlow(ev);
  }
  if (ev.stung) {
    stungFx(ev.pi);
    const n = ev.type === 'pickup' ? ev.count : ev.picked;
    const st = seatEl(ev.pi);
    if (n > 1 && st) {
      const p = relPos(st);
      addFx('ftag pick', p.x, p.y, '+' + n + ' cards', 1050);
    }
    return;
  }
  if (ev.forced) pickFx(ev.forced.pi, ev.forced.count);else if (ev.type === 'pickup') pickFx(ev.pi, ev.count);else if (ev.type === 'blind' && !ev.success) pickFx(ev.pi, ev.picked);
}

// ---------- how to play: an animated walkthrough on the real screens ----------

// For the test driver and screenshots: fire one effect without playing to it.
const fxTest = {
  burn: burnFx,
  stung: stungFx,
  sting: id => stingGlow({ cards: [{ id }] }),
  ghost: id => { const el = store.els[id]; if (el) { el.classList.add('ghostfx'); setTimeout(() => el.classList.remove('ghostfx'), kms(520)); } }
};

export { applyMotion, fxForEvent, fxOn, fxTest, pickFx };

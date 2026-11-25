import { $, table } from './dom.js';
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
// Normal runs effects at 1.4x their base length so words and effects can be read (Matt's playtest, 22 Nov)
const fxK = () => fxMode() === 'fast' ? .7 : fxMode() === 'off' ? .35 : 1.4;
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
  document.documentElement.dataset.fx = fxMode();
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

// Burn: a fireball drops onto the 10, the pile catches and chars, then it crumbles to ash on its way to the burn pile.
// burnFx runs when the 10 lands; burnAway runs when the cards leave the pile (flow.js holds them there for 1.2 s).
function burnFx() {
  const L = store.lastL;
  if (!L) return;
  const cw = store.cw,
    ch = store.ch,
    x = L.pileX,
    y = L.centerCy,
    sx = cw * 1.9,
    sy = -ch * 2.4,
    hit = 330;
  // the fireball comes in from above, trailing sparks
  addFx('fireball', x, y, '', 520, 'width:' + (cw * .62).toFixed(0) + 'px;height:' + (cw * .62).toFixed(0) + 'px;--sx:' + sx.toFixed(0) + 'px;--sy:' + sy.toFixed(0) + 'px');
  for (let i = 0; i < 9; i++) {
    const f = i / 9;
    addFx('spark', x + sx * (1 - f) + (rnd() * 2 - 1) * 6, y + sy * (1 - f) + (rnd() * 2 - 1) * 6, '', 600, '--dx:' + ((rnd() * 2 - 1) * 14).toFixed(0) + 'px;animation-delay:' + kms(f * hit) + 'ms');
  }
  // impact: a burst of light and heat where it lands
  addFx('blast', x, y, '', 700, 'width:' + (cw * 2.2).toFixed(0) + 'px;height:' + (cw * 2.2).toFixed(0) + 'px;animation-delay:' + kms(hit) + 'ms');
  // the pile goes up: a glow of heat over it, and tongues of flame licking upwards, overlapping so they read as one fire
  addFx('heat', x, y, '', 1000, 'width:' + (cw * 1.7).toFixed(0) + 'px;height:' + (ch * 1.3).toFixed(0) + 'px;animation-delay:' + kms(hit) + 'ms');
  for (let i = 0; i < 11; i++) {
    const f = (i + .5) / 11 - .5,
      w = cw * (.38 + rnd() * .18) * (1 - Math.abs(f) * .55);
    addFx('flame', x + f * cw * 1.0, y + ch * (.18 - (.5 - Math.abs(f)) * .25), '', 1000, 'width:' + w.toFixed(0) + 'px;height:' + w.toFixed(0) + 'px;--sw:' + ((rnd() * 2 - 1) * 6).toFixed(0) + 'px;animation-delay:' + kms(hit + 20 + (rnd() * 180 | 0)) + 'ms');
  }
  for (let k = 0; k < 14; k++) addFx('ember', x + (rnd() * 2 - 1) * cw * .6, y - ch * .1, '', 1100, '--dx:' + ((rnd() * 2 - 1) * cw * .6).toFixed(0) + 'px;animation-delay:' + kms(hit + (rnd() * 450 | 0)) + 'ms');
  for (let k = 0; k < 4; k++) addFx('smoke', x + (rnd() * 2 - 1) * cw * .4, y - ch * .25, '', 1500, 'width:' + (cw * (.55 + rnd() * .3)).toFixed(0) + 'px;height:' + (cw * (.55 + rnd() * .3)).toFixed(0) + 'px;animation-delay:' + kms(hit + 300 + k * 90) + 'ms');
}

// The charred pile leaves for the burn pile: a trail of ash and embers follows it there and it crumbles as it goes.
function burnAway() {
  const L = store.lastL;
  if (!L || !fxOn()) return;
  const cw = store.cw,
    x0 = L.pileX,
    x1 = L.pileX + cw * L.gap,
    y = L.centerCy;
  for (let i = 0; i < 16; i++) {
    const f = rnd();
    addFx(i % 3 ? 'ash' : 'ember', x0 + (x1 - x0) * f + (rnd() * 2 - 1) * cw * .25, y + (rnd() * 2 - 1) * cw * .3, '', 900, '--dx:' + ((rnd() * 2 - 1) * cw * .4).toFixed(0) + 'px;animation-delay:' + kms(f * 220 + (rnd() * 120 | 0)) + 'ms');
  }
}

// STINGER in flame lettering, once, over the pile, where every player is looking on their own screen.
function stingerWord() {
  const L = store.lastL;
  const sy = L.centerCy - store.ch * .1;
  addFx('stung', L.pileX, sy, 'STINGER', 1150);
  return sy;
}

// Stung: STINGER bursts into flame over the pile and the stung player's seat pulses red.
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
  const sy = stingerWord();
  for (let k = 0; k < 12; k++) {
    const dx = (rnd() * 2 - 1) * store.cw * .5;
    addFx('ember', L.pileX + (rnd() * 2 - 1) * store.cw * .9, sy + store.ch * .12, '', 900, '--dx:' + dx.toFixed(0) + 'px;animation-delay:' + kms(rnd() * 200 | 0) + 'ms');
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
  if (ev.burned) burnFx();
  if (ev.skipped != null) (ev.skippedAll || [ev.skipped]).forEach(skipFx);
  if (isSting(ev) && !ev.burned) {
    lockFx();
    if (store.lastL) stingerWord();
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
  sting: id => { const el = store.els[id]; if (el) el.classList.add('stinging'); },
  ghost: id => { const el = store.els[id]; if (el) el.classList.add('ghosting'); }
};

export { applyMotion, burnAway, fxForEvent, fxOn, fxTest, pickFx };

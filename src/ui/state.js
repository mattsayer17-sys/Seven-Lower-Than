import Shed from '../engine.js';
import { table } from './dom.js';

// Everything the modules share and reassign lives here. Import it, read and write store.x.
export const store = {
  game: null,
  els: {},
  cw: 70,
  ch: 98,
  lastL: null,
  gen: 0,
  ui: {},
  settings: {
    haptic: true,
    fast: false,
    motion: 'normal',
    mode: 'cpu',
    saved: [],
    sevensLower: true,
    transparentOn: false,
    lowerRank: '7',
    transparentRank: '4',
    skipOn: false,
    skipRank: '8',
    fourBurns: true,
    blindFollow: false,
    players: 2,
    felt: 'green',
    custom: [],
    oneTap: false,
    tips: true,
    sound: true,
    chat: true,
    back: 'shiphead',
    cb: false,
    cpu: ['normal', 'normal', 'normal', 'normal']
  },
  stats: {
    w: 0,
    m: 0
  },
  P: {
    cur: null,
    list: []
  },
  tour: null,
  demo: null,
  table: null
};

const SYM = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣'
};

const FELTS = {
  green: ['#1c7050', '#10503a', '#082d21'],
  burgundy: ['#86243d', '#5a162b', '#2f0b18'],
  navy: ['#24558a', '#173a66', '#0a2040'],
  slate: ['#4a5362', '#2e3540', '#171b22']
};

const FAST = !!window.__MS_FAST;

const BACKS = {
  shiphead: ['#152f78', '#152f78'],
  red: ['#b5252d', '#8a1820'],
  blue: ['#1f4f9e', '#143570'],
  midnight: ['#22222b', '#101015']
};

// the house back: royal blue, fine lattice, double gold frame, a gold medallion with SH in Bodoni, like a casino house deck
const SHIP_BACK = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 140'><defs><pattern id='d' width='5' height='5' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'><path d='M0 0H5M0 0V5' stroke='#fff' stroke-width='.4' opacity='.16'/></pattern></defs><rect width='100' height='140' rx='9' fill='#fff'/><rect x='5' y='5' width='90' height='130' rx='6' fill='#152f78'/><rect x='5' y='5' width='90' height='130' rx='6' fill='url(#d)'/><rect x='9.5' y='9.5' width='81' height='121' rx='3.5' fill='none' stroke='#c9a56a' stroke-width='1.2'/><rect x='12' y='12' width='76' height='116' rx='2.2' fill='none' stroke='#c9a56a' stroke-width='.45'/><circle cx='50' cy='70' r='22' fill='#152f78' stroke='#c9a56a' stroke-width='2'/><circle cx='50' cy='70' r='18.6' fill='none' stroke='#c9a56a' stroke-width='.5'/><path fill='#ffffff' transform='translate(36.98 76.50) scale(0.1743)' d='M32.50 1.45Q27.85 1.45 24.13-0.10Q20.40-1.65 17.40-4.25L5.85 1L4 1L4-25.50L6-25.50Q7.95-21.40 10.30-17.03Q12.65-12.65 15.68-8.90Q18.70-5.15 22.70-2.83Q26.70-0.50 32-0.50Q36.20-0.50 39.23-2.12Q42.25-3.75 43.88-6.48Q45.50-9.20 45.50-12.50Q45.50-16.25 43.30-18.70Q41.10-21.15 37.50-22.90Q33.90-24.65 29.58-26.30Q25.25-27.95 20.93-30.03Q16.60-32.10 13-35.20Q9.40-38.30 7.20-42.98Q5-47.65 5-54.50Q5-61.50 8.40-66.30Q11.80-71.10 17.23-73.55Q22.65-76 28.70-76Q32.70-76 36.20-74.73Q39.70-73.45 42.65-71.10L53.80-76L55.45-76L55.45-51.45L53.45-51.45Q50.45-57.90 47.05-63Q43.65-68.10 39.33-71.03Q35-73.95 29.20-73.95Q24.45-73.95 21.73-71.35Q19-68.75 19-64.50Q19-61.15 21.20-58.85Q23.40-56.55 27-54.73Q30.60-52.90 34.93-51.10Q39.25-49.30 43.55-47.05Q47.85-44.80 51.45-41.65Q55.05-38.50 57.25-33.98Q59.45-29.45 59.45-23Q59.45-15.50 55.65-10.03Q51.85-4.55 45.70-1.55Q39.55 1.45 32.50 1.45M106.90-75L145.40-75L145.40-73.05L136.40-73.05L136.40-1.95L145.40-1.95L145.40 0L106.90 0L106.90-1.95L114.90-1.95L114.90-36.05L93.90-36.05L93.90-1.95L101.90-1.95L101.90 0L63.35 0L63.35-1.95L72.40-1.95L72.40-73.05L63.35-73.05L63.35-75L101.90-75L101.90-73.05L93.90-73.05L93.90-37.95L114.90-37.95L114.90-73.05L106.90-73.05'/><g fill='#e3c58e'><path d='M50 54.2l1.6 1.6-1.6 1.6-1.6-1.6z'/><path d='M50 82.6l1.6 1.6-1.6 1.6-1.6-1.6z'/></g></svg>";
function backURI(k) {
  if (k === 'shiphead' || !BACKS[k]) return 'url("data:image/svg+xml,' + encodeURIComponent(SHIP_BACK) + '")';
  const c = BACKS[k];
  const svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 140'><defs><pattern id='d' width='9' height='9' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'><path d='M0 0H9M0 0V9' stroke='#fff' stroke-width='.7' opacity='.4'/></pattern></defs><rect width='100' height='140' rx='9' fill='#fff'/><rect x='6' y='6' width='88' height='128' rx='5' fill='" + c[0] + "'/><rect x='6' y='6' width='88' height='128' rx='5' fill='url(#d)'/><rect x='11' y='11' width='78' height='118' rx='3' fill='none' stroke='#fff' stroke-width='1.4'/><ellipse cx='50' cy='70' rx='21' ry='29' fill='" + c[1] + "' stroke='#fff' stroke-width='1.6'/><ellipse cx='50' cy='70' rx='13' ry='20' fill='none' stroke='#fff' stroke-width='1' opacity='.8'/><path d='M50 55l7 15-7 15-7-15z' fill='#fff' opacity='.9'/></svg>";
  return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
}

function applyBack() {
  if (!BACKS[store.settings.back]) store.settings.back = 'shiphead';
  table.style.setProperty('--backimg', backURI(store.settings.back));
}

const SKILL = {
  easy: .4,
  normal: .12,
  hard: .02
};

const applySkill = () => {
  if (store.game) store.game.players.slice(1).forEach((p, i) => {
    p.rp = SKILL[store.settings.cpu[i]];
  });
};

const save = () => {
  try {
    localStorage.setItem('ms.settings', JSON.stringify(store.settings));
    localStorage.setItem('ms.stats', JSON.stringify(store.stats));
    localStorage.setItem('ms.profiles', JSON.stringify(store.P));
  } catch (e) {}
};
// ---------- sound and haptics (synthesised, no files) ----------

const spd = ms => FAST ? Math.min(ms, 30) : store.settings.fast ? Math.round(ms * .45) : ms;

const later = (fn, ms) => {
  const g0 = store.gen;
  return setTimeout(() => {
    if (g0 === store.gen) fn();
  }, spd(ms));
};

const who = i => store.game.players[i].name;

const ordinal = n => ['1st', '2nd', '3rd', '4th', '5th'][n - 1];

const label = c => c.rank + SYM[c.suit];

function applyCB() {
  applyBack();
  table.classList.toggle('cb', !!store.settings.cb);
}

function applyFelt() {
  const f = FELTS[store.settings.felt];
  table.style.setProperty('--f1', f[0]);
  table.style.setProperty('--f2', f[1]);
  table.style.setProperty('--f3', f[2]);
}

// ---------- card drawing ----------

try {
  const s = JSON.parse(localStorage.getItem('ms.settings') || 'null');
  if (s) {
    store.settings = Object.assign(store.settings, s);
    // 21 Nov 2026: the house card back replaces the old red default once (a back someone picked stays)
    if (!s.backV) { if (!s.back || s.back === 'red') store.settings.back = 'shiphead'; store.settings.backV = 1; }
    if (s.eightsTransparent && s.transparentOn === undefined) {
      store.settings.transparentOn = true;
      store.settings.transparentRank = '8';
      if (store.settings.skipRank === '8') store.settings.skipRank = '9';
    }
    delete store.settings.eightsTransparent;
  }
  const t = JSON.parse(localStorage.getItem('ms.stats') || 'null');
  if (t) store.stats = Object.assign(store.stats, t);
} catch (e) {}
if (!FELTS[store.settings.felt]) store.settings.felt = 'green';
if (!Array.isArray(store.settings.cpu) || store.settings.cpu.length < 4) store.settings.cpu = ['normal', 'normal', 'normal', 'normal'];
store.settings.cpu = store.settings.cpu.map(k => k in SKILL ? k : 'normal');
store.settings.custom = Shed.validateCustom(store.settings.custom).rules;
if (!['normal', 'fast', 'off'].includes(store.settings.motion)) store.settings.motion = 'normal';
if (store.settings.mode !== 'online') store.settings.mode = 'cpu';
if (!Array.isArray(store.settings.saved)) store.settings.saved = [];

export { BACKS, FAST, FELTS, SKILL, applyBack, applyCB, applyFelt, applySkill, label, later, ordinal, save, who };

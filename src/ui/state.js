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

// the house back: royal blue, white and gold frame, the Shiphead suit (a spade with a heart in it) in a gold ring
const SHIP_BACK = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 140'><defs><pattern id='d' width='6' height='6' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'><path d='M0 0H6M0 0V6' stroke='#fff' stroke-width='.45' opacity='.2'/></pattern><pattern id='e' width='6' height='6' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'><circle cx='3' cy='3' r='.55' fill='#fff' opacity='.26'/></pattern></defs><rect width='100' height='140' rx='9' fill='#fff'/><rect x='5' y='5' width='90' height='130' rx='6' fill='#152f78'/><rect x='5' y='5' width='90' height='130' rx='6' fill='url(#d)'/><rect x='5' y='5' width='90' height='130' rx='6' fill='url(#e)'/><rect x='10' y='10' width='80' height='120' rx='3.5' fill='none' stroke='#fff' stroke-width='1.3'/><rect x='12.6' y='12.6' width='74.8' height='114.8' rx='2.2' fill='none' stroke='#c9a56a' stroke-width='.8'/><g fill='#c9a56a'><path d='M12.6 9.2l3.4 3.4-3.4 3.4-3.4-3.4z'/><path d='M87.4 9.2l3.4 3.4-3.4 3.4-3.4-3.4z'/><path d='M12.6 124l3.4 3.4-3.4 3.4-3.4-3.4z'/><path d='M87.4 124l3.4 3.4-3.4 3.4-3.4-3.4z'/></g><circle cx='50' cy='70' r='19' fill='#152f78' stroke='#c9a56a' stroke-width='1.6'/><circle cx='50' cy='70' r='16' fill='none' stroke='#c9a56a' stroke-width='.6'/><g transform='translate(38 57.5) scale(.24)'><path d='M50 4C50 4 8 36 8 61c0 15 11 24 24 24 7 0 12-3 15-8-1 9-5 15-12 19h30c-7-4-11-10-12-19 3 5 8 8 15 8 13 0 24-9 24-24C92 36 50 4 50 4z' fill='#ffffff'/><g transform='translate(50 47) scale(.36) translate(-50 -49)'><path d='M50 90C22 68 5 50 5 32 5 18 16 8 30 8c9 0 16 5 20 13 4-8 11-13 20-13 14 0 25 10 25 24 0 18-17 36-45 58z' fill='#c8102e' stroke='#152f78' stroke-width='11' paint-order='stroke'/></g></g></svg>";
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

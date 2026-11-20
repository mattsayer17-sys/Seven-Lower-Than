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
    sevensLower: true,
    transparentOn: false,
    transparentRank: '4',
    skipOn: false,
    skipRank: '8',
    fourBurns: true,
    players: 2,
    felt: 'green',
    custom: [],
    oneTap: false,
    tips: true,
    sound: true,
    chat: true,
    back: 'red',
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
  red: ['#b5252d', '#8a1820'],
  blue: ['#1f4f9e', '#143570'],
  midnight: ['#22222b', '#101015']
};

function backURI(k) {
  const c = BACKS[k] || BACKS.red;
  const svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 140'><defs><pattern id='d' width='9' height='9' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'><path d='M0 0H9M0 0V9' stroke='#fff' stroke-width='.7' opacity='.4'/></pattern></defs><rect width='100' height='140' rx='9' fill='#fff'/><rect x='6' y='6' width='88' height='128' rx='5' fill='" + c[0] + "'/><rect x='6' y='6' width='88' height='128' rx='5' fill='url(#d)'/><rect x='11' y='11' width='78' height='118' rx='3' fill='none' stroke='#fff' stroke-width='1.4'/><ellipse cx='50' cy='70' rx='21' ry='29' fill='" + c[1] + "' stroke='#fff' stroke-width='1.6'/><ellipse cx='50' cy='70' rx='13' ry='20' fill='none' stroke='#fff' stroke-width='1' opacity='.8'/><path d='M50 55l7 15-7 15-7-15z' fill='#fff' opacity='.9'/></svg>";
  return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
}

function applyBack() {
  if (!BACKS[store.settings.back]) store.settings.back = 'red';
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

export { BACKS, FAST, FELTS, SKILL, applyBack, applyCB, applyFelt, applySkill, label, later, ordinal, save, who };

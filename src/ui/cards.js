import Shed from '../engine.js';
import { store } from './state.js';
import { humanTap, onDown } from './input.js';

// ---------- card drawing ----------
const PIPS = {
  '2': [[50, 14], [50, 86]],
  '3': [[50, 14], [50, 50], [50, 86]],
  '4': [[30, 14], [70, 14], [30, 86], [70, 86]],
  '5': [[30, 14], [70, 14], [50, 50], [30, 86], [70, 86]],
  '6': [[30, 14], [70, 14], [30, 50], [70, 50], [30, 86], [70, 86]],
  '7': [[30, 14], [70, 14], [50, 32], [30, 50], [70, 50], [30, 86], [70, 86]],
  '8': [[30, 14], [70, 14], [50, 32], [30, 50], [70, 50], [50, 68], [30, 86], [70, 86]],
  '9': [[30, 13], [70, 13], [30, 38], [70, 38], [50, 50], [30, 62], [70, 62], [30, 87], [70, 87]],
  '10': [[30, 13], [70, 13], [50, 25], [30, 38], [70, 38], [30, 62], [70, 62], [50, 75], [30, 87], [70, 87]]
};

// ---------- court cards ----------
// Double-ended court figures in court-card inks. 60 x 100 art box; top half drawn, bottom is the same rotated 180deg.
// Robe in the suit colour (currentColor, so colour-blind suits follow), sash blue, collar, crown and trim gold.
const Y = '#f0b323', B = '#1b3d8f', K = '#1b1b20', SKIN = '#f6e7d2', W = '#ffffff';
function half(rank) {
  const ink = `stroke="${K}" stroke-width=".75" stroke-linejoin="round"`;
  // broad shoulders running off the bottom of the half
  const robe = `<path d="M2 51V41Q2 31.5 15 30.4H45Q58 31.5 58 41V51Z" fill="currentColor" ${ink}/>`;
  const sash = `<path d="M9 51L26 30.6H33L16 51Z" fill="${B}" ${ink}/>`;
  const collar = `<path d="M19 30.4L30 40.5 41 30.4H37.4L30 37 22.6 30.4Z" fill="${Y}" ${ink}/>`;
  const trim = `<path d="M2 44.6Q30 40 58 44.6V47.4Q30 42.8 2 47.4Z" fill="${Y}" ${ink}/><g fill="${W}"><circle cx="45" cy="36" r="1.2"/><circle cx="50.5" cy="38.2" r="1.2"/><circle cx="39.5" cy="35.2" r="1.2"/></g>`;
  const neck = `<path d="M26.2 25h7.6v7.6h-7.6z" fill="${SKIN}" ${ink}/>`;
  const face = `<ellipse cx="30" cy="19.4" rx="7.8" ry="8.6" fill="${SKIN}" ${ink}/><g fill="${K}"><circle cx="27.2" cy="19" r=".9"/><circle cx="32.8" cy="19" r=".9"/></g><path d="M30 20.2v2.6" stroke="${K}" stroke-width=".55" stroke-linecap="round"/><path d="M28.3 24.4q1.7 1 3.4 0" fill="none" stroke="${K}" stroke-width=".6" stroke-linecap="round"/>`;
  let head = '', hair = '', item = '';
  if (rank === 'K') {
    hair = `<path d="M22.2 21Q22.6 31.5 30 32.2Q37.4 31.5 37.8 21Q35 26.6 30 26.6Q25 26.6 22.2 21Z" fill="${Y}" ${ink}/>`;
    head = `<path d="M21.2 13.6V3.4l4.4 4.8L30 1.6l4.4 6.6 4.4-4.8v10.2Z" fill="${Y}" ${ink}/><path d="M21.2 11.6h17.6" stroke="${K}" stroke-width=".6"/><g fill="currentColor" stroke="${K}" stroke-width=".4"><circle cx="30" cy="9" r="1.3"/><circle cx="24.8" cy="10" r="1"/><circle cx="35.2" cy="10" r="1"/></g>`;
    item = `<path d="M49.4 8.6V31" stroke="${K}" stroke-width="2.6" stroke-linecap="round"/><path d="M49.4 8.6V31" stroke="${Y}" stroke-width="1.4" stroke-linecap="round"/><circle cx="49.4" cy="6.4" r="2.6" fill="${Y}" ${ink}/><path d="M46.4 12.4h6" stroke="${K}" stroke-width="2.2" stroke-linecap="round"/><path d="M46.4 12.4h6" stroke="${Y}" stroke-width="1.1" stroke-linecap="round"/>`;
  } else if (rank === 'Q') {
    hair = `<path d="M21.6 17Q19.6 29 22.8 33.6L26 31.6Q23.6 27 24.2 15.4Z M38.4 17Q40.4 29 37.2 33.6L34 31.6Q36.4 27 35.8 15.4Z" fill="${Y}" ${ink}/>`;
    head = `<path d="M21.8 13.8Q30 2.8 38.2 13.8L35.8 13.8Q30 8.2 24.2 13.8Z" fill="${Y}" ${ink}/><g fill="${Y}" ${ink}><circle cx="30" cy="4.6" r="1.9"/><circle cx="24.4" cy="8.4" r="1.25"/><circle cx="35.6" cy="8.4" r="1.25"/></g><circle cx="30" cy="4.6" r=".8" fill="currentColor"/>`;
    item = `<path d="M49.4 31Q50 21 47.4 13" fill="none" stroke="${K}" stroke-width="1.2" stroke-linecap="round"/><path d="M48 22q4-1 5.2-4-3.4-.4-5.2 2.6" fill="${B}" ${ink}/><g ${ink}><circle cx="47.4" cy="10.4" r="3.2" fill="currentColor"/><circle cx="47.4" cy="10.4" r="1.3" fill="${Y}"/></g>`;
  } else {
    hair = `<path d="M22 16.6Q21 25 23 28.6L25 26.6Q24.2 22 24.6 15Z M38 16.6Q39 25 37 28.6L35 26.6Q35.8 22 35.4 15Z" fill="${Y}" ${ink}/>`;
    head = `<path d="M20.4 14.6Q21.2 5.2 31 5Q40 5.2 40.8 12.4Q31 10.4 20.4 14.6Z" fill="${B}" ${ink}/><path d="M38.6 9Q45.6 4.6 48.8 .6Q44.4 6.6 37.6 7.6Z" fill="currentColor" ${ink}/>`;
    item = `<path d="M50 4V31" stroke="${K}" stroke-width="1.6" stroke-linecap="round"/><path d="M50 5.4Q55.6 7.6 55.6 12.6 52.6 10.6 50 11.4Z M50 5.4Q45.2 7.8 45.2 12.2 47.8 10.4 50 11.4Z" fill="${W}" ${ink}/><path d="M48.6 3.2l1.4-2.6 1.4 2.6Z" fill="${Y}" ${ink}/>`;
  }
  return robe + sash + collar + trim + item + neck + hair + face + head;
}
let n = 0;
function court(rank) {
  const h = half(rank), id = 'cf' + (n++);
  return `<svg class="cfig" viewBox="4 0 52 100" aria-hidden="true"><clipPath id="${id}"><rect x="4" y="0" width="52" height="100" rx="2.6"/></clipPath>` +
    `<g clip-path="url(#${id})"><g>${h}</g><g transform="rotate(180 30 50)">${h}</g></g><path d="M4 50H56" stroke="${K}" stroke-width=".9"/></svg>`;
}

const sv = (s, cls) => '<svg' + (cls ? ' class="' + cls + '"' : '') + ' viewBox="0 0 100 100"><use href="#s-' + s + '"/></svg>';

function faceHTML(c) {
  if (c.hidden) return '<div class="front"></div>';
  const red = Shed.RED[c.suit] ? ' red' : '';
  let art = '';
  if (PIPS[c.rank]) art = '<div class="art">' + PIPS[c.rank].map(([x, y]) => '<span class="p' + (y > 50 ? ' f' : '') + '" style="left:' + x + '%;top:' + y + '%">' + sv(c.suit) + '</span>').join('') + '</div>';else if (c.rank === 'A') art = '<div class="art"><span class="p ace" style="left:50%;top:50%">' + sv(c.suit) + '</span></div>';else {
    art = '<div class="art cart">' + court(c.rank) + '</div>';
  }
  const idx = '<b>' + c.rank + '</b>' + sv(c.suit);
  return '<div class="front s' + c.suit + red + '"><div class="idx tl">' + idx + '</div><div class="idx br">' + idx + '</div>' + art + '</div>';
}

function buildCard(c) {
  const d = document.createElement('div');
  d.className = 'card down nt';
  d.dataset.id = c.id;
  d.innerHTML = '<div class="inner">' + faceHTML(c) + '<div class="back"></div></div>';
  // read the id off the element, because online a card element can be handed to a different card
  d.addEventListener('click', () => {
    if (store.ui.suppress) return;
    humanTap(+d.dataset.id);
  });
  d.addEventListener('pointerdown', e => onDown(e, +d.dataset.id));
  return d;
}

function allCards(g) {
  const a = [];
  g.draw.forEach(c => a.push(c));
  g.pile.forEach(c => a.push(c));
  g.burned.forEach(c => a.push(c));
  g.players.forEach(p => {
    p.hand.concat(p.up, p.down).forEach(c => a.push(c));
  });
  return a;
}

// ---------- online: a card element follows a card as it becomes known ----------

function showFace(el, c) {
  const f = el.querySelector('.front');
  if (f) f.outerHTML = faceHTML(c);
}

// The element for card `from` now shows card `to` (same element, new id and face).
function rekeyCard(from, to) {
  const el = store.els[from.id];
  if (!el) return;
  if (from.id !== to.id) {
    delete store.els[from.id];
    store.els[to.id] = el;
    el.dataset.id = to.id;
  }
  showFace(el, to);
}

// A whole new picture of the table arrived. Keep every element that still has a card, hand spare ones to new cards.
function adoptElements(g) {
  const cards = allCards(g), want = new Set(cards.map(c => c.id));
  const spare = Object.keys(store.els).filter(id => !want.has(+id)).map(id => ({ id: +id, el: store.els[id] }));
  spare.forEach(s => delete store.els[s.id]);
  cards.forEach(c => {
    if (store.els[c.id]) return;
    const s = spare.pop();
    if (s) {
      s.el.dataset.id = c.id;
      showFace(s.el, c);
      store.els[c.id] = s.el;
    } else {
      const el = buildCard(c);
      el.classList.remove('nt');
      store.els[c.id] = el;
      document.getElementById('cards').appendChild(el);
    }
  });
  spare.forEach(s => s.el.remove());
  // a resync can land mid-deal: drop the deal's staggered delays so every card goes straight to its new place
  Object.values(store.els).forEach(el => { el.style.transitionDelay = ''; el.style.animationDelay = ''; el.classList.remove('fly'); if (el.firstChild) el.firstChild.style.transitionDelay = ''; });
}

// ---------- new game: blank felt, then the deck, then the deal ----------

function findCard(id) {
  const g = store.game;
  for (const c of g.draw) if (c.id === id) return c;
  for (const c of g.pile) if (c.id === id) return c;
  for (const c of g.burned) if (c.id === id) return c;
  for (const p of g.players) for (const c of p.hand.concat(p.up, p.down)) if (c.id === id) return c;
  return null;
}

export { adoptElements, allCards, buildCard, findCard, rekeyCard };

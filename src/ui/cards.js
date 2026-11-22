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

const sv = (s, cls) => '<svg' + (cls ? ' class="' + cls + '"' : '') + ' viewBox="0 0 100 100"><use href="#s-' + s + '"/></svg>';

function faceHTML(c) {
  if (c.hidden) return '<div class="front"></div>';
  const red = Shed.RED[c.suit] ? ' red' : '';
  let art = '';
  if (PIPS[c.rank]) art = '<div class="art">' + PIPS[c.rank].map(([x, y]) => '<span class="p' + (y > 50 ? ' f' : '') + '" style="left:' + x + '%;top:' + y + '%">' + sv(c.suit) + '</span>').join('') + '</div>';else if (c.rank === 'A') art = '<div class="art"><span class="p ace" style="left:50%;top:50%">' + sv(c.suit) + '</span></div>';else {
    const cr = '<svg class="crown" viewBox="0 0 100 70"><use href="#crown' + c.rank + '"/></svg>';
    art = '<div class="art" style="left:26%;right:26%;top:8%;bottom:8%"><div class="court"><div class="plate">' + cr + '<span class="L">' + c.rank + '</span>' + sv(c.suit, 'cs') + '</div></div></div>';
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

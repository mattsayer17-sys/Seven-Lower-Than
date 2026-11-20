import Shed from '../engine.js';
import { $, cardsEl, table } from './dom.js';
import { SKILL, applyCB, applyFelt, applySkill, label, later, ordinal, store, who } from './state.js';
import { SFX } from './audio.js';
import { allCards, buildCard } from './cards.js';
import { hint, render, setMsg } from './render.js';
import { shake } from './input.js';
import { trackEvent } from './profile.js';
import { hashSeed } from './daily.js';
import { fxForEvent } from './fx.js';
import { rigTour } from './tour.js';
import { chatReset } from './chat.js';
import { hideModal, showOver } from './sheets.js';

// ---------- new game: blank felt, then the deck, then the deal ----------
function newGame(o) {
  o = o && o.type ? {} : o || {};
  store.gen++;
  store.tour = null;
  $('#offer').classList.add('hidden');
  chatReset();
  let rules, n, seed;
  if (!o.remote) store.remote = null;
  if (o.remote) {
    rules = o.remote.game.rules;
    n = o.remote.game.players.length;
  } else if (o.tour) {
    rules = Shed.makeRuleset({
      sevensLower: true,
      skipOn: true,
      skipRank: '8',
      fourBurns: true
    });
    n = 2;
  } else if (o.daily) {
    rules = Shed.makeRuleset({
      sevensLower: true,
      fourBurns: true
    });
    n = 2;
    seed = hashSeed('mouse-shed-' + o.daily);
  } else {
    rules = Shed.makeRuleset(store.settings);
    n = Math.min(5, Math.max(2, store.settings.players | 0 || 2));
  }
  const lv = o.daily || o.tour ? ['normal'] : store.settings.cpu.slice(0, n - 1);
  store.game = o.remote ? o.remote.game : Shed.newGame({
    rules,
    players: n,
    seed,
    humans: [true].concat(Array(n - 1).fill(false)),
    names: ['You'].concat(Array.from({
      length: n - 1
    }, (_, i) => n === 2 ? 'CPU' : 'CPU ' + (i + 1)))
  });
  store.game.meta = {
    tour: !!o.tour,
    daily: o.daily || null,
    keys: lv.map(k => 'cpu-' + k),
    online: !!o.remote
  };
  if (!o.remote) applySkill();
  if (o.daily || o.tour) store.game.players.slice(1).forEach(p => {
    p.rp = SKILL.normal;
  });
  if (o.tour) rigTour(store.game);
  store.game.dealOrder = [];
  for (let k = 0; k < 9; k++) store.game.players.forEach(p => {
    const seq = p.down.concat(p.up, p.hand);
    if (seq[k]) store.game.dealOrder.push(seq[k].id);
  });
  cardsEl.innerHTML = '';
  store.els = {};
  document.querySelectorAll('.lbl.cpu').forEach(e => e.remove());
  store.game.players.slice(1).forEach(p => {
    const d = document.createElement('div');
    d.className = 'lbl cpu' + (n > 2 ? ' c' : '');
    d.id = 'lblP' + p.id;
    d.innerHTML = '<span class="av"></span><span class="nm"></span><span class="ct"></span>';
    table.appendChild(d);
  });
  allCards(store.game).forEach(c => {
    const el = buildCard(c);
    store.els[c.id] = el;
    cardsEl.appendChild(el);
  });
  store.ui = {
    sel: [],
    swapSel: null,
    reveal: null,
    busy: true,
    intro: 'blank',
    hideui: true,
    hold: null,
    drag: null,
    pd: null,
    suppress: false
  };
  applyFelt();
  applyCB();
  hideModal();
  setMsg('');
  render();
  void cardsEl.offsetWidth;
  const ids = Object.keys(store.els);
  later(() => {
    // 1. the deck drops onto the felt
    ids.forEach((id, i) => {
      store.els[id].classList.remove('nt');
      store.els[id].style.transitionDelay = i * 9 + 'ms';
    });
    store.ui.intro = 'deck';
    render();
  }, 1100);
  later(() => {
    // 2. deal, one card at a time round the table
    const stag = n > 2 ? 62 : 90;
    ids.forEach(id => {
      store.els[id].style.transitionDelay = '';
      store.els[id].firstChild.style.transitionDelay = '';
    });
    store.game.dealOrder.forEach((id, i) => {
      setTimeout(SFX.deal, i * stag + 150);
      const e = store.els[id];
      e.style.transitionDelay = i * stag + 'ms';
      e.firstChild.style.transitionDelay = i * stag + 330 + 'ms';
      e.style.animationDelay = i * stag + 'ms';
      e.classList.add('fly');
    });
    store.ui.intro = null;
    render();
    later(() => {
      // 3. table furniture fades in
      ids.forEach(id => {
        store.els[id].style.transitionDelay = '';
        store.els[id].style.animationDelay = '';
        store.els[id].classList.remove('fly');
        store.els[id].firstChild.style.transitionDelay = '';
      });
      store.ui.hideui = false;
      store.ui.busy = false;
      if (store.tour) {
        const g = store.game;
        g.phase = 'play';
        g.turn = 0;
        Shed.sortHand(g.rules, g.players[0].hand);
        store.tour.ready = true;
        render();
        return;
      }
      if (store.remote) return store.remote.afterDeal();
      hint('Swap a hand card with a face-up one, then lock in');
      render();
    }, store.game.dealOrder.length * stag + 1100);
  }, 2100);
}

// ---------- layout ----------

// ---------- flow ----------
const stingerNote = k => (k ? ' (' + (k > 1 ? k + ' stingers' : 'the stinger') + ' burned)' : '');

function describe(ev) {
  const n = who(ev.pi);
  let t;
  if (ev.type === 'pickup') return n + (ev.count ? ' picked up ' + ev.count + ' card' + (ev.count > 1 ? 's' : '') : ' picked up nothing') + stingerNote(ev.stingers);
  if (ev.type === 'blind') {
    const c = label(ev.cards[0]);
    if (!ev.success) return n + ' flipped ' + c + ' and had to pick up ' + ev.picked + stingerNote(ev.stingers);
    t = n + ' flipped ' + c;
  } else {
    const c = ev.cards;
    t = n + ' played ' + (c.length > 1 ? c.length + ' × ' : '') + c[0].rank;
  }
  if (ev.burned) t += ' and burned the pile';
  if (ev.forced) t += '. ' + who(ev.forced.pi) + ' must pick up ' + ev.forced.count + stingerNote(ev.forced.stingers);
  if (ev.skipped != null) t += '. ' + (ev.skippedAll || [ev.skipped]).map(who).join(' and ') + (ev.skippedAll && ev.skippedAll.length > 1 ? ' are skipped' : ' is skipped');
  if (ev.reversed) t += '. Direction reversed';
  if (ev.again && !ev.reversed) t += '. Plays again';
  if (ev.reversed && ev.again) t += ' and plays again';
  return t;
}

function outNote(r) {
  return r.out ? ' (' + who(r.event.pi) + ' is out, ' + ordinal(store.game.finished.indexOf(r.event.pi) + 1) + ')' : '';
}

function flashLabel(ev) {
  if (ev.burned) return 'BURN';
  if (ev.stung) return 'STUNG';
  if (ev.forced) return 'PICK UP!';
  if (ev.skipped != null) return 'SKIP';
  if (ev.reversed) return 'REVERSE';
  if (ev.again) return 'AGAIN';
  const c = ev.cards && ev.cards[ev.cards.length - 1];
  if (c && ev.type !== 'pickup' && Shed.effect(store.game.rules, c) === 'reset') return 'RESET';
  if (isSting(ev)) return 'STINGER';
  return '';
}

function isSting(ev) {
  const last = ev.cards && ev.cards[ev.cards.length - 1];
  return !!last && ev.type !== 'pickup' && (ev.type !== 'blind' || ev.success) && Shed.effect(store.game.rules, last) === 'stinger';
}

function afterAction(r) {
  const g = store.game;
  if (!r.ok) {
    console.warn('action failed', r);
    store.ui.busy = false;
    render();
    return;
  }
  if (store.remote) store.remote.busy = true;
  const ev = r.event,
    mine = ev.pi === 0;
  const _t = describe(ev) + outNote(r);
  setMsg(_t);
  (store.ui.log = store.ui.log || []).push(_t);
  if (store.ui.log.length > 12) store.ui.log.shift();
  const pickedByMe = ev.forced && ev.forced.pi === 0 || ev.type === 'pickup' && mine || ev.type === 'blind' && !ev.success && mine;
  if (ev.burned) SFX.burn(ev);else if (ev.forced || ev.type === 'pickup' || ev.type === 'blind' && !ev.success) SFX.pick(pickedByMe);else SFX.play(mine);
  if (ev.skipped != null) setTimeout(SFX.skip, 150);
  if (isSting(ev)) setTimeout(SFX.lock, 120);
  if ((ev.again || ev.reversed) && !ev.burned) setTimeout(SFX.again, 150);
  fxForEvent(ev);
  trackEvent(ev);
  let delay = 600;
  const fl = flashLabel(ev);
  if (fl) {
    const f = $('#flash');
    f.textContent = fl;
    f.classList.remove('go');
    void f.offsetWidth;
    f.classList.add('go');
  }
  if (ev.burned && g.lastBurn) {
    const bl = g.lastBurn.slice();
    bl.forEach(c => {
      if (store.els[c.id]) store.els[c.id].classList.add('burning');
    });
    store.ui.hold = bl;
    render();
    delay = 1200;
    later(() => {
      store.ui.hold = null;
      bl.forEach(c => {
        if (store.els[c.id]) store.els[c.id].classList.remove('burning');
      });
      render();
    }, 650);
  } else if (ev.forced) {
    store.ui.hold = ev.forced.cards.slice();
    render();
    ev.forced.cards.forEach(c => shake(c.id));
    delay = 1300;
    later(() => {
      store.ui.hold = null;
      render();
    }, 700);
  } else render();
  later(advance, delay);
}

function advance() {
  const g = store.game;
  store.ui.sel = [];
  if (store.remote) {
    store.remote.busy = false;
    if (g.phase === 'over') {
      store.remote.over();
      store.ui.busy = false;
      render();
      if (store.remote.overShown) return;
      store.remote.overShown = true;
      return showOver();
    }
    store.ui.busy = g.phase === 'swap' ? !!g.players[0].ready : g.turn !== 0 || g.players[0].out;
    render();
    if (g.phase === 'play' && g.turn === 0 && !g.players[0].out) SFX.turn();
    return;
  }
  if (store.tour && store.tour.manual && g.phase === 'play') {
    store.tour.waiting = true;
    if (!g.players[g.turn].human) {
      store.ui.busy = true;
      render();
      return;
    }
  }
  if (g.phase === 'over') {
    store.ui.busy = false;
    render();
    return showOver();
  }
  if (g.phase === 'swap') {
    store.ui.busy = false;
    render();
    return;
  }
  if (!g.players[g.turn].human) {
    store.ui.busy = true;
    render();
    later(cpuStep, (g.players[0].out ? 350 : 750) + Math.random() * 350);
  } else {
    store.ui.busy = false;
    render();
    if (g.phase === 'play' && !g.players[0].out) SFX.turn();
  }
}

function cpuStep() {
  const g = store.game,
    pi = g.turn;
  if (g.phase !== 'play' || g.players[pi].human) return;
  if (store.tour && store.tour.cpu.length) {
    const m = store.tour.cpu.shift();
    return afterAction(m.pickup ? Shed.pickUp(g, pi) : Shed.play(g, pi, [m.id]));
  }
  const d = Shed.cpuChoose(g, pi);
  if (d.kind === 'blind') {
    store.ui.reveal = d.id;
    render();
    later(() => {
      store.ui.reveal = null;
      afterAction(Shed.playBlind(g, pi, d.id));
    }, g.players[0].out ? 500 : 950);
    return;
  }
  afterAction(d.kind === 'pickup' ? Shed.pickUp(g, pi) : Shed.play(g, pi, d.ids));
}

// ---------- input: tap and drag ----------

export { advance, afterAction, cpuStep, isSting, newGame };

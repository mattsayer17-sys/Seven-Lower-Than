import Shed from '../engine.js';
import { $, table } from './dom.js';
import { later, store, who } from './state.js';
import { SFX, buzz } from './audio.js';
import { findCard } from './cards.js';
import { hint, humanLegal, render, setMsg } from './render.js';
import { advance, afterAction, hurry } from './flow.js';
import { finalFlip, isFinalFlip } from './reveal.js';

// ---------- input: tap and drag ----------
function humanTap(id) {
  if (!store.game || store.ui.busy || store.ui.intro || store.tour) return;
  const g = store.game,
    me = g.players[0],
    c = findCard(id);
  if (!c) return;
  if (g.phase === 'swap') {
    if (me.hand.includes(c)) store.ui.swapSel = store.ui.swapSel === id ? null : id;else if (me.up.includes(c) && store.ui.swapSel != null) {
      if (Shed.swap(g, 0, store.ui.swapSel, id) && store.remote) store.remote.send({ type: 'swap', hand: store.ui.swapSel, up: id });
      store.ui.swapSel = null;
      Shed.sortHand(g.rules, me.hand);
    }
    return render();
  }
  if (g.phase !== 'play' || g.turn !== 0) return;
  // cards picked: a tap on the pile plays them
  if (store.ui.sel.length && g.pile.includes(c)) return humanPlay();
  const z = Shed.zone(g, me);
  if (z === 'down' && me.down.includes(c)) {
    if (store.remote) return store.remote.blind(id);
    store.ui.busy = true;
    if (isFinalFlip(g, 0, id)) return finalFlip(id, Shed.canPlayCard(g.rules, c, g.pile), render, () => afterAction(Shed.playBlind(g, 0, id)));
    store.ui.reveal = id;
    render();
    return later(() => {
      store.ui.reveal = null;
      afterAction(Shed.playBlind(g, 0, id));
    }, store.ui.beat === 0 ? 1700 : 950);
  }
  if (!(z === 'hand' && me.hand.includes(c) || z === 'up' && me.up.includes(c))) return;
  if (!humanLegal(c)) {
    shake(id);
    SFX.bad();
    const top = Shed.effectiveTop(g.rules, g.pile);
    hint(store.tour ? 'Tap the glowing card for this step' : "Can't play " + c.rank + ' on ' + (top ? top.rank : 'that'));
    return;
  }
  buzz('tick');
  // a picked card tapped again plays everything picked
  if (store.ui.sel.includes(id)) return humanPlay();
  const pool = z === 'hand' ? me.hand : me.up;
  const first = store.ui.sel.length ? findCard(store.ui.sel[0]) : null;
  if (first && first.rank === c.rank) {
    store.ui.sel.push(id);
    // every matching card picked: nothing left to choose, so they go straight on
    const left = pool.filter(o => o.rank === c.rank && !store.ui.sel.includes(o.id)).length;
    if (!left) return humanPlay();
    hint(store.ui.sel.length + ' picked. Tap one again to play them, or tap another ' + c.rank);
    return render();
  }
  const twins = pool.filter(o => o.id !== id && o.rank === c.rank).length;
  if (store.settings.oneTap && !twins) {
    store.ui.sel = [];
    return humanPlay([id]);
  }
  store.ui.sel = [id];
  if (twins) hint(twins === 1 ? 'Tap the other ' + c.rank + ' to play both, or tap this one again' : 'Tap the other ' + c.rank + 's to add them, or tap this one again');
  render();
}

function humanPlay(ids) {
  ids = ids || store.ui.sel.slice();
  if (!ids.length || store.ui.busy) return;
  store.ui.sel = [];
  store.ui.busy = true;
  const r = Shed.play(store.game, 0, ids);
  if (r.ok && store.remote) store.remote.send({ type: 'play', ids });
  afterAction(r);
}

function shake(id) {
  const e = store.els[id];
  if (!e) return;
  e.classList.remove('shake');
  void e.offsetWidth;
  e.classList.add('shake');
}

function tableXY(e) {
  const r = table.getBoundingClientRect();
  return {
    x: e.clientX - r.left,
    y: e.clientY - r.top
  };
}

function onDown(e, id) {
  if (store.tour) return;
  const el = store.els[id];
  if (!el || !el.classList.contains('tap') || el.classList.contains('dim')) return;
  const g = store.game,
    me = g.players[0],
    c = findCard(id);
  if (!(me.hand.includes(c) || me.up.includes(c))) return; // face-down cards are tap only
  const p = tableXY(e);
  store.ui.pd = {
    id,
    sx: e.clientX,
    sy: e.clientY,
    x: p.x,
    y: p.y
  };
}

function endDrag(e, cancel) {
  const d = store.ui.drag;
  store.ui.pd = null;
  if (!d) {
    return;
  }
  store.ui.drag = null;
  store.ui.suppress = true;
  setTimeout(() => {
    store.ui.suppress = false;
  }, 60);
  if (cancel || !store.game || store.ui.busy) {
    render();
    return;
  }
  const g = store.game,
    me = g.players[0],
    L = store.lastL,
    id = d.id,
    c = findCard(id);
  if (g.phase === 'swap') {
    const toUp = me.hand.includes(c),
      pool = toUp ? me.up : me.hand;
    let best = null,
      bd = 1e9;
    pool.forEach(o => {
      const el = store.els[o.id];
      if (!el) return;
      const m = /([-\d.]+)px\s+([-\d.]+)px/.exec(el.style.translate);
      if (!m) return;
      const cx = +m[1] + store.cw / 2,
        cy = +m[2] + store.ch / 2,
        dist = Math.hypot(cx - d.x, cy - d.y);
      if (dist < bd) {
        bd = dist;
        best = o;
      }
    });
    if (best && bd < store.cw * .9) {
      const h = toUp ? id : best.id,
        u = toUp ? best.id : id;
      if (Shed.swap(g, 0, h, u) && store.remote) store.remote.send({ type: 'swap', hand: h, up: u });
      Shed.sortHand(g.rules, me.hand);
      store.ui.swapSel = null;
    }
    render();
    return;
  }
  if (g.phase === 'play' && g.turn === 0 && d.y < L.meTableCy - store.ch * .6) {
    if (!humanLegal(c)) {
      shake(id);
      SFX.bad();
      render();
      return;
    }
    const ids = store.ui.sel.includes(id) ? store.ui.sel.slice() : [id];
    store.ui.sel = [];
    render();
    humanPlay(ids);
    return;
  }
  render();
}

export function initInput() {
window.addEventListener('pointermove', e => {
  if (!store.ui.pd) return;
  if (!store.ui.drag) {
    if (Math.hypot(e.clientX - store.ui.pd.sx, e.clientY - store.ui.pd.sy) < 10) return;
    store.ui.drag = {
      id: store.ui.pd.id,
      active: true,
      x: 0,
      y: 0
    };
  }
  const p = tableXY(e);
  store.ui.drag.x = p.x;
  store.ui.drag.y = p.y;
  render();
});
window.addEventListener('pointerup', e => endDrag(e, false));
window.addEventListener('pointercancel', e => endDrag(e, true));
$('#bPlay').onclick = () => humanPlay();
// the pot outline takes a tap too, for when the pile is empty
$('#ring').onclick = () => {
  if (store.ui.sel.length) humanPlay();
};
$('#bPick').onclick = () => {
  if (store.ui.busy) return;
  store.ui.busy = true;
  const r = Shed.pickUp(store.game, 0);
  if (r.ok && store.remote) store.remote.send({ type: 'pickup' });
  afterAction(r);
};
// face-down follow-up: stop trying and end the go
$('#bDone').onclick = () => {
  const g = store.game;
  if (store.ui.busy || !g || !g.follow || g.follow.pi !== 0) return;
  if (store.remote) return store.remote.done();
  store.ui.busy = true;
  afterAction(Shed.followDone(g, 0));
};
$('#bReady').onclick = () => {
  const g = store.game;
  if (g.phase !== 'swap' || store.ui.busy) return;
  store.ui.busy = true;
  store.ui.swapSel = null;
  if (store.remote) return store.remote.ready();
  setMsg('Locked in');
  const f = $('#flash');
  f.textContent = 'LOCKED IN';
  f.classList.remove('go');
  void f.offsetWidth;
  f.classList.add('go');
  render();
  later(() => {
    // CPUs rearrange in front of you
    g.players.forEach((p, i) => {
      if (!p.human) Shed.cpuSwap(g, i);
    });
    render();
    later(() => {
      Shed.startPlay(g);
      setMsg(who(g.turn) + (g.turn === 0 ? ' go' : ' goes') + ' first (lowest card)');
      render();
      later(advance, 900);
    }, 900);
  }, 700);
};
$('#bSkip').onclick = () => {
  const g = store.game;
  if (g.phase !== 'play' || !g.players[0].out) return;
  store.gen++;
  store.ui.busy = true;
  let guard = 0;
  while (g.phase === 'play' && guard++ < 4000) {
    const r = Shed.cpuTurn(g, g.turn);
    if (!r.ok) break;
  }
  store.ui.hold = null;
  store.ui.reveal = null;
  render();
  later(advance, 100);
};

// waiting on the CPUs? a tap anywhere on the table hurries the next one along
$('#table').addEventListener('pointerdown', () => {
  const g = store.game;
  if (g && g.phase === 'play' && store.ui.busy && !store.remote && !store.tour) hurry();
});
// ---------- profiles, records, achievements ----------
}


export { humanPlay, humanTap, onDown, shake };

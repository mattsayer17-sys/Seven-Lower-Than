import Shed from '../engine.js';
import { $, table } from './dom.js';
import { ordinal, store } from './state.js';
import { allCards, findCard } from './cards.js';
import { syncMirror } from './access.js';

// ---------- layout ----------
function computeLayout() {
  const g = store.game,
    W = table.clientWidth,
    H = table.clientHeight,
    pos = {};
  const me = g.players[0],
    cpus = g.players.slice(1),
    m = cpus.length;
  // 4 or 5 at the table: opponents sit round it like a card room (two across the top, one each side),
  // small and readable, while the space goes to the player's own cards
  const wide = m >= 3, nTop = m === 3 ? 1 : 2, hsT = .32, scT = .42;
  store.cw = wide ? Math.max(38, Math.min(W / 5.1, (H - 152) / (hsT + 1.22 * scT + 3.92) / 1.4, 92)) : Math.max(38, Math.min(W / 5.1, (H - (m > 1 ? 130 : 114)) / (m > 1 ? 5.9 : 6.39) / 1.4, 92));
  store.ch = store.cw * 1.4;
  table.style.setProperty('--cw', store.cw + 'px');
  const L = {
    W,
    H
  };
  const panelW = wide ? W / nTop : W / m,
    sc = m === 1 ? .64 : wide ? Math.min(scT, (panelW - 16) / (store.cw * 3.16)) : Math.min(.56, (panelW - 16) / (store.cw * 3.16)),
    hs = m === 1 ? .48 : wide ? sc * hsT / scT : sc * .75,
    t0 = m === 1 ? 6 : 24;
  L.panels = cpus.map((p, k) => W * (k + .5) / m);
  L.m = m;
  L.gap = wide ? .98 : 1.35;
  L.drawS = wide ? .8 : 1;
  L.cpuHandCy = t0 + store.ch * hs * .5;
  const cpuTop = t0 + store.ch * hs + 8;
  L.cpuTableCy = cpuTop + store.ch * sc * .5;
  const cpuBot = cpuTop + store.ch * sc * 1.22;
  L.statusY = cpuBot + 4;
  const cTop = cpuBot + 40;
  L.centerCy = cTop + store.ch * .5;
  L.btnY = cTop + store.ch + 8;
  const meTop = L.btnY + 44;
  L.meTableCy = meTop + store.ch * .5;
  const meBot = meTop + store.ch * 1.22;
  L.meHandCy = meBot + 10 + store.ch * .5 + store.ch * .2;
  const spare = Math.max(0, H - (L.meHandCy + store.ch * .5 + 12));
  L.centerCy += spare * .2;
  L.btnY += spare * .2;
  L.meTableCy += spare * .45;
  L.meHandCy += spare * .75;
  const drawX = W / 2 - store.cw * L.gap,
    pileX = W / 2,
    burnX = W / 2 + store.cw * L.gap;
  // one entry per opponent: where its hand, its table cards and its name go
  L.seats = cpus.map((p, k) => ({ cx: L.panels[k], handCy: L.cpuHandCy, tableCy: L.cpuTableCy, sc, hs, w: panelW, kf: m === 1 ? 1.2 : 1.08, labelTop: 4 }));
  if (wide) {
    const half = store.cw * 1.38 + 4,
      sideW = Math.max(60, W / 2 - half - 2),
      scS = Math.min(.4, (sideW - 6) / (store.cw * 2.64)),
      hsS = scS * .75,
      sideH = 16 + store.ch * hsS + 4 + store.ch * scS * 1.22,
      top = Math.max(L.statusY + 40, L.centerCy + 6 - sideH / 2),
      side = { handCy: top + 16 + store.ch * hsS * .5, tableCy: top + 16 + store.ch * hsS + 4 + store.ch * scS * .5, sc: scS, hs: hsS, w: sideW, kf: .82, labelTop: top, side: true };
    const tops = Array.from({ length: nTop }, (_, j) => ({ cx: W * (j + .5) / nTop, handCy: L.cpuHandCy, tableCy: L.cpuTableCy, sc, hs, w: panelW, kf: 1.08, labelTop: 4 }));
    const left = Object.assign({ cx: sideW / 2 + 2 }, side), right = Object.assign({ cx: W - sideW / 2 - 2 }, side);
    L.seats = (m === 3 ? [left, tops[0], right] : [left, tops[0], tops[1], right]);
    L.panels = L.seats.map(x => x.cx);
  }
  L.drawX = drawX;
  L.pileX = pileX;
  // intro: everything stacked on the draw spot
  if (store.ui.intro) {
    const all = allCards(g),
      blank = store.ui.intro === 'blank';
    all.forEach((c, i) => {
      pos[c.id] = {
        cx: drawX - i / all.length * 3,
        cy: L.centerCy - i / all.length * 3 - (blank ? 70 : 0),
        rot: 0,
        s: 1,
        z: i,
        down: true,
        op: blank ? 0 : 1,
        nosh: i < all.length - 3
      };
    });
    return {
      pos,
      L
    };
  }
  g.draw.forEach((c, i) => {
    const f = i / Math.max(1, g.draw.length);
    pos[c.id] = {
      cx: drawX - f * 3,
      cy: L.centerCy - f * 3,
      rot: 0,
      s: L.drawS,
      z: i,
      down: true,
      nosh: i < g.draw.length - 3
    };
  });
  const pileList = store.ui.hold ? store.ui.hold : g.pile;
  const holdSet = new Set((store.ui.hold || []).map(c => c.id));
  pileList.forEach((c, i) => {
    pos[c.id] = {
      cx: pileX + (c.id * 53 % 9 - 4) * 1.6,
      cy: L.centerCy + (c.id * 29 % 9 - 4) * 1.6,
      rot: (c.id * 37 % 13 - 6) * 1.6,
      s: 1,
      z: 100 + i,
      down: false,
      nosh: i < pileList.length - 4
    };
  });
  g.burned.forEach((c, i) => {
    if (pos[c.id]) return;
    pos[c.id] = {
      cx: burnX + (c.id * 7 % 5 - 2),
      cy: L.centerCy + (c.id * 11 % 5 - 2),
      rot: c.id * 31 % 40 - 20,
      s: .62,
      z: i,
      down: true,
      op: .55,
      nosh: true
    };
  });
  const placeTable = (p, cx, cy, sz, kf) => {
    const sx = i => cx + (i - 1) * store.cw * kf * sz;
    p.down.forEach((c, i) => {
      if (c._slot == null) c._slot = i;
      const rv = store.ui.reveal === c.id;
      pos[c.id] = {
        cx: sx(c._slot),
        cy: rv ? cy + store.ch * .1 * sz : cy,
        rot: 0,
        s: rv ? Math.min(1, sz * 1.25) : sz,
        z: rv ? 300 : 20,
        down: !rv
      };
    });
    p.up.forEach((c, i) => {
      if (g.phase === 'swap' || c._uslot == null) c._uslot = i;
      pos[c.id] = {
        cx: sx(c._uslot),
        cy: cy + store.ch * .22 * sz,
        rot: 0,
        s: sz,
        z: 30,
        down: false
      };
    });
  };
  cpus.forEach((p, k) => { const S = L.seats[k]; placeTable(p, S.cx, S.tableCy, S.sc, S.kf); });
  placeTable(me, W / 2, L.meTableCy, 1, 1.2);
  const fan = (cards, cx, cy, scale, down, isMe, maxW) => {
    cards = cards.filter(c => !holdSet.has(c.id));
    const n = cards.length;
    if (!n) return;
    const maxSpread = maxW - store.cw * scale - 8;
    const step = n > 1 ? Math.min(isMe ? store.cw * .78 : store.cw * .3 * scale, maxSpread / (n - 1)) : 0;
    const startX = cx - step * (n - 1) / 2;
    cards.forEach((c, i) => {
      const mm = i - (n - 1) / 2;
      const sel = isMe && (store.ui.sel.includes(c.id) || store.ui.swapSel === c.id);
      pos[c.id] = {
        cx: startX + i * step,
        cy: cy + Math.min(mm * mm * .9, 16) * (isMe ? 1 : -.3) * (isMe ? 1 : scale) - (sel ? store.ch * .3 : 0),
        rot: mm * (n > 6 ? 1.1 : 2.2) * (isMe ? 1 : -1),
        s: scale,
        z: 200 + i + (sel ? 500 : 0),
        down: down
      };
    });
  };
  cpus.forEach((p, k) => { const S = L.seats[k]; fan(p.hand, S.cx, S.handCy, S.hs, true, false, S.w); });
  fan(me.hand, W / 2, L.meHandCy, 1, false, true, W - 6);
  if (store.ui.drag && store.ui.drag.active && pos[store.ui.drag.id]) pos[store.ui.drag.id] = {
    cx: store.ui.drag.x,
    cy: store.ui.drag.y - store.ch * .2,
    rot: 0,
    s: 1.1,
    z: 2000,
    down: false
  };
  return {
    pos,
    L
  };
}

function humanLegal(c) {
  const g = store.game;
  if (g.phase !== 'play' || g.turn !== 0 || store.ui.busy) return false;
  if (store.tour) return false;
  return Shed.canPlayCard(g.rules, c, g.pile);
}

function render() {
  if (!store.game) return;
  const {
    pos,
    L
  } = computeLayout();
  store.lastL = L;
  const g = store.game,
    me = g.players[0],
    z = Shed.zone(g, me);
  const canTapSwap = g.phase === 'swap' && !store.ui.busy && !store.ui.intro;
  const myTurn = g.phase === 'play' && g.turn === 0 && !store.ui.busy && !store.ui.intro;
  table.classList.toggle('blank', store.ui.intro === 'blank');
  table.classList.toggle('hideui', !!store.ui.hideui);
  table.classList.toggle('wide', L.m >= 3);
  const tapIds = new Set(), dimIds = new Set();
  Object.keys(store.els).forEach(id => {
    const el = store.els[id],
      p = pos[id];
    if (!p) return;
    el.style.translate = p.cx - store.cw / 2 + 'px ' + (p.cy - store.ch / 2) + 'px';
    el.style.rotate = p.rot + 'deg';
    el.style.scale = p.s;
    el.style.zIndex = p.z;
    el.style.opacity = p.op != null ? p.op : 1;
    el.classList.toggle('down', !!p.down);
    el.classList.toggle('nosh', !!p.nosh);
    const c = findCard(+id);
    let tap = false,
      dim = false;
    if (canTapSwap && c && (me.hand.includes(c) || me.up.includes(c))) tap = true;
    if (myTurn && c) {
      if (z === 'down' && me.down.includes(c)) tap = true;else if (z === 'hand' && me.hand.includes(c) || z === 'up' && me.up.includes(c)) {
        tap = true;
        dim = !humanLegal(c);
      }
    }
    if (tap) tapIds.add(+id);
    if (dim) dimIds.add(+id);
    el.classList.toggle('tap', tap);
    el.classList.toggle('dim', dim);
    el.classList.toggle('dragging', !!(store.ui.drag && store.ui.drag.active && store.ui.drag.id === +id));
    el.classList.toggle('sel', store.ui.sel.includes(+id) || store.ui.swapSel === +id);
    el.classList.toggle('twin', !!(c && myTurn && store.ui.sel.length && !store.ui.sel.includes(+id) && (me.hand.includes(c) || me.up.includes(c)) && c.rank === (findCard(store.ui.sel[0]) || {}).rank));
    el.classList.toggle('pulse', canTapSwap && store.ui.swapSel != null && c && me.up.includes(c));
    el.classList.toggle('glow', !!(store.tour && store.tour.glow === +id));
  });
  // labels
  const lm = $('#lblMe');
  lm.style.left = '12px';
  lm.style.top = L.meHandCy - store.ch * .5 - 18 + 'px';
  lm.classList.toggle('active', g.phase === 'play' && g.turn === 0);
  lm.classList.toggle('out', me.out);
  g.players.slice(1).forEach((p, k) => {
    const l = $('#lblP' + p.id);
    if (!l) return;
    if (L.m === 1) {
      l.style.left = '12px';
      l.style.top = '12px';
    } else {
      l.style.left = L.seats[k].cx + 'px';
      l.style.top = L.seats[k].labelTop + 'px';
      l.style.maxWidth = L.seats[k].side ? L.seats[k].w + 'px' : '';
      l.classList.toggle('sd', !!L.seats[k].side);
    }
    l.querySelector('.nm').textContent = p.name;
    const av = l.querySelector('.av');
    av.textContent = (p.name || '?').trim().charAt(0).toUpperCase();
    av.style.setProperty('--h', (p.id * 67 + 20) % 360);
    const ct = l.querySelector('.ct');
    ct.textContent = p.out ? 'out' : p.hand.length ? p.hand.length : '';
    ct.style.display = ct.textContent === '' ? 'none' : '';
    l.classList.toggle('active', g.phase === 'play' && g.turn === p.id);
    l.classList.toggle('out', p.out);
  });
  const dc = $('#drawCount');
  dc.style.left = L.drawX + 'px';
  dc.style.top = L.centerCy + store.ch * .5 + 4 + 'px';
  dc.textContent = g.draw.length ? g.draw.length + ' left' : '';
  const dr = $('#dir');
  dr.style.left = L.pileX + store.cw * L.gap + 'px';
  dr.style.top = L.centerCy + store.ch * .5 - 2 + 'px';
  dr.textContent = g.dir === 1 ? '↻' : '↺';
  dr.title = g.dir === 1 ? 'Clockwise' : 'Counter-clockwise';
  const ring = $('#ring');
  ring.style.left = L.pileX - store.cw * .62 + 'px';
  ring.style.top = L.centerCy - store.ch * .62 + 'px';
  ring.style.width = store.cw * 1.24 + 'px';
  ring.style.height = store.ch * 1.24 + 'px';
  const dragging = store.ui.drag && store.ui.drag.active;
  ring.classList.toggle('live', !!dragging && g.phase === 'play');
  ring.classList.toggle('hot', !!dragging && g.phase === 'play' && store.ui.drag.y < L.meTableCy - store.ch * .6);
  const wm = $('#wm');
  wm.style.top = L.centerCy - 30 + 'px';
  const st = $('#status'),
    ms = $('#msg');
  st.style.top = L.statusY + 'px';
  ms.style.top = L.statusY + 20 + 'px';
  $('#actions').style.top = L.btnY + 'px';
  $('#flash').style.top = L.centerCy - 30 + 'px';
  const lk = $('#lock'),
    topc = Shed.effectiveTop(g.rules, g.pile),
    isSt = !!topc && Shed.effect(g.rules, topc) === 'stinger' && g.phase === 'play' && !store.ui.intro;
  lk.style.left = L.pileX + 'px';
  lk.style.top = L.centerCy - store.ch * .5 - 10 + 'px';
  lk.classList.toggle('on', isSt && !store.ui.hold);
  if (isSt) $('#lockT').textContent = 'only ' + topc.rank;
  const stT = statusText();
  if (st.textContent !== stT) st.textContent = stT;
  $('#bReady').classList.toggle('hidden', !(g.phase === 'swap' && !store.ui.busy && !store.ui.intro));
  $('#bPlay').classList.toggle('hidden', !(myTurn && store.ui.sel.length));
  if (store.ui.sel.length) {
    const c = findCard(store.ui.sel[0]);
    $('#bPlay').textContent = 'Play ' + (store.ui.sel.length > 1 ? store.ui.sel.length + ' × ' : '') + c.rank;
  }
  const mustPick = myTurn && z !== 'down' && !Shed.canAnyPlay(g, 0);
  $('#bPick').classList.toggle('hidden', !mustPick);
  $('#bSkip').classList.toggle('hidden', !(g.phase === 'play' && me.out) || !!g.online);
  syncMirror(g, { tap: tapIds, dim: dimIds, picking: myTurn && z === 'down' });
}

function statusText() {
  const g = store.game;
  if (store.ui.intro || store.ui.hideui) return '';
  if (!store.settings.tips && g.phase !== 'over' && !(g.phase === 'play' && g.players[0].out)) return g.phase === 'play' && g.turn !== 0 ? g.players[g.turn].name + '…' : '';
  if (g.phase === 'swap') return store.ui.busy ? '' : 'Rearrange your cards. One chance';
  if (g.phase === 'over') return '';
  if (g.players[0].out) return 'You are out (' + ordinal(g.finished.indexOf(0) + 1) + '). Watching the rest';
  if (g.turn !== 0) return g.players[g.turn].name + ' is thinking…';
  if (store.ui.busy) return '';
  const me = g.players[0],
    z = Shed.zone(g, me);
  if (z === 'down') return 'Pick a hidden card';
  const top = Shed.effectiveTop(g.rules, g.pile);
  if (!g.pile.length || !top) return 'Your turn. Play anything';
  const e = Shed.effect(g.rules, top);
  if (e === 'reset') return 'Your turn. Play anything';
  if (e === 'lower') return 'Your turn. Play ' + top.rank + ' or lower';
  if (e === 'stinger') return 'Your turn. Only a ' + top.rank + (Shed.RANK_LIST.some(k => g.rules.ranks[k].effect === 'transparent') ? ' (or an invisible card)' : '');
  return 'Your turn. Play ' + top.rank + ' or higher';
}

function setMsg(t) {
  const m = $('#msg'), v = t || '';
  if (m.textContent !== v) m.textContent = v;
}

function hint(t) {
  if (store.settings.tips) setMsg(t);else setMsg('');
}

// ---------- flow ----------

export { hint, humanLegal, render, setMsg };

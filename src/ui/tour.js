import { $ } from './dom.js';
import { FAST, applyCB, applyFelt, applySkill, save, store } from './state.js';
import { allCards } from './cards.js';
import { render } from './render.js';
import { cpuStep, newGame } from './flow.js';
import { humanPlay } from './input.js';
import { prof, unlock } from './profile.js';
import { hideModal } from './sheets.js';
import { showSetup } from './setup.js';

function rigTour(g) {
  const all = allCards(g);
  const take = (r, su) => all.splice(all.findIndex(c => c.rank === r && c.suit === su), 1)[0];
  const me = g.players[0],
    cp = g.players[1];
  const nine = take('9', 'C'),
    queen = take('Q', 'D'),
    five = take('5', 'H');
  me.hand = [five, nine, queen];
  me.up = [take('K', 'S'), take('3', 'D'), take('7', 'H')];
  me.down = [take('6', 'C'), take('J', 'D'), take('2', 'S')];
  const king = take('K', 'C');
  cp.hand = [king, take('4', 'H'), take('3', 'C')];
  cp.up = [take('4', 'D'), take('5', 'S'), take('9', 'D')];
  cp.down = [take('3', 'S'), take('4', 'S'), take('5', 'C')];
  const six = take('6', 'H'),
    ten = take('10', 'D'),
    eight = take('8', 'H'),
    cpuDraw = take('3', 'H');
  g.pile = [six];
  g.burned = [];
  g.draw = all;
  g.draw.push(eight, cpuDraw, ten); // pops: ten (you), 3H (CPU), 8H (you)
  store.tour = {
    manual: true,
    ready: false,
    waiting: false,
    glow: null,
    cpu: [{
      id: king.id
    }, {
      pickup: true
    }],
    ids: {
      nine: nine.id,
      ten: ten.id,
      eight: eight.id,
      queen: queen.id
    }
  };
}

const ABORT = {
  abort: 1
};

const chk = () => {
  if (store.demo && store.demo.abort) throw ABORT;
};

const sleep = ms => new Promise(r => setTimeout(r, FAST ? Math.min(ms, 15) : store.settings.fast ? Math.round(ms * .45) : ms)).then(chk);

const until = async (fn, max) => {
  const t0 = Date.now();
  while (!fn() && Date.now() - t0 < (max || 9000)) {
    await new Promise(r => setTimeout(r, 40));
    chk();
  }
};

function capShow(title, text) {
  $('#capT').innerHTML = '<b>' + title + '</b>' + text;
  $('#cap').classList.remove('hidden');
  $('#capNext').classList.add('hidden');
}

function capWait(label) {
  return new Promise(r => {
    store.demo.release = r;
    const n = $('#capNext');
    n.textContent = label || 'Continue';
    n.classList.remove('hidden');
  }).then(() => {
    $('#capNext').classList.add('hidden');
    store.demo.release = null;
    chk();
  });
}

function fingerAt(el) {
  const f = $('#finger'),
    a = $('#app').getBoundingClientRect(),
    r = el.getBoundingClientRect();
  f.classList.remove('hidden');
  f.style.transform = 'translate(' + (r.left - a.left + r.width / 2) + 'px,' + (r.top - a.top + r.height / 2) + 'px)';
}

function fingerTap() {
  const f = $('#finger');
  f.classList.remove('tap');
  void f.offsetWidth;
  f.classList.add('tap');
}

async function pointTap(el, act) {
  try {
    el.scrollIntoView({
      block: 'nearest',
      behavior: 'instant'
    });
  } catch (e) {}
  await sleep(300);
  fingerAt(el);
  await sleep(800);
  fingerTap();
  await sleep(200);
  if (act) act();
  await sleep(450);
}

async function tapCard(id) {
  const el = store.els[id];
  store.tour.glow = id;
  render();
  fingerAt(el);
  await sleep(850);
  fingerTap();
  await sleep(250);
  store.ui.sel = [id];
  render();
  await sleep(450);
  store.tour.glow = null;
  store.tour.waiting = false;
  humanPlay([id]);
  await until(() => store.tour.waiting);
  await sleep(500);
}

async function cpuMove() {
  await until(() => store.tour.waiting && store.game.turn !== 0);
  await sleep(500);
  store.tour.waiting = false;
  cpuStep();
  await until(() => store.tour.waiting);
  await sleep(500);
}

function restoreSettings(snap) {
  if (!snap) return;
  Object.keys(store.settings).forEach(k => delete store.settings[k]);
  Object.assign(store.settings, JSON.parse(snap));
  save();
  applySkill();
  applyFelt();
  applyCB();
}

async function startDemo() {
  if (store.demo) return;
  store.demo = {
    abort: false,
    release: null
  };
  const snap = JSON.stringify(store.settings);
  $('#offer').classList.add('hidden');
  let done = false;
  try {
    store.settings.skipOn = false;
    store.settings.skipRank = '8';
    store.settings.transparentOn = false;
    store.settings.custom = [];
    store.settings.players = 2;
    store.settings.cpu = store.settings.cpu.map(() => 'normal');
    $('#app').classList.add('walk');
    showSetup('game');
    $('#modal').classList.add('walk');
    const sh = () => document.querySelector('.sheet');
    capShow('Your table', 'Choose 2 to 4 players and how sharp each CPU is.');
    await pointTap(sh().querySelector('#seg button[data-n="3"]'), () => sh().querySelector('#seg button[data-n="3"]').click());
    await pointTap(sh().querySelector('#lv .seg button[data-k="hard"]'), () => sh().querySelector('#lv .seg button[data-k="hard"]').click());
    await capWait();
    $('#tabRules').click();
    capShow('House rules', 'Tick a house rule to switch it on. Skip a go sits on 8s here, the same as your table.');
    await pointTap($('#rSk'), () => $('#rSk').click());
    await capWait();
    capShow('Make your own', 'Describe a card, or pick one. A stinger means only that same rank can be played on it. Your rule joins the list, ready to tick.');
    await pointTap($('#mRank'), () => {
      $('#mRank').value = '3';
    });
    await pointTap($('#mEff'), () => {
      $('#mEff').value = 'stinger';
    });
    await pointTap($('#mAdd'), () => $('#mAdd').click());
    const cb = sh().querySelector('#customRows input[data-t]');
    if (cb) await pointTap(cb);
    await capWait();
    $('#tabGame').click();
    capShow('Daily deal and record', 'A new deal every day, the same for everyone. Your wins and losses are saved to your profile.');
    sh().scrollTop = 0;
    await sleep(300);
    const dEl = $('#dPlay') || $('#dShare');
    if (dEl) {
      fingerAt(dEl);
      await sleep(900);
    }
    await capWait();
    $('#finger').classList.add('hidden');
    // on the felt
    $('#modal').classList.remove('walk');
    hideModal();
    newGame({
      tour: true
    });
    await until(() => store.tour && store.tour.ready, 15000);
    $('#app').classList.add('walk');
    const T = store.tour,
      ids = T.ids;
    capShow('Your cards', 'Last one holding cards gets the Wooden Spoon. You play from your hand first, then your face-up cards, then the face-down ones.');
    await sleep(600);
    await capWait();
    capShow('Equal or higher', 'The pile shows a 6. Play a card that is equal or higher. Here goes a 9.');
    await tapCard(ids.nine);
    await capWait();
    capShow('The CPU plays', 'Now the CPU takes its turn. Its King is high.');
    await cpuMove();
    await capWait();
    capShow('10 burns', 'Nothing beats a King except a 10. A 10 burns the whole pile and you go again.');
    await tapCard(ids.ten);
    await capWait();
    capShow('Skip a go', 'This table has Skip a go on 8s. The next player misses a turn. With 2 players, that means you go again.');
    await tapCard(ids.eight);
    await capWait();
    capShow('Play again', 'You were given another go. A Queen beats the 8.');
    await tapCard(ids.queen);
    await capWait();
    capShow('No move? Pick up', 'Nothing beats a Queen except a King, 2 or 10. When you cannot play, you pick up the whole pile. Watch the CPU.');
    await cpuMove();
    await capWait();
    capShow('That is the basics', 'Change which cards do what in Setup, or describe your own rules in plain English.');
    done = true;
    await capWait('Done');
  } catch (e) {
    if (e !== ABORT) console.error(e);
  } finally {
    const felt = !!store.tour;
    store.demo = null;
    $('#cap').classList.add('hidden');
    $('#finger').classList.add('hidden');
    $('#capNext').classList.add('hidden');
    $('#modal').classList.remove('walk');
    $('#app').classList.remove('walk');
    restoreSettings(snap);
    if (felt) {
      store.tour = null;
      newGame();
    }
    if (done) unlock('tour');
    showSetup();
  }
}

function offerTour() {
  const p = prof();
  if (!p || p.flags.offer || store.tour || store.demo || store.ui.intro) return;
  p.flags.offer = true;
  save();
  $('#offer').classList.remove('hidden');
}

// ---------- chat: humans only, floats over the felt, never takes space from the cards ----------

export { offerTour, rigTour, startDemo };

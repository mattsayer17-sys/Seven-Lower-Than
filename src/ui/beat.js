// Last card, last two players: a slow heartbeat until it is played, then the play itself in slow motion.
// The game is about not losing, so with two left that one card either ends it or hands the other player a reprieve.
// Haptics: Android browsers vibrate; the iOS app wrap uses Capacitor Haptics (in buzz). iPhone Safari has no vibration
// for websites, so there it is the sound and the pulse on screen (and the switch-control tick where Safari gives one).
import { $ } from './dom.js';
import { FAST, store } from './state.js';
import { SFX, buzz } from './audio.js';

let timer = null, who = -1, tick = null;

// iOS Safari 18+ gives a light haptic when a switch control is toggled. Best effort only.
function iosTick() {
  if (!store.settings.sound || store.settings.haptic === false) return;
  try {
    if (!tick) {
      tick = document.createElement('label');
      tick.setAttribute('aria-hidden', 'true');
      tick.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none';
      tick.innerHTML = '<input type="checkbox" switch tabindex="-1">';
      document.body.appendChild(tick);
    }
    tick.click();
  } catch (e) {}
}

let period = 1150;

function beat() {
  SFX.heart();
  buzz([35, 160, 45]);
  iosTick();
  setTimeout(iosTick, 200);
  const t = $('#table');
  t.classList.remove('beat');
  void t.offsetWidth;
  t.classList.add('beat');
}

// The final face-down card: two players left and this player has nothing else. Nobody knows what it is.
// (A last card from the hand or face up is known to its owner, so it doesn't get this.)
function onTheLine(g) {
  if (!g || g.phase !== 'play' || store.ui.intro || store.tour || store.demo) return -1;
  if (g.players.filter(p => !p.out).length !== 2 || g.draw.length) return -1;
  const p = g.players[g.turn];
  return p && !p.out && !p.hand.length && !p.up.length && p.down.length === 1 ? g.turn : -1;
}

function run() {
  clearInterval(timer);
  timer = null;
  if (who >= 0 && period > 0 && !FAST) timer = setInterval(beat, period);
}

// The reveal speeds the heart up as the card lifts and teases, and stops it dead as the card turns (0 = silence).
export function setTempo(ms) {
  if (ms === period) return;
  const wasStopped = period === 0;
  period = ms;
  if (who < 0) return;
  if (ms > 0 && wasStopped && !FAST) beat();
  run();
}

export function beatCheck() {
  // while the card is in the air, the reveal owns the heartbeat
  if (store.ui.big) return;
  const pi = onTheLine(store.game);
  if (pi === who) return;
  who = pi;
  period = 1150;
  store.ui.beat = pi >= 0 ? pi : null;
  $('#table').classList.toggle('beating', pi >= 0);
  if (pi >= 0 && !FAST) beat();
  run();
}

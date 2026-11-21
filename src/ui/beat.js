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

// Whose last card is on the line, or -1.
function onTheLine(g) {
  if (!g || g.phase !== 'play' || store.ui.intro || store.tour || store.demo) return -1;
  if (g.players.filter(p => !p.out).length !== 2 || g.draw.length) return -1;
  const p = g.players[g.turn];
  return p && !p.out && p.hand.length + p.up.length + p.down.length === 1 ? g.turn : -1;
}

export function beatCheck() {
  const pi = onTheLine(store.game);
  if (pi === who) return;
  who = pi;
  store.ui.beat = pi >= 0 ? pi : null;
  clearInterval(timer);
  timer = null;
  $('#table').classList.toggle('beating', pi >= 0);
  if (pi >= 0 && !FAST) { beat(); timer = setInterval(beat, 1150); }
}

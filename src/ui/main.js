import Shed from '../engine.js';
import { FAST, applyFelt, store } from './state.js';
import { showSetup } from './setup.js';
import { showOnline } from './online.js';
import { render } from './render.js';
import { advance, newGame } from './flow.js';
import { initInput } from './input.js';
import { loadProfiles, prof, toastTest, updateStats } from './profile.js';
import { applyMotion, fxTest, pickFx } from './fx.js';
import { startDemo } from './tour.js';
import { maybeWelcome, showWelcome } from './welcome.js';
import { chatIncoming, chatSync, initChat, reactTo } from './chat.js';
import { initHeader } from './header.js';
import { initAccess, hooks } from './access.js';
import { humanTap } from './input.js';
import { initDialogs } from './sheets.js';
import { tableForTest } from './vote.js';
import Online from '../online.js';
import { initNative, onPushOpen } from './native.js';



applyMotion();
initInput();
hooks.tap = humanTap;
initAccess();
initDialogs();
loadProfiles();
initChat();
initHeader();
window.Shed = Shed; // handy in the console, and used by the test driver
window.__ms = {
  demo: () => startDemo(),
  pickFx: (i, n) => pickFx(i, n),
  fx: fxTest,
  toast: id => toastTest(id),
  chatOnline: () => {
    if (store.game) {
      store.game.meta.online = true;
      chatSync();
    }
  },
  chatIncoming: (n, t) => chatIncoming(n, t),
  react: ev => reactTo(ev),
  game: () => store.game,
  ui: () => store.ui,
  layout: () => store.lastL,
  tour: () => store.tour,
  prof: () => prof(),
  advance: () => advance(),
  render: () => render(),
  setSettings: o => Object.assign(store.settings, o),
  settings: () => store.settings,
  table: tableForTest,
  welcome: () => showWelcome(),
  digest: () => Online.digest(store.game),
  remote: () => store.remote
};
updateStats();
applyFelt();
newGame();
// Every visit starts on the setup sheet with the last choices ticked. First-timers get the welcome instead.
// An invite link (?join=CODE) goes straight to that table instead.
{
  const p = prof();
  let join = '';
  try {
    join = new URLSearchParams(location.search).get('join') || '';
    if (join) history.replaceState(null, '', location.pathname + location.hash);
  } catch (e) {}
  if (join) {
    if (p) p.flags.welcomed = true;
    showOnline({ join });
  } else if (p && (p.flags.welcomed || p.flags.offer || p.g > 0) && (!FAST || window.__MS_START)) showSetup('game');
}
// the iPhone app: invite links and notification taps open the table
initNative({ onJoin: join => showOnline({ join }) });
onPushOpen(join => showOnline({ join }));
// once the first deal has settled, say hello (once per profile)
let welcomeTries = 0;
const welcomeTimer = setInterval(() => { if (maybeWelcome() || ++welcomeTries > 40) clearInterval(welcomeTimer); }, 500);

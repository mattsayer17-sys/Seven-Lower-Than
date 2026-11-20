import Shed from '../engine.js';
import { FAST, applyFelt, store } from './state.js';
import { showSetup } from './setup.js';
import { render } from './render.js';
import { advance, newGame } from './flow.js';
import { initInput } from './input.js';
import { loadProfiles, prof, updateStats } from './profile.js';
import { applyMotion, fxTest, pickFx } from './fx.js';
import { startDemo } from './tour.js';
import { maybeWelcome, showWelcome } from './welcome.js';
import { chatIncoming, chatSync, initChat } from './chat.js';
import { initHeader } from './header.js';
import { initAccess, hooks } from './access.js';
import { humanTap } from './input.js';
import { initDialogs } from './sheets.js';
import { tableForTest } from './vote.js';
import Online from '../online.js';



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
  chatOnline: () => {
    if (store.game) {
      store.game.meta.online = true;
      chatSync();
    }
  },
  chatIncoming: (n, t) => chatIncoming(n, t),
  game: () => store.game,
  ui: () => store.ui,
  layout: () => store.lastL,
  tour: () => store.tour,
  prof: () => prof(),
  advance: () => advance(),
  render: () => render(),
  setSettings: o => Object.assign(store.settings, o),
  table: tableForTest,
  welcome: () => showWelcome(),
  digest: () => Online.digest(store.game),
  remote: () => store.remote
};
updateStats();
applyFelt();
newGame();
// Every visit starts on the setup sheet with the last choices ticked. First-timers get the welcome instead.
{
  const p = prof();
  if (p && (p.flags.welcomed || p.flags.offer || p.g > 0) && (!FAST || window.__MS_START)) showSetup('game');
}
// once the first deal has settled, say hello (once per profile)
let welcomeTries = 0;
const welcomeTimer = setInterval(() => { if (maybeWelcome() || ++welcomeTries > 40) clearInterval(welcomeTimer); }, 500);

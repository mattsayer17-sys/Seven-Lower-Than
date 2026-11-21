// The last face-down card of the last two players. Nobody at the table knows what it is, so everyone watches it turn:
// it rises to the middle of the felt, grows, turns over slowly, hangs there a moment, and only then plays or gets picked up.
import { later, store } from './state.js';
import { SFX, buzz } from './audio.js';
import { fxOn } from './fx.js';

// Is this face-down card the last card of one of the last two players?
export function isFinalFlip(g, pi, id) {
  if (!g || g.phase !== 'play' || !fxOn()) return false;
  if (g.players.filter(p => !p.out).length !== 2 || g.draw.length) return false;
  const p = g.players[pi];
  return !!p && !p.hand.length && !p.up.length && p.down.length === 1 && p.down[0].id === id;
}

// Lift, turn, hold, then done(). render is passed in so this file stays free of the render import cycle.
export function finalFlip(id, render, done) {
  store.ui.big = { id, face: false };
  render();
  later(() => {
    store.ui.big = { id, face: true };
    SFX.reveal();
    buzz(30);
    render();
  }, 1000);
  later(() => {
    store.ui.big = null;
    done();
  }, 2700);
}

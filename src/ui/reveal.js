// The last face-down card of the last two players. Nobody at the table knows what it is, so everyone watches it turn.
// One move: from where it lies it turns over slowly while it grows and travels to the middle, the table dims.
//   turn    0.0 s  rises, grows, moves to the centre and turns over, all at once (2.2 s)
//   verdict 2.3 s  it hangs face up with a gold glow if it can go, red if it can't
//   release 3.3 s  it plays (slow motion) or gets picked up
import { FAST, later, store } from './state.js';
import { SFX, buzz } from './audio.js';
import { fxOn } from './fx.js';
import { setTempo } from './beat.js';

const T = { verdict: 2300, release: 3300 };

// Is this face-down card the last card of one of the last two players?
export function isFinalFlip(g, pi, id) {
  if (!g || g.phase !== 'play' || !fxOn() || FAST) return false;
  if (g.players.filter(p => !p.out).length !== 2 || g.draw.length) return false;
  const p = g.players[pi];
  return !!p && !p.hand.length && !p.up.length && p.down.length === 1 && p.down[0].id === id;
}

// ok: whether the card can go on the pile (decides the verdict glow). render is passed in to avoid an import cycle.
export function finalFlip(id, ok, render, done) {
  const set = (stage, face) => { store.ui.big = { id, stage, face, ok }; render(); };
  set('turn', true);
  setTempo(560);
  SFX.rise();
  buzz('turn');
  later(() => setTempo(0), 1400);
  later(() => { set('verdict', true); SFX.verdict(ok); buzz(ok ? 'flipok' : 'flipno'); }, T.verdict);
  later(() => {
    store.ui.big = null;
    done();
  }, T.release);
}

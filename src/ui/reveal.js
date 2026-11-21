// The last face-down card of the last two players. Nobody at the table knows what it is, so everyone watches it turn.
// Built like a pack reveal: build-up, the moment of most tension, then release.
//   lift    0.0 s  the card rises to the middle and grows, the rest of the table dims, the heartbeat quickens
//   tease   0.9 s  it hovers and rocks, a rising tone, the heartbeat races
//   turn    2.4 s  silence: the heartbeat stops and the card turns over slowly
//   verdict 3.7 s  it hangs face up with a gold glow if it can go, red if it can't
//   release 4.5 s  it plays (slow motion) or gets picked up
import { FAST, later, store } from './state.js';
import { SFX, buzz } from './audio.js';
import { fxOn } from './fx.js';
import { setTempo } from './beat.js';

const T = { tease: 900, turn: 2400, verdict: 3700, release: 4500 };

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
  set('lift', false);
  setTempo(800);
  buzz('lift');
  later(() => { set('tease', false); setTempo(560); SFX.rise(); }, T.tease);
  later(() => { set('turn', true); setTempo(0); buzz('turn'); }, T.turn);
  later(() => { set('verdict', true); SFX.verdict(ok); buzz(ok ? 'flipok' : 'flipno'); }, T.verdict);
  later(() => {
    store.ui.big = null;
    done();
  }, T.release);
}

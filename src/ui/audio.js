import { FAST, store } from './state.js';

// ---------- sound and haptics (synthesised, no files) ----------
let AC = null;

function tone(f, d, type, vol, slide, delay) {
  if (!store.settings.sound || FAST) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    const t0 = AC.currentTime + (delay || 0),
      o = AC.createOscillator(),
      g = AC.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + d);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || .12, t0 + .008);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + d);
    o.connect(g);
    g.connect(AC.destination);
    o.start(t0);
    o.stop(t0 + d + .02);
  } catch (e) {}
}

// Haptics: each moment has its own feel. Native (Capacitor Haptics, Core Haptics on iOS) plays the
// step patterns; Android web falls back to vibrate timings; iPhone web has no vibration API, so nothing.
// Haptics follow their own setting, not the sound switch.
const HAPTIC = {
  tick: { steps: [[0, 'tick']], web: 6 },
  play: { steps: [[0, 'light']], web: 8 },
  lock: { steps: [[0, 'medium']], web: 14 },
  bad: { steps: [[0, 'error']], web: 25 },
  burn: { steps: [[0, 'light'], [70, 'medium'], [150, 'heavy']], web: [20, 30, 40] },
  stung: { steps: [[0, 'warning'], [180, 'heavy']], web: [40, 30, 90] },
  pick: { steps: [[0, 'heavy'], [110, 'medium'], [210, 'light']], web: [70, 50, 120] },
  boom: { steps: [[0, 'heavy'], [90, 'heavy'], [200, 'medium'], [320, 'light']], web: [60, 40, 220] },
  heartbeat: { steps: [[0, 'heavy'], [160, 'medium']], web: [35, 140, 25] },
  // the final face-down flip: a light lift, a tick as it turns, then the verdict
  lift: { steps: [[0, 'light']], web: 12 },
  turn: { steps: [[0, 'tick']], web: 6 },
  flipok: { steps: [[0, 'success'], [140, 'medium']], web: [25, 60, 25, 60, 60] },
  flipno: { steps: [[0, 'heavy'], [130, 'error']], web: [160, 60, 60] },
  win: { steps: [[0, 'success']], web: [20, 60, 20] },
  lose: { steps: [[0, 'heavy'], [180, 'heavy'], [360, 'warning']], web: [120, 60, 120, 60, 400] }
};
function hapticStep(H, k) {
  if (k === 'tick') return H.selectionChanged ? H.selectionChanged() : H.impact({ style: 'LIGHT' });
  if (k === 'success' || k === 'warning' || k === 'error') return H.notification({ type: k.toUpperCase() });
  return H.impact({ style: k.toUpperCase() });
}
function buzz(name) {
  if (store.settings.haptic === false || FAST) return;
  const pat = HAPTIC[name] || HAPTIC.play;
  try {
    const H = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
    if (H) {
      for (const [t, k] of pat.steps) t ? setTimeout(() => { try { hapticStep(H, k); } catch (e) {} }, t) : hapticStep(H, k);
      return;
    }
    if (navigator.vibrate) navigator.vibrate(pat.web);
  } catch (e) {}
}

function noise(d, vol, delay, lp) {
  if (!store.settings.sound || FAST) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    const t0 = AC.currentTime + (delay || 0),
      n = Math.floor(AC.sampleRate * d),
      b = AC.createBuffer(1, n, AC.sampleRate),
      a = b.getChannelData(0);
    for (let i = 0; i < n; i++) a[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = AC.createBufferSource();
    src.buffer = b;
    const f = AC.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(lp || 3000, t0);
    f.frequency.exponentialRampToValueAtTime(300, t0 + d);
    const g = AC.createGain();
    g.gain.value = vol || .1;
    src.connect(f);
    f.connect(g);
    g.connect(AC.destination);
    src.start(t0);
  } catch (e) {}
}
// Haptics only confirm your own decisions. Sound carries everything else.
const SFX = {
  play(me) {
    tone(180, .09, 'triangle', .16, 90);
    if (me) buzz('play');
  },
  deal() {
    tone(1400, .05, 'triangle', .05, 500);
  },
  burn(ev) {
    // fireball: a low whoosh as it falls, a thump as it lands, then the crackle of the pile going up
    noise(.32, .16, 0, 900);
    tone(110, .22, 'sine', .1, 40, .3);
    noise(.5, .05, .32, 6000);
    if (ev && ev.pi === 0) buzz('burn');
  },
  stung(me) {
    // a flare of flame
    noise(.45, .12, 0, 1800);
    tone(330, .35, 'sawtooth', .05, 120, .02);
    if (me) buzz('stung');
  },
  pick(me) {
    tone(260, .18, 'triangle', .12, 150);
    tone(200, .18, 'triangle', .1, 110, .1);
    if (me) buzz('pick');
  },
  skip() {
    tone(760, .1, 'square', .05, 380);
    tone(520, .14, 'square', .05, 220, .08);
  },
  lock() {
    tone(1600, .04, 'square', .06);
    tone(700, .1, 'square', .07, 350, .05);
  },
  again() {
    tone(520, .08, 'triangle', .08);
    tone(780, .1, 'triangle', .08, 0, .07);
  },
  ach() {
    [659, 880, 1175].forEach((f, i) => tone(f, .18, 'triangle', .1, 0, i * .09));
  },
  chat() {
    tone(900, .05, 'sine', .05);
  },
  boom(me) {
    noise(.8, .2, 0, 900);
    tone(80, .7, 'sine', .22, 28);
    tone(160, .4, 'sawtooth', .06, 50, .02);
    if (me) buzz('boom');
  },
  bad() {
    tone(120, .14, 'square', .08, 90);
    buzz('bad');
  },
  win() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, .28, 'triangle', .12, 0, i * .11));
    buzz('win');
  },
  lose() {
    [392, 330, 262].forEach((f, i) => tone(f, .35, 'sine', .12, 0, i * .18));
    buzz('lose');
  },
  turn() {
    tone(660, .07, 'sine', .07);
  },
  // the final flip: a long rising breath while it hovers, then the verdict
  rise() {
    tone(180, 1.45, 'sine', .05, 620);
    tone(90, 1.45, 'triangle', .04, 310);
  },
  verdict(ok) {
    if (ok) { tone(523, .5, 'triangle', .12); tone(659, .5, 'triangle', .1, 0, .06); tone(784, .7, 'triangle', .1, 0, .12); }
    else { tone(110, .45, 'sawtooth', .1, 70); tone(82, .6, 'sine', .18, 60, .05); }
  },
  // lub-dub: two low thumps you feel more than hear
  heart() {
    tone(58, .14, 'sine', .32, 44);
    tone(52, .16, 'sine', .26, 40, .2);
  }
};

export { SFX, buzz };

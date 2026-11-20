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

function buzz(ms) {
  if (!store.settings.sound || store.settings.haptic === false) return;
  try {
    const H = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
    if (H) {
      if (Array.isArray(ms)) H.vibrate({
        duration: Math.min(400, ms.reduce((a, b) => a + b, 0))
      });else H.impact({
        style: ms > 15 ? 'MEDIUM' : 'LIGHT'
      });
      return;
    }
    if (navigator.vibrate) navigator.vibrate(ms);
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

// Haptics only confirm your own decisions. Sound carries everything else.
const SFX = {
  play(me) {
    tone(180, .09, 'triangle', .16, 90);
    if (me) buzz(8);
  },
  deal() {
    tone(1400, .05, 'triangle', .05, 500);
  },
  burn(ev) {
    // cold water: a splash, then a hiss of steam
    noise(.32, .16, .1, 2600);
    tone(140, .18, 'sine', .08, 60, .1);
    noise(.5, .035, .3, 9000);
    if (ev && ev.pi === 0) buzz([20, 30, 40]);
  },
  stung(me) {
    // a flare of flame
    noise(.45, .12, 0, 1800);
    tone(330, .35, 'sawtooth', .05, 120, .02);
    if (me) buzz([40, 30, 90]);
  },
  pick(me) {
    tone(260, .18, 'triangle', .12, 150);
    tone(200, .18, 'triangle', .1, 110, .1);
    if (me) buzz([70, 50, 120]);
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
    if (me) buzz([60, 40, 220]);
  },
  bad() {
    tone(120, .14, 'square', .08, 90);
    buzz(25);
  },
  win() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, .28, 'triangle', .12, 0, i * .11));
  },
  lose() {
    [392, 330, 262].forEach((f, i) => tone(f, .35, 'sine', .12, 0, i * .18));
    buzz([120, 60, 120, 60, 400]);
  },
  turn() {
    tone(660, .07, 'sine', .07);
  }
};

export { SFX, buzz };

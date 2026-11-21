import { $ } from './dom.js';
import { prof } from './profile.js';

// ---------- daily deal ----------
const dayKey = () => new Date().toISOString().slice(0, 10);

const isoDay = d => d.toISOString().slice(0, 10);

function hashSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0 & 0x7fffffff;
}

function dailyStreak(p) {
  const d = new Date(dayKey() + 'T00:00:00Z');
  if (!p.daily[isoDay(d)]) d.setUTCDate(d.getUTCDate() - 1);
  let n = 0;
  while (p.daily[isoDay(d)]) {
    n++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return n;
}

const dailyLine = d => (d.res === 'win' ? 'Out first' : d.res === 'mouse' ? 'Rock Bottom' : 'Safe') + ' in ' + d.turns + ' turns';

function shareText(day, d) {
  if (!d) return '';
  return 'Shiphead daily ' + day + '\n' + (d.res === 'win' ? '🏆 Out first' : d.res === 'mouse' ? '🪨 I hit Rock Bottom' : '😅 Safe, stayed off Rock Bottom') + ' in ' + d.turns + ' turns\n' + (d.res === 'mouse' ? 'Left holding ' + d.left + ' cards' : 'CPU left holding ' + d.left + ' cards') + '\nSame deal for everyone.';
}

function copyText(t, btn) {
  const fb = () => {
    const sh = document.querySelector('.sheet');
    if (!sh || sh.querySelector('.copyta')) return;
    const ta = document.createElement('textarea');
    ta.readOnly = true;
    ta.value = t;
    ta.className = 'copyta';
    sh.appendChild(ta);
    ta.focus();
    ta.select();
    btn.textContent = 'Select and copy';
  };
  try {
    navigator.clipboard.writeText(t).then(() => {
      btn.textContent = 'Copied';
    }, fb);
  } catch (e) {
    fb();
  }
}

function dailyBlock(day) {
  const p = prof(),
    d = p.daily[day];
  if (!d) return '';
  const st = dailyStreak(p);
  return '<h3>Daily deal</h3><p style="margin-bottom:8px">' + dailyLine(d) + (st > 1 ? ' · ' + st + ' day streak' : '') + '</p><div class="btns" style="margin:0 0 6px"><button class="btn" id="dShare2">Copy result</button></div>';
}

function wireShare(day) {
  const b = $('#dShare2');
  if (b && day) b.onclick = () => copyText(shareText(day, prof().daily[day]), b);
}

function topPanel() {
  const p = prof(),
    k = dayKey(),
    d = p.daily[k],
    st = dailyStreak(p);
  const daily = d ? '<div class="row"><span>Daily deal<small>' + dailyLine(d) + (st > 1 ? ' · ' + st + ' day streak' : '') + '</small></span><span class="ctl"><button class="btn sm" id="dShare">Copy result</button></span></div>' : '<div class="row"><span>Daily deal<small>Same cards for everyone today' + (st ? ' · ' + st + ' day streak' : '') + '</small></span><span class="ctl"><button class="btn sm primary" id="dPlay">Play</button></span></div>';
  return daily + '<div class="row"><span>How to play<small>Watch a short walkthrough or read it</small></span><span class="ctl"><button class="btn sm" id="tourBtn">Watch</button><button class="btn sm" id="primerBtn">Read</button></span></div>' + '<div class="row"><span>Table rules vote<small>Preview: propose house rules and vote with pretend friends</small></span><span class="ctl"><button class="btn sm" id="voteBtn">Try</button></span></div>';
}

// ---------- effects: motion that explains play ----------

export { copyText, dailyBlock, dailyStreak, dayKey, hashSeed, shareText, topPanel, wireShare };

// Drives a built Seven Lower Than page in headless Chrome and prints a deterministic transcript.
// Usage: node tools/drive.js path/to/index.html [games]
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');

const file = path.resolve(process.argv[2]);
const GAMES = +(process.argv[3] || 3);

const HI = n => n % 2 === 1;
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 860, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message + ' @ ' + String(e.stack).split('\n').slice(1,3).map(x=>x.trim()).join(' <- ')));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.evaluateOnNewDocument((SEED) => {
    window.__MS_FAST = true;
    let a = SEED;
    Math.random = function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    localStorage.clear();
    document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}'; document.head.appendChild(st); });
  }, +(process.env.SEED || 42));
  await page.goto('file://' + file);
  const out = [];
  const log = s => { out.push(s); if (process.env.V) console.error(s.slice(0,120)); };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const ev = (fn, ...a) => page.evaluate(fn, ...a);
  const until = async (fn, label, max = 15000, ...a) => {
    const t0 = Date.now();
    while (Date.now() - t0 < max) { if (await ev(fn, ...a)) return true; await wait(20); }
    throw new Error('timeout: ' + label);
  };
  const snap = () => ev(() => {
    const g = window.__ms.game();
    const z = p => [p.hand.length, p.up.length, p.down.length, p.out ? 1 : 0].join('');
    return [g.phase, g.turn, g.dir, g.pile.map(c => c.id).join('.'), g.players.map(z).join('|'), g.draw.length, g.finished.join('')].join(' ');
  });

  for (let n = 0; n < GAMES; n++) {
    await until(() => { const u = window.__ms.ui(); return u && !u.busy && !u.intro && window.__ms.game().phase === 'swap'; }, 'swap phase');
    log('G' + n + ' deal ' + await snap());
    // swap: tap first hand card then first face-up card
    await ev(() => {
      const g = window.__ms.game(), me = g.players[0];
      const h = document.querySelector('.card[data-id="' + me.hand[0].id + '"]'); h.click();
    });
    await ev(() => {
      const g = window.__ms.game(), me = g.players[0];
      const u = document.querySelector('.card[data-id="' + me.up[0].id + '"]'); u.click();
    });
    log('G' + n + ' swapped ' + await snap());
    await ev(() => document.querySelector('#bReady').click());
    let steps = 0, moves = 0, capped = false;
    
    for (;;) {
      if (++steps > 4000) throw new Error('too many steps');
      const state = await ev(() => {
        const g = window.__ms.game(), u = window.__ms.ui();
        if (g.phase === 'over') return 'over';
        if (document.querySelector('#modal:not(.hidden) #again')) return 'over';
        if (g.phase !== 'play') return 'wait';
        if (!u.busy && !u.intro && g.turn === 0 && !g.players[0].out) return 'mine';
        if (g.players[0].out && !document.querySelector('#bSkip').classList.contains('hidden')) return 'skip';
        return 'wait';
      });
      if (state === 'over') break;
      if (state === 'wait') { await wait(15); continue; }
      if (state === 'skip') { await ev(() => document.querySelector('#bSkip').click()); log('skip ' + await snap()); continue; }
      // my move. Only cap the game when it is my turn, so no CPU timer is mid-flight when it restarts.
      if (moves >= 60) { capped = true; break; }
      moves++;
      const act = await ev((hi) => {
        const pick = document.querySelector('#bPick');
        if (!pick.classList.contains('hidden')) { pick.click(); return 'pickup'; }
        const cards = [...document.querySelectorAll('.card.tap:not(.dim)')];
        if (!cards.length) return 'none';
        const g = window.__ms.game();
        const pw = el => { const id = +el.dataset.id; for (const p of g.players) for (const c of p.hand.concat(p.up, p.down)) if (c.id === id) return window.Shed.power(g.rules, c) + (window.Shed.effect(g.rules, c) ? 0.5 : 0); return 99; };
        cards.sort((a, b) => (hi ? pw(b) - pw(a) : pw(a) - pw(b)) || a.dataset.id - b.dataset.id);
        const c = cards[0];
        const id = c.dataset.id;
        c.click();
        // a second tap plays a single selected card; with twins the Play button appears
        const play = document.querySelector('#bPlay');
        if (!play.classList.contains('hidden')) { play.click(); return 'play ' + id; }
        c.click();
        return 'tap ' + id;
      }, HI(n));
      if (act === 'none') { await wait(15); continue; }
      log(act + ' → ' + await snap());
      await wait(5);
    }
    if (capped) {
      log('G' + n + ' capped ' + await snap());
      if (n < GAMES - 1) {
        await ev(() => document.querySelector('#bNew').click());
        await until(() => !!document.querySelector('#rNew'), 'setup sheet (restart)');
        await ev(() => document.querySelector('#rNew').click());
      }
      continue;
    }
    await until(() => !!document.querySelector('#modal:not(.hidden) #again'), 'game over sheet');
    log('G' + n + ' over ' + await snap() + ' | ' + await ev(() => document.querySelector('#modal h2').textContent + ' / ' + document.querySelector('#stats').textContent));
    if (n < GAMES - 1) await ev(() => document.querySelector('#again').click());
  }

  // sheets
  await ev(() => (document.querySelector('#setup') || document.querySelector('#bNew')).click());
  await until(() => !!document.querySelector('#rNew'), 'setup sheet');
  log('setup ' + await ev(() => document.querySelectorAll('.sheet h3').length));
  await ev(() => { document.querySelector('#seg button[data-n="4"]').click(); const t = document.querySelector('#rSk'); t.checked = true; t.dispatchEvent(new Event('change', { bubbles: true })); });
  await ev(() => { document.querySelector('#mRank').value = '3'; document.querySelector('#mEff').value = 'stinger'; document.querySelector('#mAdd').click(); });
  log('custom ' + await ev(() => document.querySelector('#customRows').innerText.replace(/\s+/g, ' ')));
  await ev(() => { document.querySelector('#mRank').value = '9'; document.querySelector('#mEff').value = 'skip'; document.querySelector('#mAdd').click(); });
  log('blocked ' + await ev(() => document.querySelector('#aiNote').textContent + '|' + document.querySelector('#customRows').children.length));
  await ev(() => document.querySelector('#rNew').click());
  await until(() => { const g = window.__ms.game(); return g && g.players.length === 4 && !window.__ms.ui().busy; }, 'new 4p game');
  log('4p ' + await snap() + ' rules ' + await ev(() => JSON.stringify(window.__ms.game().rules.ranks['3']) + JSON.stringify(window.__ms.game().rules.ranks['8'])));
  // profile and legend
  await ev(() => document.querySelector('#bProf').click());
  log('profile ' + await ev(() => document.querySelector('.sheet').innerText.replace(/\s+/g, ' ')));
  await ev(() => document.querySelector('#pClose').click());
  await ev(() => document.querySelector('#bRules').click());
  log('legend ' + await ev(() => document.querySelector('.sheet').innerText.replace(/\s+/g, ' ')));
  await ev(() => document.querySelector('#lClose').click());
  // effects and chat
  await ev(() => { window.__ms.pickFx(0, 12); window.__ms.pickFx(1, 4); window.__ms.chatOnline(); window.__ms.chatIncoming('Tali', 'hello'); });
  log('chat ' + await ev(() => document.querySelector('#chatPeek').textContent + '|' + document.querySelector('#chatBadge').textContent));
  await wait(100);
  // tour
  await ev(() => document.querySelector('#bNew').click());
  await until(() => !!document.querySelector('#tourBtn'), 'tour btn');
  await ev(() => { window.__ms.demo(); });
  let guard = 0;
  while (await ev(() => !!document.querySelector('#cap:not(.hidden)') || !!window.__ms.tour())) {
    if (++guard > 3000) throw new Error('tour stuck');
    await ev(() => { const n = document.querySelector('#capNext'); if (n && !n.classList.contains('hidden')) n.click(); });
    await wait(20);
  }
  await wait(200);
  log('tour done ach=' + await ev(() => Object.keys(window.__ms.prof().ach).sort().join(',')));
  console.log(JSON.stringify({ transcript: out, errors }, null, 1));
  await browser.close();
})().catch(e => { console.error('DRIVER FAILED', e); process.exit(1); });

import Shed from '../engine.js';
import Presets from '../presets.js';
import Meta from '../rules-meta.js';
import { $, esc } from './dom.js';
import { BACKS, FELTS, applyBack, applyCB, applyFelt, applySkill, save, store } from './state.js';
import { render } from './render.js';
import { newGame } from './flow.js';
import { prof } from './profile.js';
import { copyText, dayKey, shareText, topPanel } from './daily.js';
import { showOnline } from './online.js';
import { showTable } from './vote.js';
import { startDemo } from './tour.js';
import { showPrimer } from './welcome.js';
import { hideModal, showModal } from './sheets.js';
import { sndIcon } from './header.js';

let aiBusy = false;
let lastTab = 'game';
const TABS = [['game', 'Game'], ['rules', 'Rules'], ['look', 'Look and feel']];

function showSetup(tab) {
  if (typeof tab === 'string' && TABS.some(t => t[0] === tab)) lastTab = tab;
  const inGame = store.game && store.game.phase !== 'over';
  const seg = [2, 3, 4, 5].map(n => '<button data-n="' + n + '" class="' + (store.settings.players === n ? 'on' : '') + '">' + n + '</button>').join('');
  const sw = Object.keys(FELTS).map(k => '<button data-f="' + k + '" class="' + (store.settings.felt === k ? 'on' : '') + '" style="background:radial-gradient(circle at 35% 30%,' + FELTS[k][0] + ',' + FELTS[k][2] + ')" aria-label="' + k + '"></button>').join('');
  const ranks = Shed.RANK_LIST.map(k => '<option>' + k + '</option>').join('');
  const effs = '<option value="none">plain card</option>' + Shed.EFFECTS.map(k => '<option value="' + k + '">' + k + '</option>').join('');
  showModal('<h2>New game</h2><p>You against 1 to 4 CPUs. Last one holding cards gets the Wooden Spoon.</p>' + '<div class="tabs" role="tablist" aria-label="Setup sections">' + TABS.map(([k, n]) => '<button type="button" role="tab" class="tab" id="tab' + k[0].toUpperCase() + k.slice(1) + '" data-tab="' + k + '" aria-controls="p' + k[0].toUpperCase() + k.slice(1) + '">' + n + '</button>').join('') + '</div>' + '<div role="tabpanel" id="pGame" aria-labelledby="tabGame">' + topPanel() + '<h3>Players and CPU level</h3><div class="seg" id="seg">' + seg + '</div><div id="lv"></div>' + '</div><div role="tabpanel" id="pLook" aria-labelledby="tabLook"><h3>Card back</h3><div class="sw" id="swb">' + Object.keys(BACKS).map(k => '<button data-b="' + k + '" class="' + (store.settings.back === k ? 'on' : '') + '" style="background:' + BACKS[k][0] + ';border-radius:6px;width:30px;height:42px" aria-label="' + k + '"></button>').join('') + '</div>' + '<h3>Felt</h3><div class="sw" id="sw">' + sw + '</div>' + '<h3>Comfort</h3>' + '<label class="row"><span>Tips<small>Tell me what to do each turn</small></span><input type="checkbox" id="rTips"' + (store.settings.tips ? ' checked' : '') + '></label>' + '<label class="row"><span>One tap to play<small>Off: tap a card, then tap it again (or Play)</small></span><input type="checkbox" id="rInst"' + (store.settings.oneTap ? ' checked' : '') + '></label>' + '<label class="row"><span>Colour-blind suits<small>Diamonds blue, clubs green</small></span><input type="checkbox" id="rCb"' + (store.settings.cb ? ' checked' : '') + '></label>' + '<label class="row"><span>Sound and haptics<small>Card sounds, vibration on phones</small></span><input type="checkbox" id="rSnd"' + (store.settings.sound ? ' checked' : '') + '></label>' + '<label class="row"><span>Haptics<small>Taps and thumps you can feel</small></span><input type="checkbox" id="rHap"' + (store.settings.haptic !== false ? ' checked' : '') + '></label>' + '<label class="row"><span>Fast mode<small>Quicker deals and CPU turns</small></span><input type="checkbox" id="rFast"' + (store.settings.fast ? ' checked' : '') + '></label>' + '</div><div role="tabpanel" id="pRules" aria-labelledby="tabRules">' + '<h3>House rules</h3>' + '<div class="row"><span>Preset<small id="presetBlurb"></small></span><span class="ctl"><select id="rPreset" aria-label="Rule preset"></select></span></div>' + '<div class="row"><span>Share these rules<small>A code a friend can paste in</small></span><span class="ctl"><button class="btn sm" id="codeCopy">Copy code</button></span></div>' + '<div class="inp"><input id="codeIn" placeholder="Paste a rules code" aria-label="Rules code" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn" id="codeUse">Use</button></div>' + '<div class="note" id="codeNote"></div>' + '<label class="row"><span>7s force lower<small>Next player must play 7 or lower</small></span><input type="checkbox" id="rSev"' + (store.settings.sevensLower ? ' checked' : '') + '></label>' + '<div class="row"><span>Transparent card<small>Plays on anything except a skip card. The card underneath still counts</small></span><span class="ctl"><select id="rTrRank" aria-label="Transparent card"></select><input type="checkbox" id="rTr" aria-label="Transparent card on"' + (store.settings.transparentOn ? ' checked' : '') + '></span></div>' + '<div class="row"><span>Skip a go<small>Next player misses a turn. Two together skip two players. With 2 players you go again</small></span><span class="ctl"><select id="rSkRank" aria-label="Skip card"></select><input type="checkbox" id="rSk" aria-label="Skip a go on"' + (store.settings.skipOn ? ' checked' : '') + '></span></div>' + '<label class="row"><span>Four of a kind burns<small>Four matching cards in a row clear the pile</small></span><input type="checkbox" id="rFour"' + (store.settings.fourBurns ? ' checked' : '') + '></label>' + '<div id="customRows"></div>' + '<h3>Your own special cards</h3>' + '<div id="aiBox" class="hidden"><div class="inp"><input id="aiText" aria-label="Describe your rule" placeholder="e.g. Jacks reverse the direction" maxlength="160"><button class="btn" id="aiGo">Add</button></div>' + '<div class="ex">Try: <button data-ex="5s make the next player miss a turn">5s skip</button> · <button data-ex="Queens force the next player to pick up the pile">Q pickup</button> · <button data-ex="3s are the highest card">3 high</button> · <button data-ex="3s are stingers, only a 3 can be played on them">3 stinger</button></div></div>' + '<div class="note" id="aiNote"></div>' + '<h3>Or pick one yourself</h3><div class="inp"><select id="mRank" aria-label="Card">' + ranks + '</select><select id="mEff" aria-label="What it does">' + effs + '</select><button class="btn" id="mAdd">Add</button></div>' + '</div>' + '<p class="ex hidden" id="ruleNote">Rule changes start with a new game. Press Start to play with them.</p>' + '<div class="btns stick">' + (inGame ? '<button class="btn" id="rClose">Keep playing</button>' : '') + '<button class="btn primary" id="rNew">Start</button></div>');
  const showTab = (k, focus) => {
    lastTab = k;
    TABS.forEach(([t]) => {
      const id = t[0].toUpperCase() + t.slice(1);
      $('#p' + id).classList.toggle('hidden', t !== k);
      const b = $('#tab' + id);
      b.setAttribute('aria-selected', String(t === k));
      b.tabIndex = t === k ? 0 : -1;
      b.classList.toggle('on', t === k);
      if (t === k && focus) b.focus();
    });
    const sh = document.querySelector('.sheet');
    if (sh) sh.scrollTop = 0;
  };
  document.querySelectorAll('#modal .tab').forEach((b, i, all) => {
    b.onclick = () => showTab(b.dataset.tab);
    b.onkeydown = e => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); showTab(all[e.key === 'Home' ? 0 : all.length - 1].dataset.tab, true); }
      else if (d) { e.preventDefault(); showTab(all[(i + d + all.length) % all.length].dataset.tab, true); }
    };
  });
  showTab(lastTab);
  document.querySelectorAll('#seg button').forEach(b => b.onclick = () => {
    store.settings.players = +b.dataset.n;
    drawLv();
    document.querySelectorAll('#seg button').forEach(x => x.classList.toggle('on', x === b));
  });
  const drawLv = () => {
    $('#lv').innerHTML = Array.from({
      length: store.settings.players - 1
    }, (_, i) => '<div class="row lvrow"><span>' + (store.settings.players === 2 ? 'CPU' : 'CPU ' + (i + 1)) + '</span><div class="seg mini" data-i="' + i + '">' + ['easy', 'normal', 'hard'].map(k => '<button data-k="' + k + '" class="' + (store.settings.cpu[i] === k ? 'on' : '') + '">' + (k === 'normal' ? 'Medium' : k[0].toUpperCase() + k.slice(1)) + '</button>').join('') + '</div></div>').join('');
    document.querySelectorAll('#lv .seg button').forEach(b => b.onclick = () => {
      const i = +b.parentNode.dataset.i;
      store.settings.cpu[i] = b.dataset.k;
      save();
      drawLv();
    });
  };
  drawLv();
  document.querySelectorAll('#swb button').forEach(b => b.onclick = () => {
    store.settings.back = b.dataset.b;
    applyBack();
    document.querySelectorAll('#swb button').forEach(x => x.classList.toggle('on', x === b));
    save();
  });
  document.querySelectorAll('#sw button').forEach(b => b.onclick = () => {
    store.settings.felt = b.dataset.f;
    applyFelt();
    document.querySelectorAll('#swb button').forEach(b => b.onclick = () => {
      store.settings.back = b.dataset.b;
      applyBack();
      document.querySelectorAll('#swb button').forEach(x => x.classList.toggle('on', x === b));
      save();
    });
    document.querySelectorAll('#sw button').forEach(x => x.classList.toggle('on', x === b));
    save();
  });
  const apply = () => {
    store.settings.sevensLower = $('#rSev').checked;
    store.settings.transparentOn = $('#rTr').checked;
    store.settings.transparentRank = $('#rTrRank').value;
    store.settings.skipOn = $('#rSk').checked;
    store.settings.skipRank = $('#rSkRank').value;
    store.settings.fourBurns = $('#rFour').checked;
    store.settings.oneTap = $('#rInst').checked;
    store.settings.tips = $('#rTips').checked;
    store.settings.cb = $('#rCb').checked;
    store.settings.sound = $('#rSnd').checked;
    store.settings.haptic = $('#rHap').checked;
    store.settings.fast = $('#rFast').checked;
    applyCB();
    sndIcon();
    save();
    applySkill();
    if (store.game && !store.demo && store.game.phase !== 'over' && store.game.meta && !store.game.meta.daily && !store.game.meta.tour) {
      const nr = Shed.makeRuleset(store.settings);
      store.game.rules.ranks = nr.ranks;
      store.game.rules.custom = nr.custom;
      store.game.rules.fourOfAKindBurns = nr.fourOfAKindBurns;
    }
    refreshNote();
    syncPreset();
  };
  function refreshNote() {
    if (!inGame || !store.game || !store.game.meta || store.game.meta.daily || store.game.meta.tour) return;
    const changed = JSON.stringify(Shed.makeRuleset(store.settings).ranks) !== JSON.stringify(store.game.rules.ranks);
    $('#ruleNote').classList.toggle('hidden', !changed);
    $('#rClose').textContent = 'Keep playing';
  }
  // A rank can only have one active rule. 2 and 10 are fixed, ticked house rules hold their rank, and so does every ticked rule of your own.
  const PICK = Meta.PICKABLE;
  const liveOpts = () => ({ sevensLower: $('#rSev').checked, transparentOn: $('#rTr').checked, transparentRank: $('#rTrRank').value, skipOn: $('#rSk').checked, skipRank: $('#rSkRank').value, fourBurns: $('#rFour').checked, custom: store.settings.custom });
  // cards held by your own ticked rules only (the pickers also stay clear of 2 and 10, which are never offered)
  const customHeld = () => {
    const m = Meta.heldRanks({ sevensLower: false, custom: store.settings.custom });
    delete m['2'];
    delete m['10'];
    return m;
  };
  const fillRank = (sel, cur, off) => {
    sel.innerHTML = PICK.map(k => '<option value="' + k + '"' + (k === cur ? ' selected' : '') + (off[k] ? ' disabled' : '') + '>' + k + '</option>').join('');
  };
  const refreshPickers = () => {
    const a = $('#rTrRank'),
      b = $('#rSkRank'),
      ch = customHeld();
    fillRank(a, a.value, Object.assign({}, ch, {
      [b.value]: 1
    }));
    fillRank(b, b.value, Object.assign({}, ch, {
      [a.value]: 1
    }));
  };
  fillRank($('#rTrRank'), store.settings.transparentRank, {});
  fillRank($('#rSkRank'), store.settings.skipRank, {});
  refreshPickers();
  $('#rTrRank').onchange = refreshPickers;
  $('#rSkRank').onchange = refreshPickers;
  // ticking a house rule whose card is already taken by one of your own rules is refused
  [['#rSev', 'sevensLower'], ['#rTr', 'transparentOn'], ['#rSk', 'skipOn']].forEach(([id, key]) => {
    $(id).onchange = () => {
      if (!$(id).checked) return;
      const r = Meta.applyChange(Object.assign(liveOpts(), { [key]: false }), { type: 'flag', key, value: true });
      if (!r.ok) {
        $(id).checked = false;
        note('Can\'t tick that. ' + r.error + '. Untick or remove it first.', true);
      }
    };
  });
  // Your own rules sit in the same tick list as the built-in ones.
  const drawChips = () => {
    const el = $('#customRows');
    el.innerHTML = store.settings.custom.map((r, i) => '<div class="row"><span><b style="color:var(--brass2)">' + esc(r.rank) + '</b> ' + esc(Shed.describeRule(r).slice(r.rank.length + 2)) + '<small>Your own rule</small></span><span class="ctl"><button class="x" data-i="' + i + '" aria-label="Remove">×</button><input type="checkbox" data-t="' + i + '"' + (r.on === false ? '' : ' checked') + '></span></div>').join('');
    el.querySelectorAll('button.x').forEach(b => b.onclick = () => {
      store.settings.custom.splice(+b.dataset.i, 1);
      save();
      drawChips();
    });
    el.querySelectorAll('input[data-t]').forEach(c => c.onchange = () => {
      const r = store.settings.custom[+c.dataset.t];
      if (c.checked) {
        const res = Meta.applyChange(liveOpts(), { type: 'toggleCustom', rank: r.rank, value: true });
        if (!res.ok) {
          c.checked = false;
          note('Can\'t tick that. ' + res.error + '. Untick it first.', true);
          return;
        }
      }
      r.on = c.checked;
      save();
      refreshPickers();
    });
    refreshPickers();
    syncPreset();
  };
  // presets and share codes. Everything goes through Presets, so a code can never give rules the table would refuse.
  const currentOpts = () => Presets.normalise({ sevensLower: $('#rSev').checked, transparentOn: $('#rTr').checked, transparentRank: $('#rTrRank').value, skipOn: $('#rSk').checked, skipRank: $('#rSkRank').value, fourBurns: $('#rFour').checked, custom: store.settings.custom });
  function syncPreset() {
    const sel = $('#rPreset');
    if (!sel) return;
    const hit = Presets.find(currentOpts());
    sel.value = hit ? hit.id : 'mix';
    $('#presetBlurb').textContent = hit ? hit.blurb : 'Your own mix of rules';
  }
  function setOpts(o) {
    $('#rSev').checked = o.sevensLower;
    $('#rTr').checked = o.transparentOn;
    $('#rSk').checked = o.skipOn;
    $('#rFour').checked = o.fourBurns;
    store.settings.custom = o.custom.map(r => Object.assign({}, r));
    fillRank($('#rTrRank'), o.transparentRank, {});
    fillRank($('#rSkRank'), o.skipRank, {});
    drawChips();
    apply();
  }
  function wirePresets() {
    const sel = $('#rPreset');
    sel.innerHTML = Presets.PRESETS.map(p => '<option value="' + p.id + '">' + esc(p.name) + '</option>').join('') + '<option value="mix" disabled>Your own mix</option>';
    syncPreset();
    sel.onchange = () => {
      const p = Presets.PRESETS.find(x => x.id === sel.value);
      if (p) { setOpts(Presets.normalise(p.opts)); note(''); }
    };
    $('#codeCopy').onclick = () => { const hit = Presets.find(currentOpts()); copyText(Presets.encode(currentOpts(), hit ? hit.name : ''), $('#codeCopy')); };
    const use = () => {
      const r = Presets.decode($('#codeIn').value);
      const n = $('#codeNote');
      n.className = 'note' + (r.ok ? '' : ' err');
      if (!r.ok) { n.textContent = r.error + '.'; return; }
      setOpts(r.opts);
      $('#codeIn').value = '';
      n.textContent = r.name ? 'Loaded ' + r.name + '.' : 'Rules loaded.';
    };
    $('#codeUse').onclick = use;
    $('#codeIn').addEventListener('keydown', e => { if (e.key === 'Enter') use(); });
  }
  // Each rule is checked by rules-meta against what is already ticked, one after another.
  const addRules = list => {
    let o = Object.assign(liveOpts(), { custom: store.settings.custom.map(r => Object.assign({}, r)) });
    const blocked = [], added = [];
    for (const r of list) {
      const res = Meta.applyChange(o, { type: 'addCustom', rank: r.rank, effect: r.effect, power: r.power });
      if (res.ok) {
        o = res.opts;
        added.push(...Shed.validateCustom([r]).rules);
      } else if (res.error !== 'not a valid rule') blocked.push(res.error);
    }
    store.settings.custom = o.custom;
    save();
    drawChips();
    return { rules: added, blocked };
  };
  drawChips();
  wirePresets();
  $('#mAdd').onclick = () => {
    const eff = $('#mEff').value;
    const res = addRules([{
      rank: $('#mRank').value,
      effect: eff
    }]);
    const n = $('#aiNote');
    n.className = 'note' + (res.blocked.length ? ' err' : '');
    n.textContent = res.blocked.length ? res.blocked.join('. ') + '. Untick or remove it first.' : '';
  };
  // AI rule maker, only when the page may ask Claude
  const note = (t, err) => {
    const n = $('#aiNote');
    n.className = 'note' + (err ? ' err' : '');
    n.textContent = t || '';
  };
  (async () => {
    let sample = null;
    try {
      sample = window.claude && claude.use ? await claude.use('sample') : null;
    } catch (e) {
      sample = null;
    }
    if (!sample || !$('#aiBox')) return;
    $('#aiBox').classList.remove('hidden');
    document.querySelectorAll('.ex button').forEach(b => b.onclick = () => {
      $('#aiText').value = b.dataset.ex;
    });
    const go = async () => {
      const text = $('#aiText').value.trim();
      if (!text || aiBusy) return;
      aiBusy = true;
      $('#aiGo').textContent = '…';
      note('Working out the rule…');
      const prompt = 'You turn a plain-English house rule for a Shithead / Palace card game into JSON for a rules engine.\n' + 'Ranks: 2,3,4,5,6,7,8,9,10,J,Q,K,A. Normal order low to high: 2 is 2 ... 10 is 10, J 11, Q 12, K 13, A 14.\n' + 'Allowed effects (a rank has at most one):\n' + Shed.EFFECTS.map(k => '- ' + k + ': ' + Shed.EFFECT_INFO[k]).join('\n') + '\n- none: an ordinary card\n' + 'Optional "power" (number 1 to 20) changes how high the rank counts when comparing cards.\n' + 'Current special cards: ' + (Shed.RANK_LIST.map(k => ({
        k,
        e: Shed.makeRuleset(store.settings).ranks[k].effect
      })).filter(x => x.e).map(x => x.k + '=' + x.e).join(', ') || 'none') + '.\n' + 'Rule request: "' + text.replace(/"/g, "'") + '"\n' + 'Reply with JSON only, no prose: {"rules":[{"rank":"J","effect":"reverse","power":null}],"cant":""}. ' + 'Use "cant" for a short note about any part that the allowed effects cannot express. If nothing can be expressed, return an empty rules list and explain in "cant".';
      try {
        const res = await sample(prompt, {
          modelTier: 'quick',
          cache: false
        });
        const raw = String(res && res.text || '');
        const a = raw.indexOf('{'),
          b = raw.lastIndexOf('}');
        const obj = JSON.parse(raw.slice(a, b + 1));
        const v = addRules(Array.isArray(obj.rules) ? obj.rules.map(r => ({
          rank: r.rank,
          effect: r.effect == null ? undefined : r.effect,
          power: r.power == null ? undefined : r.power
        })) : []);
        const parts = [];
        if (obj.rules && obj.rules.length && v.rules.length) parts.push('Added. Check the card below before you start.');
        if (v.blocked.length) parts.push(v.blocked.join('. ') + '. Untick or remove it first.');
        if (obj.cant) parts.push(String(obj.cant));
        if (!obj.rules || !obj.rules.length || !v.rules.length) parts.unshift(v.blocked.length ? "Couldn't add that." : "Couldn't turn that into a card rule.");
        note(parts.join(' '), !(obj.rules && obj.rules.length && v.rules.length));
        $('#aiText').value = '';
      } catch (err) {
        note(err && err.code === 'rate_limited' ? 'Too many requests, try again in a minute.' : err && err.code === 'not_granted' ? 'Permission was declined, use the picker below.' : "That didn't work. Try rewording it or use the picker below.", true);
      }
      aiBusy = false;
      if ($('#aiGo')) $('#aiGo').textContent = 'Add';
    };
    $('#aiGo').onclick = go;
    $('#aiText').addEventListener('keydown', e => {
      if (e.key === 'Enter') go();
    });
  })();
  const dp = $('#dPlay');
  if (dp) dp.onclick = () => {
    hideModal();
    newGame({
      daily: dayKey()
    });
  };
  const ds = $('#dShare');
  if (ds) ds.onclick = () => copyText(shareText(dayKey(), prof().daily[dayKey()]), ds);
  $('#tourBtn').onclick = startDemo;
  $('#primerBtn').onclick = showPrimer;
  $('#voteBtn').onclick = showTable;
  $('#onlineBtn').onclick = showOnline;
  if (inGame) $('#rClose').onclick = () => {
    apply();
    hideModal();
    if (store.game) render();
  };
  $('#rNew').onclick = () => {
    apply();
    newGame();
  };
  $('#modal').onchange = () => {
    try {
      apply();
    } catch (e) {}
  };
  $('#modal').onclick = () => setTimeout(refreshNote, 0);
  refreshNote();
}

export { showSetup };

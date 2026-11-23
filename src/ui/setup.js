import Shed from '../engine.js';
import Presets from '../presets.js';
import Meta from '../rules-meta.js';
import { $, esc } from './dom.js';
import { BACKS, FELTS, applyBack, applyCB, applyFelt, applySkill, save, store } from './state.js';
import { render } from './render.js';
import { newGame } from './flow.js';
import { prof, unlock } from './profile.js';
import { copyText, dayKey, shareText, topPanel } from './daily.js';
import { showOnline } from './online.js';
import { showTable } from './vote.js';
import { startDemo } from './tour.js';
import { showPrimer } from './welcome.js';
import { hideModal, showModal } from './sheets.js';
import { sndIcon } from './header.js';
import { applyMotion } from './fx.js';

// What a card can do, in plain words. Every choice maps to one engine effect, so a rule can never be something the game can't play.
const ACTIONS = [['stinger', 'Stinger: only the same card can follow'], ['pickup', 'Next player picks up the pile'], ['skip', 'Next player misses a go'], ['lower', 'Next player must play lower'], ['reverse', 'Reverse the direction'], ['again', 'Play again'], ['burn', 'Burn the pile'], ['reset', 'Reset: plays on anything'], ['transparent', 'Invisible: the card underneath counts'], ['redNext', 'Next card must be red'], ['blackNext', 'Next card must be black'], ['none', 'No special power']];
const MAX_SAVED = 12;
let lastTab = 'game';
const TABS = [['game', 'Game'], ['rules', 'Rules'], ['look', 'Look and feel']];

function showSetup(tab) {
  if (typeof tab === 'string' && TABS.some(t => t[0] === tab)) lastTab = tab;
  const inGame = store.game && store.game.phase !== 'over';
  const seg = [2, 3, 4, 5].map(n => '<button data-n="' + n + '" class="' + (store.settings.players === n ? 'on' : '') + '">' + n + '</button>').join('');
  const sw = Object.keys(FELTS).map(k => '<button data-f="' + k + '" class="' + (store.settings.felt === k ? 'on' : '') + '" style="background:radial-gradient(circle at 35% 30%,' + FELTS[k][0] + ',' + FELTS[k][2] + ')" aria-label="' + k + '"></button>').join('');
  showModal('<h2>New game</h2><p id="modeBlurb"></p>' + '<div class="tabs" role="tablist" aria-label="Setup sections">' + TABS.map(([k, n]) => '<button type="button" role="tab" class="tab" id="tab' + k[0].toUpperCase() + k.slice(1) + '" data-tab="' + k + '" aria-controls="p' + k[0].toUpperCase() + k.slice(1) + '">' + n + '</button>').join('') + '</div>' + '<div role="tabpanel" id="pGame" aria-labelledby="tabGame">' + '<h3>Play against</h3><div class="seg" id="mode" role="radiogroup" aria-label="Play against"><button data-m="cpu" role="radio">The computer</button><button data-m="online" role="radio">Friends online</button></div>' + '<h3 id="segHead">How many players</h3><div class="seg" id="seg">' + seg + '</div><div id="lv"></div>' + '<h3>More</h3>' + topPanel() + '</div><div role="tabpanel" id="pLook" aria-labelledby="tabLook"><h3>Card back</h3><div class="sw" id="swb">' + Object.keys(BACKS).map(k => '<button data-b="' + k + '" class="' + (store.settings.back === k ? 'on' : '') + '" style="background:' + BACKS[k][0] + ';border-radius:6px;width:30px;height:42px" aria-label="' + k + '"></button>').join('') + '</div>' + '<h3>Felt</h3><div class="sw" id="sw">' + sw + '</div>' + '<h3>Comfort</h3>' + '<label class="row"><span>Tips<small>Tell me what to do each turn</small></span><input type="checkbox" id="rTips"' + (store.settings.tips ? ' checked' : '') + '></label>' + '<label class="row"><span>One tap to play<small>Off: tap a card, then tap it again (or Play)</small></span><input type="checkbox" id="rInst"' + (store.settings.oneTap ? ' checked' : '') + '></label>' + '<label class="row"><span>Colour-blind suits<small>Diamonds blue, clubs green</small></span><input type="checkbox" id="rCb"' + (store.settings.cb ? ' checked' : '') + '></label>' + '<label class="row"><span>Sound and haptics<small>Card sounds, vibration on phones</small></span><input type="checkbox" id="rSnd"' + (store.settings.sound ? ' checked' : '') + '></label>' + '<label class="row"><span>Haptics<small>Taps and thumps you can feel</small></span><input type="checkbox" id="rHap"' + (store.settings.haptic !== false ? ' checked' : '') + '></label>' + '<label class="row"><span>Fast mode<small>Quicker deals and CPU turns</small></span><input type="checkbox" id="rFast"' + (store.settings.fast ? ' checked' : '') + '></label>' + '<div class="row"><span>Card effects<small>Flames, water and flickers on special cards</small></span><span class="ctl"><select id="rMotion" aria-label="Card effects">' + [['normal', 'Normal'], ['fast', 'Fast'], ['off', 'Off']].map(([v, t]) => '<option value="' + v + '"' + (store.settings.motion === v ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></span></div>' + '</div><div role="tabpanel" id="pRules" aria-labelledby="tabRules">' + '<h3>House rules</h3>' + '<div class="row"><span>Preset<small id="presetBlurb"></small></span><span class="ctl"><select id="rPreset" aria-label="Rule preset"></select></span></div>' + '<div class="row"><span>Share these rules<small>A code a friend can paste in</small></span><span class="ctl"><button class="btn sm" id="codeCopy">Copy code</button></span></div>' + '<div class="inp"><input id="codeIn" placeholder="Paste a rules code" aria-label="Rules code" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn" id="codeUse">Use</button></div>' + '<div class="note" id="codeNote"></div>' + '<div class="row"><span><span id="saveLbl">Save these rules</span><small id="saveSub">Keep this mix and pick it from Preset next time</small></span><span class="ctl"><button class="btn sm" id="saveBtn">Save</button><button class="btn sm hidden" id="savedDel">Delete</button></span></div>' + '<div class="inp hidden" id="saveBox"><input id="saveName" maxlength="24" placeholder="Name it, e.g. Friday night" aria-label="Name for these rules" autocomplete="off"><button class="btn" id="saveGo">Save</button></div><div class="note" id="saveNote" role="status"></div>' + '<div class="row"><span>Lower than<small>After this card, the next player must play the same or lower</small></span><span class="ctl"><select id="rSevRank" aria-label="Lower than card"></select><input type="checkbox" id="rSev" aria-label="Lower than on"' + (store.settings.sevensLower !== false ? ' checked' : '') + '></span></div>' + '<div class="row"><span>Stinger<small>Plays on anything. Only the same card can go on it, or an invisible card. Burned when the pile is picked up</small></span><span class="ctl"><select id="rStRank" aria-label="Stinger card"></select><input type="checkbox" id="rSt" aria-label="Stinger on"></span></div>' + '<div class="row"><span>Invisible card<small>Plays on anything except a skip card. The card underneath still counts</small></span><span class="ctl"><select id="rTrRank" aria-label="Invisible card"></select><input type="checkbox" id="rTr" aria-label="Invisible card on"' + (store.settings.transparentOn ? ' checked' : '') + '></span></div>' + '<div class="row"><span>Skip a go<small>Next player misses a turn. Two together skip two players. With 2 players you go again</small></span><span class="ctl"><select id="rSkRank" aria-label="Skip card"></select><input type="checkbox" id="rSk" aria-label="Skip a go on"' + (store.settings.skipOn ? ' checked' : '') + '></span></div>' + '<label class="row"><span>Four of a kind burns<small>Four matching cards in a row clear the pile</small></span><input type="checkbox" id="rFour"' + (store.settings.fourBurns ? ' checked' : '') + '></label>' + '<label class="row"><span>Face-down follow-up<small>After a face-down card goes on, tap another to try it. A match goes on, a miss goes in your hand</small></span><input type="checkbox" id="rBf"' + (store.settings.blindFollow ? ' checked' : '') + '></label>' + '<div id="customRows"></div>' + '<h3>Add a card rule</h3><div class="builder">' + '<label class="bl"><span>When this card is played</span><select id="mRank"></select></label>' + '<label class="bl"><span>It does this</span><select id="mEff">' + ACTIONS.map(([v, t]) => '<option value="' + v + '">' + t + '</option>').join('') + '</select></label>' + '<p class="bdesc" id="mDesc"></p><button class="btn primary wide" id="mAdd">Add rule</button><div class="note" id="aiNote" role="status"></div></div>' + '</div>' + '<p class="ex hidden" id="ruleNote">Rule changes start with a new game. Press Start to play with them.</p>' + '<div class="btns stick">' + (inGame ? '<button class="btn" id="rClose">Keep playing</button>' : '') + '<button class="btn primary" id="rNew">Start</button></div>');
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
    store.settings.lowerRank = $('#rSevRank').value;
    store.settings.transparentOn = $('#rTr').checked;
    store.settings.transparentRank = $('#rTrRank').value;
    store.settings.skipOn = $('#rSk').checked;
    store.settings.skipRank = $('#rSkRank').value;
    store.settings.fourBurns = $('#rFour').checked;
    store.settings.blindFollow = $('#rBf').checked;
    store.settings.oneTap = $('#rInst').checked;
    store.settings.tips = $('#rTips').checked;
    store.settings.cb = $('#rCb').checked;
    store.settings.sound = $('#rSnd').checked;
    store.settings.haptic = $('#rHap').checked;
    store.settings.fast = $('#rFast').checked;
    store.settings.motion = $('#rMotion').value;
    applyMotion();
    applyCB();
    sndIcon();
    save();
    applySkill();
    if (store.game && !store.demo && store.game.phase !== 'over' && store.game.meta && !store.game.meta.daily && !store.game.meta.tour) {
      const nr = Shed.makeRuleset(store.settings);
      store.game.rules.ranks = nr.ranks;
      store.game.rules.custom = nr.custom;
      store.game.rules.fourOfAKindBurns = nr.fourOfAKindBurns;
      store.game.rules.blindFollow = nr.blindFollow;
    }
    refreshNote();
    if ($('#rSt')) syncStinger();
    syncPreset();
    if ($('#mRank')) drawBuilder();
  };
  function refreshNote() {
    if (!inGame || !store.game || !store.game.meta || store.game.meta.daily || store.game.meta.tour) return;
    const changed = JSON.stringify(Shed.makeRuleset(store.settings).ranks) !== JSON.stringify(store.game.rules.ranks);
    $('#ruleNote').classList.toggle('hidden', !changed);
    $('#rClose').textContent = 'Keep playing';
  }
  // A rank can only have one active rule. 2 and 10 are fixed, ticked house rules hold their rank, and so does every ticked rule of your own.
  const PICK = Meta.PICKABLE;
  const liveOpts = () => ({ sevensLower: $('#rSev').checked, lowerRank: $('#rSevRank').value, transparentOn: $('#rTr').checked, transparentRank: $('#rTrRank').value, skipOn: $('#rSk').checked, skipRank: $('#rSkRank').value, fourBurns: $('#rFour').checked, blindFollow: $('#rBf').checked, custom: store.settings.custom });
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
      l = $('#rSevRank'),
      ch = customHeld(),
      lo = $('#rSev').checked ? { [l.value]: 1 } : {};
    fillRank(a, a.value, Object.assign({}, ch, lo, {
      [b.value]: 1
    }));
    fillRank(b, b.value, Object.assign({}, ch, lo, {
      [a.value]: 1
    }));
    fillRank(l, l.value, Object.assign({}, ch, $('#rTr').checked ? { [a.value]: 1 } : {}, $('#rSk').checked ? { [b.value]: 1 } : {}));
  };
  fillRank($('#rTrRank'), store.settings.transparentRank, {});
  fillRank($('#rSkRank'), store.settings.skipRank, {});
  fillRank($('#rSevRank'), store.settings.lowerRank || '7', {});
  refreshPickers();
  $('#rTrRank').onchange = () => { refreshPickers(); syncStinger(); drawBuilder(); };
  $('#rSkRank').onchange = () => { refreshPickers(); syncStinger(); drawBuilder(); };
  $('#rSevRank').onchange = () => { refreshPickers(); syncStinger(); drawBuilder(); };
  // ticking a house rule whose card is already taken by one of your own rules is refused
  [['#rSev', 'sevensLower'], ['#rTr', 'transparentOn'], ['#rSk', 'skipOn']].forEach(([id, key]) => {
    $(id).onchange = () => {
      refreshPickers();
      if (!$(id).checked) return;
      const r = Meta.applyChange(Object.assign(liveOpts(), { [key]: false }), { type: 'flag', key, value: true });
      if (!r.ok) {
        $(id).checked = false;
        note('Can\'t tick that. ' + r.error + '. Untick or remove it first.', true);
      }
      refreshPickers();
    };
  });
  // Your own rules sit in the same tick list as the built-in ones.
  // The Stinger row is a tick box over a rule of your own: the first stinger in the list. Presets, codes and online tables see a normal rule.
  const stIdx = () => store.settings.custom.findIndex(r => r.effect === 'stinger');
  const stOff = () => {
    const o = liveOpts(), i = stIdx();
    return Meta.heldRanks(Object.assign({}, o, { custom: o.custom.filter((r, j) => j !== i) }));
  };
  function syncStinger() {
    const i = stIdx(), r = store.settings.custom[i], off = stOff();
    const want = i >= 0 ? r.rank : store.settings.stingerRank;
    const rank = want && Meta.PICKABLE.includes(want) && !off[want] ? want : Meta.PICKABLE.find(k => !off[k]) || Meta.PICKABLE[0];
    fillRank($('#rStRank'), rank, i >= 0 ? Object.assign({}, off, { [rank]: 0 }) : off);
    $('#rSt').checked = i >= 0 && r.on !== false;
  }
  function setStinger(on, rank) {
    const list = store.settings.custom, i = stIdx();
    const rest = list.filter((r, j) => j !== i);
    if (!on) {
      if (i >= 0) store.settings.stingerRank = list[i].rank;
      store.settings.custom = rest;
    } else {
      const res = Meta.applyChange(Object.assign(liveOpts(), { custom: rest }), { type: 'addCustom', rank, effect: 'stinger' });
      if (!res.ok) { note('Can\'t tick that. ' + res.error + '. Untick or remove it first.', true); syncStinger(); return; }
      store.settings.custom = res.opts.custom;
      store.settings.stingerRank = rank;
    }
    save();
    drawChips();
  }
  $('#rSt').onchange = () => setStinger($('#rSt').checked, $('#rStRank').value);
  $('#rStRank').onchange = () => { store.settings.stingerRank = $('#rStRank').value; if ($('#rSt').checked) setStinger(true, $('#rStRank').value); };
  const drawChips = () => {
    const el = $('#customRows');
    const si = stIdx();
    el.innerHTML = store.settings.custom.map((r, i) => i === si ? '' : '<div class="row"><span><b style="color:var(--brass2)">' + esc(r.rank) + '</b> ' + esc(Shed.describeRule(r).slice(r.rank.length + 2)) + '<small>Your own rule</small></span><span class="ctl"><button class="x" data-i="' + i + '" aria-label="Remove">×</button><input type="checkbox" data-t="' + i + '"' + (r.on === false ? '' : ' checked') + '></span></div>').join('');
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
    syncStinger();
    syncPreset();
    if ($('#mRank')) drawBuilder();
  };
  // presets and share codes. Everything goes through Presets, so a code can never give rules the table would refuse.
  const currentOpts = () => Presets.normalise({ sevensLower: $('#rSev').checked, lowerRank: $('#rSevRank').value, transparentOn: $('#rTr').checked, transparentRank: $('#rTrRank').value, skipOn: $('#rSk').checked, skipRank: $('#rSkRank').value, fourBurns: $('#rFour').checked, blindFollow: $('#rBf').checked, custom: store.settings.custom });
  // saved rule sets live in settings, so they come back next time
  const savedList = () => (store.settings.saved = Array.isArray(store.settings.saved) ? store.settings.saved : []);
  const same = (a, b) => JSON.stringify(Presets.normalise(a)) === JSON.stringify(Presets.normalise(b));
  function syncPreset() {
    const sel = $('#rPreset');
    if (!sel) return;
    const cur = currentOpts();
    const hit = Presets.find(cur);
    const si = hit ? -1 : savedList().findIndex(x => same(x.opts, cur));
    sel.value = hit ? hit.id : si >= 0 ? 'saved:' + si : 'mix';
    $('#presetBlurb').textContent = hit ? hit.blurb : si >= 0 ? 'Your saved rules' : 'Your own mix of rules';
    $('#savedDel').classList.toggle('hidden', si < 0);
    $('#saveLbl').textContent = si >= 0 ? 'Saved as ' + savedList()[si].name : 'Save these rules';
    $('#saveSub').textContent = si >= 0 ? 'Change any rule to save a new set' : hit ? 'This is a built-in preset' : 'Keep this mix and pick it from Preset next time';
    $('#saveBtn').classList.toggle('hidden', !!hit || si >= 0);
  }
  function fillPresets() {
    const sel = $('#rPreset');
    const sv = savedList();
    sel.innerHTML = Presets.PRESETS.map(p => '<option value="' + p.id + '">' + esc(p.name) + '</option>').join('') + (sv.length ? '<optgroup label="Your saved rules">' + sv.map((x, i) => '<option value="saved:' + i + '">' + esc(x.name) + '</option>').join('') + '</optgroup>' : '') + '<option value="mix" disabled>Your own mix</option>';
    syncPreset();
  }
  function wireSaved() {
    const box = $('#saveBox'),
      sn = $('#saveNote');
    $('#saveBtn').onclick = () => {
      box.classList.toggle('hidden');
      if (!box.classList.contains('hidden')) $('#saveName').focus();
    };
    const go = () => {
      const name = $('#saveName').value.trim().slice(0, 24);
      sn.className = 'note';
      if (!name) { sn.className = 'note err'; sn.textContent = 'Give it a name first.'; return; }
      const sv = savedList();
      const at = sv.findIndex(x => x.name.toLowerCase() === name.toLowerCase());
      if (at < 0 && sv.length >= MAX_SAVED) { sn.className = 'note err'; sn.textContent = 'You can keep ' + MAX_SAVED + ' sets. Delete one first.'; return; }
      const entry = { name, opts: currentOpts() };
      if (at >= 0) sv[at] = entry; else sv.push(entry);
      save();
      $('#saveName').value = '';
      box.classList.add('hidden');
      fillPresets();
      sn.textContent = 'Saved as ' + name + '.';
      unlock('rules');
    };
    $('#saveGo').onclick = go;
    $('#saveName').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    $('#savedDel').onclick = () => {
      const v = $('#rPreset').value;
      if (!v.startsWith('saved:')) return;
      const sv = savedList(),
        i = +v.slice(6),
        nm = sv[i] && sv[i].name;
      sv.splice(i, 1);
      save();
      fillPresets();
      sn.className = 'note';
      sn.textContent = nm ? 'Deleted ' + nm + '. The rules stay ticked until you change them.' : '';
    };
  }
  function setOpts(o) {
    $('#rSev').checked = o.sevensLower;
    fillRank($('#rSevRank'), o.lowerRank || '7', {});
    $('#rTr').checked = o.transparentOn;
    $('#rSk').checked = o.skipOn;
    $('#rFour').checked = o.fourBurns;
    $('#rBf').checked = !!o.blindFollow;
    store.settings.custom = o.custom.map(r => Object.assign({}, r));
    fillRank($('#rTrRank'), o.transparentRank, {});
    fillRank($('#rSkRank'), o.skipRank, {});
    drawChips();
    apply();
  }
  function wirePresets() {
    const sel = $('#rPreset');
    fillPresets();
    wireSaved();
    sel.onchange = () => {
      const p = Presets.PRESETS.find(x => x.id === sel.value);
      const sv = sel.value.startsWith('saved:') ? savedList()[+sel.value.slice(6)] : null;
      if (p) { setOpts(Presets.normalise(p.opts)); note(''); } else if (sv) { setOpts(Presets.normalise(sv.opts)); note(''); }
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
  // the rule builder: card, then what it does, then (for colour) which colour. Taken cards are greyed out.
  function effOf() {
    return $('#mEff').value;
  }
  function drawBuilder() {
    const sel = $('#mRank');
    if (!sel) return;
    const held = Meta.heldRanks(liveOpts());
    const cur = sel.value;
    sel.innerHTML = Meta.PICKABLE.map(k => '<option value="' + k + '"' + (held[k] ? ' disabled' : '') + '>' + k + (held[k] ? ' (in use)' : '') + '</option>').join('');
    const free = Meta.PICKABLE.filter(k => !held[k]);
    sel.value = cur && !held[cur] ? cur : free[0] || Meta.PICKABLE[0];
    describeBuilder();
  }
  function describeBuilder() {
    const e = effOf(),
      k = $('#mRank').value;
    $('#mDesc').textContent = 'When a ' + k + ' is played: ' + (e === 'none' ? 'it is a plain card with no power.' : Shed.EFFECT_INFO[e].replace(/^./, c => c.toLowerCase()).replace(/the same rank/, 'another ' + k) + '.');
  }
  $('#mRank').onchange = describeBuilder;
  $('#mEff').onchange = describeBuilder;
  $('#mAdd').onclick = () => {
    const res = addRules([{
      rank: $('#mRank').value,
      effect: effOf()
    }]);
    const n = $('#aiNote');
    n.className = 'note' + (res.blocked.length ? ' err' : '');
    n.textContent = res.blocked.length ? res.blocked.join('. ') + '. Untick or remove it first.' : '';
    drawBuilder();
  };
  const note = (t, err) => {
    const n = $('#aiNote');
    n.className = 'note' + (err ? ' err' : '');
    n.textContent = t || '';
  };
  drawBuilder();
  // how you're playing: against the CPU, or online with friends
  const drawMode = () => {
    const on = store.settings.mode === 'online';
    document.querySelectorAll('#mode button').forEach(b => {
      const me = b.dataset.m === (on ? 'online' : 'cpu');
      b.classList.toggle('on', me);
      b.setAttribute('aria-checked', String(me));
    });
    $('#lv').classList.toggle('hidden', on);
    $('#segHead').textContent = on ? 'How many players' : 'How many players, and how good the CPUs are';
    $('#modeBlurb').textContent = on ? 'Make a table with these rules and share the code, or join a friend\'s. Last one holding cards hits Rock Bottom.' : 'You against 1 to 4 CPUs. Last one holding cards hits Rock Bottom.';
    $('#rNew').textContent = on ? 'Next: online table' : 'Start';
  };
  document.querySelectorAll('#mode button').forEach(b => b.onclick = () => {
    store.settings.mode = b.dataset.m;
    save();
    drawMode();
  });
  drawMode();
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
  if (inGame) $('#rClose').onclick = () => {
    apply();
    hideModal();
    if (store.game) render();
  };
  $('#rNew').onclick = () => {
    apply();
    if (store.settings.mode === 'online') return showOnline();
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

// The table rules sheet: see the rules, propose a change, vote on it. Today it runs against pretend guests on this device.
// Online, the same Room reducer runs on whoever hosts, and `dispatch` sends actions to them instead of reducing locally.
import Shed from '../engine.js';
import Room from '../room.js';
import Meta from '../rules-meta.js';
import Table from '../table.js';
import { $, esc } from './dom.js';
import { FAST, save, store } from './state.js';
import { prof } from './profile.js';
import { hideModal, showModal } from './sheets.js';
import { newGame } from './flow.js';
import { showSetup } from './setup.js';

const ME = 'me';
let ticker = null;
const live = () => !!document.getElementById('tblRoot');

function openTable() {
  const players = [{ id: ME, name: (prof() && prof().name) || 'You' }].concat(Table.GUESTS.map(g => ({ id: g.id, name: g.name })));
  store.table = { room: Room.createRoom({ hostId: ME, players, opts: Table.optsFromSettings(store.settings) }), note: '', last: '', timers: [] };
  clearInterval(ticker);
  ticker = setInterval(() => { if (store.table && store.table.room.vote) dispatch({ type: 'tick', now: Date.now() }); }, 500);
}

function closeTable() {
  const t = store.table;
  if (t) t.timers.forEach(clearTimeout);
  clearInterval(ticker);
  store.table = null;
}

// Every change to the table goes through here.
function dispatch(action) {
  const t = store.table;
  if (!t) return;
  const r = Room.reduce(t.room, action, Date.now());
  t.room = r.state;
  for (const ev of r.events) {
    if (ev.type === 'rejected') t.note = 'Not allowed: ' + ev.reason + '.';
    else t.note = '';
    if (ev.type === 'result') t.last = ev.text;
    if (ev.type === 'proposed') guestsVote(ev.vote);
    if (ev.type === 'started') { applyAndStart(ev.opts); return; }
  }
  draw();
}

// Pretend guests answer a few seconds after a proposal.
function guestsVote(vote) {
  const t = store.table;
  let i = 0;
  for (const g of Table.GUESTS) {
    if (vote.votes[g.id]) continue;
    const n = i++;
    t.timers.push(setTimeout(() => {
      if (store.table && store.table.room.vote && store.table.room.vote.id === vote.id) dispatch({ type: 'vote', by: g.id, choice: g.vote(vote.change) });
    }, FAST ? 20 + n * 10 : 1400 + n * 1100));
  }
}

function applyAndStart(opts) {
  Table.applyToSettings(store.settings, opts);
  save();
  closeTable();
  hideModal();
  newGame();
}

const nameOf = (room, id) => { const p = room.players.find(x => x.id === id); return p ? p.name : '?'; };

function voteCard(room, me) {
  const v = room.vote;
  if (!v) return '';
  const t = { yes: 0, no: 0, left: 0 };
  for (const id of v.voters) { if (v.votes[id] === 'yes') t.yes++; else if (v.votes[id] === 'no') t.no++; else t.left++; }
  const mine = v.votes[me];
  const secs = Math.max(0, Math.ceil((v.deadline - Date.now()) / 1000));
  const who = v.voters.map(id => '<span class="chip"><b>' + esc(nameOf(room, id)) + '</b> ' + (v.votes[id] === 'yes' ? 'yes' : v.votes[id] === 'no' ? 'no' : '…') + '</span>').join('');
  return '<div class="votecard"><small>' + esc(nameOf(room, v.proposer)) + ' proposes</small><div class="vt">' + esc(v.text) + '</div><div class="chips">' + who + '</div>' +
    '<div class="vsub">Yes ' + t.yes + ' · No ' + t.no + (t.left ? ' · ' + t.left + ' to go' : '') + ' · ' + secs + 's. A tie goes to ' + esc(nameOf(room, room.hostId)) + ' (host).</div>' +
    '<div class="btns" style="margin-top:8px"><button class="btn primary" id="vYes"' + (mine ? ' disabled' : '') + '>Yes</button><button class="btn" id="vNo"' + (mine ? ' disabled' : '') + '>No</button></div>' +
    (v.proposer === me || room.hostId === me ? '<div style="margin-top:6px"><button class="lnk" id="vWithdraw">Withdraw</button></div>' : '') + '</div>';
}

function draw() {
  if (!live()) return;
  const t = store.table;
  if (!t) return;
  const room = t.room;
  $('#tblPlayers').innerHTML = room.players.map(p => '<span class="chip"><b>' + esc(p.name) + '</b>' + (p.id === room.hostId ? ' host' : '') + '</span>').join('');
  $('#tblRules').innerHTML = Meta.summarise(room.opts).map(l => '<div class="row"><span>' + esc(l) + '</span></div>').join('');
  $('#tblVote').innerHTML = voteCard(room, ME);
  $('#tblLast').textContent = t.last || '';
  const n = $('#tblNote'); n.textContent = t.note || ''; n.className = 'note' + (t.note ? ' err' : '');
  $('#tblPropose').disabled = !!room.vote;
  $('#tblPropose').textContent = room.vote ? 'Vote open' : 'Propose';
  if (room.vote) {
    $('#vYes').onclick = () => dispatch({ type: 'vote', by: ME, choice: 'yes' });
    $('#vNo').onclick = () => dispatch({ type: 'vote', by: ME, choice: 'no' });
    const w = $('#vWithdraw'); if (w) w.onclick = () => dispatch({ type: 'cancel', by: ME });
  }
  fillChange(room.opts);
}

// rebuild the "what to change" list when the rules move, keeping what was picked if it is still there
function fillChange(opts) {
  const sel = $('#tblChange');
  const items = Table.menu(opts);
  const key = items.map(i => i.id).join('|');
  if (sel.dataset.key === key) return;
  const cur = sel.value;
  sel.dataset.key = key;
  sel.innerHTML = items.map(i => '<option value="' + i.id + '">' + esc(i.label) + '</option>').join('') + '<option value="custom">Add a rule of your own…</option>';
  if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
  syncPickers(opts);
}

function syncPickers(opts) {
  const sel = $('#tblChange'), id = sel.value;
  const item = Table.menu(opts).find(i => i.id === id);
  $('#tblRankBox').classList.toggle('hidden', !(item && item.rankKey));
  $('#tblCustomBox').classList.toggle('hidden', id !== 'custom');
}

// what the picker currently says, as a change the Room reducer understands
function readChange(opts) {
  const id = $('#tblChange').value;
  if (id === 'custom') return { type: 'addCustom', rank: $('#tblCRank').value, effect: $('#tblCEff').value };
  const item = Table.menu(opts).find(i => i.id === id);
  if (!item) return null;
  const change = Object.assign({}, item.change);
  if (item.rankKey) change.rank = $('#tblRank').value;
  return change;
}

function propose() {
  const change = readChange(store.table.room.opts);
  if (change) dispatch({ type: 'propose', by: ME, change });
}

// the "Propose a change" controls, shared with the online waiting room
function proposeHTML() {
  const pick = Meta.PICKABLE.map(k => '<option>' + k + '</option>').join('');
  const ranks = Shed.RANK_LIST.map(k => '<option>' + k + '</option>').join('');
  const effs = '<option value="none">plain card</option>' + Shed.EFFECTS.map(k => '<option value="' + k + '">' + k + '</option>').join('');
  return '<h3>Propose a change</h3>' +
    '<div class="inp"><select id="tblChange" aria-label="What to change"></select></div>' +
    '<div class="inp hidden" id="tblRankBox"><select id="tblRank" aria-label="Which card">' + pick + '</select></div>' +
    '<div class="inp hidden" id="tblCustomBox"><select id="tblCRank" aria-label="Card">' + ranks + '</select><select id="tblCEff" aria-label="What it does">' + effs + '</select></div>' +
    '<div class="inp"><button class="btn primary" id="tblPropose" style="flex:1">Propose</button></div>';
}

export function showTable() {
  if (!store.table) openTable();
  showModal('<div id="tblRoot"><h2>Table rules</h2>' +
    '<p>Anyone can propose a change. Everyone votes, the majority wins, and the host settles a tie.</p>' +
    '<div class="chips" id="tblPlayers"></div>' +
    '<h3>Rules at this table</h3><div id="tblRules"></div>' +
    '<div id="tblVote"></div><div class="note" id="tblLast"></div>' +
    proposeHTML() +
    '<div class="note" id="tblNote"></div>' +
    '<p class="ex">Preview with pretend friends. When online tables open, the same vote runs between real people.</p>' +
    '<div class="btns"><button class="btn" id="tblLeave">Back</button><button class="btn primary" id="tblStart">Start game</button></div></div>');
  $('#tblChange').onchange = () => syncPickers(store.table.room.opts);
  $('#tblPropose').onclick = propose;
  $('#tblLeave').onclick = () => { closeTable(); showSetup(); };
  $('#tblStart').onclick = () => dispatch({ type: 'start', by: ME });
  draw();
}

// for tests and the console
export { fillChange, proposeHTML, readChange, voteCard };
export const tableForTest = { dispatch, state: () => (store.table ? store.table.room : null) };

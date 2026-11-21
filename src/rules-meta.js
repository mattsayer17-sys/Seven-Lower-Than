'use strict';
// Pure helpers about house rules: which card holds which rule, and whether a proposed change is allowed.
// Same options object the engine's makeRuleset takes: sevensLower, transparentOn/Rank, skipOn/Rank, fourBurns, custom[].
// Law: a card that already has an active rule cannot be given another one.
const Shed = require('./engine.js');

const FLAGS = ['sevensLower', 'transparentOn', 'skipOn', 'fourBurns', 'blindFollow'];
const RANK_KEYS = { transparentRank: 'transparentOn', skipRank: 'skipOn' };
// ranks a house rule may sit on. 2, 7 and 10 have fixed jobs.
const PICKABLE = Shed.RANK_LIST.filter(k => !['2', '7', '10'].includes(k));
const LABEL = { sevensLower: '7s force lower', transparentOn: 'Transparent card', skipOn: 'Skip a go', fourBurns: 'Four of a kind burns', blindFollow: 'Face-down follow-up' };

const rankOf = (o, key) => (key === 'transparentRank' ? o.transparentRank || '4' : o.skipRank || '8');
const customActive = r => r && r.on !== false && r.effect && r.effect !== 'none';

// rank -> why it is taken. Setup and the vote both go through this.
function heldRanks(o) {
  const m = { '2': 'the 2s reset rule', '10': 'the 10s burn rule' };
  if (o.sevensLower !== false) m['7'] = '7s force lower';
  if (o.transparentOn) m[rankOf(o, 'transparentRank')] = 'the transparent card rule';
  if (o.skipOn) m[rankOf(o, 'skipRank')] = 'the skip a go rule';
  for (const r of o.custom || []) if (customActive(r)) m[r.rank] = 'your own rule for ' + r.rank;
  return m;
}

const clone = o => JSON.parse(JSON.stringify(o));
const fail = error => ({ ok: false, error });
const taken = (rank, why) => rank + ' is already used by ' + why;

// Returns { ok: true, opts } with the change applied to a copy, or { ok: false, error }.
function applyChange(opts, change) {
  const o = clone(opts);
  if (!change || typeof change !== 'object') return fail('not a change');
  switch (change.type) {
    case 'flag': {
      if (!FLAGS.includes(change.key) || typeof change.value !== 'boolean') return fail('unknown rule');
      // turning transparent or skip on can also say which card it goes on, in the same vote
      const rk = change.key === 'transparentOn' ? 'transparentRank' : change.key === 'skipOn' ? 'skipRank' : null;
      if (change.rank !== undefined) {
        if (!rk || !change.value) return fail('a card only goes with turning a rule on');
        const moved = applyChange(o, { type: 'rank', key: rk, value: change.rank });
        if (!moved.ok) return moved;
        o[rk] = change.rank;
      }
      if (change.value) {
        // switching on: the card it needs must be free
        const need = change.key === 'sevensLower' ? '7' : change.key === 'transparentOn' ? rankOf(o, 'transparentRank') : change.key === 'skipOn' ? rankOf(o, 'skipRank') : null;
        if (need) {
          const held = heldRanks(Object.assign({}, o, { [change.key]: false }));
          if (held[need]) return fail(taken(need, held[need]));
        }
      }
      o[change.key] = change.value;
      return { ok: true, opts: o };
    }
    case 'rank': {
      if (!RANK_KEYS[change.key]) return fail('unknown rule');
      if (!PICKABLE.includes(change.value)) return fail(change.value + ' cannot hold a house rule');
      const other = change.key === 'transparentRank' ? rankOf(o, 'skipRank') : rankOf(o, 'transparentRank');
      if (change.value === other) return fail(taken(change.value, change.key === 'transparentRank' ? 'the skip a go rule' : 'the transparent card rule'));
      const held = heldRanks(Object.assign({}, o, { [RANK_KEYS[change.key]]: false, sevensLower: false }));
      if (held[change.value] && held[change.value].indexOf('your own') === 0) return fail(taken(change.value, held[change.value]));
      o[change.key] = change.value;
      return { ok: true, opts: o };
    }
    case 'addCustom': {
      const v = Shed.validateCustom([{ rank: change.rank, effect: change.effect, power: change.power }]);
      if (!v.rules.length) return fail('not a valid rule');
      const r = v.rules[0];
      if (r.effect && r.effect !== 'none') {
        const held = heldRanks(o);
        if (held[r.rank]) return fail(taken(r.rank, held[r.rank]));
      }
      o.custom = Shed.validateCustom((o.custom || []).concat([r])).rules;
      return { ok: true, opts: o };
    }
    case 'removeCustom': {
      const before = (o.custom || []).length;
      o.custom = (o.custom || []).filter(r => r.rank !== change.rank);
      return o.custom.length === before ? fail('no rule of your own on ' + change.rank) : { ok: true, opts: o };
    }
    case 'toggleCustom': {
      const r = (o.custom || []).find(x => x.rank === change.rank);
      if (!r || typeof change.value !== 'boolean') return fail('no rule of your own on ' + change.rank);
      if (change.value && r.effect && r.effect !== 'none') {
        r.on = false;
        const held = heldRanks(o);
        if (held[r.rank]) return fail(taken(r.rank, held[r.rank]));
      }
      r.on = change.value;
      return { ok: true, opts: o };
    }
    default:
      return fail('unknown change');
  }
}

// One line a person can read: "Turn on Skip a go (8s)".
function describeChange(change, opts) {
  let o = opts || {};
  switch (change && change.type) {
    case 'flag': {
      const on = change.value;
      if (change.rank !== undefined) o = Object.assign({}, o, { transparentRank: change.key === 'transparentOn' ? change.rank : o.transparentRank, skipRank: change.key === 'skipOn' ? change.rank : o.skipRank });
      if (change.key === 'transparentOn') return (on ? 'Turn on' : 'Turn off') + ' ' + LABEL.transparentOn + (on ? ' (' + rankOf(o, 'transparentRank') + 's)' : '');
      if (change.key === 'skipOn') return (on ? 'Turn on' : 'Turn off') + ' ' + LABEL.skipOn + (on ? ' (' + rankOf(o, 'skipRank') + 's)' : '');
      return (on ? 'Turn on ' : 'Turn off ') + LABEL[change.key];
    }
    case 'rank': return 'Move ' + (change.key === 'transparentRank' ? LABEL.transparentOn : LABEL.skipOn) + ' to ' + change.value + 's';
    case 'addCustom': return 'Add a rule: ' + Shed.describeRule({ rank: String(change.rank).toUpperCase(), effect: change.effect, power: change.power });
    case 'removeCustom': return 'Remove the rule on ' + change.rank + 's';
    case 'toggleCustom': return (change.value ? 'Turn on' : 'Turn off') + ' the rule on ' + change.rank + 's';
    default: return 'Change the rules';
  }
}

// One line per active rule, for showing the table's current rules.
function summarise(opts) {
  const r = Shed.makeRuleset(opts);
  const out = [];
  for (const k of Shed.RANK_LIST) if (r.ranks[k].effect) out.push(k + ': ' + Shed.EFFECT_INFO[r.ranks[k].effect]);
  if (r.fourOfAKindBurns) out.push('Four of a kind in a row burns the pile');
  if (r.blindFollow) out.push('Face-down follow-up: see your next face-down card, add it if it matches');
  return out;
}

module.exports = { FLAGS, RANK_KEYS, PICKABLE, LABEL, heldRanks, applyChange, describeChange, summarise, rankOf };

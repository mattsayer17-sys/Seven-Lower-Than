'use strict';
// Glue between the saved settings, the table rules sheet and the pretend guests used in the preview.
const Meta = require('./rules-meta.js');

const KEYS = ['sevensLower', 'transparentOn', 'transparentRank', 'skipOn', 'skipRank', 'fourBurns', 'blindFollow', 'custom'];
const copy = v => JSON.parse(JSON.stringify(v));

// the house-rule part of the settings, as the options the engine and the vote work with
function optsFromSettings(s) {
  const o = {};
  for (const k of KEYS) if (s[k] !== undefined) o[k] = copy(s[k]);
  return o;
}
function applyToSettings(s, o) {
  for (const k of KEYS) if (o[k] !== undefined) s[k] = copy(o[k]);
  return s;
}

const isOn = (o, k) => (k === 'sevensLower' ? o.sevensLower !== false : !!o[k]);
const RANK_KEY = { transparentOn: 'transparentRank', skipOn: 'skipRank' };

// What someone can propose right now. rankKey means the sheet should ask which card.
function menu(opts) {
  const items = Meta.FLAGS.map(k => {
    const on = isOn(opts, k);
    return { id: 'flag:' + k, label: (on ? 'Turn off ' : 'Turn on ') + Meta.LABEL[k], change: { type: 'flag', key: k, value: !on }, rankKey: !on && RANK_KEY[k] ? RANK_KEY[k] : null };
  });
  for (const r of opts.custom || []) items.push({ id: 'rm:' + r.rank, label: 'Remove the rule on ' + r.rank + 's', change: { type: 'removeCustom', rank: r.rank }, rankKey: null });
  return items;
}

// Pretend guests for the preview. Real people replace these when tables go online.
const GUESTS = [
  { id: 'tali', name: 'Tali', vote: () => 'yes' },
  { id: 'dave', name: 'Dave', vote: change => (change.type === 'addCustom' ? 'no' : 'yes') },
];
const IDEAS = {
  tali: { type: 'flag', key: 'skipOn', value: true },
  dave: { type: 'flag', key: 'fourBurns', value: false },
};

module.exports = { KEYS, optsFromSettings, applyToSettings, menu, GUESTS, IDEAS };

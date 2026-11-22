'use strict';
// Ready-made house rules and share codes. Pure: no screen, no storage.
// A share code is "H1-<payload>-<check>". The payload is the rules in a compact form, the check catches typos.
// Anything decoded is rebuilt through Meta.applyChange, so a code can never produce rules the table could not vote in.
const Shed = require('./engine.js');
const Meta = require('./rules-meta.js');

const PRESETS = [
  { id: 'classic', name: 'Classic', blurb: 'The standard rules. 2 resets, 10 burns, 7 sends it lower.', opts: {} },
  { id: 'plain', name: 'Plain', blurb: 'Just the 2 and the 10. No lower, no four of a kind burn.', opts: { sevensLower: false, fourBurns: false } },
  { id: 'sneaky', name: 'Sneaky 4s', blurb: 'Classic plus an invisible 4. The card underneath still counts.', opts: { transparentOn: true, transparentRank: '4' } },
  { id: 'miss', name: 'Miss a go', blurb: 'Classic plus the 8 makes the next player miss a turn.', opts: { skipOn: true, skipRank: '8' } },
  { id: 'chaos', name: 'Chaos', blurb: 'Invisible 4, skip on 8, Jacks reverse, Kings make you pick up.', opts: { transparentOn: true, transparentRank: '4', skipOn: true, skipRank: '8', custom: [{ rank: 'J', effect: 'reverse', on: true }, { rank: 'K', effect: 'pickup', on: true }] } },
];

const BASE = { sevensLower: false, lowerRank: '7', transparentOn: false, transparentRank: '4', skipOn: false, skipRank: '8', fourBurns: false, blindFollow: false, custom: [] };
const KEYS = ['sevensLower', 'lowerRank', 'transparentOn', 'transparentRank', 'skipOn', 'skipRank', 'fourBurns', 'blindFollow', 'custom'];
const clone = o => JSON.parse(JSON.stringify(o));

// Fill in every house-rule field, so two settings that mean the same thing look the same.
function normalise(opts) {
  const o = opts || {};
  const v = Shed.validateCustom(o.custom || []).rules;
  return {
    sevensLower: o.sevensLower !== false,
    lowerRank: o.lowerRank || '7',
    transparentOn: !!o.transparentOn,
    transparentRank: o.transparentRank || '4',
    skipOn: !!o.skipOn,
    skipRank: o.skipRank || '8',
    fourBurns: o.fourBurns !== false,
    blindFollow: !!o.blindFollow,
    custom: v.map(r => { const c = { rank: r.rank, on: r.on !== false }; if (r.effect !== undefined) c.effect = r.effect; if (r.power !== undefined) c.power = r.power; return c; }),
  };
}

// Same rules? Ignores a card choice for a rule that is off, and the order of own rules.
function same(a, b) {
  const x = normalise(a), y = normalise(b);
  const side = o => JSON.stringify([o.sevensLower && o.lowerRank, o.transparentOn && o.transparentRank, o.skipOn && o.skipRank, o.fourBurns, o.blindFollow,
    o.custom.slice().sort((p, q) => (p.rank < q.rank ? -1 : 1)).map(r => [r.rank, r.on, r.effect === undefined ? null : r.effect, r.power === undefined ? null : r.power])]);
  return side(x) === side(y);
}
const find = opts => PRESETS.find(p => same(p.opts, opts)) || null;

// ---------- share code ----------
const b64 = {
  enc(s) { const b = typeof Buffer !== 'undefined' ? Buffer.from(s, 'utf8').toString('base64') : btoa(unescape(encodeURIComponent(s))); return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  dec(s) { const p = s.replace(/-/g, '+').replace(/_/g, '/'); const q = p + '==='.slice((p.length + 3) % 4); return typeof Buffer !== 'undefined' ? Buffer.from(q, 'base64').toString('utf8') : decodeURIComponent(escape(atob(q))); },
};
function check(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return (h % 46656).toString(36).padStart(3, '0'); }
const cleanName = n => String(n == null ? '' : n).replace(/[^\w '&!-]/g, '').trim().slice(0, 24);

function encode(opts, name) {
  const o = normalise(opts);
  const body = { n: cleanName(name), s: o.sevensLower ? (o.lowerRank === '7' ? 1 : o.lowerRank) : 0, t: o.transparentOn ? o.transparentRank : 0, k: o.skipOn ? o.skipRank : 0, f: o.fourBurns ? 1 : 0, b: o.blindFollow ? 1 : 0,
    c: o.custom.map(r => [r.rank, r.effect === undefined ? '' : r.effect, r.power === undefined ? '' : r.power, r.on ? 1 : 0]) };
  const payload = b64.enc(JSON.stringify(body));
  return 'H1-' + payload + '-' + check(payload);
}

const bad = error => ({ ok: false, error });

function decode(code) {
  const raw = String(code == null ? '' : code).replace(/\s+/g, '');
  const m = /^H1-([A-Za-z0-9_-]+)-([0-9a-z]{3})$/.exec(raw);
  if (!m) return bad(/^H\d+-/i.test(raw) && !/^H1-/i.test(raw) ? 'This code is from a newer version' : 'That does not look like a rules code');
  if (check(m[1]) !== m[2]) return bad('The code has a typo in it. Check it and try again');
  let b;
  try { b = JSON.parse(b64.dec(m[1])); } catch (e) { return bad('The code is damaged'); }
  if (!b || typeof b !== 'object' || !Array.isArray(b.c)) return bad('The code is damaged');
  // rebuild from nothing, one rule at a time, so the same laws apply as in a vote
  let o = clone(BASE), r;
  const step = ch => { r = Meta.applyChange(o, ch); if (r.ok) o = r.opts; return r.ok; };
  // s: 1 means lower than on 7 (codes made before the card could change), or the card it sits on
  if (b.s && !step(b.s === 1 ? { type: 'flag', key: 'sevensLower', value: true } : { type: 'flag', key: 'sevensLower', value: true, rank: String(b.s) })) return bad(r.error);
  if (b.t) { if (!step({ type: 'flag', key: 'transparentOn', value: true, rank: String(b.t) })) return bad(r.error); }
  if (b.k) { if (!step({ type: 'flag', key: 'skipOn', value: true, rank: String(b.k) })) return bad(r.error); }
  if (b.f === 1) o.fourBurns = true;
  if (b.b === 1) o.blindFollow = true;
  const seen = {};
  for (const c of b.c.slice(0, 20)) {
    if (!Array.isArray(c)) return bad('The code is damaged');
    const [rank, effect, power, on] = c;
    if (seen[rank]) return bad('Two rules on ' + rank);
    seen[rank] = true;
    const spec = { rank, effect: effect === '' ? undefined : effect, power: power === '' ? undefined : power };
    if (on === 0) {
      const v = Shed.validateCustom([Object.assign({}, spec, { on: false })]);
      if (!v.rules.length) return bad('Not a valid rule on ' + rank);
      o.custom = Shed.validateCustom(o.custom.concat(v.rules)).rules;
    } else if (!step(Object.assign({ type: 'addCustom' }, spec))) return bad(r.error);
  }
  return { ok: true, name: cleanName(b.n), opts: normalise(o) };
}

module.exports = { PRESETS, KEYS, normalise, same, find, encode, decode };

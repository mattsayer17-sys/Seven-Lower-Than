'use strict';
// Name checks: rude names refused however they are spelled, ordinary names and places let through.
const test = require('node:test');
const assert = require('node:assert/strict');
const Names = require('../src/names.js');
const Reactions = require('../src/reactions.js');

test('rude names are refused, including disguised spellings', () => {
  for (const n of ['fuck', 'FUCK', 'f.u.c.k', 'fuuuuck', 'f u c k', 'fck off', 'ph uck', 'sh1t', '$hit', 'b1tch', 'biiitch', 'cunt', 'c u n t', 'wanker99',
    'Big Dick', 'BigDick', 'twat', 'bollocks', 'arsehole', 'a55hole', 'nazi', 'Hitler', 'slut', 'whore', 'w h o r e', 'dildo', 'pr1ck', 'bellend',
    'ass', 'bigass', 'Ass Man', 'tit', 'cum', 'retard', 'fag', 'faggot', '🖕', 'Nice 🍆', 'knobhead', 'Kunt', 'Fúck', 'fvck', 'Big4ss', 't1t']) {
    assert.equal(Names.isRude(n), true, n + ' should be refused');
    assert.equal(Names.check(n).ok, false, n);
  }
});

test('ordinary names and places are let through', () => {
  for (const n of ['Matt', 'Tali', 'Scunthorpe', 'Cocktail Kid', 'Arsenal fan', 'Class act', 'Bass Player', 'Titan', 'Sussex Sam', 'Essex Girl',
    'Peacock', 'Dickens', 'Grape', 'Japan', 'Muffin', 'Shaggy', 'Cumbria', 'Noble', 'Spicy', 'Cassie', 'Assist King', 'Therapist', 'Glasses',
    'Nazir', 'Semenya', 'Nigam', 'Fagan', 'Petit', 'Torpedo', 'Sexton', 'Raphael', 'Hancock', 'Penistone', 'Clitheroe', 'Analise', 'Jo', 'Ann-Marie', 'Zoë', 'Matt 17', 'Matt17', 'Dave 1980', 'Wily Stoat 17']) {
    assert.equal(Names.isRude(n), false, n + ' should be allowed');
    assert.equal(Names.check(n).ok, true, n);
  }
});

test('check tidies and limits the name', () => {
  assert.deepEqual(Names.check('  Matt   S  '), { ok: true, name: 'Matt S' });
  assert.equal(Names.check('<b>Matt</b>').name, 'bMatt/b');
  assert.equal(Names.check('x'.repeat(30)).name.length, Names.MAX);
  assert.deepEqual(Names.check('   '), { ok: false, error: 'Pick a name' });
  assert.deepEqual(Names.check('shithead'), { ok: false, error: 'Try another name' });
});

test('every suggested name is clean and fits', () => {
  for (const a of Names.ADJ) for (const b of Names.ANIMAL) {
    const s = a + ' ' + b + ' 99';
    if (s.length <= Names.MAX) assert.equal(Names.isRude(s), false, s);
  }
  let seed = 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 500; i++) { const s = Names.suggest(rnd); assert.ok(s.length <= Names.MAX, s); assert.equal(Names.check(s).ok, true, s); }
});

test('the reaction list is clean and only it is allowed', () => {
  for (const r of Reactions.LIST) { assert.equal(Reactions.allowed(r), true); assert.equal(Names.isRude(r), false, r); }
  for (const r of ['hello', '', null, 42, 'Nice one ', '👍👍']) assert.equal(Reactions.allowed(r), false, String(r));
});

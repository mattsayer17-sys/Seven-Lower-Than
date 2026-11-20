'use strict';
// Player names: a quick check for rude words, and friendly suggestions so nobody has to think of one.
// Shared by the server (the check that counts) and the app (instant feedback). No filter is perfect:
// report and block are the backstop. Spellings are normalised first so "f.u.c.k", "fuuuck" and "fvck"-style
// tricks with numbers and symbols are caught, and an allowlist stops place names and ordinary words tripping it.
(function (root) {
  const MAX = 16;

  // Matched anywhere in the name, after spaces, dots and repeated letters are squeezed out.
  const STEMS = ['fuck', 'fuk', 'fuq', 'fck', 'fvck', 'shit', 'cunt', 'kunt', 'bitch', 'wank', 'twat', 'bollock', 'nigg', 'slut', 'whore',
    'penis', 'vagina', 'dildo', 'porn', 'cock', 'dick', 'pussy', 'retard', 'spastic', 'spaz', 'paki', 'chink', 'kike', 'coon', 'tranny',
    'hitler', 'jizz', 'arsehole', 'asshole', 'bastard', 'bellend', 'knobhead', 'minge', 'skank', 'rape', 'tits', 'prick', 'faggot', 'kkk', 'clit',
    'pedo', 'paedo', 'molest', 'isis', 'gestapo'];
  // Short ones that live inside ordinary words: only a whole word, or the very start or end of the name.
  const SHORT = ['ass', 'arse', 'tit', 'anal', 'anus', 'spic', 'wog', 'knob', 'muff', 'shag', 'poof', 'dyke', 'homo', 'nob', 'gook', 'sex', 'jap', 'cum', 'fag', 'nazi', 'heil'];
  // Ordinary words and places that contain a stem. Taken out before checking.
  const ALLOW = ['scunthorpe', 'cocktail', 'peacock', 'hancock', 'cockney', 'cockerel', 'shuttlecock', 'woodcock', 'hitchcock', 'cockpit', 'cockatoo', 'cockle', 'cockburn', 'babcock', 'alcock',
    'dickens', 'dickson', 'dickinson', 'raccoon', 'cocoon', 'tycoon', 'grape', 'drape', 'scrape', 'trapeze', 'rapeseed', 'therapist', 'arsenal',
    'class', 'glass', 'grass', 'bass', 'pass', 'mass', 'lass', 'brass', 'cass', 'assassin', 'assist', 'asset', 'canal', 'banal', 'janus', 'manus',
    'titan', 'title', 'titch', 'spice', 'spicy', 'muffin', 'shaggy', 'noble', 'nobody', 'cumbria', 'cumberland', 'cucumber', 'document', 'circum',
    'sussex', 'essex', 'middlesex', 'japan', 'pakistan', 'fagin', 'fagan', 'scraper', 'parisis', 'torpedo', 'petit', 'analis', 'analia', 'analy', 'sexton', 'nazir', 'penistone', 'clitheroe', 'shitake', 'shiitake',
    'cumulus', 'acumen', 'sextant', 'sextet', 'homer', 'homework', 'homely'];
  const LEET = { 0: 'o', 1: 'i', 2: 'z', 3: 'e', 4: 'a', 5: 's', 6: 'g', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '!': 'i', '|': 'i', '€': 'e', '£': 'l', '+': 't' };
  const BAD_EMOJI = /\u{1F595}|\u{1F346}|\u{1F351}|\u{1F4A6}|卐|卍/u; // middle finger, aubergine, peach, droplets, swastikas

  const fold = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ph/g, 'f')
    .replace(/[0-9@$!|€£+]/g, c => LEET[c] || c);
  const squeeze = s => s.replace(/(.)\1+/g, '$1');      // fuuuuck -> fuck
  const cap2 = s => s.replace(/(.)\1{2,}/g, '$1$1');   // asssss -> ass (but "ass" stays "ass")
  const strip = (s, words) => words.reduce((t, w) => t.split(w).join('|'), s);

  function isRude(name) {
    const raw = String(name || '');
    if (BAD_EMOJI.test(raw)) return true;
    const f = fold(raw);
    const letters = cap2(f.replace(/[^a-z]/g, ''));
    const tight = squeeze(strip(squeeze(letters), ALLOW.map(squeeze)));
    if (STEMS.some(w => squeeze(w) === w && tight.split('|').some(part => part.includes(squeeze(w))))) return true;
    // also catch "b i t c h" style names where squeezing would merge real double letters
    if (STEMS.some(w => strip(letters, ALLOW).split('|').some(part => part.includes(w)))) return true;
    const words = f.split(/[^a-z]+/).filter(Boolean).map(cap2);
    if (words.some(w => SHORT.includes(w))) return true;
    // a number on the end of a word is a number ("Matt17" is not "mattit"); one inside a word is a letter ("b1gass")
    const ends = strip(cap2(fold(raw.replace(/[0-9]+(?![0-9]*[a-zA-Z])/g, '')).replace(/[^a-z]/g, '')), ALLOW);
    return SHORT.some(w => ends.startsWith(w) || ends.endsWith(w));
  }

  // Tidy a name and say whether it can be used. { ok, name } or { ok: false, error }.
  function check(name) {
    const n = String(name || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX);
    if (!n) return { ok: false, error: 'Pick a name' };
    if (isRude(n)) return { ok: false, error: 'Try another name' };
    return { ok: true, name: n };
  }

  const ADJ = ['Lucky', 'Cheeky', 'Sneaky', 'Jammy', 'Brave', 'Sly', 'Swift', 'Bold', 'Quiet', 'Wily', 'Sharp', 'Smooth', 'Cool', 'Plucky', 'Steady', 'Crafty'];
  const ANIMAL = ['Fox', 'Otter', 'Badger', 'Hare', 'Owl', 'Robin', 'Stoat', 'Heron', 'Wren', 'Mole', 'Newt', 'Lynx', 'Puffin', 'Toad', 'Magpie', 'Seal'];
  // A ready-made name like "Lucky Fox 42". rnd is optional (tests pass their own).
  function suggest(rnd) {
    const r = rnd || Math.random;
    for (;;) {
      const s = ADJ[r() * ADJ.length | 0] + ' ' + ANIMAL[r() * ANIMAL.length | 0] + ' ' + (10 + (r() * 90 | 0));
      if (s.length <= MAX) return s;
    }
  }

  const api = { check, isRude, suggest, MAX, ADJ, ANIMAL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Names = api;
})(typeof window !== 'undefined' ? window : globalThis);

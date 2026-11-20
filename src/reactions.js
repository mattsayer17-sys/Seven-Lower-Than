'use strict';
// The only things anyone can say at an online table. Fixed on purpose: no free text means nothing to moderate.
// Shared by the server (which refuses anything else) and the client (which only shows what is on this list).
(function (root) {
  const EMOJI = ['👍', '😂', '😬', '🔥', '🪨'];
  const PHRASES = ['Nice one', 'Unlucky!', 'Ouch', 'Too slow'];
  const LIST = EMOJI.concat(PHRASES);
  const GAP_MS = 1200; // one reaction per player per this long
  const allowed = t => typeof t === 'string' && LIST.includes(t);
  const api = { EMOJI, PHRASES, LIST, GAP_MS, allowed };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Reactions = api;
})(typeof window !== 'undefined' ? window : globalThis);

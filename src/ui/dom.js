const $ = s => document.querySelector(s);

const table = $('#table'),
  cardsEl = $('#cards');

const esc = s => String(s).replace(/[&<>"]/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;'
})[c]);

export { $, cardsEl, esc, table };

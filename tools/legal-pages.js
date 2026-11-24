'use strict';
// Writes public/privacy.html, terms.html and support.html from one template, so the three pages share a look
// and the contact details live in one place. Run: node tools/legal-pages.js
const fs = require('fs');
const path = require('path');
const CONTACT = 'hello@playshiphead.com';
const UPDATED = '24 November 2026';
const page = (title, body) => `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${title} · Shiphead</title><meta name="robots" content="index,follow"><link rel="icon" href="/icon-192.png">
<style>
:root{color-scheme:dark}body{margin:0;background:#0f1a14;color:#ece7da;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Inter Tight","Segoe UI",sans-serif}
main{max-width:680px;margin:0 auto;padding:max(28px,env(safe-area-inset-top)) 22px 60px}
h1{font-size:28px;line-height:1.2;margin:0 0 4px}h2{font-size:18px;margin:28px 0 6px;color:#d8b55a}
p,li{color:#cfc9b9}a{color:#e2c06b}small{color:#8f8a7c}ul{padding-left:20px}
.top{display:flex;align-items:center;gap:10px;margin-bottom:24px;text-decoration:none;color:#ece7da;font-weight:700}
.top img{width:32px;height:32px;border-radius:8px}
</style></head><body><main>
<a class="top" href="/"><img src="/icon-192.png" alt="">Shiphead</a>
<h1>${title}</h1><small>Last updated ${UPDATED}</small>
${body}
<h2>Contact</h2><p>Email <a href="mailto:${CONTACT}">${CONTACT}</a>. We reply within 5 working days.</p>
</main></body></html>
`;

const privacy = page('Privacy policy', `
<p>Shiphead is a card game. We collect as little as we can, and nothing at all if you only play against the computer.</p>
<h2>Playing on your own</h2>
<p>Your profiles, records, achievements and settings are saved only on your device. We never see them.</p>
<h2>Playing online</h2>
<p>When you first go online we create an anonymous account for you. No email, phone number or password is needed. We store:</p>
<ul>
<li>a random account ID and the name and avatar you pick</li>
<li>the tables you join, the moves in those games and where you finished, so games work and head to head records match on every phone</li>
<li>quick reactions you send at a table, kept for 7 days</li>
<li>people you block and anything you report</li>
<li>your network address, used only to stop abuse (request counts kept for 24 hours)</li>
</ul>
<p>We use this only to run the game and keep it safe. We do not sell it, and there is no advertising or tracking in the game today. If that changes we will update this page and ask you first where the law requires it.</p>
<h2>Who processes it</h2>
<p>Game data is stored with Supabase in London (UK). The website and app files are served by Vercel. Both act only on our instructions.</p>
<h2>How long we keep it</h2>
<p>Unused anonymous accounts that never went online are removed after 7 days. Finished games are kept for head to head records until you delete your account.</p>
<h2>Your rights</h2>
<p>You can delete everything at any time: open your profile and tap <b>Delete my data</b>. This removes your online account and all data on the device straight away. You can also email us to see, correct or delete your data. Under UK GDPR you can complain to the Information Commissioner's Office (ico.org.uk).</p>
<h2>Children</h2>
<p>Shiphead is not made for children under 13 and we do not knowingly collect their data.</p>
`);

const terms = page('Terms of use', `
<p>By playing Shiphead you agree to these terms. They are short on purpose.</p>
<h2>The game</h2>
<p>Shiphead is free to play. It is a game of cards and skill with no gambling, no cash prizes and nothing of real-world value to win.</p>
<h2>Playing fair</h2>
<ul><li>Pick a name that is not offensive and does not pretend to be someone else.</li>
<li>Don't harass other players, cheat, or try to break, overload or reverse-engineer the service.</li></ul>
<p>We can remove names, end tables, or close accounts that break these rules.</p>
<h2>The service</h2>
<p>We work hard to keep the game running but can't promise it will always be available or free of bugs. The game is provided as it is, and to the extent the law allows we are not liable for losses from using it. Nothing here affects your statutory rights.</p>
<h2>Changes</h2>
<p>We may update these terms. If the change matters we will say so in the game. These terms are governed by the law of England and Wales.</p>
`);

const support = page('Help', `
<h2>How do I play?</h2><p>Open the game and the first hand is already dealt. The welcome card shows the house rules; tap <b>Rules</b> for the full list, or replay the tour from the menu.</p>
<h2>How do I play with friends?</h2><p>Tap <b>Online</b>, make a table and share the link or code. Friends tap the link and sit down, no sign-up needed.</p>
<h2>Someone is being abusive</h2><p>Press and hold their name at the table to block or report them. Blocked players' reactions are hidden from you.</p>
<h2>How do I delete my data?</h2><p>Open your profile and tap <b>Delete my data</b> at the bottom. See the <a href="/privacy">privacy policy</a>.</p>
<h2>Something is broken</h2><p>Email us with what happened, your phone model and, if you can, a screenshot.</p>
`);

const out = path.join(__dirname, '..', 'public');
fs.writeFileSync(path.join(out, 'privacy.html'), privacy);
fs.writeFileSync(path.join(out, 'terms.html'), terms);
fs.writeFileSync(path.join(out, 'support.html'), support);
console.log('wrote privacy, terms, support');

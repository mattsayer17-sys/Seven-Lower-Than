# Changelog

Newest first. One line per change. Every session adds its lines here in the same commit as the work.

## 2026-11-24
- Server limits how fast one player or one network can send requests, make tables, join tables and send reports; caps open tables per player.
- An hourly cleanup removes stale lobbies, abandoned games, old reactions and unused anonymous accounts.
- Names can only be set through the server, so the name filter can't be skipped.
- Delete my data in the profile removes the online account and everything on the phone.
- Press and hold another player's name at an online table to block or report them; a blocked player can't join your tables.
- Privacy policy, terms and help pages at /privacy, /terms and /support, linked from the profile.
- Ready for a Cloudflare Turnstile check on new online accounts (off until the site key is added).
- Live test removes its own test users at the end; old test users and tables deleted.
- Server v11 deployed and live-tested.
- iPhone app project (Capacitor): brand icon and splash, iPhone only, portrait, privacy manifest, real haptics through the app.
- Invite links and notification taps open the right table in the app.
- After a first online game the app asks once for notifications; friends get told when a game is dealt or a rematch is offered (switches on when the Apple push key is added).
- Cloud build set up to send app builds to TestFlight without a Mac.
- Server v12 deployed and live-tested.

## 2026-11-23
- The see-through rule is called "Invisible card" everywhere, including the Rules tab and table votes.
- Effects and pauses are longer so burns, pick-ups and their words can be read; a CPU's face-down follow-up tries are quick.
- Achievement pop-ups sit at the top of the screen, clear of every card.
- Invisible card shows itself, then the card beneath, then itself again.
- The last-card reveal turns over slowly as it grows and moves to the centre, with no hover first.
- Setup explainer for face-down follow-up matches the tap rule.
- Lower than (was Seven lower than) can sit on any card except 2 and 10, 7 by default, from the welcome card, Rules tab, codes and votes; server redeployed with it.
- The welcome card's rules line is now a button that opens the full Rules tab.
- Head to head against friends now comes from the server, so both phones show the same score; the copy on the phone is only a fallback.
- Server writes a game's result before the final view, so the game-over sheet never misses the last game.
- Live test checks head to head on the real server.

## 2026-11-22
- Live test tool updated for the face-down tap rule; server v8 deployed and live-tested.
- Face-down follow-up is now a choice: after a face-down card goes on, tap another to try it (a match goes on, a miss goes in your hand) or tap Done. Server redeployed with it.
- Card back is now a casino house back: royal blue, double gold frame, gold medallion with SH.
- New card-brand identity: S over a spade and H over a heart as a double-ended card, gold frame, spade-with-heart emblem, Bodoni wordmark; header, icon, favicon, card back and share card updated.
- Brand blue darkened to royal #152f78 across card back, icon, favicon, logo and share card.
- Original court cards restored; card faces get crisp white stock, a fine edge, bolder indices and a flat gold plate.
- Pot outline is a soft inset ring instead of a dashed box.
- Coach card copy: "Always on: 2 resets, 10 burns, ace high"; no arrow shorthand.
- Decided against light mode: table looks stay per player (felt, back, colour-blind deck).

## 2026-11-21
- Repo memory: CLAUDE.md (session routine), docs/STATE.md (live state, next steps, decisions), this changelog, `npm run status`. Old merged branches effects, setup-v2 and reactions-names deleted.
- "You is out" grammar fix in the move line.
- Server v7: "Your go!" reaction. Live test covers it.
- Merged into Shiphead: final face-down flip (heartbeat on both phones, lift, tease, slow turn, gold or red verdict, slow-motion release), quick house rules card for first-time players, pairs glow and prompt, reaction chips at big moments, head-to-head tally on the online game-over sheet, online fixes (guest losing name plates after a mid-deal resync, wait timer, leave confirm, background-tab title).
- Table polish and named haptics (tick, play, lock, bad, burn, stung, pick, boom, heartbeat, lift, turn, flipok, flipno, win, lose).
- Rebrand to Shiphead: double-ended court card logo, wordmark, icons, manifest, og image, invite texts.
- One-tap online rematch (server op `rematch`, shed_tables.next_code). Server v6.
- Edge function deploys by URL: handler built to server/build and imported from raw.githubusercontent.
- Server v5 live with the merge to main: reactions relay, invite peek, rude-name check, face-down follow-up.
- Online UX: waiting room status line and pinned Start, first-timer name box on invites, no coach card online, swap phase names who you wait for.
- Face-down follow-up house rule; online polling 450 ms while waiting; invisible card, water and achievement toast polish.
- Seven lower than and Stinger as tick rows; bigger 2-player cards; STUNG over the stung player's cards.
- First 30 seconds: play first, name only when it matters, one-tap invites. First real 2-player game, Matt and Tali.

## 2026-11-20
- Online reactions relay and clean player names.
- Achievements, invite links (WhatsApp, share, QR), quicker CPUs, reactions vs CPU.
- Setup as the start screen, dropdown rule builder, saved rules, colour rules.
- Card effects: stinger glow, STUNG flame, cold-water burn, invisible flicker.
- Loser becomes Rock Bottom. Capacitor config added.
- Renamed The Mouse Shed to Seven Lower Than. Initial import.

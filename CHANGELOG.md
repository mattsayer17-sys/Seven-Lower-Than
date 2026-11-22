# Changelog

Newest first. One line per change. Every session adds its lines here in the same commit as the work.

## 2026-11-22 (branch visuals, PR #2, not live)
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

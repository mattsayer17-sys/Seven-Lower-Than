# Shiphead: current state

The single source of truth for what is live, what is in flight and what is next. Every session reads this first and
updates it before finishing (see CLAUDE.md). History is in CHANGELOG.md.

Last updated: 22 Nov 2026 20:30

## Live
- Site: https://shiphead.vercel.app (also https://seven-lower-than.vercel.app). Every push to `main` deploys to production.
- Server: Supabase project fmgyzabdkityfyakmqhg, edge function `shed` v8 (server/build/handler-5a492bdc7dce.mjs, face-down tap rule with action `done`), imported from raw.githubusercontent at commit 9cbba20. Deployed 22 Nov 12:40; live test passed (2 games, follow-ups played, 0 resyncs).
- SQL applied: server/sql/2026-11-21-reactions-only.sql, server/sql/2026-11-21-rematch.sql.
- Vercel project prj_1CPlStcWsf3u0Hh8lLjv0CbWZW4Z, team team_L010Khha3QfqKwmIRHO0vNCb.
- Test rows from live tests are still in the database (tables QBF75, PF9H6, W4JPS, NX57H, TF5XY, BS99B, H3HC4, B4RX6 and their anonymous Test users). Deleting needs Matt to confirm in Supabase.

- Look (live 22 Nov, PR #2): royal blue #152f78; card-brand identity: S over a spade and H over a heart on a double-ended card with a double gold frame and the Shiphead suit (a spade with a heart set in it) in the centre (brand/mark.svg, brand/emblem.svg); Bodoni Moda Black for indices and wordmark, outlined. Header: white spade-and-heart + Bodoni wordmark. Favicon: the emblem. Card back: casino house back, royal blue, fine lattice, double gold frame, gold medallion with "SH" (src/ui/state.js SHIP_BACK, brand/back.svg); default 'shiphead', a saved 'red' default migrated once (settings.backV). Card faces: original court plates, crisp white stock, fine edge, bolder tabular indices, flat gold plate. Labels in sentence case, avatar in a disc, pot outline a soft inset ring. compare.js squashes case.
- Face-down follow-up (live 22 Nov, PR #4): after a face-down card goes on, the go stays open; tap another face-down card (everyone sees it turn): same rank and allowed, it goes on and you may try again; otherwise it goes into your hand and the go ends; or tap Done. Engine g.follow {pi, rank, count, last}, followDone; play and pickUp refused while open; effects apply when the go closes. CPU tries 35% of the time. Server action `done`, follow in the view, online replay of 'follow' events.
## In flight (not in main)
- Branch `lower-rank` (PR open, waiting for Matt): "Lower than" (was "Seven lower than") picks its card like Skip and Invisible, default 7, never 2 or 10. Option `lowerRank`; codes keep the short form for 7 and carry the card otherwise; votes can move it ("Move Lower than to 6s"). No card moves onto one that a rule which is on already holds. Welcome card footer is now a button that opens the full Rules tab. Engine and rules-meta changed, so the server needs redeploying when this merges (handler build dist/srv/handler-<sha>.mjs, steps below), then live-test.
- Next branch `pacing` (Matt's playtest 22 Nov): slower big pick-ups and 10 burn so the word and effect read; achievements never block play; face-down follow-up gives the player time; invisible card shows itself, pauses, shows the card beneath, then settles.

## Decisions (22 Nov)
- No light mode. Appearance choices stay per player and on their own device (felt, card back, colour-blind deck). More table themes later as cosmetics.

## Next, in order
1. Matt buys domains; connect playshiphead.com to the Vercel project, switch the invite SITE constant and og URLs.
2. Head-to-head tally on the server (from shed_results) so both phones agree. Today it is stored per device.
3. Computer players filling empty seats and replacing leavers, plus forfeits.
4. Live updates: Supabase Realtime instead of polling (CSP connect-src needs wss://fmgyzabdkityfyakmqhg.supabase.co).
5. Report/block UI (long-press a seat name; tables shed_blocks, shed_reports exist).
7. Accounts: anonymous first, Apple/Google offered at a moment of value (after the first online game).
8. Progression (XP, seasonal goals), share card, fairness signals.
9. Ads between games, cosmetics.
10. iOS wrap (Capacitor) + push + Core Haptics. Needs Matt's Apple Developer enrolment (about £79/yr UK) and a Mac or cloud build.
11. 4-player and tablet layout.

## Matt's own steps
Buy domains (playshiphead.com primary; shiphead.app, shiphead.co.uk as redirects). Trademark attorney: classes 9 and 41 in UK, EU, US (US SHIPHEAD marks exist for beer and clothing; check visual distance from Heads Up!). Apple Developer and Google Play enrolment. Real-device VoiceOver/TalkBack pass.

## Product decisions and rulings
- Brand: Shiphead. Logo: double-ended court card, SHIP court red #d4231b upright, HEAD royal blue upside down (live: #1b3d8f; branch visuals: #152f78). Wordmark Big Shoulders Display Black. Design system artifact: https://claude.ai/artifact/YZWDb14MRo5yqHdeEVfY13
- Look: dark + gold game UI on green baize, PokerStars-class finish without looking like a poker site. Crisp 2.5 px gold edges, no glows or endless pulses (exception: the final flip verdict). Buttons 10 px radius, 40 px high. Copy in sentence case, no full stops in headings, no emoji in sentences. unslop / frontend-design in polish mode only.
- First launch: no sign-in, no form, cards already dealt; the coach card shows the house rules as switches. Name only asked when going online.
- Rules: max 5 players. 2 resets, 10 burns, ace high always. Seven lower than on by default. Stinger plays on anything, only same rank or invisible follows, stingers burn on pickup. Transparent (invisible) plays on anything except a skip card. Face-down follow-up: tap to try the next face-down card after one goes on; a match goes on, a miss goes in your hand, or Done (Matt, 22 Nov; replaced the auto-turn seen only by the owner). Votes online: simple majority, host breaks ties.
- Final face-down flip: only when two players are left and the mover's only card is face-down. Heartbeat on both phones; about 4.5 s from tap to result.
- Pairs: tap one card, matching cards get a gold edge and a prompt. No badges or extra buttons.
- Online: reactions only (no free text); one-tap rematch; head to head shown on the game-over sheet.
- Loser is "Rock Bottom". Business model: free, ads, cosmetic packs, subscription after 5 online games.
- Haptics: named patterns in src/ui/audio.js. iPhone web has none (Safari has no vibration API); real haptics come with the app wrap. No paid haptics SDK needed.
- Internal names kept on purpose: __ms, daily seed 'mouse-shed-', `shed` function and tables, repo and Vercel project names.
- "shed" goes in hidden App Store keywords (Google Play bans profanity in listings).

## How to deploy the edge function
1. `node tools/build-fn.js` makes dist/srv/handler-<sha>.mjs and dist/fn/remote-index.ts.
2. Copy dist/srv/handler-<sha>.mjs into server/build/ (remove old ones), commit, push.
3. `curl https://raw.githubusercontent.com/mattsayer17-sys/seven-lower-than/<commit>/server/build/handler-<sha>.mjs | cmp - dist/srv/handler-<sha>.mjs`
4. Supabase deploy_edge_function `shed` (project fmgyzabdkityfyakmqhg, verify_jwt true) with one file index.ts = server/entry.mjs importing the handler from that commit-pinned raw.githubusercontent URL. The Supabase bundler only allows Deno's default hosts, so not vercel.app.
5. `node tools/live-test.js 2`.

## Tech notes and gotchas
- verify = lint, node tests, build, build-fn, puppeteer drivers, compare.js vs src/reference.html (REWORD maps old names and deliberate copy changes). vote-drive, onboarding-drive and compare seed 42 can fail once under load; rerun alone.
- .gitignore ignores *.png except public/ and brand/.
- Don't call a remote's poll synchronously inside makeRemote. sheets.js renames the first h2 id. Reduced-motion @media blocks are single lines. names.js must stay ASCII (the server bundle must be ASCII). Cards are positioned with the translate/rotate/scale CSS properties, so card animations must use transform.
- GitHub from Claude sessions: REST only (`gh api`), GraphQL is blocked.

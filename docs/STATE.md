# Shiphead: current state

The single source of truth for what is live, what is in flight and what is next. Every session reads this first and
updates it before finishing (see CLAUDE.md). History is in CHANGELOG.md.

Last updated: 22 Nov 2026 09:10

## Live
- Site: https://shiphead.vercel.app (also https://seven-lower-than.vercel.app). Every push to `main` deploys to production.
- Server: Supabase project fmgyzabdkityfyakmqhg, edge function `shed` v7 (server/build/handler-523c92f64c93.mjs, "Your go!" reaction). Live test passed 21 Nov 17:25.
- SQL applied: server/sql/2026-11-21-reactions-only.sql, server/sql/2026-11-21-rematch.sql.
- Vercel project prj_1CPlStcWsf3u0Hh8lLjv0CbWZW4Z, team team_L010Khha3QfqKwmIRHO0vNCb.
- Test rows from live tests are still in the database (tables QBF75, PF9H6, W4JPS, NX57H, TF5XY, BS99B and their anonymous Test users). Deleting needs Matt to confirm in Supabase.

## In flight (not in main)
- Branch `visuals` (PR #2), preview only, waiting for Matt's go:
  - Royal blue #152f78 (Matt, 22 Nov: the earlier #1b3d8f was too light; darker royal reads premium). Used on the card back, icon, favicon, logo, share card.
  - House card back (src/ui/state.js SHIP_BACK, brand/back.svg): royal blue, white lattice, white and gold frame, gold corner diamonds, small S/H card in the middle. Default 'shiphead'; a saved 'red' default migrates once (settings.backV).
  - Card faces: Matt preferred the original court plates (crown, letter, suit), so the drawn court figures were dropped. Faces get a premium finish: crisp white stock instead of the cream tint, a fine edge, bolder tabular indices, flat gold plate.
  - Logo redrawn symmetric; small S/H mark (brand/mark-small.svg) for header and favicon (Matt likes "SH"); new icon PNGs; og.png: fanned house backs, Inter Tight.
  - Whole-screen pass: all labels sentence case; header avatar in a disc; pot outline solid and inset instead of dashed; coach card copy without middots or arrows.
  - compare.js squashes case; onboarding-drive expects the new "Always on" line.
  - When merged: update the design system artifact (royal blue, back, small mark, symmetric logo).
- Decision 22 Nov: no light mode. Appearance choices stay per player and on their own device (felt, card back, colour-blind deck). More table themes later as cosmetics.

## Next, in order
1. Matt reviews the visuals preview; merge `visuals` when he says, then update the design system.
2. Matt buys domains; connect playshiphead.com to the Vercel project, switch the invite SITE constant and og URLs.
3. Head-to-head tally on the server (from shed_results) so both phones agree. Today it is stored per device.
4. Computer players filling empty seats and replacing leavers, plus forfeits.
5. Live updates: Supabase Realtime instead of polling (CSP connect-src needs wss://fmgyzabdkityfyakmqhg.supabase.co).
6. Report/block UI (long-press a seat name; tables shed_blocks, shed_reports exist).
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
- Rules: max 5 players. 2 resets, 10 burns, ace high always. Seven lower than on by default. Stinger plays on anything, only same rank or invisible follows, stingers burn on pickup. Transparent (invisible) plays on anything except a skip card. Face-down follow-up auto-plays matches, only the owner sees the turned card. Votes online: simple majority, host breaks ties.
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

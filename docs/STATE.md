# Shiphead: current state

The single source of truth for what is live, what is in flight and what is next. Every session reads this first and
updates it before finishing (see CLAUDE.md). History is in CHANGELOG.md.

Last updated: 24 Nov 2026 21:00

## Live
- Site: https://shiphead.vercel.app (also https://seven-lower-than.vercel.app). Every push to `main` deploys to production.
- Server: Supabase project fmgyzabdkityfyakmqhg (London, eu-west-2), edge function `shed` v12 (server/build/handler-2bab0853e10e.mjs, pinned at commit f179e96 on branch `ios`, PRs waiting for Matt). v11 added rate limits, open-table caps, `delete_me`, `block`/`unblock`/`report`; v12 adds `push_token` and APNs sending on deal and rematch (inactive until the APNS_* secrets are set). Deployed and live-tested 24 Nov. Backwards compatible with the live site (new ops only; limits sit well above normal play).
- SQL applied: server/sql/2026-11-21-reactions-only.sql, server/sql/2026-11-21-rematch.sql, server/sql/2026-11-24-protection.sql (shed_hits + shed_hit(), profile writes server-only, cascading deletes, reports with target/code/name_seen, pg_cron `shed-cleanup` hourly at :17), server/sql/2026-11-24-push.sql (shed_push device tokens).
- Vercel project prj_1CPlStcWsf3u0Hh8lLjv0CbWZW4Z, team team_L010Khha3QfqKwmIRHO0vNCb.
- Old live-test rows deleted 24 Nov (Matt said yes): 51 Test users, 20 tables. live-test.js now deletes its own users at the end with `delete_me`.

- Look (live 22 Nov, PR #2): royal blue #152f78; card-brand identity: S over a spade and H over a heart on a double-ended card with a double gold frame and the Shiphead suit (a spade with a heart set in it) in the centre (brand/mark.svg, brand/emblem.svg); Bodoni Moda Black for indices and wordmark, outlined. Header: white spade-and-heart + Bodoni wordmark. Favicon: the emblem. Card back: casino house back, royal blue, fine lattice, double gold frame, gold medallion with "SH" (src/ui/state.js SHIP_BACK, brand/back.svg); default 'shiphead', a saved 'red' default migrated once (settings.backV). Card faces: original court plates, crisp white stock, fine edge, bolder tabular indices, flat gold plate. Labels in sentence case, avatar in a disc, pot outline a soft inset ring. compare.js squashes case.
- Face-down follow-up (live 22 Nov, PR #4): after a face-down card goes on, the go stays open; tap another face-down card (everyone sees it turn): same rank and allowed, it goes on and you may try again; otherwise it goes into your hand and the go ends; or tap Done. Engine g.follow {pi, rank, count, last}, followDone; play and pickUp refused while open; effects apply when the go closes. CPU tries 35% of the time. Server action `done`, follow in the view, online replay of 'follow' events.
- Head to head (live 23 Nov, PR #6): counted on the server from shed_results, so both phones agree; the phone syncs on the game-over sheet and when the profile opens. Limit: several local profiles on one phone share one online record until accounts.
- Lower than (live 23 Nov, PR #7): "Lower than" (was "Seven lower than") picks its card like Skip and Invisible, default 7, never 2 or 10. Option `lowerRank`; codes keep the short form for 7 and carry the card otherwise; votes can move it ("Move Lower than to 6s"). No card moves onto one that a rule which is on already holds. Welcome card footer is a button that opens the full Rules tab.
- Pacing (live 23 Nov, PR #8, Matt's playtest 22 Nov): effects run 1.4x longer on Normal (Fast 0.7x); the table waits for a burn (2.2 s), pick-ups (1.3 s, 2.6 s for 10+ with the OUCH) and forced pick-ups; a CPU's face-down follow-up try is quick (0.65 s on a match); achievement toast sits at the top, clear of cards; invisible card lands showing itself, goes see-through to show the card beneath, then back; last-card reveal is one move, turning over slowly while it grows to the centre (about 3.3 s). "Invisible card" is the name everywhere (was "Transparent card" in the Rules tab and votes).

## In flight (not in main)
- `protection` (PR open, waiting for Matt): abuse and cost protection, Delete my data in the profile, press and hold a name online to block or report, /privacy /terms /support pages, Turnstile hook (off until the site key is set in src/online-config.js), CSP allows Turnstile and Realtime wss. Server side is already live (v11 + SQL).
- `ios` (PR on top of `protection`, waiting for Matt): Capacitor 8 iOS project in ios/ (Swift Package Manager, no CocoaPods; iPhone only, portrait, iOS 16+), brand icon and splash, PrivacyInfo.xcprivacy, entitlements (push, associated domains, App Attest), src/ui/native.js (status bar, splash, invite links into the lobby, push opt-in after the first online game, notification taps open the table), APNs sender in server/entry.mjs, codemagic.yaml (tag `ios-*` builds and uploads to TestFlight), public/.well-known/apple-app-site-association (TEAMID placeholder). `npm run ios` builds and copies the web app into the iOS project.

## Decisions (22 Nov)
- No light mode. Appearance choices stay per player and on their own device (felt, card back, colour-blind deck). More table themes later as cosmetics.

## Next, in order
0. Abuse and cost protection: done in `protection` except the parts that need Matt: Supabase spend cap + Pro plan, Vercel spend management, Turnstile site key (then set `turnstile` in src/online-config.js and switch captcha on in Supabase Auth with the secret). App Attest comes with the iOS wrap.
   Limits (server/handler.js LIMITS): 120 requests/min per user, 600/min per network, 20 new tables/hour, 60 joins/hour, 10 reports/hour; max 3 hosted open tables, 8 unfinished seats.
   Reports land in public.shed_reports (reporter, target, name_seen, reason, code). Someone must read them: the policy pages promise a person does. Next: a daily email of new reports to Matt.
1. Matt buys domains; connect playshiphead.com to the Vercel project, switch the invite SITE constant and og URLs.
2. Head-to-head tally on the server: live 23 Nov (PR #6). Server request `h2h` {with:[uids]} gives {n,w,l,meRb,theyRb} per opponent from shed_results; the phone syncs on the game-over sheet and profile.
3. Computer players filling empty seats and replacing leavers, plus forfeits.
4. Live updates: Supabase Realtime instead of polling (CSP connect-src needs wss://fmgyzabdkityfyakmqhg.supabase.co).
5. Report/block UI: done in `protection` (press and hold an opponent's name at an online table).
7. Accounts: anonymous first, Apple/Google offered at a moment of value (after the first online game).
8. Progression (XP, seasonal goals), share card, fairness signals.
9. Ads between games, cosmetics.
10. iOS wrap: built in `ios`. To ship: Matt's Apple Developer account; then (Claude) put the Team ID into apple-app-site-association, create the APNs key secrets (APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID, APNS_TOPIC=com.playshiphead.app) in Supabase, connect Codemagic, push tag ios-0.1.0 for the first TestFlight build. Haptics already call Capacitor Haptics (src/ui/audio.js). App Attest needs a small native plugin (next). Push for "your go" when someone is away is next after Realtime.
11. 4-player and tablet layout.

## Matt's own steps
Contact address on the policy pages is hello@playshiphead.com (tools/legal-pages.js), so it needs the domain and a mailbox or forward. Buy domains (playshiphead.com primary; shiphead.app, shiphead.co.uk as redirects). Trademark attorney: classes 9 and 41 in UK, EU, US (US SHIPHEAD marks exist for beer and clothing; check visual distance from Heads Up!). Apple Developer and Google Play enrolment. Real-device VoiceOver/TalkBack pass.

## Product decisions and rulings
- Brand: Shiphead. Logo: double-ended court card, SHIP court red #d4231b upright, HEAD royal blue upside down (live: #1b3d8f; branch visuals: #152f78). Wordmark Big Shoulders Display Black. Design system artifact: https://claude.ai/artifact/YZWDb14MRo5yqHdeEVfY13
- Look: dark + gold game UI on green baize, PokerStars-class finish without looking like a poker site. Crisp 2.5 px gold edges, no glows or endless pulses (exception: the final flip verdict). Buttons 10 px radius, 40 px high. Copy in sentence case, no full stops in headings, no emoji in sentences. unslop / frontend-design in polish mode only.
- First launch: no sign-in, no form, cards already dealt; the coach card shows the house rules as switches. Name only asked when going online.
- Rules: max 5 players. 2 resets, 10 burns, ace high always. Lower than on by default, on 7, card can be changed. Stinger plays on anything, only same rank or invisible follows, stingers burn on pickup. Transparent (invisible) plays on anything except a skip card. Face-down follow-up: tap to try the next face-down card after one goes on; a match goes on, a miss goes in your hand, or Done (Matt, 22 Nov; replaced the auto-turn seen only by the owner). Votes online: simple majority, host breaks ties.
- Final face-down flip: only when two players are left and the mover's only card is face-down. Heartbeat on both phones; about 3.3 s from tap to result, one move: turns over while it grows to the centre.
- Pairs: tap one card, matching cards get a gold edge and a prompt. No badges or extra buttons.
- Online: reactions only (no free text); one-tap rematch; head to head shown on the game-over sheet, counted on the server so both phones agree.
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

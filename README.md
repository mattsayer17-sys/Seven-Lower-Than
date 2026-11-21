# Shiphead

Source for the single-file game. `npm run build` bundles everything into `dist/index.html`. Vercel runs `npm run build:min` on every push to `main` and serves `dist/` at https://shiphead.vercel.app (the old https://seven-lower-than.vercel.app still works; playshiphead.com to follow). The same file gets wrapped for iOS.

## Layout

| Path | What it is |
| --- | --- |
| `src/engine.js` | Pure game logic. No DOM. Every rank rule comes from the ruleset (no hard-coded ranks). |
| `src/ui/state.js` | `store`: the one object modules share and reassign (`store.game`, `store.ui`, `store.settings`, ...). Also settings, saving, felt and card back. |
| `src/ui/dom.js` | `$`, the table element, `esc`. |
| `src/ui/render.js` | Layout maths and `render()`. |
| `src/ui/flow.js` | New game, turn flow, CPU turns, event descriptions. |
| `src/ui/input.js` | Tap, drag and the action buttons. |
| `src/ui/cards.js`, `fx.js`, `audio.js` | Card drawing, effects, sound and haptics. |
| `src/ui/profile.js`, `daily.js` | Profiles, records, achievements, daily deal. |
| `src/ui/setup.js`, `sheets.js`, `header.js` | Setup sheet, other sheets, header buttons. |
| `src/ui/tour.js`, `chat.js` | How-to walkthrough, chat. |
| `src/ui/main.js` | Start-up order and the `window.__ms` debug hooks. |
| `src/styles.css`, `src/index.template.html` | Styles and page shell. |
| `src/reference.html` | The artifact as it was before the split (version 1795098699-9272). The reference for `compare`. |

## Commands

- `npm test` runs the engine tests (rules, play, 375 full CPU games per rule check).
- `npm run lint` catches undefined names across modules.
- `npm run build` writes `dist/index.html` (`build:min` minifies).
- `npm run verify` does all of the above, then plays the reference build and the current build through the same scripted session in headless Chrome (needs `/usr/bin/google-chrome`) and fails on any difference or page error.
- `tools/split.js` is the one-off codemod that produced `src/ui` from the original. Not needed again.

## Rules for changing it

- Never compare a rank to a literal in the engine. Put it in the ruleset. A test enforces this.
- New shared mutable state goes on `store`, not in a module-level `let`.
- Sheets that need `onchange` / `onclick` on `#modal` assign them (they are cleared whenever a sheet opens or closes). Do not `addEventListener` on `#modal`.

## Rules presets, share codes, accessibility

- `src/presets.js`: ready-made house rules and `H1-...` share codes. Decoding rebuilds the rules through `rules-meta`, so a code can never carry rules a vote would refuse.
- `src/a11y.js`: what a screen reader is told. Pure, and it only ever names cards the player can see.
- `src/ui/access.js`: the hidden `#sr` mirror (table summary plus one button per reachable card). The cards on the felt are `aria-hidden`.
- `tools/vote-drive.js`, `tools/presets-drive.js`, `tools/a11y-drive.js`: headless browser checks. `npm run verify` runs all of them.

## Online play

Server (Supabase project "shed", edge function `shed`): `server/handler.js` holds all the logic (profile, create, join, leave, start, act) and runs unchanged against an in-memory database in tests (`server/fakedb.js`). `server/entry.mjs` is the Deno wrapper. `node tools/build-fn.js` bundles everything, the shared engine included, into `dist/fn/index.ts` for deploying. Each seat only ever reads its own row in `shed_views`, which holds that seat's redacted picture of the table. `shed_games` (the real state) is server only.

Client: `src/online.js` turns a view into a game the UI can draw (you are always seat 0, unseen cards are placeholders), keeps a shadow game in step by replaying each opponent move through the same engine calls solo play uses, and falls back to a resync if the shadow ever disagrees with the server. `src/net.js` is the fetch transport (anonymous sign-in, function calls, own-row reads). `src/ui/online.js` is the lobby and the live game. `src/online-config.js` holds the project URL and public key.

Tests: `test/server.test.js` (handler, hidden cards, whole games), `test/online.test.js` (shadows follow every move with no resync), `test/net.test.js`, and `tools/online-drive.js` (the real page against bots, including a mid-game reload). With network: `node tools/live-test.js 3` plays real games against the deployed function and `node tools/live-rls.js` checks what a stranger can and cannot read or do. Both create throwaway anonymous users and tables, so clean up afterwards.

Not yet in the deployed function: the `stalemate` flag in views (added to `server/table.js`). Redeploy `dist/fn/index.ts` to pick it up.

## Hosting (Vercel)

The Vercel project is `seven-lower-than` (team mattsayer17-5269s-projects). It builds the single page from source with `npm ci && node tools/build.js --minify` and serves `dist/`.
`vercel.json` sets the security headers: a content security policy that only lets the page talk to its own origin and the Supabase project, no framing, no sniffing, HSTS, and a locked-down permissions policy.
To go live from git: push this folder to a GitHub repo, then in Vercel open the project, Settings, Git, Connect, and pick the repo. Every push to `main` then deploys to production and every other branch gets a preview URL.
The edge function in `server/` is deployed to Supabase separately (`node tools/build-fn.js` makes `dist/fn/index.ts`).

## Brand

Name: Shiphead. Design system (source of truth): https://claude.ai/artifact/YZWDb14MRo5yqHdeEVfY13
Mark: a double-ended court card. SHIP in court red the right way up, HEAD in court blue upside down, ink frame and divider, white card. Wordmark "Shiphead" in Big Shoulders Display Black, sentence case, outlined (no font loaded at runtime). Flat court-card inks only.
Files in `brand/`: icon.svg (store icon, full bleed), mark.svg (card), favicon.svg, wordmark-white.svg, wordmark-black.svg, icon-1024.png. `public/` is copied into `dist/` by the build: apple-touch-icon, manifest icons, og.png share card.
Colours: court blue #1b3d8f (brand ground), card white #ffffff, court red #d4231b, court yellow #f0b323, ink #000000. Game UI keeps its green felt and brass buttons for now.
Internal keys (`__ms`, daily seed `mouse-shed-`, the `shed` function and tables) keep their old names on purpose so saved data and links keep working.

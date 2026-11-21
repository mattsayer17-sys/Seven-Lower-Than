# Shiphead: how to work in this repo

This file is read automatically by Claude at the start of every session in this repo. Matt runs several chats at once,
so the repo, not any chat, is the memory. Follow the routine below every time.

## Start of every session (before building anything)
1. `git fetch origin` and work from the latest `main`.
2. Read `docs/STATE.md` (what is live, what is in flight, what is next, decisions made).
3. Run `npm run status`. It lists branches not yet in main, open pull requests and the live versions.
   If anything is unmerged or another session has an open PR, say so to Matt before starting, and don't touch that work.
4. `npm install`, then `npm run verify` if you are going to change code (exit 0, about 6 minutes).

## While working
- One branch per piece of work, named for it (`visuals`, `h2h-server`), cut from the latest main.
- Open a pull request early (REST: `gh api repos/mattsayer17-sys/seven-lower-than/pulls -f title=... -f head=<branch> -f base=main -f body=...`).
  Every branch gets a Vercel preview: https://seven-lower-than-git-<branch>-mattsayer17-5269s-projects.vercel.app (protected; make a share link with Vercel get_access_to_vercel_url).
- Another session may push at the same time: fetch before pushing, rebase on main rather than overwrite, never force-push main.

## End of every session (in the same commit as the work, or the last commit of the PR)
1. Update `docs/STATE.md`: live state, what changed, what is in flight, next steps, any new decision or ruling.
2. Add dated lines to `CHANGELOG.md` (newest at the top, one line per change, plain English).
3. Merge to main only when Matt has said so (main deploys straight to production). Otherwise leave the PR open and say it is waiting for him.
4. If the server handler changed, deploy it (steps in `docs/STATE.md`) and run `node tools/live-test.js 2`.
5. Delete the branch once merged.

## Working rules (Matt)
- Start every reply with "Matt". Answer first, short, no filler or hedging, no em dashes, no AI-sounding writing.
- Matt brings ideas; sense-check them and turn them into professional practice. Offer a concrete fix whenever there is a blocker.
- Do not bring up the legal clauses in his Bacardi contract. Do not mention memory.
- Check the work before reporting it done: run the tests, look at screenshots, record clips for visual changes.

## Code map
- Shared CommonJS (Node and browser): src/engine.js, rules-meta, vote, room, table, presets, a11y, online, net, reactions, names.
- UI: src/ui (ES modules, bundled by tools/build.js into dist/index.html). Styles: src/styles.css. Template: src/index.template.html.
- Server: server/handler.js (Supabase edge function `shed`), server/table.js, server/sql/*.sql, server/build/ (built handler the function imports).
- Tests: test/*.test.js (node), tools/*-drive.js (puppeteer), tools/compare.js (behaviour vs src/reference.html), tools/live-test.js (real server).

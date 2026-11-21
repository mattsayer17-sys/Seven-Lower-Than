Built server handler, committed so the edge function can import it from raw.githubusercontent.com
(the Supabase bundler only allows imports from Deno's default hosts). Made by `node tools/build-fn.js` (dist/srv).
Deploy: copy dist/srv/handler-<sha>.mjs here, commit and push, then deploy the edge function `shed` with
dist/fn/remote-index.ts, its import URL pointing at
https://raw.githubusercontent.com/mattsayer17-sys/seven-lower-than/<commit>/server/build/handler-<sha>.mjs

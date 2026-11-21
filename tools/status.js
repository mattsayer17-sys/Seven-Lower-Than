// npm run status: what a new session needs to know before touching anything.
// Branches not yet in main, open pull requests, what main and the server are running, and whether STATE.md is fresh.
const { execSync } = require('child_process');
const fs = require('fs');
const sh = c => { try { return execSync(c, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { return ''; } };
const REPO = 'mattsayer17-sys/seven-lower-than';

sh('git fetch -q origin');
const heads = sh('git ls-remote --heads origin').split('\n').filter(Boolean).map(l => l.split('\trefs/heads/')[1]);
console.log('main: ' + (sh('git log -1 --format="%h %ad %s" --date=format:"%d %b %H:%M" origin/main') || 'unknown'));

console.log('\nBranches not in main:');
let open = 0;
for (const b of heads.filter(h => h !== 'main')) {
  sh('git fetch -q --depth=200 origin +refs/heads/' + b + ':refs/remotes/origin/' + b);
  const ahead = sh('git rev-list --count origin/main..origin/' + b);
  // a squash-merged branch still has its own commits, but git cherry sees their changes already in main
  const unmerged = sh('git cherry origin/main origin/' + b).split('\n').filter(l => l.startsWith('+')).length;
  if (ahead && ahead !== '0' && unmerged) {
    open++;
    console.log('  ' + b + ': ' + ahead + ' commit(s) ahead, last ' + sh('git log -1 --format="%ad %s" --date=format:"%d %b %H:%M" origin/' + b));
  } else console.log('  ' + b + ': already in main (safe to delete)');
}
if (!open) console.log('  none');

console.log('\nOpen pull requests:');
const prs = sh('gh api repos/' + REPO + '/pulls --jq ".[] | \\"  #\\(.number) \\(.head.ref): \\(.title)\\""');
console.log(prs || '  none (or GitHub not reachable)');

const build = fs.existsSync('server/build') ? fs.readdirSync('server/build').filter(f => f.endsWith('.mjs')) : [];
console.log('\nServer handler builds in repo: ' + (build.join(', ') || 'none') + '  (the live one is named in docs/STATE.md)');

const st = sh('git log -1 --format="%ad" --date=format:"%d %b %H:%M" origin/main -- docs/STATE.md');
const code = sh('git log -1 --format="%ad" --date=format:"%d %b %H:%M" origin/main -- src server');
console.log('\ndocs/STATE.md last changed: ' + (st || 'never') + '; code last changed: ' + (code || 'unknown'));
if (st && code && sh('git log -1 --format=%ct origin/main -- docs/STATE.md') < sh('git log -1 --format=%ct origin/main -- src server')) {
  console.log('WARNING: code changed after STATE.md. Read the recent commits too: git log --oneline -15 origin/main');
}

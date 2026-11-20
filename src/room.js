'use strict';
// The table before the game starts: who is here, the current house rules, and at most one open vote.
// A reducer, so it can run on any host: reduce(state, action, now) -> { state, events }.
// Today the host is this device (see ui/vote.js). Online, the same reducer runs on whoever hosts and every
// seat sends it actions and renders the state it sends back.
const Vote = require('./vote.js');
const Meta = require('./rules-meta.js');

const VOTE_MS = 30000;

function createRoom({ hostId, players, opts, voteMs }) {
  return { hostId, players: players.map(p => ({ id: p.id, name: p.name })), opts: JSON.parse(JSON.stringify(opts || {})), vote: null, voteSeq: 0, voteMs: voteMs || VOTE_MS, started: false, closed: false };
}

const nameOf = (s, id) => { const p = s.players.find(x => x.id === id); return p ? p.name : 'Someone'; };
const reject = (s, reason) => ({ state: s, events: [{ type: 'rejected', reason }] });

// A vote just ended. Apply it if it passed and still makes sense against the rules as they are now.
function settle(s, vote) {
  let opts = s.opts, applied = false, why = null;
  if (vote.status === 'passed') {
    const r = Meta.applyChange(s.opts, vote.change);
    if (r.ok) { opts = r.opts; applied = true; } else why = r.error;
  }
  const what = Meta.describeChange(vote.change, s.opts);
  const how = vote.by === 'host' ? ' (host broke the tie)' : vote.by === 'deadline' ? ' (time ran out)' : vote.by === 'withdrawn' ? '' : '';
  const text = vote.status === 'passed' ? (applied ? 'Passed: ' + what + how : 'Passed, but it no longer fits: ' + why)
    : vote.status === 'cancelled' ? 'Withdrawn: ' + what
    : 'Voted down: ' + what + how;
  return { state: Object.assign({}, s, { opts, vote: null }), events: [{ type: 'result', vote, applied, text }] };
}

function reduce(s, a, now) {
  if (s.closed) return reject(s, 'the table is closed');
  switch (a.type) {
    case 'propose': {
      if (s.started) return reject(s, 'the game has started');
      if (!s.players.some(p => p.id === a.by)) return reject(s, 'you are not at this table');
      if (s.vote) return reject(s, 'a vote is already open');
      const ok = Meta.applyChange(s.opts, a.change);
      if (!ok.ok) return reject(s, ok.error);
      const seq = s.voteSeq + 1;
      const vote = Object.assign(Vote.open({ id: seq, proposer: a.by, change: a.change, voters: s.players.map(p => p.id), hostId: s.hostId }), { deadline: (now || 0) + s.voteMs, text: Meta.describeChange(a.change, s.opts) });
      const ns = Object.assign({}, s, { voteSeq: seq, vote });
      const ev = { type: 'proposed', vote, text: nameOf(s, a.by) + ' proposes: ' + vote.text };
      if (vote.status === 'open') return { state: ns, events: [ev] };
      const r = settle(ns, vote);
      return { state: r.state, events: [ev].concat(r.events) };
    }
    case 'vote': {
      if (!s.vote) return reject(s, 'there is no open vote');
      const v = Vote.cast(s.vote, a.by, a.choice);
      if (v === s.vote) return reject(s, 'that vote was not counted');
      const keep = Object.assign({}, v, { deadline: s.vote.deadline, text: s.vote.text });
      if (v.status === 'open') return { state: Object.assign({}, s, { vote: keep }), events: [{ type: 'voted', vote: keep, by: a.by, text: nameOf(s, a.by) + ' voted ' + a.choice }] };
      const r = settle(Object.assign({}, s, { vote: keep }), keep);
      return { state: r.state, events: [{ type: 'voted', vote: keep, by: a.by, text: nameOf(s, a.by) + ' voted ' + a.choice }].concat(r.events) };
    }
    case 'cancel': {
      if (!s.vote) return reject(s, 'there is no open vote');
      const v = Vote.cancel(s.vote, a.by);
      if (v === s.vote) return reject(s, 'only the proposer or the host can withdraw it');
      return settle(s, Object.assign({}, v, { text: s.vote.text }));
    }
    case 'leave': {
      if (!s.players.some(p => p.id === a.by)) return { state: s, events: [] };
      const players = s.players.filter(p => p.id !== a.by);
      if (!players.length) return { state: Object.assign({}, s, { players, vote: null, closed: true }), events: [{ type: 'closed' }] };
      const hostId = s.hostId === a.by ? players[0].id : s.hostId;
      const events = [{ type: 'left', by: a.by, text: nameOf(s, a.by) + ' left' }];
      if (hostId !== s.hostId) events.push({ type: 'host', hostId, text: players[0].name + ' is now the host' });
      let ns = Object.assign({}, s, { players, hostId });
      if (s.vote) {
        let v = Vote.dropVoter(Object.assign({}, s.vote, { hostId }), a.by);
        if (v.hostId !== hostId) v = Object.assign({}, v, { hostId });
        v = Object.assign({}, v, { deadline: s.vote.deadline, text: s.vote.text });
        if (v.status === 'open') ns = Object.assign({}, ns, { vote: v });
        else { const r = settle(Object.assign({}, ns, { vote: v }), v); return { state: r.state, events: events.concat(r.events) }; }
      }
      return { state: ns, events };
    }
    case 'tick': {
      if (!s.vote || (a.now != null ? a.now : now) < s.vote.deadline) return { state: s, events: [] };
      const v = Object.assign({}, Vote.expire(s.vote), { deadline: s.vote.deadline, text: s.vote.text });
      return settle(Object.assign({}, s, { vote: v }), v);
    }
    case 'start': {
      if (a.by !== s.hostId) return reject(s, 'only the host can start');
      if (s.vote) return reject(s, 'finish the vote first');
      return { state: Object.assign({}, s, { started: true }), events: [{ type: 'started', opts: s.opts }] };
    }
    default:
      return reject(s, 'unknown action');
  }
}

module.exports = { createRoom, reduce, VOTE_MS };

'use strict';
// A house-rule vote. Simple majority of the people at the table. If it is a tie, the host's vote decides.
// Pure and transport-free: whoever hosts the table (this device today, a server later) runs these functions and
// sends the resulting vote object to everyone. Nothing here touches the clock; pass `final: true` when time is up.

// voters: ids of the humans who may vote. Bots never vote. The proposer's own vote is a yes.
function open({ id, proposer, change, voters, hostId }) {
  const list = Array.from(new Set(voters));
  const v = { id, proposer, change, voters: list, hostId, votes: {}, status: 'open', by: null };
  if (list.includes(proposer)) v.votes[proposer] = 'yes';
  return resolve(v, false);
}

function tally(v) {
  let yes = 0, no = 0;
  for (const id of v.voters) { if (v.votes[id] === 'yes') yes++; else if (v.votes[id] === 'no') no++; }
  return { yes, no, total: v.voters.length, pending: v.voters.length - yes - no };
}

// Decide if the vote is over. `final` means time ran out, so people who have not voted are abstentions.
function resolve(v, final) {
  if (v.status !== 'open') return v;
  const t = tally(v);
  const done = (status, by) => Object.assign({}, v, { status, by });
  if (t.total === 0) return done('cancelled', null);
  if (t.yes * 2 > t.total) return done('passed', 'majority');
  if (t.no * 2 > t.total) return done('failed', 'majority');
  if (t.pending === 0 || final) {
    if (t.yes > t.no) return done('passed', 'deadline');
    if (t.no > t.yes) return done('failed', 'deadline');
    // dead heat: the host's vote decides. A host who did not vote counts as a no (nothing changes).
    return done(v.votes[v.hostId] === 'yes' ? 'passed' : 'failed', 'host');
  }
  return v;
}

// One vote each, and no changing your mind. Anything that is not allowed returns the vote untouched.
function cast(v, voter, choice) {
  if (v.status !== 'open' || !v.voters.includes(voter) || v.votes[voter] || (choice !== 'yes' && choice !== 'no')) return v;
  return resolve(Object.assign({}, v, { votes: Object.assign({}, v.votes, { [voter]: choice }) }), false);
}

// Someone left or lost connection. They stop counting.
function dropVoter(v, voter) {
  if (v.status !== 'open' || !v.voters.includes(voter)) return v;
  const votes = Object.assign({}, v.votes); delete votes[voter];
  return resolve(Object.assign({}, v, { voters: v.voters.filter(x => x !== voter), votes }), false);
}

function expire(v) { return resolve(v, true); }

// The proposer or the host can pull it while it is open.
function cancel(v, by) {
  if (v.status !== 'open' || (by !== v.proposer && by !== v.hostId)) return v;
  return Object.assign({}, v, { status: 'cancelled', by: 'withdrawn' });
}

module.exports = { open, cast, tally, dropVoter, expire, cancel };

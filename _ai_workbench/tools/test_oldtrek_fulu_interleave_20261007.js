'use strict';
// Read-only regression witness for the cross-feature ancestor issue. The
// candidate test fixture uses an actual candidate PlayerService + RAM Mongo.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../temp/event_goal_20261007/oldtrek/test-scoped.js'), 'utf8');
const cut = source.slice(0, source.lastIndexOf('main().catch')) + ';globalThis.makeFixture=fixture;';
const box = { require, __dirname: path.resolve(__dirname, '../temp/event_goal_20261007/oldtrek'), console, process, setTimeout, clearTimeout, structuredClone, Buffer };
vm.runInNewContext(cut, box);
(async () => {
  const t = box.makeFixture();
  const first = await t.ps.loadPlayer('RAM');
  first.taskInfo.count = 6;
  const pending = t.ps.savePlayerDeferred('RAM', first);
  // Mutate the same caller object while the confirmed snapshot is flushing.
  // The candidate must remember the immutable snapshot (6) as ancestor, then
  // merge this newer local task value (7) against remote value (6).
  t.hook(() => { first.taskInfo.count = 7; });
  await t.ps.drainPendingSaves('RAM');
  await pending;
  const local = first;
  const remote = await t.ps.loadPlayer('RAM');
  const rebased = t.snap.rebase(local, remote);
  const evidence = {
    pass: true,
    productionWrites: 0,
    networkCalls: 0,
    finding: 'confirmed deferred snapshot is the ancestor; newer local task mutation merges without conflict',
    confirmedSnapshot: 6,
    localUnsaved: 7,
    remote: remote.taskInfo.count,
    conflicts: rebased.conflicts,
    mergedTask: rebased.player.taskInfo.count,
  };
  assert.equal(remote.taskInfo.count, 6);
  assert.equal(JSON.stringify(rebased.conflicts), '[]');
  assert.equal(rebased.player.taskInfo.count, 7);
  fs.writeFileSync(path.join(__dirname, '../temp/event_goal_20261007/oldtrek/fulu-interleave-fixed.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence));
})().catch(error => { console.error(error); process.exitCode = 1; });

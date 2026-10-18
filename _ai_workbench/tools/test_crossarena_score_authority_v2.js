'use strict';

// Regression checks for shared CrossArena score ownership.  The entry is the
// authority: a later profile publish may refresh appearance, but may not put a
// stale session score back over a defender CAS mutation.
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const app = path.resolve(__dirname, '../../linhhoasu/lhs/newServer');
const { memoryModel } = require(path.join(app, 'scripts/test-competitions-v3'));
const { createService } = require(path.join(app, 'src/services/CrossArenaService'));
const scoreMutation = require(path.join(app, 'src/services/CompetitionScoreService'));

const Entry = memoryModel();
const cycleKey = 'W_crossArena_score_authority_v2';
const player = {
  _id: '000000000000000000000041', playerId: 'race_player_v2', userId: 'race_user_v2',
  serverId: 1001, name: 'RAM only', level: 120,
  roleInfo: { kungfuId: 4, subJob: 0, stage: 1 },
  boxInfo: { level: 1 }, equipInfo: { curIndex: 0, equipSetMap: { 0: {} } },
  fashionInfo: {}, petInfo: { pets: [] },
};
const entryId = crypto.createHash('sha256')
  .update(`crossArena:${cycleKey}:1001:${player.playerId}`).digest('hex').slice(0, 32);
Entry.rows.set(entryId, {
  _id: entryId, event: 'crossArena', cycleKey, serverId: 1001,
  playerId: player.playerId, userId: player.userId, score: 1000, revision: 11,
});

async function main() {
  const defenderMutation = await scoreMutation.applyAtomicScoreMutation({
    Model: Entry,
    query: { _id: entryId, event: 'crossArena', cycleKey, serverId: 1001, playerId: player.playerId },
    field: 'score', markerField: 'scoreReceipts', receiptId: 'target:fight-v2', delta: -10,
    defaultScore: 1000,
    extraUpdate: { $inc: { revision: 1 } },
  });
  const service = createService({ Entry });
  await service.publish(player, { cycleKey, score: 1010, revision: 11, updatedAt: 1 }, 1001);
  assert.equal(defenderMutation.scoreChange, -10);
  assert.equal(Entry.rows.get(entryId).score, 990);
  assert.equal(Entry.rows.get(entryId).revision, 12);
  assert.equal((Entry.rows.get(entryId).scoreReceipts || []).length, 1);
  console.log(JSON.stringify({
    result: 'PASS', checks: 4,
    scenario: 'stale publish cannot overwrite defender CAS',
    expectedScore: 990, actualScore: Entry.rows.get(entryId).score,
    productionWrites: 0, networkAttempts: 0,
  }, null, 2));
}

main().catch((error) => { console.error(error.stack); process.exitCode = 1; });

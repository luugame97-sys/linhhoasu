'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const root = process.env.APP_ROOT || path.resolve(__dirname, '..', '..', 'linhhoasu', 'lhs', 'newServer');
const config = require(path.join(root, 'src', 'services', 'ConfigService'));
const drops = require(process.env.SERVICE_PATH || path.join(root, 'src', 'services', 'AlchemyMaterialDropService'));
const tables = config.loadAllTables();

assert.equal(drops.policy.enabled, true, 'normal-map material source must remain enabled');
assert.equal(drops.policy.currentTierWeightBps, 10000, 'legacy-tier randomization must be disabled');
const current = { roleInfo: { stage: 45 }, systemUnlockInfo: { unlockedSystem: [304] } };
assert.equal(drops.currentTier(current), 15);
let triggerCalls = 0;
assert.deepEqual(
  drops.roll(current, 1, { kind: 'normal', valid: true, mapId: 10001 }, () => {
    triggerCalls += 1;
    return 0;
  }),
  [{ id: 2015, count: 1 }, { id: 2215, count: 1 }],
);
assert.equal(triggerCalls, 2, 'current-tier mode must use one trigger roll per group');
const rngValues = [0.9999, 0.9999];
assert.deepEqual(
  drops.roll(current, 1, { kind: 'normal', valid: true, mapId: 10001 }, () => {
    const value = rngValues.shift();
    return value == null ? 0.5 : value;
  }),
  [],
  'a failed material trigger must not consume a tier roll',
);
for (let tier = 1; tier <= 15; tier += 1) {
  const player = { roleInfo: { stage: tier * 3 - 2 } };
  const values = drops.roll(player, 1, { kind: 'normal', valid: true, mapId: 10001 }, () => 0);
  assert.deepEqual(values, [{ id: 2000 + tier, count: 1 }, { id: 2200 + tier, count: 1 }]);
}

const taskReward = (tables.TaskConfig && tables.TaskConfig[10050] && tables.TaskConfig[10050].reward) || [];
assert.ok(taskReward.some((row) => Number(row.id) === 2001), 'configured task source 2001 missing');
assert.ok(taskReward.some((row) => Number(row.id) === 2201), 'configured task source 2201 missing');

const dungeon = tables.DungeonBoxConfig && tables.DungeonBoxConfig[1];
assert.equal(Number(dungeon && dungeon[4] && dungeon[4].rewards), 2001);
assert.equal(Number(dungeon && dungeon[5] && dungeon[5].rewards), 2002);
assert.equal(Number(dungeon && dungeon[6] && dungeon[6].rewards), 2003);

console.log(JSON.stringify({
  result: 'PASS',
  policyVersion: drops.policy.version,
  currentTierOnly: true,
  configuredTaskSources: [2001, 2201],
  configuredDungeonSources: [2001, 2002, 2003],
}));

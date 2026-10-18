'use strict';

// Read-only in-memory probes for the native Formation (Pháp tướng) routes.
// PlayerService is stubbed; no Mongo/Redis/network writes are possible.
const assert = require('assert/strict');
const path = require('path');

process.env.NODE_ENV = 'production';
process.env.LOG_DIR = '';

const appRoot = path.resolve(__dirname, '..', '..', 'linhhoasu', 'lhs', 'newServer');
const playerService = require(path.join(appRoot, 'src', 'services', 'PlayerService'));
playerService.savePlayer = async (_userId, player) => player;
const upgrade = require(path.join(appRoot, 'src', 'handlers', 'upgrade'));

function player(overrides = {}) {
  return {
    userId: 'formation-probe',
    playerId: 'formation-probe',
    level: 100,
    items: { 7: 0, 8: 0, 89: 0 },
    currencies: { diamond: 0, silver: 0, gold: 0 },
    formationInfo: {
      id: 21001,
      equippedId: 21001,
      owns: [21001],
      grade: 1,
      level: 1,
      exp: 0,
      enchant: [0, 0, 0, 0, 0],
    },
    roleInfo: {},
    taskInfo: { tasks: {}, tasksMap: {} },
    other_attr_info: {},
    systemUnlockInfo: { unlockedSystem: [201, 218] },
    ...overrides,
  };
}

function response(result, tag) {
  const list = Array.isArray(result) ? result : [result];
  return list.find((packet) => packet && packet.tag === tag);
}

(async () => {
  const findings = [];

  const bulk = player({
    items: { 7: 10, 8: 0, 89: 0 },
    formationInfo: {
      id: 21001, equippedId: 21001, owns: [21001], grade: 1, level: 9, exp: 2,
      enchant: [0, 0, 0, 0, 0],
    },
  });
  const bulkAck = response(await upgrade.handleFormationUpgrade({ count: 10 }, { userId: bulk.userId, player: bulk }, 1), 3001);
  assert.equal(bulk.items[7], 9);
  assert.equal(bulk.formationInfo.level, 10);
  assert.equal(bulk.formationInfo.exp, 3);
  assert.equal(bulkAck.data.gainExp, 1);
  assert.equal(bulkAck.data.cost.count, 1);
  assert.equal(bulk.other_attr_info.mainTaskProgress.spiritUpgradeCount, 1);
  findings.push({ case: 'bulk_overcharge_at_cap_fixed', consumed: 1, actualGainExp: 1, taskCount: 1 });

  const enchant = player({ items: { 7: 0, 8: 0, 89: 10 }, currencies: { diamond: 0, silver: 500, gold: 0 } });
  const oldRandom = Math.random;
  Math.random = () => 0;
  let enchantAck;
  try {
    enchantAck = await upgrade.handleFormationEnchant({ index: 0 }, { userId: enchant.userId, player: enchant }, 2);
  } finally {
    Math.random = oldRandom;
  }
  const enchantPackets = Array.isArray(enchantAck) ? enchantAck : [enchantAck];
  assert.ok(enchantPackets.some((packet) => packet && packet.tag === 1202));
  assert.ok(enchantPackets.some((packet) => packet && packet.tag === 3003));
  assert.equal(enchant.items[89], 0);
  assert.equal(enchant.currencies.silver, 0);
  findings.push({ case: 'enchant_item_sync_fixed', responseTags: enchantPackets.map((packet) => packet.tag), consumedItem89: 10, consumedSilver: 500 });

  const locked = player({ items: { 7: 1, 8: 0, 89: 0 }, systemUnlockInfo: { unlockedSystem: [] } });
  const lockedAck = response(await upgrade.handleFormationUpgrade({ count: 1 }, { userId: locked.userId, player: locked }, 3), 3001);
  assert.equal(lockedAck.data.result, -1);
  assert.equal(lockedAck.data.msg, 'formation_system_locked');
  assert.equal(locked.items[7], 1);
  findings.push({ case: 'upgrade_without_system_unlock_blocked', unlockedSystem: [], result: lockedAck.data.result });

  const maxed = player({
    items: { 7: 0, 8: 10000, 89: 0 },
    formationInfo: {
      id: 21001, equippedId: 21001, owns: [21001], grade: 10, level: 1400, exp: 45,
      enchant: [0, 0, 0, 0, 0],
    },
  });
  const maxAck = response(await upgrade.handleFormationUpgradeGrade({}, { userId: maxed.userId, player: maxed }, 4), 3002);
  assert.equal(maxAck.data.result, -1);
  assert.equal(maxAck.data.msg, 'formation_grade_max');
  findings.push({ case: 'grade10_max_guard', result: maxAck.data.result, msg: maxAck.data.msg });

  console.log(JSON.stringify({ result: 'ok', checks: findings.length, findings }, null, 2));
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

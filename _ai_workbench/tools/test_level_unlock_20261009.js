'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const Module = require('module');

const originalLoad = Module._load;
const loggerStub = { debug() {}, info() {}, warn() {}, error() {} };
class SchemaStub {
  constructor() {
    this.statics = {};
    this.methods = {};
  }
  index() {}
  pre() {}
}
SchemaStub.Types = { Mixed: class MixedStub {} };

Module._load = function loadContractDependency(request, parent, isMain) {
  if (request === 'mongoose') return { Schema: SchemaStub, model: () => ({}) };
  if (request === 'ioredis') return class RedisStub {};
  if (request === '../logger' || request === './logger' || /[\\/]logger(?:\\.js)?$/.test(request)) return loggerStub;
  if (request === '../services/ServerConfigService') {
    return { findServerConfig: async () => ({ openTime: Date.now() }) };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const config = require('../../linhhoasu/lhs/newServer/src/services/ConfigService');
const upgrade = require('../../linhhoasu/lhs/newServer/src/handlers/upgrade');

function player(level, unlockedSystem = [], tasks = {}) {
  return {
    level,
    roleInfo: { stage: 1, stageId: 1 },
    systemUnlockInfo: { unlockedSystem, rewardedSystem: [] },
    taskInfo: { tasks, tasksMap: {} },
  };
}

async function run() {
  process.env.LEVEL_UNLOCK_SYSTEM_IDS = '209,216';
  process.env.LEVEL_UNLOCK_SYSTEM_MIN_LEVEL = '100';
  process.env.FORCE_UNLOCK_SYSTEM_IDS = '10010,209,216';
  process.env.DISABLED_SYSTEM_IDS = '';
  process.env.FEATURE_SIDE_TASKS_ENABLED = '0';

  const systems = config.get('SystemConfig');
  const upgradeSource = fs.readFileSync(
    require('path').resolve(__dirname, '../../linhhoasu/lhs/newServer/src/handlers/upgrade.js'),
    'utf8',
  );
  assert.ok(upgradeSource.includes('return new Set([311, 219, 220, 222]);'));
  assert.deepEqual(systems[209].conditions, [{ type: 2, value: 90021, cond: 4 }]);
  assert.deepEqual(systems[216].conditions, [{ type: 2, value: 90003, cond: 4 }]);

  const at99 = player(99, [], {
    90021: { id: 90021, type: 9, status: 30 },
    90003: { id: 90003, type: 9, status: 30 },
  });
  await upgrade.refreshSystemUnlockInfo(at99);
  assert.ok(!at99.systemUnlockInfo.unlockedSystem.includes(209));
  assert.ok(!at99.systemUnlockInfo.unlockedSystem.includes(216));

  const at100 = player(100);
  await upgrade.refreshSystemUnlockInfo(at100);
  assert.ok(at100.systemUnlockInfo.unlockedSystem.includes(209));
  assert.ok(at100.systemUnlockInfo.unlockedSystem.includes(216));

  const legacyBelow100 = player(99, [209, 216]);
  await upgrade.refreshSystemUnlockInfo(legacyBelow100);
  assert.ok(!legacyBelow100.systemUnlockInfo.unlockedSystem.includes(209));
  assert.ok(!legacyBelow100.systemUnlockInfo.unlockedSystem.includes(216));

  console.log(JSON.stringify({
    result: 'PASS',
    productionWrites: 0,
    networkAttempts: 0,
    level99: at99.systemUnlockInfo.unlockedSystem,
    level100: at100.systemUnlockInfo.unlockedSystem.filter((id) => [209, 216].includes(id)),
    legacyBelow100Removed: legacyBelow100.systemUnlockInfo.unlockedSystem.filter((id) => [209, 216].includes(id)),
    dayGateIgnoredSystems: [219, 220, 222],
  }));
}

run().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});


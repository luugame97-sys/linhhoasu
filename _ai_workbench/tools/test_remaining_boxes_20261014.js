'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const Module = require('module');

const app = '/linhhoasu/lhs/newServer';
const randomPath = app + '/src/services/RandomUsableItemRewardService.js';
const itemPath = app + '/src/handlers/item.js';
const rewardPath = app + '/src/services/RewardGrantService.js';

let saves = 0;
let networkAttempts = 0;
let writeAttempts = 0;
const originalLoad = Module._load;
require('net').Socket.prototype.connect = function () {
  networkAttempts += 1;
  throw Error('REMAINING_BOX_TEST_NETWORK_FORBIDDEN');
};
for (const key of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'unlinkSync', 'rmSync', 'renameSync', 'createWriteStream']) {
  fs[key] = () => {
    writeAttempts += 1;
    throw Error('REMAINING_BOX_TEST_WRITE_FORBIDDEN:' + key);
  };
}
const logger = { info() {}, warn() {}, error() {}, debug() {}, log() {} };
Module._load = function (name, parent, isMain) {
  if (/(^|\/)logger$/.test(name)) return logger;
  if (/(^|\/)PlayerService$/.test(name)) {
    return {
      drainPendingSaves: async () => {},
      savePlayer: async () => { saves += 1; return true; },
      savePlayerDeferred: async () => { saves += 1; return true; },
    };
  }
  return originalLoad.call(this, name, parent, isMain);
};
global.setTimeout = () => 0;
global.clearTimeout = () => {};
global.setInterval = () => 0;

function compile(path, source) {
  const mod = new Module(path, module);
  mod.filename = path;
  mod.paths = Module._nodeModulePaths(path.replace(/\/[^/]+$/, ''));
  Module._cache[path] = mod;
  mod._compile(source, path);
  return mod.exports;
}

const config = require(app + '/src/services/ConfigService');
compile(randomPath, globalThis.RANDOM_SOURCE);
compile(rewardPath, globalThis.REWARD_SOURCE);
const item = compile(itemPath, globalThis.ITEM_SOURCE);
const random = require(randomPath);

const targetIds = [
  412, 413, 94301, 94401, 94416, 94418, 94419, 94420, 94421, 94422, 94515,
  94701, 94703, 94705, 94706, 94708, 94709, 94711, 94713, 94715, 94718,
  94719, 94721, 94724, 94725, 94726, 94729, 94801, 94802, 94902, 94904,
  94908, 94911, 94923, 94926, 94929, 94932, 94935, 94938, 94941, 100020,
  100021, 100022, 100026, 100030, 100031, 100032, 100036, 100040, 100060,
  100139, 100160, 100170, 100185, 100190, 100200, 100230, 100250, 100641,
  100642, 100643, 101000, 101310,
  474, 475, 476, 477, 478, 479, 100050, 100070, 100100, 100161, 100162,
  100163, 100164, 100180, 100186, 100187, 100188, 100191, 100192, 100193,
  100210, 100240, 100260, 100651, 100652, 100653,
];

function fresh(id, count) {
  return {
    userId: 'ISOLATED_REMAINING_BOX_TEST',
    playerId: 'ISOLATED_REMAINING_BOX_TEST',
    items: { [id]: count },
    currencies: { diamond: 0, gold: 0, silver: 0 },
    other_attr_info: {},
    roleInfo: { stage: 999999 },
    level: 999,
    exp: 0,
  };
}

function rewardEntryCount(rewardInfo) {
  const root = rewardInfo && typeof rewardInfo === 'object' ? rewardInfo : {};
  return Object.values(root).reduce((total, value) => total + (Array.isArray(value) ? value.length : 0), 0);
}

async function open(id, count, selects) {
  const player = fresh(id, count);
  saves = 0;
  const value = await item.handleUseItem(
    { itemId: id, count, ...(selects ? { selects } : {}) },
    { userId: player.userId, player },
    17,
  );
  const packets = Array.isArray(value) ? value : [value];
  const response = packets.find((packet) => packet?.tag === 1300)?.data || {};
  return { player, packets, response };
}

(async () => {
  const realRandom = Math.random;
  Math.random = () => 0;
  let cases = 0;
  let selectionCases = 0;
  try {
    assert.equal(new Set(targetIds).size, targetIds.length, 'duplicate target');
    assert.equal(random.CUSTOM_BOX_DEFINITIONS.length, targetIds.length, 'custom definition count');
    for (const id of targetIds) {
      assert.equal(random.isCustomBox(id), true, 'missing custom box ' + id);
      assert.ok(random.getCustomBoxPool(id)?.length > 0 || [100641, 100642, 100643, 100651, 100652, 100653, 101000].includes(id), 'empty pool ' + id);
      assert.ok(random.resolveRandomRewardRows(fresh(id, 1), id, 1)?.rows?.length > 0, 'empty plan ' + id);
      for (const count of [1, 3, 55]) {
        const result = await open(id, count);
        assert.equal(result.response.result, 0, 'result ' + id + '/' + count);
        assert.equal(result.player.items[id] || 0, 0, 'consume ' + id + '/' + count);
        assert.ok(rewardEntryCount(result.response.rewardInfo) > 0, 'empty reward ' + id + '/' + count);
        assert.equal(saves, 1, 'save ' + id + '/' + count);
        cases += 1;
      }
    }
    for (const id of [90021, 90022]) {
      const rewards = random.getCustomSelectionRewards(id);
      assert.ok(rewards && rewards.length > 0, 'empty selection ' + id);
      for (const index of [0, rewards.length - 1]) {
        const result = await open(id, 1, { [index]: 1 });
        assert.equal(result.response.result, 0, 'selection result ' + id + '/' + index);
        assert.equal(result.player.items[id] || 0, 0, 'selection consume ' + id + '/' + index);
        assert.ok(rewardEntryCount(result.response.rewardInfo) > 0, 'selection reward ' + id + '/' + index);
        assert.equal(saves, 1, 'selection save ' + id + '/' + index);
        selectionCases += 1;
      }
    }
    for (const count of [0, -1, 1.5, 10001]) {
      const player = fresh(100651, 20000);
      const value = await item.handleUseItem({ itemId: 100651, count }, { userId: player.userId, player }, 17);
      const packets = Array.isArray(value) ? value : [value];
      const response = packets.find((packet) => packet?.tag === 1300)?.data || {};
      assert.notEqual(response.result, 0, 'invalid count ' + count);
      assert.equal(player.items[100651], 20000, 'invalid debit ' + count);
      cases += 1;
    }
    assert.equal(networkAttempts, 0);
    assert.equal(writeAttempts, 0);
    const tables = config.loadAllTables();
    console.log('REMAINING_BOXES_RESULT=' + JSON.stringify({
      passed: cases,
      selectionCases,
      targetIds: targetIds.length,
      definitions: random.CUSTOM_BOX_DEFINITIONS.length,
      networkAttempts,
      writeAttempts,
      configTables: Object.keys(tables).length,
    }));
  } finally {
    Math.random = realRandom;
  }
})().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});

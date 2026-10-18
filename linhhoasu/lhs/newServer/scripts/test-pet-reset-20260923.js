'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(app, 'src/handlers/pet.js'), 'utf8');

const tables = {
  PetBaseConfig: {
    initialField: 8,
    levelMax: 200,
    resetConsume: [{ id: 1, count: 0 }],
    returnRate: 10000,
  },
  PetConfig: {
    82001: { id: 82001, quality: 2, type: 1, tag: 1 },
  },
  PetQualityConfig: {
    2: {
      id: 2,
      passiveSkillCount: 0,
      consumes: [{ id: 36, count: 5 }],
      addConsumes: [{ id: 36, count: 3 }],
      composeSuccessRate: 10000,
    },
  },
  PetPassiveSkillConfig: {},
  PetPassiveSkillWashConfig: {},
};

function loadHandler(config = tables) {
  const saves = [];
  const logger = { debug() {}, info() {}, warn() {}, error() {} };
  const playerService = {
    async savePlayer(userId, player) {
      saves.push({ userId, player: JSON.parse(JSON.stringify(player)) });
      return player;
    },
    savePlayerDeferred() { return Promise.resolve(); },
  };
  const progress = {
    addPetComposeCount() { return false; },
    addPetWashCount() { return false; },
    refreshMainTaskProgress() { return false; },
  };
  const raid = {
    addRewardToPlayer(player, itemId, count) {
      const id = Number(itemId);
      const amount = Number(count);
      player.items ||= {};
      player.currencies ||= { diamond: 0, silver: 0, gold: 0 };
      if (id === 1) player.currencies.diamond = Number(player.currencies.diamond || 0) + amount;
      else if (id === 2) player.currencies.silver = Number(player.currencies.silver || 0) + amount;
      else if (id === 6) player.currencies.gold = Number(player.currencies.gold || 0) + amount;
      else player.items[id] = Number(player.items[id] || 0) + amount;
    },
  };
  const dependencyMap = {
    '../services/ConfigService': { get: name => config[name] || {} },
    '../services/PlayerService': playerService,
    '../logger': logger,
    '../services/MainTaskProgressService': progress,
    './raid': raid,
    './task': { buildActiveTaskUpdatePackets() { return []; } },
  };
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    require(request) {
      if (!Object.prototype.hasOwnProperty.call(dependencyMap, request)) {
        throw new Error(`UNEXPECTED_DEPENDENCY:${request}`);
      }
      return dependencyMap[request];
    },
    process: { env: {} },
    console,
    Date,
    Math,
  }, { filename: path.join(app, 'src/handlers/pet.js') });
  return { handler: module.exports, saves };
}

function fixturePlayer(level = 4) {
  return {
    userId: 'fixture-user',
    items: { 36: 100, 37: 55, 99: 9 },
    currencies: { diamond: 20, silver: 300, gold: 7 },
    petInfo: {
      field: 8,
      nextUid: 100002,
      pets: [{ uid: 100001, id: 82001, level, exp: 88, slot: 0 }],
      unlockAtlas: [82001],
      rewardedAtlas: [],
      wishMap: {},
      timeRecords: {},
    },
  };
}

async function main() {
  const { handler, saves } = loadHandler();
  const player = fixturePlayer(4);
  const before = JSON.parse(JSON.stringify(player));
  const result = await handler.handlePetReset({ uid: 100001 }, { userId: player.userId, player }, 91);
  assert.ok(Array.isArray(result), 'successful reset must include inventory sync');
  const response = result.find(packet => packet && packet.tag === 3307);
  const sync = result.find(packet => packet && packet.tag === 1202);
  assert.equal(response.data.result, 0);
  assert.equal(response.data.data.level, 1);
  assert.equal(response.data.data.exp, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(response.data.rewards.items)), [{ id: 36, count: 24 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(response.data.rewardInfo.items)), [{ id: 36, count: 24 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(sync.data.items)), [{ id: 36, count: 24 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(sync.data.changed)), [{ id: 36, count: 124 }]);
  assert.equal(player.items[36], 124, 'upgrade fruit must be returned');
  assert.equal(player.items[37], before.items[37], 'skill-wash material must not be touched');
  assert.equal(player.items[99], before.items[99], 'unrelated items must be preserved');
  assert.equal(player.currencies.diamond, before.currencies.diamond);
  assert.equal(saves.length, 1);

  const failConfig = JSON.parse(JSON.stringify(tables));
  failConfig.PetBaseConfig.resetConsume = [{ id: 1, count: 25 }];
  const failedPlayer = fixturePlayer(4);
  const failedBefore = JSON.parse(JSON.stringify(failedPlayer));
  const failed = await loadHandler(failConfig).handler.handlePetReset(
    { uid: 100001 },
    { userId: failedPlayer.userId, player: failedPlayer },
    92
  );
  assert.equal(failed.data.result, -1);
  assert.deepEqual(JSON.parse(JSON.stringify(failed.data.rewards.items)), []);
  assert.deepEqual(failedPlayer.items, failedBefore.items, 'failed reset must not mutate items');
  assert.deepEqual(failedPlayer.currencies, failedBefore.currencies, 'failed reset must not mutate currencies');
  assert.equal(failedPlayer.petInfo.pets[0].level, failedBefore.petInfo.pets[0].level, 'failed reset must not mutate level');

  console.log(JSON.stringify({ result: 'PASS', returnedItemId: 36, returnedCount: 24, productionWrites: 0 }));
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

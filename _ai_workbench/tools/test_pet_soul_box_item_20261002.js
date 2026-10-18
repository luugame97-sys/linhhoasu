'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..', '..');
process.env.CONFIG_BIN_PATH = path.join(root, '_ai_workbench/temp/petsoul_release_20261002/baseline/config.bin');
const candidatePath = path.join(root, '_ai_workbench/temp/petsoul_oldtrek_live_20261002/item.js');
const actualPath = path.join(root, 'linhhoasu/lhs/newServer/src/handlers/item.js');
const randomCandidatePath = path.join(root, '_ai_workbench/temp/petsoul_oldtrek_live_20261002/RandomUsableItemRewardService.js');
const randomServiceModule = new Module(randomCandidatePath, module);
randomServiceModule.filename = randomCandidatePath;
randomServiceModule.paths = Module._nodeModulePaths(path.dirname(actualPath));
const actualConfig = require(path.join(root, 'linhhoasu/lhs/newServer/src/services/ConfigService'));
const randomOriginalRequire = randomServiceModule.require.bind(randomServiceModule);
randomServiceModule.require = (name) => name === './ConfigService' ? actualConfig : randomOriginalRequire(name);
randomServiceModule._compile(fs.readFileSync(randomCandidatePath, 'utf8'), randomCandidatePath);
const randomService = randomServiceModule.exports;

// Block all socket creation and substitute PlayerService before any handler imports.
const net = require('net');
net.Socket.prototype.connect = () => { throw new Error('NETWORK_FORBIDDEN_IN_ISOLATED_TEST'); };
const savedLoad = Module._load;
Module._load = function(name, parent, isMain) {
  if (/(^|\/)PlayerService$/.test(name)) return { savePlayer: async () => true };
  return savedLoad.call(this, name, parent, isMain);
};

const itemModule = new Module(candidatePath, module);
itemModule.filename = actualPath;
itemModule.paths = Module._nodeModulePaths(path.dirname(actualPath));
const originalRequire = itemModule.require.bind(itemModule);
itemModule.require = (name) => name === '../services/RandomUsableItemRewardService' ? randomService : originalRequire(name);
itemModule._compile(fs.readFileSync(candidatePath, 'utf8'), candidatePath);

async function run() {
  for (const count of [1, 55]) {
  const player = {
    items: { 100802: count },
    currencies: { diamond: 0, silver: 0, gold: 0 },
    other_attr_info: {},
    roleInfo: { stage: 1 },
    level: 200,
    exp: 0,
    petInfo: { pets: [] },
  };
  const result = await itemModule.exports.handleUseItem({ itemId: 100802, count }, { userId: 'ISOLATED_PETSOUL_BOX', player }, 77);
  const packets = Array.isArray(result) ? result : [result];
  const reply = packets.find((row) => row && row.tag === 1300);
  const rewards = reply && reply.data && reply.data.rewardInfo && reply.data.rewardInfo.items || [];
  const reward = rewards.find((row) => row.id >= 268 && row.id <= 272);
  if (!reply || reply.data.result !== 0 || Number(player.items[100802] || 0) !== 0 || !reward || rewards.reduce((sum, row) => sum + row.count, 0) !== count) {
    throw new Error(`BOX_OPEN_FAILED:${JSON.stringify({ reply, rewards, items: player.items })}`);
  }
  console.log(JSON.stringify({ pass: true, count, rewards, remainingBox: player.items[100802] }));
  }
  const tables = actualConfig.loadAllTables();
  const old = tables.PetSoulUpgradeMaterialConfig[268];
  delete tables.PetSoulUpgradeMaterialConfig[268];
  try {
    const player = { items: { 100802: 55 }, currencies: {}, other_attr_info: {}, level: 200, roleInfo: { stage: 1 } };
    const result = await itemModule.exports.handleUseItem({ itemId: 100802, count: 55 }, { player }, 78);
    if (result.data?.code !== 'ITEM_REWARD_POOL_UNVERIFIED' || player.items[100802] !== 55) throw new Error('INVALID_POOL_CONSUMED_BOX');
    console.log(JSON.stringify({ pass: true, invalidPoolPreservesBox: true }));
  } finally { tables.PetSoulUpgradeMaterialConfig[268] = old; }
}

run().catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; })
  .finally(() => { Module._load = savedLoad; });

'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
process.env.CONFIG_BIN_PATH = path.join(root, '_ai_workbench/temp/petsoul_release_20261002/baseline/config.bin');
const sourcePath = path.join(root, '_ai_workbench/temp/petsoul_oldtrek_live_20261002/pet-soul.js');
const config = require(path.join(root, 'linhhoasu/lhs/newServer/src/services/ConfigService'));
const sandbox = {
  module: { exports: {} },
  require(name) {
    if (name === '../services/ConfigService') return config;
    if (name === '../services/PlayerService') return { savePlayer: async () => true };
    if (name === './raid') return { addRewardToPlayer() {} };
    throw new Error(`Unexpected dependency: ${name}`);
  },
};
vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), sandbox, { filename: sourcePath });
const handler = sandbox.module.exports;
const tables = config.loadAllTables();
const soulCfg = Object.values(tables.PetSoulConfig).find((row) => Number(row.quality) === 6);
if (!soulCfg) throw new Error('QUALITY6_SOUL_MISSING');
const upgrade = tables.PetSoulUpgradeConfig[soulCfg.quality][0];
const material = Object.values(tables.PetSoulUpgradeMaterialConfig)
  .find((row) => Number(row.score) === 400 && Number(row.element) === Number(soulCfg.races));
if (!material) throw new Error('QUALITY6_MATERIAL_MISSING');
const unit = Math.floor(material.score * (1 + Number(tables.PetSoulBaseConfig.extraValuePercent) / 10000));

function session() {
  const player = { items: {}, currencies: { diamond: 0, silver: 0, gold: 0 }, petInfo: { pets: [] }, other_attr_info: {} };
  handler.ensurePetSoulInfo(player);
  handler.grantPetSoulToPlayer(player, soulCfg.id);
  return { userId: 'ISOLATED_PETSOUL_HIGH_RATE', player };
}
function soulOf(s) { return s.player.other_attr_info.petSoulInfo.petSouls.find((row) => row.id === soulCfg.id); }
async function run() {
  const high = session();
  const needed = Math.ceil(Number(upgrade.require) / unit);
  const supplied = needed + 5;
  high.player.items[material.id] = supplied;
  const highReply = await handler.handlePetSoulStarUp({ id: soulCfg.id, items: { [material.id]: supplied } }, high, 1);
  if (highReply[1].data.result !== 0 || soulOf(high).star !== 1 || high.player.items[material.id] !== supplied - needed) {
    throw new Error(`HIGH_RATE_FAILED:${JSON.stringify({ highReply, star: soulOf(high).star, remaining: high.player.items[material.id], needed, supplied })}`);
  }

  const sixty = session();
  const sixtyCount = Math.max(1, Math.ceil(Number(upgrade.require) * 0.6 / unit));
  sixty.player.items[material.id] = sixtyCount;
  const sixtyReply = await handler.handlePetSoulStarUp({ id: soulCfg.id, items: { [material.id]: sixtyCount } }, sixty, 2);
  if (sixtyReply[1].data.result !== 0 || soulOf(sixty).star !== 1 || sixty.player.items[material.id] !== 0) {
    throw new Error(`SIXTY_RATE_FAILED:${JSON.stringify({ sixtyReply, star: soulOf(sixty).star, remaining: sixty.player.items[material.id], sixtyCount })}`);
  }

  const insufficient = session();
  insufficient.player.items[material.id] = 1;
  const before = JSON.stringify(insufficient.player.items);
  const bad = await handler.handlePetSoulStarUp({ id: soulCfg.id, items: { [material.id]: 2 } }, insufficient, 3);
  if (bad.data.result >= 0 || JSON.stringify(insufficient.player.items) !== before || soulOf(insufficient).star !== 0) {
    throw new Error(`INSUFFICIENT_NOT_ATOMIC:${JSON.stringify({ bad, items: insufficient.player.items, star: soulOf(insufficient).star })}`);
  }
  // Existing inventory is required even when the cap would consume fewer units.
  for (const selection of [{ [material.id]: supplied * 10 }, { [material.id]: 1.5 },
    { [material.id]: Infinity }, { [material.id]: -1 }, { [material.id]: 0 },
    { [material.id]: Number.MAX_SAFE_INTEGER + 1 }, { [material.id]: '2' },
    { [material.id]: supplied, 999999: 1 }, { ['0' + material.id]: supplied }, []]) {
    const s = session(); s.player.items[material.id] = supplied;
    const beforeItems = JSON.stringify(s.player.items);
    const result = await handler.handlePetSoulStarUp({ id: soulCfg.id, items: selection }, s, 4);
    if (result.data?.result >= 0 || Array.isArray(result) || beforeItems !== JSON.stringify(s.player.items) || soulOf(s).star !== 0)
      throw new Error('INVALID_SELECTION_CHANGED_STATE:' + JSON.stringify(selection));
  }
  for (const multiplier of [2, 20]) {
    const s = session(); const selected = needed * multiplier; s.player.items[material.id] = selected;
    const reply = await handler.handlePetSoulStarUp({ id: soulCfg.id, items: { [material.id]: selected } }, s, 5);
    if (reply[1]?.data.result !== 0 || s.player.items[material.id] !== selected - needed) throw new Error('HIGH_RATE_' + multiplier);
  }
  const below = session();
  const lowMaterial = Object.values(tables.PetSoulUpgradeMaterialConfig).find(row => row.score < upgrade.require * 0.6 / 2);
  if (!lowMaterial) throw new Error('LOW_MATERIAL_FIXTURE_MISSING');
  below.player.items[lowMaterial.id] = 1;
  const lowReply = await handler.handlePetSoulStarUp({ id: soulCfg.id, items: { [lowMaterial.id]: 1 } }, below, 6);
  if (lowReply.data?.result !== -3 || below.player.items[lowMaterial.id] !== 1 || soulOf(below).star !== 0) throw new Error('BELOW_THRESHOLD');
  const maxed = session(); soulOf(maxed).star = 1000; maxed.player.items[material.id] = supplied;
  const maxReply = await handler.handlePetSoulStarUp({ id: soulCfg.id, items: { [material.id]: supplied } }, maxed, 7);
  if (maxReply.data?.result !== -2 || maxed.player.items[material.id] !== supplied) throw new Error('MAX_STAR_CONSUMED');
  const sequential = session(); sequential.player.items[material.id] = 1000;
  let expectedRemaining = 1000;
  for (let star = 0; star < 2; star++) {
    const required = Number(tables.PetSoulUpgradeConfig[soulCfg.quality][star].require);
    const cost = Math.ceil(required / unit);
    const reply = await handler.handlePetSoulStarUp({ id: soulCfg.id, items: { [material.id]: expectedRemaining } }, sequential, 20 + star);
    expectedRemaining -= cost;
    if (reply[1]?.data.result !== 0 || soulOf(sequential).star !== star + 1 || sequential.player.items[material.id] !== expectedRemaining)
      throw new Error('SEQUENTIAL_STAR_FAILED');
  }
  // Boundary fixtures retain the real table structure; temporarily adjust just
  // the score/require values to hit exact 60%, 200%, 2000% and row rounding.
  const originalRequire = upgrade.require;
  const originalScore = material.score;
  const originalExtra = tables.PetSoulBaseConfig.extraValuePercent;
  try {
    upgrade.require = 100; material.score = 10; tables.PetSoulBaseConfig.extraValuePercent = 0;
    for (const [count, accepted, consumed] of [[5, false, 0], [6, true, 6], [20, true, 10], [200, true, 10]]) {
      const s = session(); s.player.items[material.id] = count;
      const reply = await handler.handlePetSoulStarUp({ id: soulCfg.id, items: { [material.id]: count } }, s, 8);
      if ((Array.isArray(reply) && reply[1].data.result === 0) !== accepted || s.player.items[material.id] !== count - consumed)
        throw new Error('EXACT_RATE_BOUNDARY:' + count);
    }
    upgrade.require = 11; material.score = 1; tables.PetSoulBaseConfig.extraValuePercent = 1000;
    const rounded = session(); rounded.player.items[material.id] = 20;
    const roundReply = await handler.handlePetSoulStarUp({ id: soulCfg.id, items: { [material.id]: 20 } }, rounded, 9);
    if (roundReply[1]?.data.result !== 0 || rounded.player.items[material.id] !== 10) throw new Error('ROW_ROUNDING_OVERCONSUMED');
  } finally {
    upgrade.require = originalRequire; material.score = originalScore; tables.PetSoulBaseConfig.extraValuePercent = originalExtra;
  }
  console.log(JSON.stringify({ pass: true, soulId: soulCfg.id, quality: soulCfg.quality, require: upgrade.require, materialId: material.id, unit, needed, supplied, highRemaining: high.player.items[material.id], sixtyCount }));
}
run().catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; });

'use strict';

const config = require('./ConfigService');
const policy = require('../config/alchemyMaterialDrops.json');
let cachedTables = null;
let tierStages = null;

// Derive progression from recipes, not equipment-box/map level. Those two
// progressions are independent, and map-based tiers can strand realm recipes.
function validate() {
  const tables = config.loadAllTables();
  if (cachedTables === tables) return tierStages;
  const integer = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
  if (typeof policy.enabled !== 'boolean' || !policy.version
    || !integer(policy.currentTierWeightBps, 1, 10000)
    || !Array.isArray(policy.groups) || policy.groups.length !== 2) throw Error('INVALID_ALCHEMY_DROP_POLICY');
  const stages = {};
  const bases = new Set();
  for (const group of policy.groups) {
    if (![2000, 2200].includes(group.baseId) || bases.has(group.baseId) || group.tiers !== 15
      || !integer(group.chanceBps, 1, 10000) || group.count !== 1) throw Error('INVALID_ALCHEMY_DROP_GROUP');
    bases.add(group.baseId);
    for (let tier = 1; tier <= group.tiers; tier++) {
      const id = group.baseId + tier;
      const asset = tables.AssetsConfig[id];
      const recipes = Object.values(tables.AlchemyFormulaConfig).filter(row => row.consumes.some(cost => cost.id === id));
      if (asset?.type !== 1 || !asset.itemWay?.includes(23) || !recipes.length) throw Error('INVALID_ALCHEMY_DROP_ASSET:' + id);
      const stage = Math.min(...recipes.map(row => row.stageId));
      if (!tables.RoleStageConfig?.[stage] || stages[tier] != null && stages[tier] !== stage) throw Error('INVALID_ALCHEMY_DROP_STAGE:' + id);
      stages[tier] = stage;
    }
  }
  if (stages[1] !== 1 || Object.keys(stages).some(tier => tier > 1 && stages[tier] <= stages[tier - 1])) throw Error('INVALID_ALCHEMY_DROP_PROGRESSION');
  cachedTables = tables;
  tierStages = Object.freeze(stages);
  return tierStages;
}

function currentTier(player) {
  const stages = validate();
  const stage = Number(player?.roleInfo?.stage ?? player?.roleInfo?.stageId ?? 1);
  if (!Number.isSafeInteger(stage) || stage < 1) return 0;
  return Math.max(0, ...Object.keys(stages).map(Number).filter(tier => stages[tier] <= stage));
}

function randomUnit(rng) {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw Error('INVALID_ALCHEMY_DROP_RANDOM');
  return value;
}

function pickTier(maxTier, rng) {
  if (maxTier === 1 || policy.currentTierWeightBps >= 10000) return maxTier;
  const roll = randomUnit(rng);
  const currentWeight = policy.currentTierWeightBps / 10000;
  if (roll < currentWeight) return maxTier;
  // With the native/current-tier policy (10,000 bps), the early return above
  // keeps one paid attempt on the exact current tier. Legacy policies may
  // still opt into a bounded earlier-tier distribution below.
  return 1 + Math.min(maxTier - 2, Math.floor((roll - currentWeight) / (1 - currentWeight) * (maxTier - 1)));
}

function roll(player, count, context = {}, rng = Math.random) {
  validate();
  if (!policy.enabled || context.isBot === true || context.kind !== 'normal'
    || context.valid !== true || config.get('MapConfig')?.[context.mapId]?.type !== 1) return [];
  if (!Number.isSafeInteger(count) || count <= 0) throw Error('INVALID_ALCHEMY_DROP_COUNT');
  const tier = currentTier(player);
  if (!tier) return [];
  const totals = new Map();
  // One roll per actual paid attempt, not per client animation or RPC. A
  // multi-open neither multiplies the rate twice nor loses its extra rolls.
  for (let attempt = 0; attempt < count; attempt++) {
    for (const group of policy.groups) {
      if (randomUnit(rng) * 10000 >= group.chanceBps) continue;
      const id = group.baseId + pickTier(tier, rng);
      totals.set(id, (totals.get(id) || 0) + group.count);
    }
  }
  return [...totals].sort((a, b) => a[0] - b[0]).map(([id, quantity]) => ({ id, count: quantity }));
}

module.exports = { policy, validate, currentTier, roll };

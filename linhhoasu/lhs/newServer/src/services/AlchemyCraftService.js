'use strict';

const config = require('./ConfigService');
const pills = require('./ItemPillService');
const currencyKeys = { 1: 'diamond', 2: 'silver', 6: 'gold' };
const table = name => config.get(name) || {};
const positive = n => Number.isSafeInteger(n) && n > 0;
function owned(player, id) {
  const value = currencyKeys[id] ? player.currencies?.[currencyKeys[id]] : player.items?.[id];
  return Math.max(0, Number(value) || 0);
}
function setCount(player, id, value) {
  player.items ||= {};
  if (currencyKeys[id]) { player.currencies ||= {}; player.currencies[currencyKeys[id]] = value; }
  player.items[id] = value;
}
function addCost(map, id, count) {
  if (!positive(id) || !positive(count) || !Number.isSafeInteger((map[id] || 0) + count)) throw new Error('INVALID_ALCHEMY_CONFIG');
  map[id] = (map[id] || 0) + count;
}

// Work on an isolated draft; no DB, network, or session changes here.
function craft(player, params, auto, random = Math.random) {
  const assets = table('AssetsConfig'), formulas = table('AlchemyFormulaConfig');
  const recipe = formulas[params.id], asset = assets[params.id];
  if (!positive(params.id) || !positive(params.count) || params.count > 9999 || !recipe || asset?.type !== 9) return { rejected: 'invalid_recipe_or_count' };
  if (owned(player, params.id) < 1) return { rejected: 'recipe_not_owned' };
  if (Number(player.roleInfo?.stage || 1) < recipe.stageId) return { rejected: 'stage_locked' };
  if (auto && asset.subType !== 3) return { rejected: 'invalid_auto_recipe' };
  if (!auto && asset.subType === 3) return { rejected: 'auto_recipe_required' };
  if (auto && ![0, 1, undefined].includes(params.exchange)) return { rejected: 'invalid_exchange' };
  const info = player.alchemyInfo, base = table('AlchemyBaseConfig');
  const remain = Math.max(0, Number(base.alchemyDailyCount) - info.dayCount);
  if (!Number.isSafeInteger(remain) || (!auto && params.count > remain) || remain <= 0) return { rejected: 'daily_limit' };
  if (!Array.isArray(recipe.consumes) || !recipe.consumes.length) return { rejected: 'invalid_cost_config' };
  const costs = {};
  for (const row of recipe.consumes) addCost(costs, row.id, row.count);
  const outcomes = Object.entries(recipe.qualityWeights || {}).map(([quality, row]) => ({ ...row, quality: Number(quality) }));
  if (!outcomes.length || outcomes.some(row => !positive(row.weight) || assets[row.id]?.type !== 8)) return { rejected: 'invalid_reward_config' };
  if (!Number.isInteger(recipe.succeed) || recipe.succeed < 0 || recipe.succeed > 10000) return { rejected: 'invalid_probability' };
  if (!auto && Object.entries(costs).some(([id, count]) => owned(player, id) < count * params.count)) return { rejected: 'insufficient_materials' };
  const before = {}, rewards = {};
  function change(id, delta) {
    if (!(id in before)) before[id] = owned(player, id);
    setCount(player, id, owned(player, id) + delta);
  }
  const outputLimits = Object.fromEntries(outcomes.map(row => [row.id, pills.permanentLimit(player, row.id)]));
  let count = 0, failed = 0, stopReason = 0;
  for (let attempt = 0; attempt < Math.min(params.count, remain); attempt++) {
    if (auto && outcomes.some(row => {
      const limit = outputLimits[row.id];
      return limit && owned(player, row.id) + limit.used >= limit.cap;
    })) { stopReason = 1; break; }
    const payment = {};
    for (const [idString, need] of Object.entries(costs)) {
      const id = Number(idString), have = owned(player, id), missing = Math.max(0, need - have);
      if (missing && auto && params.exchange === 1 && !currencyKeys[id]) {
        // Auto exchange buys only missing herbs from the configured Linh thuc shop.
        const shop = Object.values(table('ShopConfig')).find(row => row.type === 0 && row.tab === 6 && row.payId === 0 && row.limit === 0 && !row.conditions?.length && row.rewards?.length === 1 && row.rewards[0].id === id && row.rewards[0].count === 1 && row.cost?.length === 1 && row.cost[0].id === 34);
        if (!shop) return { rejected: 'unsupported_exchange' };
        if (have) addCost(payment, id, Math.min(have, need));
        addCost(payment, 34, shop.cost[0].count * missing);
      } else addCost(payment, id, need);
    }
    if (Object.entries(payment).some(([id, need]) => owned(player, id) < need)) { stopReason = 3; break; }
    Object.entries(payment).forEach(([id, need]) => change(Number(id), -need));
    const roles = table('AlchemyRoleConfig'), role = roles[info.level];
    let bonus = 0;
    if (role && recipe.stageId <= role.minStage) {
      const eligible = Object.values(roles).filter(row => row.id <= info.level && row.minStage <= recipe.stageId).sort((a, b) => a.id - b.id);
      bonus = eligible.at(-1)?.addSucceed || 0;
    }
    count++;
    if (random() * 10000 >= Math.min(10000, recipe.succeed + bonus)) failed++;
    else {
      const weights = outcomes.map(row => row.weight + (role?.stageIds?.includes(recipe.stageId) ? Number(role.qualityRates?.[row.quality]) || 0 : 0));
      let roll = random() * weights.reduce((a, b) => a + b, 0), picked = outcomes.at(-1);
      for (let i = 0; i < outcomes.length; i++) { roll -= weights[i]; if (roll < 0) { picked = outcomes[i]; break; } }
      change(picked.id, 1); rewards[picked.id] = (rewards[picked.id] || 0) + 1;
    }
    info.exp += Number(base.pillExp?.count) || 0;
    while (roles[info.level + 1] && roles[info.level]?.exp > 0 && info.exp >= roles[info.level].exp) { info.exp -= roles[info.level].exp; info.level++; }
    info.lv = info.level;
  }
  if (!count) return { rejected: 'materials_or_pill_limit' };
  info.dayCount += count;
  if (count < params.count && count >= remain) stopReason = 2;
  setCount(player, 41, info.exp);
  return { count, failed, stopReason, items: Object.entries(rewards).map(([id, count]) => ({ id: Number(id), count })), delta: Object.entries(before).map(([id, count]) => ({ id: Number(id), count: owned(player, id) - count })), changed: Object.keys(before).map(id => ({ id: Number(id), count: owned(player, id) })) };
}
module.exports = { craft };

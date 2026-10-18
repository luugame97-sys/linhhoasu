'use strict';
const config = require('./ConfigService');
const policy = require('../config/farmPolicy.json');
let validatedFor = null;
function validate() {
  const tables = config.loadAllTables();
  if (validatedFor === tables) return policy;
  for (const [name, table] of [['normalSeedWeights','PlantConfig'], ['magicWeights','PlantMagicConfig']]) {
    const ids = new Set();
    if (!Array.isArray(policy[name]) || policy[name].reduce((sum,r)=>sum+r.weight,0)!==10000) throw new Error('INVALID_FARM_POLICY_WEIGHT');
    for (const row of policy[name]) {
      if (!Number.isSafeInteger(row.weight) || row.weight<=0 || ids.has(row.id) || !config.get(table)?.[row.id]) throw new Error('INVALID_FARM_POLICY_ROW');
      ids.add(row.id);
    }
  }
  validatedFor = tables;
  return policy;
}
function pick(rows, rng = Math.random) {
  let roll = rng() * rows.reduce((sum,r)=>sum+r.weight,0);
  for (const row of rows) { roll -= row.weight; if (roll < 0) return row.id; }
  return rows[rows.length-1].id;
}
function unlocked(player) {
  if (player.systemUnlockInfo?.unlockedSystem?.some(id=>Number(id)===303)) return true;
  // SystemConfig303 depends on main-task progress, not character/map level.
  // Use the persisted unlock marker produced by the existing unlock system.
  return false;
}
module.exports = { policy, validate, pick, unlocked };

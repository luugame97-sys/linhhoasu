'use strict';
const policy = require('./featureDayAccess.json');

function apply(tables) {
  if (!tables || !tables.SystemConfig) throw Error('FEATURE_DAY_CONFIG_MISSING');
  const changes = { systems: [], rows: {} };
  const openDayOverrides = new Set((policy.systemOpenDayOverrides || []).map(Number));
  const ordinary = value => Number.isFinite(value) && value > 1 && value < policy.sentinelDay;
  for (const [key, row] of Object.entries(tables.SystemConfig)) {
    const id = Number(row && row.id || key);
    if (!row || policy.excludedSystems.includes(id)) continue;
    const conditions = Array.isArray(row.conditions) ? row.conditions : [];
    if (conditions.some(c => c.type === 5 && Number(c.value) >= policy.sentinelDay)) continue;
    if (openDayOverrides.has(id) && ordinary(Number(row.openDay))) { row.openDay = 1; changes.systems.push(id); }
    let changed = false;
    for (const condition of conditions) {
      if (condition.type === 5 && condition.cond === 4 && ordinary(Number(condition.value))) {
        condition.value = 1;
        changed = true;
      }
    }
    if (conditions.some(c => c.type === 5 && c.cond === 4 && Number(c.value) === 1)
      && ordinary(Number(row.openDay))) { row.openDay = 1; changed = true; }
    if (changed) changes.systems.push(id);
  }
  function walk(node, rule) {
    if (!node || typeof node !== 'object') return;
    if ((!rule.selector || node[rule.selector] === rule.value) && ordinary(Number(node[rule.field]))) {
      node[rule.field] = 1;
      changes.rows[rule.table] = (changes.rows[rule.table] || 0) + 1;
    }
    if (!rule.rootOnly) for (const value of Object.values(node)) if (value && typeof value === 'object') walk(value, rule);
  }
  for (const rule of policy.rowPolicies) walk(tables[rule.table], rule);
  return changes;
}

module.exports = { apply, policy };

'use strict';
const config = require('./ConfigService');
function settle(player, now = Date.now()) {
  const farm = player.farmInfo ||= {}, items = player.items ||= {};
  const today = require('./GameDayService').key(now);
  let changed = false;
  const policy = require('./FarmPolicyService');
  // Custom daily refill: current day only, preserve purchased surplus. A
  // separate marker prevents an old resourceDay field from suppressing it.
  if (policy.policy.seedRefill.enabled && farm.seedRefillDay !== today && policy.unlocked(player)) {
    const max = Number(config.get('PlantBuildConfig')?.[3]?.[farm.buildLv?.[3] || 1]?.attrs?.[4]) || Number(config.get('PlantBaseConfig')?.pSeedDailyCountMax);
    if (!Number.isSafeInteger(max) || max <= 0) throw new Error('FARM_SEED_CAP_INVALID');
    items[29] = Math.max(Number(items[29]) || 0, max);
    farm.seedRefillDay = today; changed = true;
  }
  if (farm.resourceDay !== today) { farm.resourceDay = today; changed = true; }
  const rule = (config.get('AssetsRefreshConfig') || {})[27];
  if (rule?.time > 0 && rule.countMax > 0 && rule.count > 0) {
    const current = Math.max(0, Number(items[27]) || 0);
    const start = Math.max(0, Number(farm.foodRestoreTime) || 0);
    if (current >= rule.countMax) {
      if (start) { farm.foodRestoreTime = 0; changed = true; }
    } else if (!start || start > now) { farm.foodRestoreTime = now; changed = true; }
    else {
      const ticks = Math.floor((now - start) / (rule.time * 1000));
      if (ticks > 0) {
        items[27] = Math.min(rule.countMax, current + ticks * rule.count);
        farm.foodRestoreTime = items[27] >= rule.countMax ? 0 : start + ticks * rule.time * 1000;
        changed = true;
      }
    }
  }
  return changed;
}
function timeRecords(player) { return { 27: Math.max(0, Number(player.farmInfo?.foodRestoreTime) || 0) }; }
function packets(player) { return [
  { tag: 1220, msgUid: 0, data: { itemId:27,time:timeRecords(player)[27] } },
  { tag: 1202, msgUid: 0, data: { items: [], changed: [27,29].map(id=>({id,count:Number(player.items?.[id])||0})) } },
]; }
module.exports = { settle, timeRecords, packets };

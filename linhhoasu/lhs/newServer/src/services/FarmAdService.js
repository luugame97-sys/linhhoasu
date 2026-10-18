'use strict';
const config = require('./ConfigService');
function claim(player, id, now = Date.now()) {
  const row = (config.get('AdvertisementConfig') || {})[id];
  if (![1, 2, 5].includes(id) || !row) return { ok: false, code: 'INVALID_FARM_AD' };
  // Custom daily support replaces ads for this feature; never pretend a
  // client telemetry packet proves a viewed advertisement.
  const policy = require('./FarmPolicyService');
  if (!policy.policy.dailySupport.enabled || !policy.unlocked(player)) return { ok: false, code: 'FARM_SUPPORT_LOCKED' };
  player.other_attr_info ||= {}; player.rechargeInfo ||= {};
  const info = player.other_attr_info.adInfo ||= {};
  const today = require('./GameDayService').key(now);
  info.farmDays ||= {}; info.records ||= {}; info.timeRecords ||= {};
  const last = Number(info.timeRecords[id] || player.rechargeInfo.adTimeRecords?.[id]) || 0;
  const lastDay = require('./GameDayService').key(last);
  const used = info.farmDays[id] === today || lastDay === today ? Number(info.records[id] || player.rechargeInfo.adRecords?.[id]) || 0 : 0;
  if (used >= row.count) return { ok: false, code: 'FARM_AD_DAILY_LIMIT' };
  const cooldown = Math.max(Number(row.cd)||0, policy.policy.dailySupport.cooldownSeconds);
  if (now < last + cooldown * 1000) return { ok: false, code: 'FARM_AD_COOLDOWN' };
  info.farmDays[id] = today; info.records[id] = used + 1; info.timeRecords[id] = now;
  player.rechargeInfo.adRecords = { ...(player.rechargeInfo.adRecords || {}), [id]: used + 1 };
  player.rechargeInfo.adTimeRecords = { ...(player.rechargeInfo.adTimeRecords || {}), [id]: now };
  const rewards = id === 2 ? [{ id: 27, count: (config.get('PlantLevelConfig') || {})[player.farmInfo?.lv || 1]?.pPlantFoodAdCount || 0 }] : row.rewards || [];
  return { ok: true, rewards, seconds: Number(row.rewardTime) || 0 };
}
module.exports = { claim };

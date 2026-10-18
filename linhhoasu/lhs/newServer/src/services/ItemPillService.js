'use strict';
const config = require('./ConfigService');
function dayKey(now = Date.now()) {
  return require('./GameDayService').key(now);
}
function groupFor(id) {
  const asset = (config.get('AssetsConfig') || {})[id];
  return asset && asset.type === 8 && [2, 4].includes(asset.subType) ? -(800 + asset.subType) : 0;
}
function ensure(player, now = Date.now()) {
  player.other_attr_info = player.other_attr_info || {};
  player.itemUseRecords = player.itemUseRecords || {};
  const today = dayKey(now);
  let daily = player.other_attr_info.itemPillDaily;
  if (!daily || typeof daily !== 'object') daily = { day: today };
  if (daily.day !== today) {
    player.itemUseRecords[-802] = 0;
    player.itemUseRecords[-804] = 0;
    daily.day = today;
  }
  for (const key of [-802, -804]) player.itemUseRecords[key] = Math.max(0, Number(player.itemUseRecords[key]) || 0);
  player.other_attr_info.itemPillDaily = daily;
  return player.itemUseRecords;
}
function privilegeAdd(player, group, now = Date.now()) {
  let add = 0;
  for (const cfg of Object.values(config.get('PrivilegeConfig') || {})) {
    if (Number(player.rechargeInfo?.monthCards?.[cfg.id]) > now) add += Number(cfg.groups?.[group]) || 0;
  }
  const owned = player.other_attr_info?.curiosInfo?.curiosData || [];
  for (const cfg of Object.values(config.get('CuriosEchoConfig') || {})) {
    const tiers = Object.keys(cfg.addPrivilege || {}).map(Number).sort((a, b) => b - a);
    const tier = tiers.find(t => (cfg.suit || []).length && cfg.suit.every(id => owned.some(row => row.id === id && row.star >= t)));
    if (tier !== undefined) add += Number(cfg.addPrivilege[tier]?.[group]) || 0;
  }
  const appearance = require('./RoleAppearanceService');
  for (const variants of Object.values(config.get('FashionBathConfig') || {})) {
    for (const cfg of Object.values(variants || {})) {
      const ids = cfg.fashionIds || [];
      if (ids.length && ids.every(id => appearance.hasFashionOwnership(player, id))) add += Number(cfg.privilege?.[group]) || 0;
    }
  }
  return Math.max(0, add);
}
function plan(player, id, count, now = Date.now()) {
  const group = groupFor(id);
  if (!group) return null;
  const cfg = (config.get('AssetsUseConfig') || {})[id];
  if (cfg?.type !== 103 || !cfg.rewards?.length || Object.keys(cfg.attrs || {}).length) return null;
  const records = ensure(player, now);
  const base = config.get('AlchemyBaseConfig') || {};
  const cap = Number(group === -802 ? base.expPillDailyCount : base.energyPillDailyCount) + privilegeAdd(player, group === -802 ? 4 : 3, now);
  const used = records[group];
  return { group, used, cap, ok: Number.isSafeInteger(count) && count > 0 && Number.isFinite(cap) && used + count <= cap };
}
function commit(player, plan, count) {
  player.itemUseRecords[plan.group] = plan.used + count;
}
function permanentLimit(player, id) {
  const asset = (config.get('AssetsConfig') || {})[id];
  const use = (config.get('AssetsUseConfig') || {})[id];
  if (asset?.type !== 8 || use?.limitType !== 4 || !(use.limit > 0)) return null;
  const group = (config.get('AlchemyElixirConfig') || {})[id]?.subType;
  return { cap: use.limit + (group == null ? 0 : privilegeAdd(player, group)),
    used: Math.max(0, Number(player.itemUseRecords?.[id]) || 0, Number(player.other_attr_info?.record?.[id]) || 0) };
}
module.exports = { dayKey, groupFor, ensure, privilegeAdd, plan, commit, permanentLimit };

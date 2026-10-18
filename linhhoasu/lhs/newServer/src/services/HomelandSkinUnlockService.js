'use strict';
// Only native skins backed by both HomelandSkinConfig and its exact ShopConfig unlock.
const config = require('./ConfigService');
const integrity = require('./FishingIntegrityService');
const integer = (n, min = 0) => Number.isSafeInteger(n) && n >= min;

function skinRow(id) { return config.get('HomelandSkinConfig')?.[id] || null; }
function canUse(player, id) { return id === 0 || (!!skinRow(id) && Number(player.items?.[id] || 0) > 0); }
function isSkinShop(id) { return Number(id) >= 13190051 && Number(id) <= 13190055; }
function bonusBps(player) {
  return Object.values(config.get('HomelandSkinConfig') || {}).reduce((n, row) => {
    const value = Number(row.attrs?.[703] || 0);
    return Number(player.items?.[row.id] || 0) > 0 && integer(value) ? n + value : n;
  }, 0);
}

async function unlock(params, session, msgUid) {
  const fail = reason => ({ tag: 1202, msgUid, data: { result: 1, reason } });
  if (!session.player) return fail('HOMELAND_SESSION_REQUIRED');
  const entries = Object.entries(params.require || {});
  if (entries.length !== 1) return fail('HOMELAND_SKIN_SINGLE_UNLOCK');
  const [key, count] = entries[0], shopId = Number(key);
  if (count !== 1) return fail('HOMELAND_SKIN_COUNT_INVALID');
  const row = Object.values(config.get('HomelandSkinConfig') || {}).find(r => r.unlock === shopId);
  const shop = config.get('ShopConfig')?.[shopId];
  if (!row || !shop || shop.payId || shop.cost?.length !== 1 || shop.rewards?.length !== 1
      || shop.rewards[0].id !== row.id || shop.rewards[0].count !== 1) return fail('HOMELAND_SKIN_UNAVAILABLE');
  const cost = shop.cost[0];
  if (!integer(cost.id, 1) || !integer(cost.count, 1)) return fail('HOMELAND_SKIN_CONFIG_INVALID');
  const p = session.player;
  if (Number(p.items?.[row.id] || 0) > 0) return fail('HOMELAND_SKIN_ALREADY_OWNED');
  const have = Number(p.items?.[cost.id] || 0);
  if (!integer(have) || have < cost.count) return fail('HOMELAND_SKIN_PIECES_NOT_ENOUGH');
  const next = integrity.clone(p);
  next.items[cost.id] = have - cost.count; next.items[row.id] = 1;
  next.shopInfo ||= {}; next.shopInfo.buyRecords ||= {}; next.shopInfo.buyRecords[shopId] = 1;
  session.player = next;
  await integrity.save(session);
  session._itemListCache = null;
  const changes = [{ id: cost.id, count: next.items[cost.id] }, { id: row.id, count: 1 }];
  return [
    { tag: 1202, msgUid: 0, data: { result: 0, items: [{ id: cost.id, count: -cost.count }, { id: row.id, count: 1 }], changed: changes } },
    { tag: 1202, msgUid, data: { result: 0, ids: [shopId], items: [{ id: row.id, count: 1 }], changed: changes,
      rewardInfo: { items: [{ id: row.id, count: 1 }], equips: [] } } },
  ];
}

module.exports = { skinRow, canUse, isSkinShop, bonusBps, unlock };

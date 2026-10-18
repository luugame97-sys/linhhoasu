'use strict';
const config = require('./ConfigService');
const mutation = require('./PlayerMutationService');
const receipts = require('./FeatureReceiptService');
const players = require('./PlayerService');
const runtime = require('./RuntimeBus');
function scoped(id) {
  const row = (config.get('ShopConfig') || {})[id];
  return !!row && (row.tab === 6 || row.id === 104 || (row.rewards || []).some(x => (config.get('AssetsConfig') || {})[x.id]?.type === 9));
}
function costRows(goods, bought) {
  if (bought <= 0 || !goods.costAgain?.length) return goods.cost || [];
  return goods.costAgain[bought - 1] || goods.costAgain[goods.costAgain.length - 1];
}
const GMT7_OFFSET_MS = 7 * 60 * 60 * 1000;

function getShopDayKey(now = Date.now()) {
  return Math.floor((now + GMT7_OFFSET_MS) / 86400000);
}

function getShopWeekKey(now = Date.now()) {
  return Math.floor((getShopDayKey(now) + 3) / 7);
}

function needsReset(player, now = Date.now()) {
  if (!player) return false;
  const currentShopDay = getShopDayKey(now);
  const currentShopWeek = getShopWeekKey(now);
  const todayFarm = require('./GameDayService').key(now);

  const prevShopDay = player.shopInfo?.shopDayKey;
  const prevShopWeek = player.shopInfo?.shopWeekKey;
  const prevFarm = player.shopInfo?.farmShopDay;

  if (prevShopDay != null && prevShopDay !== currentShopDay) return true;
  if (prevShopWeek != null && prevShopWeek !== currentShopWeek) return true;
  if (prevFarm != null && prevFarm !== todayFarm) return true;

  if (prevShopDay == null) {
    const lastBuyTime = Number(player.shopInfo?.lastBuyTime) || 0;
    const lastBuyShopDay = lastBuyTime > 0 ? getShopDayKey(lastBuyTime) : 0;
    if (lastBuyShopDay === 0 || lastBuyShopDay < currentShopDay) {
      const hasRecords = Object.keys(player.shopInfo?.buyRecords || {}).length > 0
        || (player.rechargeInfo?.records || []).some(r => Number(r && r.count) > 0);
      if (hasRecords) return true;
    }
  }
  return false;
}

function resetDay(player, now = Date.now()) {
  const today = require('./GameDayService').key(now);
  const currentShopDay = getShopDayKey(now);
  const currentShopWeek = getShopWeekKey(now);

  player.shopInfo = player.shopInfo && typeof player.shopInfo === 'object' ? player.shopInfo : {};
  player.shopInfo.buyRecords = player.shopInfo.buyRecords && typeof player.shopInfo.buyRecords === 'object' ? player.shopInfo.buyRecords : {};
  player.rechargeInfo = player.rechargeInfo && typeof player.rechargeInfo === 'object' ? player.rechargeInfo : {};
  player.rechargeInfo.records = Array.isArray(player.rechargeInfo.records) ? player.rechargeInfo.records : [];

  const previousFarm = player.shopInfo.farmShopDay;
  const previousShopDay = player.shopInfo.shopDayKey;
  const previousShopWeek = player.shopInfo.shopWeekKey;
  const lastBuyTime = Number(player.shopInfo.lastBuyTime) || 0;
  const lastBuyShopDay = lastBuyTime > 0 ? getShopDayKey(lastBuyTime) : 0;

  const shouldResetDaily = (previousShopDay != null && previousShopDay !== currentShopDay)
    || (previousFarm != null && previousFarm !== today)
    || (previousShopDay == null && (lastBuyShopDay === 0 || lastBuyShopDay < currentShopDay));

  const shouldResetWeekly = (previousShopWeek != null && previousShopWeek !== currentShopWeek);

  let changed = false;
  if (shouldResetDaily || shouldResetWeekly) {
    const shopConfig = config.get('ShopConfig') || {};
    for (const goods of Object.values(shopConfig)) {
      if (!goods) continue;
      const limitType = Number(goods.limitType) || 0;
      const isDaily = limitType === 1 && shouldResetDaily;
      const isWeekly = limitType === 2 && shouldResetWeekly;
      if (!isDaily && !isWeekly) continue;

      const gId = goods.id;
      if (player.shopInfo.buyRecords[gId] !== undefined) {
        delete player.shopInfo.buyRecords[gId];
        changed = true;
      }
      if (player.shopInfo.buyRecords[String(gId)] !== undefined) {
        delete player.shopInfo.buyRecords[String(gId)];
        changed = true;
      }
      const record = player.rechargeInfo.records.find(row => Number(row && row.id) === Number(gId));
      if (record && Number(record.count) > 0) {
        record.count = 0;
        changed = true;
      }
    }
  }

  player.shopInfo.farmShopDay = today;
  player.shopInfo.shopDayKey = currentShopDay;
  player.shopInfo.shopWeekKey = currentShopWeek;
  return changed;
}
async function run(params, session, msgUid, work) {
  return mutation.run(session?.userId, async () => {
    const original = session?.player;
    if (!original) return work(session);
    const dayPackets = await require('./FarmDayService').synchronize(session);
    await players.drainPendingSaves(session.userId);
    const old = receipts.read(original, 1202, params);
    if (old) return [
      ...dayPackets,
      { tag: 1202, msgUid: 0, data: { items: [], changed: require('./CurrencySync').buildClientItemList(original) } },
      { tag: 1202, msgUid, data: old },
    ];
    const draft = JSON.parse(JSON.stringify(original)); resetDay(draft);
    const shadow = { ...session, player: draft, _farmShopDraft: true };
    let result;
    try {
      result = await work(shadow);
      const list = Array.isArray(result) ? result : [result];
      const response = list.find(p => p.tag === 1202 && p.msgUid === msgUid);
      if (response?.data?.result !== 0) return [...dayPackets, ...list];
      receipts.record(draft, 1202, params, response.data);
      const saved = await players.savePlayer(session.userId, draft, { returnSaved: false });
      if (!saved) throw new Error('FARM_SHOP_SAVE_NOT_CONFIRMED');
    } catch (error) {
      runtime.getWsServer()?.invalidatePlayerForMutation(session.userId);
      session.player = null; throw error;
    }
    Object.assign(original, draft); session._itemListCache = null;
    return [...dayPackets, ...(Array.isArray(result) ? result : [result])];
  });
}
module.exports = { scoped, costRows, resetDay, run, getShopDayKey, getShopWeekKey, needsReset };

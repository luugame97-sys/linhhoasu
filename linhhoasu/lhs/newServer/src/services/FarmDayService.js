'use strict';
const day = require('./GameDayService');
const farmShop = require('./FarmShopService');

function shouldSync(player, now = Date.now()) {
  if (!player) return false;
  const today = day.key(now);
  if (player.other_attr_info?.farmGameDay !== today) return true;
  return farmShop.needsReset(player, now);
}

function prepare(player, now = Date.now()) {
  const today = day.key(now);
  player.other_attr_info ||= {};
  const shopChanged = farmShop.resetDay(player, now);
  let farmChanged = false;
  if (player.other_attr_info.farmGameDay !== today) {
    farmChanged = true;
    const info = player.alchemyInfo ||= {};
    if (info.dayKey != null && info.dayKey !== today) info.dayCount = 0;
    info.dayKey = today;
    require('./ItemPillService').ensure(player, now);
    player.rechargeInfo ||= {};
    const ad = player.other_attr_info.adInfo ||= {};
    ad.records ||= {}; ad.timeRecords ||= {}; ad.farmDays ||= {};
    player.rechargeInfo.adRecords ||= {};
    for (const id of [1, 2, 5]) {
      if (ad.farmDays[id] !== today && day.key(Number(ad.timeRecords[id] || player.rechargeInfo.adTimeRecords?.[id]) || 0) !== today) {
        ad.records[id] = 0; player.rechargeInfo.adRecords[id] = 0;
      }
      ad.farmDays[id] = today;
    }
    player.other_attr_info.farmGameDay = today;
  }
  return shopChanged || farmChanged;
}
function packet(player) {
  return { tag: 2498, msgUid: 0, data: { policy: require('./FarmPolicyService').policy, dayKey: day.key(), dayCount: player.alchemyInfo?.dayCount || 0,
    shopRecords: player.rechargeInfo?.records || [], adRecords: player.rechargeInfo?.adRecords || {},
    adTimeRecords: player.rechargeInfo?.adTimeRecords || {},
    useRecords: require('../handlers/item').buildUseRecordsPayload(player),
    seedCap: require('./ConfigService').get('PlantBuildConfig')?.[3]?.[player.farmInfo?.buildLv?.[3] || 1]?.attrs?.[4] || 5 } };
}
async function synchronize(session, now = Date.now()) {
  if (!session?.player || !shouldSync(session.player, now)) return [];
  return require('./PlayerMutationService').run(session.userId, async () => {
    if (!session.player || !shouldSync(session.player, now)) return [];
    const players = require('./PlayerService');
    await players.drainPendingSaves(session.userId);
    const original = session.player, draft = JSON.parse(JSON.stringify(original));
    prepare(draft, now);
    try { if (!await players.savePlayer(session.userId, draft, { returnSaved: false })) throw new Error('FARM_DAY_SAVE_FAILED'); }
    catch (e) { require('./RuntimeBus').getWsServer()?.invalidatePlayerForMutation(session.userId); session.player = null; throw e; }
    Object.assign(original, draft); session._itemListCache = null;
    return [packet(original)];
  });
}
module.exports = { prepare, packet, synchronize, shouldSync };

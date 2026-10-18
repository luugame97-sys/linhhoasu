/** Shared fishing validation. Never repairs or rerolls historical fish. */
'use strict';
const config = require('./ConfigService');
const playerService = require('./PlayerService');
const int = (v, fallback = 0) => Number.isFinite(Number(v)) ? Math.floor(Number(v)) : fallback;
const clone = value => JSON.parse(JSON.stringify(value));

async function save(session) {
  if (!session || !session.userId || !session.player) throw new Error('FISH_SESSION_REQUIRED');
  try {
    const saved = await playerService.savePlayer(session.userId, session.player, { returnSaved: false });
    if (!saved) throw new Error('FISH_SAVE_NOT_CONFIRMED');
  } catch (error) {
    // A timeout may have committed. Do not save stale rollback state on close.
    session.player = null;
    throw error;
  }
}

function validInt(value, min, max) {
  return Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max;
}

function hasCard(player, id) {
  return Number(player.rechargeInfo?.monthCards?.[id] || 0) > Date.now();
}

function ownsGear(player, table, id, initialId) {
  const row = (config.get(table) || {})[id];
  if (!row || !validInt(id, 1, Number.MAX_SAFE_INTEGER)) return false;
  return Number(id) === initialId || (row.isPrivilege
    ? hasCard(player, row.shopId) : Number(player.items?.[id] || 0) > 0);
}

function dayKey(now = Date.now()) {
  // Same local server calendar used by the other daily gameplay handlers.
  const date = new Date(now);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

function resetDailyOrders(info, now = Date.now()) {
  const day = dayKey(now);
  if (info.orderDayKey && info.orderDayKey !== day) {
    info.orders = [80001, 80015, 80046].map(id => ({ id, progress: 0, received: false }));
  }
  // First versioned access preserves progress: no historical backfill/extra reward.
  info.orderDayKey = day;
}

async function canUseScene(player, sceneId) {
  const row = (config.get('FishSceneConfig') || {})[sceneId];
  if (!row) return false;
  if (row.isActivity) {
    const events=require('./FishingEventSchedule');
    return events.current().some(w=>events.active(player,w.id)&&Number(config.get('Activity33Config')?.[w.id]?.sceneId)===Number(sceneId));
  }
  if (!Array.isArray(row.fishes) || !row.fishes.length) return false;
  // Normal fishing grounds unlock by fishing level only, independent of server age.
  // Activity scenes still fail closed above; no change to their event availability.
  return int(player.fishInfo?.level, 1) >= int(row.cond, 1);
}

function unlockPic(info, fish) {
  const cfg = (config.get('FishConfig') || {})[fish.id];
  if (!cfg) return;
  const old = info.pics[fish.id];
  info.pics[fish.id] = { id: fish.id, multi: Math.max(int(old?.multi), int(fish.multi)) };
  info.fishTypeQualityPic[cfg.type] = Math.max(int(info.fishTypeQualityPic[cfg.type]), int(cfg.quality));
}

function fishingMultiplier(player, fishType, attrIndex) {
  const info = player.fishInfo || {};
  let allFish = 1;
  if (hasCard(player, 11000009)) allFish += Number((config.get('FishBaseConfig') || {}).privilegeAttr || 0) / 10000;
  let gear = 0;
  for (const row of info.rodAttrs || []) if (Number(row.type) === 101) gear += Number(row.value || 0) / 10000;
  const raft = (config.get('FishRaftGradeConfig') || {})[info.raftRank];
  gear += Number(raft?.attrs?.[101] || 0) / 10000;
  allFish += gear;
  let soulBonus = 0;
  for (const soul of info.fishSoulSlots?.[fishType] || []) {
    soulBonus += Math.floor(Number(soul.minAddRate?.[attrIndex] || 0) * (Number(soul.multi || 0) / 10000));
  }
  return allFish + soulBonus / 10000;
}

function grant(player, rows) {
  const item = require('../handlers/item');
  const reward = require('./RewardGrantService');
  reward.assertRewardRowsSupported(rows);
  const result = item.addRewardRowsToPlayer(player, rows, 1);
  return { ...result, packets: reward.buildNativeSyncPackets(player, result.rewardInfo) };
}

module.exports = { save, validInt, hasCard, ownsGear, dayKey, resetDailyOrders, canUseScene, unlockPic, fishingMultiplier, grant, clone };

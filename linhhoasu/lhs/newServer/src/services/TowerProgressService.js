/**
 * Hư Thiên Bảo Điện (TowerConfig / ClimbingTowerModel, RPC 2300 type 9) progress rules.
 *
 * Native help text (LanguageConfig 30033016):
 * - one bonus pick per `TowerBaseConfig.addAttr` (10) floors cleared;
 * - bonuses only apply inside the tower;
 * - quick challenge advances to a few floors below the historical best and pays
 *   the TowerRewardConfig speed-clear reward ("速通奖励") of that tier, then the
 *   player picks bonuses for the floors it passed.
 *
 * The native client sends quick challenge as RPC 2300 {type: 9, index: 0}
 * (ClimbingTowerModel.onFighting(3)); a normal fight sends index = curlayer + 1.
 */

const config = require('./ConfigService');
const rank = require('./RankService');
const logger = require('../logger');

const SWEEP_REWARD_MODES = new Set(['tier', 'cumulative']);

function toSafeInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function getConfigTable(name) {
  const table = config.get(name);
  return table && typeof table === 'object' && !Array.isArray(table) ? table : {};
}

function getConfigRow(table, id) {
  const safeId = toSafeInt(id, 0);
  if (safeId <= 0) return null;
  return table[safeId] || table[String(safeId)] || null;
}

function listConfigRows(table) {
  return Object.keys(table)
    .filter((key) => toSafeInt(key, 0) > 0)
    .map((key) => table[key])
    .filter((row) => row && typeof row === 'object');
}

// Same as ClimbingTowerModel.getCfgMaxLevel (row count of TowerConfig).
function getCfgMaxLevel() {
  return listConfigRows(getConfigTable('TowerConfig')).length;
}

// Mirrors ClimbingTowerModel.getSweepLevel inside getCurTowerState: at the config
// cap the client sweeps from cap - 1, so maxlayer 800 sweeps to 770 and 505 to 480.
function getSweepTarget(maxlayer, cfgMax = getCfgMaxLevel()) {
  const cap = Math.max(0, toSafeInt(cfgMax, 0));
  if (cap <= 0) return 0;
  const best = Math.max(0, toSafeInt(maxlayer, 0));
  const history = best >= cap ? cap - 1 : best;
  return Math.min(cap, Math.max(10 * (Math.floor(history / 10) - 2), 0));
}

function isSweepRequest(params) {
  if (!params || typeof params !== 'object') return false;
  if (toSafeInt(params.levelId, 0) > 0) return false;
  const raw = params.index;
  if (raw === undefined || raw === null || raw === '') return false;
  return Number(raw) === 0;
}

function getSkillInterval() {
  const interval = toSafeInt(getConfigTable('TowerBaseConfig').addAttr, 0);
  return interval > 0 ? interval : 10;
}

// Bonus picks earned by clearing floors fromLayer+1..toLayer. A pick opens each
// block of 10 (floors 1, 11, 21, ...), matching attrCond slot unlocks at 1/31/61.
function countSkillPicks(fromLayer, toLayer) {
  const from = Math.max(0, toSafeInt(fromLayer, 0));
  const to = Math.max(0, toSafeInt(toLayer, 0));
  if (to <= from) return 0;
  const interval = getSkillInterval();
  return Math.ceil(to / interval) - Math.ceil(from / interval);
}

// "tier" (default) pays only the TowerRewardConfig row of the sweep floor, as the
// native help text describes; "cumulative" pays every tier passed in this sweep.
function getSweepRewardMode() {
  const mode = String(process.env.TOWER_SWEEP_REWARD_MODE || 'tier').trim().toLowerCase();
  return SWEEP_REWARD_MODES.has(mode) ? mode : 'tier';
}

function mergeRewards(rows = []) {
  const merged = new Map();
  rows.forEach((row) => {
    const id = Math.max(0, toSafeInt(row && row.id, 0));
    const count = Math.max(0, toSafeInt(row && row.count, 0));
    if (id <= 0 || count <= 0) return;
    merged.set(id, (merged.get(id) || 0) + count);
  });
  return Array.from(merged, ([id, count]) => ({ id, count }));
}

function buildSweepRewards(target, mode = getSweepRewardMode(), fromLayer = 0) {
  const floor = Math.max(0, toSafeInt(target, 0));
  const from = Math.max(0, toSafeInt(fromLayer, 0));
  const tiers = listConfigRows(getConfigTable('TowerRewardConfig'))
    .filter((row) => {
      const id = toSafeInt(row.id, 0);
      return id > 0 && id <= floor && Array.isArray(row.rewards);
    })
    .sort((a, b) => toSafeInt(a.id, 0) - toSafeInt(b.id, 0));
  if (tiers.length <= 0) return [];
  const paid = mode === 'cumulative'
    ? tiers.filter((row) => toSafeInt(row.id, 0) > from)
    : [tiers[tiers.length - 1]];
  return mergeRewards(paid.reduce((list, row) => list.concat(row.rewards), []));
}

// Null when the native client would not show the quick-challenge button
// (getCurTowerState() !== 3): nothing below the sweep floor is left today.
function buildSweepPlan(towerInfo) {
  const from = Math.max(0, toSafeInt(towerInfo && towerInfo.curlayer, 0));
  const target = getSweepTarget(towerInfo && towerInfo.maxlayer);
  if (target <= from) return null;
  let score = 0;
  for (let floor = from + 1; floor <= target; floor += 1) score += floor * 10;
  return {
    from,
    target,
    floors: target - from,
    picks: countSkillPicks(from, target),
    score,
    rewards: buildSweepRewards(target, getSweepRewardMode(), from),
  };
}

// Same as ClimbingTowerModel.getUnlockSlotCount: slots whose attrCond floor is reached.
function getUnlockedSlotCount(towerInfo) {
  const cond = getConfigTable('TowerBaseConfig').attrCond;
  if (!Array.isArray(cond) || cond.length <= 0) return Number.MAX_SAFE_INTEGER;
  const cap = getCfgMaxLevel();
  const next = Math.max(0, toSafeInt(towerInfo && towerInfo.curlayer, 0)) + 1;
  const level = cap > 0 ? Math.min(next, cap) : next;
  return cond.filter((value) => toSafeInt(value, 0) <= level).length;
}

// Attributes of the unlocked bonus slots, value = TowerAttrConfig.attrs * lv
// (ClimbingTowerModel.getSkillAttrData). Only for tower battles.
function getTowerBattleAttrs(towerInfo) {
  const attrs = {};
  const slots = Array.isArray(towerInfo && towerInfo.slotlist) ? towerInfo.slotlist : [];
  const active = Math.min(slots.length, getUnlockedSlotCount(towerInfo));
  const attrTable = getConfigTable('TowerAttrConfig');
  for (let index = 0; index < active; index += 1) {
    const slot = slots[index];
    const row = slot ? getConfigRow(attrTable, slot.id) : null;
    if (!row || !row.attrs || typeof row.attrs !== 'object') continue;
    const level = Math.max(1, toSafeInt(slot.lv, 1));
    Object.keys(row.attrs).forEach((key) => {
      const attrId = toSafeInt(key, 0);
      const value = toSafeInt(row.attrs[key], 0);
      if (attrId > 0 && value > 0) attrs[attrId] = toSafeInt(attrs[attrId], 0) + value * level;
    });
  }
  return attrs;
}

function isRankEligible(player) {
  if (!player || !player.playerId) return false;
  if (player.isBot === true || player.managedBot === true) return false;
  return !/^lhs_real_bot_/.test(String(player.userId || ''));
}

// The tower rank (2700/3701) is keyed by maxlayer; login already syncs it, this
// keeps it current after a new best floor. Never fails the fight.
async function syncTowerRank(player) {
  if (!isRankEligible(player)) return false;
  const maxlayer = Math.max(0, toSafeInt(player.swordInfo && player.swordInfo.maxlayer, 0));
  if (maxlayer <= 0) return false;
  try {
    await rank.updateScore('tower', player.playerId, maxlayer);
    return true;
  } catch (err) {
    logger.warn(`[Tower] rank sync failed player=${player.playerId}: ${err.message}`);
    return false;
  }
}

module.exports = {
  getCfgMaxLevel,
  getSweepTarget,
  isSweepRequest,
  getSkillInterval,
  countSkillPicks,
  getSweepRewardMode,
  buildSweepRewards,
  buildSweepPlan,
  getUnlockedSlotCount,
  getTowerBattleAttrs,
  syncTowerRank,
};

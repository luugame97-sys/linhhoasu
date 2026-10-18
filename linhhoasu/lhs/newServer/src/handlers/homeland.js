/**
 * Homeland handlers.
 * tag: 6700~6742
 */

const configService = require('../services/ConfigService');
const { addRewardToPlayer } = require('./raid');
const gameDay = require('../services/GameDayService');
const { buildRewardItemSync } = require('../services/RewardSync');
const homelandMutation = require('../services/HomelandMutationService');

function toSafeInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function ensurePlainObject(value, fallback = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...fallback };
  }
  return value;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

// All Homeland writes go through the feature mutation snapshot.  The wrapper
// supplies a Mongo CAS preimage; a failed/uncertain save therefore never
// publishes the draft back to the socket session.
async function saveHomeland(session, player) {
  session.player = player;
  session.homelandNeedsSave = true;
}

function getHomelandBuildingConfigMap() {
  const cfg = configService.get('HomelandBuildingConfig');
  return cfg && typeof cfg === 'object' && !Array.isArray(cfg) ? cfg : {};
}

function getDefaultHomelandMapId() {
  const base = ensurePlainObject(configService.get('HomelandBaseConfig'));
  const initMap = toSafeInt(base.initMap, 0);
  const tileSceneCfg = ensurePlainObject(configService.get('TileSceneConfig'));
  if (initMap > 0 && (tileSceneCfg[initMap] || tileSceneCfg[String(initMap)])) return initMap;
  const ids = Object.keys(tileSceneCfg)
    .map((key) => toSafeInt(key, 0))
    .filter((id) => id > 0)
    .sort((a, b) => a - b);
  return ids[0] || 1001;
}

function pickDefaultBuildingId() {
  const cfg = getHomelandBuildingConfigMap();
  const ids = Object.keys(cfg)
    .map((key) => toSafeInt(key, 0))
    .filter((id) => id > 0 && cfg[id] && toSafeInt(cfg[id].isShow, 1) !== 0)
    .sort((a, b) => a - b);
  return ids[0] || 170011;
}

function isClientHomelandBuildingId(id) {
  const safeId = Math.max(0, toSafeInt(id, 0));
  if (safeId <= 0) return false;
  const cfg = getHomelandBuildingConfigMap();
  if (Object.keys(cfg).length <= 0) return safeId === 170011 || safeId === 170013 || safeId === 170021;
  return !!(cfg[safeId] || cfg[String(safeId)]);
}

function normalizeHomelandBuildingId(id, fallback = pickDefaultBuildingId()) {
  const safeId = Math.max(0, toSafeInt(id, 0));
  if (isClientHomelandBuildingId(safeId)) return safeId;
  return isClientHomelandBuildingId(fallback) ? fallback : pickDefaultBuildingId();
}

function normalizeHomelandLayout(layout) {
  const source = ensurePlainObject(layout);
  const normalized = {};
  Object.keys(source).forEach((key) => {
    if (!isClientHomelandBuildingId(key)) return;
    const list = ensureArray(source[key])
      .map((row) => ensurePlainObject(row))
      .map((row) => ({
        x: Math.max(0, toSafeInt(row.x, 0)),
        y: Math.max(0, toSafeInt(row.y, 0)),
        dir: Math.max(0, toSafeInt(row.dir, 0)),
      }));
    if (list.length > 0) normalized[String(toSafeInt(key, 0))] = list;
  });
  return normalized;
}

function normalizeRewards(rows = []) {
  const map = new Map();
  ensureArray(rows).forEach((row) => {
    const id = Math.max(0, toSafeInt(row && row.id, 0));
    const count = Math.max(0, toSafeInt(row && row.count, 0));
    if (id <= 0 || count <= 0) return;
    map.set(id, (map.get(id) || 0) + count);
  });
  const rewards = [];
  map.forEach((count, id) => rewards.push({ id, count }));
  rewards.sort((a, b) => a.id - b.id);
  return rewards;
}

function buildRewardInfo(rows = []) {
  return {
    items: normalizeRewards(rows),
    equips: [],
    heros: [],
    extraReward: {},
  };
}

function grantRewardInfo(player, rows = []) {
  const rewardInfo = buildRewardInfo(rows);
  rewardInfo.items.forEach((row) => addRewardToPlayer(player, row.id, row.count));
  return rewardInfo;
}

function grantPositionalRewardInfo(player, rows = []) {
  const items = ensureArray(rows)
    .map((row) => ({ id: toSafeInt(row && row.id, 0), count: toSafeInt(row && row.count, 0) }))
    .filter((row) => row.id > 0 && row.count > 0);
  items.forEach((row) => addRewardToPlayer(player, row.id, row.count));
  // HomelandDrawRewardView pairs rewards[i] with rewardInfo.items[i]. Do not
  // merge or sort this array even when two draws return the same item.
  return { items, equips: [], heros: [], extraReward: {} };
}

function getCurrencyKeyById(itemId) {
  switch (toSafeInt(itemId, 0)) {
    case 1: return 'diamond';
    case 2: return 'silver';
    case 6: return 'gold';
    default: return null;
  }
}

function getItemOrCurrencyCount(player, itemId) {
  const id = Math.max(0, toSafeInt(itemId, 0));
  if (id <= 0) return 0;
  const currencyKey = getCurrencyKeyById(id);
  if (currencyKey) {
    return Math.max(0, toSafeInt(player && player.currencies && player.currencies[currencyKey], 0));
  }
  return Math.max(0, toSafeInt(player && player.items && player.items[id], 0));
}

function normalizeCostRows(rows = []) {
  return normalizeRewards(rows);
}

function canConsumeCostRows(player, rows = []) {
  return normalizeCostRows(rows).every((row) => getItemOrCurrencyCount(player, row.id) >= row.count);
}

function consumeCostRows(player, rows = []) {
  const costs = normalizeCostRows(rows);
  if (!canConsumeCostRows(player, costs)) return false;

  player.currencies = player.currencies || { gold: 0, diamond: 0, silver: 0 };
  player.items = player.items || {};
  costs.forEach((row) => {
    const currencyKey = getCurrencyKeyById(row.id);
    if (currencyKey) {
      player.currencies[currencyKey] = Math.max(0, toSafeInt(player.currencies[currencyKey], 0) - row.count);
      return;
    }
    player.items[row.id] = Math.max(0, toSafeInt(player.items[row.id], 0) - row.count);
    if (player.items[row.id] <= 0) delete player.items[row.id];
  });
  return true;
}

function currentGameDayKey() {
  return String(gameDay.key());
}

function weightedPick(rows = [], weightKey = 'weight') {
  const valid = ensureArray(rows).filter((row) => row && Number(row.id) > 0
    && Number(row[weightKey]) > 0);
  if (valid.length <= 0) return null;
  const total = valid.reduce((sum, row) => sum + Number(row[weightKey]), 0);
  let roll = Math.random() * total;
  for (const row of valid) {
    roll -= Number(row[weightKey]);
    if (roll < 0) return row;
  }
  return valid[valid.length - 1];
}

function weightedPickAny(rows = [], weightKey = 'weight') {
  const valid = ensureArray(rows).filter((row) => row && Number(row[weightKey]) > 0);
  if (valid.length <= 0) return null;
  const total = valid.reduce((sum, row) => sum + Number(row[weightKey]), 0);
  let roll = Math.random() * total;
  for (const row of valid) {
    roll -= Number(row[weightKey]);
    if (roll < 0) return row;
  }
  return valid[valid.length - 1];
}

function randomInt(min, max) {
  const low = Math.min(toSafeInt(min, 0), toSafeInt(max, 0));
  const high = Math.max(toSafeInt(min, 0), toSafeInt(max, 0));
  return low + Math.floor(Math.random() * (high - low + 1));
}

function mergeAttrs(...maps) {
  const out = {};
  maps.forEach((map) => {
    Object.entries(ensurePlainObject(map)).forEach(([id, value]) => {
      const num = Number(value);
      if (Number.isFinite(num) && num > 0) out[id] = Math.floor(num);
    });
  });
  return out;
}

function resolvePrayBuff(info, groupOverride = 0) {
  const level = Math.max(1, toSafeInt(info && info.lv, 1));
  const levelCfg = getConfigRow('HomelandLevelConfig', level) || {};
  const buffTable = ensurePlainObject(configService.get('HomelandBuffConfig'));
  const weights = ensurePlainObject(levelCfg.buff);
  const candidates = Object.entries(weights)
    .map(([id, weight]) => ({ id: toSafeInt(id, 0), weight: toSafeInt(weight, 0) }))
    .filter((row) => row.id > 0 && row.weight > 0
      && getNestedConfigRow('HomelandBuffConfig', row.id, level));
  const picked = weightedPick(candidates);
  const group = groupOverride > 0 ? groupOverride : toSafeInt(picked && picked.id, 0);
  const row = ensurePlainObject(
    buffTable[group] && (buffTable[group][level] || buffTable[group][String(level)]),
  );
  if (!row.id) return null;
  const random = weightedPick(ensureArray(row.randomAttrs), 'count');
  const special = weightedPick(ensureArray(row.specialAttrs), 'count');
  const attrs = mergeAttrs(row.attrs,
    random ? { [random.id]: random.count } : {},
    special ? { [special.id]: special.count } : {});
  return { group, level, row, prayBuff: group * 100 + level, attrs };
}

function syncStatueCounter(player, info) {
  const dayKey = currentGameDayKey();
  const previousDay = String(info.statueDayKey || '');
  const reset = previousDay && previousDay !== dayKey;
  if (reset) info.statueTributeCount = 0;
  info.statueDayKey = dayKey;
  const legacy = reset ? 0 : Math.max(0, toSafeInt(player && player.items && player.items[-32], 0));
  info.statueTributeCount = Math.max(0, toSafeInt(info.statueTributeCount, 0), legacy);
  player.items = ensurePlainObject(player.items);
  delete player.items[-32];
  // -32 is a client-only derived counter; it is persisted in homelandInfo
  // and exposed only through the homeland payload, never as a spendable item.
  return info.statueTributeCount;
}

function statueState(player, info) {
  const base = ensurePlainObject(configService.get('HomelandBaseConfig'));
  const freeCount = Math.max(0, toSafeInt(base.statueFreeCount, 3));
  const paidCount = Math.max(0, toSafeInt(base.statuePayCount, 2));
  const used = syncStatueCounter(player, info);
  return {
    used,
    freeCount,
    paidCount,
    total: freeCount + paidCount,
    freeRemaining: Math.max(0, freeCount - used),
    paidRemaining: Math.max(0, freeCount + paidCount - Math.max(freeCount, used)),
  };
}

function buildHomelandItemSync(player, rewardItems = [], extraChanged = [], extraItems = []) {
  const sync = buildRewardItemSync(player, rewardItems);
  const byId = new Map((sync.changed || []).map((row) => [Number(row.id), row]));
  ensureArray(extraChanged).forEach((row) => {
    const id = toSafeInt(row && row.id, 0);
    if (id !== 0) byId.set(id, { id, count: Math.max(0, toSafeInt(row.count, 0)) });
  });
  sync.items = [...ensureArray(sync.items), ...ensureArray(extraItems)
    .map((row) => ({ id: toSafeInt(row && row.id, 0), count: toSafeInt(row && row.count, 0) }))
    .filter((row) => row.id !== 0)];
  sync.changed = Array.from(byId.values()).sort((a, b) => a.id - b.id);
  return sync;
}

function buildHomelandCostSync(player, costs = [], rewardItems = [], extraItems = []) {
  const rows = normalizeCostRows(costs);
  const changed = rows.map((row) => ({ id: row.id, count: getItemOrCurrencyCount(player, row.id) }));
  const deltas = rows.map((row) => ({ id: row.id, count: -row.count }));
  return buildHomelandItemSync(player, rewardItems, changed, [...deltas, ...ensureArray(extraItems)]);
}

function getConfigRow(tableName, id) {
  const table = ensurePlainObject(configService.get(tableName));
  return table[id] || table[String(id)] || null;
}

function getNestedConfigRow(tableName, firstKey, secondKey) {
  const group = ensurePlainObject(getConfigRow(tableName, firstKey));
  return group[secondKey] || group[String(secondKey)] || null;
}

function getHomelandBuildingAttrs(info = {}) {
  const attrs = {};
  const buildings = getHomelandBuildingConfigMap();
  const levels = ensurePlainObject(info.buildingLv);
  Object.entries(levels).forEach(([idKey, rawLevel]) => {
    const cfg = buildings[idKey] || buildings[String(idKey)];
    if (!cfg || toSafeInt(cfg.type, 0) !== 3) return;
    const level = Math.max(0, toSafeInt(rawLevel, 0));
    for (const [attrId, raw] of Object.entries(ensurePlainObject(cfg.buildingAttrs))) {
      const base = Number(raw) || 0;
      const up = Number(ensurePlainObject(cfg.buildingAttrsUp)[attrId]) || 0;
      attrs[attrId] = (attrs[attrId] || 0) + base + up * level;
    }
  });
  // Aquarium is a special building and therefore is not included in the
  // normal type=3 loop above.  Its configured beauty bonus still contributes
  // to the native beauty level/visitor calculation.
  const aquariumLevel = Math.max(0, toSafeInt(levels['170015'], 0));
  const aquariumCfg = getConfigRow('HomelandAquariumConfig', aquariumLevel);
  if (aquariumCfg && aquariumCfg.attrs) {
    Object.entries(ensurePlainObject(aquariumCfg.attrs)).forEach(([attrId, raw]) => {
      const value = Number(raw);
      if (Number.isFinite(value) && value > 0) attrs[attrId] = (attrs[attrId] || 0) + Math.floor(value);
    });
  }
  return attrs;
}

function getHomelandAttrLevel(info, tableName, attrId) {
  const value = Number(getHomelandBuildingAttrs(info)[String(attrId)]) || 0;
  const rows = Object.values(configService.get(tableName) || {})
    .sort((a, b) => toSafeInt(a.id, 0) - toSafeInt(b.id, 0));
  let level = rows.length > 0 ? toSafeInt(rows[0].id, 1) : 1;
  for (const row of rows) {
    level = toSafeInt(row.id, level);
    const threshold = Number(row.value);
    // Native client assigns the current row before checking the *next*
    // threshold.  Exactly 1000 points therefore advances row 1 -> row 2.
    if (Number.isFinite(threshold) && value < threshold) break;
  }
  return level;
}

function getGeomancyLevel(_player, info) {
  return getHomelandAttrLevel(info, 'HomelandStatueConfig', 1002);
}

function getProsperity(info) {
  return Number(getHomelandBuildingAttrs(info)['1001']) || 0;
}

function getPracticalityLevel(info) {
  return getHomelandAttrLevel(info, 'HomelandPracticalityConfig', 1003);
}

function getBeautyLevel(info) {
  return getHomelandAttrLevel(info, 'HomelandBeautyConfig', 1004);
}

function getCurrentResourceStock(player, info, id, now = Date.now()) {
  const buildingCfg = getConfigRow('HomelandBuildingConfig', id);
  const level = toSafeInt(info.buildingLv[String(id)], -1);
  const resourceCfg = buildingCfg && toSafeInt(buildingCfg.type, 0) === 2
    ? getNestedConfigRow('HomelandBuildngResourceConfig', id, level) : null;
  const collect = ensureCollect(info, id);
  if (!resourceCfg) return { collect, resourceCfg: null, stock: 0 };
  const practicalCfg = getConfigRow('HomelandPracticalityConfig', getPracticalityLevel(info)) || {};
  const material = ensurePlainObject(resourceCfg.material);
  const elapsed = collect.collectTime > 0 ? Math.max(0, now - collect.collectTime) : 0;
  const cycles = Math.floor(elapsed / (5 * 60 * 1000));
  const multiplier = 1 + Math.max(0, Number(ensurePlainObject(practicalCfg.materialUp)[String(id)]) || 0) / 10000;
  const produced = Math.floor(cycles * Math.max(0, toSafeInt(material.count, 0)) * multiplier);
  return { collect, resourceCfg, stock: Math.max(0, Math.min(toSafeInt(resourceCfg.materialMax, Number.MAX_SAFE_INTEGER), collect.count + produced)) };
}

function buildNormalBuildingUpgradeCost(player, buildingCfg, levelCfg) {
  const costs = [];
  const exchangeItems = [];
  const exchangeRewards = [];
  const levelUpIds = ensureArray(buildingCfg && buildingCfg.levelUpIds);
  const levelUpCounts = ensureArray(levelCfg && levelCfg.levelUpCounts);
  const resourceCount = Math.min(levelUpIds.length, levelUpCounts.length);
  for (let index = 0; index < resourceCount; index += 1) {
    costs.push({ id: levelUpIds[index], count: levelUpCounts[index] });
  }

  const pieceId = Math.max(0, toSafeInt(buildingCfg && buildingCfg.levelUpPiece, 0));
  const pieceNeed = Math.max(0, toSafeInt(levelCfg && levelCfg.levelUpPieceCount, 0));
  if (pieceId <= 0 || pieceNeed <= 0) return { costs, exchangeItems, exchangeRewards };

  const ownedPiece = getItemOrCurrencyCount(player, pieceId);
  if (ownedPiece >= pieceNeed) {
    costs.push({ id: pieceId, count: pieceNeed });
    return { costs, exchangeItems, exchangeRewards };
  }

  const baseCfg = ensurePlainObject(configService.get('HomelandBaseConfig'));
  const qualityPieces = ensurePlainObject(baseCfg.qualityPiece);
  const generalPieceId = Math.max(0, toSafeInt(qualityPieces[buildingCfg.qualityId], 0));
  const missing = pieceNeed - ownedPiece;
  if (ownedPiece > 0) costs.push({ id: pieceId, count: ownedPiece });
  if (generalPieceId > 0) {
    costs.push({ id: generalPieceId, count: missing });
    exchangeItems.push({ id: generalPieceId, count: missing });
    exchangeRewards.push({ id: pieceId, count: missing });
  } else {
    costs.push({ id: pieceId, count: missing });
  }
  return { costs, exchangeItems, exchangeRewards };
}

function randomShareCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function ensureCollect(info, id) {
  const bid = normalizeHomelandBuildingId(id);
  info.collectMap = ensurePlainObject(info.collectMap);
  const key = String(bid);
  info.collectMap[key] = ensurePlainObject(info.collectMap[key], {
    id: bid,
    count: 0,
    upgradeTime: 0,
    state: 0,
  });
  const row = info.collectMap[key];
  row.id = bid;
  row.count = Math.max(0, toSafeInt(row.count, 0));
  row.upgradeTime = Math.max(0, toSafeInt(row.upgradeTime, 0));
  if (row.upgradeTime > 0 && row.upgradeTime < 1000000000000) {
    row.upgradeTime *= 1000;
  }
  row.collectTime = Math.max(0, toSafeInt(row.collectTime, 0));
  if (row.collectTime > 0 && row.collectTime < 1000000000000) {
    row.collectTime *= 1000;
  }
  row.state = Math.max(0, toSafeInt(row.state, row.upgradeTime > 0 ? 1 : 0));
  row.assistCount = Math.max(0, toSafeInt(row.assistCount, 0));
  return row;
}

function buildCollectsArray(info) {
  return Object.keys(ensurePlainObject(info.collectMap))
    .map((key) => ensureCollect(info, key))
    .filter(Boolean)
    .sort((a, b) => a.id - b.id);
}

function ensureHomelandInfo(player) {
  if (!player || typeof player !== 'object') {
    return {
      lv: 1,
      areaLv: 1,
      mapId: getDefaultHomelandMapId(),
      layout: {},
      buildingLv: { [pickDefaultBuildingId()]: 1 },
      collectMap: {},
      fetters: [],
      likeCount: 0,
      dailyLike: [],
      dailyLikeDayKey: currentGameDayKey(),
      likeRecord: { records: [] },
      msgRecord: { leaveMsg: '', records: [] },
      visitorMap: {},
      wishId: 0,
      unlockClues: {},
      prayBuff: 0,
      prayAttrs: {},
      lastPrayBuff: 0,
      lastPrayAttrs: {},
      prayDayKey: currentGameDayKey(),
      statueDayKey: currentGameDayKey(),
      statueTributeCount: 0,
      shareLayouts: {},
      shareCode: randomShareCode(),
      prosperityRank: [],
      likeRank: [],
      aquariumFish: [],
      skinId: 0,
      exchangeHistory: [],
      lastVisitorRewardTime: 0,
      visitorRewardDayKey: currentGameDayKey(),
      enterMapInfo: { map: getDefaultHomelandMapId(), x: 1000, y: 1000, id: '' },
    };
  }

  player.homelandInfo = ensurePlainObject(player.homelandInfo);
  const info = player.homelandInfo;
  info.lv = Math.max(1, toSafeInt(info.lv, 1));
  info.areaLv = Math.max(1, toSafeInt(info.areaLv, 1));
  const defaultMapId = getDefaultHomelandMapId();
  const tileSceneCfg = ensurePlainObject(configService.get('TileSceneConfig'));
  const rawMapId = Math.max(1, toSafeInt(info.mapId, defaultMapId));
  info.mapId = tileSceneCfg[rawMapId] || tileSceneCfg[String(rawMapId)] ? rawMapId : defaultMapId;
  info.layout = normalizeHomelandLayout(info.layout);
  info.buildingLv = ensurePlainObject(info.buildingLv);
  info.collectMap = ensurePlainObject(info.collectMap);
  info.fetters = ensureArray(info.fetters)
    .map((row) => Math.max(0, toSafeInt(row, 0)))
    .filter((row) => row > 0);
  info.likeCount = Math.max(0, toSafeInt(info.likeCount, 0));
  info.dailyLike = ensureArray(info.dailyLike).map((row) => String(row));
  const likeDay = currentGameDayKey();
  if (String(info.dailyLikeDayKey || '') !== likeDay) info.dailyLike = [];
  info.dailyLikeDayKey = likeDay;
  info.aquariumFish = ensureArray(info.aquariumFish).map((row) => ensurePlainObject(row));
  info.skinId = Math.max(0, toSafeInt(info.skinId, 0));
  info.likeRecord = ensurePlainObject(info.likeRecord, { records: [] });
  info.likeRecord.records = ensureArray(info.likeRecord.records);
  info.msgRecord = ensurePlainObject(info.msgRecord, { leaveMsg: '', records: [] });
  info.msgRecord.leaveMsg = info.msgRecord.leaveMsg == null ? '' : String(info.msgRecord.leaveMsg);
  info.msgRecord.records = ensureArray(info.msgRecord.records);
  info.visitorMap = ensurePlainObject(info.visitorMap);
  info.wishId = Math.max(0, toSafeInt(info.wishId, 0));
  info.unlockClues = ensurePlainObject(info.unlockClues);
  info.prayBuff = Math.max(0, toSafeInt(info.prayBuff, 0));
  info.prayAttrs = ensurePlainObject(info.prayAttrs);
  info.lastPrayBuff = Math.max(0, toSafeInt(info.lastPrayBuff, 0));
  info.lastPrayAttrs = ensurePlainObject(info.lastPrayAttrs);
  const today = currentGameDayKey();
  if (info.prayDayKey && String(info.prayDayKey) !== today) {
    info.lastPrayBuff = info.prayBuff;
    info.lastPrayAttrs = info.prayAttrs;
    info.prayBuff = 0;
    info.prayAttrs = {};
  }
  info.prayDayKey = today;
  info.shareLayouts = ensurePlainObject(info.shareLayouts);
  info.shareCode = info.shareCode ? String(info.shareCode) : randomShareCode();
  info.prosperityRank = ensureArray(info.prosperityRank);
  info.likeRank = ensureArray(info.likeRank);
  info.exchangeHistory = ensureArray(info.exchangeHistory);
  info.lastVisitorRewardTime = Math.max(0, toSafeInt(info.lastVisitorRewardTime, 0));
  info.visitorRewardDayKey = String(info.visitorRewardDayKey || '');
  player.items = ensurePlainObject(player.items);
  if (!Object.prototype.hasOwnProperty.call(info, 'drawFreeCount')) {
    info.drawFreeCount = Math.max(0, toSafeInt(player.items[-33], 0));
  }
  info.drawFreeCount = Math.max(0, toSafeInt(info.drawFreeCount, 0));
  info.drawLuckCount = Math.max(0, toSafeInt(info.drawLuckCount, 0));
  const drawDay = currentGameDayKey();
  if (info.drawDayKey && String(info.drawDayKey) !== drawDay) {
    info.drawFreeCount = 0;
    info.drawLuckCount = 0;
  }
  info.drawDayKey = drawDay;
  delete player.items[-33];
  info.enterMapInfo = ensurePlainObject(info.enterMapInfo, { map: info.mapId, x: 1000, y: 1000, id: String(player.playerId || '') });
  const rawEnterMap = Math.max(1, toSafeInt(info.enterMapInfo.map, info.mapId));
  info.enterMapInfo.map = tileSceneCfg[rawEnterMap] || tileSceneCfg[String(rawEnterMap)] ? rawEnterMap : info.mapId;
  info.enterMapInfo.x = Math.max(0, toSafeInt(info.enterMapInfo.x, 1000));
  info.enterMapInfo.y = Math.max(0, toSafeInt(info.enterMapInfo.y, 1000));
  info.enterMapInfo.id = info.enterMapInfo.id == null ? String(player.playerId || '') : String(info.enterMapInfo.id);

  Object.keys(info.buildingLv).forEach((key) => {
    if (!isClientHomelandBuildingId(key)) delete info.buildingLv[key];
  });
  Object.keys(info.collectMap).forEach((key) => {
    if (!isClientHomelandBuildingId(key)) delete info.collectMap[key];
  });
  if (Object.keys(info.buildingLv).length === 0) {
    info.buildingLv[String(pickDefaultBuildingId())] = 1;
  }
  const buildingCfg = getHomelandBuildingConfigMap();
  Object.keys(buildingCfg).forEach((key) => {
    const row = ensurePlainObject(buildingCfg[key]);
    const id = Math.max(0, toSafeInt(row.id != null ? row.id : key, 0));
    const type = Math.max(0, toSafeInt(row.type, 0));
    if (id <= 0 || type === 3 || toSafeInt(row.spBuildingInit, 0) !== 1 || toSafeInt(row.isShow, 1) === 0) return;
    if (!Object.prototype.hasOwnProperty.call(info.buildingLv, String(id))) {
      info.buildingLv[String(id)] = 1;
    }
  });
  Object.keys(info.buildingLv).forEach((key) => {
    info.buildingLv[key] = Math.max(0, toSafeInt(info.buildingLv[key], 0));
    const collect = ensureCollect(info, key);
    const cfg = getConfigRow('HomelandBuildingConfig', collect.id);
    if (cfg && toSafeInt(cfg.type, 0) === 2 && collect.collectTime <= 0) collect.collectTime = Date.now();
  });

  syncStatueCounter(player, info);

  return info;
}

function buildHomelandSummary(player, info) {
  return {
    dbid: String(player.playerId || ''),
    playerId: String(player.playerId || ''),
    name: player.name || '',
    level: Math.max(1, toSafeInt(player.level, 1)),
    avatar: Math.max(0, toSafeInt(player.avatar, 11300)),
    avatarFrame: Math.max(-1, toSafeInt(player.avatarFrame, -1)),
    title: Math.max(0, toSafeInt(player.title, 0)),
    serverId: Math.max(1, toSafeInt(player.serverId, toSafeInt(process.env.SERVER_ID, 1001))),
    serverName: String(player.serverName || process.env.SERVER_NAME || ''),
    lv: info.lv,
    areaLv: info.areaLv,
    mapId: info.mapId,
    likeCount: info.likeCount,
  };
}

function buildHomelandMapEnterPacket(player, info, msgUid = 0) {
  return {
    tag: 6720,
    msgUid,
    data: {
      // Client compares this field with mapSceneData.playerId, not TileScene mapId.
      mapId: String(player.playerId || ''),
      id: String(player.playerId || ''),
      x: Math.max(0, toSafeInt(info.enterMapInfo && info.enterMapInfo.x, 1000)),
      y: Math.max(0, toSafeInt(info.enterMapInfo && info.enterMapInfo.y, 1000)),
      players: [],
    },
  };
}

function buildHomelandInitPayload(info = {}) {
  const { actionLedger: _ledger, ...publicInfo } = info;
  return {
    ...publicInfo,
    collects: buildCollectsArray(info),
    likeRecord: {
      records: ensureArray(info.likeRecord && info.likeRecord.records),
    },
    msgRecord: {
      leaveMsg: info.msgRecord && info.msgRecord.leaveMsg != null ? String(info.msgRecord.leaveMsg) : '',
      records: ensureArray(info.msgRecord && info.msgRecord.records),
    },
  };
}

async function handleHomelandActivateBuilding(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6700, msgUid, data: { result: -1, ids: [] } };

  const info = ensureHomelandInfo(player);
  const ids = ensureArray(params && params.ids)
    .map((row) => Math.max(1, toSafeInt(row, 0)))
    .filter((row) => isClientHomelandBuildingId(row));
  const unlocked = [];
  ids.forEach((id) => {
    const key = String(id);
    if (!Object.prototype.hasOwnProperty.call(info.buildingLv, key)) {
      const cfg = getConfigRow('HomelandBuildingConfig', id) || {};
      const consumes = ensureArray(cfg.consumes);
      // Normal buildings are activated by their configured fragments.  A
      // special building marked spBuildingInit is the only free activation.
      if (toSafeInt(cfg.homelandLevel, 0) > info.lv || toSafeInt(cfg.homelandLevel, 0) < 0) return;
      if (toSafeInt(cfg.type, 0) === 3 && (consumes.length === 0 || !consumeCostRows(player, consumes))) return;
      if (toSafeInt(cfg.type, 0) !== 3 && toSafeInt(cfg.spBuildingInit, 0) !== 1) return;
      info.buildingLv[key] = toSafeInt(cfg.type, 0) === 3 ? 0 : 1;
      const collect = ensureCollect(info, key);
      if (toSafeInt((getConfigRow('HomelandBuildingConfig', id) || {}).type, 0) === 2
        && collect.collectTime <= 0) collect.collectTime = Date.now();
      unlocked.push(id);
    }
  });

  if (!unlocked.length) return { tag: 6700, msgUid, data: { result: 1, code: 'HOMELAND_ACTIVATION_CONDITION', ids: [] } };
  await saveHomeland(session, player);
  return { tag: 6700, msgUid, data: { result: 0, ids: unlocked } };
}

async function handleHomelandUpgradeBuilding(params, session, msgUid) {
  const player = session.player;
  const emptyResponse = (result, upgradeTime = 0) => ({
    tag: 6701,
    msgUid,
    data: {
      result,
      upgradeTime,
      exchangeItems: [],
      rewardInfo: buildRewardInfo([]),
    },
  });
  if (!player) return emptyResponse(-1);

  const info = ensureHomelandInfo(player);
  const id = Math.max(0, toSafeInt(params && params.id, 0));
  if (!isClientHomelandBuildingId(id)) return emptyResponse(1);
  const key = String(id);
  if (!Object.prototype.hasOwnProperty.call(info.buildingLv, key)) return emptyResponse(1);
  const buildingCfg = getConfigRow('HomelandBuildingConfig', id);
  if (!buildingCfg) return emptyResponse(1);
  const currentLevel = Math.max(0, toSafeInt(info.buildingLv[key], 0));
  const collect = ensureCollect(info, id);
  const buildingType = Math.max(0, toSafeInt(buildingCfg.type, 0));
  let upgradeTime = 0;
  let exchangeItems = [];
  let exchangeRewards = [];

  if (buildingType === 3) {
    const levelCfg = getNestedConfigRow('HomelandBuildingLevelConfig', buildingCfg.qualityId, currentLevel);
    const nextLevelCfg = getNestedConfigRow('HomelandBuildingLevelConfig', buildingCfg.qualityId, currentLevel + 1);
    if (!levelCfg || !nextLevelCfg) return emptyResponse(2);
    const upgrade = buildNormalBuildingUpgradeCost(player, buildingCfg, levelCfg);
    if (!consumeCostRows(player, upgrade.costs)) return emptyResponse(3);
    info.buildingLv[key] = currentLevel + 1;
    collect.state = 0;
    collect.upgradeTime = 0;
    exchangeItems = upgrade.exchangeItems;
    exchangeRewards = upgrade.exchangeRewards;
  } else if (buildingType === 2) {
    const resourceCfg = getNestedConfigRow('HomelandBuildngResourceConfig', id, currentLevel);
    const nextResourceCfg = getNestedConfigRow('HomelandBuildngResourceConfig', id, currentLevel + 1);
    const homelandLevelCfg = getConfigRow('HomelandLevelConfig', info.lv);
    const levelCap = Math.max(0, toSafeInt(homelandLevelCfg && homelandLevelCfg.buildingLevelMax, 0));
    if (!resourceCfg || !nextResourceCfg || ensureArray(resourceCfg.consumes).length === 0) return emptyResponse(2);
    if (levelCap > 0 && currentLevel >= levelCap) return emptyResponse(4);
    if (collect.upgradeTime > Date.now()) return emptyResponse(5, collect.upgradeTime);
    const activeWorkers = buildCollectsArray(info).filter((row) => row.upgradeTime > Date.now()).length;
    const availableWorkers = getItemOrCurrencyCount(player, 226) + 1;
    if (activeWorkers >= availableWorkers) return emptyResponse(6);
    if (!consumeCostRows(player, resourceCfg.consumes)) return emptyResponse(3);
    const durationMs = Math.max(1, toSafeInt(resourceCfg.levelUpTime, 0)) * 1000;
    collect.state = 1;
    collect.upgradeTime = Date.now() + durationMs;
    collect.assistCount = 0;
    upgradeTime = collect.upgradeTime;
  } else {
    return emptyResponse(2);
  }

  await saveHomeland(session, player);
  return {
    tag: 6701,
    msgUid,
    data: {
      result: 0,
      upgradeTime,
      exchangeItems,
      rewardInfo: buildRewardInfo(exchangeRewards),
    },
  };
}

async function handleHomelandCheckUpgradeBuilding(_params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6702, msgUid, data: { result: -1, collects: [] } };

  const info = ensureHomelandInfo(player);
  const nowMs = Date.now();
  const collects = [];

  Object.keys(info.collectMap).forEach((key) => {
    const row = ensureCollect(info, key);
    if (row.state === 1 && row.upgradeTime > 0 && row.upgradeTime <= nowMs) {
      row.state = 0;
      row.upgradeTime = 0;
      row.collectTime = nowMs;
      info.buildingLv[String(row.id)] = Math.max(0, toSafeInt(info.buildingLv[String(row.id)], 0) + 1);
      collects.push({ ...row });
    }
  });

  await saveHomeland(session, player);
  return { tag: 6702, msgUid, data: { result: 0, collects } };
}

async function handleHomelandCollect(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6703, msgUid, data: { result: -1, collects: [], reward: [] } };

  const info = ensureHomelandInfo(player);
  const id = Math.max(0, toSafeInt(params && params.id, 0));
  const buildingCfg = getConfigRow('HomelandBuildingConfig', id);
  const level = toSafeInt(info.buildingLv[String(id)], -1);
  const resourceCfg = buildingCfg && toSafeInt(buildingCfg.type, 0) === 2
    ? getNestedConfigRow('HomelandBuildngResourceConfig', id, level)
    : null;
  if (!buildingCfg || toSafeInt(buildingCfg.type, 0) !== 2 || level < 0 || !resourceCfg) {
    return { tag: 6703, msgUid, data: { result: 1, code: 'HOMELAND_RESOURCE_INVALID', collects: buildCollectsArray(info), reward: [] } };
  }
  const collect = ensureCollect(info, id);
  const now = Date.now();
  const practicalLevel = getPracticalityLevel(info);
  const practicalCfg = getConfigRow('HomelandPracticalityConfig', practicalLevel) || {};
  const material = ensurePlainObject(resourceCfg.material);
  const intervalMs = 5 * 60 * 1000;
  const elapsedMs = collect.collectTime > 0 ? Math.max(0, now - collect.collectTime) : 0;
  const cycles = Math.floor(elapsedMs / intervalMs);
  const multiplier = 1 + Math.max(0, Number(ensurePlainObject(practicalCfg.materialUp)[String(id)]) || 0) / 10000;
  const produced = Math.floor(cycles * Math.max(0, toSafeInt(material.count, 0)) * multiplier);
  const stock = Math.max(0, Math.min(
    toSafeInt(resourceCfg.materialMax, Number.MAX_SAFE_INTEGER),
    toSafeInt(collect.count, 0) + produced,
  ));
  if (stock <= 0) {
    return { tag: 6703, msgUid, data: { result: 1, code: 'HOMELAND_RESOURCE_NOT_READY', collects: buildCollectsArray(info), reward: [] } };
  }
  collect.count = 0;
  // Keep an unfinished production cycle.  Collecting at 5m59s must not
  // postpone the next material until 10m59s.
  collect.collectTime = collect.collectTime > 0
    ? collect.collectTime + cycles * intervalMs : now;
  const reward = [{ id: Math.max(1, toSafeInt(material.id, 0)), count: stock }];
  reward.forEach((row) => addRewardToPlayer(player, row.id, row.count));

  await saveHomeland(session, player);
  return {
    tag: 6703,
    msgUid,
    data: {
      result: 0,
      collects: buildCollectsArray(info),
      reward,
    },
  };
}

async function handleHomelandLevelUp(_params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6704, msgUid, data: { result: -1, lv: 1 } };

  const info = ensureHomelandInfo(player);
  const current = Math.max(1, toSafeInt(info.lv, 1));
  const next = getConfigRow('HomelandLevelConfig', current + 1);
  const currentCfg = getConfigRow('HomelandLevelConfig', current);
  if (!next || !currentCfg) return { tag: 6704, msgUid, data: { result: 1, code: 'HOMELAND_LEVEL_MAX', lv: current } };
  if (getProsperity(info) < Number(currentCfg.exp || 0)) {
    return { tag: 6704, msgUid, data: { result: 1, code: 'HOMELAND_PROSPERITY_NOT_ENOUGH', lv: current } };
  }
  for (const [buildingId, required] of Object.entries(ensurePlainObject(currentCfg.conditions))) {
    if (toSafeInt(info.buildingLv[buildingId], -1) < toSafeInt(required, 0)) {
      return { tag: 6704, msgUid, data: { result: 1, code: 'HOMELAND_BUILDING_CONDITION_NOT_MET', id: Number(buildingId), lv: current } };
    }
  }
  info.lv = current + 1;

  await saveHomeland(session, player);
  return { tag: 6704, msgUid, data: { result: 0, lv: info.lv } };
}

async function handleHomelandBuildingSpeedUp(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6705, msgUid, data: { result: -1 } };

  const info = ensureHomelandInfo(player);
  const id = normalizeHomelandBuildingId(params && params.id);
  const count = Math.max(1, toSafeInt(params && params.count, 1));
  const collect = ensureCollect(info, id);
  const nowMs = Date.now();

  if (collect.state === 1) {
    const useAd = toSafeInt(params && params.ad, 0) === 1;
    if (useAd) {
      const day = currentGameDayKey();
      if (String(info.adSpeedDayKey || '') !== day) {
        info.adSpeedDayKey = day;
        info.adSpeedCount = 0;
      }
      const adCfg = getConfigRow('AdvertisementConfig', 25) || {};
      const maxAds = Math.max(0, toSafeInt(adCfg.count, 0));
      if (toSafeInt(info.adSpeedCount, 0) >= maxAds) {
        return { tag: 6705, msgUid, data: { result: 1, code: 'HOMELAND_AD_LIMIT', updateInfo: null } };
      }
      info.adSpeedCount = Math.max(0, toSafeInt(info.adSpeedCount, 0)) + 1;
      const seconds = Math.max(0, toSafeInt(adCfg.rewardTime, 0));
      if (seconds <= 0) return { tag: 6705, msgUid, data: { result: 1, code: 'HOMELAND_AD_CONFIG_INVALID', updateInfo: null } };
      collect.upgradeTime = Math.max(nowMs, collect.upgradeTime - seconds * 1000);
    } else {
      if (!consumeCostRows(player, [{ id: 6, count }])) {
        return { tag: 6705, msgUid, data: { result: 1, code: 'HOMELAND_SPEED_COST_NOT_ENOUGH', updateInfo: null } };
      }
      collect.upgradeTime = Math.max(nowMs, collect.upgradeTime - count * 5 * 60 * 1000);
    }
    if (collect.upgradeTime <= nowMs) {
      collect.state = 0;
      collect.upgradeTime = 0;
      collect.collectTime = nowMs;
      info.buildingLv[String(collect.id)] = Math.max(0, toSafeInt(info.buildingLv[String(collect.id)], 0) + 1);
    }
  }

  const updateInfo = collect.upgradeTime <= 0 ? { collects: [collect] } : null;

  await saveHomeland(session, player);
  return { tag: 6705, msgUid, data: { result: 0, updateInfo } };
}

async function handleHomelandBuildingSpeedUpAssist(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6706, msgUid, data: { result: -1 } };

  const info = ensureHomelandInfo(player);
  const id = normalizeHomelandBuildingId(params && params.id);
  const collect = ensureCollect(info, id);
  if (collect.state !== 1 || collect.upgradeTime <= Date.now()) {
    return { tag: 6706, msgUid, data: { result: 1, code: 'HOMELAND_ASSIST_NOT_ACTIVE' } };
  }
  if (collect.assistCount >= 10) {
    return { tag: 6706, msgUid, data: { result: 1, code: 'HOMELAND_ASSIST_LIMIT' } };
  }
  collect.assistCount += 1;
  collect.upgradeTime = Math.max(0, collect.upgradeTime - 20 * 1000);

  await saveHomeland(session, player);
  return { tag: 6706, msgUid, data: { result: 0 } };
}

async function handleHomelandPayTribute(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6707, msgUid, data: { result: -1, code: 'PLAYER_REQUIRED' } };

  const info = ensureHomelandInfo(player);
  const state = statueState(player, info);
  const free = toSafeInt(params && params.free, 0) === 1;
  const reject = (code) => ({
    tag: 6707,
    msgUid,
    data: {
      result: 1,
      code,
      statueCount: state.used,
      freeRemaining: state.freeRemaining,
      paidRemaining: state.paidRemaining,
      rewardInfo: buildRewardInfo([]),
    },
  });

  if (state.used >= state.total) return reject('HOMELAND_STATUE_DAILY_LIMIT');
  if (free && state.used >= state.freeCount) return reject('HOMELAND_STATUE_FREE_LIMIT');
  if (!free && state.used < state.freeCount) return reject('HOMELAND_STATUE_FREE_REMAINING');

  const statueCfg = getConfigRow('HomelandStatueConfig', Math.max(1, getGeomancyLevel(player, info)));
  if (!statueCfg || !Array.isArray(statueCfg.rewards) || statueCfg.rewards.length <= 0) {
    return reject('HOMELAND_STATUE_CONFIG_INVALID');
  }
  // Client tables specify the spirit pool but not its coin conversion value.
  // Fail before spending a turn/currency until an authoritative conversion
  // table is supplied. Never invent an economy from asset quality.
  const conversions = ensurePlainObject(configService.get('HomelandStatueConversionConfig'));
  if (statueCfg.rewards.some(row => !Number.isSafeInteger(Number(conversions[row.id]?.count))
    || Number(conversions[row.id].count) <= 0 || Number(conversions[row.id].id) !== 224)) {
    return reject('HOMELAND_STATUE_CONVERSION_PENDING');
  }
  const gift = weightedPick(statueCfg.rewards);
  if (!gift) return reject('HOMELAND_STATUE_REWARD_INVALID');
  if (!free && !consumeCostRows(player, [statueCfg.cost])) return reject('HOMELAND_STATUE_COST_NOT_ENOUGH');
  const base = ensurePlainObject(configService.get('HomelandBaseConfig'));
  const range = ensureArray(base.statueTransformParam);
  const minBps = Math.max(1, toSafeInt(range[0], 9500));
  const maxBps = Math.max(minBps, toSafeInt(range[1], 10500));
  const coinCount = Math.max(1, Math.floor(conversions[gift.id].count * randomInt(minBps, maxBps) / 10000));
  const reward = { id: Math.max(1, toSafeInt(gift.id, 0)), count: 1 };
  // The native client animates the hidden 灵物 into Họa Linh Tệ (ID 224).
  // It must never refund the diamond tribute or grant silver here.
  const rewardInfo = grantRewardInfo(player, [{ id: 224, count: coinCount }]);
  info.statueTributeCount = state.used + 1;
  await saveHomeland(session, player);
  const sync = buildHomelandCostSync(player, free ? [] : [statueCfg.cost], rewardInfo.items, [{ id: -32, count: 1 }]);
  return [
    { tag: 1202, msgUid: 0, data: sync },
    {
      tag: 6707,
      msgUid,
      data: {
        result: 0,
        reward,
        rewardInfo,
        statueCount: info.statueTributeCount,
        freeRemaining: Math.max(0, state.freeCount - info.statueTributeCount),
        paidRemaining: Math.max(0, state.total - Math.max(state.freeCount, info.statueTributeCount)),
      },
    },
  ];
}

async function handleHomelandDraw(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6708, msgUid, data: { result: -1 } };

  const info = ensureHomelandInfo(player);
  const base = ensurePlainObject(configService.get('HomelandBaseConfig'));
  const count = Number(params && params.count);
  if (!Number.isSafeInteger(count) || count < 1 || count > toSafeInt(base.drawContinuous, 10)) {
    return { tag: 6708, msgUid, data: { result: 1, code: 'HOMELAND_DRAW_COUNT_INVALID' } };
  }
  const free = toSafeInt(params && params.free, 0) === 1;
  const drawCost = { id: toSafeInt(base.drawPay, 225), count };
  const dayKey = currentGameDayKey();
  if (String(info.drawDayKey || '') !== dayKey) {
    info.drawDayKey = dayKey;
    info.drawFreeCount = 0;
    info.drawLuckCount = 0;
  }
  info.drawFreeCount = Math.max(0, toSafeInt(info.drawFreeCount, 0));
  info.drawLuckCount = Math.max(0, toSafeInt(info.drawLuckCount, 0));
  if (free) {
    if (count !== 1) return { tag: 6708, msgUid, data: { result: 1, code: 'HOMELAND_DRAW_FREE_COUNT_INVALID' } };
    if (info.drawFreeCount >= Math.max(0, toSafeInt(base.drawFreeCount, 2))) {
      return { tag: 6708, msgUid, data: { result: 1, code: 'HOMELAND_DRAW_FREE_LIMIT' } };
    }
  }
  const luckRequested = toSafeInt(params && params.luck, 0) === 1;
  const luckLimit = Math.max(0, toSafeInt(base.drawLuckCount, 1));
  if (luckRequested && info.drawLuckCount >= luckLimit) {
    return { tag: 6708, msgUid, data: { result: 1, code: 'HOMELAND_DRAW_LUCK_LIMIT' } };
  }
  const rewardTable = configService.get('HomelandDrawRewardConfig') || {};
  const pieceWeights = ensurePlainObject(base.drawPieceShow);
  const buildingCfg = getHomelandBuildingConfigMap();
  const pieceRows = Object.entries(pieceWeights).map(([quality, value]) => {
    const cfg = ensurePlainObject(rewardTable[quality] || rewardTable[String(quality)]);
    const pieces = ensureArray(cfg.pieces).map((piece) => {
      const building = buildingCfg[piece] || buildingCfg[String(piece)];
      if (!building || toSafeInt(building.homelandLevel, 1) > Math.max(1, info.lv)) return null;
      return { id: toSafeInt(building.levelUpPiece, 0), count: toSafeInt(building.drawPieces, 0) };
    }).filter((piece) => piece && piece.id > 0 && piece.count > 0);
    return { id: `piece:${quality}`, quality: toSafeInt(quality, 0), weight: toSafeInt(value, 0), pieces };
  }).filter((row) => row.weight > 0 && row.pieces.length > 0);
  const itemRows = ensureArray(base.drawItem).map((row) => ({ id: toSafeInt(row && row.id, 0), count: toSafeInt(row?.count, 0) }))
    .filter((row) => row.id > 0);
  const drawRows = [...pieceRows, ...(itemRows.length > 0
    ? [{ id: 'items', weight: Math.max(0, toSafeInt(base.drawItemShow, 0)), items: itemRows }] : [])];
  const rewards = [];
  for (let i = 0; i < count; i += 1) {
    const selected = weightedPickAny(drawRows);
    if (!selected) return { tag: 6708, msgUid, data: { result: 1, code: 'HOMELAND_DRAW_CONFIG_INVALID' } };
    if (selected.id === 'items') {
      rewards.push(selected.items[randomInt(0, selected.items.length - 1)]);
    } else {
      const piece = selected.pieces[randomInt(0, selected.pieces.length - 1)];
      rewards.push({ ...piece });
    }
  }
  if (!free && !consumeCostRows(player, [drawCost])) {
    return { tag: 6708, msgUid, data: { result: 1, code: 'HOMELAND_DRAW_COST_NOT_ENOUGH' } };
  }
  if (free) info.drawFreeCount += 1;
  if (luckRequested) info.drawLuckCount += 1;
  // -33 is also a client-only derived counter; the authoritative count is
  // stored in homelandInfo.drawFreeCount.
  const rewardInfo = grantPositionalRewardInfo(player, rewards);

  await saveHomeland(session, player);
  return [
    { tag: 1202, msgUid: 0, data: buildHomelandCostSync(player, free ? [] : [drawCost], rewardInfo.items, free ? [{ id: -33, count: 1 }] : []) },
    {
      tag: 6708,
      msgUid,
      data: { result: 0, count, free: free ? 1 : 0, luck: luckRequested ? 1 : 0,
        rewards: rewardInfo.items, extraRewards: [], rewardInfo, freeCount: info.drawFreeCount },
    },
  ];
}

async function handleHomelandActivateResonance(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6709, msgUid, data: { result: -1, ids: [] } };

  const info = ensureHomelandInfo(player);
  const bondTable = ensurePlainObject(configService.get('HomelandBondConfig'));
  const requested = [...new Set(ensureArray(params && params.ids).map((row) => Math.max(1, toSafeInt(row, 0))))];
  const ids = requested.filter((id) => {
    const cfg = bondTable[id] || bondTable[String(id)];
    return cfg && !info.fetters.includes(id)
      && ensureArray(cfg.buildings).length > 0
      && ensureArray(cfg.buildings).every(buildingId => toSafeInt(info.buildingLv[String(buildingId)], -1) >= 0);
  });
  const rewards = [];
  ids.forEach((id) => {
    const cfg = bondTable[id] || bondTable[String(id)];
    info.fetters.push(id);
    rewards.push(...ensureArray(cfg.rewards));
  });
  if (ids.length <= 0) {
    return { tag: 6709, msgUid, data: { result: 1, code: 'HOMELAND_RESONANCE_INVALID', ids: [], rewardInfo: buildRewardInfo([]) } };
  }
  info.fetters.sort((a, b) => a - b);
  const rewardInfo = grantRewardInfo(player, rewards);

  await saveHomeland(session, player);
  return { tag: 6709, msgUid, data: { result: 0, ids, rewardInfo } };
}

async function handleHomelandSyncLayout(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6710, msgUid, data: { result: -1 } };

  const info = ensureHomelandInfo(player);
  info.layout = normalizeHomelandLayout(params && params.layout);

  await saveHomeland(session, player);
  return { tag: 6710, msgUid, data: { result: 0 } };
}

async function handleHomelandLike(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6711, msgUid, data: { result: -1 } };

  const info = ensureHomelandInfo(player);
  const playerId = params && params.playerId != null ? String(params.playerId) : '';
  if (!playerId || playerId === String(player.playerId || '')) {
    return { tag: 6711, msgUid, data: { result: 1, code: 'HOMELAND_LIKE_TARGET_INVALID', rewardInfo: buildRewardInfo([]) } };
  }
  const base = ensurePlainObject(configService.get('HomelandBaseConfig'));
  const max = Math.max(0, toSafeInt(base.praiseCountMax, 30));
  if (info.dailyLike.length >= max) {
    return { tag: 6711, msgUid, data: { result: 1, code: 'HOMELAND_LIKE_DAILY_LIMIT', rewardInfo: buildRewardInfo([]) } };
  }
  if (info.dailyLike.includes(playerId)) {
    return { tag: 6711, msgUid, data: { result: 1, code: 'HOMELAND_LIKE_ALREADY', rewardInfo: buildRewardInfo([]) } };
  }
  info.dailyLike.push(playerId);
  info.likeCount += 1;
  const rewardCfg = ensurePlainObject(base.praiseRewards);
  const rewardInfo = grantRewardInfo(player, [{ id: rewardCfg.id || 1, count: rewardCfg.count || 10 }]);

  info.likeRecord.records.push({
    playerId,
    name: `�ÿ�${playerId.slice(-4)}`,
    time: Date.now(),
  });
  if (info.likeRecord.records.length > 100) {
    info.likeRecord.records = info.likeRecord.records.slice(info.likeRecord.records.length - 100);
  }

  await saveHomeland(session, player);
  return { tag: 6711, msgUid, data: { result: 0, rewardInfo } };
}

async function handleHomelandGetLikeRecord(_params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6712, msgUid, data: { result: -1, likeCount: 0, records: [] } };

  const info = ensureHomelandInfo(player);
  await saveHomeland(session, player);
  const response = {
    tag: 6712,
    msgUid,
    data: {
      result: 0,
      likeCount: info.likeCount,
      records: ensureArray(info.likeRecord.records),
    },
  };
  return [
    { tag: 6700, msgUid: 0, data: buildHomelandInitPayload(info) },
    response,
  ];
}

async function handleHomelandGetMsgRecord(_params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6713, msgUid, data: { result: -1, leaveMsg: '', records: [] } };

  const info = ensureHomelandInfo(player);
  return {
    tag: 6713,
    msgUid,
    data: {
      result: 0,
      leaveMsg: info.msgRecord.leaveMsg,
      records: ensureArray(info.msgRecord.records),
    },
  };
}

async function handleHomelandAddOtherMsg(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6714, msgUid, data: { result: -1 } };

  const info = ensureHomelandInfo(player);
  const record = {
    uid: String(Date.now()),
    playerId: params && params.playerId != null ? String(params.playerId) : String(player.playerId || ''),
    content: params && params.content != null ? String(params.content) : '',
    time: Date.now(),
  };
  info.msgRecord.records.push(record);
  if (info.msgRecord.records.length > 100) {
    info.msgRecord.records = info.msgRecord.records.slice(info.msgRecord.records.length - 100);
  }

  await saveHomeland(session, player);
  return { tag: 6714, msgUid, data: { result: 0, record } };
}

async function handleHomelandRemoveOtherMsg(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6715, msgUid, data: { result: -1 } };

  const info = ensureHomelandInfo(player);
  const uid = params && params.uid != null ? String(params.uid) : '';
  info.msgRecord.records = ensureArray(info.msgRecord.records).filter((row) => String(row && row.uid ? row.uid : '') !== uid);

  await saveHomeland(session, player);
  return { tag: 6715, msgUid, data: { result: 0 } };
}

async function handleHomelandRemoveMsgRecord(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6716, msgUid, data: { result: -1 } };

  const info = ensureHomelandInfo(player);
  const uid = params && params.uid != null ? String(params.uid) : '';
  info.msgRecord.records = ensureArray(info.msgRecord.records).filter((row) => String(row && row.uid ? row.uid : '') !== uid);

  await saveHomeland(session, player);
  return { tag: 6716, msgUid, data: { result: 0 } };
}

async function handleHomelandChangeMsg(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6717, msgUid, data: { result: -1 } };

  const info = ensureHomelandInfo(player);
  info.msgRecord.leaveMsg = params && params.content != null ? String(params.content) : '';

  await saveHomeland(session, player);
  return { tag: 6717, msgUid, data: { result: 0 } };
}

async function handleHomelandPray(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6718, msgUid, data: { result: -1, prayBuff: 0, prayAttrs: {} } };

  const info = ensureHomelandInfo(player);
  const free = toSafeInt(params && params.free, 1) === 1;
  const levelCfg = getConfigRow('HomelandLevelConfig', Math.max(1, info.lv)) || {};
  if (free && info.prayBuff > 0) {
    return { tag: 6718, msgUid, data: { result: 1, code: 'HOMELAND_PRAY_ALREADY_ACTIVE', prayBuff: info.prayBuff, prayAttrs: info.prayAttrs } };
  }
  if (!free && info.prayBuff <= 0) {
    return { tag: 6718, msgUid, data: { result: 1, code: 'HOMELAND_PRAY_REFRESH_REQUIRES_ACTIVE', prayBuff: 0, prayAttrs: {} } };
  }
  const prayCost = free ? [] : ensureArray(levelCfg.buffCost);
  const next = resolvePrayBuff(info);
  if (!next) return { tag: 6718, msgUid, data: { result: 1, code: 'HOMELAND_PRAY_CONFIG_INVALID', prayBuff: info.prayBuff, prayAttrs: info.prayAttrs } };
  if (!free && !consumeCostRows(player, prayCost)) {
    return { tag: 6718, msgUid, data: { result: 1, code: 'HOMELAND_PRAY_COST_NOT_ENOUGH', prayBuff: info.prayBuff, prayAttrs: info.prayAttrs } };
  }
  info.prayBuff = next.prayBuff;
  info.prayAttrs = next.attrs;
  info.lastPrayBuff = 0;
  info.lastPrayAttrs = {};
  info.prayDayKey = currentGameDayKey();

  await saveHomeland(session, player);
  return [
    { tag: 1202, msgUid: 0, data: buildHomelandCostSync(player, prayCost) },
    { tag: 6718, msgUid, data: { result: 0, prayBuff: info.prayBuff, prayAttrs: info.prayAttrs } },
  ];
}

async function handleHomelandKeepPray(params, session, msgUid) {
  const player = session.player;
  if (!player) {
    return {
      tag: 6719,
      msgUid,
      data: { result: -1, prayBuff: 0, prayAttrs: {}, rewards: buildRewardInfo([]) },
    };
  }

  const info = ensureHomelandInfo(player);
  const prayBuff = Math.max(0, toSafeInt(params && params.prayBuff, info.prayBuff || 1001));
  const group = Math.floor(prayBuff / 100);
  const level = prayBuff % 100;
  const old = info.lastPrayBuff > 0 ? info.lastPrayBuff : 0;
  const baseCfg = ensurePlainObject(configService.get('HomelandBaseConfig'));
  if (!old || old !== prayBuff || info.prayBuff > 0 || group < toSafeInt(baseCfg.buff_quality, 4)) {
    return { tag: 6719, msgUid, data: { result: 1, code: 'HOMELAND_PRAY_KEEP_INVALID', prayBuff: info.prayBuff, prayAttrs: info.prayAttrs, rewards: buildRewardInfo([]) } };
  }
  const cfg = getNestedConfigRow('HomelandBuffConfig', group, level);
  const keepCost = cfg && ensureArray(cfg.cost);
  if (!cfg || !consumeCostRows(player, keepCost)) {
    return { tag: 6719, msgUid, data: { result: 1, code: 'HOMELAND_PRAY_KEEP_COST_NOT_ENOUGH', prayBuff: info.prayBuff, prayAttrs: info.prayAttrs, rewards: buildRewardInfo([]) } };
  }
  info.prayBuff = prayBuff;
  info.prayAttrs = mergeAttrs(info.lastPrayAttrs, cfg.attrs);
  info.lastPrayBuff = 0;
  info.lastPrayAttrs = {};
  info.prayDayKey = currentGameDayKey();

  await saveHomeland(session, player);
  return [
    { tag: 1202, msgUid: 0, data: buildHomelandCostSync(player, keepCost) },
    { tag: 6719, msgUid, data: { result: 0, prayBuff: info.prayBuff, prayAttrs: info.prayAttrs, rewards: buildRewardInfo([]) } },
  ];
}

async function handleHomelandGetProsperityRankInfo(_params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6720, msgUid, data: { result: -1, rankList: [] } };

  const info = ensureHomelandInfo(player);
  let ranklist = [];
  try {
    const Player = require('../db/models/Player');
    const docs = await Player.find({ homelandInfo: { $exists: true } })
      .select({ playerId: 1, name: 1, level: 1, serverId: 1, homelandInfo: 1, _id: 0 })
      .limit(5000).maxTimeMS(5000).lean();
    ranklist = docs.map((row) => {
      const targetInfo = ensureHomelandInfo(row);
      return { dbid: String(row.playerId || ''), name: String(row.name || ''),
        score: getProsperity(targetInfo), level: Math.max(1, toSafeInt(row.level, 1)),
        serverId: Math.max(1, toSafeInt(row.serverId, toSafeInt(player.serverId, 1001))) };
    }).filter((row) => row.dbid).sort((a, b) => b.score - a.score || a.dbid.localeCompare(b.dbid))
      .map((row, index) => ({ ...row, rank: index + 1 }));
  } catch (_error) {
    ranklist = [];
  }
  return {
    tag: 6720,
    msgUid,
    data: {
      result: 0,
      ranklist,
      toplist: ranklist.slice(0, 3),
      rankList: ranklist,
    },
  };
}

async function handleHomelandGetLikeRankInfo(_params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6721, msgUid, data: { result: -1, rankList: [] } };

  const info = ensureHomelandInfo(player);
  let ranklist = [];
  try {
    const Player = require('../db/models/Player');
    const docs = await Player.find({ homelandInfo: { $exists: true } })
      .select({ playerId: 1, name: 1, level: 1, serverId: 1, homelandInfo: 1, _id: 0 })
      .limit(5000).maxTimeMS(5000).lean();
    ranklist = docs.map((row) => ({ dbid: String(row.playerId || ''), name: String(row.name || ''),
      score: Math.max(0, toSafeInt(row.homelandInfo && row.homelandInfo.likeCount, 0)),
      level: Math.max(1, toSafeInt(row.level, 1)),
      serverId: Math.max(1, toSafeInt(row.serverId, toSafeInt(player.serverId, 1001))) }))
      .filter((row) => row.dbid).sort((a, b) => b.score - a.score || a.dbid.localeCompare(b.dbid))
      .map((row, index) => ({ ...row, rank: index + 1 }));
  } catch (_error) {
    ranklist = [];
  }
  return {
    tag: 6721,
    msgUid,
    data: {
      result: 0,
      ranklist,
      toplist: ranklist.slice(0, 3),
      rankList: ranklist,
    },
  };
}

async function handleHomelandShareLayout(_params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6722, msgUid, data: { result: -1, code: '' } };

  const info = ensureHomelandInfo(player);
  info.shareCode = randomShareCode();
  info.shareLayouts[info.shareCode] = {
    mapId: info.mapId,
    layout: info.layout,
    buildingLv: info.buildingLv,
  };

  await saveHomeland(session, player);
  return { tag: 6722, msgUid, data: { result: 0, code: info.shareCode } };
}

async function handleHomelandAreaUpgrade(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6723, msgUid, data: { result: -1, areaLv: 1 } };

  const info = ensureHomelandInfo(player);
  const current = Math.max(1, toSafeInt(info.areaLv, 1));
  const requested = Math.max(1, toSafeInt(params && params.areaLv, current + 1));
  const next = getConfigRow('HomelandAreaConfig', current + 1);
  if (requested !== current + 1 || !next) {
    return { tag: 6723, msgUid, data: { result: 1, code: 'HOMELAND_AREA_INVALID', areaLv: current } };
  }
  const roleStage = require('./raid').resolveStageIdForLevel(player.level, configService.get('RoleStageConfig') || {});
  if (roleStage < Math.max(1, toSafeInt(next.stage, 1))) {
    return { tag: 6723, msgUid, data: { result: 1, code: 'HOMELAND_AREA_LEVEL_REQUIRED', areaLv: current } };
  }
  info.areaLv = requested;

  await saveHomeland(session, player);
  return { tag: 6723, msgUid, data: { result: 0, areaLv: info.areaLv } };
}

async function handleHomelandBuildingAllLevelUp(_params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6724, msgUid, data: { result: -1, upgradeLv: {} } };

  const info = ensureHomelandInfo(player);
  const upgradeLv = {};
  const exchangeItems = [];
  const exchangeRewards = [];
  for (const key of Object.keys(info.buildingLv)) {
    const id = toSafeInt(key, 0);
    const cfg = getConfigRow('HomelandBuildingConfig', id);
    if (!cfg || toSafeInt(cfg.type, 0) !== 3) continue;
    const current = Math.max(0, toSafeInt(info.buildingLv[key], 0));
    const levelCfg = getNestedConfigRow('HomelandBuildingLevelConfig', cfg.qualityId, current);
    const nextCfg = getNestedConfigRow('HomelandBuildingLevelConfig', cfg.qualityId, current + 1);
    if (!levelCfg || !nextCfg) continue;
    const upgrade = buildNormalBuildingUpgradeCost(player, cfg, levelCfg);
    if (!consumeCostRows(player, upgrade.costs)) continue;
    exchangeItems.push(...upgrade.exchangeItems);
    exchangeRewards.push(...upgrade.exchangeRewards);
    upgradeLv[key] = current + 1;
  }
  if (Object.keys(upgradeLv).length <= 0) {
    return { tag: 6724, msgUid, data: { result: 1, code: 'HOMELAND_BUILDING_COST_NOT_ENOUGH', upgradeLv: {}, exchangeItems: [], rewardInfo: buildRewardInfo([]) } };
  }
  Object.entries(upgradeLv).forEach(([key, value]) => { info.buildingLv[key] = value; });
  const rewardInfo = buildRewardInfo(exchangeRewards);

  await saveHomeland(session, player);
  return {
    tag: 6724,
    msgUid,
    data: {
      result: 0,
      upgradeLv,
      exchangeItems: normalizeRewards(exchangeItems),
      rewardInfo,
    },
  };
}

async function handleHomelandStartExchange(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6725, msgUid, data: { result: -1 } };

  const info = ensureHomelandInfo(player);
  const itemId = Math.max(0, toSafeInt(params && params.itemId, 0));
  const exchanges = ensureArray(params && params.exchanges)
    .map((id) => Math.max(0, toSafeInt(id, 0)))
    .filter((id) => id > 0);
  const guild = require('./guild');
  const created = guild.createGuildExchangeRequest(player, session, itemId, exchanges);
  if (!created) return { tag: 6725, msgUid, data: { result: 1 } };

  info.exchangeHistory.push({ itemId, exchanges, uid: created.exchange.uid, time: Date.now() });
  if (info.exchangeHistory.length > 100) {
    info.exchangeHistory = info.exchangeHistory.slice(info.exchangeHistory.length - 100);
  }

  await saveHomeland(session, player);
  const packets = [{ tag: 6725, msgUid, data: { result: 0 } }];
  if (created.removedUids.length > 0) {
    packets.push({ tag: 1521, msgUid: 0, data: { uids: created.removedUids } });
  }
  packets.push({ tag: 1520, msgUid: 0, data: { exchange: created.exchange } });
  return packets;
}

async function handleHomelandVisitorReward(_params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6726, msgUid, data: { result: -1, rewardInfo: buildRewardInfo([]) } };

  const info = ensureHomelandInfo(player);
  const today = currentGameDayKey();
  if (String(info.visitorRewardDayKey || '') === today) {
    return { tag: 6726, msgUid, data: { result: 1, code: 'HOMELAND_VISITOR_REWARD_ALREADY', rewardInfo: buildRewardInfo([]) } };
  }
  const pending = [];
  Object.entries(info.visitorMap).forEach(([key, rows]) => {
    const visitor = getConfigRow('HomelandBeautyVisitorConfig', Number(key) % 10000);
    if (!visitor) return;
    ensureArray(rows).forEach((entry) => {
      if (Number.isSafeInteger(entry?.id) && Number.isSafeInteger(entry?.count)
        && entry.count > 0 && (entry.id === 224 || getConfigRow('AssetsConfig', entry.id))) pending.push(entry);
    });
  });
  if (pending.length <= 0) {
    return { tag: 6726, msgUid, data: { result: 1, code: 'HOMELAND_VISITOR_REWARD_EMPTY', rewardInfo: buildRewardInfo([]) } };
  }
  Object.keys(info.visitorMap).forEach((key) => { info.visitorMap[key] = []; });
  info.visitorRewardDayKey = today;
  info.lastVisitorRewardTime = Date.now();
  const rewardInfo = grantRewardInfo(player, pending);

  await saveHomeland(session, player);
  return { tag: 6726, msgUid, data: { result: 0, rewardInfo } };
}

async function handleHomelandSelectClueWish(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6727, msgUid, data: { result: -1, id: 0 } };

  const info = ensureHomelandInfo(player);
  const id = Math.max(1, toSafeInt(params && params.id, 1));
  if (!getConfigRow('HomelandBeautyClueConfig', id)) {
    return { tag: 6727, msgUid, data: { result: 1, code: 'HOMELAND_WISH_INVALID', id: 0 } };
  }
  info.wishId = id;

  await saveHomeland(session, player);
  return { tag: 6727, msgUid, data: { result: 0, id } };
}

async function handleHomelandUnlockClue(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6728, msgUid, data: { result: -1 } };

  const info = ensureHomelandInfo(player);
  const id = Math.max(1, toSafeInt(params && params.id, 1));
  const index = Math.max(1, toSafeInt(params && params.index, 0));
  const current = Math.max(0, toSafeInt(info.unlockClues[String(id)], 0));
  const clueCfg = getNestedConfigRow('HomelandBeautyClueConfig', id, index);
  if (!clueCfg || index !== current + 1) {
    return { tag: 6728, msgUid, data: { result: 1, code: 'HOMELAND_CLUE_INVALID', id, index, rewardInfo: buildRewardInfo([]) } };
  }
  if (!consumeCostRows(player, [clueCfg.cost])) {
    return { tag: 6728, msgUid, data: { result: 1, code: 'HOMELAND_CLUE_COST_NOT_ENOUGH', id, index, rewardInfo: buildRewardInfo([]) } };
  }
  info.unlockClues[String(id)] = index;
  const clue = { id: clueCfg.id, index: clueCfg.partId || index, icon: clueCfg.icon };
  const piece = ensureArray(clueCfg.rewards)[0] || { id: 0, count: 0 };
  const rewardInfo = grantRewardInfo(player, clueCfg.rewards);

  await saveHomeland(session, player);
  return {
    tag: 6728,
    msgUid,
    data: {
      result: 0,
      id,
      index,
      clue,
      piece,
      rewardInfo,
    },
  };
}

async function handleHomelandPlayerLayout(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6730, msgUid, data: { lv: 0 } };

  const playerId = params && params.playerId != null ? String(params.playerId) : String(player.playerId || '');
  let target = player;
  if (playerId !== String(player.playerId || '')) {
    const Player = require('../db/models/Player');
    target = await Player.findOne({ playerId }).lean();
    if (!target) return { tag: 6730, msgUid, data: { result: 1, code: 'HOMELAND_PLAYER_NOT_FOUND' } };
  }
  const info = ensureHomelandInfo(target);
  const summary = buildHomelandSummary(target, info);
  const isSelf = playerId === String(player.playerId || '');

  if (isSelf) await saveHomeland(session, player);
  return {
    tag: 6730,
    msgUid,
    data: {
      summary,
      lv: info.lv,
      areaLv: info.areaLv,
      mapId: info.mapId,
      layout: info.layout,
      buildingLv: info.buildingLv,
      likeCount: info.likeCount,
      aquariumFish: ensureArray(info.aquariumFish),
      skinId: Math.max(0, toSafeInt(info.skinId, 0)),
      isSelf,
      visitorMap: info.visitorMap,
    },
  };
}

async function handleHomelandGetPlayerMsgRecord(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6731, msgUid, data: { records: [], leaveMsg: '' } };

  const playerId = params && params.playerId != null ? String(params.playerId) : String(player.playerId || '');
  let target = player;
  if (playerId !== String(player.playerId || '')) {
    const Player = require('../db/models/Player');
    target = await Player.findOne({ playerId }).lean();
    if (!target) return { tag: 6731, msgUid, data: { result: 1, code: 'HOMELAND_PLAYER_NOT_FOUND', records: [], leaveMsg: '' } };
  }
  const info = ensureHomelandInfo(target);

  if (target === player) await saveHomeland(session, player);
  return {
    tag: 6731,
    msgUid,
    data: {
      playerId,
      leaveMsg: info.msgRecord.leaveMsg,
      records: ensureArray(info.msgRecord.records),
    },
  };
}

async function handleHomelandGetShareLayout(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6732, msgUid, data: { result: -1, layoutData: null } };

  const info = ensureHomelandInfo(player);
  const code = params && params.code != null ? String(params.code).toUpperCase() : '';
  const layoutData = info.shareLayouts[code] || {
    mapId: info.mapId,
    layout: info.layout,
    buildingLv: info.buildingLv,
  };

  await saveHomeland(session, player);
  return {
    tag: 6732,
    msgUid,
    data: {
      result: 0,
      code,
      layoutData,
    },
  };
}

async function handleHomelandEnterMap(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6740, msgUid, data: { result: -1 } };

  const info = ensureHomelandInfo(player);
  const tileSceneCfg = ensurePlainObject(configService.get('TileSceneConfig'));
  const requestedMap = Math.max(1, toSafeInt(params && params.map, info.mapId));
  info.enterMapInfo.map = tileSceneCfg[requestedMap] || tileSceneCfg[String(requestedMap)] ? requestedMap : info.mapId;
  info.enterMapInfo.id = String(player.playerId || '');

  await saveHomeland(session, player);
  return [
    buildHomelandMapEnterPacket(player, info, 0),
    {
      tag: 6740,
      msgUid,
      data: {
        result: 0,
        map: info.enterMapInfo.map,
        id: info.enterMapInfo.id,
        x: info.enterMapInfo.x,
        y: info.enterMapInfo.y,
      },
    },
  ];
}

async function handleHomelandLeaveMap(_params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6741, msgUid, data: { result: -1 } };

  const info = ensureHomelandInfo(player);
  await saveHomeland(session, player);
  return [
    {
      tag: 6722,
      msgUid: 0,
      data: {
        mapId: String(player.playerId || ''),
        id: String(player.playerId || ''),
      },
    },
    { tag: 6741, msgUid, data: { result: 0, map: info.enterMapInfo.map } },
  ];
}

async function handleHomelandMove(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6742, msgUid, data: { result: -1 } };

  const info = ensureHomelandInfo(player);
  info.enterMapInfo.x = Math.max(0, toSafeInt(params && params.x, info.enterMapInfo.x));
  info.enterMapInfo.y = Math.max(0, toSafeInt(params && params.y, info.enterMapInfo.y));

  await saveHomeland(session, player);
  return [
    {
      tag: 6723,
      msgUid: 0,
      data: {
        mapId: String(player.playerId || ''),
        id: String(player.playerId || ''),
        x: info.enterMapInfo.x,
        y: info.enterMapInfo.y,
      },
    },
    {
      tag: 6742,
      msgUid,
      data: {
        result: 0,
        id: String(player.playerId || ''),
        x: info.enterMapInfo.x,
        y: info.enterMapInfo.y,
      },
    },
  ];
}

async function handleHomelandLikeAll(params, session, msgUid) {
  const player = session.player;
  const playerIds = ensureArray(params && params.playerIds).map((id) => String(id)).filter(Boolean);
  if (!player) return { tag: 6729, msgUid, data: { result: playerIds.map(() => -1), rewardInfo: buildRewardInfo([]) } };
  const info = ensureHomelandInfo(player);
  const base = ensurePlainObject(configService.get('HomelandBaseConfig'));
  const max = Math.max(0, toSafeInt(base.praiseCountMax, 30));
  const result = [];
  let newLikes = 0;
  playerIds.forEach((playerId) => {
    let accepted = false;
    if (playerId && playerId !== String(player.playerId || '')
      && info.dailyLike.length < max && !info.dailyLike.includes(playerId)) {
      info.dailyLike.push(playerId);
      newLikes += 1;
      accepted = true;
    }
    result.push(accepted ? 0 : 1);
  });
  const rewardCfg = ensurePlainObject(base.praiseRewards);
  const rewardInfo = newLikes > 0
    ? grantRewardInfo(player, [{ id: rewardCfg.id || 1, count: (rewardCfg.count || 10) * newLikes }])
    : buildRewardInfo([]);
  await saveHomeland(session, player);
  return { tag: 6729, msgUid, data: { result, rewardInfo } };
}

async function handleAquariumSet(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6750, msgUid, data: { result: -1, list: [] } };
  const info = ensureHomelandInfo(player);
  info.aquariumFish = ensureArray(params && params.list)
    .map((row) => ensurePlainObject(row))
    .map((row) => ({
      uid: Math.max(0, toSafeInt(row.uid, 0)),
      id: Math.max(0, toSafeInt(row.id, 0)),
      x: toSafeInt(row.x, 0),
      y: toSafeInt(row.y, 0),
      dir: Math.max(0, toSafeInt(row.dir, 0)),
    }))
    .filter((row) => row.uid > 0 || row.id > 0);
  await saveHomeland(session, player);
  return { tag: 6750, msgUid, data: { result: 0, list: info.aquariumFish } };
}

async function handleHomelandSwitchSkin(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6751, msgUid, data: { result: -1 } };
  const skinId = params?.skinId, skins = require('../services/HomelandSkinUnlockService');
  if (!Number.isSafeInteger(skinId) || skinId < 0 || !skins.canUse(player, skinId)) {
    return { tag: 6751, msgUid, data: { result: 1, reason: 'HOMELAND_SKIN_NOT_OWNED' } };
  }
  const integrity = require('../services/FishingIntegrityService'), next = integrity.clone(player);
  const info = ensureHomelandInfo(next); info.skinId = skinId; session.player = next;
  await integrity.save(session);
  return { tag: 6751, msgUid, data: { result: 0, skinId: info.skinId } };
}

module.exports = {
  ensureHomelandInfo,
  // Every handler that can change Homeland state runs on a private player
  // snapshot and commits through homelandCAS.  This is also used by the
  // protocol router, so direct duplicate packets cannot double-reward.
  handleHomelandActivateBuilding: homelandMutation.wrap(handleHomelandActivateBuilding, 6700),
  handleHomelandUpgradeBuilding: homelandMutation.wrap(handleHomelandUpgradeBuilding, 6701),
  handleHomelandCheckUpgradeBuilding: homelandMutation.wrap(handleHomelandCheckUpgradeBuilding, 6702),
  handleHomelandCollect: homelandMutation.wrap(handleHomelandCollect, 6703),
  handleHomelandLevelUp: homelandMutation.wrap(handleHomelandLevelUp, 6704),
  handleHomelandBuildingSpeedUp: homelandMutation.wrap(handleHomelandBuildingSpeedUp, 6705),
  handleHomelandBuildingSpeedUpAssist: homelandMutation.wrap(handleHomelandBuildingSpeedUpAssist, 6706),
  handleHomelandPayTribute: homelandMutation.wrap(handleHomelandPayTribute, 6707),
  handleHomelandDraw: homelandMutation.wrap(handleHomelandDraw, 6708),
  handleHomelandActivateResonance: homelandMutation.wrap(handleHomelandActivateResonance, 6709),
  handleHomelandSyncLayout: homelandMutation.wrap(handleHomelandSyncLayout, 6710),
  handleHomelandLike: homelandMutation.wrap(handleHomelandLike, 6711),
  handleHomelandGetLikeRecord: homelandMutation.wrap(handleHomelandGetLikeRecord, 6712),
  handleHomelandGetMsgRecord: homelandMutation.wrap(handleHomelandGetMsgRecord, 6713),
  handleHomelandAddOtherMsg: homelandMutation.wrap(handleHomelandAddOtherMsg, 6714),
  handleHomelandRemoveOtherMsg: homelandMutation.wrap(handleHomelandRemoveOtherMsg, 6715),
  handleHomelandRemoveMsgRecord: homelandMutation.wrap(handleHomelandRemoveMsgRecord, 6716),
  handleHomelandChangeMsg: homelandMutation.wrap(handleHomelandChangeMsg, 6717),
  handleHomelandPray: homelandMutation.wrap(handleHomelandPray, 6718),
  handleHomelandKeepPray: homelandMutation.wrap(handleHomelandKeepPray, 6719),
  handleHomelandGetProsperityRankInfo: homelandMutation.wrap(handleHomelandGetProsperityRankInfo, 6720),
  handleHomelandGetLikeRankInfo: homelandMutation.wrap(handleHomelandGetLikeRankInfo, 6721),
  handleHomelandShareLayout: homelandMutation.wrap(handleHomelandShareLayout, 6722),
  handleHomelandAreaUpgrade: homelandMutation.wrap(handleHomelandAreaUpgrade, 6723),
  handleHomelandBuildingAllLevelUp: homelandMutation.wrap(handleHomelandBuildingAllLevelUp, 6724),
  handleHomelandStartExchange: homelandMutation.wrap(handleHomelandStartExchange, 6725),
  handleHomelandVisitorReward: homelandMutation.wrap(handleHomelandVisitorReward, 6726),
  handleHomelandSelectClueWish: homelandMutation.wrap(handleHomelandSelectClueWish, 6727),
  handleHomelandUnlockClue: homelandMutation.wrap(handleHomelandUnlockClue, 6728),
  handleHomelandPlayerLayout: homelandMutation.wrap(handleHomelandPlayerLayout, 6730),
  handleHomelandGetPlayerMsgRecord: homelandMutation.wrap(handleHomelandGetPlayerMsgRecord, 6731),
  handleHomelandGetShareLayout: homelandMutation.wrap(handleHomelandGetShareLayout, 6732),
  handleHomelandEnterMap: homelandMutation.wrap(handleHomelandEnterMap, 6740),
  handleHomelandLeaveMap: homelandMutation.wrap(handleHomelandLeaveMap, 6741),
  handleHomelandMove: homelandMutation.wrap(handleHomelandMove, 6742),
  handleHomelandLikeAll: homelandMutation.wrap(handleHomelandLikeAll, 6729),
  handleAquariumSet: homelandMutation.wrap(handleAquariumSet, 6750),
  // This handler has its own integrity snapshot/save path; keep it separate
  // from the generic Homeland wrapper.
  handleHomelandSwitchSkin,
};

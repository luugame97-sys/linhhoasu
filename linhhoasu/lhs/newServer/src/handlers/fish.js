/**
 * Fishing handlers.
 * tag: 4000/4002/4004~4013/4015/4016/4020~4022/4050~4052
 */

const configService = require('../services/ConfigService');
const integrity = require('../services/FishingIntegrityService');
const fishingBalance = require('../services/FishingBalanceService');
const fishingGear = require('../services/FishingGearService');
const knownEffects = require('../services/FishingKnownEffectsService');
const gameplay = require('../services/FishingGameplayService');
const {
  addFishCount,
  addFishOrderCompleteCount,
  addFishRodUpgradeCount,
} = require('../services/MainTaskProgressService');
const { addRewardToPlayer } = require('./raid');

const FISH_DEAL_TYPE = {
  PUT_IN: 0,
  SUBMIT: 1,
  SHELL: 2,
  LEGACY_SUBMIT: 3,
};

const DEFAULT_FISH_ID = 5011;
const DEFAULT_FISH_BAIT_ID = 5501;
const DEFAULT_FISH_ROD_ID = 5901;
const FISH_BAIT_SYNC_ITEM_ID = 65;
const FISH_COIN_ITEM_ID = 68;
const FISH_CRYSTAL_ITEM_ID = 69;
const DEFAULT_FISH_ORDER_IDS = [80001, 80015, 80046];
const DEFAULT_FISH_ORDER_CONFIG = {
  80001: { id: 80001, type: 43, fishType: 2, count: 5, star: 1, rewards: [{ id: FISH_CRYSTAL_ITEM_ID, count: 2 }] },
  80015: { id: 80015, type: 41, fishType: 1, count: 1, star: 1, rewards: [{ id: FISH_CRYSTAL_ITEM_ID, count: 2 }] },
  80046: { id: 80046, type: 42, fishType: DEFAULT_FISH_ID, count: 2, star: 3, rewards: [{ id: FISH_CRYSTAL_ITEM_ID, count: 6 }] },
};
const DEFAULT_FISH_CONFIG = {
  [DEFAULT_FISH_ID]: { id: DEFAULT_FISH_ID, type: 1, quality: 2, exp: 10, minAttrs: [[1, 1000, 1]] },
};
const DEFAULT_FISH_SCENE_CONFIG = {
  1: { id: 1, isActivity: 0 },
  2: { id: 2, isActivity: 0 },
  3: { id: 3, isActivity: 0 },
  4: { id: 4, isActivity: 0 },
  5: { id: 5, isActivity: 0 },
  6: { id: 6, isActivity: 0 },
  7: { id: 7, isActivity: 0 },
  101: { id: 101, isActivity: 1 },
  201: { id: 201, isActivity: 1 },
  301: { id: 301, isActivity: 1 },
  401: { id: 401, isActivity: 1 },
  501: { id: 501, isActivity: 1 },
};
const FISH_BASKET_TYPE_MIN = 1;
const FISH_BASKET_TYPE_MAX = 10;
const TRUCK_FISH_TYPES = new Set([101, 102, 103, 105, 106, 107, 108, 109]);

function toSafeInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function isClientFishId(id) {
  const safeId = Math.max(0, toSafeInt(id, 0));
  return safeId >= 5000 && safeId < 5900;
}

function isFishBasketType(type) {
  const safeType = Math.max(0, toSafeInt(type, 0));
  return safeType >= FISH_BASKET_TYPE_MIN && safeType <= FISH_BASKET_TYPE_MAX;
}

function normalizeFishBasketType(type, fallback = 1) {
  const safeType = Math.max(0, toSafeInt(type, 0));
  if (isFishBasketType(safeType)) return safeType;
  const fallbackType = Math.max(0, toSafeInt(fallback, 1));
  return isFishBasketType(fallbackType) ? fallbackType : 1;
}

function normalizeFishSkills(skills) {
  return ensureArray(skills)
    .map((row) => Math.max(0, toSafeInt(row && typeof row === 'object' ? row.id : row, 0)));
}

function normalizeExistingFishAttrs(attrs) {
  return ensureArray(attrs)
    .map((row) => {
      const source = Array.isArray(row)
        ? { type: row[0], value: row[1], level: row[2] }
        : ensurePlainObject(row);
      const type = Math.max(1, toSafeInt(source.type != null ? source.type : source.id, 0));
      const value = Math.max(0, toSafeInt(source.value != null ? source.value : source.val, 0));
      const level = Math.max(1, toSafeInt(source.level, 1));
      if (type <= 0 || value <= 0) return null;
      return { type, level, value };
    })
    .filter(Boolean);
}

function ensurePlainObject(value, fallback = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...fallback };
  }
  return value;
}

function getRoleAppearanceHelpers() {
  try {
    return require('../services/RoleAppearanceService');
  } catch (_err) {
    return {
      ensureRoleAppearance: () => null,
      getPlayerFashionMap: (player = {}) => ensurePlainObject(player.fashionMap),
      getPrimaryBattlePetId: (player = {}) => Math.max(0, toSafeInt(player.petId, 0)),
    };
  }
}

function buildFishMapPlayer(player = {}, info = {}, pos = 1) {
  const {
    ensureRoleAppearance,
    getPlayerFashionMap,
    getPrimaryBattlePetId,
  } = getRoleAppearanceHelpers();
  ensureRoleAppearance(player);
  const roleInfo = ensurePlainObject(player.roleInfo);
  const equipInfo = ensurePlainObject(player.equipInfo);
  const equipSetMap = ensurePlainObject(equipInfo.equipSetMap);
  const equipMap = ensurePlainObject(equipSetMap[String(Math.max(0, toSafeInt(equipInfo.curIndex, 0)))]);
  const arenaReadModel = require('../services/ArenaReadModelService');
  const power = arenaReadModel.displayPowerFromPlayer(player);
  return {
    dbid: String(player.playerId || player.userId || player._id || ''),
    serverId: Math.max(0, toSafeInt(player.serverId, toSafeInt(process.env.SERVER_ID, 1))),
    serverName: String(player.serverName || process.env.SERVER_NAME || ''),
    kungfuId: Math.max(1, toSafeInt(roleInfo.kungfuId, 4)),
    subJob: Math.max(0, toSafeInt(roleInfo.subJob, 0)),
    level: Math.max(1, toSafeInt(player.level, 1)),
    name: String(player.name || ''),
    power: Math.max(0, toSafeInt(power, toSafeInt(player.displayPower, 0))),
    powerUnit: 'native-weighted-point',
    stage: Math.max(1, toSafeInt(roleInfo.stage, toSafeInt(roleInfo.stageId, 1))),
    petId: getPrimaryBattlePetId(player),
    petSoulId: Math.max(-1, toSafeInt(player.petSoulId, -1)),
    artifactId: Math.max(0, toSafeInt(player.artifactId, 0)),
    fate: Math.max(0, toSafeInt(player.fate, 0)),
    foreverCard: Math.max(0, toSafeInt(player.foreverCard, 0)),
    equipMap,
    fashionMap: getPlayerFashionMap(player),
    avatar: Math.max(0, toSafeInt(player.avatar, toSafeInt(roleInfo.avatar, 0))),
    avatarUrl: String(player.avatarUrl || roleInfo.avatarUrl || ''),
    avatarFrame: Math.max(0, toSafeInt(player.avatarFrame, toSafeInt(roleInfo.avatarFrame, 0))),
    title: Math.max(0, toSafeInt(player.title, toSafeInt(roleInfo.title, 0))),
    pos: Math.max(0, Math.min(3, toSafeInt(pos, 1))),
    rodId: normalizeFishRodId(info.rodId),
    raftId: normalizeFishRaftId(info.raftId),
    food: normalizeFishBaitId(info.food),
  };
}

function buildFishRodUpdatePacket(info = {}, switchRod = 0) {
  return {
    tag: 4010,
    msgUid: 0,
    data: {
      exp: Math.max(0, toSafeInt(info.rodExp, 0)),
      level: Math.max(0, toSafeInt(info.rodLevel, 0)),
      rank: Math.max(1, toSafeInt(info.rodRank, 1)),
      rodId: normalizeFishRodId(info.rodId),
      switchRod: switchRod ? 1 : 0,
    },
  };
}

function buildFishMapOtherEnterPacket(player = {}, info = {}, mapId, pos = 1) {
  return {
    tag: 4051,
    msgUid: 0,
    data: {
      mapId: normalizeFishSceneId(mapId, info.scene || 1),
      mapPlayer: buildFishMapPlayer(player, info, pos),
    },
  };
}

function buildFishPlayerEmojiPacket(playerId, index) {
  return {
    tag: 4053,
    msgUid: 0,
    data: {
      id: String(playerId == null ? '' : playerId),
      index: Math.max(0, toSafeInt(index, 0)),
    },
  };
}

function buildFishOtherRaftSwitchPacket(playerId, raftId) {
  return {
    tag: 4063,
    msgUid: 0,
    data: {
      id: String(playerId == null ? '' : playerId),
      raftId: normalizeFishRaftId(raftId),
    },
  };
}

function broadcastFishRoomPacket(session = {}, packet) {
  if (!packet || !session._fishRooms) return;
  session._fishRooms.broadcast(session, packet.tag, packet.data);
}

function pickOne(rows = []) {
  if (!Array.isArray(rows) || rows.length <= 0) return null;
  return rows[Math.floor(Math.random() * rows.length)];
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

function buildRewardInfo(items = []) {
  return {
    items: normalizeRewards(items),
    equips: [],
    extra: [],
  };
}

function grantRewards(player, rows = []) {
  const rewards = normalizeRewards(rows);
  rewards.forEach((row) => addRewardToPlayer(player, row.id, row.count));
  return rewards;
}

function getItemCount(player = {}, itemId) {
  const id = Math.max(0, toSafeInt(itemId, 0));
  if (id <= 0) return 0;
  const items = ensurePlainObject(player.items);
  return Math.max(0, toSafeInt(items[id] != null ? items[id] : items[String(id)], 0));
}

function consumeItem(player = {}, itemId, count) {
  const id = Math.max(0, toSafeInt(itemId, 0));
  const safeCount = Math.max(0, toSafeInt(count, 0));
  if (id <= 0 || safeCount <= 0 || getItemCount(player, id) < safeCount) return false;
  player.items = ensurePlainObject(player.items);
  player.items[id] = Math.max(0, getItemCount(player, id) - safeCount);
  return true;
}

function buildItemSync(player = {}, deltas = []) {
  const deltaMap = new Map();
  ensureArray(deltas).forEach((row) => {
    const id = Math.max(0, toSafeInt(row && row.id, 0));
    const count = toSafeInt(row && row.count, 0);
    if (id <= 0 || count === 0) return;
    deltaMap.set(id, (deltaMap.get(id) || 0) + count);
  });
  const items = Array.from(deltaMap.entries())
    .map(([id, count]) => ({ id, count }))
    .filter((row) => row.count !== 0)
    .sort((a, b) => a.id - b.id);
  const currency={1:'diamond',2:'silver',6:'gold'};
  const changed = items.map((row) => ({ id: row.id, count: currency[row.id]?Number(player.currencies?.[currency[row.id]]||0):getItemCount(player, row.id) }));
  return { items, changed };
}

function normalizeCost(row) {
  const source = Array.isArray(row) ? { id: row[0], count: row[1] } : ensurePlainObject(row);
  const id = Math.max(0, toSafeInt(source.id, 0));
  const count = Math.max(0, toSafeInt(source.count, 0));
  return id > 0 && count > 0 ? { id, count } : null;
}

function buildTaskUpdatePacketsSafe(player, msgUid = 0) {
  try {
    const task = require('./task');
    if (task && typeof task.buildActiveTaskUpdatePackets === 'function') {
      return task.buildActiveTaskUpdatePackets(player, msgUid);
    }
  } catch (_err) {}
  return [];
}

function getFishConfigMap() {
  const raw = ensurePlainObject(configService.get('FishConfig'));
  if (Object.keys(raw).length > 0) return raw;
  return DEFAULT_FISH_CONFIG;
}

function getFishOrderConfigMap() {
  const raw = ensurePlainObject(configService.get('FishOrderConfig'));
  if (Object.keys(raw).length > 0) return raw;
  return DEFAULT_FISH_ORDER_CONFIG;
}

function getFishOrderConfigById(orderId, fallbackIndex = 0) {
  const safeOrderId = Math.max(1, toSafeInt(orderId, 0));
  const cfgMap = getFishOrderConfigMap();
  const fallbackId = DEFAULT_FISH_ORDER_IDS[Math.max(0, fallbackIndex) % DEFAULT_FISH_ORDER_IDS.length];
  const cfg = ensurePlainObject(
    cfgMap[safeOrderId]
      || cfgMap[String(safeOrderId)]
      || cfgMap[fallbackId]
      || cfgMap[String(fallbackId)]
      || DEFAULT_FISH_ORDER_CONFIG[fallbackId],
  );
  return {
    id: Math.max(1, toSafeInt(cfg.id, fallbackId)),
    type: Math.max(41, toSafeInt(cfg.type, 41)),
    fishType: Math.max(1, toSafeInt(cfg.fishType, 1)),
    count: Math.max(1, toSafeInt(cfg.count, 1)),
    star: Math.max(1, toSafeInt(cfg.star, 1)),
    rewards: normalizeRewards(ensureArray(cfg.rewards)),
  };
}
function getFishSceneConfigMap() {
  const raw = ensurePlainObject(configService.get('FishSceneConfig'));
  if (Object.keys(raw).length > 0) return raw;
  return DEFAULT_FISH_SCENE_CONFIG;
}

function isValidFishSceneId(sceneId) {
  const id = Math.max(0, toSafeInt(sceneId, 0));
  if (id <= 0) return false;
  const cfgMap = getFishSceneConfigMap();
  return !!(cfgMap[id] || cfgMap[String(id)]);
}

function getFishSceneConfig(sceneId) {
  const id = Math.max(0, toSafeInt(sceneId, 0));
  const cfgMap = getFishSceneConfigMap();
  return ensurePlainObject(cfgMap[id] || cfgMap[String(id)]);
}

function normalizeFishSceneId(sceneId, fallback = 1) {
  const id = Math.max(0, toSafeInt(sceneId, 0));
  if (isValidFishSceneId(id)) return id;
  const safeFallback = Math.max(1, toSafeInt(fallback, 1));
  return isValidFishSceneId(safeFallback) ? safeFallback : 1;
}

function normalizeMainFishSceneId(sceneId, fallback = 1) {
  const id = normalizeFishSceneId(sceneId, fallback);
  const cfg = getFishSceneConfig(id);
  if (!cfg.isActivity) return id;
  const safeFallback = normalizeFishSceneId(fallback, 1);
  return getFishSceneConfig(safeFallback).isActivity ? 1 : safeFallback;
}

function normalizeFishEnterSceneId(sceneId, fallback = 1) {
  const id = normalizeFishSceneId(sceneId, fallback);
  const cfg = getFishSceneConfig(id);
  return cfg.isActivity ? 1 : id;
}

function getFishBaseValue(key, fallback) {
  const cfg = ensurePlainObject(configService.get('FishBaseConfig'));
  return Math.max(0, toSafeInt(cfg[key], fallback));
}

function getInitialFishBaitId() {
  return getFishBaseValue('initFishBaitId', DEFAULT_FISH_BAIT_ID) || DEFAULT_FISH_BAIT_ID;
}

function getValidFishConfigId(configName, requestedId, fallbackId) {
  const cfgMap = ensurePlainObject(configService.get(configName));
  const id = Math.max(0, toSafeInt(requestedId, 0));
  if (id > 0 && (cfgMap[id] || cfgMap[String(id)])) return id;
  const fallback = Math.max(0, toSafeInt(fallbackId, 0));
  if (fallback > 0 && (cfgMap[fallback] || cfgMap[String(fallback)])) return fallback;
  const first = Object.keys(cfgMap).map((key) => toSafeInt(key, 0)).filter((key) => key > 0).sort((a, b) => a - b)[0];
  return first || fallback || id;
}

function normalizeFishBaitId(id) {
  return getValidFishConfigId('FishBaitConfig', id, DEFAULT_FISH_BAIT_ID) || DEFAULT_FISH_BAIT_ID;
}

function getInitialFishRodId() {
  return getValidFishConfigId('FishRodConfig', getFishBaseValue('initFishRodId', DEFAULT_FISH_ROD_ID), DEFAULT_FISH_ROD_ID) || DEFAULT_FISH_ROD_ID;
}

function getInitialFishRaftId() {
  return getValidFishConfigId('FishRaftConfig', getFishBaseValue('initFishRaftId', 0), 0);
}

function normalizeFishRodId(id) {
  return getValidFishConfigId('FishRodConfig', id, getInitialFishRodId()) || getInitialFishRodId();
}

function normalizeFishRaftId(id) {
  return getValidFishConfigId('FishRaftConfig', id, getInitialFishRaftId()) || getInitialFishRaftId();
}

function getFishTypeById(fishId, fallback = 1) {
  const cfg = getFishConfigMap()[fishId] || getFishConfigMap()[String(fishId)];
  return Math.max(1, toSafeInt(cfg && cfg.type, fallback));
}

function getFishQualityById(fishId, fallback = 1) {
  const cfg = getFishConfigMap()[fishId] || getFishConfigMap()[String(fishId)];
  return Math.max(1, toSafeInt(cfg && cfg.quality, fallback));
}

function pickFishIdByType(type = 1) {
  const wantedType = normalizeFishBasketType(type, 1);
  const cfgMap = getFishConfigMap();
  const rows = Object.values(cfgMap);
  const matched = rows.filter((row) => (
    toSafeInt(row && row.type, 0) === wantedType
    && isClientFishId(row && row.id)
  ));
  const picked = pickOne(matched);
  if (picked && toSafeInt(picked.id, 0) > 0) {
    return toSafeInt(picked.id, DEFAULT_FISH_ID);
  }
  const fallback = rows.find((row) => isClientFishId(row && row.id) && isFishBasketType(row && row.type));
  return Math.max(1, toSafeInt(fallback && fallback.id, DEFAULT_FISH_ID));
}

async function getUnlockedFishingPool(player) {
  const ids = new Set();
  for (const row of Object.values(getFishSceneConfigMap())) {
    if (await integrity.canUseScene(player, row.id)) for (const id of row.fishes) ids.add(id);
  }
  return [...ids];
}

function pickFishingFishId(pool, info) {
  const cfgMap = getFishConfigMap();
  const rows = pool.map(id => cfgMap[id]).filter(row => row && isClientFishId(row.id) && isFishBasketType(row.type));
  const picked = fishingBalance.pick(rows.map(row => ({ ...row, weight: fishingBalance.speciesWeight(info, row.type) })));
  return Math.max(1, toSafeInt(picked && picked.id, DEFAULT_FISH_ID));
}

function buildFishAttrs(fishCfg, multi) {
  const source = ensureArray(fishCfg && fishCfg.minAttrs).length > 0
    ? ensureArray(fishCfg && fishCfg.minAttrs)
    : DEFAULT_FISH_CONFIG[DEFAULT_FISH_ID].minAttrs;
  return source
    .map((row) => {
      if (!Array.isArray(row) || row.length < 2) return null;
      const type = Math.max(1, toSafeInt(row[0], 0));
      const baseValue = Math.max(1, toSafeInt(row[1], 1));
      const level = Math.max(1, toSafeInt(row[2], 1));
      return {
        type,
        level,
        value: Math.max(1, Math.floor(baseValue * Math.max(1, toSafeInt(multi, 10000)) / 10000)),
      };
    })
    .filter(Boolean);
}

function getFishExpById(fishId) {
  const cfgMap = getFishConfigMap();
  const cfg = ensurePlainObject(cfgMap[fishId] || cfgMap[String(fishId)]);
  return Math.max(1, toSafeInt(cfg.exp, 10));
}

function applyFishingExp(info, expGain) {
  info.level = Math.max(1, toSafeInt(info.level, 1));
  info.exp = Math.max(0, toSafeInt(info.exp, 0)) + Math.max(0, toSafeInt(expGain, 0));
  const levelConfig = ensurePlainObject(configService.get('FishLevelConfig'));
  let guard = 0;
  while (guard < 1000) {
    guard += 1;
    const cfg = levelConfig[info.level] || levelConfig[String(info.level)];
    const needExp = Math.max(0, toSafeInt(cfg && cfg.exp, 0));
    if (needExp <= 0 || info.exp < needExp || !levelConfig[info.level + 1]) break;
    info.exp -= needExp;
    info.level += 1;
  }
}

function consumeFishBait(player, info, count) {
  const safeCount = Math.max(1, toSafeInt(count, 1));
  // The button's item65 is energy. Optional bait is consumed independently,
  // per cast and in bag order (native help30035898), not one type per batch.
  if (getItemCount(player, FISH_BAIT_SYNC_ITEM_ID) < safeCount) return null;
  const cfg = configService.get('FishBaitConfig') || {};
  const bag = [...new Set(ensureArray(info.foodBag).map(Number))]
    .filter(id => id !== getInitialFishBaitId() && cfg[id] && getItemCount(player, id) > 0);
  const available = Object.fromEntries(bag.map(id => [id, getItemCount(player, id)]));
  const deltas = [];
  const casts = [];
  for (let i = 0; i < safeCount; i++) {
    const id = bag.find(baitId => available[baitId] > 0) || getInitialFishBaitId();
    casts.push(id);
    if (!fishingBalance.skipCost(info, 'energy', undefined, player)) deltas.push({ id: FISH_BAIT_SYNC_ITEM_ID, count: -1 });
    if (id !== getInitialFishBaitId() && !fishingBalance.skipCost(info, 'bait', undefined, player)) {
      available[id]--; deltas.push({ id, count: -1 });
    }
  }
  for (const delta of deltas) consumeItem(player, delta.id, -delta.count);
  info.foodBag = bag.filter(id => available[id] > 0);
  info.food = info.foodBag[0] || getInitialFishBaitId();
  return { deltas, casts };
}

function buildFishingResult(player, count, pool, baits) {
  const info = player.fishInfo;
  const fishInfos = [];
  const escapes = [], items = [];
  let expGain = 0;
  const safeCount = Math.max(1, Math.min(10, toSafeInt(count, 1)));

  for (let i = 0; i < safeCount; i += 1) {
    const selected = gameplay.normalCatch(player, pool, baits[i]);
    if (selected.escape != null) { escapes.push(selected.escape); continue; }
    if (selected.item) { items.push(selected.item); continue; }
    const fishId = selected.id;
    const fish = buildFishEntity(info, fishId, { multi: selected.multi, ...(isTruckFishType(getFishTypeById(fishId))?{attrs:[]}:{} ) });
    fishInfos.push(fish);
    expGain += getFishExpById(fishId);
    if (selected.double) {
      fishInfos.push(buildFishEntity(info, fishId, { multi: selected.multi, isDouble: true }));
      expGain += getFishExpById(fishId);
    }
  }

  applyFishingExp(info, expGain);
  const result = {
    time: Date.now(),
    fishInfos,
    escapes,
    items,
    fashion: [],
  };
  info.fishResult = result;
  return result;
}

function ensureOrder(info, index) {
  if (!integrity.validInt(index, 0, 2)) return null;
  const safeIndex = Math.max(0, toSafeInt(index, 0));
  const fallbackId = DEFAULT_FISH_ORDER_IDS[safeIndex % DEFAULT_FISH_ORDER_IDS.length];
  while (info.orders.length <= safeIndex) {
    info.orders.push({ id: fallbackId, progress: 0, received: false });
  }
  const row = ensurePlainObject(info.orders[safeIndex], {
    id: fallbackId,
    progress: 0,
    received: false,
  });
  const cfg = getFishOrderConfigById(row.id, safeIndex);
  row.id = cfg.id;
  row.progress = Math.max(0, Math.min(toSafeInt(row.progress, 0), cfg.count));
  row.received = !!row.received;
  info.orders[safeIndex] = row;
  return row;
}

function isTruckFishType(type) {
  return TRUCK_FISH_TYPES.has(Math.max(0, toSafeInt(type, 0)));
}

function doesFishMatchOrder(fish, cfg) {
  if (!fish || !cfg || isTruckFishType(fish.type)) return false;
  const fishType = Math.max(1, toSafeInt(fish.type, getFishTypeById(fish.id, 1)));
  const fishId = Math.max(1, toSafeInt(fish.id, 0));
  const fishQuality = Math.max(1, toSafeInt(fish.quality, getFishQualityById(fishId, 1)));
  const target = Math.max(1, toSafeInt(cfg.fishType, 1));

  if (cfg.type === 41) return fishType === target;
  if (cfg.type === 42) return fishId === target;
  if (cfg.type === 43) return fishQuality === target;
  return false;
}

function applyFishToDailyOrders(info, fish) {
  const updated = [];
  ensureArray(info.orders).forEach((_row, index) => {
    const order = ensureOrder(info, index);
    const cfg = getFishOrderConfigById(order.id, index);
    if (order.received || order.progress >= cfg.count || !doesFishMatchOrder(fish, cfg)) return;
    order.progress = Math.min(cfg.count, order.progress + 1);
    updated.push(index);
  });
  return updated;
}

function ensureShipLog(info, id) {
  info.shipLogs = ensurePlainObject(info.shipLogs);
  const key = String(Math.max(1, toSafeInt(id, 1)));
  const row = ensurePlainObject(info.shipLogs[key], {
    id: Math.max(1, toSafeInt(id, 1)),
    exp: 0,
    record: [],
    time: 0,
  });
  row.id = Math.max(1, toSafeInt(row.id, Math.max(1, toSafeInt(id, 1))));
  row.exp = Math.max(0, toSafeInt(row.exp, 0));
  row.record = ensureArray(row.record).map((v) => Math.max(0, toSafeInt(v, 0)));
  row.time = Math.max(0, toSafeInt(row.time, 0));
  info.shipLogs[key] = row;
  return row;
}

function ensureSlot(info, type) {
  const safeType = normalizeFishBasketType(type, 1);
  const key = String(safeType);
  const row = ensurePlainObject(info.slots[key], {
    id: 0,
    uid: 0,
    type: safeType,
    quality: 1,
    lock: 0,
    dead: 0,
  });
  row.id = Math.max(0, toSafeInt(row.id, 0));
  row.uid = Math.max(0, toSafeInt(row.uid, 0));
  row.type = normalizeFishBasketType(row.type, safeType);
  row.quality = Math.max(1, toSafeInt(row.quality, 1));
  row.lock = row.lock ? 1 : 0;
  row.dead = row.dead ? 1 : 0;
  info.slots[key] = row;
  return row;
}

function buildFishEntity(info, fishId, overrides = {}) {
  info.fishUidSeq = Math.max(1, toSafeInt(info.fishUidSeq, 1000));
  const overrideUid = Math.max(0, toSafeInt(overrides.uid, 0));
  const uid = overrideUid > 0 ? overrideUid : info.fishUidSeq++;
  if (info.fishUidSeq <= uid) info.fishUidSeq = uid + 1;
  const cfgMap = getFishConfigMap();
  let id = Math.max(1, toSafeInt(fishId, DEFAULT_FISH_ID));
  let cfg = ensurePlainObject(cfgMap[id] || cfgMap[String(id)]);
  if (!cfg.id && !isClientFishId(id) && Object.keys(cfgMap).length > 0) {
    id = pickFishIdByType(normalizeFishBasketType(overrides.type, 1));
    cfg = ensurePlainObject(cfgMap[id] || cfgMap[String(id)]);
  }
  const type = isTruckFishType(cfg.type) ? cfg.type : normalizeFishBasketType(overrides.type, getFishTypeById(id, 1));
  const multi = Math.max(1, toSafeInt(overrides.multi, 10000));
  const normalizedAttrs = normalizeExistingFishAttrs(overrides.attrs);
  const attrs = Array.isArray(overrides.attrs) ? normalizedAttrs : buildFishAttrs(cfg, multi);
  return {
    uid,
    id,
    type,
    quality: Math.max(1, toSafeInt(overrides.quality, getFishQualityById(id, 1))),
    multi,
    attrs,
    skills: normalizeFishSkills(overrides.skills),
    tempSkills: ensurePlainObject(overrides.tempSkills),
    lock: overrides.lock ? 1 : 0,
    dead: overrides.dead ? 1 : 0,
    ...(overrides.isDouble ? { isDouble: true } : {}),
  };
}

function normalizeFishSlots(info) {
  info.slots = ensurePlainObject(info.slots);
  const normalized = {};
  Object.keys(info.slots).forEach((typeKey) => {
    const row = ensurePlainObject(info.slots[typeKey]);
    const id = Math.max(0, toSafeInt(row.id, 0));
    if (!isClientFishId(id)) return;
    const type = normalizeFishBasketType(row.type, toSafeInt(typeKey, 1));
    normalized[String(type)] = buildFishEntity(info, id, { ...row, type });
  });
  info.slots = normalized;
}

function ensureFishInfo(player) {
  if (!player || typeof player !== 'object') {
    return {
      scene: 0,
      level: 1,
      exp: 0,
      food: getInitialFishBaitId(),
      foodBag: [],
      fishResult: { time: 0, fishInfos: [], escapes: [], items: [], fashion: [] },
      catchResult: { time: 0, infos: [], escapes: [], items: [], sailItems: {} },
      slots: {},
      orders: [],
      pics: {},
      extraPrice: {},
      fishTypeQualityPic: {},
      fetters: [],
      shipLogs: {},
      fishSoulSlots: {},
      fishSoulPic: {},
      rodId: getInitialFishRodId(),
      rodLevel: 0,
      rodRank: 1,
      rodExp: 0,
      rodAttrs: [],
      rodTempAttrs: [],
      raftId: getInitialFishRaftId(),
      raftLevel: 0,
      raftRank: 1,
      raftExp: 0,
      fishUidSeq: 1000,
    };
  }

  player.fishInfo = ensurePlainObject(player.fishInfo);
  const info = player.fishInfo;
  info.scene = normalizeFishSceneId(info.scene, 1);
  info.level = Math.max(1, toSafeInt(info.level, 1));
  info.exp = Math.max(0, toSafeInt(info.exp, 0));
  info.food = normalizeFishBaitId(info.food);
  info.foodBag = ensureArray(info.foodBag)
    .map((v) => normalizeFishBaitId(v))
    .filter((v, index, arr) => v > 0 && arr.indexOf(v) === index);
  info.fishResult = ensurePlainObject(info.fishResult, { time: 0, fishInfos: [], escapes: [], items: [], fashion: [] });
  info.fishResult.time = Math.max(0, toSafeInt(info.fishResult.time, 0));
  info.fishResult.escapes = ensureArray(info.fishResult.escapes);
  info.fishResult.items = ensureArray(info.fishResult.items);
  info.fishResult.fashion = ensureArray(info.fishResult.fashion);
  info.fishResult.fishInfos = ensureArray(info.fishResult.fishInfos)
    .map((row) => ensurePlainObject(row))
    .filter((row) => toSafeInt(row.uid, 0) > 0 && toSafeInt(row.id, 0) > 0)
    .map((row) => buildFishEntity(info, row.id, row));
  info.catchResult = ensurePlainObject(info.catchResult, { time: 0, infos: [], escapes: [], items: [], sailItems: {} });
  info.catchResult.time = Math.max(0, toSafeInt(info.catchResult.time, 0));
  info.catchResult.infos = ensureArray(info.catchResult.infos);
  info.catchResult.escapes = ensureArray(info.catchResult.escapes);
  info.catchResult.items = ensureArray(info.catchResult.items);
  info.catchResult.sailItems = ensurePlainObject(info.catchResult.sailItems);
  normalizeFishSlots(info);
  info.orders = ensureArray(info.orders);
  integrity.resetDailyOrders(info);
  info.pics = ensurePlainObject(info.pics);
  info.extraPrice = ensurePlainObject(info.extraPrice);
  info.fishTypeQualityPic = ensurePlainObject(info.fishTypeQualityPic);
  info.fishSoulSlots = ensurePlainObject(info.fishSoulSlots);
  info.fishSoulPic = ensurePlainObject(info.fishSoulPic);
  info.fetters = ensureArray(info.fetters).map((v) => Math.max(0, toSafeInt(v, 0))).filter((v) => v > 0);
  info.shipLogs = ensurePlainObject(info.shipLogs);
  info.rodId = normalizeFishRodId(info.rodId);
  info.rodLevel = Math.max(0, toSafeInt(info.rodLevel, 0));
  info.rodRank = Math.max(1, toSafeInt(info.rodRank, 1));
  info.rodExp = Math.max(0, toSafeInt(info.rodExp, 0));
  info.rodAttrs = ensureArray(info.rodAttrs);
  info.rodTempAttrs = ensureArray(info.rodTempAttrs);
  info.raftId = normalizeFishRaftId(info.raftId);
  info.raftLevel = Math.max(0, toSafeInt(info.raftLevel, 0));
  info.raftRank = Math.max(1, toSafeInt(info.raftRank, 1));
  info.raftExp = Math.max(0, toSafeInt(info.raftExp, 0));
  info.fishUidSeq = Math.max(1, toSafeInt(info.fishUidSeq, 1000));

  if (info.orders.length < 3) {
    for (let i = info.orders.length; i < 3; i++) {
      info.orders.push({ id: DEFAULT_FISH_ORDER_IDS[i % DEFAULT_FISH_ORDER_IDS.length], progress: 0, received: false });
    }
  }
  info.orders = info.orders.map((row, index) => {
    const fallbackId = DEFAULT_FISH_ORDER_IDS[index % DEFAULT_FISH_ORDER_IDS.length];
    const item = ensurePlainObject(row, { id: fallbackId, progress: 0, received: false });
    const cfg = getFishOrderConfigById(item.id, index);
    return {
      id: cfg.id,
      progress: Math.max(0, Math.min(toSafeInt(item.progress, 0), cfg.count)),
      received: !!item.received,
    };
  });

  return info;
}

function findFishIndexByUid(info, uid) {
  const safeUid = Math.max(1, toSafeInt(uid, 0));
  return info.fishResult.fishInfos.findIndex((row) => toSafeInt(row && row.uid, 0) === safeUid);
}

// A catch is valid only while the socket still owns a fishing-room seat.
// Production WebSocket sessions always carry `_fishRooms`; direct handler
// fixtures may omit the transient service, so those remain usable for tests
// and non-room maintenance calls.  The membership check is deliberately
// identity-based to reject a stale socket after leave/reconnect without
// touching inventory or the pending-fish state.
function hasFishRoomMembership(session) {
  const rooms = session && session._fishRooms;
  if (!rooms) return true;
  if (typeof rooms.isMember === 'function') return rooms.isMember(session) === true;
  if (!rooms.members || typeof rooms.members.get !== 'function') return false;
  const member = rooms.members.get(session);
  return !!(
    member
    && member.session === session
    && member.room
    && member.room.members
    && typeof member.room.members.get === 'function'
    && member.room.members.get(session) === member
  );
}

async function handleFishCatch(params, session, msgUid) {
  const player = session.player ? integrity.clone(session.player) : null;
  if (!player) {
    return {
      tag: 4000,
      msgUid,
      data: {
        result: -1,
        bigger: 0,
        level: 1,
        exp: 0,
        fishResult: { time: 0, fishInfos: [], escapes: [], items: [], fashion: [] },
        food: getInitialFishBaitId(),
      },
    };
  }

  const info = ensureFishInfo(player);
  const count = Math.max(1, Math.min(10, toSafeInt(params && params.count, 1)));
  const current = () => ({ level: info.level, exp: info.exp, fishResult: info.fishResult, food: info.food, foodBag: info.foodBag, balanceRevision: info.balanceRevision || 0 });
  // Leave and catch messages can cross at the client while an ACK is in
  // flight.  Reject the stale catch before balance/energy processing so no
  // bait, fish, task progress, or receipt is created after the room is gone.
  if (!hasFishRoomMembership(session)) {
    return {
      tag: 4000,
      msgUid,
      data: { result: 1, reason: 'FISH_ROOM_REQUIRED', bigger: 0, ...current() },
    };
  }
  const req = fishingBalance.request(info, params || {}, 'fish-catch', String(count));
  if (req.error) return { tag:4000, msgUid, data:{ result:1, reason:req.error, ...current() } };
  if (req.receipt) return [{tag:1202,msgUid:0,data:buildItemSync(player,[])},{tag:4000,msgUid,data:{result:0,replayed:true,...current()}}];
  const blocked = info.fishResult.fishInfos.length ? 'FISH_PENDING'
    : !integrity.validInt(params?.count ?? 1, 1, 10) ? 'FISH_COUNT_INVALID'
      : Number(info.nextCatchAt || 0) > Date.now() ? 'FISH_CATCH_COOLDOWN'
        : !await integrity.canUseScene(player, info.scene) ? 'FISH_SCENE_LOCKED' : '';
  if (blocked) {
    return { tag: 4000, msgUid, data: { result: 1, reason: blocked, bigger: 0,
      level: info.level, exp: info.exp, fishResult: info.fishResult, food: info.food } };
  }
  // Native help30033014: fish from all unlocked normal scenes are available
  // everywhere; only relics are scene-specific. Never include locked scenes.
  const pool = await getUnlockedFishingPool(player);
  if (!pool.length) return { tag: 4000, msgUid, data: { result: 1, reason: 'FISH_SCENE_LOCKED',
    fishResult: info.fishResult, food: info.food, level: info.level, exp: info.exp } };
  gameplay.recoverEnergy(player);
  const baitDelta = consumeFishBait(player, info, count);
  if (!baitDelta) {
    return {
      tag: 4000,
      msgUid,
      data: {
        result: -1,
        reason: 'FISH_ENERGY_NOT_ENOUGH',
        need: count,
        have: getItemCount(player, FISH_BAIT_SYNC_ITEM_ID),
        bigger: 0,
        level: info.level,
        exp: info.exp,
        fishResult: info.fishResult,
        food: info.food || getInitialFishBaitId(),
      },
    };
  }
  gameplay.validate();
  const fishResult = buildFishingResult(player, count, pool, baitDelta.casts);
  fishResult.baitUses = baitDelta.casts;
  const taskChanged = !!addFishCount(player, count);
  const eventPackets = require('../services/FishingEventService').onCatch(player, count, fishResult);
  const granted = integrity.grant(player, fishResult.items);
  for(const item of fishResult.items)integrity.unlockPic(info,{id:item.id,multi:0});
  info.nextCatchAt = Date.now() + gameplay.rules.normal.minIntervalMs;
  const receipt = fishingBalance.record(info, req, {result:0});
  session.player = player;
  await integrity.save(session);

  const response = {
    tag: 4000,
    msgUid,
    data: {
      result: 0,
      ...receipt,
      bigger: fishResult.fishInfos.length > 0 ? 1 : 0,
      level: info.level,
      exp: info.exp,
      fishResult,
      food: info.food || getInitialFishBaitId(),
      foodBag: info.foodBag,
    },
  };

  broadcastFishRoomPacket(session, { tag: 4060, data: {
    id: String(player.playerId || ''), fishIds: fishResult.fishInfos.map(f => f.id),
    escapes: fishResult.escapes, itemIds: fishResult.items.map(r => r.id),
    time: fishResult.time, bigger: response.data.bigger,
  } });

  return [
    { tag: 1202, data: buildItemSync(player, [...baitDelta.deltas,...fishResult.items]) },
    ...granted.packets,
    ...eventPackets,
    ...(taskChanged ? buildTaskUpdatePacketsSafe(player) : []),
    response,
  ];
}
async function handleFishMapTransition(params, session, msgUid, tag) {
  if (!session.player) return { tag, msgUid, data: { result: -1, id: 0 } };

  // Prepare on a clone; a rejected selection must not normalize live state.
  const player = integrity.clone(session.player);
  const info = ensureFishInfo(player);
  const requestedMapId = params && params.id != null ? params.id
    : (tag === 4050 ? normalizeFishEnterSceneId(info.scene, 1) : null);
  if (!integrity.validInt(requestedMapId, 1, Number.MAX_SAFE_INTEGER)
      || !await integrity.canUseScene(player, requestedMapId)) {
    return { tag, msgUid, data: { result: 1, id: info.scene, reason: 'FISH_SCENE_LOCKED' } };
  }
  const mapId = Number(requestedMapId);
  if (!session._fishRooms) return { tag, msgUid, data: { result: 1, reason: 'FISH_ROOM_UNAVAILABLE' } };
  info.scene = mapId;
  return session._fishRooms.enter(session, mapId, params?.roomId, async () => {
    session.player = player;
    await integrity.save(session);
  }, pos => buildFishMapPlayer(player, info, pos), tag, msgUid);
}

async function handleFishChangeScene(params, session, msgUid) {
  return handleFishMapTransition(params, session, msgUid, 4002);
}

async function handleFishActiveIllue(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 4004, msgUid, data: { result: -1, rewards: [] } };

  const info = ensureFishInfo(player);
  const id = Math.max(1, toSafeInt(params && params.id, 1));
  const cfg = (configService.get('FishFetterConfig') || {})[params?.id];
  if (!cfg || info.fetters.includes(id) || !ensureArray(cfg.fishes).every(fishId => info.pics[fishId])) {
    return { tag: 4004, msgUid, data: { result: 1, rewards: [] } };
  }
  info.fetters.push(id);
  const rewards = grantRewards(player, cfg.rewards || []);
  await integrity.save(session);
  return { tag: 4004, msgUid, data: { result: 0, rewards } };
}

async function handleFishShipLogUpgrade(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 4005, msgUid, data: { result: -1, id: 0, exp: 0, time: 0 } };

  const info = ensureFishInfo(player);
  const id = Number(params?.id);
  const count = Number(params?.count);
  const cfg = (configService.get('FishShipLogRewardConfig') || {})[id];
  if (!cfg || !integrity.validInt(count, 1, 100000)) return { tag: 4005, msgUid, data: { result: 1, id, exp: 0, time: 0 } };
  const row = ensureShipLog(info, id);
  const cap = Math.max(...Object.keys(cfg.rewards || {}).map(Number));
  const cost = normalizeCost(cfg.cost);
  if (!cost || row.exp + count > cap || !consumeItem(player, cost.id, cost.count * count)) {
    return { tag: 4005, msgUid, data: { result: 1, id, exp: row.exp, time: row.time } };
  }
  row.exp += count;
  row.time = Date.now();

  await integrity.save(session);
  return [{ tag: 1202, msgUid: 0, data: buildItemSync(player, [{ id: cost.id, count: -cost.count * count }]) }, {
    tag: 4005,
    msgUid,
    data: {
      result: 0,
      id: row.id,
      exp: row.exp,
      time: row.time,
    },
  }];
}

async function handleFishShipLogReward(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 4006, msgUid, data: { result: -1, id: 0, record: [], rewardInfo: buildRewardInfo([]) } };

  const info = ensureFishInfo(player);
  const id = Number(params?.id);
  const cfg = (configService.get('FishShipLogRewardConfig') || {})[id];
  if (!cfg) return { tag: 4006, msgUid, data: { result: 1, id, record: [], rewardInfo: buildRewardInfo([]) } };
  const row = ensureShipLog(info, id);
  const stages = Object.keys(cfg.rewards || {}).map(Number).filter(stage => stage <= row.exp && !row.record.includes(stage));
  if (!stages.length) return { tag: 4006, msgUid, data: { result: 1, id, record: row.record, rewardInfo: buildRewardInfo([]) } };
  const granted = integrity.grant(player, stages.flatMap(stage => cfg.rewards[stage]));
  row.record.push(...stages);
  row.record.sort((a, b) => a - b);

  await integrity.save(session);
  return [...granted.packets, { tag: 1202, msgUid: 0, data: buildItemSync(player, granted.itemDeltas) }, {
    tag: 4006,
    msgUid,
    data: {
      result: 0,
      id: row.id,
      record: ensureArray(row.record),
      rewardInfo: granted.rewardInfo,
    },
  }];
}

async function handleFishBaitBagUpdate(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 4007, msgUid, data: { result: -1, curFood: 0 } };

  const info = ensureFishInfo(player);
  const explicitFood = params?.food ?? params?.curFood ?? params?.id;
  const hasBag = params && Object.prototype.hasOwnProperty.call(params, 'foodBag');
  const wantedBag = hasBag ? params.foodBag : (explicitFood != null ? [explicitFood] : info.foodBag);
  const baitConfig = configService.get('FishBaitConfig') || {};
  if (!Array.isArray(wantedBag) || wantedBag.length > 5 || wantedBag.some(id => !integrity.validInt(id, 1, 999999)
      || !baitConfig[id] || (Number(id) !== getInitialFishBaitId() && getItemCount(player, id) <= 0))
      || new Set(wantedBag.map(Number)).size !== wantedBag.length) {
    return { tag: 4007, msgUid, data: { result: 1, reason: 'FISH_BAIT_INVALID', curFood: info.food, food: info.food, foodBag: info.foodBag } };
  }
  info.foodBag = wantedBag.map(Number).filter(id => id !== getInitialFishBaitId());
  info.food = info.foodBag[0] || getInitialFishBaitId();

  await integrity.save(session);
  broadcastFishRoomPacket(session, { tag: 4062, data: { id: String(player.playerId || ''), food: info.food } });
  return {
    tag: 4007,
    msgUid,
    data: {
      result: 0,
      curFood: info.food,
      food: info.food,
      foodBag: ensureArray(info.foodBag),
    },
  };
}

async function handleFishDealMulti(params, session, msgUid) {
  const player = session.player ? integrity.clone(session.player) : null;
  if (!player) {
    return {
      tag: 4008,
      msgUid,
      data: { result: -1, orders: [], fails: [], fishInfos: [], rewards: [], extraPrice: {} },
    };
  }

  if (params?.autoPower === true) return handleFishAutoPower(params, session, msgUid);
  const info = ensureFishInfo(player);
  // Auto-deal is driven by the fishing-room loop.  A 4008 already queued
  // when the client leaves must not sell/equip fish after the seat is gone;
  // manual fish management outside the room remains unchanged.
  if (Number(params?.auto) === 1 && !hasFishRoomMembership(session)) {
    return { tag: 4008, msgUid, data: {
      result: 1, reason: 'FISH_ROOM_REQUIRED', orders: [], fails: [],
      fishInfos: info.fishResult.fishInfos, rewards: [], extraPrice: info.extraPrice,
    } };
  }
  const dealMap = ensurePlainObject(params && params.dealMap);
  const requested = Object.values(dealMap).flat();
  if ((ensureArray(dealMap[0]).length > 1 && params?.integrityVersion !== 1)
      || requested.length > 100 || requested.some(uid => !integrity.validInt(uid, 1, Number.MAX_SAFE_INTEGER))
      || new Set(requested.map(Number)).size !== requested.length
      || Object.keys(dealMap).some(key => !['0', '1', '2', '3'].includes(key) || !Array.isArray(dealMap[key]))) {
    return { tag: 4008, msgUid, data: { result: 1, orders: [], fails: [], fishInfos: [], rewards: [], extraPrice: info.extraPrice } };
  }
  const orders = [];
  const fails = [];
  const fishInfos = [];
  const rewardRows = [];
  let saleBaseCoins = 0;

  Object.keys(dealMap).forEach((typeKey) => {
    const dealType = Math.max(0, toSafeInt(typeKey, 0));
    const uidList = ensureArray(dealMap[typeKey]).map((v) => Math.max(0, toSafeInt(v, 0))).filter((v) => v > 0);
    uidList.forEach((uid) => {
      const fishIdx = findFishIndexByUid(info, uid);
      if (fishIdx < 0) {
        fails.push(uid);
        return;
      }
      const fish = ensurePlainObject(info.fishResult.fishInfos[fishIdx]);
      if (fish.lock) { fails.push(uid); return; }

      if (dealType === FISH_DEAL_TYPE.PUT_IN) {
        if(!isFishBasketType(fish.type)){fails.push(uid);return;}
        const type = normalizeFishBasketType(fish.type, getFishTypeById(fish.id, 1));
        const old = info.slots[String(type)];
        if (old?.lock || old?.uid === fish.uid) { fails.push(uid); return; }
        info.fishResult.fishInfos.splice(fishIdx, 1);
        info.slots[String(type)] = integrity.clone(fish);
        if (old?.id && old?.uid) {
          info.fishResult.fishInfos.splice(fishIdx, 0, integrity.clone(old));
          fishInfos.push({ ...integrity.clone(old), replaceUid: fish.uid });
        }
        integrity.unlockPic(info, fish);
      } else if (dealType === FISH_DEAL_TYPE.SHELL) {
        info.fishResult.fishInfos.splice(fishIdx, 1);
        integrity.unlockPic(info, fish);
        for (const reward of gameplay.sale(player, fish)) {
          if(reward.id===68) saleBaseCoins+=reward.count; else rewardRows.push(reward);
        }
      } else if (dealType === FISH_DEAL_TYPE.SUBMIT || dealType === FISH_DEAL_TYPE.LEGACY_SUBMIT) {
        const updatedOrders = applyFishToDailyOrders(info, fish);
        if (updatedOrders.length > 0) {
          info.fishResult.fishInfos.splice(fishIdx, 1);
          integrity.unlockPic(info, fish);
          orders.push(...updatedOrders);
          rewardRows.push({ id: FISH_COIN_ITEM_ID, count: Math.max(1, toSafeInt(fish.quality, 1)) });
        } else {
          fails.push(uid);
        }
      } else {
        fails.push(uid);
      }
    });
  });

  rewardRows.push(...knownEffects.saleRewards(player, saleBaseCoins));
  const rewards = grantRewards(player, rewardRows);
  const rewardSync = rewards.length > 0 ? { tag: 1202, msgUid: 0, data: buildItemSync(player, rewards) } : null;
  session.player = player;
  await integrity.save(session);
  const response = {
    tag: 4008,
    msgUid,
    data: {
      result: 0,
      orders: orders.slice().sort((a, b) => a - b),
      fails: Array.from(new Set(fails)).sort((a, b) => a - b),
      fishInfos,
      rewards,
      extraPrice: ensurePlainObject(info.extraPrice),
      orderState: info.orders,
      state: { slots: info.slots, fishResult: info.fishResult, pics: info.pics, fishTypeQualityPic: info.fishTypeQualityPic },
    },
  };
  return [...(rewardSync?[rewardSync]:[]),fishingBalance.syncCounts(player,[2,119]),response];
}

async function handleFishAutoPower(params, session, msgUid) {
  const player = session.player, info = player && player.fishInfo;
  const snapshot = info || {};
  const current = () => ({ state: { slots: snapshot.slots || {}, fishResult: snapshot.fishResult || { fishInfos: [] },
    pics: snapshot.pics || {}, fishTypeQualityPic: snapshot.fishTypeQualityPic || {} }, orderState: snapshot.orders || {},
    balanceRevision: snapshot.balanceRevision || 0, extraPrice: snapshot.extraPrice || {} });
  const fail = reason => ({ tag: 4008, msgUid, data: { result: 1, reason, ...current() } });
  if (!hasFishRoomMembership(session)) return fail('FISH_ROOM_REQUIRED');
  if (!info || !info.fishResult || !Array.isArray(info.fishResult.fishInfos)) {
    return { tag: 4008, msgUid, data: { result: 1, reason: 'FISH_AUTO_DATA_INVALID' } };
  }
  if (params.autoPowerVersion !== 1 || !Array.isArray(params.uids)) return fail('FISH_AUTO_REQUEST_INVALID');
  const fingerprint = JSON.stringify(params.uids);
  const req = fishingBalance.request(info, params, 'fish-auto-power', fingerprint);
  if (req.error) return fail(req.error);
  if (req.receipt) return [fishingBalance.syncCounts(player, [68,119,2]),
    { tag: 4008, msgUid, data: { ...req.receipt.response, ...current(), replayed: true } }];
  if (Number(info.level || 0) < Number(configService.get('FishBaseConfig')?.autoFish || 10)
      && !integrity.hasCard(player, 11000009)) return fail('FISH_AUTO_LOCKED');
  let plan;
  try { plan = require('../services/FishingAutoService').plan(player, params.uids); }
  catch (_) { return fail('FISH_AUTO_POWER_INVALID'); }
  if (plan.error) return fail(plan.error);
  const { next } = plan, nextInfo = next.fishInfo;
  const saleRows = plan.sold.flatMap(row => gameplay.sale(next, row));
  const saleBaseCoins = saleRows.filter(r=>r.id===68).reduce((n,r)=>n+r.count,0);
  const rewards = grantRewards(next, [...knownEffects.saleRewards(next, saleBaseCoins),...saleRows.filter(r=>r.id!==68)]);
  nextInfo.autoPowerHistory = [...(Array.isArray(nextInfo.autoPowerHistory) ? nextInfo.autoPowerHistory : []),
    { requestId: req.key, time: Date.now(), equipped: plan.equipped, sold: plan.sold, held: plan.held }].slice(-20);
  const data = fishingBalance.record(nextInfo, req, { result: 0, autoPower: true,
    equipped: plan.equipped, soldUids: plan.sold.map(row => row.uid), held: plan.held, rewards });
  session.player = next;
  await integrity.save(session);
  session._itemListCache = null;
  return [{ tag: 1202, msgUid: 0, data: buildItemSync(next, rewards) },fishingBalance.syncCounts(next,[2,119]),
    { tag: 4008, msgUid, data: { ...data, extraPrice: nextInfo.extraPrice, state: { slots: nextInfo.slots, fishResult: nextInfo.fishResult,
      pics: nextInfo.pics, fishTypeQualityPic: nextInfo.fishTypeQualityPic }, orderState: nextInfo.orders } }];
}

async function handleFishLock(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 4009, msgUid, data: { result: -1 } };

  const info = ensureFishInfo(player);
  const type = Number(params?.type);
  const lock = params && params.lock ? 1 : 0;
  const slot = info.slots[String(type)];
  if (!integrity.validInt(type, 1, 10) || !slot?.uid) return { tag: 4009, msgUid, data: { result: 1, type, lock: 0 } };
  slot.lock = lock;

  await integrity.save(session);
  return {
    tag: 4009,
    msgUid,
    data: {
      result: 0,
      type,
      lock,
    },
  };
}

async function handleFishingGearUpgrade(kind, params, session, msgUid) {
  const tag = kind === 'rod' ? 4010 : 4015;
  const player = session?.player;
  if (!player) return { tag, msgUid, data: { result: 1, reason: 'FISH_SESSION_REQUIRED' } };
  const info = ensureFishInfo(player);
  const state = () => ({ ...fishingGear.response(info, kind), balanceRevision: info.balanceRevision || 0 });
  const fail = reason => ({ tag, msgUid, data: { result: 1, reason, ...state() } });
  const fingerprint = JSON.stringify([params?.action, params?.upgradeAll,
    params?.expectedState?.rank, params?.expectedState?.level, params?.expectedState?.exp]);
  const req = fishingBalance.request(info, params, 'gear-' + kind, fingerprint);
  if (req.error) return fail(req.error);
  if (req.receipt) return [fishingBalance.syncCounts(player, [68, 69]),
    { tag, msgUid, data: { ...req.receipt.response, ...state(), replayed: true } }];
  const plan = fishingGear.plan(player, kind, params);
  if (plan.error) return fail(plan.error);
  const next = integrity.clone(player), nextInfo = next.fishInfo;
  if (!consumeItem(next, plan.cost.id, plan.cost.count)) return fail('FISH_GEAR_FUNDS_NOT_ENOUGH');
  fishingGear.apply(nextInfo, kind, plan);
  const taskChanged = kind === 'rod' && !!addFishRodUpgradeCount(next, 1);
  const data = fishingBalance.record(nextInfo, req, { result: 0, ...fishingGear.response(nextInfo, kind),
    action: plan.action, cost: plan.cost, steps: plan.steps });
  session.player = next;
  await integrity.save(session);
  session._itemListCache = null;
  return [
    { tag: 1202, msgUid: 0, data: buildItemSync(next, [{ id: plan.cost.id, count: -plan.cost.count }]) },
    ...(taskChanged ? buildTaskUpdatePacketsSafe(next) : []),
    { tag, msgUid, data },
    // ACK first: the callback must observe the old rank for the grade-up effect.
    ...(kind === 'rod' ? [buildFishRodUpdatePacket(nextInfo, 0)] : []),
  ];
}

async function handleFishRodUpgrade(params, session, msgUid) {
  return handleFishingGearUpgrade('rod', params, session, msgUid);
}

async function handleFishRodSwitch(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 4011, msgUid, data: { result: -1, id: 0 } };

  const info = ensureFishInfo(player);
  if (!integrity.ownsGear(player, 'FishRodConfig', params?.id, getInitialFishRodId())) return { tag: 4011, msgUid, data: { result: 1, id: info.rodId } };
  info.rodId = normalizeFishRodId(params && params.id != null ? params.id : info.rodId);
  await integrity.save(session);
  broadcastFishRoomPacket(session, { tag: 4061, data: { id: String(player.playerId || ''), rodId: info.rodId } });
  return { tag: 4011, msgUid, data: { result: 0, id: info.rodId } };
}

async function handleFishRodRefine(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 4012, msgUid, data: { result: -1, rodTempAttrs: [] } };

  const info = ensureFishInfo(player);
  const fail = reason => ({ tag: 4012, msgUid, data: { result: 1, reason,
    balanceRevision: info.balanceRevision || 0, rodTempAttrs: info.rodTempAttrs } });
  const req = fishingBalance.request(info, params, 'wash', 'wash');
  if (req.error) return fail(req.error);
  if (req.receipt) return [fishingBalance.syncCounts(player, [fishingBalance.rules.wash.cost.id]),
    { tag: 4012, msgUid, data: { ...req.receipt.response, replayed: true,
      rodTempAttrs: info.rodTempAttrs, balanceRevision: info.balanceRevision || 0 } }];
  let attrs, cost;
  try { cost = fishingBalance.validate().wash.cost; attrs = fishingBalance.rollWash(info.level); }
  catch (_) { return fail('FISH_BALANCE_CONFIG_INVALID'); }
  if (getItemCount(player, cost.id) < cost.count) return fail('FISH_WASH_STONE_NOT_ENOUGH');
  // Plan on a clone, so a pre-save failure cannot leak a partial debit into later saves.
  const next = integrity.clone(player), nextInfo = next.fishInfo;
  fishingBalance.archiveWash(nextInfo, 'reroll-preview');
  consumeItem(next, cost.id, cost.count);
  nextInfo.rodTempAttrs = attrs;
  nextInfo.rodTempBalanceVersion = fishingBalance.rules.version;
  const data = fishingBalance.record(nextInfo, req, { result: 0, rodTempAttrs: attrs });
  session.player = next;
  await integrity.save(session);
  return [{ tag: 1202, msgUid: 0, data: buildItemSync(next, [{ id: cost.id, count: -cost.count }]) },
    { tag: 4012, msgUid, data }];
}

async function handleFishRodSwitchAttr(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 4013, msgUid, data: { result: -1 } };

  const info = ensureFishInfo(player);
  const req = fishingBalance.request(info, params, 'wash-replace', 'wash-replace');
  if (req.error) return { tag: 4013, msgUid, data: { result: 1, reason: req.error, balanceRevision: info.balanceRevision || 0 } };
  if (req.receipt) return { tag: 4013, msgUid, data: { ...req.receipt.response, replayed: true,
    rodAttrs: info.rodAttrs, rodTempAttrs: info.rodTempAttrs, balanceRevision: info.balanceRevision || 0 } };
  if (!info.rodTempAttrs.length || info.rodTempAttrs.some(row => !integrity.validInt(row.type, 1, 1000)
      || !integrity.validInt(row.level, 1, 10000) || !integrity.validInt(row.value, 0, Number.MAX_SAFE_INTEGER))) {
    return { tag: 4013, msgUid, data: { result: 1, reason: 'FISH_WASH_PREVIEW_MISSING' } };
  }
  const next = integrity.clone(player), nextInfo = next.fishInfo;
  fishingBalance.archiveWash(nextInfo, 'replace-equipped');
  nextInfo.rodAttrs = nextInfo.rodTempAttrs;
  nextInfo.rodTempAttrs = [];
  const data = fishingBalance.record(nextInfo, req, { result: 0, rodAttrs: nextInfo.rodAttrs, rodTempAttrs: [] });
  session.player = next;
  await integrity.save(session);
  return { tag: 4013, msgUid, data };
}

async function handleFishRaftUpgrade(params, session, msgUid) {
  return handleFishingGearUpgrade('raft', params, session, msgUid);
}

async function handleFishRaftSwitch(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 4016, msgUid, data: { result: -1, id: 0 } };

  const info = ensureFishInfo(player);
  if (!integrity.ownsGear(player, 'FishRaftConfig', params?.id, getInitialFishRaftId())) return { tag: 4016, msgUid, data: { result: 1, id: info.raftId } };
  info.raftId = normalizeFishRaftId(params && params.id != null ? params.id : info.raftId);
  await integrity.save(session);
  if (Math.max(0, toSafeInt(session._fishRoomMapId, 0)) > 0) {
    broadcastFishRoomPacket(session, buildFishOtherRaftSwitchPacket(
      player.playerId || player.userId || session.userId,
      info.raftId,
    ));
  }
  return { tag: 4016, msgUid, data: { result: 0, id: info.raftId } };
}

async function handleFishRefreshOrders(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 4020, msgUid, data: { result: -1, id: 0 } };

  const info = ensureFishInfo(player);
  const index = Number(params?.index);
  if (!integrity.validInt(index, 0, 2)) return { tag: 4020, msgUid, data: { result: 1, id: 0 } };
  const order = ensureOrder(info, index);
  const fail = reason => ({ tag: 4020, msgUid, data: { result: 1, reason, id: order.id, orders: info.orders } });
  if (order.received) return fail('FISH_ORDER_ALREADY_CLAIMED');
  if (params?.expectedId != null && Number(params.expectedId) !== order.id) return fail('FISH_ORDER_STALE');
  // Native FishOrderItem: item70 x1; received orders cannot refresh. Raft6205 raises max star to6.
  const maxStar = integrity.ownsGear(player, 'FishRaftConfig', 6205, getInitialFishRaftId()) ? 6 : 5;
  const candidates = Object.values(getFishOrderConfigMap()).filter(row => row.id !== order.id
    && row.star > 0 && row.star <= maxStar && [41, 42, 43].includes(row.type));
  if (!candidates.length) return fail('FISH_ORDER_CONFIG_MISSING');
  if (!consumeItem(player, 70, 1)) return fail('FISH_ORDER_TICKET_NOT_ENOUGH');
  const selected = pickOne(candidates);
  Object.assign(order, { id: selected.id, progress: 0, received: false });
  await integrity.save(session);
  return [{ tag: 1202, msgUid: 0, data: buildItemSync(player, [{ id: 70, count: -1 }]) },
    { tag: 4020, msgUid, data: { result: 0, id: order.id, orders: info.orders } }];
}

async function handleFishGetOrderReward(params, session, msgUid) {
  const player = session.player ? integrity.clone(session.player) : null;
  if (!player) return { tag: 4021, msgUid, data: { result: -1, rewardInfo: buildRewardInfo([]) } };

  const info = ensureFishInfo(player);
  const index = Number(params?.index);
  if (!integrity.validInt(index, 0, 2)) return { tag: 4021, msgUid, data: { result: 1, rewardInfo: buildRewardInfo([]) } };
  const order = ensureOrder(info, index);
  const cfg = getFishOrderConfigById(order.id, index);
  if (order.received || order.progress < cfg.count) {
    return { tag: 4021, msgUid, data: { result: -1, rewardInfo: buildRewardInfo([]) } };
  }
  order.received = true;

  const orderRewards = cfg.rewards.length > 0
    ? cfg.rewards
    : [{ id: FISH_CRYSTAL_ITEM_ID, count: Math.max(1, cfg.star * 2) }];
  const rewards = grantRewards(player, knownEffects.orderRewards(player, orderRewards));
  const taskChanged = !!addFishOrderCompleteCount(player, 1);
  session.player = player;
  await integrity.save(session);
  const response = {
    tag: 4021,
    msgUid,
    data: {
      result: 0,
      rewardInfo: buildRewardInfo(rewards),
    },
  };
  const rewardSync = rewards.length > 0 ? { tag: 1202, msgUid: 0, data: buildItemSync(player, rewards) } : null;
  return [
    ...(rewardSync ? [rewardSync] : []),
    ...(taskChanged ? buildTaskUpdatePacketsSafe(player) : []),
    response,
  ];
}

async function handleFishPriceReward(_params, session, msgUid) {
  const player = session.player ? integrity.clone(session.player) : null;
  if (!player) return { tag: 4022, msgUid, data: { result: -1, rewards: [] } };

  const info = ensureFishInfo(player);
  const rewards = [];
  Object.keys(info.extraPrice).forEach((idKey) => {
    const id = Math.max(0, toSafeInt(idKey, 0));
    const count = Math.max(0, toSafeInt(info.extraPrice[idKey], 0));
    if (id > 0 && count > 0) rewards.push({ id, count });
  });
  if (rewards.length <= 0) return { tag: 4022, msgUid, data: { result: 1, rewards: [] } };
  const rows = grantRewards(player, rewards);
  info.extraPrice = {};

  session.player = player;
  await integrity.save(session);
  return [{ tag: 1202, msgUid: 0, data: buildItemSync(player, rows) }, { tag: 4022, msgUid, data: { result: 0, rewards: rows } }];
}

async function handleFishEnterMap(params, session, msgUid) {
  if (params?.action === 'list') {
    if (!session.player || !session._fishRooms) return { tag: 4050, msgUid, data: { result: 1, reason: 'FISH_ROOM_UNAVAILABLE' } };
    const id = Number(params.id);
    if (!integrity.validInt(id, 1, 99999) || !await integrity.canUseScene(session.player, id)) {
      return { tag: 4050, msgUid, data: { result: 1, reason: 'FISH_SCENE_LOCKED' } };
    }
    const data = await session._fishRooms.run(() => session._fishRooms.list(session, id, params.page));
    return { tag: 4050, msgUid, data };
  }
  return handleFishMapTransition(params, session, msgUid, 4050);
}

async function handleFishLeaveMap(_params, session, msgUid) {
  if (!session.player) return { tag: 4051, msgUid, data: { result: -1 } };
  const player = integrity.clone(session.player);

  const info = ensureFishInfo(player);
  if (!session._fishRooms) return { tag: 4051, msgUid, data: { result: 1, reason: 'FISH_ROOM_UNAVAILABLE' } };
  info.scene = 1;
  return session._fishRooms.leave(session, async () => {
    session.player = player;
    await integrity.save(session);
  }, 4051, msgUid);
}

async function handleFishMapEmoji(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 4052, msgUid, data: { result: -1 } };

  const info = ensureFishInfo(player);
  const mapId = Math.max(0, toSafeInt(session._fishRoomMapId, 0));
  const id = String(player.playerId || '');
  const index = Math.max(0, toSafeInt(params && params.index, 0));

  await integrity.save(session);
  const emojiPush = buildFishPlayerEmojiPacket(id, index);
  broadcastFishRoomPacket(session, emojiPush);
  return [
    emojiPush,
    {
      tag: 4052,
      msgUid,
      data: {
        result: 0,
        mapId,
        id,
        index,
      },
    },
  ];
}

module.exports = {
  ensureFishInfo,
  buildFishMapPlayer,
  buildFishRodUpdatePacket,
  buildFishMapOtherEnterPacket,
  buildFishPlayerEmojiPacket,
  buildFishOtherRaftSwitchPacket,
  handleFishCatch,
  handleFishChangeScene,
  handleFishActiveIllue,
  handleFishShipLogUpgrade,
  handleFishShipLogReward,
  handleFishBaitBagUpdate,
  handleFishDealMulti,
  handleFishLock,
  handleFishRodUpgrade,
  handleFishRodSwitch,
  handleFishRodRefine,
  handleFishRodSwitchAttr,
  handleFishRaftUpgrade,
  handleFishRaftSwitch,
  handleFishRefreshOrders,
  handleFishGetOrderReward,
  handleFishPriceReward,
  handleFishEnterMap,
  handleFishLeaveMap,
  handleFishMapEmoji,
};

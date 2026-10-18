/**
 * 物品/货币/装备/商店系统
 * tag: 1200 物品列表, 1201 兑换, 1202 批量购买,
 *      1300 使用物品, 1301 出售, 2200 装备替换, 1210 商店购买
 */

const config = require('../services/ConfigService');
const farmShop = require('../services/FarmShopService');
const playerService = require('../services/PlayerService');
const logger = require('../logger');
const { addRewardToPlayer, addExpToPlayer } = require('./raid');
const { buildClientItemList } = require('../services/CurrencySync');
const { buildTempleLingyunTimeRecords } = require('./temple');
const {
  ensureEquipInfo,
  replaceOpenEquipToPlan,
  saleOpenEquips,
  isEquipTemplateItem,
  createEquipFromTemplateId,
  addOpenEquip,
} = require('../services/EquipService');
const {
  addEquipSaleProgress,
  addBagelConsume: addMainTaskBagelConsume,
  addMountRideCount,
  refreshMainTaskProgress,
} = require('../services/MainTaskProgressService');
const { addBagelConsume: addRealmBagelConsume } = require('../services/RealmTaskProgressService');
const rewardGrant = require('../services/RewardGrantService');
const randomItemRewards = require('../services/RandomUsableItemRewardService');
const { buildPetTimeRecordPayload } = require('./pet');
const {
  buildActivityUpdatePacket,
  getActiveDailyShopPolicy,
  getActiveActivityShopPolicy,
  commitActivityShopPurchase,
} = require('./activity');

const ITEM_LIST_CACHE_TTL_MS = 3000;
const ITEM_LIST_LEVEL_CHECK_TTL_MS = 1000;
const FORTUNE_FREE_SHOP_ID = 11018000;
const fortuneDailyPurchaseLocks = new Map();
const activityFreePurchaseLocks = new Map();
const generalPurchaseLocks = new Map();

// Equipment sale only mutates these top-level player regions. Keeping the
// durable write narrow avoids cloning/re-writing large immutable receipts
// (notably arenaReceiptLedger) on every auto-sale tick.
const EQUIP_SALE_SAVE_FIELDS = Object.freeze([
  'equipInfo',
  'items',
  'currencies',
  'taskInfo',
  'other_attr_info',
]);

function clonePlain(value) {
  if (!value || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

function cloneEquipSaleDraft(player) {
  const draft = { ...(player || {}) };
  EQUIP_SALE_SAVE_FIELDS.forEach((field) => {
    if (player && Object.prototype.hasOwnProperty.call(player, field)) {
      draft[field] = clonePlain(player[field]);
    }
  });
  return draft;
}

function getRequestedPurchaseCount(params = {}, goodsId = 0) {
  const requireMap = params && typeof params.require === 'object' && !Array.isArray(params.require)
    ? params.require
    : {};
  return Number(requireMap[goodsId] ?? requireMap[String(goodsId)] ?? 0);
}

function requestIncludesFortuneDailyGift(params = {}) {
  return getRequestedPurchaseCount(params, FORTUNE_FREE_SHOP_ID) > 0;
}

function buildFortuneDailyFailure(msgUid, code, state = null) {
  const response = {
    tag: 1202,
    msgUid,
    data: {
      result: -1,
      msg: code === 'DAILY_LIMIT_REACHED' ? 'daily limit reached' : 'activity gift unavailable',
      code,
      id: FORTUNE_FREE_SHOP_ID,
      rewardInfo: { items: [], equips: [], gems: [] },
    },
  };
  if (!state || !state.activityRow) return response;
  return [buildActivityUpdatePacket(state.activityRow), response];
}

function withFortuneDailyPurchaseLock(params, session, msgUid, work) {
  if (!requestIncludesFortuneDailyGift(params)) return work();
  const userId = String(session && (session.userId || (session.player && session.player.userId)) || '').trim();
  if (!userId) return Promise.resolve(buildFortuneDailyFailure(msgUid, 'FORTUNE_DAILY_USER_REQUIRED'));
  const previous = fortuneDailyPurchaseLocks.get(userId) || Promise.resolve();
  const current = previous.catch(() => undefined).then(async () => {
    const fresh = await playerService.loadPlayer(userId);
    if (!fresh) return buildFortuneDailyFailure(msgUid, 'FORTUNE_DAILY_PLAYER_NOT_FOUND');
    session.player = fresh;
    const before = clonePlain(fresh);
    try {
      return await work();
    } catch (error) {
      session.player = before;
      throw error;
    }
  });
  let tracked;
  const cleanup = () => {
    if (fortuneDailyPurchaseLocks.get(userId) === tracked) fortuneDailyPurchaseLocks.delete(userId);
  };
  tracked = current.then(
    (value) => { cleanup(); return value; },
    () => { cleanup(); return undefined; },
  );
  fortuneDailyPurchaseLocks.set(userId, tracked);
  return current;
}

function isConfiguredFreeActivityShop(goodsId) {
  const id = Number(goodsId) || 0;
  if (id <= 0) return false;
  const goods = config.get('ShopConfig')?.[id] || config.get('ShopConfig')?.[String(id)] || null;
  if (!goods || Number(goods.payId) > 0 || (Array.isArray(goods.cost) && goods.cost.length > 0)) return false;
  const activityShops = config.get('ActivityShopConfig') || {};
  return Object.values(activityShops).some((rows) => {
    const map = rows && typeof rows === 'object' && !Array.isArray(rows) ? rows : {};
    return !!(map[id] || map[String(id)]);
  });
}

function requestIncludesFreeActivityShop(params = {}) {
  return Object.keys(params && params.require && typeof params.require === 'object' ? params.require : {})
    .some((id) => isConfiguredFreeActivityShop(id));
}

function withFreeActivityPurchaseLock(params, session, msgUid, work) {
  if (!requestIncludesFreeActivityShop(params)) return work();
  const userId = String(session && (session.userId || (session.player && session.player.userId)) || '').trim();
  if (!userId) {
    return Promise.resolve({
      tag: 1202,
      msgUid,
      data: { result: -1, code: 'ACTIVITY_SHOP_USER_REQUIRED', rewardInfo: buildRewardInfo([], [], []) },
    });
  }
  const previous = activityFreePurchaseLocks.get(userId) || Promise.resolve();
  const current = previous.catch(() => undefined).then(() => (
    require('../services/PlayerMutationService').run(userId, async () => {
      if (typeof playerService.drainPendingSaves === 'function') await playerService.drainPendingSaves(userId);
      const fresh = await playerService.loadPlayer(userId);
      if (!fresh) {
        return {
          tag: 1202,
          msgUid,
          data: { result: -1, code: 'ACTIVITY_SHOP_PLAYER_NOT_FOUND', rewardInfo: buildRewardInfo([], [], []) },
        };
      }
      session.player = fresh;
      const before = clonePlain(fresh);
      try {
        return await work();
      } catch (error) {
        session.player = before;
        throw error;
      }
    })
  ));
  let tracked;
  const cleanup = () => {
    if (activityFreePurchaseLocks.get(userId) === tracked) activityFreePurchaseLocks.delete(userId);
  };
  tracked = current.then(
    (value) => { cleanup(); return value; },
    () => { cleanup(); return undefined; },
  );
  activityFreePurchaseLocks.set(userId, tracked);
  return current;
}

function withGeneralPurchaseLock(session, msgUid, work) {
  const userId = String(session && (session.userId || (session.player && session.player.userId)) || '').trim();
  if (!userId) return work();
  const previous = generalPurchaseLocks.get(userId) || Promise.resolve();
  const current = previous.catch(() => undefined).then(() => (
    require('../services/PlayerMutationService').run(userId, async () => {
      if (typeof playerService.drainPendingSaves === 'function') await playerService.drainPendingSaves(userId);
      const fresh = await playerService.loadPlayer(userId);
      // Unit contracts provide an in-memory session without a backing DB.
      // Production remains fail-closed when the authoritative snapshot is
      // unavailable.
      if (!fresh && String(process.env.NODE_ENV || '').toLowerCase() !== 'test') {
        return { tag: 1202, msgUid, data: { result: -1, code: 'PLAYER_SNAPSHOT_REQUIRED' } };
      }
      session.player = fresh || session.player;
      return work();
    })
  ));
  let tracked;
  const cleanup = () => {
    if (generalPurchaseLocks.get(userId) === tracked) generalPurchaseLocks.delete(userId);
  };
  tracked = current.then((value) => { cleanup(); return value; }, (error) => { cleanup(); throw error; });
  generalPurchaseLocks.set(userId, tracked);
  return current;
}

function buildItemTimeRecords(player = {}) {
  return {
    ...require('../services/FarmRecoveryService').timeRecords(player),
    ...buildTempleLingyunTimeRecords(player),
    ...buildPetTimeRecordPayload(player),
  };
}

function scheduleItemPlayerSave(session, player, reason = 'item') {
  if (!session || !session.userId || !player) return;
  if (session._itemSaveScheduled) return;
  session._itemSaveScheduled = true;
  playerService.savePlayerDeferred(session.userId, player).then(
    () => {
      session._itemSaveScheduled = false;
    },
    (err) => {
      logger.warn(`[Item] async save failed ${reason} user=${session.userId}: ${err.message}`);
      session._itemSaveScheduled = false;
    }
  );
}

function getMountHandlerSafe() {
  try {
    // eslint-disable-next-line global-require
    return require('./mount');
  } catch (_err) {
    return null;
  }
}

function toSafeInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function getGemHandlerSafe() {
  try {
    // eslint-disable-next-line global-require
    return require('./gem');
  } catch (_err) {
    return null;
  }
}

function getBloodlineHandlerSafe() {
  try {
    // eslint-disable-next-line global-require
    return require('./bloodline');
  } catch (_err) {
    return null;
  }
}

function getRandomBloodlinePackQuality(itemId) {
  return getRandomPackQuality(itemId, 'random_bloodline_')
    || getRandomPackQuality(itemId, 'random_bloodlinePiece_');
}

function pickBloodlineIdByQuality(quality) {
  const q = Math.max(0, toSafeInt(quality, 0));
  if (q <= 0) return 0;
  const cfg = config.get('BloodlineConfig') || {};
  const ids = Object.keys(cfg)
    .map((key) => toSafeItemId(key))
    .filter((id) => id > 0 && toSafeInt(cfg[id] && cfg[id].quality, 0) === q)
    .sort((a, b) => a - b);
  if (ids.length <= 0) return 0;
  return ids[Math.max(0, Math.min(ids.length - 1, Math.floor(Math.random() * ids.length)))];
}

function grantRandomBloodlinePackRewards(player, packItemId, count) {
  const bloodline = getBloodlineHandlerSafe();
  if (!bloodline || typeof bloodline.grantBloodlineToPlayer !== 'function') return [];
  const quality = getRandomBloodlinePackQuality(packItemId);
  if (quality <= 0) return [];
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const bloodlineId = pickBloodlineIdByQuality(quality);
    const granted = bloodlineId > 0 ? bloodline.grantBloodlineToPlayer(player, bloodlineId) : null;
    if (granted) rows.push(granted);
  }
  return rows;
}

function getValhallaHandlerSafe() {
  try {
    // eslint-disable-next-line global-require
    return require('./valhalla');
  } catch (_err) {
    return null;
  }
}

function getArtifactHandlerSafe() {
  try {
    // eslint-disable-next-line global-require
    return require('./artifact');
  } catch (_err) {
    return null;
  }
}

const VALHALLA_FRAGMENT_COMPOSE = {
  100101: 100111,
  100102: 100112,
  100103: 100113,
  100104: 100114,
  100105: 100115,
};

function getValhallaFragmentComposeItemId(itemId) {
  return VALHALLA_FRAGMENT_COMPOSE[toSafeItemId(itemId)] || 0;
}

function getRandomValhallaPackQuality(itemId) {
  const id = toSafeItemId(itemId);
  if (id <= 0) return 0;
  const assetsCfg = config.get('AssetsConfig') || {};
  const row = assetsCfg[id] || assetsCfg[String(id)] || null;
  const icon = row && typeof row.icon === 'string' ? row.icon : '';
  if (!icon.startsWith('random_valhalla_')) return 0;
  return Math.max(0, toSafeInt(row && row.quality, 0));
}

function pickValhallaIdByQuality(quality) {
  const q = Math.max(0, toSafeInt(quality, 0));
  if (q <= 0) return 0;
  const cfg = config.get('ValhallaConfig') || {};
  const ids = Object.keys(cfg)
    .map((key) => toSafeItemId(key))
    .filter((id) => id > 0 && toSafeInt(cfg[id] && cfg[id].quality, 0) === q)
    .sort((a, b) => a - b);
  if (ids.length <= 0) return 0;
  const idx = Math.max(0, Math.min(ids.length - 1, Math.floor(Math.random() * ids.length)));
  return ids[idx];
}

function grantRandomValhallaPackRewards(player, packItemId, count) {
  const valhalla = getValhallaHandlerSafe();
  if (!valhalla || typeof valhalla.grantValhallaToPlayer !== 'function') return [];
  const quality = getRandomValhallaPackQuality(packItemId);
  if (quality <= 0) return [];
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const heroId = pickValhallaIdByQuality(quality);
    if (heroId <= 0) continue;
    const hero = valhalla.grantValhallaToPlayer(player, heroId);
    if (hero) rows.push(hero);
  }
  return rows;
}

function getRandomPackQuality(itemId, prefix) {
  const id = toSafeItemId(itemId);
  if (id <= 0) return 0;
  const assetsCfg = config.get('AssetsConfig') || {};
  const row = assetsCfg[id] || assetsCfg[String(id)] || null;
  const icon = row && typeof row.icon === 'string' ? row.icon : '';
  return icon.startsWith(prefix) ? Math.max(0, toSafeInt(row && row.quality, 0)) : 0;
}

function getRandomPetPackQuality(itemId) {
  return getRandomPackQuality(itemId, 'random_pet_');
}

function getRandomArtifactPackQuality(itemId) {
  return getRandomPackQuality(itemId, 'random_artifact_');
}

function pickPetIdByQuality(quality) {
  const q = Math.max(0, toSafeInt(quality, 0));
  if (q <= 0) return 0;
  const cfg = config.get('PetConfig') || {};
  const ids = Object.keys(cfg)
    .map((key) => toSafeItemId(key))
    .filter((id) => id > 0 && toSafeInt(cfg[id] && cfg[id].quality, 0) === q)
    .sort((a, b) => a - b);
  if (ids.length <= 0) return 0;
  return ids[Math.max(0, Math.min(ids.length - 1, Math.floor(Math.random() * ids.length)))];
}

function grantRandomPetPackRewards(player, packItemId, count) {
  const pet = require('./pet');
  if (!pet || typeof pet.grantPetToPlayer !== 'function') return [];
  const quality = getRandomPetPackQuality(packItemId);
  if (quality <= 0) return [];
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const petId = pickPetIdByQuality(quality);
    const granted = petId > 0 ? pet.grantPetToPlayer(player, petId) : null;
    if (granted) rows.push(granted);
  }
  return rows;
}

function pickArtifactIdByQuality(quality) {
  const q = Math.max(0, toSafeInt(quality, 0));
  if (q <= 0) return 0;
  const cfg = config.get('ArtifactConfig') || {};
  const ids = Object.keys(cfg)
    .map((key) => toSafeItemId(key))
    .filter((id) => id > 0 && toSafeInt(cfg[id] && cfg[id].quality, 0) === q)
    .sort((a, b) => a - b);
  if (ids.length <= 0) return 0;
  return ids[Math.max(0, Math.min(ids.length - 1, Math.floor(Math.random() * ids.length)))];
}

function grantRandomArtifactPackRewards(player, packItemId, count) {
  const artifact = getArtifactHandlerSafe();
  if (!artifact || typeof artifact.grantArtifactToPlayer !== 'function') return [];
  const quality = getRandomArtifactPackQuality(packItemId);
  if (quality <= 0) return [];
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const artifactId = pickArtifactIdByQuality(quality);
    const granted = artifactId > 0 ? artifact.grantArtifactToPlayer(player, artifactId) : null;
    if (granted) rows.push(granted);
  }
  return rows;
}

function isGemRewardId(itemId) {
  const gemCfg = config.get('GemLevelConfig') || {};
  const id = Number(itemId) || 0;
  return !!(id > 0 && (gemCfg[id] || gemCfg[String(id)]));
}

function getGemPackLevel(itemId) {
  return randomItemRewards.getGemPackLevel(Number(itemId));
}

function pickGemRewardIdByLevel(level) {
  const ids = randomItemRewards.getGemRewardIdsByLevel(Number(level));
  if (ids.length <= 0) return 0;
  const index = Math.min(ids.length - 1, Math.floor(Math.random() * ids.length));
  return ids[index];
}

function grantGemPackRewards(player, packItemId, count, preparedInfo = null) {
  const level = getGemPackLevel(packItemId);
  const ids = level > 0 ? randomItemRewards.getGemRewardIdsByLevel(level) : [];
  if (ids.length <= 0) return [];
  const gem = getGemHandlerSafe();
  if (!gem || typeof gem.ensureGemInfo !== 'function' || typeof gem.addGem !== 'function') return [];
  // Normalize the existing bag once, then append only the new gems. The old
  // loop normalized the entire growing bag for every pack in the request.
  const info = preparedInfo || gem.ensureGemInfo(player);
  const rewards = [];
  for (let index = 0; index < count; index += 1) {
    const rewardId = ids[Math.min(ids.length - 1, Math.floor(Math.random() * ids.length))];
    rewards.push(gem.addGem(info, rewardId));
  }
  return rewards;
}

function grantGemRewards(player, gemId, count, preparedInfo = null) {
  const gem = getGemHandlerSafe();
  if (!gem || typeof gem.ensureGemInfo !== 'function' || typeof gem.addGem !== 'function') {
    return [];
  }

  const info = preparedInfo || gem.ensureGemInfo(player);
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    rows.push(gem.addGem(info, gemId));
  }
  return rows;
}

function buildGemUpdatePackets(gems = []) {
  return (Array.isArray(gems) ? gems : [])
    .filter((row) => row && Number(row.uid) > 0 && Number(row.id) > 0)
    .map((row) => ({
      tag: 3901,
      msgUid: 0,
      data: {
        result: 0,
        uid: Number(row.uid) || 0,
        id: Number(row.id) || 0,
        shapeId: Number(row.shapeId) || 0,
      },
    }));
}

function buildGemInfoSyncPacket(player) {
  const gem = getGemHandlerSafe();
  if (!player || !gem || typeof gem.ensureGemInfo !== 'function') return null;
  const info = gem.ensureGemInfo(player);
  return {
    tag: 3900,
    msgUid: 0,
    data: {
      equippedId: 0,
      plan: info.plan,
      gems: info.gems,
      exchangeTimes: info.exchangeTimes,
      fieldCount: info.fieldCount,
    },
  };
}

function getPurchaseResultPacket(result, msgUid) {
  if (!Array.isArray(result)) return result;
  return result.find((packet) => packet && packet.tag === 1202 && packet.msgUid === msgUid)
    || result.find((packet) => packet && packet.tag === 1202 && packet.msgUid !== 0)
    || result.find((packet) => packet && packet.tag === 1202)
    || null;
}

function mergeItemDeltaRows(rows = []) {
  const merged = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const id = Number(row && row.id) || 0;
    const count = Number(row && row.count) || 0;
    if (id <= 0 || count === 0) return;
    merged.set(id, (merged.get(id) || 0) + count);
  });
  return Array.from(merged.entries())
    .map(([id, count]) => ({ id, count }))
    .filter((row) => row.count !== 0)
    .sort((a, b) => a.id - b.id);
}

function getOptionalSaleTicketConfig() {
  const rawId = process.env.SALE_TICKET_ITEM_ID || process.env.SILVER_TICKET_ITEM_ID;
  if (rawId == null || rawId === '') {
    return { ticketItemId: 0, ticketRate: 0, enabled: false };
  }

  const ticketItemId = Number(rawId) || 0;
  const ticketRate = Number(process.env.SALE_TICKET_RATE || 1);
  return {
    ticketItemId,
    ticketRate: Number.isFinite(ticketRate) ? ticketRate : 1,
    enabled: ticketItemId > 0,
  };
}

function buildTaskUpdatePacketsSafe(player, msgUid = 0) {
  try {
    // eslint-disable-next-line global-require
    const task = require('./task');
    if (task && typeof task.buildActiveTaskUpdatePackets === 'function') {
      return task.buildActiveTaskUpdatePackets(player, msgUid);
    }
  } catch (_err) {}
  return [];
}

function parsePositiveCount(value, fallback = 1) {
  if (value == null) return { valid: true, count: fallback };
  const count = Math.floor(Number(value));
  if (!Number.isFinite(count) || count <= 0) return { valid: false, count: fallback };
  return { valid: true, count };
}

function toSafeItemId(value) {
  const id = Math.floor(Number(value));
  return Number.isFinite(id) && id > 0 ? id : 0;
}

function getOwnedItemOrCurrencyCount(player, itemId) {
  const id = toSafeItemId(itemId);
  if (!player || id <= 0) return 0;
  const currencies = player.currencies || {};
  if (id === 1) return Math.max(0, Math.floor(Number(currencies.diamond) || 0));
  if (id === 2) return Math.max(0, Math.floor(Number(currencies.silver) || 0));
  if (id === 3) return Math.max(0, Math.floor(Number(player.exp) || 0));
  if (id === 6) return Math.max(0, Math.floor(Number(currencies.gold) || 0));
  return Math.max(0, Math.floor(Number(player.items && player.items[id]) || 0));
}

function consumeBagItem(player, itemId, count) {
  const id = toSafeItemId(itemId);
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  if (!player || id <= 0 || safeCount <= 0) return false;
  player.items = player.items || {};
  if ((Number(player.items[id]) || 0) < safeCount) return false;
  player.items[id] = Math.max(0, (Number(player.items[id]) || 0) - safeCount);
  if (player.items[id] <= 0) delete player.items[id];
  return true;
}

function buildRewardInfo(items = [], equips = [], gems = [], extra = {}) {
  const base = rewardGrant.buildEmptyRewardInfo();
  return {
    ...base,
    items: Array.isArray(items) ? items : [],
    equips: Array.isArray(equips) ? equips : [],
    gems: Array.isArray(gems) ? gems : [],
    swords: Array.isArray(extra.swords) ? extra.swords : [],
    pets: Array.isArray(extra.pets) ? extra.pets : [],
    ...extra,
  };
}

function ensureItemUseRecords(player) {
  if (!player || typeof player !== 'object') return {};
  if (!player.itemUseRecords || typeof player.itemUseRecords !== 'object' || Array.isArray(player.itemUseRecords)) {
    player.itemUseRecords = {};
  }
  require('../services/ItemPillService').ensure(player);
  return player.itemUseRecords;
}

function getItemUseRecordCount(player, itemId) {
  const records = ensureItemUseRecords(player);
  const key = String(toSafeItemId(itemId));
  return Math.max(0, toSafeInt(records[key], 0));
}

function addItemUseRecord(player, itemId, delta = 1) {
  const id = toSafeItemId(itemId);
  if (id <= 0) return 0;
  const records = ensureItemUseRecords(player);
  const key = String(id);
  records[key] = Math.max(0, toSafeInt(records[key], 0)) + Math.max(0, toSafeInt(delta, 0));
  return records[key];
}

function addOtherAttrRecord(player, itemId, delta = 1, minimum = 0) {
  const id = toSafeItemId(itemId);
  if (id <= 0 || !player || typeof player !== 'object') return 0;
  if (!player.other_attr_info || typeof player.other_attr_info !== 'object' || Array.isArray(player.other_attr_info)) {
    player.other_attr_info = {};
  }
  const holder = player.other_attr_info;
  if (!holder.record || typeof holder.record !== 'object' || Array.isArray(holder.record)) {
    holder.record = {};
  }
  const key = String(id);
  const next = Math.max(0, toSafeInt(holder.record[key], 0)) + Math.max(0, toSafeInt(delta, 0));
  holder.record[key] = Math.max(next, Math.max(0, toSafeInt(minimum, 0)));
  return holder.record[key];
}

function buildUseRecordsPayload(player) {
  const records = ensureItemUseRecords(player);
  return Object.keys(records)
    .map((key) => ({ id: toSafeInt(key, 0), count: Math.max(0, toSafeInt(records[key], 0)) }))
    .filter((row) => row.id > 0 || row.id === -802 || row.id === -804);
}

function canUseItemByLimit(player, itemId, count, useCfg = null) {
  const safeCount = Math.max(0, toSafeInt(count, 0));
  if (safeCount <= 0) return false;
  const cfg = useCfg || (config.get('AssetsUseConfig') || {})[itemId] || (config.get('AssetsUseConfig') || {})[String(itemId)] || null;
  if (!cfg) return true;
  const pillLimit = require('../services/ItemPillService').permanentLimit(player, itemId);
  if (pillLimit) return pillLimit.used + safeCount <= pillLimit.cap;

  const limit = Math.max(0, toSafeInt(cfg.limit, 0));
  if (limit <= 0) return true;
  return getItemUseRecordCount(player, itemId) + safeCount <= limit;
}

function addRewardRowsToPlayer(player, rewardRows = [], times = 1) {
  if(rewardRows.some(r=>Number(r.id)===94501)){
    rewardRows=require('../services/FishingEconomyService').expandCarp(rewardRows.map(r=>({...r,count:Number(r.count)*times})));times=1;
  }
  rewardGrant.assertRewardRowsSupported(rewardRows);
  const itemDeltas = [];
  const changedMap = new Map();
  const rewardItems = [];
  const rewardEquips = [];
  const rewardGems = [];
  const rewardFashion = [];
  const rewardSwords = [];
  const rewardPets = [];
  const rewardPetSouls = [];
  const rewardArtifacts = [];
  const rewardBloodlines = [];
  const rewardValhalla = [];
  const rewardFormations = [];
  const rewardSpirits = [];
  const rewardOldTrekShips = [];
  const safeTimes = Math.max(1, Math.floor(Number(times) || 1));
  const setChanged = (itemId) => {
    const id = toSafeItemId(itemId);
    if (id <= 0) return;
    changedMap.set(id, { id, count: getOwnedItemOrCurrencyCount(player, id) });
  };

  (Array.isArray(rewardRows) ? rewardRows : []).forEach((row) => {
    const rewardId = toSafeItemId(row && row.id);
    const rewardCount = Math.max(0, Math.floor(Number(row && row.count) || 0) * safeTimes);
    if (rewardId <= 0 || rewardCount <= 0) return;

    if (isEquipTemplateItem(rewardId)) {
      ensureEquipInfo(player);
      for (let i = 0; i < rewardCount; i += 1) {
        const equip = createEquipFromTemplateId(rewardId, player.level, player);
        addOpenEquip(player, equip);
        rewardEquips.push(equip);
      }
      return;
    }

    if (getRandomValhallaPackQuality(rewardId) > 0) {
      rewardValhalla.push(...grantRandomValhallaPackRewards(player, rewardId, rewardCount));
      return;
    }

    if (getRandomPetPackQuality(rewardId) > 0) {
      rewardPets.push(...grantRandomPetPackRewards(player, rewardId, rewardCount));
      return;
    }

    if (getRandomBloodlinePackQuality(rewardId) > 0) {
      rewardBloodlines.push(...grantRandomBloodlinePackRewards(player, rewardId, rewardCount));
      return;
    }

    if (getRandomArtifactPackQuality(rewardId) > 0) {
      rewardArtifacts.push(...grantRandomArtifactPackRewards(player, rewardId, rewardCount));
      return;
    }

    if (isGemRewardId(rewardId)) {
      rewardGems.push(...grantGemRewards(player, rewardId, rewardCount));
      return;
    }

    if (getGemPackLevel(rewardId) > 0) {
      rewardGems.push(...grantGemPackRewards(player, rewardId, rewardCount));
      return;
    }

    const grantResult = rewardGrant.grantRewardRow(player, row, safeTimes);
    if (grantResult.kind !== 'item') {
      rewardSwords.push(...(grantResult.rewardSwords || []));
      rewardPets.push(...(grantResult.rewardPets || []));
      rewardPetSouls.push(...(grantResult.rewardPetSouls || []));
      rewardBloodlines.push(...(grantResult.rewardBloodlines || []));
      rewardValhalla.push(...(grantResult.rewardValhalla || []));
      rewardArtifacts.push(...(grantResult.rewardArtifacts || []));
      (grantResult.rewardFashion || []).forEach((fashionRow) => {
        if (!rewardFashion.some((entry) => entry.id === fashionRow.id)) rewardFashion.push(fashionRow);
      });
      (grantResult.rewardFormations || []).forEach((formationRow) => {
        if (!rewardFormations.some((entry) => entry.id === formationRow.id)) rewardFormations.push(formationRow);
      });
      (grantResult.rewardSpirits || []).forEach((spiritRow) => {
        if (!rewardSpirits.some((entry) => entry.id === spiritRow.id)) rewardSpirits.push(spiritRow);
      });
      rewardOldTrekShips.push(...(grantResult.rewardOldTrekShips || []));
      itemDeltas.push(...(grantResult.itemDeltas || []));
      rewardItems.push(...(grantResult.rewardItems || []));
      (grantResult.rewardItems || []).forEach((rewardItem) => setChanged(rewardItem.id));
      return;
    }

    addRewardToPlayer(player, rewardId, rewardCount);
    rewardItems.push({ id: rewardId, count: rewardCount });
    itemDeltas.push({ id: rewardId, count: rewardCount });
    setChanged(rewardId);
  });

  return {
    itemDeltas,
    changed: Array.from(changedMap.values()).sort((a, b) => a.id - b.id),
    rewardInfo: buildRewardInfo(rewardItems, rewardEquips, rewardGems, {
      swords: rewardSwords,
      pets: rewardPets,
      petSouls: rewardPetSouls,
      bloodline: rewardBloodlines,
      valhalla: rewardValhalla,
      artifacts: rewardArtifacts,
      fashion: rewardFashion,
      formations: rewardFormations,
      spirits: rewardSpirits,
      oldTrekShips: rewardOldTrekShips,
    }),
    rewardGems,
    rewardSwords,
    rewardPets,
    rewardPetSouls,
    rewardArtifacts,
    rewardBloodlines,
    rewardValhalla,
    rewardFormations,
    rewardSpirits,
    rewardOldTrekShips,
  };
}

function selectUseRewardRows(useCfg, selects, count) {
  const rewards = Array.isArray(useCfg && useCfg.rewards) ? useCfg.rewards : [];
  if (!selects || typeof selects !== 'object' || Array.isArray(selects)) return [];
  const selected = [];
  let total = 0;
  for (const [key, selectedCount] of Object.entries(selects)) {
    if (!/^(0|[1-9][0-9]*)$/.test(key) || !Number.isSafeInteger(selectedCount) || selectedCount < 0) return [];
    const row = rewards[Number(key)];
    if (!row || !Number.isSafeInteger(row.id) || row.id <= 0
      || !Number.isSafeInteger(row.count) || row.count <= 0) return [];
    if (selectedCount === 0) continue;
    const rewardCount = row.count * selectedCount;
    if (!Number.isSafeInteger(rewardCount)) return [];
    total += selectedCount;
    selected.push({ id: row.id, count: rewardCount });
  }
  return total === count ? selected : [];
}

function requiresUseRewardSelection(useType) {
  return useType === 101 || useType === 104 || useType === 106 || useType === 110;
}

const RED_PACKET_REWARD_POOLS = {
  94411: [{ id: 1, count: 988 }, { id: 1, count: 888 }, { id: 1, count: 388 }, { id: 1, count: 288 }, { id: 1, count: 188 }],
  94412: [{ id: 4, count: 888 }, { id: 4, count: 388 }, { id: 4, count: 288 }, { id: 4, count: 188 }, { id: 4, count: 166 }],
  94413: [{ id: 6, count: 66 }, { id: 6, count: 36 }, { id: 6, count: 26 }, { id: 6, count: 16 }, { id: 6, count: 6 }],
  94414: [{ id: 65, count: 188 }, { id: 65, count: 128 }, { id: 65, count: 99 }, { id: 65, count: 88 }, { id: 65, count: 38 }],
  94415: [
    { id: 1, count: 66 }, { id: 4, count: 66 }, { id: 2, count: 8888 }, { id: 65, count: 12 }, { id: 55, count: 10 },
    { id: 1, count: 36 }, { id: 4, count: 26 }, { id: 2, count: 888 }, { id: 65, count: 6 }, { id: 55, count: 5 },
  ],
  94417: [
    { id: 1, count: 66 }, { id: 4, count: 66 }, { id: 2, count: 8888 }, { id: 65, count: 12 }, { id: 55, count: 10 },
    { id: 1, count: 36 }, { id: 4, count: 26 }, { id: 2, count: 888 }, { id: 65, count: 6 }, { id: 55, count: 5 },
  ],
};

function pickRedPacketRewardRows(itemId, count = 1) {
  const pool = RED_PACKET_REWARD_POOLS[toSafeItemId(itemId)] || [];
  const times = Math.max(1, toSafeInt(count, 1));
  if (pool.length <= 0) return [];
  const merged = new Map();
  for (let i = 0; i < times; i += 1) {
    const idx = Math.max(0, Math.min(pool.length - 1, Math.floor(Math.random() * pool.length)));
    const row = pool[idx];
    merged.set(row.id, (merged.get(row.id) || 0) + row.count);
  }
  return Array.from(merged.entries()).map(([id, rewardCount]) => ({ id, count: rewardCount }));
}

async function handleLegacyShopBuy(params, session, msgUid) {
  const goodsId = Number(params && (params.goodsId || params.id)) || 0;
  const count = Math.max(1, Number(params && params.count) || 1);
  logger.info(`[Item] legacy shop buy goodsId=${goodsId} count=${count} user=${session && session.userId ? session.userId : 'unknown'}`);
  const result = await handleMultiBuyItem({ require: { [goodsId]: count }, requestId: params?.requestId }, session, msgUid);
  const resultPacket = getPurchaseResultPacket(result, msgUid);
  if (!resultPacket || resultPacket.tag !== 1202) {
    logger.warn(`[Item] legacy shop buy missing result goodsId=${goodsId} count=${count} user=${session && session.userId ? session.userId : 'unknown'}`);
    return { tag: 1200, msgUid, data: { result: -1, rewardInfo: { items: [], equips: [], gems: [] } } };
  }
  logger.info(`[Item] legacy shop buy result goodsId=${goodsId} count=${count} result=${resultPacket.data && resultPacket.data.result} rewardItems=${JSON.stringify((resultPacket.data && resultPacket.data.rewardInfo && resultPacket.data.rewardInfo.items) || [])} rewardGems=${JSON.stringify((resultPacket.data && resultPacket.data.rewardInfo && resultPacket.data.rewardInfo.gems) || [])}`);

  const packets = Array.isArray(result) ? result.slice() : [result];
  packets.push({
    tag: 1200,
    msgUid,
    data: {
      result: resultPacket.data && resultPacket.data.result === 0 ? 0 : -1,
      id: goodsId,
      count,
      items: resultPacket.data && Array.isArray(resultPacket.data.items) ? resultPacket.data.items : [],
      changed: resultPacket.data && Array.isArray(resultPacket.data.changed) ? resultPacket.data.changed : [],
      timeRecords: resultPacket.data && resultPacket.data.timeRecords ? resultPacket.data.timeRecords : buildItemTimeRecords(session && session.player),
      rewards: resultPacket.data && resultPacket.data.rewardInfo
        ? resultPacket.data.rewardInfo
        : {
          items: [],
          equips: [],
          swords: [],
          pets: [],
          artifacts: [],
          gems: [],
          valhalla: [],
          bloodline: [],
          fashion: [],
          elves: [],
          extraReward: {},
        },
      rewardInfo: resultPacket.data && resultPacket.data.rewardInfo
        ? resultPacket.data.rewardInfo
        : {
          items: [],
          equips: [],
          swords: [],
          pets: [],
          artifacts: [],
          gems: [],
          valhalla: [],
          bloodline: [],
          fashion: [],
          elves: [],
          extraReward: {},
        },
    },
  });
  return packets;
}

// 物品列表 (tag:1200)
async function handleGetItems(params, session, msgUid) {
  if (params && (params.id != null || params.goodsId != null)) {
    return handleLegacyShopBuy(params, session, msgUid);
  }
  const player = session.player;
  const now = Date.now();
  if (session && session._itemListCache && session._itemListCache.expiresAt > now) {
    return { tag: 1200, msgUid, data: session._itemListCache.data };
  }
  if (player) {
    const { checkLevelUp } = require('./raid');
    if (!session._itemListLevelCheckAt || now - session._itemListLevelCheckAt >= ITEM_LIST_LEVEL_CHECK_TTL_MS) {
      session._itemListLevelCheckAt = now;
      const levelBefore = Math.max(1, toSafeInt(player.level, 1));
      const expBefore = Math.max(0, toSafeInt(player.exp, 0));
      checkLevelUp(player);
      if (
        Math.max(1, toSafeInt(player.level, 1)) !== levelBefore
        || Math.max(0, toSafeInt(player.exp, 0)) !== expBefore
      ) {
        scheduleItemPlayerSave(session, player, '1200-level-sync');
      }
    }
  }
  const items = player ? buildClientItemList(player) : [];
  const timeRecords = player ? buildItemTimeRecords(player) : {};
  const useRecords = player ? buildUseRecordsPayload(player) : [];
  const data = { items, useRecords, timeRecords };
  if (session) session._itemListCache = { data, expiresAt: now + ITEM_LIST_CACHE_TTL_MS };
  return { tag: 1200, msgUid, data };
}

// 兑换物品 (tag:1201)
async function handleExchangeItem(params, session, msgUid) {
  const player = session.player;
  const emptyRewards = buildRewardInfo();
  if (!player) return { tag: 1201, msgUid, data: { result: -1, rewards: emptyRewards } };

  const sourceItemId = toSafeItemId(params && params.id);
  const parsedCount = parsePositiveCount(params && params.count, 1);
  const exchangeCfgMap = config.get('AssetsExchangeConfig') || {};
  const exchangeCfg = exchangeCfgMap[sourceItemId] || exchangeCfgMap[String(sourceItemId)] || null;
  if (!parsedCount.valid || !exchangeCfg) {
    return { tag: 1201, msgUid, data: { result: -1, rewards: emptyRewards } };
  }

  const count = parsedCount.count;
  const rewardItemId = toSafeItemId(exchangeCfg.itemId);
  const rewardCount = Math.max(0, toSafeInt(exchangeCfg.count, 0));
  if (rewardItemId <= 0 || rewardCount <= 0 || !consumeBagItem(player, sourceItemId, count)) {
    return { tag: 1201, msgUid, data: { result: -1, rewards: emptyRewards } };
  }

  const rewardResult = addRewardRowsToPlayer(player, [{ id: rewardItemId, count: rewardCount }], count);
  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  const changedMap = new Map(rewardResult.changed.map((row) => [row.id, row]));
  changedMap.set(sourceItemId, {
    id: sourceItemId,
    count: getOwnedItemOrCurrencyCount(player, sourceItemId),
  });
  const rewards = rewardResult.rewardInfo;
  return [
    {
      tag: 1202,
      msgUid: 0,
      data: {
        result: 0,
        items: [{ id: sourceItemId, count: -count }, ...rewardResult.itemDeltas],
        changed: Array.from(changedMap.values()).sort((a, b) => a.id - b.id),
      },
    },
    ...rewardGrant.buildAppearanceSyncPackets(player, rewards),
    {
      tag: 1201,
      msgUid,
      data: {
        result: 0,
        id: sourceItemId,
        count,
        rewards,
        rewardInfo: rewards,
      },
    },
  ];
}

// 批量购买 (tag:1202)
async function handleMultiBuyItemUnlocked(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 1202, msgUid, data: { result: -1 } };
  farmShop.resetDay(player);

  const homelandSkin = require('../services/HomelandSkinUnlockService');
  if (Object.keys(params?.require || {}).some(id => homelandSkin.isSkinShop(id))) {
    return homelandSkin.unlock(params, session, msgUid);
  }

  const requireMap = params && typeof params.require === 'object' && !Array.isArray(params.require)
    ? params.require
    : {};
  const shopCfg = config.get('ShopConfig') || {};

  const purchaseList = Object.keys(requireMap)
    .map((goodsIdKey) => ({
      goodsId: Number(goodsIdKey) || 0,
      count: Math.max(0, Number(requireMap[goodsIdKey]) || 0),
    }))
    .filter((row) => row.goodsId > 0 && row.count > 0);
  if (purchaseList.length <= 0) {
    return { tag: 1202, msgUid, data: { result: -1, msg: 'empty require' } };
  }

  const fortunePurchase = purchaseList.find((purchase) => purchase.goodsId === FORTUNE_FREE_SHOP_ID) || null;
  const activityShopStates = new Map();
  let purchaseGemInfo = null;
  const getPurchaseGemInfo = () => {
    if (!purchaseGemInfo) {
      const gem = getGemHandlerSafe();
      if (gem && typeof gem.ensureGemInfo === 'function') purchaseGemInfo = gem.ensureGemInfo(player);
    }
    return purchaseGemInfo;
  };
  let fortuneDailyState = null;
  let fortuneActivityUpdatePacket = null;
  if (fortunePurchase) {
    if (!Number.isSafeInteger(fortunePurchase.count) || fortunePurchase.count !== 1) {
      return buildFortuneDailyFailure(msgUid, 'FORTUNE_DAILY_SINGLE_CLAIM_ONLY');
    }
    fortuneDailyState = getActiveDailyShopPolicy(player, FORTUNE_FREE_SHOP_ID, Date.now());
    if (!fortuneDailyState) {
      logger.warn(`[Item] fortune daily gift unavailable user=${session && session.userId ? session.userId : 'unknown'}`);
      return buildFortuneDailyFailure(msgUid, 'FORTUNE_DAILY_ACTIVITY_NOT_ACTIVE');
    }
    if (fortuneDailyState.count + fortunePurchase.count > fortuneDailyState.limit) {
      logger.warn(
        `[Item] fortune daily gift replay denied user=${session && session.userId ? session.userId : 'unknown'} `
        + `activityId=${fortuneDailyState.activityId} shopId=${FORTUNE_FREE_SHOP_ID} `
        + `dayKey=${fortuneDailyState.dayKey} count=${fortuneDailyState.count}`
      );
      return buildFortuneDailyFailure(msgUid, 'DAILY_LIMIT_REACHED', fortuneDailyState);
    }
  }

  purchaseList.forEach((purchase) => {
    const state = getActiveActivityShopPolicy(player, purchase.goodsId, Date.now());
    if (state) activityShopStates.set(purchase.goodsId, state);
  });

  // Paid ShopConfig rows are fulfilled only by the authoritative recharge
  // path (tag 1230 or a verified cash callback). Their cost arrays are often
  // empty, so accepting them here would grant the package for free and still
  // mark it as purchased. Validate the entire request before any mutation so
  // a mixed free+paid packet fails atomically.
  for (const purchase of purchaseList) {
    const goods = shopCfg[purchase.goodsId] || shopCfg[String(purchase.goodsId)] || null;
    if (!Number.isSafeInteger(purchase.count) || purchase.count > 9999) return { tag: 1202, msgUid, data: { result: -1, msg: 'invalid count' } };
    if (!goods) {
      return { tag: 1202, msgUid, data: { result: -1, msg: 'invalid goods', id: purchase.goodsId } };
    }
    if (Math.max(0, Number(goods.payId) || 0) > 0) {
      logger.warn(
        `[Item] paid goods rejected outside recharge path goodsId=${purchase.goodsId} `
        + `payId=${Number(goods.payId) || 0} user=${session && session.userId ? session.userId : 'unknown'}`
      );
      return {
        tag: 1202,
        msgUid,
        data: {
          result: -1,
          msg: 'paid goods require recharge path',
          code: 'PAID_USE_RECHARGE_PATH',
          id: purchase.goodsId,
        },
      };
    }
    const rewards = Array.isArray(goods.rewards) ? goods.rewards : [];
    if (!rewards.length || rewards.some((reward) => (
      !Number.isSafeInteger(Number(reward && reward.id))
      || Number(reward && reward.id) <= 0
      || !Number.isSafeInteger(Number(reward && reward.count))
      || Number(reward && reward.count) <= 0
    ))) {
      logger.error(
        `[Item] free goods reward config invalid goodsId=${purchase.goodsId} `
        + `user=${session && session.userId ? session.userId : 'unknown'}`
      );
      return {
        tag: 1202,
        msgUid,
        data: {
          result: -1,
          msg: 'reward config invalid',
          code: 'SHOP_REWARD_CONFIG_INVALID',
          id: purchase.goodsId,
        },
      };
    }
  }

  player.currencies = player.currencies || { gold: 0, diamond: 0, silver: 0 };
  player.items = player.items || {};
  player.rechargeInfo = player.rechargeInfo && typeof player.rechargeInfo === 'object' ? player.rechargeInfo : {};
  player.rechargeInfo.records = Array.isArray(player.rechargeInfo.records) ? player.rechargeInfo.records : [];
  player.shopInfo = player.shopInfo && typeof player.shopInfo === 'object' ? player.shopInfo : {};
  player.shopInfo.buyRecords = player.shopInfo.buyRecords && typeof player.shopInfo.buyRecords === 'object'
    ? player.shopInfo.buyRecords
    : {};

  const changedMap = new Map();
  const rewardItems = [];
  const rewardEquips = [];
  const rewardGems = [];
  const rewardFashion = [];
  const rewardSwords = [];
  const rewardPets = [];
  const rewardPetSouls = [];
  const rewardArtifacts = [];
  const rewardValhalla = [];
  const rewardBloodlines = [];
  const rewardFormations = [];
  const rewardSpirits = [];
  const rewardOldTrekShips = [];
  const costDeltas = [];
  const boughtIds = [];
  const recordNow = Date.now();
  const addRechargeBuyRecord = (goodsId, addCount) => {
    const id = Number(goodsId) || 0;
    const count = Math.max(0, Number(addCount) || 0);
    if (id <= 0 || count <= 0) return;
    const records = player.rechargeInfo.records;
    for (let i = 0; i < records.length; i += 1) {
      if ((Number(records[i] && records[i].id) || 0) === id) {
        records[i].count = Math.max(0, (Number(records[i].count) || 0) + count);
        return;
      }
    }
    records.push({ id, count });
  };
  const setChanged = (itemId) => {
    const id = Number(itemId) || 0;
    if (id <= 0) return;
    let count = 0;
    if (id === 1) count = Number(player.currencies.diamond) || 0;
    else if (id === 2) count = Number(player.currencies.silver) || 0;
    else if (id === 6) count = Number(player.currencies.gold) || 0;
    else count = Number(player.items[id]) || 0;
    changedMap.set(id, { id, count: Math.max(0, count) });
  };
  const getOwnedCount = (itemId) => {
    const id = Number(itemId) || 0;
    if (id === 1) return Number(player.currencies.diamond) || 0;
    if (id === 2) return Number(player.currencies.silver) || 0;
    if (id === 6) return Number(player.currencies.gold) || 0;
    return Number(player.items[id]) || 0;
  };
  const reservedCostMap = new Map();
  const getReservedCost = (itemId) => reservedCostMap.get(itemId) || 0;
  const reserveCost = (itemId, count) => {
    const id = Number(itemId) || 0;
    const addCount = Math.max(0, Number(count) || 0);
    if (id <= 0 || addCount <= 0) return;
    reservedCostMap.set(id, getReservedCost(id) + addCount);
  };
  const consumeCostRow = (costRow, times) => {
    const itemId = Number(costRow && costRow.id) || 0;
    const costCount = Math.max(0, (Number(costRow && costRow.count) || 0) * times);
    if (itemId <= 0 || costCount <= 0) return;
    if (itemId === 1) player.currencies.diamond = Math.max(0, (Number(player.currencies.diamond) || 0) - costCount);
    else if (itemId === 2) player.currencies.silver = Math.max(0, (Number(player.currencies.silver) || 0) - costCount);
    else if (itemId === 6) player.currencies.gold = Math.max(0, (Number(player.currencies.gold) || 0) - costCount);
    else {
      player.items[itemId] = Math.max(0, (Number(player.items[itemId]) || 0) - costCount);
      if (player.items[itemId] <= 0) delete player.items[itemId];
    }
    costDeltas.push({ id: itemId, count: -costCount });
    setChanged(itemId);
  };

  for (const purchase of purchaseList) {
    const goods = shopCfg[purchase.goodsId] || shopCfg[String(purchase.goodsId)] || null;
    if (!goods) {
      logger.warn(`[Item] shop buy invalid goodsId=${purchase.goodsId} count=${purchase.count} user=${session && session.userId ? session.userId : 'unknown'}`);
      return { tag: 1202, msgUid, data: { result: -1, msg: 'invalid goods', id: purchase.goodsId } };
    }

    const activityState = activityShopStates.get(purchase.goodsId) || null;
    const boughtCount = activityState
      ? Math.max(0, Number(activityState.count) || 0)
      : (Number(player.shopInfo.buyRecords[purchase.goodsId]) || 0);
    const effectiveLimit = activityState && Number(activityState.limit) > 0
      ? Number(activityState.limit)
      : Number(goods.limit);
    if (effectiveLimit > 0 && boughtCount + purchase.count > effectiveLimit) {
      return { tag: 1202, msgUid, data: { result: -1, msg: 'limit reached', id: purchase.goodsId } };
    }

    for (let step = 0; step < purchase.count; step += 1) {
      const totalBought = boughtCount + step;
      const costRows = farmShop.scoped(goods.id) ? farmShop.costRows(goods, totalBought) : Array.isArray(goods.costAgain) && goods.costAgain[totalBought] && goods.costAgain[totalBought].length > 0
        ? goods.costAgain[totalBought]
        : (Array.isArray(goods.cost) ? goods.cost : []);
      for (const costRow of costRows) {
        const itemId = Number(costRow && costRow.id) || 0;
        const need = Math.max(0, Number(costRow && costRow.count) || 0);
        if (getOwnedCount(itemId) - getReservedCost(itemId) < need) {
          return { tag: 1202, msgUid, data: { result: -1, msg: 'not enough currency', id: purchase.goodsId } };
        }
        reserveCost(itemId, need);
      }
    }
  }

  for (const purchase of purchaseList) {
    const goods = shopCfg[purchase.goodsId] || shopCfg[String(purchase.goodsId)] || null;
    const boughtCount = Number(player.shopInfo.buyRecords[purchase.goodsId]) || 0;
    for (let step = 0; step < purchase.count; step += 1) {
      const totalBought = boughtCount + step;
      const costRows = farmShop.scoped(goods.id) ? farmShop.costRows(goods, totalBought) : Array.isArray(goods.costAgain) && goods.costAgain[totalBought] && goods.costAgain[totalBought].length > 0
        ? goods.costAgain[totalBought]
        : (Array.isArray(goods.cost) ? goods.cost : []);
      costRows.forEach((costRow) => consumeCostRow(costRow, 1));

      const rewards = Array.isArray(goods.rewards) ? goods.rewards : [];
      rewards.forEach((reward) => {
        const rewardId = Number(reward && reward.id) || 0;
        const rewardCount = Math.max(0, Number(reward && reward.count) || 0);
        if (rewardId <= 0 || rewardCount <= 0) return;
        if (isEquipTemplateItem(rewardId)) {
          ensureEquipInfo(player);
          for (let i = 0; i < rewardCount; i += 1) {
            const equip = createEquipFromTemplateId(rewardId, player.level, player);
            addOpenEquip(player, equip);
            rewardEquips.push(equip);
          }
        } else if (getRandomValhallaPackQuality(rewardId) > 0) {
          rewardValhalla.push(...grantRandomValhallaPackRewards(player, rewardId, rewardCount));
        } else if (getRandomPetPackQuality(rewardId) > 0) {
          rewardPets.push(...grantRandomPetPackRewards(player, rewardId, rewardCount));
        } else if (getRandomBloodlinePackQuality(rewardId) > 0) {
          rewardBloodlines.push(...grantRandomBloodlinePackRewards(player, rewardId, rewardCount));
        } else if (getRandomArtifactPackQuality(rewardId) > 0) {
          rewardArtifacts.push(...grantRandomArtifactPackRewards(player, rewardId, rewardCount));
        } else if (isGemRewardId(rewardId)) {
          rewardGems.push(...grantGemRewards(player, rewardId, rewardCount, getPurchaseGemInfo()));
        } else if (getGemPackLevel(rewardId) > 0) {
          rewardGems.push(...grantGemPackRewards(player, rewardId, rewardCount, getPurchaseGemInfo()));
        } else {
          const grantResult = rewardGrant.grantRewardRow(player, reward, 1);
          if (grantResult.kind !== 'item') {
            rewardSwords.push(...(grantResult.rewardSwords || []));
            rewardPets.push(...(grantResult.rewardPets || []));
            rewardPetSouls.push(...(grantResult.rewardPetSouls || []));
            rewardValhalla.push(...(grantResult.rewardValhalla || []));
            rewardArtifacts.push(...(grantResult.rewardArtifacts || []));
            rewardBloodlines.push(...(grantResult.rewardBloodlines || []));
            rewardOldTrekShips.push(...(grantResult.rewardOldTrekShips || []));
            rewardItems.push(...(grantResult.rewardItems || []));
            (grantResult.rewardItems || []).forEach((itemRow) => setChanged(itemRow.id));
            (grantResult.rewardFashion || []).forEach((fashionRow) => {
              if (!rewardFashion.some((entry) => entry.id === fashionRow.id)) rewardFashion.push(fashionRow);
            });
            (grantResult.rewardFormations || []).forEach((formationRow) => {
              if (!rewardFormations.some((entry) => entry.id === formationRow.id)) rewardFormations.push(formationRow);
            });
            (grantResult.rewardSpirits || []).forEach((spiritRow) => {
              if (!rewardSpirits.some((entry) => entry.id === spiritRow.id)) rewardSpirits.push(spiritRow);
            });
            return;
          }
          addRewardToPlayer(player, rewardId, rewardCount);
          rewardItems.push({ id: rewardId, count: rewardCount });
          setChanged(rewardId);
        }
      });
    }

    player.shopInfo.buyRecords[purchase.goodsId] = boughtCount + purchase.count;
    player.shopInfo.buyRecords[String(purchase.goodsId)] = boughtCount + purchase.count;
    addRechargeBuyRecord(purchase.goodsId, purchase.count);
    const activityState = activityShopStates.get(purchase.goodsId) || null;
    if (activityState) {
      const activityRow = commitActivityShopPurchase(player, activityState, purchase.count, recordNow);
      fortuneActivityUpdatePacket = activityRow ? buildActivityUpdatePacket(activityRow) : fortuneActivityUpdatePacket;
    }
    boughtIds.push(purchase.goodsId);
  }

  player.shopInfo.lastBuyTime = recordNow;
  if (!session._farmShopDraft) {
    const saved = await playerService.savePlayer(session.userId, player, { returnSaved: false });
    if (!saved && activityShopStates.size > 0) throw new Error('ACTIVITY_SHOP_SAVE_NOT_CONFIRMED');
  }
  session._itemListCache = null;
  if (fortuneDailyState) {
    logger.info(
      `[Item] fortune daily gift granted user=${session && session.userId ? session.userId : 'unknown'} `
      + `activityId=${fortuneDailyState.activityId} shopId=${FORTUNE_FREE_SHOP_ID} `
      + `dayKey=${fortuneDailyState.dayKey} count=${fortuneDailyState.count + fortunePurchase.count}`
    );
  }
  const payload = {
    tag: 1202,
    msgUid,
    data: {
      result: 0,
      ids: boughtIds,
      items: rewardItems,
      changed: Array.from(changedMap.values()).sort((a, b) => a.id - b.id),
      timeRecords: buildItemTimeRecords(player),
      rewardInfo: {
        items: rewardItems,
        equips: rewardEquips,
        swords: rewardSwords,
        pets: rewardPets,
        petSouls: rewardPetSouls,
        artifacts: rewardArtifacts,
        gems: rewardGems,
        valhalla: rewardValhalla,
        bloodline: rewardBloodlines,
        fashion: rewardFashion,
        formations: rewardFormations,
        spirits: rewardSpirits,
        oldTrekShips: rewardOldTrekShips,
        elves: [],
        extraReward: {},
      },
    },
  };

  const packets = [
    {
      tag: 1202,
      msgUid: 0,
      data: {
        result: 0,
        items: mergeItemDeltaRows([...costDeltas, ...rewardItems]),
        changed: Array.from(changedMap.values()).sort((a, b) => a.id - b.id),
        timeRecords: buildItemTimeRecords(player),
      },
    },
    payload,
  ];
  if (fortuneActivityUpdatePacket) packets.push(fortuneActivityUpdatePacket);
  if (rewardGems.length > 0) {
    const gemSyncPacket = buildGemInfoSyncPacket(player);
    if (gemSyncPacket) packets.push(gemSyncPacket);
    packets.push(...buildGemUpdatePackets(rewardGems));
  }
  packets.push(...rewardGrant.buildAppearanceSyncPackets(player, payload.data.rewardInfo));
  if (rewardSwords.length > 0) {
    packets.push({ tag: 3201, msgUid: 0, data: { result: 0, data: rewardSwords } });
  }
  if (rewardPets.length > 0) {
    packets.push({ tag: 3300, msgUid: 0, data: { result: 0, data: rewardPets } });
  }
  if (rewardSwords.length > 0) {
    const mount = getMountHandlerSafe();
    const info = mount && typeof mount.ensureMountInfo === 'function' ? mount.ensureMountInfo(player) : player.swordInfo;
    const buildInfo = mount && typeof mount.buildMountInfoUpdatePayload === 'function'
      ? mount.buildMountInfoUpdatePayload(info)
      : info;
    packets.push({ tag: 3200, msgUid: 0, data: { result: 0, uid: buildInfo && buildInfo.equippedUid, info: buildInfo } });
  }
  rewardPetSouls.forEach((soul) => {
    packets.push({ tag: 6901, msgUid: 0, data: { result: 0, data: soul } });
  });
  if (rewardValhalla.length > 0) {
    const valhalla = getValhallaHandlerSafe();
    if (valhalla && typeof valhalla.ensureValhallaInfo === 'function' && typeof valhalla.buildValhallaPayload === 'function') {
      const info = valhalla.ensureValhallaInfo(player);
      packets.push({ tag: 4100, msgUid: 0, data: { result: 0, ...valhalla.buildValhallaPayload(info) } });
    }
  }
  if (rewardArtifacts.length > 0) {
    packets.push(...rewardArtifacts.map((artifact) => ({
      tag: 3500,
      msgUid: 0,
      data: { result: 0, artifact },
    })));
  }
  return packets;
}

async function handleMultiBuyItem(params, session, msgUid) {
  if (Object.keys(params?.require || {}).some(id => farmShop.scoped(Number(id)))) {
    if (!Object.keys(params.require).every(id => farmShop.scoped(Number(id)))) {
      return { tag: 1202, msgUid, data: { result: -1, code: 'MIXED_FARM_SHOP_REQUEST' } };
    }
    return farmShop.run(params, session, msgUid, shadow => handleMultiBuyItemUnlocked(params, shadow, msgUid));
  }
  const economy=require('../services/FishingEconomyService');
  if(Object.keys(params?.require||{}).some(id=>economy.isCurrencyShop(Number(id))))return economy.currencyShop(params,session,msgUid);
  const fishingShop = require('../services/FishingEventShopService');
  if (fishingShop.hasRequest(params)) return fishingShop.handleItemPurchase(params, session, msgUid);
  return withGeneralPurchaseLock(session, msgUid, () => withFreeActivityPurchaseLock(
    params,
    session,
    msgUid,
    () => withFortuneDailyPurchaseLock(
      params,
      session,
      msgUid,
      () => handleMultiBuyItemUnlocked(params, session, msgUid),
    ),
  ));
}

// 使用物品 (tag:1300)
async function handleUseItem(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 1300, msgUid, data: { result: -1 } };

  const itemId = toSafeItemId(params && (params.itemId || params.id || params.index));
  const fashionBoxes = require('../services/FashionBoxService');
  if (fashionBoxes.isCandidateBox(itemId)) return fashionBoxes.open(params, session, msgUid);
  if(itemId===94501)return require('../services/FishingEconomyService').useCarp(params,session,msgUid);
  const parsedCount = parsePositiveCount(params && params.count, 1);
  if (!parsedCount.valid) {
    return { tag: 1300, msgUid, data: { result: -1, msg: 'invalid count' } };
  }
  const count = parsedCount.count;
  // Fishing fragments are materials, never generic consumable boxes.
  if (itemId >= 190001 && itemId <= 190005) {
    return { tag: 1300, msgUid, data: { result: -1, code: 'HOMELAND_FRAGMENT_NOT_CONSUMABLE',
      msg: 'Mảnh Thiên Công được giữ trong túi, không thể dùng như hộp quà.' } };
  }
  if (require('../services/FishingBalanceService').rules.boxes.pools[itemId]) {
    const result = await require('./fish-soul').handleFishSoulOpenBox({ ...params, itemId, count }, session, msgUid);
    return (Array.isArray(result) ? result : [result]).map(packet => packet.tag === 4063
      ? { ...packet, tag: 1300 } : packet);
  }
  if (!Number.isSafeInteger(Number(params && params.count != null ? params.count : 1)) || !Number.isSafeInteger(count)) {
    return { tag: 1300, msgUid, data: { result: -1, msg: 'invalid count' } };
  }

  if (itemId <= 0 || !player.items || !player.items[itemId] || player.items[itemId] < count) {
    return { tag: 1300, msgUid, data: { result: -1, msg: 'not enough' } };
  }

  const useCfg = (config.get('AssetsUseConfig') || {})[itemId] || (config.get('AssetsUseConfig') || {})[String(itemId)] || null;
  const asset = (config.get('AssetsConfig') || {})[itemId];
  if (!useCfg && (asset?.type === 8 || asset?.type === 9 || itemId >= 2001 && itemId <= 2215)) {
    return { tag: 1300, msgUid, data: { result: -1, code: 'ALCHEMY_ITEM_NOT_CONSUMABLE' } };
  }
  if (asset?.type === 8 && (useCfg?.conditions || []).some(condition => condition.type === 9 && condition.cond === 4
      && Number(player.roleInfo?.stage || player.roleInfo?.stageId || 1) < condition.value)) {
    return { tag: 1300, msgUid, data: { result: -1, code: 'PILL_STAGE_LOCKED' } };
  }
  // Fashion body IDs are granted as ownership, never used as ordinary bag
  // consumables. Legacy bad inventory is repaired separately with a ledger.
  if (!useCfg && (config.get('FashionConfig') || {})[itemId]) {
    return { tag: 1300, msgUid, data: { result: -1, code: 'FASHION_REQUIRES_OWNERSHIP_REPAIR' } };
  }
  if (!canUseItemByLimit(player, itemId, count, useCfg)) {
    return { tag: 1300, msgUid, data: { result: -1, msg: 'limit reached' } };
  }
  const useType = Math.max(0, toSafeInt(useCfg && useCfg.type, 0));
  const pillService = require('../services/ItemPillService');
  const pillPlan = pillService.plan(player, itemId, count);
  if (pillPlan && !pillPlan.ok) return { tag: 1300, msgUid, data: { result: -1, code: 'ITEM_PILL_DAILY_LIMIT' } };
  if (useType === 103 && Array.isArray(useCfg.rewards) && useCfg.rewards.length > 0
    && (!useCfg.attrs || Array.isArray(useCfg.attrs) || Object.keys(useCfg.attrs).length === 0) && !pillPlan) {
    return { tag: 1300, msgUid, data: { result: -1, code: 'ITEM_PILL_PENDING_VERIFICATION' } };
  }
  const requiresSelection = requiresUseRewardSelection(useType);
  const customSelectionRewards = requiresSelection
    ? randomItemRewards.getCustomSelectionRewards(itemId) : null;
  const selectionCfg = customSelectionRewards
    ? { ...useCfg, rewards: customSelectionRewards } : useCfg;
  const selectedRows = requiresSelection
    ? selectUseRewardRows(selectionCfg, params && params.selects, count) : [];
  if (requiresSelection && (selectedRows.length <= 0
    || ((useType === 104 || useType === 106) && (count !== 1 || selectedRows.length !== 1)))) {
    return { tag: 1300, msgUid, data: { result: -1, msg: 'selection required' } };
  }

  // Resolve verified and explicit compatibility random rewards. Unknown random pools must never consume a box.
  const emojiService = require('../services/FixedEmojiItemService');
  const emojiPlan = useType === 102 ? emojiService.plan(player, itemId, count) : null;
  if (emojiPlan && !emojiPlan.ok) return { tag: 1300, msgUid, data: { result: -1, code: emojiPlan.code } };
  // Explicit wrapper boxes can have no production reward rows; resolver validates
  // their icon/quality/use type against the live catalog before consumption.
  const isRandomRewardBox = itemId === 100802
    || randomItemRewards.isVerifiedBox(itemId)
    || randomItemRewards.isCustomBox(itemId);
  const randomPlan = (useType === 102 || isRandomRewardBox)
    ? randomItemRewards.resolveRandomRewardRows(player, itemId, count) : null;
  if (isRandomRewardBox && !randomPlan) {
    return { tag: 1300, msgUid, data: { result: -1, code: 'ITEM_REWARD_POOL_UNVERIFIED' } };
  }
  try {
    rewardGrant.assertRewardRowsSupported(requiresSelection ? selectedRows : (randomPlan ? randomPlan.rows : (useCfg?.rewards || [])));
  } catch (error) {
    return { tag: 1300, msgUid, data: { result: -1, code: error.code || 'ITEM_REWARD_UNAVAILABLE' } };
  }
  if (useType === 102 && !randomPlan && !emojiPlan) {
    const poolExists = (table, quality) => quality > 0 && Object.values(config.get(table) || {})
      .some((row) => toSafeInt(row && row.quality, 0) === quality);
    const hasLegacyPool = !!RED_PACKET_REWARD_POOLS[itemId]
      || poolExists('ValhallaConfig', getRandomValhallaPackQuality(itemId))
      || poolExists('PetConfig', getRandomPetPackQuality(itemId))
      || poolExists('BloodlineConfig', getRandomBloodlinePackQuality(itemId))
      || poolExists('ArtifactConfig', getRandomArtifactPackQuality(itemId))
      || (randomItemRewards.getGemRewardIdsByLevel(getGemPackLevel(itemId)).length > 0);
    if (!hasLegacyPool) {
      return { tag: 1300, msgUid, data: { result: -1, code: 'ITEM_REWARD_POOL_UNVERIFIED', msg: 'reward pool unavailable' } };
    }
  }

  // Never debit a missing-use item unless a verified special route exists.
  if (!useCfg && !randomPlan && !pillPlan && !emojiPlan) {
    const poolExists = (table, quality) => quality > 0 && Object.values(config.get(table) || {})
      .some((row) => toSafeInt(row && row.quality, 0) === quality);
    const supported = getValhallaFragmentComposeItemId(itemId) > 0
      || poolExists('ValhallaConfig', getRandomValhallaPackQuality(itemId))
      || poolExists('PetConfig', getRandomPetPackQuality(itemId))
      || poolExists('BloodlineConfig', getRandomBloodlinePackQuality(itemId))
      || poolExists('ArtifactConfig', getRandomArtifactPackQuality(itemId))
      || randomItemRewards.getGemRewardIdsByLevel(getGemPackLevel(itemId)).length > 0
      || (asset && itemId >= 40001 && itemId < 50000 && Number.isSafeInteger(count * 100));
    if (!supported) {
      return { tag: 1300, msgUid, data: { result: -1, code: 'ITEM_REWARD_POOL_UNVERIFIED' } };
    }
  }

  consumeBagItem(player, itemId, count);

  let taskChanged = false;
  if (Number(itemId) === 4) {
    taskChanged = !!addMainTaskBagelConsume(player, count);
    addRealmBagelConsume(player, count);
  }

  let rewardResult = {
    itemDeltas: [],
    changed: [],
    rewardInfo: buildRewardInfo(),
    rewardGems: [],
    rewardSwords: [],
    rewardPets: [],
    rewardPetSouls: [],
    rewardArtifacts: [],
    rewardBloodlines: [],
    rewardValhalla: [],
  };
  let permanentUseRecordCount = null;
  let emojiPackets = [];
  const valhallaComposeItemId = getValhallaFragmentComposeItemId(itemId);
  if (emojiPlan) {
    emojiPackets = emojiService.grant(player, emojiPlan);
  } else if (pillPlan) {
    rewardResult = addRewardRowsToPlayer(player, useCfg.rewards, count);
    pillService.commit(player, pillPlan, count);
  } else if (randomPlan) {
    rewardResult = addRewardRowsToPlayer(player, randomPlan.rows, 1);
  } else if (valhallaComposeItemId > 0) {
    rewardResult = addRewardRowsToPlayer(player, [{ id: valhallaComposeItemId, count: 1 }], count);
  } else if (getRandomValhallaPackQuality(itemId) > 0) {
    const rewardValhalla = grantRandomValhallaPackRewards(player, itemId, count);
    rewardResult = {
      itemDeltas: [],
      changed: [],
      rewardInfo: buildRewardInfo([], [], [], { valhalla: rewardValhalla }),
      rewardGems: [],
      rewardSwords: [],
      rewardPets: [],
      rewardPetSouls: [],
      rewardArtifacts: [],
      rewardBloodlines: [],
      rewardValhalla,
    };
  } else if (getRandomPetPackQuality(itemId) > 0) {
    const rewardPets = grantRandomPetPackRewards(player, itemId, count);
    rewardResult = {
      itemDeltas: [],
      changed: [],
      rewardInfo: buildRewardInfo([], [], [], { pets: rewardPets }),
      rewardGems: [],
      rewardSwords: [],
      rewardPets,
      rewardPetSouls: [],
      rewardArtifacts: [],
      rewardBloodlines: [],
      rewardValhalla: [],
    };
  } else if (getRandomBloodlinePackQuality(itemId) > 0) {
    const rewardBloodlines = grantRandomBloodlinePackRewards(player, itemId, count);
    rewardResult = {
      itemDeltas: [],
      changed: [],
      rewardInfo: buildRewardInfo([], [], [], { bloodline: rewardBloodlines }),
      rewardGems: [],
      rewardSwords: [],
      rewardPets: [],
      rewardPetSouls: [],
      rewardArtifacts: [],
      rewardBloodlines,
      rewardValhalla: [],
    };
  } else if (getRandomArtifactPackQuality(itemId) > 0) {
    const rewardArtifacts = grantRandomArtifactPackRewards(player, itemId, count);
    rewardResult = {
      itemDeltas: [],
      changed: [],
      rewardInfo: buildRewardInfo([], [], [], { artifacts: rewardArtifacts }),
      rewardGems: [],
      rewardSwords: [],
      rewardPets: [],
      rewardPetSouls: [],
      rewardArtifacts,
      rewardBloodlines: [],
      rewardValhalla: [],
    };
  } else if (getGemPackLevel(itemId) > 0) {
    const rewardGems = grantGemPackRewards(player, itemId, count);
    rewardResult = {
      itemDeltas: [],
      changed: [],
      rewardInfo: buildRewardInfo([], [], rewardGems),
      rewardGems,
      rewardSwords: [],
      rewardPets: [],
      rewardPetSouls: [],
      rewardArtifacts: [],
      rewardBloodlines: [],
      rewardValhalla: [],
    };
  } else if (useCfg) {
    if (useType === 103 || (useCfg.attrs && typeof useCfg.attrs === 'object' && !Array.isArray(useCfg.attrs))) {
      const useRecordCount = addItemUseRecord(player, itemId, count);
      permanentUseRecordCount = addOtherAttrRecord(player, itemId, count, useRecordCount);
    } else {
      const configuredRows = requiresSelection
        ? selectedRows
        : (Array.isArray(useCfg.rewards) ? useCfg.rewards : []);
      const rewardRows = useType === 102 && configuredRows.length <= 0
        ? pickRedPacketRewardRows(itemId, count)
        : configuredRows;
      rewardResult = addRewardRowsToPlayer(player, rewardRows, (useType === 102 || requiresSelection) ? 1 : count);
    }
  }

  const rewards = rewardResult.rewardInfo.items.slice();
  const rewardSwords = Array.isArray(rewardResult.rewardSwords) ? rewardResult.rewardSwords : [];
  const equippedSword = rewardSwords.length > 0 ? rewardSwords[rewardSwords.length - 1] : null;
  if (equippedSword && equippedSword.uid > 0) {
    player.swordInfo = player.swordInfo && typeof player.swordInfo === 'object' ? player.swordInfo : {};
    player.swordInfo.equippedUid = equippedSword.uid;
    taskChanged = !!addMountRideCount(player, 1) || taskChanged;
  }
  if (itemId >= 40001 && itemId < 50000) {
    const expGain = count * 100;
    addExpToPlayer(player, expGain);
    rewards.push({ id: 3, count: expGain });
    rewardResult.itemDeltas.push({ id: 3, count: expGain });
    rewardResult.changed.push({ id: 3, count: getOwnedItemOrCurrencyCount(player, 3) });
  }

  const changedMap = new Map(rewardResult.changed.map((row) => [row.id, row]));
  changedMap.set(itemId, { id: itemId, count: getOwnedItemOrCurrencyCount(player, itemId) });
  const itemDeltas = [{ id: itemId, count: -count }, ...rewardResult.itemDeltas];
  const itemSyncRows = Number(itemId) === 4 ? rewardResult.itemDeltas.slice() : itemDeltas;
  const changed = Array.from(changedMap.values()).sort((a, b) => a.id - b.id);
  const rewardInfo = {
    ...rewardResult.rewardInfo,
    items: rewards,
    swords: rewardSwords,
    pets: Array.isArray(rewardResult.rewardPets) ? rewardResult.rewardPets : [],
    bloodline: Array.isArray(rewardResult.rewardBloodlines) ? rewardResult.rewardBloodlines : [],
    artifacts: Array.isArray(rewardResult.rewardArtifacts) ? rewardResult.rewardArtifacts : [],
    valhalla: Array.isArray(rewardResult.rewardValhalla) ? rewardResult.rewardValhalla : [],
  };

  try {
    const saved = await playerService.savePlayer(session.userId, player, { returnSaved: false });
    if (!saved) throw new Error('ITEM_SAVE_NOT_CONFIRMED');
  } catch (error) {
    // A timeout can mean the write committed. Reload instead of reusing the
    // consumed in-memory snapshot or pretending a rollback was durable.
    session.player = null;
    throw error;
  }
  session._itemListCache = null;
  const packets = [];
  if (itemSyncRows.length > 0 || changed.length > 0) {
    packets.push({
      tag: 1202,
      msgUid: 0,
      data: {
        result: 0,
        items: itemSyncRows,
        changed,
      },
    });
  }
  if (rewardResult.rewardGems.length > 0) {
    const gemSyncPacket = buildGemInfoSyncPacket(player);
    if (gemSyncPacket) packets.push(gemSyncPacket);
    packets.push(...buildGemUpdatePackets(rewardResult.rewardGems));
  }
  if ((rewardResult.rewardPets || []).length > 0) {
    packets.push({ tag: 3300, msgUid: 0, data: { result: 0, data: rewardResult.rewardPets } });
  }
  if (rewardSwords.length > 0) {
    packets.push({ tag: 3201, msgUid: 0, data: { result: 0, data: rewardSwords } });
  }
  if (equippedSword && equippedSword.uid > 0) {
    const mount = getMountHandlerSafe();
    const info = mount && typeof mount.ensureMountInfo === 'function' ? mount.ensureMountInfo(player) : player.swordInfo;
    const buildInfo = mount && typeof mount.buildMountInfoUpdatePayload === 'function'
      ? mount.buildMountInfoUpdatePayload(info)
      : info;
    packets.push({ tag: 3200, msgUid: 0, data: { result: 0, uid: equippedSword.uid, info: buildInfo } });
  }
  (rewardResult.rewardPetSouls || []).forEach((soul) => {
    packets.push({ tag: 6901, msgUid: 0, data: { result: 0, data: soul } });
  });
  if ((rewardResult.rewardBloodlines || []).length > 0) {
    const bloodline = getBloodlineHandlerSafe();
    if (bloodline && typeof bloodline.ensureBloodlineInfo === 'function' && typeof bloodline.buildBloodlinePayload === 'function') {
      const info = bloodline.ensureBloodlineInfo(player);
      packets.push({ tag: 4701, msgUid: 0, data: { result: 0, ...bloodline.buildBloodlinePayload(info) } });
    }
  }
  if ((rewardResult.rewardValhalla || []).length > 0) {
    const valhalla = getValhallaHandlerSafe();
    if (valhalla && typeof valhalla.ensureValhallaInfo === 'function' && typeof valhalla.buildValhallaPayload === 'function') {
      const info = valhalla.ensureValhallaInfo(player);
      packets.push({ tag: 4100, msgUid: 0, data: { result: 0, ...valhalla.buildValhallaPayload(info) } });
    }
  }
  if ((rewardResult.rewardArtifacts || []).length > 0) {
    packets.push(...rewardResult.rewardArtifacts.map((artifact) => ({
      tag: 3500,
      msgUid: 0,
      data: { result: 0, artifact },
    })));
  }
  packets.push(...rewardGrant.buildAppearanceSyncPackets(player, rewardInfo));
  packets.push(...emojiPackets);
  if (permanentUseRecordCount != null) {
    packets.push({
      tag: 1250,
      msgUid: 0,
      data: { id: itemId, count: permanentUseRecordCount },
    });
  }
  if (taskChanged) packets.push(...buildTaskUpdatePacketsSafe(player));
  packets.push({
    tag: 1300,
    msgUid,
    data: {
      result: 0,
      itemId,
      index: itemId,
      count,
      rewards: rewardInfo,
      rewardInfo,
      gems: rewardResult.rewardGems,
      useRecords: buildUseRecordsPayload(player),
    },
  });
  return packets.length === 1 ? packets[0] : packets;
}

// 出售物品 (tag:1301)
async function handleSaleItem(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 1301, msgUid, data: { result: -1 } };

  const itemId = toSafeItemId(params && (params.itemId || params.id || params.index));
  const countRaw = params && params.count;
  const count = Math.floor(Number(countRaw == null ? 1 : countRaw));

  if (!Number.isFinite(count) || count <= 0) {
    return { tag: 1301, msgUid, data: { result: -1, msg: 'invalid count' } };
  }

  if (itemId <= 0 || !player.items || !player.items[itemId] || player.items[itemId] < count) {
    return { tag: 1301, msgUid, data: { result: -1, msg: 'not enough' } };
  }

  const valhallaComposeItemId = getValhallaFragmentComposeItemId(itemId);
  if (valhallaComposeItemId > 0) {
    consumeBagItem(player, itemId, count);
    const rewardResult = addRewardRowsToPlayer(player, [{ id: valhallaComposeItemId, count: 1 }], count);
    await playerService.savePlayer(session.userId, player, { returnSaved: false });
    const changedMap = new Map(rewardResult.changed.map((row) => [row.id, row]));
    changedMap.set(itemId, { id: itemId, count: getOwnedItemOrCurrencyCount(player, itemId) });
    const packets = [
      {
        tag: 1202,
        data: {
          items: [{ id: itemId, count: -count }, ...rewardResult.itemDeltas],
          changed: Array.from(changedMap.values()).sort((a, b) => a.id - b.id),
        },
      },
      {
        tag: 1301,
        msgUid,
        data: {
          result: 0,
          itemId,
          count,
          silver: 0,
          rewards: rewardResult.rewardInfo,
          rewardInfo: rewardResult.rewardInfo,
        },
      },
    ];
    if ((rewardResult.rewardValhalla || []).length > 0) {
      const valhalla = getValhallaHandlerSafe();
      if (valhalla && typeof valhalla.ensureValhallaInfo === 'function' && typeof valhalla.buildValhallaPayload === 'function') {
        const info = valhalla.ensureValhallaInfo(player);
        packets.splice(1, 0, { tag: 4100, msgUid: 0, data: { result: 0, ...valhalla.buildValhallaPayload(info) } });
      }
    }
    return packets;
  }

  const assetCfg = (config.get('AssetsConfig') || {})[itemId] || (config.get('AssetsConfig') || {})[String(itemId)] || null;
  const priceCfg = assetCfg && assetCfg.price && toSafeItemId(assetCfg.price.id) > 0
    ? { id: toSafeItemId(assetCfg.price.id), count: Math.max(0, Math.floor(Number(assetCfg.price.count) || 0)) }
    : { id: 2, count: 10 };
  const rewardRows = priceCfg.count > 0 ? [{ id: priceCfg.id, count: priceCfg.count }] : [];

  consumeBagItem(player, itemId, count);
  const rewardResult = addRewardRowsToPlayer(player, rewardRows, count);
  const silver = priceCfg.id === 2 ? priceCfg.count * count : 0;
  const { ticketItemId, ticketRate, enabled } = getOptionalSaleTicketConfig();
  const ticketCount = enabled ? Math.max(0, Math.floor(silver * ticketRate)) : 0;
  player.items = player.items || {};
  if (enabled && ticketCount > 0) {
    player.items[ticketItemId] = (Number(player.items[ticketItemId]) || 0) + ticketCount;
    rewardResult.itemDeltas.push({ id: ticketItemId, count: ticketCount });
    rewardResult.rewardInfo.items.push({ id: ticketItemId, count: ticketCount });
  }

  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  const soldLeft = Number(player.items[itemId]) || 0;
  const changedMap = new Map(rewardResult.changed.map((row) => [row.id, row]));
  changedMap.set(itemId, { id: itemId, count: soldLeft });
  if (enabled) {
    changedMap.set(ticketItemId, { id: ticketItemId, count: Number(player.items[ticketItemId]) || 0 });
  }
  const changed = Array.from(changedMap.values()).sort((a, b) => a.id - b.id);

  return [
    {
      tag: 1202,
      msgUid: 0,
      data: {
        result: 0,
        items: [{ id: itemId, count: -count }, ...rewardResult.itemDeltas],
        changed,
      },
    },
    {
      tag: 1301,
      msgUid,
      data: {
        result: 0,
        itemId,
          count,
          silver,
          rewards: rewardResult.rewardInfo,
          rewardInfo: rewardResult.rewardInfo,
          ...(enabled ? { ticketItemId, ticketCount } : {}),
        },
      },
  ];
}

// 装备替换 (tag:2200)
async function handleEquipReplace(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 2200, msgUid, data: { result: -1 } };

  ensureEquipInfo(player);
  const replaced = replaceOpenEquipToPlan(player, {
    uid: params && params.uid,
    listId: params && params.listId,
    mapId: params && params.mapId,
    requirePowerUpgrade: !!(params && params.autoDelegate === true),
  });

  if (replaced.result === 1) {
    return {
      tag: 2200,
      msgUid,
      data: {
        result: 1,
        desc: replaced.desc || 'equip replace failed',
        code: replaced.code || '',
        beforePower: Math.max(0, Number(replaced.beforePower) || 0),
        afterPower: Math.max(0, Number(replaced.afterPower) || 0),
      },
    };
  }

  const taskChanged = !!refreshMainTaskProgress(player);
  playerService.savePlayerDeferred(session.userId, player).catch((err) => {
    logger.warn(`[Item] async equip replace save failed user=${session.userId}: ${err.message}`);
  });
  const response = {
    tag: 2200,
    msgUid,
    data: {
      result: 0,
      uid: replaced.equip && replaced.equip.uid,
      listId: replaced.usedListId,
      mapId: replaced.mapId,
      autoDelegate: !!(params && params.autoDelegate === true),
      beforePower: Math.max(0, Number(replaced.beforePower) || 0),
      afterPower: Math.max(0, Number(replaced.afterPower) || 0),
    },
  };

  // Match online behavior: push the active task delta before the 2200 success ack.
  return taskChanged ? [...buildTaskUpdatePacketsSafe(player), response] : response;
}

// 鍑哄敭瑁呭 (tag:2201)
async function handleEquipSale(params, session, msgUid) {
  if (!(params && (params.autoDelegate === true || params.sellAllEquipments === true))) {
    return handleEquipSaleUnlocked(params, session, msgUid);
  }
  return require('../services/PlayerMutationService').run(session && session.userId, async () => {
    const original = session && session.player;
    if (!original || !session.userId) return { tag: 2201, msgUid, data: { result: -1, uids: [], rewardInfo: { items: [] } } };
    await playerService.drainPendingSaves(session.userId);
    // WSServer serializes the complete request. Keep the latest online state
    // (including accepted drops) and never ACK an unconfirmed sale.
    const draft = cloneEquipSaleDraft(original);
    const result = await handleEquipSaleUnlocked(params, { ...session, player: draft, _confirmedEquipSale: true }, msgUid);
    try {
      if (!await playerService.savePlayer(session.userId, draft, {
        returnSaved: false,
        snapshotProvided: true,
        onlyFields: EQUIP_SALE_SAVE_FIELDS,
      })) throw new Error('AUTO_EQUIP_SALE_SAVE_NOT_CONFIRMED');
    } catch (error) {
      require('../services/RuntimeBus').getWsServer()?.invalidatePlayerForMutation(session.userId);
      session.player = null;
      throw error;
    }
    Object.assign(original, draft);
    session._itemListCache = null;
    return result;
  });
}

async function handleEquipSaleUnlocked(params, session, msgUid) {
  const player = session.player;
  if (!player) {
    return {
      tag: 2201,
      msgUid,
      data: { result: -1, uids: [], rewardInfo: { items: [] } },
    };
  }

  ensureEquipInfo(player);
  const result = saleOpenEquips(player, params && params.uids, {
    safeAutoDelegate: !!(params && params.autoDelegate === true),
    sellAllEquipments: !!(params && params.sellAllEquipments === true),
  });

  const silverGain = Math.max(
    0,
    Number(
      (result.rewardInfo && Array.isArray(result.rewardInfo.items)
        ? result.rewardInfo.items.find((row) => Number(row && row.id) === 2)
        : null
      )?.count || 0
    )
  );
  const taskChanged = !!addEquipSaleProgress(
    player,
    Array.isArray(result.uids) ? result.uids.length : 0,
    silverGain,
  );

  // Persist through the per-player queue without blocking the protocol ACK.
  // PlayerService snapshots the object at enqueue time, and WSServer detects
  // the pending save so it will not issue a duplicate full save.
  if (!session._confirmedEquipSale) playerService.savePlayerDeferred(session.userId, player).catch((err) => {
    logger.warn(`[Item] async equip sale save failed user=${session.userId}: ${err.message}`);
  });

  const rewardItems = Array.isArray(result.rewardInfo && result.rewardInfo.items)
    ? result.rewardInfo.items
        .map((row) => ({ id: Number(row && row.id) || 0, count: Number(row && row.count) || 0 }))
        .filter((row) => row.id > 0 && row.count > 0)
    : [];
  const rewardInfo = {
    items: rewardItems,
    equips: [],
    swords: [],
    pets: [],
    artifacts: [],
    gems: [],
    valhalla: [],
    bloodline: [],
    fashion: [],
    sailor: [],
    elves: [],
    extraReward: {},
  };

  const response = [
    {
      tag: 1212,
      data: { type: 38, endTime: 0 },
    },
    {
      tag: 1202,
      data: {
        items: rewardItems,
      },
    },
    {
      tag: 2201,
      msgUid,
      data: {
        result: 0,
        uids: Array.isArray(result.uids) ? result.uids.slice() : [],
        ignoredUids: Array.isArray(result.ignoredUids) ? result.ignoredUids.slice() : [],
        missingUids: Array.isArray(result.missingUids) ? result.missingUids.slice() : [],
        autoDelegate: !!(params && params.autoDelegate === true),
        sellAllEquipments: !!(params && params.sellAllEquipments === true),
        rewardInfo,
      },
    },
  ];

  if (taskChanged) {
    response.splice(2, 0, ...buildTaskUpdatePacketsSafe(player));
  }
  return response;
}

// 商店购买 (tag:1210)
async function handleShopBuy(params, session, msgUid) {
  const goodsId = params.goodsId || params.id;
  const parsedCount = parsePositiveCount(params && params.count, 1);
  if (!parsedCount.valid) {
    return { tag: 1210, msgUid, data: { result: -1, msg: 'invalid count' } };
  }
  const count = parsedCount.count;
  const result = await handleMultiBuyItem({ require: { [goodsId]: count }, requestId: params?.requestId }, session, msgUid);
  const resultPacket = getPurchaseResultPacket(result, msgUid);
  if (!resultPacket || resultPacket.tag !== 1202) {
    return { tag: 1210, msgUid, data: { result: -1 } };
  }
  const packets = Array.isArray(result) ? result.slice() : [result];
  packets.push(
    {
      tag: 1210,
      msgUid,
        data: {
          result: resultPacket.data && resultPacket.data.result === 0 ? 0 : -1,
          goodsId,
          count,
          items: resultPacket.data && Array.isArray(resultPacket.data.items) ? resultPacket.data.items : [],
          changed: resultPacket.data && Array.isArray(resultPacket.data.changed) ? resultPacket.data.changed : [],
          timeRecords: resultPacket.data && resultPacket.data.timeRecords ? resultPacket.data.timeRecords : buildItemTimeRecords(session && session.player),
          rewards: resultPacket.data && resultPacket.data.rewardInfo ? resultPacket.data.rewardInfo : { items: [], equips: [] },
          rewardInfo: resultPacket.data && resultPacket.data.rewardInfo ? resultPacket.data.rewardInfo : { items: [], equips: [] },
        },
    }
  );
  return packets;
}

module.exports = {
  buildItemTimeRecords,
  handleGetItems, handleExchangeItem, handleMultiBuyItem,
  handleUseItem, handleSaleItem, handleEquipReplace, handleEquipSale, handleShopBuy,
  addRewardRowsToPlayer,
  buildGemInfoSyncPacket,
  buildGemUpdatePackets,
  buildUseRecordsPayload,
};

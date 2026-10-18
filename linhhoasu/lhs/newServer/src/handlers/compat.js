const playerService = require('../services/PlayerService');
const configService = require('../services/ConfigService');
const playerMutation = require('../services/PlayerMutationService');
const logger = require('../logger');
const { addRewardToPlayer } = require('./raid');
const { addRewardRowsToPlayer, buildGemInfoSyncPacket, buildGemUpdatePackets } = require('./item');
const { refreshMainTaskProgress } = require('../services/MainTaskProgressService');
const { ensureRoleAppearance, getPlayerFashionMap, getPrimaryBattlePetId } = require('../services/RoleAppearanceService');
const { getBoxSkipUnitMs, getClientBoxEndTimeSec } = require('../utils/boxTiming');
const { validatePlayerName, isNameTaken, syncAccountRoleName } = require('../services/PlayerNameService');
const { syncCurrencyItems } = require('../services/CurrencySync');
const { buildRewardItemSync } = require('../services/RewardSync');
const serverConfigService = require('../services/ServerConfigService');
const battleService = require('../services/BattleService');
const arenaReadModel = require('../services/ArenaReadModelService');
const runtimeBus = require('../services/RuntimeBus');
const dropTierMutation = require('../services/DropTierMutationService');
const rewardGrant = require('../services/RewardGrantService');
const {
  activateActivity9ForPayId,
  ensureActivity9State,
  getActivity9PriceR,
  hasActivity9Purchase,
  isActivity9PayId,
  isWindowOpen: isActivity9WindowOpen,
} = require('../services/Activity9Service');
const {
  buildActivationPassUpdatePacket,
  ensureActivationPassState,
  hasActivationPassEntitlement,
  isActivationPassPayId,
} = require('../services/ActivationPassService');
const {
  applyRechargeBenefits,
  buildMonthCardUpdatePackets,
  resolveRechargeProduct,
} = require('../services/RechargeBenefitService');
const {
  applyPeriodPurchaseLedger,
  parseMulti,
  resolveRechargeRewards,
} = require('../services/RechargeRewardResolver');
const {
  ensureEquipInfo,
  isEquipTemplateItem,
  createEquipFromTemplateId,
  addOpenEquip,
} = require('../services/EquipService');

function normalizeTaskInfoSafe(taskInfo = {}, roleInfo = {}, player = {}) {
  try {
    // eslint-disable-next-line global-require
    const mod = require('./playerPayload');
    if (mod && typeof mod.normalizeTaskInfo === 'function') {
      return mod.normalizeTaskInfo(taskInfo, roleInfo, player);
    }
  } catch (_err) {}
  return taskInfo;
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

function toSafeInt(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.floor(num);
}

function clonePlayerSnapshot(player = {}) {
  if (!player || typeof player !== 'object') return {};
  try {
    return JSON.parse(JSON.stringify(player));
  } catch (_err) {
    return { ...player };
  }
}

function normalizeIds(params = {}) {
  if (Array.isArray(params.ids)) {
    return params.ids
      .map((id) => toSafeInt(id, 0))
      .filter((id) => id > 0);
  }
  const single = toSafeInt(params.id, 0);
  return single > 0 ? [single] : [];
}

function ensureUnlockInfo(player = {}) {
  if (!player.systemUnlockInfo || typeof player.systemUnlockInfo !== 'object') {
    player.systemUnlockInfo = {};
  }
  const info = player.systemUnlockInfo;

  if (!Array.isArray(info.unlockedSystem)) info.unlockedSystem = [];
  if (!Array.isArray(info.rewardedSystem)) info.rewardedSystem = [];
  if (!info.settings || typeof info.settings !== 'object') info.settings = {};

  return info;
}

function ensurePlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function getCurrentEquipPlan(player = {}) {
  const equipInfo = ensurePlainObject(player.equipInfo);
  const equipSetMap = ensurePlainObject(equipInfo.equipSetMap);
  const curIndex = String(Math.max(0, toSafeInt(equipInfo.curIndex, 0)));
  return ensurePlainObject(equipSetMap[curIndex]);
}

function buildEquippedIdMap(player = {}) {
  const plan = getCurrentEquipPlan(player);
  const map = {};
  Object.keys(plan).forEach((slotKey) => {
    const equip = ensurePlainObject(plan[slotKey]);
    const id = Math.max(0, toSafeInt(equip.id, 0));
    if (id > 0) map[String(slotKey)] = id;
  });
  return map;
}

function getPlayerPower(player = {}) {
  try {
    return Math.max(0, toSafeInt(arenaReadModel.displayPower(battleService.calcPlayerPower(player)), 0));
  } catch (_err) {
    return Math.max(0, toSafeInt(player.displayPower || player.power, 0));
  }
}

function getPlayerPowerScore(player = {}) {
  try {
    return Math.max(0, toSafeInt(battleService.calcPowerScore(battleService.calcPlayerPower(player)), 0));
  } catch (_err) {
    return Math.max(0, toSafeInt(player.powerScore, 0));
  }
}

async function resolveShowTargetPlayer(params = {}, session = {}) {
  const targetDbid = String((params && (params.dbid || params.playerId)) || '').trim();
  const selfPlayer = session && session.player ? session.player : null;
  if (!targetDbid) return selfPlayer || {};

  if (selfPlayer) {
    const selfIds = [selfPlayer._id, selfPlayer.playerId].filter(Boolean).map(String);
    if (selfIds.includes(targetDbid)) return selfPlayer;
  }

  if (typeof playerService.findByDbidOrPlayerId === 'function') {
    const found = await playerService.findByDbidOrPlayerId(targetDbid);
    if (found) return found;
  }
  return selfPlayer || {};
}

function ensureBoxInfo(player = {}) {
  if (!player.boxInfo || typeof player.boxInfo !== 'object' || Array.isArray(player.boxInfo)) {
    player.boxInfo = {};
  }
  const boxInfo = player.boxInfo;
  boxInfo.level = Math.max(1, toSafeInt(boxInfo.level, 1));
  boxInfo.exp = Math.max(0, toSafeInt(boxInfo.exp, 0));
  boxInfo.upgradeFinishTime = Math.max(0, toSafeInt(boxInfo.upgradeFinishTime, 0));
  boxInfo.upgradeStartTime = Math.max(0, toSafeInt(boxInfo.upgradeStartTime, 0));
  boxInfo.tier = Math.max(1, toSafeInt(boxInfo.tier, 1));
  boxInfo.tierExp = Math.max(0, toSafeInt(boxInfo.tierExp, 0));
  boxInfo.tierUpTime = Math.max(0, toSafeInt(boxInfo.tierUpTime, 0));
  boxInfo.tierUpStartTime = Math.max(0, toSafeInt(boxInfo.tierUpStartTime, 0));
  boxInfo.summonExp = Math.max(0, toSafeInt(boxInfo.summonExp, 0));
  boxInfo.summonCount = Math.max(0, toSafeInt(boxInfo.summonCount, 0));
  boxInfo.summonFreeCount = Math.max(0, toSafeInt(boxInfo.summonFreeCount, 0));
  boxInfo.speedUp = !!boxInfo.speedUp;
  return boxInfo;
}

function getCurrencyKeyByItemId(itemId) {
  switch (toSafeInt(itemId, 0)) {
    case 1: return 'diamond';
    case 2: return 'silver';
    case 6: return 'gold';
    default: return null;
  }
}

function getPlayerItemCount(player = {}, itemId) {
  const id = toSafeInt(itemId, 0);
  if (id <= 0) return 0;
  const currencyKey = getCurrencyKeyByItemId(id);
  if (currencyKey) {
    player.currencies = player.currencies || { gold: 0, diamond: 0, silver: 0 };
    return Math.max(0, toSafeInt(player.currencies[currencyKey], 0));
  }
  player.items = player.items || {};
  return Math.max(0, toSafeInt(player.items[id], 0));
}

function consumePlayerItem(player = {}, itemId, count) {
  const id = toSafeInt(itemId, 0);
  const need = Math.max(0, toSafeInt(count, 0));
  if (id <= 0 || need <= 0) return true;

  const owned = getPlayerItemCount(player, id);
  if (owned < need) return false;

  const currencyKey = getCurrencyKeyByItemId(id);
  if (currencyKey) {
    player.currencies = player.currencies || { gold: 0, diamond: 0, silver: 0 };
    player.currencies[currencyKey] = Math.max(0, toSafeInt(player.currencies[currencyKey], 0) - need);
    return true;
  }

  player.items = player.items || {};
  player.items[id] = Math.max(0, toSafeInt(player.items[id], 0) - need);
  if (player.items[id] <= 0) {
    delete player.items[id];
  }
  return true;
}

function buildItemChangePacket(player, itemId, count, msgUid = 0) {
  const id = Math.max(0, toSafeInt(itemId, 0));
  const delta = toSafeInt(count, 0);
  if (id <= 0 || delta === 0) return null;
  return {
    tag: 1202,
    msgUid,
    data: {
      result: 0,
      items: [{ id, count: delta }],
      changed: [{ id, count: getPlayerItemCount(player, id) }],
    },
  };
}

function mergeItemDeltas(rows = []) {
  const merged = new Map();
  rows.forEach((row) => {
    const id = Math.max(0, toSafeInt(row && row.id, 0));
    const count = toSafeInt(row && row.count, 0);
    if (id <= 0 || count === 0) return;
    merged.set(id, (merged.get(id) || 0) + count);
  });
  return Array.from(merged.entries())
    .filter(([, count]) => count !== 0)
    .map(([id, count]) => ({ id, count }));
}

function buildBoxTierUpdatePacket(boxInfo, msgUid = 0, nowMs = Date.now()) {
  return {
    tag: 2170,
    msgUid,
    data: {
      tier: Math.max(1, toSafeInt(boxInfo && boxInfo.tier, 1)),
      tierExp: Math.max(0, toSafeInt(boxInfo && boxInfo.tierExp, 0)),
      tierUpTime: getClientBoxEndTimeSec(boxInfo && boxInfo.tierUpTime, nowMs),
    },
  };
}

function buildBoxLevelUpdatePacket(boxInfo, msgUid = 0, nowMs = Date.now()) {
  return {
    tag: 2100,
    msgUid,
    data: {
      level: Math.max(1, toSafeInt(boxInfo && boxInfo.level, 1)),
      exp: Math.max(0, toSafeInt(boxInfo && boxInfo.exp, 0)),
      upgradeFinishTime: getClientBoxEndTimeSec(boxInfo && boxInfo.upgradeFinishTime, nowMs),
    },
  };
}

function toDurationMsFromSec(secValue) {
  const sec = Math.max(0, toSafeInt(secValue, 0));
  return sec * 1000;
}

function getBoxUpgradeMaxWaitMs(isSpeedUp = false) {
  const envKey = isSpeedUp ? 'BOX_UPGRADE_SPEEDUP_MAX_WAIT_MS' : 'BOX_UPGRADE_MAX_WAIT_MS';
  const raw = Number(process.env[envKey]);
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return Number.MAX_SAFE_INTEGER;
}

function getBoxUpgradeDurationMs(secValue, isSpeedUp = false) {
  return Math.min(toDurationMsFromSec(secValue), getBoxUpgradeMaxWaitMs(isSpeedUp));
}

function getBoxLevelUpCostSteps(levelUpCost = []) {
  const source = Array.isArray(levelUpCost) ? levelUpCost : [];
  if (source.length > 0 && source.length < 5) {
    return source.map((cost) => Math.max(0, toSafeInt(cost, 0)));
  }
  const fallbackCost = Math.max(0, toSafeInt(source[source.length - 1], 0));
  return Array.from({ length: 5 }, (_value, index) => {
    if (index < source.length) return Math.max(0, toSafeInt(source[index], 0));
    return fallbackCost;
  });
}

function getBoxSpeedUpLimitMs(durationMs) {
  return Math.max(0, toSafeInt(durationMs, 0));
}

function getBoxCooldownStartTime(finishTime, startTime, durationMs, nowMs) {
  const finish = Math.max(0, toSafeInt(finishTime, 0));
  const start = Math.max(0, toSafeInt(startTime, 0));
  const duration = Math.max(0, toSafeInt(durationMs, 0));
  if (finish <= 0 || duration <= 0) return 0;
  if (start > 0 && start <= finish) return start;
  return Math.max(0, Math.min(toSafeInt(nowMs, Date.now()), finish - duration));
}

function applyBoxCooldownSkip(boxInfo, finishKey, startKey, durationMs, count) {
  const skipMs = Math.max(0, toSafeInt(count, 0)) * getBoxSkipUnitMs();
  const finish = Math.max(0, toSafeInt(boxInfo && boxInfo[finishKey], 0));
  const duration = Math.max(0, toSafeInt(durationMs, 0));
  if (!boxInfo || finish <= 0 || duration <= 0 || skipMs <= 0) return 0;

  const start = getBoxCooldownStartTime(finish, boxInfo[startKey], duration, Date.now());
  boxInfo[startKey] = start;
  const minFinishTime = Date.now();
  const nextFinishTime = Math.max(minFinishTime, finish - skipMs);
  const usedSkipMs = Math.max(0, finish - nextFinishTime);
  boxInfo[finishKey] = nextFinishTime;
  return Math.min(Math.max(0, toSafeInt(count, 0)), Math.ceil(usedSkipMs / getBoxSkipUnitMs()));
}

function getAvailableBoxCooldownSkipCount(boxInfo, finishKey, startKey, durationMs) {
  const finish = Math.max(0, toSafeInt(boxInfo && boxInfo[finishKey], 0));
  const duration = Math.max(0, toSafeInt(durationMs, 0));
  if (!boxInfo || finish <= 0 || duration <= 0) return 0;

  const start = getBoxCooldownStartTime(finish, boxInfo[startKey], duration, Date.now());
  boxInfo[startKey] = start;
  return Math.max(0, Math.ceil((finish - Date.now()) / getBoxSkipUnitMs()));
}

function getActiveBoxCooldownDurationMs(boxInfo, finishKey, startKey, configuredDurationMs) {
  const configured = Math.max(0, toSafeInt(configuredDurationMs, 0));
  if (configured > 0) return configured;

  const finish = Math.max(0, toSafeInt(boxInfo && boxInfo[finishKey], 0));
  const start = Math.max(0, toSafeInt(boxInfo && boxInfo[startKey], 0));
  return finish > start ? finish - start : 0;
}

function settleBoxLevelIfFinished(boxInfo, nowMs) {
  const now = Math.max(0, toSafeInt(nowMs, Date.now()));
  if (boxInfo.upgradeFinishTime > 0 && boxInfo.upgradeFinishTime <= now) {
    boxInfo.level = Math.max(1, toSafeInt(boxInfo.level, 1) + 1);
    boxInfo.exp = 0;
    boxInfo.upgradeFinishTime = 0;
    boxInfo.upgradeStartTime = 0;
    return true;
  }
  return false;
}

function settleBoxTierIfFinished(boxInfo, nowMs) {
  const now = Math.max(0, toSafeInt(nowMs, Date.now()));
  if (boxInfo.tierUpTime > 0 && boxInfo.tierUpTime <= now) {
    boxInfo.tier = Math.max(1, toSafeInt(boxInfo.tier, 1) + 1);
    boxInfo.tierExp = 0;
    boxInfo.tierUpTime = 0;
    boxInfo.tierUpStartTime = 0;
    return true;
  }
  return false;
}

function settleBoxTierProgressIfReady(boxInfo, cfgMap, nowMs) {
  const now = Math.max(0, toSafeInt(nowMs, Date.now()));
  const tier = Math.max(1, toSafeInt(boxInfo.tier, 1));
  const curCfg = getCfgRow(cfgMap, tier);
  const nextCfg = getCfgRow(cfgMap, tier + 1);
  const tierUpCost = Array.isArray(curCfg && curCfg.tierUpCost) ? curCfg.tierUpCost : [];
  if (!curCfg || !nextCfg || boxInfo.tierUpTime > 0 || tierUpCost.length <= 0) return false;
  if (toSafeInt(boxInfo.tierExp, 0) < tierUpCost.length) return false;

  boxInfo.tierUpStartTime = now;
  boxInfo.tierUpTime = now + getBoxUpgradeDurationMs(curCfg.timeCost, boxInfo.speedUp);
  return settleBoxTierIfFinished(boxInfo, now);
}

function isTaskFinished(taskState = {}) {
  const status = toSafeInt(taskState && taskState.status, 0);
  if (status >= 20) return true;
  const target = Math.max(0, toSafeInt(taskState && taskState.target, 0));
  const progress = Math.max(0, toSafeInt(taskState && taskState.progress, 0));
  return target > 0 && progress >= target;
}

function getFirstUnfinishedTaskId(player, taskIds = []) {
  const ids = Array.isArray(taskIds) ? taskIds : [];
  if (ids.length <= 0) return 0;

  const taskInfo = normalizeTaskInfoSafe(player.taskInfo || {}, player.roleInfo || {}, player);
  const tasks = (taskInfo && taskInfo.tasks) || {};

  for (let i = 0; i < ids.length; i += 1) {
    const taskId = Math.max(0, toSafeInt(ids[i], 0));
    if (taskId <= 0) continue;
    const state = tasks[String(taskId)];
    if (!isTaskFinished(state)) return taskId;
  }
  return 0;
}

function getCfgRow(cfgMap, id) {
  if (!cfgMap || typeof cfgMap !== 'object') return null;
  return cfgMap[id] || cfgMap[String(id)] || null;
}

function buildRewardInfo(items = []) {
  const list = Array.isArray(items) ? items : [];
  return {
    items: list
      .map((row) => ({ id: Math.max(0, toSafeInt(row && row.id, 0)), count: Math.max(0, toSafeInt(row && row.count, 0)) }))
      .filter((row) => row.id > 0 && row.count > 0),
    equips: [],
    heros: [],
  };
}

function getTokenChargeOptions(payRow = {}) {
  return [
    { itemId: 1001, count: getActivity9PriceR(payRow.id, payRow.priceR), area: 1 },
    { itemId: 1002, count: Math.max(0, toSafeInt(payRow.priceD, 0)), area: 2 },
    { itemId: 1003, count: Math.max(0, toSafeInt(payRow.priceNT, 0)), area: 3 },
  ].filter((row) => row.count > 0);
}

function pickTokenChargeOption(player = {}, payRow = {}) {
  const rechargeInfo = player && typeof player.rechargeInfo === 'object' && !Array.isArray(player.rechargeInfo)
    ? player.rechargeInfo
    : {};
  const preferredArea = Math.max(0, toSafeInt(rechargeInfo.area, 0));
  const options = getTokenChargeOptions(payRow);
  if (options.length <= 0) return null;

  const preferred = options.find((row) => row.area === preferredArea);
  if (preferred && getPlayerItemCount(player, preferred.itemId) >= preferred.count) {
    return preferred;
  }

  return options.find((row) => getPlayerItemCount(player, row.itemId) >= row.count) || options[0];
}

async function applyConfiguredRechargeArea(player = {}) {
  const area = await serverConfigService.getCurrentRechargeArea();
  if (![1, 2, 3].includes(Number(area))) return;
  player.rechargeInfo = player.rechargeInfo && typeof player.rechargeInfo === 'object' && !Array.isArray(player.rechargeInfo)
    ? player.rechargeInfo
    : {};
  player.rechargeInfo.area = Number(area);
}

function getRechargePurchasePlan(player, payId, multi, now) {
  const rewardPlan = resolveRechargeRewards(player, {
    route: 'token',
    payId,
    multi,
    now,
    allowActivity9: true,
    allowActivationPass: true,
  });
  const product = resolveRechargeProduct(payId);
  const payRow = getCfgRow(configService.get('PayConfig') || {}, payId);
  return { product, payRow, rewardPlan };
}

function cloneRechargeValue(value) {
  if (value == null) return value;
  try { return JSON.parse(JSON.stringify(value)); } catch (_error) { return value; }
}

function captureRechargeState(player) {
  const keys = [
    'currencies', 'items', 'exp', 'rechargeInfo', 'shopInfo', 'fashionInfo',
    'equipInfo', 'swordInfo', 'petInfo', 'petSoulInfo', 'artifactInfo',
    'valhallaInfo', 'bloodlineInfo', 'roleInfo', 'other_attr_info', 'activityInfo',
  ];
  const state = {};
  keys.forEach((key) => { state[key] = cloneRechargeValue(player && player[key]); });
  return state;
}

function restoreRechargeState(player, state) {
  if (!player || !state) return;
  Object.keys(state).forEach((key) => {
    if (state[key] === undefined) delete player[key];
    else player[key] = cloneRechargeValue(state[key]);
  });
}

function mergeRewardInfo(primary = {}, bonus = null) {
  const categories = ['items', 'equips', 'swords', 'pets', 'petSouls', 'artifacts', 'gems', 'valhalla', 'bloodline', 'fashion', 'formations', 'spirits', 'elves', 'sailor'];
  const info = { ...primary };
  categories.forEach((key) => { info[key] = Array.isArray(primary[key]) ? primary[key].slice() : []; });
  info.extraReward = primary.extraReward && typeof primary.extraReward === 'object' ? { ...primary.extraReward } : {};
  if (bonus) {
    info.extraReward[1] = {
      items: Array.isArray(bonus.items) ? bonus.items.slice() : [],
      equips: Array.isArray(bonus.equips) ? bonus.equips.slice() : [],
      swords: Array.isArray(bonus.swords) ? bonus.swords.slice() : [],
      pets: Array.isArray(bonus.pets) ? bonus.pets.slice() : [],
      petSouls: Array.isArray(bonus.petSouls) ? bonus.petSouls.slice() : [],
      artifacts: Array.isArray(bonus.artifacts) ? bonus.artifacts.slice() : [],
      gems: Array.isArray(bonus.gems) ? bonus.gems.slice() : [],
      valhalla: Array.isArray(bonus.valhalla) ? bonus.valhalla.slice() : [],
      bloodline: Array.isArray(bonus.bloodline) ? bonus.bloodline.slice() : [],
      fashion: Array.isArray(bonus.fashion) ? bonus.fashion.slice() : [],
      formations: Array.isArray(bonus.formations) ? bonus.formations.slice() : [],
      spirits: Array.isArray(bonus.spirits) ? bonus.spirits.slice() : [],
    };
  }
  return info;
}

function buildRechargeNativePackets(player, rewardInfo) {
  const packets = [];
  const root = rewardInfo || {};
  const sources = [root];
  Object.values(root.extraReward && typeof root.extraReward === 'object' ? root.extraReward : {})
    .forEach((row) => {
      if (row && typeof row === 'object' && !Array.isArray(row)) sources.push(row);
    });
  const info = {};
  ['gems', 'fashion', 'formations', 'spirits', 'pets', 'swords', 'valhalla', 'bloodline', 'artifacts', 'petSouls']
    .forEach((key) => { info[key] = sources.flatMap((source) => (Array.isArray(source[key]) ? source[key] : [])); });
  if (Array.isArray(info.gems) && info.gems.length > 0) {
    const gemSync = buildGemInfoSyncPacket(player);
    if (gemSync) packets.push(gemSync);
    packets.push(...buildGemUpdatePackets(info.gems));
  }
  packets.push(...rewardGrant.buildAppearanceSyncPackets(player, root));
  if (Array.isArray(info.pets) && info.pets.length > 0) {
    packets.push({ tag: 3300, msgUid: 0, data: { result: 0, data: info.pets } });
  }
  if (Array.isArray(info.swords) && info.swords.length > 0) {
    packets.push({ tag: 3201, msgUid: 0, data: { result: 0, data: info.swords } });
    const mount = require('./mount');
    const mountInfo = mount && typeof mount.ensureMountInfo === 'function' ? mount.ensureMountInfo(player) : player.swordInfo;
    const payload = mount && typeof mount.buildMountInfoUpdatePayload === 'function' ? mount.buildMountInfoUpdatePayload(mountInfo) : mountInfo;
    packets.push({ tag: 3200, msgUid: 0, data: { result: 0, uid: payload && payload.equippedUid, info: payload } });
  }
  if (Array.isArray(info.valhalla) && info.valhalla.length > 0) {
    const valhalla = require('./valhalla');
    if (valhalla && typeof valhalla.ensureValhallaInfo === 'function' && typeof valhalla.buildValhallaPayload === 'function') {
      packets.push({ tag: 4100, msgUid: 0, data: { result: 0, ...valhalla.buildValhallaPayload(valhalla.ensureValhallaInfo(player)) } });
    }
  }
  if (Array.isArray(info.bloodline) && info.bloodline.length > 0) {
    const bloodline = require('./bloodline');
    if (bloodline && typeof bloodline.ensureBloodlineInfo === 'function' && typeof bloodline.buildBloodlinePayload === 'function') {
      packets.push({ tag: 4701, msgUid: 0, data: { result: 0, ...bloodline.buildBloodlinePayload(bloodline.ensureBloodlineInfo(player)) } });
    }
  }
  if (Array.isArray(info.artifacts) && info.artifacts.length > 0) {
    packets.push(...info.artifacts.map((artifact) => ({ tag: 3500, msgUid: 0, data: { result: 0, artifact } })));
  }
  if (Array.isArray(info.petSouls) && info.petSouls.length > 0) {
    packets.push(...info.petSouls.map((soul) => ({ tag: 6901, msgUid: 0, data: { result: 0, data: soul } })));
  }
  return packets;
}

function buildRechargeChangedRows(rows = []) {
  const map = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const id = toSafeInt(row && row.id, 0);
    if (id > 0) map.set(id, { id, count: Math.max(0, toSafeInt(row && row.count, 0)) });
  });
  return Array.from(map.values()).sort((left, right) => left.id - right.id);
}

function buildActivity9UpdatePacket(update) {
  const row = update && update.row;
  if (!row) return null;
  return {
    tag: 1701,
    msgUid: 0,
    data: { data: row },
  };
}

async function saveSessionPlayer(session, player) {
  if (!session || !session.userId || !player) return;
  if (session._dropTierDraft) return;
  let saved;
  try {
    saved = await playerService.savePlayer(session.userId, player, { returnSaved: false });
  } catch (error) {
    session.player = null;
    runtimeBus.getWsServer()?.invalidatePlayerForMutation(session.userId);
    throw error;
  }
  if (!saved) {
    session.player = null;
    runtimeBus.getWsServer()?.invalidatePlayerForMutation(session.userId);
    throw new Error('COMPAT_SAVE_UNCONFIRMED');
  }
  session.player = player;
}

function scheduleSessionPlayerSave(session, player, reason = 'compat') {
  if (!session || !session.userId || !player) return;
  session._compatSaveVersion = (Number(session._compatSaveVersion) || 0) + 1;
  if (session._compatSaveScheduled) return;
  session._compatSaveScheduled = true;
  const scheduledVersion = session._compatSaveVersion;
  playerService.savePlayerDeferred(session.userId, player).then(
    () => {
      session._compatSaveScheduled = false;
      if (session._compatSaveVersion !== scheduledVersion) {
        scheduleSessionPlayerSave(session, player, reason);
      }
    },
    (err) => {
      logger.warn(`[Compat] async save failed ${reason} user=${session.userId}: ${err.message}`);
      session._compatSaveScheduled = false;
      if (session._compatSaveVersion !== scheduledVersion) {
        scheduleSessionPlayerSave(session, player, reason);
      }
    }
  );
}

async function handleClientTelemetry(params = {}, _session, msgUid) {
  return {
    tag: 12,
    msgUid,
    data: {
      result: 0,
      type: toSafeInt(params.type, 0),
    },
  };
}

async function handleClientAck22(_params = {}, _session, msgUid) {
  const params = _params && typeof _params === 'object' ? _params : {};
  const session = _session && typeof _session === 'object' ? _session : {};
  const player = session.player;
  if (!player) {
    return {
      tag: 22,
      msgUid,
      data: {
        result: -1,
        name: '',
        nameChangeTime: 0,
      },
    };
  }

  const newName = String(params.name || params.newName || '');
  const validation = validatePlayerName(newName);
  if (!validation.ok || await isNameTaken(validation.name, session && session.userId)) {
    return {
      tag: 22,
      msgUid,
      data: {
        result: -2,
        name: player.name || '',
        nameChangeTime: 0,
      },
    };
  }

  const nameChangeTime = Date.now();
  player.name = validation.name;
  player.changeName = Math.max(1, toSafeInt(player.changeName, 0) + 1);
  player.nameChangeTime = nameChangeTime;
  await saveSessionPlayer(session, player);
  await syncAccountRoleName(session.userId, player.name);

  return {
    tag: 22,
    msgUid,
    data: {
      result: 0,
      name: player.name,
      nameChangeTime,
    },
  };
}

async function handleClientCompat2(params = {}, _session, msgUid) {
  return {
    tag: 2,
    msgUid,
    data: {
      result: 0,
      value: toSafeInt(params.value, 0),
    },
  };
}

async function handleClientCompat3(params = {}, _session, msgUid) {
  return {
    tag: 3,
    msgUid,
    data: {
      result: 0,
      value: toSafeInt(params.value, 0),
    },
  };
}

async function handleClientCompat4(params = {}, _session, msgUid) {
  return {
    tag: 4,
    msgUid,
    data: {
      result: 0,
      value: toSafeInt(params.value, 0),
    },
  };
}

async function handleClientCompat5(params = {}, _session, msgUid) {
  return {
    tag: 5,
    msgUid,
    data: {
      result: 0,
      value: toSafeInt(params.value, 0),
    },
  };
}

async function handleClientCompat6(params = {}, _session, msgUid) {
  return {
    tag: 6,
    msgUid,
    data: {
      result: 0,
      value: toSafeInt(params.value, 0),
    },
  };
}

async function handleBatchUnlockSync(params = {}, session, msgUid) {
  const player = session && session.player;
  if (!player) {
    return {
      tag: 10000,
      msgUid,
      data: { result: -1, rewardedSystem: [], rewards: buildRewardInfo([]) },
    };
  }

  const ids = Array.from(new Set(normalizeIds(params)));
  const info = ensureUnlockInfo(player);
  const unlockedSet = new Set(info.unlockedSystem.map((id) => toSafeInt(id, 0)));
  const rewardedSet = new Set(info.rewardedSystem.map((id) => toSafeInt(id, 0)));
  const systemConfig = configService.get('SystemConfig') || {};
  const newlyRewarded = [];
  const rewardMap = new Map();

  ids.forEach((id) => {
    const row = getCfgRow(systemConfig, id);
    if (!unlockedSet.has(id) || rewardedSet.has(id) || !row) return;

    const rewards = Array.isArray(row.rewards) ? row.rewards : [];
    rewards.forEach((reward) => {
      const itemId = Math.max(0, toSafeInt(reward && reward.id, 0));
      const count = Math.max(0, toSafeInt(reward && reward.count, 0));
      if (itemId <= 0 || count <= 0) return;
      rewardMap.set(itemId, (rewardMap.get(itemId) || 0) + count);
    });

    rewardedSet.add(id);
    newlyRewarded.push(id);
  });

  const rewards = Array.from(rewardMap, ([id, count]) => ({ id, count }));
  rewards.forEach((reward) => addRewardToPlayer(player, reward.id, reward.count));

  if (newlyRewarded.length > 0) {
    info.rewardedSystem = Array.from(rewardedSet).sort((a, b) => a - b);
    if (session.userId) {
      const saved = await playerService.savePlayer(session.userId, player, { returnSaved: false });
      if (saved) session.player = saved;
    }
  }

  const response = {
    tag: 10000,
    msgUid,
    data: {
      result: 0,
      rewardedSystem: newlyRewarded,
      rewards: buildRewardInfo(rewards),
    },
  };
  if (rewards.length <= 0) return response;
  return [
    { tag: 1202, msgUid: 0, data: buildRewardItemSync(player, rewards) },
    response,
  ];
}

async function handleInviteInit11000(_params = {}, session, msgUid) {
  const player = session && session.player;
  const inviteInfo = (player && player.inviteInfo) || {};
  const totalInvite = inviteInfo.totalInvite || { total: 0, daily: 0, reward: 0 };
  const rebateData = inviteInfo.rebateData || { total: 0, claimed: 0 };

  return {
    tag: 11000,
    msgUid,
    data: {
      result: 0,
      totalInvite,
      rebateData,
      first: Boolean(inviteInfo.first),
      dailyReward: Boolean(inviteInfo.dailyReward),
    },
  };
}

async function handleBoxUpgrade2100(params = {}, session, msgUid) {
  const pilot = require('../services/DropLevel46Service');
  if (pilot.applies(session)) return pilot.handle(2100, params, session, msgUid);
  const player = session && session.player;
  if (!player) {
    return {
      tag: 2100,
      msgUid,
      data: { result: -1, level: 1, exp: 0, upgradeFinishTime: 0 },
    };
  }

  const boxInfo = ensureBoxInfo(player);
  const prevLevel = Math.max(1, toSafeInt(boxInfo.level, 1));
  const now = Date.now();
  settleBoxLevelIfFinished(boxInfo, Date.now());

  // Ensure exp is always an integer (DB round-trips may produce strings)
  boxInfo.exp = Math.max(0, toSafeInt(boxInfo.exp, 0));

  const boxCfgMap = configService.get('BoxConfig') || {};
  const curCfg = getCfgRow(boxCfgMap, boxInfo.level);
  const nextCfg = getCfgRow(boxCfgMap, Math.max(1, toSafeInt(boxInfo.level, 1)) + 1);

  // When nextCfg is missing (beyond configured max), generate a fallback config
  // so the player can continue upgrading with scaled costs.
  const effectiveCurCfg = curCfg || {
    levelUpCost: [Math.floor(500 * Math.pow(1.2, boxInfo.level))],
    timeCost: 3,
  };
  const hasNextLevel = !!(nextCfg || boxInfo.level >= 1); // always allow upgrade beyond config

  const levelUpCost = Array.isArray(effectiveCurCfg.levelUpCost) ? effectiveCurCfg.levelUpCost : [];
  const levelUpCostSteps = getBoxLevelUpCostSteps(levelUpCost);
  let silverCost = 0;

  if (hasNextLevel && boxInfo.upgradeFinishTime <= 0) {
    if (boxInfo.exp < levelUpCostSteps.length) {
      const need = Math.max(0, toSafeInt(levelUpCostSteps[boxInfo.exp], 0));
      if (need > 0 && !consumePlayerItem(player, 2, need)) {
        return {
          tag: 2100,
          msgUid,
          data: {
            result: -1,
            level: boxInfo.level,
            exp: boxInfo.exp,
            upgradeFinishTime: getClientBoxEndTimeSec(boxInfo.upgradeFinishTime, now),
          },
        };
      }
      silverCost = need;
      boxInfo.exp += 1;
    }

    if (boxInfo.exp >= levelUpCostSteps.length) {
      boxInfo.upgradeStartTime = now;
      boxInfo.upgradeFinishTime = now + getBoxUpgradeDurationMs(effectiveCurCfg.timeCost, boxInfo.speedUp);
      // If timeCost is 0 or missing, settle the upgrade immediately
      settleBoxLevelIfFinished(boxInfo, now);
    }
  } else if (!hasNextLevel) {
    // Truly at maximum level — inform client clearly
    return {
      tag: 2100,
      msgUid,
      data: { result: -2, level: boxInfo.level, exp: boxInfo.exp, upgradeFinishTime: 0 },
    };
  }

  const taskChanged = !!refreshMainTaskProgress(player);
  scheduleSessionPlayerSave(session, player, '2100');
  const response = {
    tag: 2100,
    msgUid,
    data: {
      result: 0,
      level: boxInfo.level,
      exp: boxInfo.exp,
      upgradeFinishTime: getClientBoxEndTimeSec(boxInfo.upgradeFinishTime, now),
    },
  };

  const packets = [];
  const itemChange = buildItemChangePacket(player, 2, -silverCost);
  if (itemChange) packets.push(itemChange);
  if (Math.max(1, toSafeInt(boxInfo.level, 1)) !== prevLevel) {
    packets.push(buildBoxLevelUpdatePacket(boxInfo, 0, now));
  }
  packets.push(response);
  if (taskChanged) packets.push(...buildTaskUpdatePacketsSafe(player));
  return packets.length === 1 ? response : packets;
}

async function handleBoxUpgradeAssist2103(_params = {}, _session, msgUid) {
  return {
    tag: 2103,
    msgUid,
    data: {
      result: 0,
    },
  };
}

async function handleOldTrekArenaInfo7059(_params = {}, session, msgUid) {
  const player = session && session.player ? session.player : {};
  return {
    tag: 7059,
    msgUid,
    data: {
      result: 0,
      arenaEnemy: null,
      weather: 1,
      arenaScore: Number(player.oldTrekArenaScore || player.arenaScore) || 1000,
      arenaRank: Number(player.oldTrekArenaRank) || 0,
      arenaBattleLogs: [],
      arenaGradeReward: 0,
    },
  };
}

async function handleClientCommand100(params = {}, _session, msgUid) {
  return {
    tag: 100,
    msgUid,
    data: {
      result: 0,
      cmd: params.cmd || '',
    },
  };
}

async function handleGameClubInfo101(_params = {}, _session, msgUid) {
  const dataList = [];
  return {
    tag: 101,
    msgUid,
    data: {
      result: 0,
      dataList,
      data: { dataList },
    },
  };
}

async function handleClientAdResult200(params = {}, _session, msgUid) {
  return {
    tag: 200,
    msgUid,
    data: {
      result: 0,
      type: toSafeInt(params.type, 0),
      adResult: toSafeInt(params.result, 0),
      msg: params.msg || '',
    },
  };
}

async function handlePlayerShow501(params = {}, session, msgUid) {
  const target = await resolveShowTargetPlayer(params, session);
  const player = clonePlayerSnapshot(target);
  ensureRoleAppearance(player);
  const roleInfo = (player && player.roleInfo) || {};
  const dbid = String((player && (player._id || player.playerId)) || (params && (params.dbid || params.playerId)) || '').trim();
  const power = getPlayerPower(player);
  const powerScore = getPlayerPowerScore(player);
  return {
    tag: 501,
    msgUid,
    data: {
      result: 0,
      dbid,
      show: {
        dbid,
        serverId: toSafeInt(process.env.SERVER_ID, 1),
        serverName: process.env.SERVER_NAME || '',
        kungfuId: toSafeInt(roleInfo.kungfuId, 4),
        subJob: toSafeInt(roleInfo.subJob, 0),
        level: Math.max(1, toSafeInt(player && player.level, 1)),
         name: (player && player.name) || '',
         power,
         powerScore,
         powerUnit: 'native-weighted-point',
        stage: Math.max(1, toSafeInt(roleInfo.stage || roleInfo.stageId, 1)),
        petId: getPrimaryBattlePetId(player),
        petSoulId: -1,
        artifactId: 0,
        fate: 0,
        foreverCard: 0,
        equipMap: buildEquippedIdMap(player),
        fashionMap: getPlayerFashionMap(player),
      },
    },
  };
}

async function handleTokenRecharge1230(params = {}, session, msgUid) {
  const fishingShop = require('../services/FishingEventShopService');
  if (!fishingShop.inScope(params.id)) return handleTokenRecharge1230Unlocked(params, session, msgUid);
  return require('../services/PlayerMutationService').run(session?.userId, async () => {
    if (session?.player) session.player = cloneRechargeValue(session.player);
    return handleTokenRecharge1230Unlocked(params, session, msgUid);
  });
}

async function handleTokenRecharge1230Unlocked(params = {}, session, msgUid) {
  const player = session && session.player;
  if (!player) return { tag: 1230, msgUid, data: { result: -1, rewardInfo: buildRewardInfo([]) } };

  const rawPayId = params && params.id;
  const payId = Number(rawPayId);
  const multi = parseMulti(params && params.multi);
  if (!Number.isInteger(payId) || payId <= 0) {
    return { tag: 1230, msgUid, data: { result: -1, id: 0, code: 'INVALID_PAY_ID', rewardInfo: buildRewardInfo([]) } };
  }
  if (multi <= 0) {
    return { tag: 1230, msgUid, data: { result: -1, id: payId, code: 'INVALID_MULTI', rewardInfo: buildRewardInfo([]) } };
  }
  const now = Date.now();
  const stateBefore = captureRechargeState(player);
  const purchasePlan = getRechargePurchasePlan(player, payId, multi, now);
  const { payRow, rewardPlan } = purchasePlan;
  if (!payRow || !rewardPlan || !rewardPlan.ok) {
    const reason = rewardPlan && rewardPlan.reason ? rewardPlan.reason : 'RECHARGE_CONFIG_MISSING';
    logger.warn(`[Recharge1230] rejected payId=${payId} multi=${multi} reason=${reason} user=${session && session.userId ? session.userId : 'unknown'}`);
    return { tag: 1230, msgUid, data: { result: -1, id: payId, code: reason, rewardInfo: buildRewardInfo([]) } };
  }
  await applyConfiguredRechargeArea(player);
  const activity9Product = isActivity9PayId(payId);
  const activationPassProduct = isActivationPassPayId(payId);
  if (activationPassProduct && multi !== 1) {
    restoreRechargeState(player, stateBefore);
    return { tag: 1230, msgUid, data: { result: -1, id: payId, code: 'INVALID_MULTI' } };
  }
  if (activationPassProduct) {
    const activationPassState = ensureActivationPassState(player, { payId, now });
    if (!activationPassState || !activationPassState.row) {
      restoreRechargeState(player, stateBefore);
      return { tag: 1230, msgUid, data: { result: -1, id: payId, code: 'ACTIVATION_PASS_UNAVAILABLE' } };
    }
    if (hasActivationPassEntitlement(player, payId, now)) {
      restoreRechargeState(player, stateBefore);
      return { tag: 1230, msgUid, data: { result: -1, id: payId, code: 'ALREADY_ACTIVE' } };
    }
  }
  if (activity9Product && multi !== 1) {
    restoreRechargeState(player, stateBefore);
    return { tag: 1230, msgUid, data: { result: -1, id: payId, code: 'INVALID_MULTI' } };
  }
  if (activity9Product) {
    const activity9State = ensureActivity9State(player, { payId, now });
    if (!activity9State || !activity9State.row || !isActivity9WindowOpen(activity9State.row, now)) {
      restoreRechargeState(player, stateBefore);
      return { tag: 1230, msgUid, data: { result: -1, id: payId } };
    }
    if (hasActivity9Purchase(player, payId)) {
      const activation = activateActivity9ForPayId(player, payId, now);
      try {
        await saveSessionPlayer(session, player);
      } catch (error) {
        restoreRechargeState(player, stateBefore);
        throw error;
      }
      return [
        buildActivity9UpdatePacket(activation || activity9State),
        { tag: 1230, msgUid, data: { result: 0, id: payId, expireTime: 0 } },
      ].filter(Boolean);
    }
  }
  const tokenCost = pickTokenChargeOption(player, payRow || {});
  if (!tokenCost || tokenCost.itemId <= 0 || tokenCost.count <= 0) {
    restoreRechargeState(player, stateBefore);
    return { tag: 1230, msgUid, data: { result: -1, id: payId, code: 'TOKEN_COST_MISSING', rewardInfo: buildRewardInfo([]) } };
  }
  const totalTokenCost = tokenCost.count * multi;
  if (getPlayerItemCount(player, tokenCost.itemId) < totalTokenCost) {
    restoreRechargeState(player, stateBefore);
    return { tag: 1230, msgUid, data: { result: -1, id: payId, code: 'NOT_ENOUGH_TOKEN', rewardInfo: buildRewardInfo([]) } };
  }
  if (!consumePlayerItem(player, tokenCost.itemId, totalTokenCost)) {
    restoreRechargeState(player, stateBefore);
    return { tag: 1230, msgUid, data: { result: -1, id: payId, code: 'NOT_ENOUGH_TOKEN', rewardInfo: buildRewardInfo([]) } };
  }

  const normalResult = addRewardRowsToPlayer(player, rewardPlan.rows, 1);
  const bonusResult = rewardPlan.doubleRows && rewardPlan.doubleRows.length > 0
    ? addRewardRowsToPlayer(player, rewardPlan.doubleRows, 1) : null;
  const rewardInfo = mergeRewardInfo(normalResult.rewardInfo, bonusResult && bonusResult.rewardInfo);
  const allRewardItems = [
    ...(Array.isArray(normalResult.itemDeltas) ? normalResult.itemDeltas : []),
    ...(bonusResult && Array.isArray(bonusResult.itemDeltas) ? bonusResult.itemDeltas : []),
  ];
  const changed = buildRechargeChangedRows([
    { id: tokenCost.itemId, count: getPlayerItemCount(player, tokenCost.itemId) },
    ...(normalResult.changed || []),
    ...((bonusResult && bonusResult.changed) || []),
  ]);

  player.rechargeInfo = player.rechargeInfo && typeof player.rechargeInfo === 'object' ? player.rechargeInfo : {};
  player.rechargeInfo.records = Array.isArray(player.rechargeInfo.records) ? player.rechargeInfo.records : [];
  const benefits = applyRechargeBenefits(player, { payId, productId: payId, multi, now });
  applyPeriodPurchaseLedger(player, rewardPlan, now);
  const monthCardPackets = buildMonthCardUpdatePackets(benefits.monthCardUpdates);
  const activity9Packet = buildActivity9UpdatePacket(benefits.activity9Update);
  const activationPassPacket = buildActivationPassUpdatePacket(benefits.activationPassUpdate);
  syncCurrencyItems(player);

  try {
    if (rewardPlan.fishingShop) await require('../services/FishingIntegrityService').save(session);
    else await saveSessionPlayer(session, player);
  } catch (error) {
    restoreRechargeState(player, stateBefore);
    session.player = null;
    throw error;
  }
  const packRows = player.shopInfo && Array.isArray(player.shopInfo.pack) ? player.shopInfo.pack : [];
  const pack = packRows.find((row) => toSafeInt(row && row.id, 0) === payId);
  const expireTime = Math.max(0, toSafeInt(pack && pack.expireTime, 0));
  return [
    {
      tag: 1202,
      msgUid: 0,
      data: {
        result: 0,
        items: mergeItemDeltas([
          { id: tokenCost.itemId, count: -totalTokenCost },
          ...allRewardItems,
        ]),
        changed,
      },
    },
    ...buildRechargeNativePackets(player, rewardInfo),
    ...(benefits.oldTrekPassUpdate ? [{ tag: 7000, msgUid: 0, data: benefits.oldTrekPassUpdate.oldTrekInfo },
      { tag: 1210, msgUid: 0, data: { result: 0, payid: payId, rewardInfo: buildRewardInfo([]) } }] : []),
    ...monthCardPackets,
    activity9Packet,
    activationPassPacket,
    ...(rewardPlan.fishingShop ? require('../services/FishingEventShopService').activityPackets(player) : []),
    {
      tag: 1230,
      msgUid,
      data: {
        result: 0,
        id: payId,
        expireTime,
        ...(activity9Product || activationPassProduct ? {} : { rewardInfo }),
      },
    },
  ].filter(Boolean);
}

async function handleOpenBoxSpeedUp2002(params = {}, session, msgUid) {
  const player = session && session.player;
  if (!player) return { tag: 2002, msgUid, data: { result: -1, speedUp: 0 } };

  const boxInfo = ensureBoxInfo(player);
  boxInfo.speedUp = !!params.speedUp;
  scheduleSessionPlayerSave(session, player, '2002');
  const wsServer = runtimeBus.getWsServer();
  if (wsServer && typeof wsServer.broadcastExceptUser === 'function') {
    wsServer.broadcastExceptUser(session.userId, 2160, {
      id: String(player.playerId || session.userId || ''),
      speedUp: boxInfo.speedUp,
    });
  }
  return {
    tag: 2002,
    msgUid,
    data: {
      result: 0,
      speedUp: boxInfo.speedUp ? 1 : 0,
    },
  };
}

async function handleBoxUpgradeSkip2101(params = {}, session, msgUid) {
  const pilot = require('../services/DropLevel46Service');
  if (pilot.applies(session)) return pilot.handle(2101, params, session, msgUid);
  const player = session && session.player;
  if (!player) return { tag: 2101, msgUid, data: { result: -1, upgradeFinishTime: 0 } };

  const boxInfo = ensureBoxInfo(player);
  const now = Date.now();
  settleBoxLevelIfFinished(boxInfo, Date.now());
  const boxCfgMap = configService.get('BoxConfig') || {};
  const curCfg = getCfgRow(boxCfgMap, boxInfo.level) || {};
  const cooldownDurationMs = getActiveBoxCooldownDurationMs(
    boxInfo,
    'upgradeFinishTime',
    'upgradeStartTime',
    getBoxUpgradeDurationMs(curCfg.timeCost, boxInfo.speedUp),
  );
  const count = Math.max(0, toSafeInt(params.count, 0));
  let goldCost = 0;
  if (count > 0) {
    const effectiveCount = Math.min(
      count,
      getAvailableBoxCooldownSkipCount(boxInfo, 'upgradeFinishTime', 'upgradeStartTime', cooldownDurationMs),
    );
    if (effectiveCount <= 0 || !consumePlayerItem(player, 6, effectiveCount)) {
      return {
        tag: 2101,
        msgUid,
        data: {
          result: -1,
            upgradeFinishTime: getClientBoxEndTimeSec(boxInfo.upgradeFinishTime, now),
        },
      };
    }
    goldCost = applyBoxCooldownSkip(boxInfo, 'upgradeFinishTime', 'upgradeStartTime', cooldownDurationMs, effectiveCount);
  }
  settleBoxLevelIfFinished(boxInfo, Date.now());
  const taskChanged = !!refreshMainTaskProgress(player);
  scheduleSessionPlayerSave(session, player, '2101');
  const update = {
    tag: 2100,
    msgUid: 0,
    data: {
      level: boxInfo.level,
      exp: boxInfo.exp,
      upgradeFinishTime: getClientBoxEndTimeSec(boxInfo.upgradeFinishTime, now),
    },
  };
  const response = {
    tag: 2101,
    msgUid,
    data: {
      result: 0,
      upgradeFinishTime: getClientBoxEndTimeSec(boxInfo.upgradeFinishTime, now),
    },
  };
  const packets = [];
  const itemChange = buildItemChangePacket(player, 6, -goldCost);
  if (itemChange) packets.push(itemChange);
  packets.push(update);
  if (taskChanged) packets.push(...buildTaskUpdatePacketsSafe(player));
  packets.push(response);
  return packets;
}

async function handleBoxUpgradeCheck2102(_params = {}, session, msgUid) {
  const pilot = require('../services/DropLevel46Service');
  if (pilot.applies(session)) return pilot.handle(2102, _params, session, msgUid);
  const player = session && session.player;
  if (!player) return { tag: 2102, msgUid, data: { result: -1, level: 1, exp: 0, upgradeFinishTime: 0 } };

  const boxInfo = ensureBoxInfo(player);
  const now = Date.now();
  settleBoxLevelIfFinished(boxInfo, now);

  const taskChanged = !!refreshMainTaskProgress(player);
  await saveSessionPlayer(session, player);
  const response = {
    tag: 2102,
    msgUid,
    data: {
      result: 0,
      level: boxInfo.level,
      exp: boxInfo.exp,
      upgradeFinishTime: getClientBoxEndTimeSec(boxInfo.upgradeFinishTime, now),
    },
  };
  return taskChanged ? [...buildTaskUpdatePacketsSafe(player), response] : response;
}

async function handleBoxTierUp2150(_params = {}, session, msgUid) {
  if (!session?._dropTierDraft) return dropTierMutation.run(2150, _params, session, msgUid, handleBoxTierUp2150);
  if (!session?._dropTierDraft && session?.userId && !playerMutation.holds(session.userId)) {
    return playerMutation.run(session.userId, () => handleBoxTierUp2150(_params, session, msgUid));
  }
  const player = session && session.player;
  if (!player) return { tag: 2150, msgUid, data: { result: -1, tier: 1, tierExp: 0, tierUpTime: 0 } };

  // Players may remain online across the rollout. Reconcile the durable
  // Yêu Vương frontier before checking the current tier tasks so a completed
  // boss is accepted without requiring a relog or a second clear.
  require('./dungeon').ensureDungeonRaidInfo(player);
  const boxInfo = ensureBoxInfo(player);
  const prevTier = Math.max(1, toSafeInt(boxInfo.tier, 1));
  const now = Date.now();
  settleBoxTierIfFinished(boxInfo, Date.now());
  const cfgMap = configService.get('BoxTierConfig') || {};
  settleBoxTierProgressIfReady(boxInfo, cfgMap, now);
  const curCfg = getCfgRow(cfgMap, boxInfo.tier);
  const nextCfg = getCfgRow(cfgMap, Math.max(1, toSafeInt(boxInfo.tier, 1)) + 1);
  const tierUpCost = Array.isArray(curCfg && curCfg.tierUpCost) ? curCfg.tierUpCost : [];
  const beforeTierExp = Math.max(0, toSafeInt(boxInfo.tierExp, 0));
  const beforeTierUpTime = Math.max(0, toSafeInt(boxInfo.tierUpTime, 0));
  let diamondCost = 0;

  if (curCfg && nextCfg && boxInfo.tierUpTime <= 0) {
    if (boxInfo.tierExp < tierUpCost.length) {
      const taskId = getFirstUnfinishedTaskId(player, curCfg.task);
      if (taskId > 0) {
        return {
          tag: 2150,
          msgUid,
        data: {
          result: -2,
          taskId,
          tier: boxInfo.tier,
          tierExp: boxInfo.tierExp,
          tierUpTime: getClientBoxEndTimeSec(boxInfo.tierUpTime, now),
        },
      };
    }

      const need = Math.max(0, toSafeInt(tierUpCost[boxInfo.tierExp], 0));
      if (need > 0 && !consumePlayerItem(player, 1, need)) {
        return {
          tag: 2150,
          msgUid,
        data: {
          result: -1,
          tier: boxInfo.tier,
          tierExp: boxInfo.tierExp,
          tierUpTime: getClientBoxEndTimeSec(boxInfo.tierUpTime, now),
        },
      };
    }
      diamondCost = need;
      boxInfo.tierExp += 1;
    }
    if (boxInfo.tierExp >= tierUpCost.length) {
      boxInfo.tierUpStartTime = now;
      boxInfo.tierUpTime = now + getBoxUpgradeDurationMs(curCfg.timeCost, boxInfo.speedUp);
      settleBoxTierIfFinished(boxInfo, now);
    }
  }

  refreshMainTaskProgress(player);
  await saveSessionPlayer(session, player);

  const response = {
    tag: 2150,
    msgUid,
    data: {
      result: 0,
      tier: boxInfo.tier,
      tierExp: boxInfo.tierExp,
      tierUpTime: getClientBoxEndTimeSec(boxInfo.tierUpTime, now),
    },
  };
  if (Math.max(1, toSafeInt(boxInfo.tier, 1)) !== prevTier) {
    return [buildItemChangePacket(player, 1, -diamondCost), buildBoxTierUpdatePacket(boxInfo, 0, now), response].filter(Boolean);
  }
  if (diamondCost > 0 || beforeTierExp !== boxInfo.tierExp || beforeTierUpTime !== boxInfo.tierUpTime) {
    return [buildItemChangePacket(player, 1, -diamondCost), buildBoxTierUpdatePacket(boxInfo, 0, now), response].filter(Boolean);
  }
  return response;
}

async function handleBoxTierSpeedUp2151(params = {}, session, msgUid) {
  if (!session?._dropTierDraft) return dropTierMutation.run(2151, params, session, msgUid, handleBoxTierSpeedUp2151);
  if (!session?._dropTierDraft && session?.userId && !playerMutation.holds(session.userId)) {
    return playerMutation.run(session.userId, () => handleBoxTierSpeedUp2151(params, session, msgUid));
  }
  const player = session && session.player;
  if (!player) return { tag: 2151, msgUid, data: { result: -1, tierUpTime: 0 } };

  const boxInfo = ensureBoxInfo(player);
  const prevTier = Math.max(1, toSafeInt(boxInfo.tier, 1));
  const now = Date.now();
  settleBoxTierIfFinished(boxInfo, now);
  const cfgMap = configService.get('BoxTierConfig') || {};
  settleBoxTierProgressIfReady(boxInfo, cfgMap, now);
  const curCfg = getCfgRow(cfgMap, boxInfo.tier) || {};
  const cooldownDurationMs = getActiveBoxCooldownDurationMs(
    boxInfo,
    'tierUpTime',
    'tierUpStartTime',
    getBoxUpgradeDurationMs(curCfg.timeCost, boxInfo.speedUp),
  );
  const count = Math.max(0, toSafeInt(params.count, 0));
  let goldCost = 0;
  if (count > 0) {
    const effectiveCount = Math.min(
      count,
      getAvailableBoxCooldownSkipCount(boxInfo, 'tierUpTime', 'tierUpStartTime', cooldownDurationMs),
    );
    if (effectiveCount <= 0 || !consumePlayerItem(player, 6, effectiveCount)) {
      return {
        tag: 2151,
        msgUid,
        data: {
          result: -1,
          tierUpTime: getClientBoxEndTimeSec(boxInfo.tierUpTime, now),
        },
      };
    }
    goldCost = applyBoxCooldownSkip(boxInfo, 'tierUpTime', 'tierUpStartTime', cooldownDurationMs, effectiveCount);
  }
  settleBoxTierIfFinished(boxInfo, Date.now());
  settleBoxTierProgressIfReady(boxInfo, cfgMap, Date.now());

  refreshMainTaskProgress(player);
  await saveSessionPlayer(session, player);

  const response = {
    tag: 2151,
    msgUid,
    data: {
      result: 0,
      tierUpTime: getClientBoxEndTimeSec(boxInfo.tierUpTime, now),
    },
  };
  const itemChange = buildItemChangePacket(player, 6, -goldCost);
  if (Math.max(1, toSafeInt(boxInfo.tier, 1)) !== prevTier) {
    return [itemChange, buildBoxTierUpdatePacket(boxInfo, 0, now), response].filter(Boolean);
  }
  return itemChange ? [itemChange, response] : response;
}

async function handleBoxTierCheck2152(_params = {}, session, msgUid) {
  if (!session?._dropTierDraft) return dropTierMutation.run(2152, _params, session, msgUid, handleBoxTierCheck2152);
  if (!session?._dropTierDraft && session?.userId && !playerMutation.holds(session.userId)) {
    return playerMutation.run(session.userId, () => handleBoxTierCheck2152(_params, session, msgUid));
  }
  const player = session && session.player;
  if (!player) return { tag: 2152, msgUid, data: { result: -1, tier: 1, tierExp: 0, tierUpTime: 0 } };

  const boxInfo = ensureBoxInfo(player);
  const now = Date.now();
  settleBoxTierIfFinished(boxInfo, now);
  settleBoxTierProgressIfReady(boxInfo, configService.get('BoxTierConfig') || {}, now);
  refreshMainTaskProgress(player);
  await saveSessionPlayer(session, player);

  return {
    tag: 2152,
    msgUid,
    data: {
      result: 0,
      tier: boxInfo.tier,
      tierExp: boxInfo.tierExp,
      tierUpTime: getClientBoxEndTimeSec(boxInfo.tierUpTime, now),
    },
  };
}

module.exports = {
  handleClientCompat2,
  handleClientCompat3,
  handleClientCompat4,
  handleClientCompat5,
  handleClientCompat6,
  handleClientTelemetry,
  handleClientAck22,
  handleClientCommand100,
  handleGameClubInfo101,
  handleClientAdResult200,
  handlePlayerShow501,
  handleTokenRecharge1230,
  handleBatchUnlockSync,
  handleInviteInit11000,
  handleOpenBoxSpeedUp2002,
  handleBoxUpgrade2100,
  handleBoxUpgradeSkip2101,
  handleBoxUpgradeCheck2102,
  handleBoxUpgradeAssist2103,
  handleBoxTierUp2150,
  handleBoxTierSpeedUp2151,
  handleBoxTierCheck2152,
  handleOldTrekArenaInfo7059,
};

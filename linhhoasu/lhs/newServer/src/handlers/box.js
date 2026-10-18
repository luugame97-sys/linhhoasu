/**
 * Box handlers
 * tag:2000 open box, 2001 claim box reward, 2003 summon boss
 */

const playerService = require('../services/PlayerService');
const configService = require('../services/ConfigService');
const battle = require('../services/BattleService');
const arenaReadModel = require('../services/ArenaReadModelService');
const {
  ensureEquipInfo,
  addOpenEquip,
  replaceOpenEquipToPlan,
  saleOpenEquips,
  isEquipTemplateItem,
  createEquipFromTemplateId,
} = require('../services/EquipService');
const { addRewardToPlayer } = require('./raid');
const {
  addBagelConsume: addMainTaskBagelConsume,
  addEliteMonsterKillCount,
} = require('../services/MainTaskProgressService');
const { addBagelConsume: addRealmBagelConsume } = require('../services/RealmTaskProgressService');
const { getPrimaryBattlePetId, applyPrimaryBattlePetParts } = require('../services/RoleAppearanceService');
const logger = require('../logger');
const runtimeBus = require('../services/RuntimeBus');
const mapMonsterService = require('../services/MapMonsterService');
const alchemyMaterials = require('../services/AlchemyMaterialDropService');
const { buildRewardItemSync } = require('../services/RewardSync');

const DEFAULT_PLAYER_SKILL_ID = 1002;
const DEFAULT_PLAYER_BEHAVIOR_ID = 10020;
const DEFAULT_MONSTER_SKILL_ID = 9009;
const DEFAULT_MONSTER_BEHAVIOR_ID = 90090;

function buildTaskUpdatePacketsSafe(player, msgUid = 0) {
  try {
    // eslint-disable-next-line global-require
    const task = require('./task');
    if (task && typeof task.buildActiveTaskUpdatePackets === 'function') {
      return task.buildActiveTaskUpdatePackets(player, msgUid, { includeAllTypes: true });
    }
  } catch (_err) {}
  return [];
}

function toSafeInt(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.floor(num);
}

let _equipIndexCache = {
  assetsRef: null,
  byQuality: new Map(),
  byQualitySubType: new Map(),
  sortedQualities: [],
};

function getBoxConfig() {
  return configService.get('BoxConfig') || {};
}

function getAssetsConfig() {
  return configService.get('AssetsConfig') || {};
}

function getBoxConfigByLevel(level) {
  const cfg = getBoxConfig();
  return cfg[level] || cfg[String(level)] || {};
}

function getAssetRow(itemId, assetsCfg = null) {
  const id = toSafeInt(itemId, 0);
  if (id <= 0) return null;
  const assets = assetsCfg || getAssetsConfig();
  return assets[id] || assets[String(id)] || null;
}

function rebuildEquipIndexIfNeeded(assetsCfg) {
  if (_equipIndexCache.assetsRef === assetsCfg) {
    return _equipIndexCache;
  }

  const byQuality = new Map();
  const byQualitySubType = new Map();

  Object.keys(assetsCfg || {}).forEach((key) => {
    const id = toSafeInt(key, 0);
    if (id < 30000 || id >= 100000) return;

    const row = assetsCfg[key];
    if (!row || toSafeInt(row.type, 0) !== 3) return;

    const quality = Math.max(1, toSafeInt(row.quality, Math.floor((id - 30000) / 1000)));
    const subType = Math.max(1, Math.min(12, toSafeInt(row.subType, id % 100 || 1)));

    if (!byQuality.has(quality)) {
      byQuality.set(quality, []);
    }
    byQuality.get(quality).push(id);

    const qstKey = `${quality}:${subType}`;
    if (!byQualitySubType.has(qstKey)) {
      byQualitySubType.set(qstKey, id);
    }
  });

  byQuality.forEach((list) => list.sort((a, b) => a - b));

  _equipIndexCache = {
    assetsRef: assetsCfg,
    byQuality,
    byQualitySubType,
    sortedQualities: Array.from(byQuality.keys()).sort((a, b) => a - b),
  };
  return _equipIndexCache;
}

function pickWeightedIndex(weights = []) {
  let total = 0;
  let lastPositive = -1;
  for (let i = 0; i < weights.length; i += 1) {
    const w = Math.max(0, toSafeInt(weights[i], 0));
    if (w <= 0) continue;
    total += w;
    lastPositive = i;
  }
  if (total <= 0) return -1;

  let roll = Math.random() * total;
  for (let i = 0; i < weights.length; i += 1) {
    const w = Math.max(0, toSafeInt(weights[i], 0));
    if (w <= 0) continue;
    roll -= w;
    if (roll < 0) return i;
  }
  return lastPositive;
}

function rollEquipQuality(boxCfg, qualityFloor = 1) {
  const weights = Array.isArray(boxCfg && boxCfg.equipQualityWeight) ? boxCfg.equipQualityWeight : [];
  const pickedIndex = pickWeightedIndex(weights);

  let quality = pickedIndex >= 0 ? pickedIndex + 1 : 0;
  if (quality <= 0) {
    quality = Math.max(1, toSafeInt(boxCfg && boxCfg.mapBossDropQuality, 2));
  }
  return Math.max(Math.max(1, toSafeInt(qualityFloor, 1)), quality);
}

function rollEquipSubType() {
  return 1 + Math.floor(Math.random() * 12);
}

function pickFallbackTemplateId(equipIndex, quality, subType) {
  const exact = equipIndex.byQualitySubType.get(`${quality}:${subType}`);
  if (exact) return exact;

  const sameQuality = equipIndex.byQuality.get(quality);
  if (sameQuality && sameQuality.length > 0) {
    const idx = Math.floor(Math.random() * sameQuality.length);
    return sameQuality[idx];
  }

  if (equipIndex.sortedQualities.length <= 0) {
    return 32101;
  }

  let nearest = equipIndex.sortedQualities[0];
  let bestDiff = Math.abs(nearest - quality);
  for (const q of equipIndex.sortedQualities) {
    const diff = Math.abs(q - quality);
    if (diff < bestDiff) {
      bestDiff = diff;
      nearest = q;
    }
  }
  const nearestList = equipIndex.byQuality.get(nearest) || [];
  if (nearestList.length <= 0) return 32101;
  return nearestList[Math.floor(Math.random() * nearestList.length)];
}

function buildEquipTemplateId(quality, subType, assetsCfg) {
  const q = Math.max(1, toSafeInt(quality, 1));
  const st = Math.max(1, Math.min(12, toSafeInt(subType, 1)));
  const generated = configService.get('DropEquipTemplateConfig') || {};
  const generatedId = generated[q] && (generated[q][st] || generated[q][String(st)]);
  const dropExtension = configService.get('DropLevelExtensionConfig') || {};
  if (q >= 46 && q <= Math.max(46, toSafeInt(dropExtension.maxLevel, 0))) {
    const generatedRow = getAssetRow(generatedId, assetsCfg);
    if (!generatedRow || generatedRow.type !== 3 || generatedRow.quality !== q || generatedRow.subType !== st) {
      throw new Error('DROP_EXTENSION_TEMPLATE_INVALID:' + q + ':' + st);
    }
    return toSafeInt(generatedId, 0);
  }
  const directId = 30000 + q * 1000 + 100 + st;
  const row = getAssetRow(directId, assetsCfg);
  if (row && toSafeInt(row.type, 0) === 3) {
    return directId;
  }

  const equipIndex = rebuildEquipIndexIfNeeded(assetsCfg);
  return pickFallbackTemplateId(equipIndex, q, st);
}

function getManagedBotPremiumQuality() {
  const assetsCfg = getAssetsConfig();
  const equipIndex = rebuildEquipIndexIfNeeded(assetsCfg);
  const availableMax = equipIndex.sortedQualities.length > 0
    ? equipIndex.sortedQualities[equipIndex.sortedQualities.length - 1]
    : 6;
  const configured = Math.max(1, toSafeInt(process.env.BOT_WORKER_PREMIUM_DROP_QUALITY, 44));
  return Math.min(availableMax, configured);
}

function getManagedBotPremiumShowItemId() {
  const configured = Math.max(0, toSafeInt(process.env.BOT_WORKER_PREMIUM_SHOW_ITEM_ID, 175));
  return getAssetRow(configured) ? configured : 0;
}

function ensureManagedBotFarmReserve(player = {}, session = {}) {
  if (!session || session._isBot !== true) return false;
  if (!player.items || typeof player.items !== 'object' || Array.isArray(player.items)) player.items = {};
  const refillAt = Math.max(100, toSafeInt(process.env.BOT_WORKER_FARM_REFILL_AT, 1000));
  const reserve = Math.max(refillAt, toSafeInt(process.env.BOT_WORKER_FARM_RESERVE, 100000));
  const current = Math.max(0, toSafeInt(player.items[4], 0));
  if (current >= refillAt) return false;
  player.items[4] = reserve;
  return true;
}

function persistBoxRewardCheckpoint(session = {}, player = {}) {
  if (!session.userId || !player) return false;
  if (session._isBot !== true) {
    playerService.savePlayerDeferred(session.userId, player).catch((err) => {
      logger.warn(`[Box] async reward save failed user=${session.userId}: ${err.message}`);
    });
    return true;
  }

  const now = Date.now();
  const checkpointMs = Math.max(5000, toSafeInt(process.env.BOT_WORKER_SAVE_CHECKPOINT_MS, 30000));
  if (Math.max(0, toSafeInt(session._managedBotNextCheckpointAt, 0)) > now) return false;
  session._managedBotNextCheckpointAt = now + checkpointMs;
  playerService.savePlayerDeferred(session.userId, player).catch((err) => {
    logger.warn(`[Box] async managed-bot checkpoint failed user=${session.userId}: ${err.message}`);
  });
  return true;
}

function getNormalMapMonsterContext(params = {}, session = {}) {
  // Legacy/internal callers that do not have a map context keep the historical
  // box contract.  Real WebSocket sessions always establish _mapId through
  // tag=1400, so all production map claims go through this validation path.
  const currentMapId = Math.max(0, toSafeInt(session && session._mapId, 0));
  if (currentMapId <= 0) return null;

  const mapConfig = configService.get('MapConfig') || {};
  const mapRow = mapConfig[currentMapId] || mapConfig[String(currentMapId)] || null;
  if (!mapRow || toSafeInt(mapRow.type, 0) !== 1) {
    return {
      valid: false,
      reason: 'map_not_claimable',
      mapId: currentMapId,
      line: Math.max(0, toSafeInt(session && session._mapLine, 0)),
      index: toSafeInt(params && params.index, -1),
      slot: null,
    };
  }

  const index = toSafeInt(params && params.index, -1);
  const slot = mapMonsterService.getSlot(currentMapId, index);
  const line = Math.max(0, toSafeInt(session && session._mapLine, 0));
  if (!slot) {
    return { valid: false, reason: 'invalid_target', mapId: currentMapId, line, index, slot: null };
  }

  // The browser animates/pathfinds locally and can send tag=2000 before its
  // fire-and-forget 1402 update reaches this socket queue. Enforcing distance
  // for humans therefore rejects legitimate native auto-delegate attempts.
  // Managed workers explicitly send 1402 first, so apply the distance guard to
  // them without changing the official client contract.
  if (session && session._isBot === true) {
    const position = session._mapPos && typeof session._mapPos === 'object' ? session._mapPos : null;
    const px = Number(position && position.x);
    const py = Number(position && position.y);
    const maxDistanceRaw = Number(process.env.MAP_MONSTER_MAX_DISTANCE || 320);
    const maxDistance = Number.isFinite(maxDistanceRaw) ? Math.max(220, Math.floor(maxDistanceRaw)) : 320;
    if (!Number.isFinite(px) || !Number.isFinite(py)) {
      return { valid: false, reason: 'position_required', mapId: currentMapId, line, index, slot, distance: null, maxDistance };
    }
    const distance = Math.sqrt(((px - slot.x) ** 2) + ((py - slot.y) ** 2));
    if (distance > maxDistance) {
      return { valid: false, reason: 'too_far', mapId: currentMapId, line, index, slot, distance: Math.floor(distance), maxDistance };
    }
    return { valid: true, reason: '', mapId: currentMapId, line, index, slot, distance: Math.floor(distance), maxDistance };
  }

  return { valid: true, reason: '', mapId: currentMapId, line, index, slot, distance: null, maxDistance: null };
}

function getMapClaimOwnerId(session = {}) {
  const userId = String(session && session.userId || '').trim();
  const wsId = Math.max(0, toSafeInt(session && session.wsId, 0));
  return `${userId}#ws${wsId}`;
}

function buildOpenDeniedInfo(player = {}, reason = 'busy', extra = {}) {
  return {
    seed: Date.now(),
    count: 0,
    lv: Math.max(1, toSafeInt(player && player.level, 1)),
    items: [],
    result: -1,
    reason: String(reason || 'unavailable'),
    ...extra,
  };
}

function buildOpenResponse(msgUid, player, info) {
  return {
    tag: 2000,
    msgUid,
    data: info || buildOpenDeniedInfo(player),
  };
}

function getAttrValue(attrs, attrId, aliases = [], fallback = 0) {
  if (!attrs || typeof attrs !== 'object') return fallback;
  if (attrs[attrId] != null) return toSafeInt(attrs[attrId], fallback);
  const keys = Array.isArray(aliases) ? aliases : [aliases];
  for (const key of keys) {
    if (key && attrs[key] != null) return toSafeInt(attrs[key], fallback);
  }
  return fallback;
}

function getConfigRow(map, id) {
  if (!map || id == null) return null;
  return map[id] || map[String(id)] || null;
}

function resolveBattleActionIds(skillId, fallbackSkillId, fallbackBehaviorId) {
  const skillCfgMap = configService.get('SkillConfig') || {};
  const behaviorCfgMap = configService.get('SkillBehaviorConfig') || {};
  const safeFallbackSkillId = Math.max(1, toSafeInt(fallbackSkillId, DEFAULT_PLAYER_SKILL_ID));
  const safeFallbackBehaviorId = Math.max(1, toSafeInt(fallbackBehaviorId, DEFAULT_PLAYER_BEHAVIOR_ID));
  const preferredSkillCfg = getConfigRow(skillCfgMap, skillId);
  const fallbackSkillCfg = getConfigRow(skillCfgMap, safeFallbackSkillId);
  const skillCfg = preferredSkillCfg || fallbackSkillCfg;
  const resolvedSkillId = Math.max(1, toSafeInt(skillCfg && skillCfg.id, toSafeInt(skillId, safeFallbackSkillId) || safeFallbackSkillId));
  const actionIds = Array.isArray(skillCfg && skillCfg.actions) ? skillCfg.actions : [];
  let behaviorId = actionIds.map((id) => Math.max(0, toSafeInt(id, 0))).find((id) => id > 0) || 0;
  if (behaviorId <= 0 && getConfigRow(behaviorCfgMap, resolvedSkillId)) {
    behaviorId = resolvedSkillId;
  }
  if (behaviorId <= 0) {
    behaviorId = safeFallbackBehaviorId;
  }
  return { skillId: resolvedSkillId, behaviorId };
}

function buildFightVars(hpValue = 0) {
  const hp = Math.max(0, toSafeInt(hpValue, 0));
  return { 1: hp, 2: 0, 3: 0, '-1': hp };
}

function buildDamageAction(casterPos, targetPos, damage, targetHpAfterHit) {
  const safeDamage = Math.max(0, toSafeInt(damage, 0));
  if (safeDamage <= 0) return null;
  const action = {
    typ: 3,
    i: 0,
    c: casterPos,
    t: targetPos,
    as: [0],
    vs: { 1: -safeDamage },
  };
  if (Math.max(0, toSafeInt(targetHpAfterHit, 0)) <= 0) {
    action.es = [[{ typ: 6, i: 0, c: casterPos, t: targetPos }]];
  }
  return action;
}

function buildSkillEvent(skillId, behaviorId, casterPos, targetPos, damage, targetHpAfterHit) {
  const damageAction = buildDamageAction(casterPos, targetPos, damage, targetHpAfterHit);
  if (!damageAction) return null;
  return {
    typ: 1,
    i: Math.max(1, toSafeInt(skillId, DEFAULT_PLAYER_SKILL_ID)),
    c: casterPos,
    t: 0,
    as: [0],
    es: [[{
      typ: 2,
      i: Math.max(1, toSafeInt(behaviorId, DEFAULT_PLAYER_BEHAVIOR_ID)),
      c: casterPos,
      t: 0,
      es: [[damageAction]],
    }]],
  };
}

function resolveSummonBossVisualId(boxCfg = {}) {
  const activityBaseCfg = configService.get('ActivityBaseConfig') || {};
  const activityMapId = Math.max(0, toSafeInt(activityBaseCfg.mapId, 0));
  const activityBossShow = Math.max(0, toSafeInt(activityBaseCfg.bossShow, 0));
  const boxMapId = Math.max(0, toSafeInt(boxCfg && boxCfg.mapId, 0));
  if (activityMapId > 0 && boxMapId === activityMapId && activityBossShow > 0) return activityBossShow;
  return Math.max(1, toSafeInt(boxCfg && boxCfg.mapBossShow, 201));
}

function buildSummonBossPlayerShowInfo(player = {}, power = 0) {
  const roleInfo = player && player.roleInfo && typeof player.roleInfo === 'object' ? player.roleInfo : {};
  const playerId = String(player.playerId || player.userId || 'boss_self');
  return {
    dbid: playerId,
    serverId: Number(process.env.SERVER_ID || 1),
    serverName: process.env.SERVER_NAME || '',
    kungfuId: Math.max(1, toSafeInt(roleInfo.kungfuId, 4)),
    subJob: Math.max(0, toSafeInt(roleInfo.subJob, 0)),
    level: Math.max(1, toSafeInt(player.level, 1)),
    name: String(player.name || 'Player'),
    power: Math.max(0, toSafeInt(power, 0)),
    stage: Math.max(1, toSafeInt(roleInfo.stage, toSafeInt(roleInfo.stageId, 1))),
    avatar: Math.max(0, toSafeInt(player.avatar, toSafeInt(roleInfo.avatar, 0))),
    avatarUrl: player.avatarUrl ? String(player.avatarUrl) : '',
    avatarFrame: Math.max(0, toSafeInt(player.avatarFrame, toSafeInt(roleInfo.avatarFrame, 0))),
    title: Math.max(0, toSafeInt(player.title, toSafeInt(roleInfo.title, 0))),
    petId: getPrimaryBattlePetId(player),
    playerInfo: {
      dbid: playerId,
      level: Math.max(1, toSafeInt(player.level, 1)),
      avatar: Math.max(0, toSafeInt(player.avatar, toSafeInt(roleInfo.avatar, 0))),
      avatarUrl: player.avatarUrl ? String(player.avatarUrl) : '',
      avatarFrame: Math.max(0, toSafeInt(player.avatarFrame, toSafeInt(roleInfo.avatarFrame, 0))),
      title: Math.max(0, toSafeInt(player.title, toSafeInt(roleInfo.title, 0))),
    },
  };
}

function buildSummonBossEnemyShowInfo(monster = {}, bossVisualId, power = 0) {
  return {
    dbid: `boss_${Math.max(1, toSafeInt(bossVisualId, 201))}`,
    serverId: 0,
    serverName: '',
    kungfuId: 0,
    subJob: 0,
    level: Math.max(1, toSafeInt(monster.level, 1)),
    name: String(monster.monsterName || '魔灵之龙'),
    power: Math.max(0, toSafeInt(power, 0)),
    stage: 1,
    avatar: 0,
    avatarUrl: '',
    avatarFrame: 0,
    title: 0,
    playerInfo: {
      dbid: `boss_${Math.max(1, toSafeInt(bossVisualId, 201))}`,
      level: Math.max(1, toSafeInt(monster.level, 1)),
      avatar: 0,
      avatarUrl: '',
      avatarFrame: 0,
      title: 0,
    },
  };
}

function buildSummonBossFightResult(player, boxCfg, rewardCount) {
  const playerAttrs = battle.calcPlayerPower(player);
  const bossVisualId = resolveSummonBossVisualId(boxCfg);
  const monsterCfgMap = configService.get('MonsterConfig') || {};
  const monster = getConfigRow(monsterCfgMap, bossVisualId) || {};
  const playerHpMax = Math.max(1, getAttrValue(playerAttrs, 1, ['hp', 'maxHp'], 100));
  const playerAtk = Math.max(1, getAttrValue(playerAttrs, 2, ['atk'], 50));
  const bossHpMax = Math.max(2000, playerAtk * Math.max(4, rewardCount));
  const bossAttrs = { 1: bossHpMax, 2: Math.max(1, Math.floor(playerAtk * 0.35)), 3: 0, 4: 1 };
  const playerPower = Math.max(0, toSafeInt(arenaReadModel.displayPower(playerAttrs), 0));
  const bossPower = Math.max(0, toSafeInt(arenaReadModel.displayPower(bossAttrs), 0));
  const bossSkillSeed = (Array.isArray(monster && monster.fightSkill) ? monster.fightSkill : [])
    .map((id) => Math.max(0, toSafeInt(id, 0)))
    .find((id) => id > 0)
    || Math.max(0, toSafeInt(monster && monster.monsterShow, DEFAULT_MONSTER_SKILL_ID))
    || DEFAULT_MONSTER_SKILL_ID;
  const playerSkill = resolveBattleActionIds(DEFAULT_PLAYER_SKILL_ID, DEFAULT_PLAYER_SKILL_ID, DEFAULT_PLAYER_BEHAVIOR_ID);
  const bossSkill = resolveBattleActionIds(bossSkillSeed, DEFAULT_MONSTER_SKILL_ID, DEFAULT_MONSTER_BEHAVIOR_ID);
  const roundCount = 4;
  const bossHit = Math.max(1, Math.floor(playerHpMax * 0.05));
  const playerHit = Math.max(1, Math.floor(bossHpMax / roundCount));
  let currentBossHp = bossHpMax;
  let currentPlayerHp = playerHpMax;
  const events = [{ typ: 0, i: 0, c: 0, t: 0, es: [] }];
  for (let roundIndex = 1; roundIndex <= roundCount; roundIndex += 1) {
    const round = { typ: 0, i: roundIndex, c: 0, t: 0, es: [] };
    const isFinalRound = roundIndex === roundCount;
    const playerDamage = isFinalRound ? currentBossHp : Math.max(1, Math.min(currentBossHp - 1, playerHit));
    currentBossHp = Math.max(0, currentBossHp - playerDamage);
    const playerEvent = buildSkillEvent(
      playerSkill.skillId,
      playerSkill.behaviorId,
      1,
      -1,
      playerDamage,
      currentBossHp,
    );
    if (playerEvent) round.es.push([playerEvent]);

    if (!isFinalRound) {
      currentPlayerHp = Math.max(1, currentPlayerHp - bossHit);
      const bossEvent = buildSkillEvent(
        bossSkill.skillId,
        bossSkill.behaviorId,
        -1,
        1,
        bossHit,
        currentPlayerHp,
      );
      if (bossEvent) round.es.push([bossEvent]);
    }

    if (round.es.length > 0) events.push(round);
  }
  const playerId = String(player.playerId || player.userId || 'boss_self');
  const selfEntity = applyPrimaryBattlePetParts({
    id: Math.max(1, toSafeInt(player.roleInfo && player.roleInfo.kungfuId, 4)),
    dbid: playerId,
    name: String(player.name || 'Player'),
    type: 1,
    side: 1,
    camp: 1,
    pos: 1,
    posIndex: 1,
    hp: playerHpMax,
    maxhp: playerHpMax,
    maxHp: playerHpMax,
    vars: buildFightVars(playerHpMax),
    showInfo: buildSummonBossPlayerShowInfo(player, playerPower),
    parts: {},
    partValues: {},
  }, player);
  return {
    type: 1,
    win: 1,
    mustChangeTurn: 0,
    notChangeTurn: 1,
    atkAttr: playerAttrs || {},
    defAttr: bossAttrs,
    damage: { 1: bossHpMax, '-1': Math.max(0, playerHpMax - currentPlayerHp) },
    isBackFight: false,
    events,
    entitys: [
      selfEntity,
      {
        id: bossVisualId,
        dbid: `boss_${bossVisualId}`,
        name: String(monster.monsterName || "Quái tinh anh"),
        type: 2,
        side: 2,
        camp: 2,
        pos: -1,
        posIndex: -1,
        hp: bossHpMax,
        maxhp: bossHpMax,
        maxHp: bossHpMax,
        vars: buildFightVars(bossHpMax),
        showInfo: buildSummonBossEnemyShowInfo(monster, bossVisualId, bossPower),
        parts: {},
        partValues: {},
      },
    ],
    guildBossAllDamage: 0,
    bloodlineOffset: 0,
  };
}

function addItemCount(itemCountMap, itemId, count) {
  const id = toSafeInt(itemId, 0);
  const c = Math.max(0, toSafeInt(count, 0));
  if (id <= 0 || c <= 0) return;
  itemCountMap.set(id, (itemCountMap.get(id) || 0) + c);
}

function ensurePlayerBoxState(player = {}) {
  if (!player.items || typeof player.items !== 'object' || Array.isArray(player.items)) {
    player.items = {};
  }
  if (!player.boxInfo || typeof player.boxInfo !== 'object' || Array.isArray(player.boxInfo)) {
    player.boxInfo = {
      level: 1,
      exp: 0,
      upgradeFinishTime: 0,
      tier: 1,
      tierExp: 0,
      tierUpTime: 0,
      summonExp: 0,
      summonCount: 0,
      summonFreeCount: 0,
      summonFreeResetDay: 0,
    };
  }
  player.boxInfo.summonFreeResetDay = Math.max(0, toSafeInt(player.boxInfo.summonFreeResetDay, 0));
  ensureEquipInfo(player);
}

function getDayCode(nowMs = Date.now()) {
  const date = new Date(Math.max(0, toSafeInt(nowMs, Date.now())));
  return (date.getFullYear() * 10000) + ((date.getMonth() + 1) * 100) + date.getDate();
}

function refreshDailySummonFreeState(player = {}, nowMs = Date.now()) {
  ensurePlayerBoxState(player);
  const today = getDayCode(nowMs);
  const boxInfo = player.boxInfo;
  if (today <= 0) return false;
  if (toSafeInt(boxInfo.summonFreeResetDay, 0) === today) return false;

  boxInfo.summonFreeCount = 0;
  boxInfo.summonFreeResetDay = today;
  return true;
}

function getSummonFreeLimit(player = {}) {
  const constCfg = configService.get('ConstConfig') || {};
  return Math.max(1, toSafeInt(constCfg.mapBossFreeNum, 1));
}

function isSummonBossFailOpenEnabled() {
  const raw = process.env.SUMMON_BOSS_FAIL_OPEN;
  if (raw != null && raw !== '') return String(raw).trim() === '1';
  return process.env.NODE_ENV !== 'production';
}

function addSummonProgress(player = {}, count = 0) {
  ensurePlayerBoxState(player);
  const addCount = Math.max(0, toSafeInt(count, 0));
  if (addCount <= 0) return false;

  const constCfg = configService.get('ConstConfig') || {};
  const needExp = Math.max(1, toSafeInt(constCfg.mapBossCallCost, 1000));
  const maxCount = Math.max(1, toSafeInt(constCfg.mapBossMaxNum, 10));
  const boxInfo = player.boxInfo;
  let summonExp = Math.max(0, toSafeInt(boxInfo.summonExp, 0)) + addCount;
  let summonCount = Math.max(0, toSafeInt(boxInfo.summonCount, 0));

  while (summonExp >= needExp && summonCount < maxCount) {
    summonExp -= needExp;
    summonCount += 1;
  }

  if (summonCount >= maxCount) {
    summonExp = Math.min(summonExp, needExp - 1);
  }

  const changed = summonExp !== toSafeInt(boxInfo.summonExp, 0)
    || summonCount !== toSafeInt(boxInfo.summonCount, 0);
  boxInfo.summonExp = summonExp;
  boxInfo.summonCount = summonCount;
  return changed;
}

function buildOpenInfo(player, count, options = {}) {
  const safeCount = Math.max(1, toSafeInt(count, 1));
  const level = Math.max(1, toSafeInt(player.level, 1));
  const boxLevel = Math.max(1, toSafeInt(player.boxInfo && player.boxInfo.level, 1));
  const qualityFloor = Math.max(1, toSafeInt(options.qualityFloor, 1));
  const includeExp = options.includeExp !== false;

  const boxCfg = getBoxConfigByLevel(boxLevel);
  const assetsCfg = getAssetsConfig();
  const itemCountMap = new Map();

  // Keep default coin drop behavior.
  if (includeExp) {
    addItemCount(itemCountMap, 3, 10 * safeCount);
  }

  const forceQualities = Array.isArray(options.forceQualities) ? options.forceQualities : [];
  for (let i = 0; i < safeCount; i += 1) {
    const quality = Math.max(
      qualityFloor,
      toSafeInt(forceQualities[i], rollEquipQuality(boxCfg, qualityFloor))
    );
    const subType = rollEquipSubType();
    const equipTemplateId = buildEquipTemplateId(quality, subType, assetsCfg);
    addItemCount(itemCountMap, equipTemplateId, 1);
  }

  const items = [];
  const coinCount = itemCountMap.get(3) || 0;
  if (coinCount > 0) {
    items.push({ id: 3, count: coinCount });
  }

  Array.from(itemCountMap.entries())
    .filter(([id]) => id !== 3)
    .sort((a, b) => a[0] - b[0])
    .forEach(([id, itemCount]) => {
      items.push({ id, count: itemCount });
    });

  return {
    seed: Date.now(),
    count: safeCount,
    lv: level,
    items,
  };
}

function getAuthoritativeDelegateCount(player = {}, requestedCount = 1) {
  const boxInfo = player && player.boxInfo && typeof player.boxInfo === 'object' ? player.boxInfo : {};
  const tier = Math.max(1, toSafeInt(boxInfo.tier, 1));
  const tierMap = configService.get('BoxTierConfig') || {};
  const tierCfg = tierMap[tier] || tierMap[String(tier)] || {};
  const baseCount = Math.max(1, toSafeInt(tierCfg.count, 1));
  const now = Date.now();
  const monthCards = player.rechargeInfo && player.rechargeInfo.monthCards;
  const hasMonthCard = monthCards && toSafeInt(monthCards[11000002], 0) > now;
  const privilegeCfg = configService.get('PrivilegeConfig') || {};
  const monthCfg = privilegeCfg[11000002] || privilegeCfg[String(11000002)] || {};
  const privilegeExtra = hasMonthCard
    ? Math.max(0, toSafeInt(monthCfg.groups && monthCfg.groups[16], 0)) : 0;
  const tierExtension = configService.get('DropTierExtensionConfig') || {};
  const configuredCap = Math.max(1, toSafeInt(tierExtension.maxOpenCount, Number.MAX_SAFE_INTEGER));
  const maxAllowed = Math.min(configuredCap, baseCount + privilegeExtra);
  return Math.max(1, Math.min(maxAllowed, toSafeInt(requestedCount, 1)));
}

function expandRewardItems(items = []) {
  const expanded = [];
  (Array.isArray(items) ? items : []).forEach((row) => {
    const itemId = Math.max(0, toSafeInt(row && row.id, 0));
    const count = Math.max(0, toSafeInt(row && row.count, 0));
    if (itemId <= 0 || count <= 0) return;
    for (let index = 0; index < count; index += 1) {
      expanded.push({ id: itemId, count: 1 });
    }
  });
  return expanded;
}

function equipPower(equip) {
  const attrs = equip && equip.attrs && typeof equip.attrs === 'object' ? equip.attrs : {};
  try {
    const score = Math.max(0, toSafeInt(battle.calcPowerScore(attrs), 0));
    if (score > 0) return score;
  } catch (_err) {}
  return Object.keys(attrs).reduce((sum, key) => sum + Math.max(0, toSafeInt(attrs[key], 0)), 0);
}

/**
 * Resolve equipment produced by a managed map-farming bot without leaving an
 * unbounded open-list in Mongo. This is the server equivalent of the native
 * auto-delegate selection flow: keep the strongest item per slot, replace it
 * only when it is strictly stronger, and sell the remainder through the same
 * EquipService sale path used by tag=2201.
 */
function settleManagedBotEquipments(player = {}, generated = [], options = {}) {
  ensureEquipInfo(player);
  const sellAllEquipments = options === true || !!(options && options.sellAllEquipments);
  const info = player.equipInfo || {};
  const currentIndex = Math.max(0, toSafeInt(info.curIndex, 0));
  const planMap = info.equipSetMap && typeof info.equipSetMap === 'object' ? info.equipSetMap : {};
  const plan = planMap[String(currentIndex)] && typeof planMap[String(currentIndex)] === 'object'
    ? planMap[String(currentIndex)]
    : {};
  const generatedRows = (Array.isArray(generated) ? generated : [])
    .filter((equip) => equip && toSafeInt(equip.uid, 0) > 0)
    .slice()
    .sort((left, right) => {
      const typeDiff = toSafeInt(left.type, 0) - toSafeInt(right.type, 0);
      return typeDiff || equipPower(right) - equipPower(left);
    });

  const equipped = [];
  const ignored = [];
  for (const equip of generatedRows) {
    if (sellAllEquipments) {
      ignored.push(toSafeInt(equip.uid, 0));
      continue;
    }
    const type = Math.max(1, toSafeInt(equip.type, 1));
    const current = plan[String(type)] || plan[type] || null;
    if (current && equipPower(equip) <= equipPower(current)) {
      ignored.push(toSafeInt(equip.uid, 0));
      continue;
    }
    const replaced = replaceOpenEquipToPlan(player, {
      uid: equip.uid,
      listId: currentIndex,
      mapId: currentIndex,
    });
    if (replaced && replaced.result === 0) {
      equipped.push({
        uid: toSafeInt(equip.uid, 0),
        type,
        power: equipPower(equip),
        replacedUid: replaced.oldEquip ? toSafeInt(replaced.oldEquip.uid, 0) : 0,
      });
    } else {
      ignored.push(toSafeInt(equip.uid, 0));
    }
  }

  const saleUids = [];
  const openListMap = info.openListMap && typeof info.openListMap === 'object' ? info.openListMap : {};
  const protectedUids = new Set();
  const equipSetMap = info.equipSetMap && typeof info.equipSetMap === 'object' ? info.equipSetMap : {};
  Object.values(equipSetMap).forEach((planRow) => {
    if (!planRow || typeof planRow !== 'object') return;
    Object.values(planRow).forEach((equip) => {
      const uid = toSafeInt(equip && equip.uid, 0);
      if (uid > 0) protectedUids.add(uid);
    });
  });
  Object.keys(openListMap).forEach((listKey) => {
    const list = Array.isArray(openListMap[listKey]) ? openListMap[listKey] : [];
    list.forEach((equip) => {
      const uid = toSafeInt(equip && equip.uid, 0);
      if (uid > 0 && !protectedUids.has(uid)) saleUids.push(uid);
    });
  });
  const sale = saleUids.length > 0 ? saleOpenEquips(player, saleUids) : null;
  const saleItems = sale && sale.rewardInfo && Array.isArray(sale.rewardInfo.items)
    ? sale.rewardInfo.items
      .map((row) => ({ id: toSafeInt(row && row.id, 0), count: Math.max(0, toSafeInt(row && row.count, 0)) }))
      .filter((row) => row.id > 0 && row.count > 0)
    : [];

  return {
    equipped,
    ignored,
    soldUids: sale && Array.isArray(sale.uids) ? sale.uids.slice() : [],
    saleItems,
  };
}

async function handleOpenBox(params, session, msgUid) {
  const player = session.player;
  if (!player) {
    return buildOpenResponse(msgUid, null, { seed: Date.now(), count: 0, lv: 1, items: [] });
  }

  ensurePlayerBoxState(player);

  const mapContext = getNormalMapMonsterContext(params || {}, session || {});
  if (mapContext && !mapContext.valid) {
    logger.info(
      `[Box] open denied user=${session.userId || 'unknown'} reason=${mapContext.reason} `
      + `map=${mapContext.mapId} line=${mapContext.line} index=${mapContext.index}`
    );
    return buildOpenResponse(
      msgUid,
      player,
      buildOpenDeniedInfo(player, mapContext.reason, {
        mapId: mapContext.mapId,
        line: mapContext.line,
        index: mapContext.index,
      }),
    );
  }

  // One connection can have only one unresolved open-box reward. Expired map
  // claims are discarded first so a lost 2001 does not permanently wedge the
  // worker/session; the lease is checked again at settlement time.
  if (session.pendingBoxReward && session.pendingBoxClaim
    && Number(session.pendingBoxClaim.expiresAt || 0) <= Date.now()) {
    mapMonsterService.release(session.pendingBoxClaim, { ownerId: session.pendingBoxClaim.ownerId });
    session.pendingBoxClaim = null;
    session.pendingBoxReward = null;
  }

  // A retry for the same target is idempotent; a different target waits for
  // tag=2001.
  if (session.pendingBoxReward) {
    const pendingClaim = session.pendingBoxClaim;
    const sameTarget = !!(
      mapContext
      && pendingClaim
      && pendingClaim.mapId === mapContext.mapId
      && pendingClaim.line === mapContext.line
      && pendingClaim.index === mapContext.index
    );
    if (sameTarget) {
      return buildOpenResponse(msgUid, player, {
        ...session.pendingBoxReward,
        result: 0,
        mapId: pendingClaim.mapId,
        line: pendingClaim.line,
        index: pendingClaim.index,
        monsterId: pendingClaim.monsterId,
      });
    }
    return buildOpenResponse(
      msgUid,
      player,
      buildOpenDeniedInfo(player, 'pending_reward', {
        busy: 1,
        retryAfterMs: mapMonsterService.leaseMs,
      }),
    );
  }

  ensureManagedBotFarmReserve(player, session);
  const reqCount = getAuthoritativeDelegateCount(player, params && params.count);
  const baozi = Math.max(0, toSafeInt(player.items[4], 0));
  const openCount = Math.min(reqCount, baozi);

  if (openCount <= 0) {
    logger.info(`[Box] open denied user=${session.userId} reason=baozi_not_enough req=${reqCount} own=${baozi}`);
    return buildOpenResponse(msgUid, player, buildOpenDeniedInfo(player, 'baozi_not_enough'));
  }

  let claimResult = null;
  if (mapContext && mapContext.valid) {
    claimResult = mapMonsterService.tryClaim({
      serverId: session.serverId || process.env.SERVER_ID || 1,
      mapId: mapContext.mapId,
      line: mapContext.line,
      index: mapContext.index,
      ownerId: getMapClaimOwnerId(session),
    });
    if (!claimResult.ok) {
      // Preserve the native tag=2000 payload shape. The official client can
      // finish its local FSM with an empty result; managed workers use the
      // busy/retry fields to choose another target without spinning.
      logger.debug(
        `[Box] map monster unavailable user=${session.userId || 'unknown'} `
        + `map=${mapContext.mapId} line=${mapContext.line} index=${mapContext.index} `
        + `reason=${claimResult.reason}`
      );
      return buildOpenResponse(
        msgUid,
        player,
        buildOpenDeniedInfo(player, claimResult.reason, {
          busy: claimResult.reason === 'busy' || claimResult.reason === 'cooldown' ? 1 : 0,
          mapId: mapContext.mapId,
          line: mapContext.line,
          index: mapContext.index,
          monsterId: mapContext.slot && mapContext.slot.id,
          retryAfterMs: Math.max(0, toSafeInt(claimResult.retryAfterMs, 0)),
        }),
      );
    }
  }

  let openInfo;
  try {
    // Roll once after the authoritative claim and before consuming resources.
    // A pending-target retry reuses openInfo above; settlement never rerolls.
    const materialItems = alchemyMaterials.roll(player, openCount, {
      kind: 'normal', valid: mapContext?.valid === true,
      mapId: mapContext?.mapId, isBot: session._isBot === true,
    });
    player.items[4] = baozi - openCount;
    if (player.items[4] <= 0) {
      delete player.items[4];
    }
    if (session._isBot !== true) {
      addMainTaskBagelConsume(player, openCount);
      addRealmBagelConsume(player, openCount);
      addSummonProgress(player, openCount);
    }

    if (session._isBot === true) {
      const premiumQuality = getManagedBotPremiumQuality();
      openInfo = buildOpenInfo(player, openCount, {
        qualityFloor: premiumQuality,
        forceQualities: Array(openCount).fill(premiumQuality),
        includeExp: true,
      });
      const premiumShowItemId = getManagedBotPremiumShowItemId();
      if (premiumShowItemId > 0) {
        const existing = openInfo.items.find((row) => toSafeInt(row && row.id, 0) === premiumShowItemId);
        if (existing) existing.count = Math.max(1, toSafeInt(existing.count, 0)) + 1;
        else openInfo.items.push({ id: premiumShowItemId, count: 1 });
      }
      openInfo.premiumQuality = premiumQuality;
    } else {
      openInfo = buildOpenInfo(player, openCount);
    }
    openInfo.items.push(...materialItems);
    if (materialItems.length) openInfo.materialPolicyVersion = alchemyMaterials.policy.version;
    if (mapContext && mapContext.valid && claimResult && claimResult.claim) {
      openInfo.mapId = mapContext.mapId;
      openInfo.line = mapContext.line;
      openInfo.index = mapContext.index;
      openInfo.monsterId = mapContext.slot.id;
      session.pendingBoxClaim = claimResult.claim;
  }
  // Auto-delegate policy is carried from the 2000 open request to the
  // subsequent 2001 claim (the native client sends 2001 with an empty body).
  if (session._isBot === true && params && params.sellAllEquipments === true) {
    openInfo.sellAllEquipments = true;
  }
  session.pendingBoxReward = openInfo;
  } catch (err) {
    if (claimResult && claimResult.claim) {
      mapMonsterService.release(claimResult.claim, { ownerId: claimResult.claim.ownerId });
    }
    throw err;
  }

  // Managed bots claim shortly afterwards through tag=2001. Persist their
  // combined consume/reward/equipment snapshot once at settlement instead of
  // writing twice per fight; human client durability remains unchanged.
  if (session._isBot !== true) {
    playerService.savePlayerDeferred(session.userId, player).catch((err) => {
      logger.warn(`[Box] async open save failed user=${session.userId}: ${err.message}`);
    });
  }

  const wsServer = runtimeBus.getWsServer();
  const broadcastData = {
    id: String(player.playerId || session.userId || ''),
    index: toSafeInt(params && params.index, 0),
    speedUp: !!(params && params.speedUp),
    seed: openInfo.seed,
    count: openInfo.count,
    lv: openInfo.lv,
    items: openInfo.items,
    mapId: mapContext ? mapContext.mapId : Math.max(0, toSafeInt(session && session._mapId, 0)),
    line: mapContext ? mapContext.line : Math.max(0, toSafeInt(session && session._mapLine, 0)),
    monsterId: mapContext && mapContext.slot ? mapContext.slot.id : 0,
  };
  if (wsServer && mapContext && mapContext.valid && typeof wsServer.broadcastMapExceptUser === 'function') {
    // 2150 is a local monster action in the native client. Keep it scoped to
    // the map/line instead of waking every connected map.
    wsServer.broadcastMapExceptUser(
      session.userId,
      mapContext.mapId,
      mapContext.line,
      2150,
      broadcastData,
    );
  } else if (wsServer && typeof wsServer.broadcastExceptUser === 'function') {
    // Compatibility for contract tests/legacy runtimes exposing only the old
    // global broadcaster.
    wsServer.broadcastExceptUser(session.userId, 2150, broadcastData);
  }

  // The client enters its attack FSM inside the tag=2000 callback. Send that
  // ACK first so the selected local monster cannot disappear while unrelated
  // item/task pushes are being handled.
  const response = [{ tag: 2000, msgUid, data: openInfo }];
  response.push({ tag: 1202, data: { items: [{ id: 4, count: -openCount }] } });
  return response;
}

async function handleBoxReward(_params, session, msgUid) {
  const player = session.player;
  if (!player) {
    return {
      tag: 2001,
      msgUid,
      data: {
        rewardInfo: {
          items: [], equips: [], swords: [], pets: [], artifacts: [], gems: [],
          valhalla: [], bloodline: [], fashion: [], elves: [], extraReward: {},
        },
      },
    };
  }

  ensurePlayerBoxState(player);

  const openInfo = session.pendingBoxReward || {
    seed: Date.now(),
    count: 0,
    lv: Math.max(1, toSafeInt(player.level, 1)),
    items: [],
  };
  const pendingClaim = session.pendingBoxClaim || null;

  if (pendingClaim) {
    // complete() and the reward mutation below are synchronous within the
    // same event-loop turn (there is no await between them), so this is the
    // final ownership/expiry gate before touching the player snapshot.
    const claimCompleted = mapMonsterService.complete(pendingClaim, { ownerId: pendingClaim.ownerId });
    if (!claimCompleted) {
      session.pendingBoxReward = null;
      session.pendingBoxClaim = null;
      return {
        tag: 2001,
        msgUid,
        data: {
          result: -1,
          reason: 'claim_expired',
          rewardInfo: {
            items: [], equips: [], swords: [], pets: [], artifacts: [], gems: [],
            valhalla: [], bloodline: [], fashion: [], elves: [], extraReward: {},
          },
        },
      };
    }
  }

  const rewardItems = [];
  const rewardEquips = [];

  for (const raw of openInfo.items || []) {
    const id = toSafeInt(raw && raw.id, 0);
    const count = Math.max(0, toSafeInt(raw && raw.count, 0));
    if (id <= 0 || count <= 0) continue;

    if (isEquipTemplateItem(id)) {
      for (let i = 0; i < count; i++) {
        const equip = createEquipFromTemplateId(id, openInfo.lv, player);
        rewardEquips.push(equip);
        addOpenEquip(player, equip);
      }
      continue;
    }

    rewardItems.push({ id, count });
    addRewardToPlayer(player, id, count);
  }


  const fortuneTaskChanged = session._isBot !== true && openInfo.isEliteMonster === true
    ? !!addEliteMonsterKillCount(player, 1)
    : false;

  let botAutoDelegate = null;
  let botAppearanceUpdated = false;
  if (session._isBot === true && rewardEquips.length > 0) {
    try {
      botAutoDelegate = settleManagedBotEquipments(player, rewardEquips, {
        sellAllEquipments: !!(openInfo && openInfo.sellAllEquipments),
      });
    } catch (err) {
      // A malformed legacy equipment row must not turn a successful monster
      // claim into a lost reward. Leave the generated equipment in the bot's
      // open list for the next cycle and record the decision for diagnosis.
      logger.warn(
        `[Box] managed bot auto-delegate failed user=${session.userId || 'unknown'}: ${err.message}`
      );
      botAutoDelegate = {
        equipped: [],
        ignored: rewardEquips.map((equip) => toSafeInt(equip && equip.uid, 0)).filter((uid) => uid > 0),
        soldUids: [],
        saleItems: [],
      };
    }
    // Selling weak/replaced equipment is part of the native ủy thác flow, so
    // expose the generated silver in the same reward packet while keeping the
    // mutation server-authoritative.
    for (const row of botAutoDelegate.saleItems) {
      const existing = rewardItems.find((item) => item.id === row.id);
      if (existing) existing.count += row.count;
      else rewardItems.push({ ...row });
    }
    if (botAutoDelegate.equipped.length > 0) {
      try {
        // Lazy require keeps the basic -> box claim-cleanup dependency acyclic
        // during bootstrap while still refreshing visible bot equipment.
        const basic = require('./basic');
        if (basic && typeof basic.refreshManagedBotMapAppearance === 'function') {
          botAppearanceUpdated = basic.refreshManagedBotMapAppearance(session, player);
        }
      } catch (err) {
        logger.warn(`[Box] managed bot appearance refresh failed user=${session.userId}: ${err.message}`);
      }
    }
  }

  session.pendingBoxReward = null;
  session.pendingBoxClaim = null;
  session._itemListCache = null;
  // The reward packet is deterministic and the PlayerService queue snapshots
  // the player at enqueue time, so Mongo persistence must not delay the ACK.
  persistBoxRewardCheckpoint(session, player);

  // A managed worker has no native reward/equipment UI. It has already
  // applied the auto-delegate decision server-side, so avoid sending a large
  // equipment matrix back over its socket. Human clients retain the exact
  // historical payload.
  const clientRewardEquips = session._isBot === true ? [] : rewardEquips;
  const rewardInfo = {
    items: rewardItems,
    equips: clientRewardEquips,
    swords: [],
    pets: [],
    artifacts: [],
    gems: [],
    valhalla: [],
    bloodline: [],
    fashion: [],
    elves: [],
    extraReward: {},
  };
  if (botAutoDelegate) {
    rewardInfo.autoDelegate = {
      equipped: botAutoDelegate.equipped,
      soldUids: botAutoDelegate.soldUids,
      ignoredUids: botAutoDelegate.ignored,
    };
  }

  const messages = [];
  if (fortuneTaskChanged) messages.push(...buildTaskUpdatePacketsSafe(player));
  if (rewardItems.length > 0) {
    messages.push({ tag: 1202, msgUid: 0, data: buildRewardItemSync(player, rewardItems) });
  }
  for (const equip of clientRewardEquips) {
    messages.push({ tag: 2200, data: { equip } });
  }
  messages.push({ tag: 2001, msgUid, data: { rewardInfo } });

  const rewardLog = (
    `[Box] reward user=${session.userId || 'unknown'} msgUid=${msgUid} `
    + `itemCount=${rewardItems.length} equipCount=${rewardEquips.length} `
    + `equipIds=${rewardEquips.map((equip) => equip && equip.id).filter(Boolean).join(',')} `
    + `premiumQuality=${toSafeInt(openInfo.premiumQuality, 0)} appearanceUpdated=${botAppearanceUpdated ? 1 : 0}`
    + ` alchemyMaterials=${rewardItems.filter(row => row.id >= 2001 && row.id <= 2015 || row.id >= 2201 && row.id <= 2215).map(row => row.id + ':' + row.count).join(',') || '-'} `
    + `materialPolicy=${openInfo.materialPolicyVersion || '-'}`
  );
  if (session._isBot !== true || botAppearanceUpdated) logger.info(rewardLog);
  else logger.debug(rewardLog);

  return messages;
}

/**
 * Release an unresolved map-monster claim when a socket disappears before it
 * sends tag=2001. The claim lease remains a defensive fallback for races.
 */
function releasePendingBoxClaim(session = {}) {
  const claim = session && session.pendingBoxClaim;
  if (!claim) return false;
  mapMonsterService.release(claim, { ownerId: claim.ownerId });
  session.pendingBoxClaim = null;
  session.pendingBoxReward = null;
  return true;
}

async function handleSummonBoss(params, session, msgUid) {
  const player = session.player;
  if (!player) {
    return {
      tag: 2003,
      msgUid,
      data: { seed: Date.now(), count: 0, lv: 1, items: [], summonCount: 0, summonFreeCount: 0 },
    };
  }

  ensurePlayerBoxState(player);
  refreshDailySummonFreeState(player);

  let summonCount = Math.max(0, toSafeInt(player.boxInfo.summonCount, 0));
  let summonFreeCount = Math.max(0, toSafeInt(player.boxInfo.summonFreeCount, 0));
  const summonFreeLimit = getSummonFreeLimit(player);

  if (summonFreeCount < summonFreeLimit) {
    summonFreeCount += 1;
  } else if (summonCount > 0) {
    summonCount -= 1;
  } else if (isSummonBossFailOpenEnabled()) {
    logger.warn(
      `[Box] summon boss fail-open user=${session.userId || 'unknown'} msgUid=${msgUid} `
      + `summonCount=${summonCount} usedFree=${summonFreeCount} freeLimit=${summonFreeLimit}`
    );
  } else {
    logger.info(
      `[Box] summon boss denied user=${session.userId || 'unknown'} msgUid=${msgUid} `
      + `summonCount=${summonCount} usedFree=${summonFreeCount} freeLimit=${summonFreeLimit}`
    );
    return {
      tag: 2003,
      msgUid,
      data: {
        seed: Date.now(),
        count: 0,
        lv: Math.max(1, toSafeInt(player.level, 1)),
        items: [],
        summonCount,
        summonFreeCount,
      },
    };
  }

  player.boxInfo.summonCount = summonCount;
  player.boxInfo.summonFreeCount = summonFreeCount;

  const boxLevel = Math.max(1, toSafeInt(player.boxInfo && player.boxInfo.level, 1));
  const boxCfg = getBoxConfigByLevel(boxLevel);
  const qualityFloor = Math.max(1, toSafeInt(boxCfg.mapBossDropQuality, 1));
  const rewardCount = 15;
  const forceQualities = [6, 5, 5, 5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
  const openInfo = buildOpenInfo(player, rewardCount, { qualityFloor, forceQualities, includeExp: true });
  openInfo.count = Math.max(rewardCount, boxLevel + 10);
  openInfo.lv = Math.max(1, toSafeInt(player.level, 1) + 5);
  openInfo.fightResult = buildSummonBossFightResult(player, boxCfg, rewardCount);
  openInfo.bossShow = resolveSummonBossVisualId(boxCfg);
  openInfo.isEliteMonster = true;
  session.pendingBoxReward = openInfo;

  logger.info(
    `[Box] summon boss user=${session.userId || 'unknown'} msgUid=${msgUid} `
    + `bossShow=${openInfo.bossShow} dropCount=${openInfo.count} `
    + `summonCount=${summonCount} usedFree=${summonFreeCount}/${summonFreeLimit} `
    + `dropIds=${(openInfo.items || []).map((row) => row && row.id).filter(Boolean).join(',')}`
  );

  playerService.savePlayerDeferred(session.userId, player).catch((err) => {
    logger.warn(`[Box] async reward save failed user=${session.userId}: ${err.message}`);
  });

  return {
    tag: 2003,
    msgUid,
    data: {
      ...openInfo,
      summonCount,
      summonFreeCount,
    },
  };
}

module.exports = {
  handleOpenBox,
  handleBoxReward,
  handleSummonBoss,
  releasePendingBoxClaim,
  getMapMonsterContext: getNormalMapMonsterContext,
  settleManagedBotEquipments,
  // Pure contract probes for the tier-100 release tests.
  buildOpenInfo,
  getAuthoritativeDelegateCount,
};

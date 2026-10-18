/**
 * Basic handlers: heartbeat, map, guild, echo, profile.
 */

const playerService = require('../services/PlayerService');
const Session = require('../net/Session');
const configService = require('../services/ConfigService');
const logger = require('../logger');
const { buildPlayer500Data } = require('./playerPayload');
const { refreshMainTaskProgress } = require('../services/MainTaskProgressService');
const { refreshRealmStageTasks } = require('../services/RealmTaskProgressService');
const { ensureRoleAppearance, getPlayerFashionMap, getPrimaryBattlePetId } = require('../services/RoleAppearanceService');
const botPopulation = require('../services/BotPopulationService');
const runtimeBus = require('../services/RuntimeBus');
const battleService = require('../services/BattleService');
const { ensureFateInfo } = require('./fate');
const arenaReadModel = require('../services/ArenaReadModelService');

function clonePlayerSnapshot(player = {}) {
  if (!player || typeof player !== 'object') return {};
  try {
    return JSON.parse(JSON.stringify(player));
  } catch (_err) {
    return { ...player };
  }
}

function releasePendingMapMonsterClaim(session = {}) {
  if (!session || !session.pendingBoxClaim) return false;
  try {
    // Lazy require avoids the basic -> box -> raid bootstrap cycle.
    const box = require('./box');
    if (box && typeof box.releasePendingBoxClaim === 'function') {
      return box.releasePendingBoxClaim(session);
    }
  } catch (err) {
    logger.warn(`[Map] pending monster claim cleanup failed: ${err.message}`);
  }
  return false;
}

function buildMapShowInfo(player = {}) {
  player = clonePlayerSnapshot(player);
  ensureRoleAppearance(player);
  const roleInfo = player.roleInfo || {};
  const totalAttr = buildPlayerDetailAttrs(player);
  return {
    dbid: player.playerId || '',
    serverId: toSafeInt(player.serverId, toSafeInt(process.env.SERVER_ID || process.env.DEFAULT_SERVER_ID, 1)),
    serverName: player.serverName || process.env.SERVER_NAME || '',
    kungfuId: roleInfo.kungfuId || 4,
    subJob: roleInfo.subJob || 0,
    level: player.level || 1,
    name: player.name || '',
    power: buildPlayerDetailPower(totalAttr, player),
    stage: roleInfo.stage || roleInfo.stageId || 1,
    petId: getPrimaryBattlePetId(player),
    petSoulId: -1,
    artifactId: 0,
    fate: 0,
    foreverCard: 0,
    equipMap: buildEquippedIdMap(player),
    fashionMap: getPlayerFashionMap(player),
  };
}

function getVisibleEquipSignature(showInfo = {}) {
  const equipMap = ensurePlainObject(showInfo && showInfo.equipMap);
  return [1, 2, 3, 9]
    .map((slot) => `${slot}:${Math.max(0, toSafeInt(equipMap[slot], 0))}`)
    .join('|');
}

/**
 * Refresh the map snapshot after a managed bot equips a stronger visible
 * item. Normal-map clients have no incremental appearance packet, so replay
 * the native leave/enter pair only when weapon/body/head/leg visuals change.
 */
function refreshManagedBotMapAppearance(session = {}, player = {}) {
  if (!session || session._isBot !== true || !session._mapSelfInfo) return false;
  const mapId = Math.max(0, toSafeInt(session._mapId, 0));
  if (mapId <= 0) return false;

  const current = clonePlayerSnapshot(session._mapSelfInfo);
  const nextShowInfo = buildMapShowInfo(player);
  const previousSignature = getVisibleEquipSignature(current.showInfo);
  const nextSignature = getVisibleEquipSignature(nextShowInfo);
  const id = String(player.playerId || session.userId || current.id || '');
  const nextSelfInfo = {
    ...current,
    id,
    playerId: id,
    x: toSafeInt(session._mapPos && session._mapPos.x, toSafeInt(current.x, 0)),
    y: toSafeInt(session._mapPos && session._mapPos.y, toSafeInt(current.y, 0)),
    name: String(player.name || current.name || ''),
    level: Math.max(1, toSafeInt(player.level, current.level || 1)),
    showInfo: nextShowInfo,
  };
  session._mapSelfInfo = clonePlayerSnapshot(nextSelfInfo);

  if (previousSignature === nextSignature) return false;
  if (typeof session._broadcastMapExceptUser !== 'function') return false;
  session._broadcastMapExceptUser(1402, { id, mapId });
  session._broadcastMapExceptUser(1401, { mapId, mapPlayer: nextSelfInfo });
  return true;
}

function toSafeInt(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.floor(num) : fallback;
}

function ensurePlainObject(value, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return { ...fallback };
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

function buildPlayerDetailAttrs(player = {}) {
  try {
    const attrs = battleService.calcPlayerPower(player);
    return ensurePlainObject(attrs);
  } catch (_err) {
    return ensurePlainObject(player.totalAttr);
  }
}

function buildPlayerDetailPower(attrs = {}, player = {}) {
  try {
    return Math.max(0, toSafeInt(arenaReadModel.displayPower(attrs), 0));
  } catch (_err) {
    return Math.max(0, toSafeInt(player.displayPower || player.power, 0));
  }
}

function isPersistableNormalMap(mapId) {
  const id = Math.max(0, toSafeInt(mapId, 0));
  if (id <= 0) return false;
  const boxConfig = configService.get('BoxConfig') || {};
  return Object.values(boxConfig).some((row) => (
    Math.max(0, toSafeInt(row && row.mapId, 0)) === id
  ));
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function addAttrMap(target = {}, source = {}, multiplier = 1) {
  Object.keys(ensurePlainObject(source)).forEach((key) => {
    const id = toSafeInt(key, 0);
    const value = toSafeInt(source[key], 0);
    if (id <= 0 || value === 0) return;
    target[id] = Math.max(0, toSafeInt(target[id], 0)) + Math.floor(value * multiplier);
  });
  return target;
}

function buildPlayerFateSkillInfos(player = {}) {
  const snapshot = clonePlayerSnapshot(player);
  const fateInfo = ensureFateInfo(snapshot);
  const skillCfg = configService.get('FateSkillConfig') || {};
  const plan = ensurePlainObject(fateInfo.planInfoMap && fateInfo.planInfoMap[String(fateInfo.id)]);
  return normalizeArray(plan.skills)
    .map((skillId) => toSafeInt(skillId, 0))
    .filter((skillId, index, arr) => skillId > 0 && skillCfg[skillId] && arr.indexOf(skillId) === index);
}

function buildPlayerGemAttr(player = {}) {
  const otherAttr = ensurePlainObject(player.other_attr_info);
  const gemInfo = ensurePlainObject(otherAttr.gemInfo);
  const gemCfg = configService.get('GemLevelConfig') || {};
  const attrMap = {};
  normalizeArray(gemInfo.gems).forEach((gem) => {
    const gemId = toSafeInt(gem && gem.id, 0);
    const row = ensurePlainObject(gemCfg[gemId] || gemCfg[String(gemId)]);
    addAttrMap(attrMap, row.attrs || row.attr || {});
  });
  return Object.keys(attrMap).length > 0 ? attrMap : undefined;
}

function buildPlayerCuriosAttr(player = {}) {
  const otherAttr = ensurePlainObject(player.other_attr_info);
  const curiosInfo = ensurePlainObject(otherAttr.curiosInfo);
  const curiosRows = normalizeArray(curiosInfo.curiosData);
  if (curiosRows.length <= 0) return undefined;

  const curiosCfg = configService.get('CuriosConfig') || {};
  const attrMap = {};
  curiosRows.forEach((row) => {
    const id = toSafeInt(row && row.id, 0);
    const cfg = ensurePlainObject(curiosCfg[id] || curiosCfg[String(id)]);
    const level = Math.max(0, toSafeInt(row && (row.lv != null ? row.lv : row.level), 0));
    const star = Math.max(0, toSafeInt(row && row.star, 0));
    addAttrMap(attrMap, cfg.baseAttrs || cfg.attrs || cfg.attr || {}, 1 + level * 0.1);
    addAttrMap(attrMap, cfg.passiveAttr || {}, Math.max(1, star));
  });
  return attrMap;
}

function buildEquippedMountDetail(player = {}) {
  const swordInfo = ensurePlainObject(player.swordInfo);
  const data = normalizeArray(swordInfo.data);
  const equippedUid = toSafeInt(swordInfo.equippedUid, 0);
  return data.find((row) => toSafeInt(row && row.uid, 0) === equippedUid) || data[0] || null;
}

function buildOtherDetailArtifacts(player = {}, payload = {}) {
  const artifactInfo = ensurePlainObject(payload.artifactInfo || player.artifactInfo);
  const artifactMap = ensurePlainObject(artifactInfo.artifactMap);
  const list = normalizeArray(artifactInfo.artifacts);
  const res = {};
  if (list[0]) res[1] = list[0];
  else if (artifactMap[1] || Object.values(artifactMap)[0]) res[1] = artifactMap[1] || Object.values(artifactMap)[0];
  if (list[1]) res[2] = list[1];
  else if (artifactMap[2] || Object.values(artifactMap)[1]) res[2] = artifactMap[2] || Object.values(artifactMap)[1];
  return Object.keys(res).length > 0 ? res : null;
}

function buildOtherDetailBattlePets(player = {}) {
  let roleAppearance;
  try { roleAppearance = require('../services/RoleAppearanceService'); } catch (_) {}
  const battlePets = roleAppearance && typeof roleAppearance.getBattlePets === 'function'
    ? roleAppearance.getBattlePets(player)
    : [];
  if (Array.isArray(battlePets) && battlePets.length > 0) {
    return battlePets.map((p) => ({
      ...p,
      id: toSafeInt(p.id, 0),
      level: Math.max(1, toSafeInt(p.level, 1)),
      passiveSkills: Array.isArray(p.passiveSkills) ? p.passiveSkills : [],
    }));
  }
  const petInfo = ensurePlainObject(player && player.petInfo);
  const pets = normalizeArray(petInfo.pets).filter((p) => p && toSafeInt(p.id, 0) > 0);
  if (pets.length === 0) return null;
  return pets.slice(0, 3).map((p) => ({
    ...p,
    id: toSafeInt(p.id, 0),
    level: Math.max(1, toSafeInt(p.level, 1)),
    passiveSkills: Array.isArray(p.passiveSkills) ? p.passiveSkills : [],
  }));
}

function buildOtherDetailPetSoul(player = {}) {
  const holder = player && player.other_attr_info && typeof player.other_attr_info === 'object'
    ? player.other_attr_info
    : {};
  const petSoulInfo = holder.petSoulInfo || player.petSoulInfo;
  if (!petSoulInfo || typeof petSoulInfo !== 'object') return null;
  const list = normalizeArray(petSoulInfo.petSouls).filter((s) => s && toSafeInt(s.id, 0) > 0);
  if (list.length === 0) return null;
  const petSouls = list.slice(0, 3);
  let battle;
  try { battle = require('../services/BattleService'); } catch (_) {}
  const attr = {};
  if (battle && typeof battle.addPetSoulAttrs === 'function') {
    battle.addPetSoulAttrs(attr, player);
  }
  return {
    petSouls,
    mainData: petSouls[0] || null,
    attr,
  };
}

function buildOtherDetailValhalla(player = {}) {
  const holder = player && player.other_attr_info && typeof player.other_attr_info === 'object'
    ? player.other_attr_info
    : {};
  const valhallaInfo = holder.valhallaInfo || player.valhallaInfo;
  if (!valhallaInfo || typeof valhallaInfo !== 'object') return null;
  const heroes = normalizeArray(valhallaInfo.valhalla).filter((h) => h && toSafeInt(h.id, 0) > 0);
  if (heroes.length === 0) return null;
  const plans = normalizeArray(valhallaInfo.planInfo);
  const planId = Math.max(0, toSafeInt(valhallaInfo.plan, 0));
  const plan = plans.find((r) => toSafeInt(r && r.id, -1) === planId) || plans[0] || {};
  const equippedMap = ensurePlainObject(plan.equippedMap);
  const heroByUid = new Map(heroes.map((h) => [toSafeInt(h.uid, -1), h]));
  let config;
  try { config = require('../services/ConfigService'); } catch (_) {}
  const valhallaCfg = (config && config.get('ValhallaConfig')) || {};
  const skillShowInfo = [];
  Object.keys(equippedMap).forEach((slotKey) => {
    const hero = heroByUid.get(toSafeInt(equippedMap[slotKey], -1));
    if (!hero) return;
    const cfg = valhallaCfg[hero.id] || valhallaCfg[String(hero.id)];
    const skills = Array.isArray(cfg && cfg.skills) ? cfg.skills : [];
    const star = Math.max(0, Math.min(skills.length - 1, toSafeInt(hero.star, 0)));
    const skillId = skills[star] || skills[0] || 0;
    skillShowInfo.push({ heroId: hero.id, skillId });
  });
  const totalAttr = {};
  let battle;
  try { battle = require('../services/BattleService'); } catch (_) {}
  if (battle && typeof battle.addValhallaAttrs === 'function') {
    battle.addValhallaAttrs(totalAttr, player);
  }
  return {
    skillShowInfo,
    totalAttr,
  };
}

function buildOtherDetailValhallaFormation(player = {}) {
  const holder = player && player.other_attr_info && typeof player.other_attr_info === 'object'
    ? player.other_attr_info
    : {};
  const formationInfo = holder.valhallaFormationInfo || player.valhallaFormationInfo;
  if (!formationInfo || typeof formationInfo !== 'object') return null;
  return {
    attr: ensurePlainObject(formationInfo.attr),
    skills: ensurePlainObject(formationInfo.skills),
  };
}

function buildOtherDetailBloodline(player = {}) {
  const holder = player && player.other_attr_info && typeof player.other_attr_info === 'object'
    ? player.other_attr_info
    : {};
  const info = holder.bloodlineInfo || player.bloodlineInfo;
  if (!info || !Array.isArray(info.dataList) || info.dataList.length === 0) return null;
  const wearUid = toSafeInt(info.wearUid, 0);
  const item = info.dataList.find((row) => toSafeInt(row && row.uid, 0) === wearUid) || info.dataList[0];
  if (!item || !item.id) return null;
  let bloodlineModule;
  try { bloodlineModule = require('./bloodline'); } catch (_) {}
  const quality = bloodlineModule && typeof bloodlineModule.getBloodlineQualityById === 'function'
    ? bloodlineModule.getBloodlineQualityById(item.id)
    : 1;
  const refineMaxLevel = bloodlineModule && typeof bloodlineModule.getMaxRefineLevelByQuality === 'function'
    ? bloodlineModule.getMaxRefineLevelByQuality(quality)
    : 10;
  const tier = Math.max(0, toSafeInt(item.tier, 0));
  return {
    ...item,
    id: toSafeInt(item.id, 0),
    tier,
    tierLv: tier,
    refineMaxLevel,
    refineList: Array.isArray(item.refineList) ? item.refineList : [],
  };
}

function buildOtherDetailElf(player = {}) {
  const holder = player && player.other_attr_info && typeof player.other_attr_info === 'object'
    ? player.other_attr_info
    : {};
  const elfInfo = holder.elfInfo || player.elfInfo;
  if (!elfInfo || typeof elfInfo !== 'object') return null;
  const setMapRaw = ensurePlainObject(elfInfo.setMap);
  const elfDataList = normalizeArray(elfInfo.elfData);
  const elfMap = new Map(elfDataList.map((e) => [toSafeInt(e && e.id, 0), e]));
  const setMap = {};
  Object.keys(setMapRaw).forEach((slotKey) => {
    const elfId = toSafeInt(setMapRaw[slotKey], 0);
    const elf = elfMap.get(elfId);
    if (elfId > 0 && elf) {
      setMap[slotKey] = { id: elfId, awake: toSafeInt(elf.awake, 0) };
    }
  });
  if (Object.keys(setMap).length === 0) return null;
  const attrMap = {};
  let battle;
  try { battle = require('../services/BattleService'); } catch (_) {}
  if (battle && typeof battle.addElfAttrs === 'function') {
    battle.addElfAttrs(attrMap, player);
  }
  return {
    attrMap,
    fightPlan: toSafeInt(elfInfo.fightPlan, 1),
    setMap,
  };
}

function buildOtherDetailAliases(player = {}, payload = {}) {
  const artifactInfo = ensurePlainObject(payload.artifactInfo || player.artifactInfo);
  const spiritInfo = ensurePlainObject(payload.spiritInfo || player.spiritInfo);
  const fishInfo = ensurePlainObject(payload.fishInfo || player.fishInfo);
  const homelandInfo = ensurePlainObject(payload.homelandInfo || player.homelandInfo);
  const otherAttrInfo = ensurePlainObject(payload.other_attr_info || player.other_attr_info);
  const fishSlots = ensurePlainObject(fishInfo.slots);

  return {
    formation: payload.formationInfo || player.formationInfo || null,
    sword: buildEquippedMountDetail(player),
    artifact: buildOtherDetailArtifacts(player, payload),
    orb: artifactInfo.orbInfo || {},
    spirit: spiritInfo,
    fish: Object.keys(fishInfo).length > 0 ? {
      fishSlot: fishSlots,
      attrs: ensurePlainObject(fishInfo.attrs),
    } : null,
    homeland: {
      ...homelandInfo,
      lv: Math.max(0, toSafeInt(homelandInfo.lv != null ? homelandInfo.lv : homelandInfo.level, 0)),
      attrs: ensurePlainObject(homelandInfo.attrs),
    },
    otherAttr: otherAttrInfo,
    gemAttr: buildPlayerGemAttr(player),
    curiosAttr: buildPlayerCuriosAttr(player),
    fateSkillInfos: buildPlayerFateSkillInfos(player),
  };
}

function buildSafeGuildSummary(guildInfo = {}) {
  const guildId = toSafeInt(guildInfo.guildId || guildInfo.id, 0);
  if (guildId <= 0) return null;

  const guildName = String(guildInfo.guildName || guildInfo.name || '').trim();
  const level = Math.max(1, toSafeInt(guildInfo.level, 1));
  const playercount = Math.max(
    1,
    toSafeInt(guildInfo.playercount || guildInfo.memberCount || guildInfo.membersCount, 1)
  );

  return {
    ...guildInfo,
    id: guildId,
    guildId,
    name: guildName,
    guildName,
    level,
    icon: Math.max(1, toSafeInt(guildInfo.icon, 1)),
    playercount,
    memberCount: playercount,
    maxMembers: Math.max(playercount, toSafeInt(guildInfo.maxMembers, 30)),
    serverId: toSafeInt(guildInfo.serverId, toSafeInt(process.env.SERVER_ID, 1)),
    serverName: guildInfo.serverName || process.env.SERVER_NAME || '',
    totalPower: toSafeInt(guildInfo.totalPower, 0),
    leaderinfo: ensurePlainObject(guildInfo.leaderinfo),
  };
}

function buildOtherPlayerDetail(player = {}, params = {}, result = 0) {
  const snapshot = clonePlayerSnapshot(player);
  ensureRoleAppearance(snapshot);
  const payload = buildPlayer500Data(snapshot);
  const roleInfo = ensurePlainObject(snapshot.roleInfo);
  const guildInfo = ensurePlainObject(snapshot.guildInfo);
  const guildSummary = buildSafeGuildSummary(guildInfo);
  const dbid = String(snapshot._id || snapshot.playerId || params.playerId || params.dbid || '').trim();
  const fashionMap = getPlayerFashionMap(snapshot);
  const equip = getCurrentEquipPlan(snapshot);
  const equipMap = buildEquippedIdMap(snapshot);
  const totalAttr = buildPlayerDetailAttrs(snapshot);
  const power = buildPlayerDetailPower(totalAttr, snapshot);
  const powerScore = Math.max(0, toSafeInt(battleService.calcPowerScore(totalAttr), 0));
  const detailAliases = buildOtherDetailAliases(snapshot, payload);
  if (fashionMap[200] == null) fashionMap[200] = 12000;

  const pet = buildOtherDetailBattlePets(snapshot);
  const artifact = detailAliases.artifact;
  const petSoul = buildOtherDetailPetSoul(snapshot);
  const valhalla = buildOtherDetailValhalla(snapshot);
  const valhallaFormation = buildOtherDetailValhallaFormation(snapshot);
  const bloodline = buildOtherDetailBloodline(snapshot);
  const elf = buildOtherDetailElf(snapshot);

  return {
    ...payload,
    ...detailAliases,
    result,
    dbid,
    playerId: String(snapshot.playerId || dbid),
    userId: snapshot.userId || '',
    serverId: (() => {
      const sid = toSafeInt(params.serverId, toSafeInt(player.serverId, toSafeInt(process.env.SERVER_ID || process.env.DEFAULT_SERVER_ID, 1001)));
      return sid;
    })(),
    serverName: (() => {
      const sid = toSafeInt(params.serverId, toSafeInt(player.serverId, toSafeInt(process.env.SERVER_ID || process.env.DEFAULT_SERVER_ID, 1001)));
      const fallbackName = sid >= 1001 ? `S${sid - 1000}` : `S${sid}`;
      const rawName = String(player.serverName || '').trim();
      return (!rawName || rawName.includes('长安')) ? fallbackName : rawName;
    })(),
    name: snapshot.name || '',

    level: Math.max(1, toSafeInt(snapshot.level, 1)),
    stage: Math.max(1, toSafeInt(roleInfo.stage || roleInfo.stageId, 1)),
    kungfuId: toSafeInt(roleInfo.kungfuId, 4),
    subJob: toSafeInt(roleInfo.subJob, 0),
    avatar: toSafeInt(snapshot.avatar, 0),
    avatarFrame: toSafeInt(snapshot.avatarFrame, -1),
    title: toSafeInt(snapshot.title, -1),
    power,
    powerScore,
    powerUnit: 'native-weighted-point',
    fashionMap,
    equip,
    equipMap,
    pet,
    artifact,
    petSoul,
    valhalla,
    valhallaFormation,
    bloodline,
    elf,
    totalAttr,
    totalAttrs: totalAttr,
    attrs: totalAttr,
    guildName: guildSummary ? guildSummary.guildName : '',
    guildSummary,
  };
}

function resolveMapDefaults(player = {}, params = {}, session = {}) {
  const boxLevel = Number(player.boxInfo && player.boxInfo.level) || 1;
  const boxConfig = configService.get('BoxConfig') || {};
  const mapConfig = configService.get('MapConfig') || {};

  const firstMapId = Object.keys(mapConfig)
    .map((key) => Math.max(0, toSafeInt(key, 0)))
    .find((id) => id > 0 && (mapConfig[id] || mapConfig[String(id)])) || 10001;
  const configuredMapId = Number(boxConfig[boxLevel] && boxConfig[boxLevel].mapId) || firstMapId;
  const cfgMapId = mapConfig[configuredMapId] || mapConfig[String(configuredMapId)]
    ? configuredMapId
    : firstMapId;
  const persistedMapId = isPersistableNormalMap(player.lastMapId)
    ? Math.max(0, toSafeInt(player.lastMapId, 0))
    : 0;
  const reqMapId = Number(params.mapId) || 0;
  const initialEntry = session._mapEnterSeen !== true && Math.max(0, toSafeInt(session._mapId, 0)) <= 0;
  const managedBotMapId = session._isBot === true
    && reqMapId > 0
    && (mapConfig[reqMapId] || mapConfig[String(reqMapId)])
    ? reqMapId
    : 0;
  const mapId = managedBotMapId > 0
    ? managedBotMapId
    : (initialEntry && persistedMapId > 0
    ? persistedMapId
    : (reqMapId > 0 && (mapConfig[reqMapId] || mapConfig[String(reqMapId)])
      ? reqMapId
      : (persistedMapId > 0 ? persistedMapId : cfgMapId)));

  const bornPoints = mapConfig[mapId] && Array.isArray(mapConfig[mapId].bornPoints)
    ? mapConfig[mapId].bornPoints
    : [];
  const firstBorn = bornPoints[0] || {};

  const persistedPos = ensurePlainObject(player.lastMapPos);
  const restorePersistedPosition = session._isBot !== true && initialEntry && mapId === persistedMapId;
  const x = (restorePersistedPosition ? Number(persistedPos.x) : Number(params.x))
    || (mapId === persistedMapId ? Number(persistedPos.x) : 0)
    || Number(firstBorn.x)
    || 1029;
  const y = (restorePersistedPosition ? Number(persistedPos.y) : Number(params.y))
    || (mapId === persistedMapId ? Number(persistedPos.y) : 0)
    || Number(firstBorn.y)
    || 1374;

  const line = restorePersistedPosition
    ? Math.max(0, toSafeInt(player.lastMapLine, 0))
    : Math.max(0, toSafeInt(params.line, 0));
  return { mapId, x, y, line, reqMapId, boxLevel };
}

// Heartbeat (tag:11)
async function handleHeartbeat(_params, session, msgUid) {
  if (session.userId) {
    Session.renew(session.userId).catch((err) => {
      logger.warn(`[Heartbeat] session renew failed user=${session.userId}: ${err.message}`);
    });
  }
  const heartbeat = { tag: 11, msgUid, data: { kick: false } };
  const fishingEvents = await require('../services/FishingEventService').heartbeat(session);
  const activityCycles = await require('../services/ActivityCycleSchedule').heartbeat(session);
  require('../services/FarmOfflineService').heartbeat(session).catch(error => {
    logger.warn('[Farm] offline checkpoint failed: ' + error.message);
  });
  const farmDay = require('../services/FarmDayService');
  if (session.player && !session._farmDaySyncPending && farmDay.shouldSync(session.player)) {
    // Do not delay heartbeat behind gameplay, but serialize the economic reset.
    session._farmDaySyncPending = true;
    farmDay.synchronize(session).then(packets => {
      const ws = require('../services/RuntimeBus').getWsServer();
      if (ws && packets.length) for (const { session: target, ws: socket } of ws.clients.values()) if (target === session) ws.sendResponse(socket, packets);
    }).catch(error => logger.warn('[Farm] day synchronization failed: ' + error.message)).finally(() => { session._farmDaySyncPending = false; });
  }
  // FarmDayService also resets pill daily counters under the role lock;
  // never mutate them concurrently in the heartbeat fast path.
  return [...fishingEvents, ...activityCycles, heartbeat];
}

// Mail init (tag:1100)
function getMailInit(player) {
  return { tag: 1100, data: { mailData: (player && player.mail) || [] } };
}

// Horse race init (tag:7200)
function getHorseRaceInit() {
  return {
    tag: 7200,
    data: {
      matchId: 1,
      stage: 1,
      endTime: Date.now() + 86400000 * 5,
      pass: 0,
      passRecord: 0,
      keepScore: 0,
      multi: 1,
      grade: 1,
      score: 0,
      maxGrade: 1,
      rewardGrade: 0,
      records: [],
    },
  };
}

// Guild list (tag:1500)
function handleGetGuildList(_params, _session, msgUid) {
  return { tag: 1500, msgUid, data: { guilds: [] } };
}

// Enter map (tag:1400)
function handleEnterMap(params, session, msgUid) {
  const player = session.player || {};
  const { mapId, x, y, line, reqMapId, boxLevel } = resolveMapDefaults(player, params || {}, session);
  if (session && session.pendingBoxClaim && Number(session._mapId) !== Number(mapId)) {
    releasePendingMapMonsterClaim(session);
  }
  const showInfo = buildMapShowInfo(player);

  // Map movement messages are fire-and-forget. Keep the current scene in the
  // connection context so later broadcasts cannot accidentally use a stale or
  // client-forged map id.
  session._mapId = mapId;
  session._mapLine = line;
  session._mapPos = { x, y };

  if (isPersistableNormalMap(mapId)) {
    player.lastMapId = mapId;
    player.lastMapLine = line;
    player.lastMapPos = { x, y };
    // Map movement is fire-and-forget from the client. Persist asynchronously
    // so it cannot delay the 1401 scene response or block the socket queue.
    if (session.userId && player._id) {
      playerService.savePlayerDeferred(session.userId, player).catch((err) => {
        logger.warn(`[Map] persist position failed user=${session.userId}: ${err.message}`);
      });
    }
  }

  // Client map init requires id/x/y/speedUp/showInfo.
  const selfInfo = {
    id: player.playerId || session.userId || 'p_guest',
    x,
    y,
    speedUp: 0,
    bloodPer: 10000,
    pkValue: 0,
    showInfo,

    // Compatibility fields for older code paths.
    playerId: player.playerId || '',
    name: player.name || '',
    level: player.level || 1,
    avatar: player.avatar || 0,
    avatarFrame: player.avatarFrame || 0,
    title: player.title || 0,
  };
  session._mapSelfInfo = clonePlayerSnapshot(selfInfo);
  const players = typeof session._getMapPlayers === 'function'
    ? session._getMapPlayers(mapId, line)
    : [];
  broadcastMapEvent(session, 1401, { mapId, mapPlayer: selfInfo });

  logger.debug(
    `[DEBUG] tag:1400 mapId=${mapId} reqMapId=${reqMapId} boxLevel=${boxLevel} `
    + `spawn=(${x},${y}) selfInfo=${JSON.stringify(selfInfo)}`
  );

  const messages = [
    {
      // Push enter-map payload as msgUid=0, so client dispatches regNetMsg(1400)->mapEnter.
      tag: 1400,
      msgUid: 0,
      data: {
        mapId,
        x,
        y,
        line,
        selfInfo,
        players: Array.isArray(players) ? players : [],
      },
    },
  ];

  // Dungeon scenes consume these two player refresh pushes immediately after map entry.
  if (mapId >= 20000) {
    messages.push(
      {
        tag: 1416,
        msgUid: 0,
        data: { id: player.playerId || session.userId || '', value: 0 },
      },
      {
        tag: 1417,
        msgUid: 0,
        // Dungeon client handles this push in UpdatePlayerShowInfo and passes
        // the whole object to FashionModel.CreteShowDataByInfo.  Sending only
        // dbid/fashionMap leaves kungfuId/subJob/equipMap undefined; the
        // client then indexes RoleGenderConfig[undefined][0] and its map FSM
        // stops before the role can be created. Keep the same complete shape
        // as the map selfInfo payload while preserving the exact dbid/map.
        data: {
          ...showInfo,
          dbid: player.playerId || session.userId || '',
          fashionMap: getPlayerFashionMap(player),
        },
      },
    );
  }

  // Keep rpc callback chain consistent for callers that sent non-zero msgUid.
  if (msgUid) {
    messages.push({
      tag: 1400,
      msgUid,
      data: { result: 0 },
    });
  }

  return messages;
}

function getSessionMapId(session = {}, requestedMapId = 0) {
  const mapConfig = configService.get('MapConfig') || {};
  const currentMapId = Math.max(0, toSafeInt(session._mapId, 0));
  const requested = Math.max(0, toSafeInt(requestedMapId, 0));
  // Once mapEnter has established the scene, the server-side session is the
  // authority. Config loading may briefly be unavailable during startup; do
  // not drop movement and leave the local role FSM stuck in that window.
  if (currentMapId > 0) {
    return currentMapId;
  }
  const hasMapConfig = Object.keys(mapConfig).length > 0;
  if (requested > 0 && (!hasMapConfig || mapConfig[requested] || mapConfig[String(requested)])) {
    return requested;
  }
  return 0;
}

function broadcastMapEvent(session, tag, data) {
  if (session && typeof session._broadcastMapExceptUser === 'function') {
    session._broadcastMapExceptUser(tag, data);
  } else if (session && typeof session._broadcastExceptUser === 'function') {
    session._broadcastExceptUser(tag, data);
  }
  return null;
}

// Move map role (tag:1402)
function handleMapMove(params = {}, session) {
  const player = session && session.player ? session.player : {};
  const mapId = getSessionMapId(session, params.mapId);
  if (mapId <= 0) return null;
  const data = {
    id: player.playerId || session.userId || '',
    mapId,
    type: toSafeInt(params.type, 0),
    x: toSafeInt(params.x, toSafeInt(session._mapPos && session._mapPos.x, 0)),
    y: toSafeInt(params.y, toSafeInt(session._mapPos && session._mapPos.y, 0)),
  };
  session._mapPos = { x: data.x, y: data.y };
  if (isPersistableNormalMap(mapId)) {
    player.lastMapId = mapId;
    player.lastMapLine = Math.max(0, toSafeInt(session._mapLine, 0));
    player.lastMapPos = { ...session._mapPos };
  }
  if (session._mapSelfInfo && typeof session._mapSelfInfo === 'object') {
    session._mapSelfInfo.x = data.x;
    session._mapSelfInfo.y = data.y;
  }
  return broadcastMapEvent(session, 1403, data);
}

// Move map role compatibility (tag:1403)
function handleMapMoveCompat(params = {}, session) {
  const player = session && session.player ? session.player : {};
  const mapId = getSessionMapId(session, params.mapId);
  if (mapId <= 0) return null;
  const data = {
    id: player.playerId || session.userId || '',
    mapId,
    pos: params.pos || session._mapPos || null,
    dest: params.dest || null,
    nodes: Array.isArray(params.nodes) ? params.nodes : [],
  };
  if (data.dest && Number.isFinite(Number(data.dest.x)) && Number.isFinite(Number(data.dest.y))) {
    session._mapPos = { x: toSafeInt(data.dest.x, 0), y: toSafeInt(data.dest.y, 0) };
    if (isPersistableNormalMap(mapId)) {
      player.lastMapId = mapId;
      player.lastMapLine = Math.max(0, toSafeInt(session._mapLine, 0));
      player.lastMapPos = { ...session._mapPos };
    }
    if (session._mapSelfInfo && typeof session._mapSelfInfo === 'object') {
      session._mapSelfInfo.x = session._mapPos.x;
      session._mapSelfInfo.y = session._mapPos.y;
    }
  }
  return broadcastMapEvent(session, 1404, data);
}

// Map fly/path finding compatibility (tag:1404)
function handleMapPathFinding(params = {}, session) {
  const player = session && session.player ? session.player : {};
  const mapId = getSessionMapId(session, params.mapId);
  if (mapId <= 0) return null;
  const x = toSafeInt(params.x, toSafeInt(session._mapPos && session._mapPos.x, 0));
  const y = toSafeInt(params.y, toSafeInt(session._mapPos && session._mapPos.y, 0));
  const nodes = Array.isArray(params.nodes) ? params.nodes : [];
  const data = {
    mapId,
    id: player.playerId || session.userId || '',
    x,
    y,
    dest: params.dest || (nodes.length > 0 ? nodes[nodes.length - 1] : null),
    nodes,
  };
  session._mapPos = { x, y };
  if (isPersistableNormalMap(mapId)) {
    player.lastMapId = mapId;
    player.lastMapLine = Math.max(0, toSafeInt(session._mapLine, 0));
    player.lastMapPos = { ...session._mapPos };
  }
  if (session._mapSelfInfo && typeof session._mapSelfInfo === 'object') {
    session._mapSelfInfo.x = x;
    session._mapSelfInfo.y = y;
  }
  broadcastMapEvent(session, 1405, data);
  // mapFly does not ignore the local actor. The sender needs this push when
  // mapEnter corrects an unwalkable spawn point.
  return { tag: 1405, msgUid: 0, data };
}

function handleMapStraightPath(params = {}, session) {
  const player = session && session.player ? session.player : {};
  const mapId = getSessionMapId(session, params.mapId);
  if (mapId <= 0) return null;
  const data = {
    id: player.playerId || session.userId || '',
    mapId,
    pos: params.pos || null,
    dest: params.dest || null,
  };
  if (data.dest && Number.isFinite(Number(data.dest.x)) && Number.isFinite(Number(data.dest.y))) {
    session._mapPos = { x: toSafeInt(data.dest.x, 0), y: toSafeInt(data.dest.y, 0) };
    if (isPersistableNormalMap(mapId)) {
      player.lastMapId = mapId;
      player.lastMapLine = Math.max(0, toSafeInt(session._mapLine, 0));
      player.lastMapPos = { ...session._mapPos };
    }
    if (session._mapSelfInfo && typeof session._mapSelfInfo === 'object') {
      session._mapSelfInfo.x = session._mapPos.x;
      session._mapSelfInfo.y = session._mapPos.y;
    }
  }
  return broadcastMapEvent(session, 1406, data);
}

function handleMapAnime(params = {}, session) {
  const player = session && session.player ? session.player : {};
  const mapId = getSessionMapId(session, params.mapId);
  if (mapId <= 0) return null;
  const data = {
    id: player.playerId || session.userId || '',
    mapId,
    animeId: toSafeInt(params.animeId, 0),
    type: toSafeInt(params.type, 0),
  };
  broadcastMapEvent(session, 1418, data);
  return { tag: 1418, msgUid: 0, data };
}

// Map emoji compatibility (tag:1410)
function handleMapEmoji(params = {}, session) {
  const player = session && session.player ? session.player : {};
  const mapId = getSessionMapId(session, params.mapId);
  if (mapId <= 0) return null;
  const data = {
    mapId,
    id: player.playerId || session.userId || '',
    index: toSafeInt(params.index, 0),
  };
  broadcastMapEvent(session, 1410, data);
  return { tag: 1410, msgUid: 0, data };
}

// Leave map (tag:1401)
function handleMapLeave(params = {}, session = {}) {
  const player = session && session.player ? session.player : {};
  const mapId = getSessionMapId(session, params.mapId);
  if (mapId <= 0) return null;
  releasePendingMapMonsterClaim(session);
  const data = {
    id: player.playerId || session.userId || '',
    mapId,
  };
  const result = broadcastMapEvent(session, 1402, data);
  session._mapId = 0;
  session._mapLine = 0;
  session._mapPos = null;
  session._mapSelfInfo = null;
  return result;
}

async function resolveDetailTarget(params = {}, session = {}) {
  const targetPlayerId = String(params.playerId || params.dbid || '').trim();
  const selfPlayer = session && session.player ? session.player : null;

  if (!targetPlayerId) return selfPlayer || {};
  if (selfPlayer) {
    const selfIds = [selfPlayer.playerId, selfPlayer._id].filter(Boolean).map(String);
    if (selfIds.includes(targetPlayerId)) return selfPlayer;
  }

  if (botPopulation && typeof botPopulation.getBotPlayer === 'function') {
    const botPlayer = botPopulation.getBotPlayer(targetPlayerId);
    if (botPlayer) return botPlayer;
  }

  const wsServer = runtimeBus.getWsServer();
  if (wsServer && typeof wsServer.getRealBotPlayer === 'function') {
    const managedBotPlayer = wsServer.getRealBotPlayer(targetPlayerId);
    if (managedBotPlayer) return managedBotPlayer;
  }

  const isDbConnected = (() => {
    try {
      const mongoose = require('mongoose');
      return Boolean(mongoose.connection && mongoose.connection.readyState === 1);
    } catch (_) {
      return false;
    }
  })();

  if (isDbConnected && typeof playerService.findByDbidOrPlayerId === 'function') {
    const found = await playerService.findByDbidOrPlayerId(targetPlayerId);
    if (found) return found;
  }

  // Cross server fallback when client calls RPC 500 for a cross-server opponent
  if (isDbConnected && targetPlayerId) {
    const localServerId = Number(session && session.serverId || selfPlayer && selfPlayer.serverId || process.env.SERVER_ID || 1001);
    const requestedServerId = Number(params.serverId || 0);
    const crossArena = require('../services/CrossArenaService');
    if (requestedServerId > 0 && requestedServerId !== localServerId) {
      try {
        const crossPlayer = await crossArena.profile(requestedServerId, targetPlayerId);
        if (crossPlayer) return crossPlayer;
      } catch (_) {}
    } else {
      try {
        const cross = require('../services/CrossServerEventService');
        const serverIds = cross && typeof cross.getServerIds === 'function'
          ? cross.getServerIds()
          : [1001, 1002, 1003, 1004, 1005];
        for (const sid of serverIds) {
          if (sid === localServerId) continue;
          const crossPlayer = await crossArena.profile(sid, targetPlayerId);
          if (crossPlayer) return crossPlayer;
        }
      } catch (_) {}
    }
  }

  return null;
}

// Get player detail (tag:500)
async function handleGetPlayerDetail(params = {}, session, msgUid) {
  const targetPlayerId = String(params.playerId || params.dbid || '').trim();
  const player = await resolveDetailTarget(params, session);
  if (!player) {
    return {
      tag: 500,
      msgUid,
      data: buildOtherPlayerDetail({
        playerId: targetPlayerId,
        name: targetPlayerId ? `Player_${targetPlayerId.slice(-4)}` : 'Unknown',
        level: 1,
        roleInfo: { kungfuId: 4, stage: 1, stageId: 1, subJob: 0 },
      }, params, -1),
    };
  }
  refreshMainTaskProgress(player);
  refreshRealmStageTasks(player);
  return {
    tag: 500,
    msgUid,
    data: targetPlayerId ? buildOtherPlayerDetail(player, params, 0) : buildPlayer500Data(player),
  };
}

// Get cross player detail (tag:502)
async function handleGetPlayerDetailCross(params = {}, session, msgUid) {
  const targetPlayerId = String(params.playerId || params.dbid || '').trim();
  const selfPlayer = session && session.player ? session.player : null;
  const localServerId = Number(session && session.serverId || selfPlayer && selfPlayer.serverId || process.env.SERVER_ID || 1001);
  const requestedServerId = Number(params.serverId || localServerId);

  const isDbConnected = (() => {
    try {
      const mongoose = require('mongoose');
      return Boolean(mongoose.connection && mongoose.connection.readyState === 1);
    } catch (_) {
      return false;
    }
  })();

  const selfIds = selfPlayer ? [String(selfPlayer.playerId || ''), String(selfPlayer._id || '')].filter(Boolean) : [];
  let targetPlayer = null;
  if (targetPlayerId && selfPlayer && selfIds.includes(targetPlayerId)) {
    targetPlayer = selfPlayer;
  } else if (targetPlayerId && isDbConnected) {
    if (requestedServerId !== localServerId) {
      targetPlayer = await require('../services/CrossArenaService').profile(requestedServerId, targetPlayerId);
    } else {
      targetPlayer = typeof playerService.findByDbidOrPlayerId === 'function'
        ? await playerService.findByDbidOrPlayerId(targetPlayerId)
        : await playerService.findByPlayerId(targetPlayerId);
    }
    if (!targetPlayer) {
      try {
        const crossArena = require('../services/CrossArenaService');
        targetPlayer = await crossArena.profile(requestedServerId, targetPlayerId);
      } catch (_) {}
    }
  }

  if (!targetPlayer) {
    const fallbackId = targetPlayerId || (selfPlayer && selfPlayer.playerId) || '';
    const fallbackName = fallbackId ? `Player_${fallbackId.slice(-4)}` : 'Unknown';
    const serverId = Number(params.serverId || selfPlayer && selfPlayer.serverId || process.env.SERVER_ID || process.env.DEFAULT_SERVER_ID || 1);
    return {
      tag: 502,
      msgUid,
      data: {
        ...buildOtherPlayerDetail({
          playerId: fallbackId,
          name: fallbackName,
          level: 1,
          roleInfo: { kungfuId: 4, stage: 1, stageId: 1, subJob: 0 },
        }, params, -1),
        playerId: fallbackId,
        dbid: fallbackId,
        serverId,
      },
    };
  }

  const resolvedId = String(targetPlayer.playerId || targetPlayerId || '');
  const serverId = Number(targetPlayer.serverId || params.serverId || (selfPlayer && selfPlayer.serverId) || process.env.SERVER_ID || 1001);
  const detail = buildOtherPlayerDetail(targetPlayer, { ...params, serverId }, 0);
  return {
    tag: 502,
    msgUid,
    data: {
      ...detail,
      playerId: resolvedId,
      dbid: String(targetPlayer._id || resolvedId),
      serverId,
      serverName: detail.serverName,
    },
  };
}


// Echo (tag:10)
function handleEcho(params, _session, msgUid) {
  return { tag: 10, msgUid, data: params };
}

// Silence privilege (tag:304)
function handleSilencePrivilege(_params, _session, msgUid) {
  return { tag: 304, msgUid, data: { status: 0, endTime: 0 } };
}

// Change birthday (tag:23)
async function handleChangeBirth(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 23, msgUid, data: { result: -1, birth: 0, changeBirth: 0 } };

  const month = toSafeInt(params && params.month, 0);
  const day = toSafeInt(params && params.day, 0);
  const maxDay = month >= 1 && month <= 12
    ? new Date(2024, month, 0).getDate()
    : 0;
  if (month < 1 || month > 12 || day < 1 || day > maxDay) {
    return {
      tag: 23,
      msgUid,
      data: {
        result: 1,
        birth: toSafeInt(player.birth, 0),
        changeBirth: toSafeInt(player.changeBirth, 0),
      },
    };
  }

  player.birth = month * 100 + day;
  player.changeBirth = Math.max(0, toSafeInt(player.changeBirth, 0)) + 1;
  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  return {
    tag: 23,
    msgUid,
    data: {
      result: 0,
      birth: player.birth,
      changeBirth: player.changeBirth,
    },
  };
}

module.exports = {
  buildMapShowInfo,
  refreshManagedBotMapAppearance,
  handleHeartbeat,
  getMailInit,
  getHorseRaceInit,
  handleGetGuildList,
  handleEnterMap,
  handleMapMove,
  handleMapMoveCompat,
  handleMapPathFinding,
  handleMapStraightPath,
  handleMapAnime,
  handleMapEmoji,
  handleMapLeave,
  handleGetPlayerDetail,
  handleGetPlayerDetailCross,
  buildOtherPlayerDetail,
  handleEcho,
  handleSilencePrivilege,
  handleChangeBirth,
};

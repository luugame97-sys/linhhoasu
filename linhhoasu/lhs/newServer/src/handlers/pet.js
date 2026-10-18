/**
 * 宠物系统
 * tag: 3300 开蛋, 3301 改变槽位, 3302 合成, 3304 升级, 3305 锁定被动技能
 */

const config = require('../services/ConfigService');
const playerService = require('../services/PlayerService');
const logger = require('../logger');
const petMutation = require('../services/PlayerMutationService');
const petReceipts = require('../services/FeatureReceiptService');
const petRuntime = require('../services/RuntimeBus');
const {
  addPetComposeCount,
  addPetWashCount,
  refreshMainTaskProgress,
} = require('../services/MainTaskProgressService');
const { addRewardToPlayer } = require('./raid');

const FREE_PET_EGG_ITEM_ID = 24;
const FREE_PET_EGG_RECOVER_MS = 6 * 60 * 60 * 1000;
const FREE_PET_EGG_MAX = 5;
const PET_SWAP_PILL_ITEM_ID = 162;

function toSafeInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function getCurrencyKeyById(itemId) {
  switch (toSafeInt(itemId, 0)) {
    case 1: return 'diamond';
    case 2: return 'silver';
    case 6: return 'gold';
    default: return null;
  }
}

function parseBool(value, fallback = false) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(text)) return false;
  return fallback;
}

function isPetComposeFailOpenEnabled() {
  return false;
}

function hasEnoughItemOrCurrency(player, itemId, count) {
  const id = toSafeInt(itemId, 0);
  const need = Math.max(0, toSafeInt(count, 0));
  if (id <= 0 || need <= 0) return true;

  const currKey = getCurrencyKeyById(id);
  if (currKey) {
    player.currencies = player.currencies || { gold: 0, diamond: 0, silver: 0 };
    return toSafeInt(player.currencies[currKey], 0) >= need;
  }

  player.items = player.items || {};
  return toSafeInt(player.items[id], 0) >= need;
}

function consumeItemOrCurrency(player, itemId, count) {
  if (!hasEnoughItemOrCurrency(player, itemId, count)) return false;
  const id = toSafeInt(itemId, 0);
  const need = Math.max(0, toSafeInt(count, 0));
  if (id <= 0 || need <= 0) return true;

  const currKey = getCurrencyKeyById(id);
  if (currKey) {
    player.currencies = player.currencies || { gold: 0, diamond: 0, silver: 0 };
    player.currencies[currKey] = Math.max(0, toSafeInt(player.currencies[currKey], 0) - need);
    return true;
  }

  player.items = player.items || {};
  player.items[id] = Math.max(0, toSafeInt(player.items[id], 0) - need);
  return true;
}

function getItemOrCurrencyCount(player, itemId) {
  const id = toSafeInt(itemId, 0);
  if (id <= 0) return 0;

  const currKey = getCurrencyKeyById(id);
  if (currKey) {
    return Math.max(0, toSafeInt(player && player.currencies && player.currencies[currKey], 0));
  }
  return Math.max(0, toSafeInt(player && player.items && player.items[id], 0));
}

function buildPetCostSync(player, beforeCostMap = {}, afterCostMap = {}) {
  const items = [];
  const changed = [];
  const itemIds = new Set([
    ...Object.keys(beforeCostMap || {}).map((key) => toSafeInt(key, 0)),
    ...Object.keys(afterCostMap || {}).map((key) => toSafeInt(key, 0)),
  ]);

  itemIds.forEach((itemId) => {
    if (itemId <= 0) return;
    const before = Math.max(0, toSafeInt(beforeCostMap[itemId], 0));
    const after = Math.max(0, toSafeInt(afterCostMap[itemId], 0));
    if (before === after) return;
    items.push({ id: itemId, count: after - before });
    changed.push({ id: itemId, count: after });
  });

  if (changed.length === 0) return null;
  return {
    tag: 1202,
    msgUid: 0,
    data: {
      result: 0,
      items,
      changed,
    },
  };
}

function buildPetRewardPayload(rewards = []) {
  const items = Array.isArray(rewards) ? rewards : [];
  return {
    items,
    equips: [],
    heros: [],
    swords: [],
    pets: [],
    artifacts: [],
    gems: [],
    valhalla: [],
    bloodline: [],
    fashion: [],
    elves: [],
    sailor: [],
    extraReward: {},
  };
}

function randomPickWeighted(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const valid = entries.filter((row) => row && row.weight > 0);
  if (valid.length === 0) return entries[0] || null;
  const total = valid.reduce((sum, row) => sum + row.weight, 0);
  let roll = Math.random() * total;
  for (const row of valid) {
    roll -= row.weight;
    if (roll <= 0) return row;
  }
  return valid[valid.length - 1];
}

function getPetCfgMap() {
  return config.get('PetConfig') || {};
}

function getPetCfgById(petId) {
  return getPetCfgMap()[toSafeInt(petId, 0)] || null;
}

function getFallbackPetId() {
  const petCfg = getPetCfgMap();
  const ids = Object.keys(petCfg).map((k) => toSafeInt(k, 0)).filter((id) => id > 0);
  return ids.length > 0 ? ids[0] : 82001;
}

function getPetQuality(petId) {
  const row = getPetCfgById(petId);
  return Math.max(2, toSafeInt(row && row.quality, 2));
}

function getPetType(petId) {
  const row = getPetCfgById(petId);
  return Math.max(0, toSafeInt(row && row.type, 0));
}

function getPetTag(petId) {
  const row = getPetCfgById(petId);
  return Math.max(0, toSafeInt(row && row.tag, 0));
}

function getMaxPetQuality() {
  const qualityCfg = config.get('PetQualityConfig') || {};
  const keys = Object.keys(qualityCfg).map((k) => toSafeInt(k, 0)).filter((v) => v > 0);
  if (keys.length === 0) return 9;
  return Math.max(...keys);
}

function getNextPetQuality(quality) {
  const target = Math.max(1, toSafeInt(quality, 1));
  const qualityCfg = config.get('PetQualityConfig') || {};
  const qualities = Object.keys(qualityCfg)
    .map((key) => toSafeInt(key, 0))
    .filter((value) => value > 0)
    .sort((a, b) => a - b);
  const next = qualities.find((value) => value > target);
  return next == null ? target : next;
}

function getPetLevelMax(player, pet) {
  const baseCfg = config.get('PetBaseConfig') || {};
  const baseMax = Math.max(1, toSafeInt(baseCfg.levelMax, 200));
  if (!player || !pet || !(baseCfg.breakLimitPetQuality || []).includes(getPetQuality(pet.id))) return baseMax;
  // Native PetModel.getPetLevelMax -> PetSoulModel.getCoercionValue/Stage.
  const soulInfo = player.other_attr_info && player.other_attr_info.petSoulInfo || player.petSoulInfo || {};
  const soulCfg = config.get('PetSoulConfig') || {};
  const upgrades = config.get('PetSoulUpgradeConfig') || {};
  const seen = new Set();
  const value = (Array.isArray(soulInfo.petSouls) ? soulInfo.petSouls : []).reduce((sum, soul) => {
    if (!soul || seen.has(soul.id)) return sum;
    seen.add(soul.id);
    const row = soulCfg[soul.id];
    const upgrade = row && upgrades[row.quality] && upgrades[row.quality][soul.star];
    return sum + Math.max(0, toSafeInt(upgrade && upgrade.coercion, 0));
  }, 0);
  const stages = Object.values(config.get('CoercionConfig') || {}).sort((a, b) => a.stage - b.stage);
  let bonus = 0;
  for (const stage of stages) {
    if (value < stage.coercion) break;
    bonus = Math.max(0, toSafeInt(stage.limitLevelUp, 0));
  }
  return baseMax + bonus;
}

function pickPassiveSkills(petId, quality) {
  const qualityCfg = (config.get('PetQualityConfig') || {})[quality] || {};
  const skillCount = Math.max(0, toSafeInt(qualityCfg.passiveSkillCount, 0));
  if (skillCount <= 0) return [];

  const petType = getPetType(petId);
  const skillCfg = config.get('PetPassiveSkillConfig') || {};
  const candidates = Object.keys(skillCfg)
    .map((k) => toSafeInt(k, 0))
    .filter((id) => {
      const row = skillCfg[id];
      if (!row) return false;
      const skillQuality = Math.max(1, toSafeInt(row.quality, 1));
      const type = Math.max(0, toSafeInt(row.type, 0));
      return skillQuality <= quality && (type === 0 || type === petType);
    });

  if (candidates.length === 0) return [];

  const picked = [];
  const skillInfoCfg = config.get('SkillConfig') || {};
  const usedFamilies = new Set();
  const shuffled = candidates.slice().sort(() => Math.random() - 0.5);

  // Prioritize distinct skill families (skillName)
  for (const id of shuffled) {
    if (picked.length >= skillCount) break;
    const fam = toSafeInt((skillInfoCfg[id] || {}).skillName, id);
    if (!usedFamilies.has(fam)) {
      usedFamilies.add(fam);
      picked.push(id);
    }
  }

  // Fill remaining slots if any
  for (const id of shuffled) {
    if (picked.length >= skillCount) break;
    if (!picked.includes(id)) {
      picked.push(id);
    }
  }
  return picked;
}

function normalizePet(rawPet, info) {
  const pet = rawPet && typeof rawPet === 'object' ? rawPet : {};
  const id = toSafeInt(pet.id, getFallbackPetId());
  const quality = getPetQuality(id);
  const level = Math.max(1, toSafeInt(pet.level, 1));
  const uid = toSafeInt(pet.uid, 0) > 0 ? toSafeInt(pet.uid, 0) : toSafeInt(info.nextUid, 100001);
  if (uid >= toSafeInt(info.nextUid, 100001)) info.nextUid = uid + 1;

  const passiveSkills = Array.isArray(pet.passiveSkills) && pet.passiveSkills.length > 0
    ? pet.passiveSkills.map((v) => toSafeInt(v, 0)).filter((v) => v > 0)
    : pickPassiveSkills(id, quality);
  const lockSkills = (Array.isArray(pet.lockSkills) ? pet.lockSkills : [])
    .map((v) => toSafeInt(v, -1))
    .filter((v, idx, arr) => v >= 0 && v < passiveSkills.length && arr.indexOf(v) === idx);
  const locked = toSafeInt(pet.locked, toSafeInt(pet.lock, 0)) > 0 ? 1 : 0;

  return {
    ...pet,
    uid,
    id,
    level,
    slot: toSafeInt(pet.slot, -1),
    exp: Math.max(0, toSafeInt(pet.exp, 0)),
    locked,
    lock: locked,
    passiveSkills,
    lockSkills,
  };
}

function ensurePetInfo(player) {
  const baseCfg = config.get('PetBaseConfig') || {};

  player.petInfo = player.petInfo && typeof player.petInfo === 'object' && !Array.isArray(player.petInfo)
    ? player.petInfo
    : {};

  const info = player.petInfo;
  if (!Array.isArray(info.pets)) info.pets = [];
  if (!Array.isArray(info.unlockAtlas)) info.unlockAtlas = [];
  if (!Array.isArray(info.rewardedAtlas)) info.rewardedAtlas = [];
  if (!info.wishMap || typeof info.wishMap !== 'object' || Array.isArray(info.wishMap)) info.wishMap = {};
  if (info.field == null) info.field = Math.max(1, toSafeInt(baseCfg.initialField, 8));
  info.field = Math.max(1, toSafeInt(info.field, Math.max(1, toSafeInt(baseCfg.initialField, 8))));
  // Paid legacy slots and their occupants retain their indexes. The release
  // grants free capacity on hydration, without moving or re-creating pets.
  if (toSafeInt(baseCfg.freeFieldCount, 0) === 48) info.field = Math.max(48, info.field);
  if (info.skillWashLevel == null || toSafeInt(info.skillWashLevel, 0) <= 0) info.skillWashLevel = 1;
  if (info.skillWashExp == null) info.skillWashExp = 0;
  if (!info.timeRecords || typeof info.timeRecords !== 'object' || Array.isArray(info.timeRecords)) info.timeRecords = {};

  const maxUid = info.pets.reduce((m, row) => Math.max(m, toSafeInt(row && row.uid, 0)), 100000);
  if (!Number.isFinite(Number(info.nextUid)) || toSafeInt(info.nextUid, 0) <= maxUid) {
    info.nextUid = maxUid + 1;
  }

  info.pets = info.pets.map((pet) => normalizePet(pet, info));
  info.unlockAtlas = info.unlockAtlas
    .map((v) => toSafeInt(v, 0))
    .filter((v, idx, arr) => v > 0 && arr.indexOf(v) === idx);
  info.rewardedAtlas = info.rewardedAtlas
    .map((v) => toSafeInt(v, 0))
    .filter((v, idx, arr) => v > 0 && arr.indexOf(v) === idx);

  return info;
}

function getPetTimeRecordStart(info, itemId) {
  const safeInfo = info && typeof info === 'object' ? info : {};
  const records = safeInfo.timeRecords && typeof safeInfo.timeRecords === 'object' && !Array.isArray(safeInfo.timeRecords)
    ? safeInfo.timeRecords
    : {};
  return Math.max(0, toSafeInt(records[itemId], 0));
}

function setPetTimeRecordStart(info, itemId, startTime) {
  if (!info || typeof info !== 'object') return;
  if (!info.timeRecords || typeof info.timeRecords !== 'object' || Array.isArray(info.timeRecords)) {
    info.timeRecords = {};
  }
  const safeTime = Math.max(0, toSafeInt(startTime, 0));
  if (safeTime > 0) info.timeRecords[itemId] = safeTime;
  else delete info.timeRecords[itemId];
}

function settleFreePetEgg(player) {
  if (!player || typeof player !== 'object') return false;
  const fieldBefore = toSafeInt(player.petInfo && player.petInfo.field, 0);
  const info = ensurePetInfo(player);
  player.items = player.items && typeof player.items === 'object' && !Array.isArray(player.items) ? player.items : {};

  let count = Math.max(0, toSafeInt(player.items[FREE_PET_EGG_ITEM_ID], 0));
  let startTime = getPetTimeRecordStart(info, FREE_PET_EGG_ITEM_ID);
  const now = Date.now();
  // Login persists this changed flag, including the free-capacity upgrade.
  let changed = fieldBefore !== info.field;

  if (count >= FREE_PET_EGG_MAX) {
    if (count > FREE_PET_EGG_MAX) {
      count = FREE_PET_EGG_MAX;
      changed = true;
    }
    if (startTime !== 0) {
      startTime = 0;
      changed = true;
    }
  } else if (startTime <= 0) {
    startTime = now;
    changed = true;
  } else {
    const elapsed = now - startTime;
    if (elapsed >= FREE_PET_EGG_RECOVER_MS) {
      const gained = Math.floor(elapsed / FREE_PET_EGG_RECOVER_MS);
      if (gained > 0) {
        count = Math.min(FREE_PET_EGG_MAX, count + gained);
        changed = true;
        if (count >= FREE_PET_EGG_MAX) startTime = 0;
        else startTime += gained * FREE_PET_EGG_RECOVER_MS;
      }
    }
  }

  player.items[FREE_PET_EGG_ITEM_ID] = count;
  if (count <= 0) delete player.items[FREE_PET_EGG_ITEM_ID];
  setPetTimeRecordStart(info, FREE_PET_EGG_ITEM_ID, startTime);
  return changed;
}

function buildPetTimeRecordPayload(player) {
  const info = ensurePetInfo(player);
  settleFreePetEgg(player);
  return {
    [FREE_PET_EGG_ITEM_ID]: getPetTimeRecordStart(info, FREE_PET_EGG_ITEM_ID),
  };
}

function buildPetDataUpdatePacket(pets = [], msgUid = 0) {
  const data = (Array.isArray(pets) ? pets : [pets])
    .filter((pet) => pet && typeof pet === 'object');
  if (data.length <= 0) return null;
  return { tag: 3301, msgUid, data: { data } };
}

function addUnlockAtlas(info, petId) {
  const id = toSafeInt(petId, 0);
  if (id <= 0) return;
  if (!info.unlockAtlas.includes(id)) info.unlockAtlas.push(id);
}

function findPetByUid(info, uid) {
  const targetUid = toSafeInt(uid, 0);
  return info.pets.find((row) => toSafeInt(row && row.uid, 0) === targetUid) || null;
}

function findFirstEmptyComposeSlot(info) {
  const occupied = new Set(
    info.pets
      .map((row) => toSafeInt(row && row.slot, -1))
      .filter((slot) => slot >= 0)
  );
  for (let i = 0; i < Math.max(1, toSafeInt(info.field, 8)); i++) {
    if (!occupied.has(i)) return i;
  }
  return -1;
}

function createPet(info, petId, slot) {
  const id = toSafeInt(petId, getFallbackPetId());
  const quality = getPetQuality(id);
  return normalizePet({
    uid: info.nextUid++,
    id,
    level: 1,
    slot: toSafeInt(slot, -1),
    exp: 0,
    locked: 0,
    lock: 0,
    passiveSkills: pickPassiveSkills(id, quality),
    lockSkills: [],
  }, info);
}

function grantPetToPlayer(player, petId) {
  const info = ensurePetInfo(player);
  const id = toSafeInt(petId, 0);
  if (id <= 0) return null;
  const slot = findFirstEmptyComposeSlot(info);
  const pet = createPet(info, id, slot);
  info.pets.push(pet);
  addUnlockAtlas(info, pet.id);
  return pet;
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

function pickSkillByWashRate(petType, targetQuality) {
  const quality = Math.max(1, toSafeInt(targetQuality, 1));
  const skillCfg = config.get('PetPassiveSkillConfig') || {};
  const candidates = Object.keys(skillCfg)
    .map((k) => toSafeInt(k, 0))
    .filter((id) => {
      const row = skillCfg[id];
      if (!row) return false;
      const skillQuality = Math.max(1, toSafeInt(row.quality, 1));
      const type = Math.max(0, toSafeInt(row.type, 0));
      return skillQuality === quality && (type === 0 || type === petType);
    });
  if (candidates.length === 0) {
    const fallback = pickPassiveSkills(getFallbackPetId(), quality);
    return fallback.length > 0 ? fallback[0] : 800001;
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function pickDistinctWashSkill(petType, targetQuality, usedSkillIds, usedSkillFamilies) {
  const quality = Math.max(1, toSafeInt(targetQuality, 1));
  const passiveCfg = config.get('PetPassiveSkillConfig') || {};
  const skillCfg = config.get('SkillConfig') || {};

  // 1. Primary: matching targetQuality, matching petType/universal (0),
  // not in usedSkillIds, and not in usedSkillFamilies
  let candidates = Object.keys(passiveCfg)
    .map((k) => toSafeInt(k, 0))
    .filter((id) => {
      const row = passiveCfg[id];
      if (!row) return false;
      const skillQuality = Math.max(1, toSafeInt(row.quality, 1));
      const type = Math.max(0, toSafeInt(row.type, 0));
      if (skillQuality !== quality) return false;
      if (type !== 0 && type !== petType) return false;
      if (usedSkillIds && usedSkillIds.has(id)) return false;
      const fam = toSafeInt((skillCfg[id] || {}).skillName, id);
      if (usedSkillFamilies && usedSkillFamilies.has(fam)) return false;
      return true;
    });

  // 2. Fallback: same quality and element, allow unique ID if all families exhausted
  if (candidates.length === 0) {
    candidates = Object.keys(passiveCfg)
      .map((k) => toSafeInt(k, 0))
      .filter((id) => {
        const row = passiveCfg[id];
        if (!row) return false;
        const skillQuality = Math.max(1, toSafeInt(row.quality, 1));
        const type = Math.max(0, toSafeInt(row.type, 0));
        if (skillQuality !== quality) return false;
        if (type !== 0 && type !== petType) return false;
        return !usedSkillIds || !usedSkillIds.has(id);
      });
  }

  // 3. Fallback: any matching element skill with unused ID
  if (candidates.length === 0) {
    candidates = Object.keys(passiveCfg)
      .map((k) => toSafeInt(k, 0))
      .filter((id) => {
        const row = passiveCfg[id];
        if (!row) return false;
        const type = Math.max(0, toSafeInt(row.type, 0));
        return (type === 0 || type === petType) && (!usedSkillIds || !usedSkillIds.has(id));
      });
  }

  const picked = candidates.length > 0
    ? candidates[Math.floor(Math.random() * candidates.length)]
    : 800001;

  if (usedSkillIds) usedSkillIds.add(picked);
  if (usedSkillFamilies) {
    const fam = toSafeInt((skillCfg[picked] || {}).skillName, picked);
    usedSkillFamilies.add(fam);
  }
  return picked;
}

function rollSkillQualityByWashLevel(washLevel) {
  const washCfg = (config.get('PetPassiveSkillWashConfig') || {})[Math.max(1, toSafeInt(washLevel, 1))] || {};
  const rates = Array.isArray(washCfg.rate) ? washCfg.rate : [];
  const entries = rates
    .map((row) => ({ id: toSafeInt(row && row.id, 0), weight: Math.max(0, toSafeInt(row && row.weight, 0)) }))
    .filter((row) => row.id > 0 && row.weight > 0);
  const picked = randomPickWeighted(entries);
  return picked ? picked.id : 1;
}

function pickPetIdByQualityRange(minQuality, maxQuality, preferredType = -1) {
  const petCfg = getPetCfgMap();
  const candidates = Object.keys(petCfg)
    .map((k) => toSafeInt(k, 0))
    .filter((id) => {
      const row = petCfg[id];
      if (!row) return false;
      const quality = toSafeInt(row.quality, 0);
      const type = toSafeInt(row.type, 0);
      if (quality < minQuality || quality > maxQuality) return false;
      if (preferredType >= 0 && type !== preferredType) return false;
      return true;
    });

  if (candidates.length === 0) return null;
  const entries = candidates.map((id) => ({
    id,
    weight: Math.max(1, toSafeInt((petCfg[id] && petCfg[id].composeWeight), 100)),
  }));
  const picked = randomPickWeighted(entries);
  return picked ? picked.id : candidates[0];
}

function getEggQualityRange(eggId) {
  const id = toSafeInt(eggId, 24);
  if (id === 24) return [2, 4];
  if (id === 25) return [3, 6];
  if (id === 26) return [4, 9];
  return [2, 4];
}

function pickPetIdByEgg(eggId) {
  const eggCfg = (config.get('PetEggConfig') || {})[toSafeInt(eggId, 24)] || {};
  const pools = Array.isArray(eggCfg.pools) ? eggCfg.pools : [];
  const poolEntries = pools
    .map((row) => ({ id: toSafeInt(row && row.id, 0), weight: Math.max(0, toSafeInt(row && row.weight, 0)) }))
    .filter((row) => row.id > 0 && row.weight > 0);

  let minQuality = 2;
  let maxQuality = 4;
  const pickedPool = randomPickWeighted(poolEntries);
  if (pickedPool) {
    if (pickedPool.id === 1001) [minQuality, maxQuality] = [2, 4];
    else if (pickedPool.id === 1002) [minQuality, maxQuality] = [3, 6];
    else if (pickedPool.id === 1003) [minQuality, maxQuality] = [4, 9];
    else [minQuality, maxQuality] = getEggQualityRange(eggId);
  } else {
    [minQuality, maxQuality] = getEggQualityRange(eggId);
  }

  return pickPetIdByQualityRange(minQuality, maxQuality) || getFallbackPetId();
}

function countPetsByQuality(info, quality) {
  const targetQuality = toSafeInt(quality, 0);
  if (!info || !Array.isArray(info.pets) || targetQuality <= 0) return 0;
  return info.pets.reduce((count, pet) => (
    getPetQuality(pet && pet.id) === targetQuality ? count + 1 : count
  ), 0);
}

function pickPetIdForEgg(info, eggId) {
  const id = toSafeInt(eggId, 24);
  if (id === 24 && countPetsByQuality(info, 2) < 2) {
    return pickPetIdByQualityRange(2, 2) || pickPetIdByEgg(id);
  }
  return pickPetIdByEgg(id);
}

function pickComposeResultId(matPet, targetPet) {
  const source = targetPet || matPet;
  const sameType = matPet && targetPet && getPetType(matPet.id) === getPetType(targetPet.id);
  const sourceType = sameType && source ? getPetType(source.id) : -1;
  const baseQuality = Math.max(
    getPetQuality(matPet && matPet.id),
    getPetQuality(targetPet && targetPet.id)
  );
  // Quality tables intentionally skip q8 (q7 composes directly to q9).
  // Resolve the next configured quality instead of assuming a contiguous
  // integer sequence and falling back to an unrelated EXP pet.
  const resultQuality = Math.min(getMaxPetQuality(), Math.max(2, getNextPetQuality(baseQuality)));
  return pickPetIdByQualityRange(resultQuality, resultQuality, sourceType)
    || pickPetIdByQualityRange(resultQuality, resultQuality)
    || getFallbackPetId();
}

function pickComposeExpPetId(sourcePet) {
  const quality = getPetQuality(sourcePet && sourcePet.id);
  return pickPetIdByQualityRange(quality, quality, 0)
    || pickPetIdByQualityRange(quality, quality)
    || getFallbackPetId();
}

function getPetSoulBindingRows(player) {
  const rows = [];
  const holders = [
    player && player.other_attr_info && player.other_attr_info.petSoulInfo,
    player && player.petSoulInfo,
  ];
  holders.forEach((info) => {
    if (!info || !Array.isArray(info.petSouls)) return;
    info.petSouls.forEach((soul) => rows.push(soul));
  });
  return rows;
}

function isPetSoulBound(player, petUid) {
  const uid = toSafeInt(petUid, 0);
  if (uid <= 0) return false;
  return getPetSoulBindingRows(player).some((soul) => toSafeInt(soul && soul.petUid, -1) === uid);
}

function isPetLockedOrEquipped(player, pet) {
  if (!pet) return true;
  if (toSafeInt(pet.locked, toSafeInt(pet.lock, 0)) > 0) return true;
  if (isBattleSlot(pet.slot)) return true;
  return isPetSoulBound(player, pet.uid);
}

function canPetCompose(matPet, targetPet, player) {
  if (!matPet || !targetPet || matPet.uid === targetPet.uid) return false;
  if (!getPetCfgById(matPet.id) || !getPetCfgById(targetPet.id)) return false;
  if (isPetLockedOrEquipped(player, matPet) || isPetLockedOrEquipped(player, targetPet)) return false;
  if (getPetQuality(matPet.id) !== getPetQuality(targetPet.id)) return false;
  if (getPetQuality(targetPet.id) >= getMaxPetQuality()) return false;
  const matCfg = getPetCfgById(matPet.id) || {};
  const targetCfg = getPetCfgById(targetPet.id) || {};
  return toSafeInt(matCfg.tag, 1) !== 2 && toSafeInt(targetCfg.tag, 1) !== 2;
}

// One transition shared by manual and batch composition. The caller performs
// validation, charges exactly once, and persists before returning an ACK.
// Retain-primary q9 is still a candidate policy pending reference-runtime QA;
// it is not evidence that VUSA's server implements this exact contract.
function applyPetComposition(info, material, target, success) {
  const quality = getPetQuality(target.id);
  const retainPrimary = !success && quality >= 9;
  let result = target;
  if (retainPrimary) {
    info.pets = info.pets.filter(pet => pet.uid !== material.uid);
  } else {
    const id = success ? pickComposeResultId(material, target) : pickComposeExpPetId(target);
    result = createPet(info, id, target.slot);
    result.level = Math.max(1, toSafeInt(target.level, 1));
    info.pets = info.pets.filter(pet => pet.uid !== material.uid && pet.uid !== target.uid);
    info.pets.push(result);
    addUnlockAtlas(info, result.id);
  }
  return { result, retainPrimary };
}

function canPetEat(matPet, targetPet, player) {
  if (!matPet || !targetPet || matPet.uid === targetPet.uid) return false;
  if (toSafeInt(targetPet.id, 0) <= 0) return false;
  if (isPetLockedOrEquipped(player, matPet) || isPetLockedOrEquipped(player, targetPet)) return false;
  return getPetTag(matPet.id) === 2;
}

function isBattleSlot(slot) {
  const safeSlot = toSafeInt(slot, 0);
  return safeSlot <= -1 && safeSlot >= -3;
}

function isSwapBlockedPet(petId) {
  const quality = getPetQuality(petId);
  if (quality < Math.max(1, toSafeInt((config.get('PetBaseConfig') || {}).swapQuality, 7))) return true;
  if (quality > getMaxPetQuality()) return true;
  return getPetTag(petId) === 2;
}

function isValidWishPetId(quality, petId) {
  const id = toSafeInt(petId, 0);
  if (id <= 0) return false;
  if (getPetQuality(id) !== Math.max(1, toSafeInt(quality, 1))) return false;
  return !isSwapBlockedPet(id);
}

function getPetSwapItemCost(targetPet) {
  const cfg = getPetCfgById(targetPet && targetPet.id) || {};
  const row = cfg.swapCostItem && typeof cfg.swapCostItem === 'object'
    ? cfg.swapCostItem
    : { id: PET_SWAP_PILL_ITEM_ID, count: Math.max(1, toSafeInt(cfg.swapCostCount, 1)) };
  return {
    id: Math.max(0, toSafeInt(row.id, PET_SWAP_PILL_ITEM_ID)),
    count: Math.max(0, toSafeInt(row.count, 0)),
  };
}

function getPetSwapMaterialQuality(targetPet) {
  const cfg = getPetCfgById(targetPet && targetPet.id) || {};
  return Math.max(0, toSafeInt(cfg.swapCost, getPetQuality(targetPet && targetPet.id) - 1));
}

function canUsePetAsSwapMaterial(pet, requiredQuality, targetUid) {
  if (!pet) return false;
  if (toSafeInt(pet.uid, 0) === toSafeInt(targetUid, 0)) return false;
  if (toSafeInt(pet.locked, toSafeInt(pet.lock, 0)) > 0) return false;
  if (isBattleSlot(pet.slot)) return false;
  if (getPetTag(pet.id) === 2) return false;
  return getPetQuality(pet.id) === Math.max(0, toSafeInt(requiredQuality, 0));
}

function pickSwapResultId(info, targetPet, excludedIds = []) {
  const quality = getPetQuality(targetPet && targetPet.id);
  const excluded = new Set((Array.isArray(excludedIds) ? excludedIds : []).map((id) => toSafeInt(id, 0)).filter((id) => id > 0));
  excluded.add(toSafeInt(targetPet && targetPet.id, 0));
  const wishedId = toSafeInt(info && info.wishMap && info.wishMap[String(quality)], 0);
  if (isValidWishPetId(quality, wishedId) && !excluded.has(wishedId) && Math.random() < 0.5) {
    return wishedId;
  }

  const petCfg = getPetCfgMap();
  const candidates = Object.keys(petCfg)
    .map((key) => toSafeInt(key, 0))
    .filter((id) => {
      if (id <= 0 || excluded.has(id)) return false;
      const row = petCfg[id];
      if (!row) return false;
      if (toSafeInt(row.quality, 0) !== quality) return false;
      return toSafeInt(row.tag, 0) !== 2;
    });
  if (candidates.length <= 0) return toSafeInt(targetPet && targetPet.id, 0);
  const weighted = candidates.map((id) => ({ id, weight: Math.max(1, toSafeInt((petCfg[id] && petCfg[id].composeWeight), 100)) }));
  const picked = randomPickWeighted(weighted);
  return picked ? picked.id : candidates[0];
}

function buildPetSwapFail(msgUid, targetPet = null) {
  return { tag: 3312, msgUid, data: { result: -1, costUid: [], data: targetPet || null } };
}

function getPetUpgradeCostRow(pet, levelOffset = 0) {
  const quality = getPetQuality(pet && pet.id);
  const qualityCfg = (config.get('PetQualityConfig') || {})[quality] || {};
  const baseCost = Array.isArray(qualityCfg.consumes) ? qualityCfg.consumes[0] : null;
  const addCost = Array.isArray(qualityCfg.addConsumes) ? qualityCfg.addConsumes[0] : null;
  const costId = toSafeInt(baseCost && baseCost.id, 0);
  if (costId <= 0) return null;

  const currentLevel = Math.max(1, toSafeInt(pet && pet.level, 1)) + Math.max(0, toSafeInt(levelOffset, 0));
  const baseCount = Math.max(0, toSafeInt(baseCost && baseCost.count, 0));
  const addCount = Math.max(0, toSafeInt(addCost && addCost.count, 0));
  return { id: costId, count: baseCount + addCount * Math.max(0, currentLevel - 1) };
}

function buildPetUpgradeCostMap(pet, addLv) {
  const costMap = {};
  for (let i = 0; i < Math.max(0, toSafeInt(addLv, 0)); i += 1) {
    const cost = getPetUpgradeCostRow(pet, i);
    if (!cost || cost.count <= 0) continue;
    costMap[cost.id] = Math.max(0, toSafeInt(costMap[cost.id], 0)) + cost.count;
  }
  return costMap;
}

function hasEnoughCostMap(player, costMap = {}) {
  return Object.keys(costMap).every((itemId) => hasEnoughItemOrCurrency(player, itemId, costMap[itemId]));
}

function getMissingCostRows(player, costMap = {}) {
  return Object.keys(costMap)
    .map((itemId) => {
      const id = toSafeInt(itemId, 0);
      const required = Math.max(0, toSafeInt(costMap[itemId], 0));
      const owned = getItemOrCurrencyCount(player, id);
      return { id, required, owned, missing: Math.max(0, required - owned) };
    })
    .filter((row) => row.id > 0 && row.missing > 0);
}

function buildPetComposeCostFailure(player, msgUid, costMap = {}) {
  const missingItems = getMissingCostRows(player, costMap);
  const details = missingItems.map((row) => {
    const name = row.id === 36 ? 'Quả Linh' : `vật phẩm #${row.id}`;
    return `${name} ×${row.missing}`;
  });
  const msg = details.length > 0
    ? `Thiếu ${details.join(', ')}`
    : 'Thiếu vật liệu ghép';
  return {
    tag: 3302,
    msgUid,
    data: {
      result: -1,
      code: 'PET_COMPOSE_INSUFFICIENT_COST',
      msg,
      missingItems,
      data: null,
      rewards: buildPetRewardPayload(),
    },
  };
}

function consumeCostMap(player, costMap = {}) {
  Object.keys(costMap).forEach((itemId) => {
    consumeItemOrCurrency(player, itemId, costMap[itemId]);
  });
}

// 开蛋 (tag:3300)
async function handlePetUseEgg(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 3300, msgUid, data: { result: -1, data: [] } };

  const info = ensurePetInfo(player);
  settleFreePetEgg(player);
  const eggId = toSafeInt(params && params.eggId, 24);
  const eggCfg = (config.get('PetEggConfig') || {})[eggId];
  if (!eggCfg || ![24, 25, 26].includes(eggId)) {
    return { tag: 3300, msgUid, data: { result: -1, data: [] } };
  }
  if (findFirstEmptyComposeSlot(info) < 0) {
    return { tag: 3300, msgUid, data: { result: -1, data: [] } };
  }
  const trackedCostIds = [eggId];
  const beforeCostMap = Object.fromEntries(
    trackedCostIds.map((itemId) => [itemId, getItemOrCurrencyCount(player, itemId)])
  );

  const enoughEgg = hasEnoughItemOrCurrency(player, eggId, 1);
  if (!enoughEgg) {
    return { tag: 3300, msgUid, data: { result: -1, data: [] } };
  }

  consumeItemOrCurrency(player, eggId, 1);

  const petId = pickPetIdForEgg(info, eggId);
  const slot = findFirstEmptyComposeSlot(info);
  const pet = createPet(info, petId, slot);
  info.pets.push(pet);
  addUnlockAtlas(info, pet.id);

  const taskChanged = !!refreshMainTaskProgress(player);
  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  const afterCostMap = Object.fromEntries(
    trackedCostIds.map((itemId) => [itemId, getItemOrCurrencyCount(player, itemId)])
  );
  const costSyncPacket = buildPetCostSync(player, beforeCostMap, afterCostMap);
  const response = { tag: 3300, msgUid, data: { result: 0, data: [pet] } };
  if (costSyncPacket) {
    costSyncPacket.data.timeRecords = buildPetTimeRecordPayload(player);
  }
  if (costSyncPacket || taskChanged) {
    return [
      response,
      ...(costSyncPacket ? [costSyncPacket] : []),
      ...buildTaskUpdatePacketsSafe(player),
    ];
  }
  return response;
}

function rollComposeSuccess(quality) {
  const qualityCfg = (config.get('PetQualityConfig') || {})[Math.max(1, toSafeInt(quality, 1))] || {};
  const rate = Math.max(0, Math.min(10000, toSafeInt(qualityCfg.composeSuccessRate, 0)));
  if (rate >= 10000) return true;
  if (rate <= 0) return false;
  return Math.random() * 10000 < rate;
}

// 槽位变更 (tag:3301)
async function handlePetChangeSlot(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 3301, msgUid, data: { result: -1, data: [] } };

  const info = ensurePetInfo(player);
  const uid = toSafeInt(params && params.uid, 0);
  const slot = toSafeInt(params && params.slot, -1);
  const pet = findPetByUid(info, uid);
  if (!pet) return { tag: 3301, msgUid, data: { result: -1, data: [] } };
  if (slot < -3) return { tag: 3301, msgUid, data: { result: -1, data: [] } };
  if (slot >= Math.max(1, toSafeInt(info.field, 8))) return { tag: 3301, msgUid, data: { result: -1, data: [] } };

  const prevSlot = toSafeInt(pet.slot, -1);
  const swapped = info.pets.find((row) => toSafeInt(row && row.uid, 0) !== uid && toSafeInt(row && row.slot, -2) === slot) || null;
  if (swapped) swapped.slot = prevSlot;
  pet.slot = slot;

  const taskChanged = !!refreshMainTaskProgress(player);
  // Slot changes are state-only (no reward/currency transaction). Persist
  // asynchronously so rapid pet-screen actions do not wait on a full write.
  playerService.savePlayerDeferred(session.userId, player).catch((err) => {
    logger.warn(`[Pet] async slot save failed user=${session.userId}: ${err.message}`);
  });
  const changed = [pet];
  if (swapped) changed.push(swapped);
  const response = { tag: 3301, msgUid, data: { result: 0, data: changed } };
  return taskChanged ? [...buildTaskUpdatePacketsSafe(player), response] : response;
}

// 合成 (tag:3302)
async function handlePetCompose(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 3302, msgUid, data: { result: -1, data: null, rewards: buildPetRewardPayload() } };

  const info = ensurePetInfo(player);
  const matUid = toSafeInt(params && params.uid, 0);
  const targetUid = toSafeInt(params && params.targetUid, 0);
  const matPet = findPetByUid(info, matUid);
  const targetPet = findPetByUid(info, targetUid);
  if (!canPetCompose(matPet, targetPet, player)) {
    return { tag: 3302, msgUid, data: { result: -1, data: null, rewards: buildPetRewardPayload() } };
  }

  const composeQuality = getPetQuality(targetPet.id);
  const qualityCfg = (config.get('PetQualityConfig') || {})[composeQuality] || {};
  const consumes = Array.isArray(qualityCfg.consumes) ? qualityCfg.consumes : [];
  const trackedCostIds = consumes
    .map((cost) => toSafeInt(cost && cost.id, 0))
    .filter((itemId, idx, arr) => itemId > 0 && arr.indexOf(itemId) === idx);
  const beforeCostMap = Object.fromEntries(
    trackedCostIds.map((itemId) => [itemId, getItemOrCurrencyCount(player, itemId)])
  );
  const composeCostMap = {};
  consumes.forEach((cost) => {
    const id = toSafeInt(cost && cost.id, 0);
    const count = Math.max(0, toSafeInt(cost && cost.count, 0));
    if (id > 0 && count > 0) composeCostMap[id] = (composeCostMap[id] || 0) + count;
  });
  if (!hasEnoughCostMap(player, composeCostMap)) {
    return buildPetComposeCostFailure(player, msgUid, composeCostMap);
  }
  consumes.forEach((cost) => consumeItemOrCurrency(player, cost.id, cost.count));

  const success = rollComposeSuccess(composeQuality) || isPetComposeFailOpenEnabled();
  const { result: resultPet, retainPrimary: composeFailed } = applyPetComposition(info, matPet, targetPet, success);

  const taskChanged = !!addPetComposeCount(player, 1);
  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  const afterCostMap = Object.fromEntries(
    trackedCostIds.map((itemId) => [itemId, getItemOrCurrencyCount(player, itemId)])
  );
  const costSyncPacket = buildPetCostSync(player, beforeCostMap, afterCostMap);
  const dataUpdatePacket = buildPetDataUpdatePacket(resultPet);
  const response = {
    tag: 3302,
    msgUid,
    data: {
      result: 0,
      data: resultPet,
      composeSuccess: !composeFailed,
      ...(composeFailed ? { msg: 'Ghép thất bại; giữ linh thú chính, tiêu hao linh thú phụ' } : {}),
      rewards: buildPetRewardPayload(),
      rewardInfo: buildPetRewardPayload(),
    },
  };
  return (dataUpdatePacket || costSyncPacket || taskChanged)
    ? [
      response,
      ...(dataUpdatePacket ? [dataUpdatePacket] : []),
      ...(costSyncPacket ? [costSyncPacket] : []),
      ...(taskChanged ? buildTaskUpdatePacketsSafe(player) : []),
    ]
    : response;
}

// 升级 (tag:3304)
async function handlePetUpgrade(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 3304, msgUid, data: { result: -1, data: null } };

  const info = ensurePetInfo(player);
  const uid = toSafeInt(params && params.uid, 0);
  const addLv = Math.max(1, toSafeInt(params && params.lv, 1));
  const pet = findPetByUid(info, uid);
  if (!pet) return { tag: 3304, msgUid, data: { result: -1, data: null } };

  const levelMax = getPetLevelMax(player, pet);
  const oldLevel = Math.max(1, toSafeInt(pet.level, 1));
  const actualAddLv = Math.min(addLv, Math.max(0, levelMax - oldLevel));
  if (actualAddLv <= 0) return { tag: 3304, msgUid, data: { result: -1, data: pet } };

  const costMap = buildPetUpgradeCostMap(pet, actualAddLv);
  if (!hasEnoughCostMap(player, costMap)) {
    return { tag: 3304, msgUid, data: { result: -1, data: pet } };
  }

  const trackedCostIds = Object.keys(costMap).map((itemId) => toSafeInt(itemId, 0)).filter((itemId) => itemId > 0);
  const beforeCostMap = Object.fromEntries(
    trackedCostIds.map((itemId) => [itemId, getItemOrCurrencyCount(player, itemId)])
  );

  consumeCostMap(player, costMap);
  pet.level = Math.min(levelMax, oldLevel + actualAddLv);

  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  const afterCostMap = Object.fromEntries(
    trackedCostIds.map((itemId) => [itemId, getItemOrCurrencyCount(player, itemId)])
  );
  const costSyncPacket = buildPetCostSync(player, beforeCostMap, afterCostMap);
  const response = { tag: 3304, msgUid, data: { result: 0, data: pet } };
  return costSyncPacket ? [response, costSyncPacket] : response;
}

// 锁定被动技能 (tag:3305)
async function handlePetLockSkill(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 3305, msgUid, data: { result: -1, data: null } };

  const info = ensurePetInfo(player);
  const uid = toSafeInt(params && params.uid, 0);
  const pet = findPetByUid(info, uid);
  if (!pet) return { tag: 3305, msgUid, data: { result: -1, data: null } };

  const lock = toSafeInt(params && params.lock, 0) > 0;
  const skillIndex = Math.max(0, toSafeInt(params && params.skillIndex, 0));
  if (!Array.isArray(pet.lockSkills)) pet.lockSkills = [];
  const idx = pet.lockSkills.indexOf(skillIndex);
  if (lock && idx < 0) pet.lockSkills.push(skillIndex);
  if (!lock && idx >= 0) pet.lockSkills.splice(idx, 1);
  pet.lockSkills = pet.lockSkills
    .map((v) => toSafeInt(v, -1))
    .filter((v, pos, arr) => v >= 0 && v < (Array.isArray(pet.passiveSkills) ? pet.passiveSkills.length : 0) && arr.indexOf(v) === pos);

  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  return { tag: 3305, msgUid, data: { result: 0, data: pet } };
}

// 洗练被动技能 (tag:3306)
async function handlePetWashSkill(params, session, msgUid) {
  const player = session.player;
  if (!player) {
    return { tag: 3306, msgUid, data: { result: -1, level: 1, exp: 0, data: null } };
  }

  const info = ensurePetInfo(player);
  const uid = toSafeInt(params && params.uid, 0);
  const pet = findPetByUid(info, uid);
  if (!pet) {
    return {
      tag: 3306,
      msgUid,
      data: { result: -1, level: toSafeInt(info.skillWashLevel, 1), exp: toSafeInt(info.skillWashExp, 0), data: null },
    };
  }

  const baseCfg = config.get('PetBaseConfig') || {};
  const consumeList = Array.isArray(baseCfg.pSkillWashConsume) ? baseCfg.pSkillWashConsume : [];
  const level = Math.max(1, toSafeInt(info.skillWashLevel, 1));
  const currentSkills = Array.isArray(pet.passiveSkills) ? pet.passiveSkills.slice() : [];
  const lockSet = new Set((Array.isArray(pet.lockSkills) ? pet.lockSkills : [])
    .filter(index => Number.isInteger(index) && index >= 0 && index < currentSkills.length));
  if (!currentSkills.length || lockSet.size >= currentSkills.length || !consumeList.length) {
    return { tag: 3306, msgUid, data: { result: -1, code: 'PET_WASH_NO_UNLOCKED_SKILL', level, exp: info.skillWashExp, data: pet } };
  }
  const costId = toSafeInt(consumeList[0].id, 0);
  if (costId <= 0 || consumeList.some(row => row.id !== costId || !Number.isSafeInteger(row.count) || row.count < 0)) {
    return { tag: 3306, msgUid, data: { result: -1, code: 'PET_WASH_CONFIG_INVALID', level, exp: info.skillWashExp, data: pet } };
  }
  // Exact native PetRefreshView.getRefreshCost: cumulative locked-slot fees,
  // repeating the last fee when q10 has more slots than the fee table.
  let costCount = 0;
  for (let i = 0; i <= lockSet.size; i++) costCount += consumeList[Math.min(i, consumeList.length - 1)].count;
  if (costId > 0 && costCount > 0 && !hasEnoughItemOrCurrency(player, costId, costCount)) {
    return {
      tag: 3306,
      msgUid,
      data: { result: -1, level: toSafeInt(info.skillWashLevel, 1), exp: toSafeInt(info.skillWashExp, 0), data: pet },
    };
  }
  const beforeCostMap = costId > 0 ? { [costId]: getItemOrCurrencyCount(player, costId) } : {};
  if (costId > 0 && costCount > 0) consumeItemOrCurrency(player, costId, costCount);

  const usedSkillIds = new Set();
  const usedSkillFamilies = new Set();
  const skillInfoCfg = config.get('SkillConfig') || {};

  // Register all locked skills to prevent duplicate IDs and duplicate families
  lockSet.forEach((idx) => {
    const sid = toSafeInt(currentSkills[idx], 0);
    if (sid > 0) {
      usedSkillIds.add(sid);
      const fam = toSafeInt((skillInfoCfg[sid] || {}).skillName, sid);
      usedSkillFamilies.add(fam);
    }
  });

  const nextSkills = [];
  const petType = getPetType(pet.id);
  for (let i = 0; i < currentSkills.length; i++) {
    if (lockSet.has(i) && toSafeInt(currentSkills[i], 0) > 0) {
      nextSkills.push(toSafeInt(currentSkills[i], 0));
      continue;
    }
    const targetQuality = rollSkillQualityByWashLevel(level);
    nextSkills.push(pickDistinctWashSkill(petType, targetQuality, usedSkillIds, usedSkillFamilies));
  }
  pet.passiveSkills = nextSkills;
  pet.lockSkills = Array.from(lockSet).filter((idx) => idx >= 0 && idx < pet.passiveSkills.length);

  const washCfg = config.get('PetPassiveSkillWashConfig') || {};
  info.skillWashExp = Math.max(0, toSafeInt(info.skillWashExp, 0));
  if (washCfg[level + 1] && toSafeInt(washCfg[level] && washCfg[level].exp, 0) > 0) info.skillWashExp += 1;
  for (;;) {
    const current = Math.max(1, toSafeInt(info.skillWashLevel, 1));
    const needExp = toSafeInt(washCfg[current] && washCfg[current].exp, 0);
    if (!washCfg[current + 1] || needExp <= 0 || info.skillWashExp < needExp) break;
    info.skillWashExp -= needExp;
    info.skillWashLevel = current + 1;
  }

  const taskChanged = !!addPetWashCount(player, 1);
  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  const afterCostMap = costId > 0 ? { [costId]: getItemOrCurrencyCount(player, costId) } : {};
  const costSyncPacket = buildPetCostSync(player, beforeCostMap, afterCostMap);
  const response = {
    tag: 3306,
    msgUid,
    data: {
      result: 0,
      level: toSafeInt(info.skillWashLevel, 1),
      exp: toSafeInt(info.skillWashExp, 0),
      data: pet,
    },
  };
  return (costSyncPacket || taskChanged)
    ? [
      ...(costSyncPacket ? [costSyncPacket] : []),
      ...(taskChanged ? buildTaskUpdatePacketsSafe(player) : []),
      response,
    ]
    : response;
}

// 重置 (tag:3307)
async function handlePetReset(params, session, msgUid) {
  const player = session.player;
  const emptyReward = buildPetRewardPayload();
  if (!player) {
    return {
      tag: 3307,
      msgUid,
      data: { result: -1, data: null, rewards: emptyReward, rewardInfo: emptyReward },
    };
  }

  const info = ensurePetInfo(player);
  const uid = toSafeInt(params && params.uid, 0);
  const pet = findPetByUid(info, uid);
  if (!pet) {
    return {
      tag: 3307,
      msgUid,
      data: { result: -1, data: null, rewards: emptyReward, rewardInfo: emptyReward },
    };
  }

  const baseCfg = config.get('PetBaseConfig') || {};
  const resetConsume = Array.isArray(baseCfg.resetConsume) ? baseCfg.resetConsume : [];
  const oldLevel = Math.max(1, toSafeInt(pet.level, 1));
  // Pet upgrades consume the configured quality material (currently item 36,
  // Quả linh). Build the same cumulative cost map used by tag 3304 so reset
  // returns exactly what this pet actually spent, rather than a hard-coded
  // unrelated item.
  const refundCostMap = buildPetUpgradeCostMap(
    { ...pet, level: 1 },
    Math.max(0, oldLevel - 1)
  );
  const trackedCostIds = new Set([
    ...resetConsume.map((cost) => toSafeInt(cost && cost.id, 0)),
    ...Object.keys(refundCostMap).map((itemId) => toSafeInt(itemId, 0)),
  ].filter((itemId) => itemId > 0));
  const beforeCostMap = Object.fromEntries(
    Array.from(trackedCostIds).map((itemId) => [itemId, getItemOrCurrencyCount(player, itemId)])
  );
  let canReset = true;
  for (const cost of resetConsume) {
    if (!hasEnoughItemOrCurrency(player, cost.id, cost.count)) {
      canReset = false;
      break;
    }
  }
  if (!canReset) {
    // A failed reset must be side-effect free. The previous implementation
    // still granted the refund even when the reset fee was unavailable.
    return {
      tag: 3307,
      msgUid,
      data: { result: -1, data: pet, rewards: emptyReward, rewardInfo: emptyReward },
    };
  }

  resetConsume.forEach((cost) => consumeItemOrCurrency(player, cost.id, cost.count));
  pet.level = 1;
  if (Object.prototype.hasOwnProperty.call(pet, 'exp')) pet.exp = 0;

  const returnRate = Math.max(0, toSafeInt(baseCfg.returnRate, 10000));
  const rewards = Object.entries(refundCostMap)
    .map(([itemId, count]) => ({
      id: toSafeInt(itemId, 0),
      count: Math.max(0, Math.floor(Math.max(0, toSafeInt(count, 0)) * returnRate / 10000)),
    }))
    .filter((reward) => reward.id > 0 && reward.count > 0);
  rewards.forEach((reward) => addRewardToPlayer(player, reward.id, reward.count));

  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  const afterCostMap = Object.fromEntries(
    Array.from(trackedCostIds).map((itemId) => [itemId, getItemOrCurrencyCount(player, itemId)])
  );
  const rewardInfo = buildPetRewardPayload(rewards);
  const response = {
    tag: 3307,
    msgUid,
    data: { result: 0, data: pet, rewards: rewardInfo, rewardInfo },
  };
  const costSyncPacket = buildPetCostSync(player, beforeCostMap, afterCostMap);
  return costSyncPacket ? [response, costSyncPacket] : response;
}

// 购买宠物栏位 (tag:3308)
async function handlePetBuyField(_params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 3308, msgUid, data: { result: -1, field: 0 } };

  const info = ensurePetInfo(player);
  const baseCfg = config.get('PetBaseConfig') || {};
  const initial = Math.max(1, toSafeInt(baseCfg.initialField, 8));
  const fieldConsume = Array.isArray(baseCfg.fieldConsume) ? baseCfg.fieldConsume : [];
  const currentField = Math.max(initial, toSafeInt(info.field, initial));
  const idx = Math.max(0, currentField - initial);
  const fieldMax = Math.max(initial, toSafeInt(baseCfg.fieldMax, initial));
  if (currentField >= fieldMax) return { tag: 3308, msgUid, data: { result: -1, field: currentField } };
  const diamondCost = Math.max(0, toSafeInt(fieldConsume[idx], 0));
  if (diamondCost > 0 && !hasEnoughItemOrCurrency(player, 1, diamondCost)) {
    return { tag: 3308, msgUid, data: { result: -1, field: currentField } };
  }
  if (diamondCost > 0) consumeItemOrCurrency(player, 1, diamondCost);

  // Client callback unconditionally increments local field on any response;
  // keep server state in sync by always increasing one slot per successful RPC.
  info.field = currentField + 1;
  const saved = await playerService.savePlayer(session.userId, player, { returnSaved: false });
  if (!saved) throw new Error('PET_FIELD_SAVE_NOT_CONFIRMED');
  return { tag: 3308, msgUid, data: { result: 0, field: info.field } };
}

// 图鉴奖励 (tag:3309)
async function handlePetAtlasReward(params, session, msgUid) {
  const player = session.player;
  if (!player) {
    const emptyReward = buildPetRewardPayload();
    return { tag: 3309, msgUid, data: { result: -1, rewardedAtlas: [], rewards: emptyReward, rewardInfo: emptyReward } };
  }

  const info = ensurePetInfo(player);
  let atlasId = toSafeInt(params && params.id, 0);
  const rewardedAtlas = [];
  const rewards = [];
  const trackedRewardIds = new Set();
  let beforeRewardMap = {};

  if (atlasId <= 0) {
    atlasId = info.unlockAtlas.find((id) => !info.rewardedAtlas.includes(id)) || 0;
  }

  if (
    atlasId > 0
    && info.unlockAtlas.includes(atlasId)
    && !info.rewardedAtlas.includes(atlasId)
  ) {
    info.rewardedAtlas.push(atlasId);
    rewardedAtlas.push(atlasId);
    const petCfg = getPetCfgById(atlasId) || {};
    const reward = petCfg.atlasReward || null;
    if (reward && toSafeInt(reward.id, 0) > 0 && toSafeInt(reward.count, 0) > 0) {
      const rewardId = toSafeInt(reward.id, 0);
      const rewardCount = toSafeInt(reward.count, 0);
      trackedRewardIds.add(rewardId);
      beforeRewardMap = { [rewardId]: getItemOrCurrencyCount(player, rewardId) };
      rewards.push({ id: rewardId, count: rewardCount });
      addRewardToPlayer(player, rewardId, rewardCount);
    }
  }

  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  const rewardInfo = buildPetRewardPayload(rewards);
  const afterRewardMap = Object.fromEntries(
    Array.from(trackedRewardIds).map((itemId) => [itemId, getItemOrCurrencyCount(player, itemId)])
  );
  const rewardSyncPacket = buildPetCostSync(player, beforeRewardMap, afterRewardMap);
  const response = { tag: 3309, msgUid, data: { result: 0, rewardedAtlas, rewards: rewardInfo, rewardInfo } };
  if (rewardSyncPacket) {
    const emptyReward = buildPetRewardPayload([]);
    rewardSyncPacket.data.rewardedAtlas = [];
    rewardSyncPacket.data.rewards = emptyReward;
    rewardSyncPacket.data.rewardInfo = emptyReward;
  }
  return rewardSyncPacket ? [response, rewardSyncPacket] : response;
}

// 锁定宠物 (tag:3310)
async function handlePetLock(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 3310, msgUid, data: { result: -1, data: null } };

  const info = ensurePetInfo(player);
  const uid = toSafeInt(params && params.uid, 0);
  const pet = findPetByUid(info, uid);
  if (!pet) return { tag: 3310, msgUid, data: { result: -1, data: null } };

  const locked = toSafeInt(params && params.lock, 0) > 0 ? 1 : 0;
  pet.locked = locked;
  pet.lock = locked;

  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  return { tag: 3310, msgUid, data: { result: 0, data: pet } };
}

// 吞噬 (tag:3311)
async function handlePetEat(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 3311, msgUid, data: { result: -1, data: null, rewards: buildPetRewardPayload() } };

  const info = ensurePetInfo(player);
  const matUid = toSafeInt(params && params.matUid, 0);
  const targetUid = toSafeInt(params && params.targetUid, 0);
  let matPet = findPetByUid(info, matUid);
  let targetPet = findPetByUid(info, targetUid);
  // Native drag-and-drop also sends normal -> EXP; canonicalize it.
  if (matPet && targetPet && getPetTag(matPet.id) !== 2 && getPetTag(targetPet.id) === 2) {
    [matPet, targetPet] = [targetPet, matPet];
  }
  if (!canPetEat(matPet, targetPet, player)) {
    return { tag: 3311, msgUid, data: { result: -1, data: null, rewards: buildPetRewardPayload() } };
  }

  const levelMax = getPetLevelMax(player, targetPet);
  const gainLevel = Math.max(1, Math.max(1, toSafeInt(matPet.level, 1)));
  if (toSafeInt(targetPet.level, 1) + gainLevel > levelMax) {
    // LanguageConfig 30032333 promises overflow conversion, but no verified
    // EXP->item36 ratio exists in the shipped tables. Fail closed to avoid
    // deleting material or minting an arbitrary amount.
    return { tag: 3311, msgUid, data: { result: -1, data: targetPet, rewards: buildPetRewardPayload() } };
  }
  targetPet.level = Math.min(levelMax, Math.max(1, toSafeInt(targetPet.level, 1) + gainLevel));

  info.pets = info.pets.filter((row) => toSafeInt(row && row.uid, 0) !== matPet.uid);
  const rewards = [];

  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  return { tag: 3311, msgUid, data: { result: 0, data: targetPet, rewards: buildPetRewardPayload(rewards), rewardInfo: buildPetRewardPayload(rewards) } };
}

// 替换 (tag:3312)
async function handlePetSwap(params, session, msgUid) {
  const player = session.player;
  if (!player) return buildPetSwapFail(msgUid);

  const info = ensurePetInfo(player);
  const uid = toSafeInt(params && params.uid, 0);
  const targetPet = findPetByUid(info, uid);
  if (!targetPet) return buildPetSwapFail(msgUid);
  if (isPetLockedOrEquipped(player, targetPet)) return buildPetSwapFail(msgUid, targetPet);
  if (isSwapBlockedPet(targetPet.id)) return buildPetSwapFail(msgUid, targetPet);

  const swapType = Math.max(1, toSafeInt(params && params.type, 1));
  const costUidRaw = Array.isArray(params && params.costUid) ? params.costUid : [];
  const requestedCostUid = costUidRaw
    .map((v) => toSafeInt(v, 0))
    .filter((v, idx, arr) => v > 0 && v !== uid && arr.indexOf(v) === idx);
  const trackedCostIds = [];
  const beforeCostMap = {};
  const quality = getPetQuality(targetPet.id);
  const preserveLevel = Math.max(1, toSafeInt(targetPet.level, 1));
  const preserveSkills = Array.isArray(targetPet.passiveSkills) ? targetPet.passiveSkills.slice() : [];
  const preserveLockSkills = Array.isArray(targetPet.lockSkills) ? targetPet.lockSkills.slice() : [];
  const excludedIds = [targetPet.id];
  let costUid = [];

  if (swapType === 2) {
    const needQuality = getPetSwapMaterialQuality(targetPet);
    if (needQuality <= 0) {
      return buildPetSwapFail(msgUid, targetPet);
    }
    const materialPets = requestedCostUid
      .map((petUid) => findPetByUid(info, petUid))
      .filter((pet) => canUsePetAsSwapMaterial(pet, needQuality, uid)
        && !isPetSoulBound(player, pet && pet.uid));
    if (materialPets.length <= 0) {
      return buildPetSwapFail(msgUid, targetPet);
    }
    costUid = materialPets.map((pet) => pet.uid);
    materialPets.forEach((pet) => excludedIds.push(pet.id));
    info.pets = info.pets.filter((row) => !costUid.includes(toSafeInt(row && row.uid, 0)));
  } else {
    const itemCost = getPetSwapItemCost(targetPet);
    if (itemCost.id <= 0 || itemCost.count <= 0 || !hasEnoughItemOrCurrency(player, itemCost.id, itemCost.count)) {
      return buildPetSwapFail(msgUid, targetPet);
    }
    trackedCostIds.push(itemCost.id);
    beforeCostMap[itemCost.id] = getItemOrCurrencyCount(player, itemCost.id);
    consumeItemOrCurrency(player, itemCost.id, itemCost.count);
  }

  const nextId = pickSwapResultId(info, targetPet, excludedIds);
  targetPet.id = nextId;
  targetPet.level = preserveLevel;
  targetPet.passiveSkills = preserveSkills;
  targetPet.lockSkills = preserveLockSkills.filter((index) => index >= 0 && index < targetPet.passiveSkills.length);
  addUnlockAtlas(info, targetPet.id);

  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  const afterCostMap = Object.fromEntries(
    trackedCostIds.map((itemId) => [itemId, getItemOrCurrencyCount(player, itemId)])
  );
  const costSyncPacket = buildPetCostSync(player, beforeCostMap, afterCostMap);
  const response = { tag: 3312, msgUid, data: { result: 0, costUid, data: targetPet } };
  return costSyncPacket ? [response, costSyncPacket] : response;
}

// 设置心愿 (tag:3313)
async function handlePetSetWish(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 3313, msgUid, data: { result: -1, quality: 0, id: 0 } };

  const info = ensurePetInfo(player);
  const quality = Math.max(1, toSafeInt(params && params.quality, 1));
  const petId = toSafeInt(params && params.id, 0);
  if (petId > 0 && isValidWishPetId(quality, petId)) info.wishMap[String(quality)] = petId;
  else if (petId <= 0) delete info.wishMap[String(quality)];

  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  return { tag: 3313, msgUid, data: { result: 0, quality, id: toSafeInt(info.wishMap[String(quality)], 0) } };
}

// 自动合成 (tag:3314)
async function handlePetAutoComposeUnlocked(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 3314, msgUid, data: { result: -1, pets: [], unlockAtlas: [] } };

  const info = ensurePetInfo(player);
  const maxAutoQuality = Math.min(getMaxPetQuality(), Math.max(2, toSafeInt(params && params.quality, 4)));
  const unlockAtlas = [];
  const maxQuality = getMaxPetQuality();

  let composeCount = 0;
  let expMergeCount = 0;
  let hatchedCount = 0;
  let blockedCostQualities = [];
  let blockedExpCap = false;
  const autoCostIds = new Set();
  const autoBeforeCost = {};
  const openEggs = params && params.openEggs === true;
  if (openEggs) {
    for (const id of [24, 25]) {
      autoCostIds.add(id);
      autoBeforeCost[id] = getItemOrCurrencyCount(player, id);
    }
    settleFreePetEgg(player);
  }
  let changed = true;
  let guard = 0;
  while (changed && guard < 128) {
    guard += 1;
    changed = false;

    const composePets = info.pets.filter((pet) => {
      if (toSafeInt(pet && pet.slot, -1) < 0) return false;
      if (isPetLockedOrEquipped(player, pet)) return false;
      if (toSafeInt(pet && pet.level, 1) > 1) return false;
      const petCfg = getPetCfgById(pet && pet.id) || {};
      const quality = getPetQuality(pet && pet.id);
      return toSafeInt(petCfg.tag, 1) !== 2 && quality < maxAutoQuality && quality < maxQuality;
    });

    const groupMap = new Map();
    composePets.forEach((pet) => {
      const quality = getPetQuality(pet.id);
      const key = `${quality}`;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key).push(pet);
    });

    let pair = null;
    let composeCostMap = {};
    blockedCostQualities = [];
    blockedExpCap = false;
    // Native ordinary auto tries lower qualities first. A blocked group must
    // not prevent other affordable groups or free EXP feeding from running.
    for (const quality of Array.from(groupMap.keys()).map(Number).sort((a, b) => a - b)) {
      const pets = groupMap.get(String(quality));
      if (pets.length < 2) continue;
      const qualityCfg = (config.get('PetQualityConfig') || {})[quality] || {};
      const costs = {};
      (Array.isArray(qualityCfg.consumes) ? qualityCfg.consumes : []).forEach((cost) => {
        const id = toSafeInt(cost && cost.id, 0);
        const count = Math.max(0, toSafeInt(cost && cost.count, 0));
        if (id > 0 && count > 0) costs[id] = (costs[id] || 0) + count;
      });
      if (!hasEnoughCostMap(player, costs)) {
        blockedCostQualities.push(quality);
        continue;
      }
      pair = [pets[0], pets[1]];
      composeCostMap = costs;
      break;
    }
    if (!pair) {
      // Prefer the highest-quality EXP target, but try other materials and
      // targets when its cap blocks a pair. Preserve overflow materials.
      const expPets = info.pets
        .filter((pet) => {
          if (toSafeInt(pet && pet.slot, -1) < 0) return false;
          if (isPetLockedOrEquipped(player, pet)) return false;
          const petCfg = getPetCfgById(pet && pet.id) || {};
          return toSafeInt(petCfg.tag, 1) === 2;
        })
        .sort((a, b) => getPetQuality(b.id) - getPetQuality(a.id));
      let expPair = null;
      for (const target of expPets) {
        const levelMax = getPetLevelMax(player, target);
        const material = expPets.find((pet) => toSafeInt(pet.uid, 0) !== toSafeInt(target.uid, 0)
          && toSafeInt(target.level, 1) + Math.max(1, toSafeInt(pet.level, 1)) <= levelMax);
        if (material) { expPair = [target, material, levelMax]; break; }
      }
      if (!expPair) {
        blockedExpCap = expPets.length >= 2;
        // One bounded, durable cycle may hatch up to 8 owned eggs. The client
        // schedules another cycle only after this save is confirmed.
        const eggId = openEggs && hatchedCount < 8 && findFirstEmptyComposeSlot(info) >= 0
          ? [24, 25].find(id => (config.get('PetEggConfig') || {})[id] && hasEnoughItemOrCurrency(player, id, 1)) : null;
        if (eggId) {
          const eggCfg = (config.get('PetEggConfig') || {})[eggId];
          if (!eggCfg) break;
          consumeItemOrCurrency(player, eggId, 1);
          const pet = createPet(info, pickPetIdForEgg(info, eggId), findFirstEmptyComposeSlot(info));
          info.pets.push(pet);
          const beforeAtlas = new Set(info.unlockAtlas);
          addUnlockAtlas(info, pet.id);
          if (!beforeAtlas.has(pet.id)) unlockAtlas.push(pet.id);
          hatchedCount += 1;
          changed = true;
          continue;
        }
        break;
      }
      const [targetExp, materialExp, levelMax] = expPair;
      targetExp.level = Math.min(levelMax, Math.max(1, toSafeInt(targetExp.level, 1) + Math.max(1, toSafeInt(materialExp.level, 1))));
      info.pets = info.pets.filter((pet) => toSafeInt(pet && pet.uid, 0) !== toSafeInt(materialExp.uid, 0));
      expMergeCount += 1;
      changed = true;
      continue;
    }

    const [a, b] = pair;
    const quality = getPetQuality(a.id);
    Object.keys(composeCostMap).forEach((id) => {
      autoCostIds.add(toSafeInt(id, 0));
      if (!Object.prototype.hasOwnProperty.call(autoBeforeCost, id)) autoBeforeCost[id] = getItemOrCurrencyCount(player, id);
    });
    consumeCostMap(player, composeCostMap);
    const success = rollComposeSuccess(quality);
    const beforeAtlas = new Set(info.unlockAtlas);
    // Native auto sends uid=a, targetUid=b, exactly as manual composition.
    const { result: composed } = applyPetComposition(info, a, b, success);
    if (!beforeAtlas.has(composed.id) && info.unlockAtlas.includes(composed.id)) unlockAtlas.push(composed.id);
    composeCount += 1;
    changed = true;
  }

  const composeTaskChanged = composeCount > 0 ? !!addPetComposeCount(player, composeCount) : false;
  const hatchTaskChanged = hatchedCount > 0 ? !!refreshMainTaskProgress(player) : false;
  const taskChanged = composeTaskChanged || hatchTaskChanged;
  const canContinue = openEggs && findFirstEmptyComposeSlot(info) >= 0
    && [24, 25].some(id => (config.get('PetEggConfig') || {})[id] && hasEnoughItemOrCurrency(player, id, 1));
  const stopReason = canContinue ? 'BATCH_LIMIT' : findFirstEmptyComposeSlot(info) < 0 ? 'BOARD_FULL'
    : blockedCostQualities.length ? 'INSUFFICIENT_COST' : blockedExpCap ? 'EXP_LEVEL_CAP' : 'NO_ACTION';
  const response = { tag: 3314, msgUid, data: { result: 0, field: info.field, pets: info.pets,
    unlockAtlas: info.unlockAtlas, newUnlockAtlas: unlockAtlas,
    timeRecords: openEggs ? buildPetTimeRecordPayload(player) : undefined,
    summary: { composeCount, expMergeCount, hatchedCount, canContinue, stopReason, blockedCostQualities, blockedExpCap } } };
  const autoAfterCost = Object.fromEntries(
    Array.from(autoCostIds).map((id) => [id, getItemOrCurrencyCount(player, id)])
  );
  const costSyncPacket = buildPetCostSync(player, autoBeforeCost, autoAfterCost);
  if (costSyncPacket && openEggs) costSyncPacket.data.timeRecords = buildPetTimeRecordPayload(player);
  return (taskChanged || costSyncPacket)
    ? [
      ...(costSyncPacket ? [costSyncPacket] : []),
      ...(taskChanged ? buildTaskUpdatePacketsSafe(player) : []),
      response,
    ]
    : response;
}

async function handlePetAutoCompose(params = {}, session, msgUid) {
  if (!params || typeof params !== 'object' || Array.isArray(params)
    || (params.openEggs != null && typeof params.openEggs !== 'boolean')
    || (params.quality != null && (!Number.isSafeInteger(params.quality) || params.quality < 2 || params.quality > getMaxPetQuality()))) {
    return { tag: 3314, msgUid, data: { result: -1, code: 'PET_AUTO_REQUEST_INVALID', retryable: false } };
  }
  return petMutation.run(session && session.userId, async () => {
    if (!session || !session.player || !session.userId) {
      return { tag: 3314, msgUid, data: { result: -1, code: 'PET_AUTO_SESSION_REQUIRED', retryable: true } };
    }
    const ws = petRuntime.getWsServer();
    const original = ws && ws.getPlayerForMutation ? ws.getPlayerForMutation(session.userId) || session.player : session.player;
    if (playerService.drainPendingSaves) await playerService.drainPendingSaves(session.userId);
    let prior;
    try { prior = petReceipts.read(original, 3314, params); }
    catch (error) { return { tag: 3314, msgUid, data: { result: -1, code: error.message, retryable: false } }; }
    if (prior) {
      // Read back current state instead of replaying old pet lists or debits.
      const info = original.petInfo || {};
      return [
        { tag: 1202, msgUid: 0, data: { result: 0, items: [], changed: require('../services/CurrencySync').buildClientItemList(original) } },
        { tag: 3314, msgUid, data: { result: 0, replayed: true, field: info.field,
          pets: Array.isArray(info.pets) ? info.pets : [], unlockAtlas: Array.isArray(info.unlockAtlas) ? info.unlockAtlas : [],
          ...(params.openEggs === true ? { timeRecords: { [FREE_PET_EGG_ITEM_ID]: getPetTimeRecordStart(info, FREE_PET_EGG_ITEM_ID) } } : {}),
          ...(prior.summary ? { summary: prior.summary } : {}) } },
      ];
    }
    const draft = JSON.parse(JSON.stringify(original));
    const shadow = Object.assign(Object.create(Object.getPrototypeOf(session)), session, { player: draft });
    const response = await handlePetAutoComposeUnlocked(params, shadow, msgUid);
    const packets = Array.isArray(response) ? response : [response];
    const ack = packets.find(p => p.tag === 3314 && p.msgUid === msgUid);
    if (!ack || ack.data.result !== 0) return response;
    // Store the immutable intent outcome in the same durable player write.
    petReceipts.record(draft, 3314, params, { result: 0, summary: ack.data.summary });
    try {
      if (!await playerService.savePlayer(session.userId, draft, { returnSaved: false })) throw Error('PET_AUTO_SAVE_NOT_CONFIRMED');
    } catch (error) {
      if (ws && ws.invalidatePlayerForMutation) ws.invalidatePlayerForMutation(session.userId);
      session.player = null;
      throw error;
    }
    Object.assign(original, draft);
    session.player = original;
    session._itemListCache = null;
    return response;
  });
}

async function handlePetRelease(params, session, msgUid) {
  const player = session && session.player;
  if (!player) return { tag: 3315, msgUid, data: { result: -1, msg: 'Chưa đăng nhập' } };

  const info = ensurePetInfo(player);
  const uid = toSafeInt(params && params.uid, 0);
  const pet = findPetByUid(info, uid);
  if (!pet) {
    return { tag: 3315, msgUid, data: { result: -1, msg: 'Không tìm thấy linh thú' } };
  }

  if (toSafeInt(pet.locked, toSafeInt(pet.lock, 0)) > 0) {
    return { tag: 3315, msgUid, data: { result: -1, msg: 'Linh thú đã khóa, không thể phóng sinh!' } };
  }
  if (isBattleSlot(pet.slot)) {
    return { tag: 3315, msgUid, data: { result: -1, msg: 'Linh thú đang xuất chiến, không thể phóng sinh!' } };
  }
  if (isPetSoulBound(player, pet.uid)) {
    return { tag: 3315, msgUid, data: { result: -1, msg: 'Linh thú đang liên kết Hồn Thú, không thể phóng sinh!' } };
  }

  const quality = getPetQuality(pet.id);
  const silverMap = {
    2: 5000,
    3: 10000,
    4: 25000,
    5: 60000,
    6: 150000,
    7: 500000,
    9: 2000000,
    10: 10000000,
  };
  const silverGain = silverMap[quality] || 5000;

  // Tính Quả Linh hoàn trả nếu cấp > 1
  let refundFruit = 0;
  const level = Math.max(1, toSafeInt(pet.level, 1));
  if (level > 1) {
    const qualityCfg = (config.get('PetQualityConfig') || {})[quality] || {};
    const baseCost = Array.isArray(qualityCfg.consumes) ? qualityCfg.consumes[0] : null;
    const addCost = Array.isArray(qualityCfg.addConsumes) ? qualityCfg.addConsumes[0] : null;
    const base = Math.max(0, toSafeInt(baseCost && baseCost.count, 0));
    const add = Math.max(0, toSafeInt(addCost && addCost.count, 0));
    for (let lv = 1; lv < level; lv += 1) {
      refundFruit += base + add * (lv - 1);
    }
  }

  const beforeCostMap = {
    2: getItemOrCurrencyCount(player, 2),
    36: getItemOrCurrencyCount(player, 36),
  };

  // Xóa pet khỏi túi
  info.pets = info.pets.filter((row) => toSafeInt(row && row.uid, 0) !== uid);

  // Cộng bạc (id 2 = silver)
  player.currencies = player.currencies || { gold: 0, diamond: 0, silver: 0 };
  player.currencies.silver = Math.max(0, toSafeInt(player.currencies.silver, 0)) + silverGain;

  // Hoàn Quả Linh (id 36) nếu có
  if (refundFruit > 0) {
    player.items = player.items || {};
    player.items[36] = Math.max(0, toSafeInt(player.items[36], 0)) + refundFruit;
  }

  await playerService.savePlayer(session.userId, player, { returnSaved: false });

  const afterCostMap = {
    2: getItemOrCurrencyCount(player, 2),
    36: getItemOrCurrencyCount(player, 36),
  };
  const costSyncPacket = buildPetCostSync(player, beforeCostMap, afterCostMap);

  const response = {
    tag: 3315,
    msgUid,
    data: {
      result: 0,
      uid,
      silver: silverGain,
      refundFruit,
      msg: 'Phóng sinh thành công!',
    },
  };

  return costSyncPacket ? [response, costSyncPacket] : response;
}
module.exports = {
  ensurePetInfo,
  grantPetToPlayer,
  settleFreePetEgg,
  buildPetTimeRecordPayload,
  handlePetUseEgg,
  handlePetChangeSlot,
  handlePetCompose,
  handlePetUpgrade,
  handlePetLockSkill,
  handlePetWashSkill,
  handlePetReset,
  handlePetBuyField,
  handlePetAtlasReward,
  handlePetLock,
  handlePetEat,
  handlePetSwap,
  handlePetSetWish,
  handlePetAutoCompose,
  handlePetRelease,
};

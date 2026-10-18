const configService = require('./ConfigService');

function toSafeInt(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.floor(num) : fallback;
}

function ensurePlainObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  return {};
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function getRoleGenderConfig() {
  return ensurePlainObject(configService.get('RoleGenderConfig'));
}

function getFashionConfig() {
  return ensurePlainObject(configService.get('FashionConfig'));
}

function getAssetsConfig() {
  return ensurePlainObject(configService.get('AssetsConfig'));
}

function normalizeRoleSelection(roleInfo = {}) {
  const roleGenderCfg = getRoleGenderConfig();

  let kungfuId = Math.max(0, toSafeInt(roleInfo.kungfuId, 4));
  let kungfuCfg = ensurePlainObject(roleGenderCfg[String(kungfuId)]);
  if (Object.keys(kungfuCfg).length <= 0) {
    // ID 0 is an intentional "unselected" placeholder in RoleGenderConfig.
    // It must not be used as the display fallback for a malformed NPC/player
    // row, otherwise the client still receives no usable fashion data.
    const fallbackKey = Object.keys(roleGenderCfg).find((key) => {
      const row = roleGenderCfg[key];
      return Number(key) > 0 && row && typeof row === 'object' && !Array.isArray(row);
    });
    if (fallbackKey != null) {
      kungfuId = Math.max(0, toSafeInt(fallbackKey, 4));
      kungfuCfg = ensurePlainObject(roleGenderCfg[String(kungfuId)]);
    } else if (roleGenderCfg['0']) {
      kungfuId = 0;
      kungfuCfg = ensurePlainObject(roleGenderCfg['0']);
    }
  }

  const availableSubJobs = Object.keys(kungfuCfg)
    .map((key) => Math.max(0, toSafeInt(key, -1)))
    .filter((key) => key >= 0)
    .sort((a, b) => a - b);

  let subJob = Math.max(0, toSafeInt(roleInfo.subJob, 0));
  if (!availableSubJobs.includes(subJob)) {
    subJob = availableSubJobs.includes(0)
      ? 0
      : (availableSubJobs.length > 0 ? availableSubJobs[0] : 0);
  }

  return { kungfuId, subJob };
}

function getRoleGenderRow(roleInfo = {}) {
  const roleGenderCfg = getRoleGenderConfig();
  const normalized = normalizeRoleSelection(roleInfo);
  const kungfuCfg = ensurePlainObject(roleGenderCfg[String(normalized.kungfuId)]);
  const row = ensurePlainObject(kungfuCfg[String(normalized.subJob)]);
  return {
    kungfuId: normalized.kungfuId,
    subJob: normalized.subJob,
    row,
  };
}

function buildDefaultFashionMap(roleInfo = {}) {
  const { row } = getRoleGenderRow(roleInfo);
  const fashionCfg = getFashionConfig();
  const fashionMap = {};
  ensureArray(row.initShows).forEach((showIdRaw) => {
    const showId = Math.max(0, toSafeInt(showIdRaw, 0));
    if (showId <= 0) return;
    const showCfg = fashionCfg[String(showId)] || fashionCfg[showId];
    const type = Math.max(0, toSafeInt(showCfg && showCfg.type, 0));
    if (type <= 0) return;
    fashionMap[String(type)] = showId;
  });
  return fashionMap;
}

let fashionTypesRef = null, fashionTypes = new Set();
function normalizeFashionMap(raw = {}, defaults = {}) {
  const fashionCfg = getFashionConfig();
  if (fashionTypesRef !== fashionCfg) {
    fashionTypesRef = fashionCfg;
    fashionTypes = new Set(Object.values(fashionCfg).map(row => Number(row.type)));
  }
  const normalized = {};
  Object.keys(ensurePlainObject(raw)).forEach((typeKey) => {
    const type = Math.max(0, toSafeInt(typeKey, 0));
    const id = toSafeInt(raw[typeKey], 0);
    // Native 0 means default and -1 means explicitly hidden. Neither is an
    // ownership ID; preserve them through login and other-player showInfo.
    const validType = fashionTypes.has(type);
    if (validType && (id === 0 || id === -1)) {
      normalized[String(type)] = id;
      return;
    }
    const row = ensurePlainObject(fashionCfg[String(id)] || fashionCfg[id]);
    if (type > 0 && id > 0 && toSafeInt(row.type, 0) === type) {
      normalized[String(type)] = id;
    }
  });
  Object.keys(ensurePlainObject(defaults)).forEach((typeKey) => {
    const type = Math.max(0, toSafeInt(typeKey, 0));
    const id = Math.max(0, toSafeInt(defaults[typeKey], 0));
    const row = ensurePlainObject(fashionCfg[String(id)] || fashionCfg[id]);
    if (type > 0 && id > 0 && toSafeInt(row.type, 0) === type && normalized[String(type)] == null) {
      normalized[String(type)] = id;
    }
  });
  return normalized;
}

function ensureFashionOwnershipState(player = {}) {
  if (!player || typeof player !== 'object') return {};
  if (!player.fashionInfo || typeof player.fashionInfo !== 'object' || Array.isArray(player.fashionInfo)) {
    player.fashionInfo = {};
  }

  const fashionInfo = player.fashionInfo;
  if (!fashionInfo.curFashion || typeof fashionInfo.curFashion !== 'object' || Array.isArray(fashionInfo.curFashion)) {
    fashionInfo.curFashion = {};
  }
  if (!fashionInfo.fashion || typeof fashionInfo.fashion !== 'object' || Array.isArray(fashionInfo.fashion)) {
    fashionInfo.fashion = {};
  }
  if (!fashionInfo.fashionMap || typeof fashionInfo.fashionMap !== 'object' || Array.isArray(fashionInfo.fashionMap)) {
    fashionInfo.fashionMap = {};
  }
  if (!fashionInfo.fashions || typeof fashionInfo.fashions !== 'object' || Array.isArray(fashionInfo.fashions)) {
    fashionInfo.fashions = {};
  }
  if (!Array.isArray(fashionInfo.activateFashion)) {
    fashionInfo.activateFashion = [];
  }
  if (!Array.isArray(fashionInfo.fashionData)) {
    fashionInfo.fashionData = [];
  }
  if (!fashionInfo.equipped || typeof fashionInfo.equipped !== 'object' || Array.isArray(fashionInfo.equipped)) fashionInfo.equipped = {};

  return fashionInfo;
}

function ensureRoleAppearance(player = {}) {
  if (!player || typeof player !== 'object') return false;

  player.roleInfo = ensurePlainObject(player.roleInfo);
  player.fashionInfo = ensurePlainObject(player.fashionInfo);

  const roleInfo = player.roleInfo;
  const fashionInfo = ensureFashionOwnershipState(player);
  const normalized = getRoleGenderRow(roleInfo);
  let changed = false;

  if (toSafeInt(roleInfo.kungfuId, -1) !== normalized.kungfuId) {
    roleInfo.kungfuId = normalized.kungfuId;
    changed = true;
  }
  if (toSafeInt(roleInfo.subJob, -1) !== normalized.subJob) {
    roleInfo.subJob = normalized.subJob;
    changed = true;
  }
  if (roleInfo.gender == null && normalized.row && normalized.row.gender != null) {
    roleInfo.gender = Math.max(0, toSafeInt(normalized.row.gender, 0));
    changed = true;
  }

  if (!fashionInfo.curFashion || typeof fashionInfo.curFashion !== 'object' || Array.isArray(fashionInfo.curFashion)) {
    fashionInfo.curFashion = {};
    changed = true;
  }
  if (!fashionInfo.fashion || typeof fashionInfo.fashion !== 'object' || Array.isArray(fashionInfo.fashion)) {
    fashionInfo.fashion = {};
    changed = true;
  }
  if (!fashionInfo.fashionMap || typeof fashionInfo.fashionMap !== 'object' || Array.isArray(fashionInfo.fashionMap)) {
    fashionInfo.fashionMap = {};
    changed = true;
  }
  if (!fashionInfo.fashions || typeof fashionInfo.fashions !== 'object' || Array.isArray(fashionInfo.fashions)) {
    fashionInfo.fashions = {};
    changed = true;
  }
  if (!Array.isArray(fashionInfo.activateFashion)) {
    fashionInfo.activateFashion = [];
    changed = true;
  }

  const defaultFashionMap = buildDefaultFashionMap(roleInfo);
  const normalizedCurrentFashion = normalizeFashionMap(fashionInfo.curFashion, defaultFashionMap);
  if (JSON.stringify(fashionInfo.curFashion) !== JSON.stringify(normalizedCurrentFashion)) {
    fashionInfo.curFashion = normalizedCurrentFashion;
    changed = true;
  }
  if (JSON.stringify(fashionInfo.fashion) !== JSON.stringify(normalizedCurrentFashion)) {
    fashionInfo.fashion = { ...normalizedCurrentFashion };
    changed = true;
  }
  if (JSON.stringify(fashionInfo.fashionMap) !== JSON.stringify(normalizedCurrentFashion)) {
    fashionInfo.fashionMap = { ...normalizedCurrentFashion };
    changed = true;
  }

  const fashionCfg = getFashionConfig();
  const normalizedOwnedMap = {};
  Object.keys(fashionInfo.fashions).forEach((idKey) => {
    const id = Math.max(0, toSafeInt(idKey, 0));
    if (id > 0 && (fashionCfg[String(id)] || fashionCfg[id])) {
      normalizedOwnedMap[String(id)] = Math.max(1, toSafeInt(fashionInfo.fashions[idKey], 1));
    }
  });
  if (JSON.stringify(fashionInfo.fashions) !== JSON.stringify(normalizedOwnedMap)) {
    fashionInfo.fashions = normalizedOwnedMap;
    changed = true;
  }
  const normalizedActivated = Array.from(new Set(
    ensureArray(fashionInfo.activateFashion)
      .map((id) => Math.max(0, toSafeInt(id, 0)))
      .filter((id) => id > 0 && (fashionCfg[String(id)] || fashionCfg[id]))
  )).sort((a, b) => a - b);
  if (JSON.stringify(fashionInfo.activateFashion) !== JSON.stringify(normalizedActivated)) {
    fashionInfo.activateFashion = normalizedActivated;
    changed = true;
  }

  Object.keys(defaultFashionMap).forEach((typeKey) => {
    const defaultId = Math.max(0, toSafeInt(defaultFashionMap[typeKey], 0));
    if (defaultId <= 0) return;

    if (fashionInfo.curFashion[typeKey] == null) {
      fashionInfo.curFashion[typeKey] = defaultId;
      changed = true;
    }
    if (fashionInfo.fashion[typeKey] == null) {
      fashionInfo.fashion[typeKey] = Math.max(0, toSafeInt(fashionInfo.curFashion[typeKey], defaultId));
      changed = true;
    }
    if (fashionInfo.fashionMap[typeKey] == null) {
      fashionInfo.fashionMap[typeKey] = Math.max(0, toSafeInt(fashionInfo.curFashion[typeKey], defaultId));
      changed = true;
    }

    const ownedKey = String(defaultId);
    if (toSafeInt(fashionInfo.fashions[ownedKey], 0) <= 0) {
      fashionInfo.fashions[ownedKey] = 1;
      changed = true;
    }
    if (!fashionInfo.activateFashion.includes(defaultId)) {
      fashionInfo.activateFashion.push(defaultId);
      changed = true;
    }
  });

  fashionInfo.activateFashion = Array.from(
    new Set(
      ensureArray(fashionInfo.activateFashion)
        .map((id) => Math.max(0, toSafeInt(id, 0)))
        .filter((id) => id > 0)
    )
  ).sort((a, b) => a - b);

  Object.keys(fashionInfo.curFashion).forEach((typeKey) => {
    const currentId = toSafeInt(fashionInfo.curFashion[typeKey], 0);
    if (currentId < 0) {
      ['fashion', 'fashionMap', 'equipped'].forEach((field) => {
        if (toSafeInt(fashionInfo[field][typeKey], 0) !== currentId) {
          fashionInfo[field][typeKey] = currentId;
          changed = true;
        }
      });
      return;
    }
    if (currentId === 0) return;
    if (toSafeInt(fashionInfo.fashion[typeKey], 0) !== currentId) {
      fashionInfo.fashion[typeKey] = currentId;
      changed = true;
    }
    if (toSafeInt(fashionInfo.fashionMap[typeKey], 0) !== currentId) {
      fashionInfo.fashionMap[typeKey] = currentId;
      changed = true;
    }
    const ownedKey = String(currentId);
    if (toSafeInt(fashionInfo.fashions[ownedKey], 0) <= 0) {
      fashionInfo.fashions[ownedKey] = 1;
      changed = true;
    }
    if (!fashionInfo.activateFashion.includes(currentId)) {
      fashionInfo.activateFashion.push(currentId);
      changed = true;
    }
  });

  const rewardAvatar = ensureArray(normalized.row && normalized.row.rewards)
    .map((reward) => Math.max(0, toSafeInt(reward && reward.id, 0)))
    .find((id) => id > 0) || 0;
  if (rewardAvatar > 0 && toSafeInt(player.avatar, 0) <= 0) {
    player.avatar = rewardAvatar;
    changed = true;
  }
  if (rewardAvatar > 0 && toSafeInt(roleInfo.avatar, 0) <= 0) {
    roleInfo.avatar = rewardAvatar;
    changed = true;
  }

  const equipList = ensureArray(ensurePlainObject(player.equipInfo).equipList);
  equipList.forEach((equip) => {
    if (unlockEquipAppearance(player, equip)) {
      changed = true;
    }
  });

  // Repair legacy timed unlocks that were saved without an expiry row. Do it
  // once; existing valid expiry rows are never extended by login/normalization.
  ensureArray(fashionInfo.activateFashion).slice().forEach((fashionId) => {
    if (getFashionDurationSeconds(fashionId) > 0 && !getFashionDataRow(player, fashionId)) {
      const grant = grantFashionOwnership(player, fashionId, { extendTimed: false });
      if (grant.changed) changed = true;
    }
  });
  if (purgeExpiredFashionOwnership(player).length > 0) changed = true;

  return changed;
}

function resolveEquipFashionIds(equipOrItemId) {
  const itemId = Math.max(0, toSafeInt(
    equipOrItemId && typeof equipOrItemId === 'object' ? equipOrItemId.id : equipOrItemId,
    0
  ));
  if (itemId <= 0) return [];

  const fashionCfg = getFashionConfig();
  const assetsCfg = getAssetsConfig();
  const assetRow = ensurePlainObject(assetsCfg[String(itemId)] || assetsCfg[itemId]);
  const candidateIds = [itemId, toSafeInt(assetRow.param, 0)];

  return Array.from(new Set(candidateIds))
    .map((id) => Math.max(0, toSafeInt(id, 0)))
    .filter((id) => id > 0)
    .filter((id) => {
      const row = fashionCfg[String(id)] || fashionCfg[id];
      return row && typeof row === 'object' && !Array.isArray(row);
    });
}

function getFashionDurationSeconds(fashionId) {
  const safeFashionId = Math.max(0, toSafeInt(fashionId, 0));
  const fashionCfg = getFashionConfig();
  const row = ensurePlainObject(fashionCfg[String(safeFashionId)] || fashionCfg[safeFashionId]);
  const condition = ensurePlainObject(row.condition);
  return Math.max(0, toSafeInt(condition['10'], 0));
}

function getFashionDataRow(player = {}, fashionId) {
  const safeFashionId = Math.max(0, toSafeInt(fashionId, 0));
  const info = ensureFashionOwnershipState(player);
  return ensureArray(info.fashionData)
    .find((row) => toSafeInt(row && row.id, 0) === safeFashionId) || null;
}

function hasFashionOwnership(player = {}, fashionId, nowSeconds = Math.floor(Date.now() / 1000)) {
  const safeFashionId = Math.max(0, toSafeInt(fashionId, 0));
  if (safeFashionId <= 0) return false;
  const info = ensureFashionOwnershipState(player);
  const owned = toSafeInt(info.fashions[String(safeFashionId)], 0) > 0
    || ensureArray(info.activateFashion).some((id) => toSafeInt(id, 0) === safeFashionId);
  if (!owned) return false;
  const duration = getFashionDurationSeconds(safeFashionId);
  if (duration <= 0) return true;
  const data = getFashionDataRow(player, safeFashionId);
  const expiresAt = toSafeInt(data && ensurePlainObject(data.limitValues)['10'], 0);
  return expiresAt > Math.max(0, toSafeInt(nowSeconds, 0));
}

function grantFashionOwnership(player = {}, fashionId, options = {}) {
  const safeFashionId = Math.max(0, toSafeInt(fashionId, 0));
  if (safeFashionId <= 0) return { changed: false, newlyOwned: false, timed: false, expiresAt: 0, row: null };

  const fashionCfg = getFashionConfig();
  const fashionRow = ensurePlainObject(fashionCfg[String(safeFashionId)] || fashionCfg[safeFashionId]);
  const type = Math.max(0, toSafeInt(fashionRow.type, 0));
  if (type <= 0) return { changed: false, newlyOwned: false, timed: false, expiresAt: 0, row: null };

  const fashionInfo = ensureFashionOwnershipState(player);
  const wasOwned = toSafeInt(fashionInfo.fashions[String(safeFashionId)], 0) > 0
    || ensureArray(fashionInfo.activateFashion).includes(safeFashionId);
  let changed = false;

  if (toSafeInt(fashionInfo.fashions[String(safeFashionId)], 0) <= 0) {
    fashionInfo.fashions[String(safeFashionId)] = 1;
    changed = true;
  }

  if (!ensureArray(fashionInfo.activateFashion).includes(safeFashionId)) {
    fashionInfo.activateFashion.push(safeFashionId);
    fashionInfo.activateFashion = Array.from(new Set(fashionInfo.activateFashion
      .map((id) => Math.max(0, toSafeInt(id, 0)))
      .filter((id) => id > 0))).sort((a, b) => a - b);
    changed = true;
  }

  if (fashionInfo.curFashion[String(type)] == null) {
    fashionInfo.curFashion[String(type)] = safeFashionId;
    changed = true;
  }
  if (fashionInfo.fashion[String(type)] == null) {
    fashionInfo.fashion[String(type)] = toSafeInt(fashionInfo.curFashion[String(type)], safeFashionId);
    changed = true;
  }
  if (fashionInfo.fashionMap[String(type)] == null) {
    fashionInfo.fashionMap[String(type)] = toSafeInt(fashionInfo.curFashion[String(type)], safeFashionId);
    changed = true;
  }

  const durationSeconds = getFashionDurationSeconds(safeFashionId);
  let expiresAt = 0;
  if (durationSeconds > 0) {
    const nowSeconds = Math.max(0, toSafeInt(options.nowSeconds, Math.floor(Date.now() / 1000)));
    const existing = getFashionDataRow(player, safeFashionId);
    const existingLimitValues = ensurePlainObject(existing && existing.limitValues);
    const existingExpiry = Math.max(0, toSafeInt(existingLimitValues['10'], 0));
    const extend = options.extendTimed !== false;
    expiresAt = (extend ? Math.max(nowSeconds, existingExpiry) : nowSeconds) + durationSeconds;
    const nextRow = {
      ...(existing || {}),
      id: safeFashionId,
      limitValues: { ...existingLimitValues, 10: expiresAt },
    };
    const data = ensureArray(fashionInfo.fashionData);
    const index = data.findIndex((row) => toSafeInt(row && row.id, 0) === safeFashionId);
    if (index >= 0) data[index] = nextRow;
    else data.push(nextRow);
    fashionInfo.fashionData = data;
    changed = true;
  }

  return {
    changed,
    newlyOwned: !wasOwned,
    timed: durationSeconds > 0,
    expiresAt,
    row: { id: safeFashionId, type },
  };
}

function unlockFashionOwnership(player = {}, fashionId, options = {}) {
  return grantFashionOwnership(player, fashionId, options).changed;
}

function purgeExpiredFashionOwnership(player = {}, options = {}) {
  const info = ensureFashionOwnershipState(player);
  const nowSeconds = Math.max(0, toSafeInt(options.nowSeconds, Math.floor(Date.now() / 1000)));
  const requested = Array.isArray(options.ids)
    ? new Set(options.ids.map((id) => Math.max(0, toSafeInt(id, 0))).filter((id) => id > 0))
    : null;
  const expiredIds = [];
  ensureArray(info.fashionData).forEach((data) => {
    const id = Math.max(0, toSafeInt(data && data.id, 0));
    if (id <= 0 || (requested && !requested.has(id))) return;
    const duration = getFashionDurationSeconds(id);
    const expiresAt = toSafeInt(ensurePlainObject(data && data.limitValues)['10'], 0);
    if (duration > 0 && expiresAt > 0 && expiresAt <= nowSeconds) expiredIds.push(id);
  });
  if (expiredIds.length <= 0) return [];

  const expired = new Set(expiredIds);
  info.fashionData = ensureArray(info.fashionData)
    .filter((row) => !expired.has(toSafeInt(row && row.id, 0)));
  info.activateFashion = ensureArray(info.activateFashion)
    .filter((id) => !expired.has(toSafeInt(id, 0)));
  expiredIds.forEach((id) => {
    delete info.fashions[String(id)];
    ['fashion', 'curFashion', 'fashionMap', 'equipped'].forEach((field) => {
      const holder = ensurePlainObject(info[field]);
      Object.keys(holder).forEach((key) => {
        if (toSafeInt(holder[key], 0) === id) holder[key] = 0;
      });
      info[field] = holder;
    });
    if (toSafeInt(player.title, 0) === id) player.title = 0;
    if (toSafeInt(ensurePlainObject(player.roleInfo).title, 0) === id) player.roleInfo.title = 0;
    if (toSafeInt(player.avatar, 0) === id) player.avatar = 0;
    if (toSafeInt(ensurePlainObject(player.roleInfo).avatar, 0) === id) player.roleInfo.avatar = 0;
    if (toSafeInt(player.avatarFrame, 0) === id) player.avatarFrame = 0;
    if (toSafeInt(ensurePlainObject(player.roleInfo).avatarFrame, 0) === id) player.roleInfo.avatarFrame = 0;
  });
  return expiredIds.sort((left, right) => left - right);
}

function unlockEquipAppearance(player = {}, equipOrItemId) {
  const fashionIds = resolveEquipFashionIds(equipOrItemId);
  let changed = false;
  fashionIds.forEach((fashionId) => {
    if (unlockFashionOwnership(player, fashionId)) {
      changed = true;
    }
  });
  return changed;
}

function getPlayerFashionMap(player = {}) {
  ensureRoleAppearance(player);
  const fashionInfo = ensurePlainObject(player && player.fashionInfo);
  const raw = Object.keys(ensurePlainObject(fashionInfo.fashionMap)).length > 0
    ? fashionInfo.fashionMap
    : fashionInfo.curFashion;
  const map = {};
  Object.keys(ensurePlainObject(raw)).forEach((typeKey) => {
    const id = toSafeInt(raw[typeKey], 0);
    if (id >= -1) map[String(typeKey)] = id;
  });
  return map;
}

function getPrimaryBattlePetId(player = {}) {
  const pets = getBattlePets(player);
  return pets.length > 0 ? pets[0].id : 0;
}

function getBattlePets(player = {}) {
  const petInfo = ensurePlainObject(player && player.petInfo);
  const pets = ensureArray(petInfo.pets)
    .filter((pet) => pet && typeof pet === 'object')
    .map((pet) => ({
      ...pet,
      id: Math.max(0, toSafeInt(pet.id, 0)),
      slot: toSafeInt(pet.slot, -1),
    }))
    .filter((pet) => pet.id > 0);

  const activePets = pets
    .filter((pet) => pet.slot < 0)
    .sort((a, b) => Math.abs(a.slot) - Math.abs(b.slot))
    .slice(0, 3);
  return activePets;
}

function applyPrimaryBattlePetParts(entity = {}, player = {}) {
  if (!entity || typeof entity !== 'object') return entity;

  const battlePets = getBattlePets(player);
  const primaryPetId = Math.max(0, toSafeInt(battlePets[0] && battlePets[0].id, 0));
  const parts = ensurePlainObject(entity.parts);

  entity.parts = parts;
  if (!entity.partValues || typeof entity.partValues !== 'object' || Array.isArray(entity.partValues)) {
    entity.partValues = {};
  }

  [10100, 10101, 10102].forEach((partId) => {
    if (partId === 10100 && primaryPetId > 0) parts[partId] = primaryPetId;
    else if (parts[partId] != null) delete parts[partId];
  });

  if (primaryPetId > 0) {
    entity.battlePetIds = [primaryPetId];
  } else if (entity.battlePetIds != null) {
    delete entity.battlePetIds;
  }

  if (entity.showInfo && typeof entity.showInfo === 'object' && !Array.isArray(entity.showInfo)) {
    entity.showInfo.petId = primaryPetId > 0 ? primaryPetId : Math.max(0, toSafeInt(entity.showInfo.petId, 0));
  }

  return entity;
}

const OUTBOUND_SHOW_OBJECT_KEYS = new Set([
  'showInfo',
  'playerInfo',
  'show',
  'info',
  'selfInfo',
  'mapPlayer',
]);

const OUTBOUND_SHOW_ROW_ARRAY_KEYS = new Set([
  'rankList',
  'ranklist',
  'topList',
  'toplist',
  'challengeList',
  'challengelist',
  'players',
  'members',
  'list',
  'infos',
]);

const OUTBOUND_SHOW_ROW_MAP_KEYS = new Set([
  'infoMap',
  'showMap',
  'playerMap',
  'rankMap',
  'topMap',
]);

// These ids exist in some config rows but their portrait resources are absent
// from the shipped H5 bundle.  Sending them makes the client warn repeatedly
// and render an empty avatar.  Keep the role/kungfu unchanged and only fall
// back the portrait id.
const BROKEN_OUTBOUND_AVATAR_IDS = new Set([11300, 11302, 113021]);

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isDisplayRow(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return hasOwn(value, 'kungfuId')
    || hasOwn(value, 'subJob')
    || hasOwn(value, 'fashionMap')
    || hasOwn(value, 'equipMap')
    || (
      (hasOwn(value, 'dbid') || hasOwn(value, 'playerId'))
      && (
        hasOwn(value, 'name')
        || hasOwn(value, 'level')
        || hasOwn(value, 'power')
        || hasOwn(value, 'score')
        || hasOwn(value, 'avatar')
      )
    );
}

function getDefaultAvatarId(roleRow = {}, fallback = 0) {
  const configured = ensureArray(roleRow.rewards)
    .map((reward) => Math.max(0, toSafeInt(reward && reward.id, 0)))
    .find((id) => id > 0);
  return configured || Math.max(0, toSafeInt(fallback, 0));
}

/**
 * Normalize the exact shape consumed by the H5 client's
 * FashionModel.CreteShowDataByInfo().  The client indexes
 * RoleGenderConfig[kungfuId][subJob] without a null guard, so one malformed
 * rank/map/fight row can abort an EUI dataChanged callback and freeze the UI.
 */
function normalizeShowInfo(showInfo = {}, fallback = {}, stats = null) {
  const source = ensurePlainObject(showInfo);
  const fallbackRow = ensurePlainObject(fallback);
  const roleGenderCfg = getRoleGenderConfig();
  const requestedKungfuId = toSafeInt(
    source.kungfuId != null ? source.kungfuId : fallbackRow.kungfuId,
    4
  );
  const requestedSubJob = Math.max(0, toSafeInt(
    source.subJob != null ? source.subJob : fallbackRow.subJob,
    0
  ));
  const requestedKungfuCfg = ensurePlainObject(
    roleGenderCfg[String(requestedKungfuId)] || roleGenderCfg[requestedKungfuId]
  );
  const requestedRoleRow = ensurePlainObject(
    requestedKungfuCfg[String(requestedSubJob)] || requestedKungfuCfg[requestedSubJob]
  );
  const role = getRoleGenderRow({ kungfuId: requestedKungfuId, subJob: requestedSubJob });
  const defaultFashionMap = buildDefaultFashionMap(role);
  const rawFashionMap = ensurePlainObject(
    Object.keys(ensurePlainObject(source.fashionMap)).length > 0
      ? source.fashionMap
      : fallbackRow.fashionMap
  );
  const fashionMap = normalizeFashionMap(rawFashionMap, defaultFashionMap);
  const equipMap = {
    ...ensurePlainObject(fallbackRow.equipMap),
    ...ensurePlainObject(source.equipMap),
  };
  const assetsCfg = getAssetsConfig();
  const requestedAvatar = Math.max(0, toSafeInt(
    source.avatar != null ? source.avatar : fallbackRow.avatar,
    0
  ));
  const defaultAvatar = getDefaultAvatarId(role.row, requestedAvatar);
  const configuredAvatar = requestedAvatar > 0
    && !BROKEN_OUTBOUND_AVATAR_IDS.has(requestedAvatar)
    && (assetsCfg[requestedAvatar] || assetsCfg[String(requestedAvatar)])
    ? requestedAvatar
    : defaultAvatar;
  const avatar = BROKEN_OUTBOUND_AVATAR_IDS.has(configuredAvatar)
    ? (Math.max(0, toSafeInt(role.row && role.row.gender, 0)) === 1 ? 113011 : 11301)
    : configuredAvatar;

  if (stats && Object.keys(requestedRoleRow).length <= 0) {
    stats.roleFallbacks = (stats.roleFallbacks || 0) + 1;
  }

  const normalized = {
    ...fallbackRow,
    ...source,
    kungfuId: role.kungfuId,
    subJob: role.subJob,
    avatar,
    avatarUrl: String(source.avatarUrl || fallbackRow.avatarUrl || ''),
    avatarFrame: Math.max(-1, toSafeInt(
      source.avatarFrame != null ? source.avatarFrame : fallbackRow.avatarFrame,
      -1
    )),
    title: Math.max(-1, toSafeInt(source.title != null ? source.title : fallbackRow.title, -1)),
    level: Math.max(1, toSafeInt(source.level != null ? source.level : fallbackRow.level, 1)),
    power: Math.max(0, toSafeInt(source.power != null ? source.power : fallbackRow.power, 0)),
    stage: Math.max(1, toSafeInt(source.stage != null ? source.stage : fallbackRow.stage, 1)),
    petId: Math.max(0, toSafeInt(source.petId != null ? source.petId : fallbackRow.petId, 0)),
    petSoulId: toSafeInt(source.petSoulId != null ? source.petSoulId : fallbackRow.petSoulId, -1),
    artifactId: Math.max(-1, toSafeInt(
      source.artifactId != null ? source.artifactId : fallbackRow.artifactId,
      -1
    )),
    fate: Math.max(0, toSafeInt(source.fate != null ? source.fate : fallbackRow.fate, 0)),
    foreverCard: Math.max(0, toSafeInt(
      source.foreverCard != null ? source.foreverCard : fallbackRow.foreverCard,
      0
    )),
    equipMap,
    fashionMap,
  };

  if (stats) {
    const changed = requestedKungfuId !== normalized.kungfuId
      || requestedSubJob !== normalized.subJob
      || requestedAvatar !== normalized.avatar
      || !hasOwn(source, 'fashionMap')
      || !hasOwn(source, 'equipMap');
    if (changed) stats.normalizedRows = (stats.normalizedRows || 0) + 1;
  }
  return normalized;
}

function normalizeOutboundPayload(payload, stats = {}) {
  const seen = new WeakSet();

  const walk = (value, key = '') => {
    if (Array.isArray(value)) {
      value.forEach((row, index) => {
        if (OUTBOUND_SHOW_ROW_ARRAY_KEYS.has(key) && isDisplayRow(row)) {
          value[index] = normalizeShowInfo(row, {}, stats);
        }
        walk(value[index], '');
      });
      return value;
    }
    if (!value || typeof value !== 'object') return value;
    if (Buffer.isBuffer(value) || ArrayBuffer.isView(value) || value instanceof Date) return value;
    if (seen.has(value)) return value;
    seen.add(value);

    if (OUTBOUND_SHOW_OBJECT_KEYS.has(key) && isDisplayRow(value)) {
      Object.assign(value, normalizeShowInfo(value, {}, stats));
    }
    Object.keys(value).forEach((childKey) => {
      const child = value[childKey];
      if (OUTBOUND_SHOW_ROW_MAP_KEYS.has(childKey) && child && typeof child === 'object' && !Array.isArray(child)) {
        Object.keys(child).forEach((mapKey) => {
          const row = child[mapKey];
          if (isDisplayRow(row)) child[mapKey] = normalizeShowInfo(row, {}, stats);
          walk(child[mapKey], '');
        });
        return;
      }
      walk(child, childKey);
    });
    return value;
  };

  return walk(payload);
}

module.exports = {
  ensureRoleAppearance,
  getPlayerFashionMap,
  getBattlePets,
  getPrimaryBattlePetId,
  applyPrimaryBattlePetParts,
  buildDefaultFashionMap,
  normalizeFashionMap,
  getRoleGenderRow,
  normalizeRoleSelection,
  normalizeShowInfo,
  normalizeOutboundPayload,
  getFashionDataRow,
  getFashionDurationSeconds,
  grantFashionOwnership,
  hasFashionOwnership,
  purgeExpiredFashionOwnership,
  unlockEquipAppearance,
  unlockFashionOwnership,
};

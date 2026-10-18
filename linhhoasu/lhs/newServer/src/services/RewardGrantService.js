const config = require('./ConfigService');
const nativeItems = require('./NativeItemRewardService');

function toSafeInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function getAssetsConfig() {
  return config.get('AssetsConfig') || {};
}

function getAssetRow(itemId) {
  const id = toSafeInt(itemId, 0);
  if (id <= 0) return null;
  const assetsCfg = getAssetsConfig();
  return assetsCfg[id] || assetsCfg[String(id)] || null;
}

function isSwordId(itemId) {
  const id = toSafeInt(itemId, 0);
  if (id <= 0) return false;
  const swordCfg = config.get('SwordConfig') || {};
  return !!(swordCfg[id] || swordCfg[String(id)]);
}

function isPetId(itemId) {
  const id = toSafeInt(itemId, 0);
  if (id <= 0) return false;
  const petCfg = config.get('PetConfig') || {};
  return !!(petCfg[id] || petCfg[String(id)]);
}

function isPetSoulId(itemId) {
  const id = toSafeInt(itemId, 0);
  if (id <= 0) return false;
  const petSoulCfg = config.get('PetSoulConfig') || {};
  return !!(petSoulCfg[id] || petSoulCfg[String(id)]);
}

function isBloodlineId(itemId) {
  const id = toSafeInt(itemId, 0);
  if (id <= 0) return false;
  const bloodlineCfg = config.get('BloodlineConfig') || {};
  return !!(bloodlineCfg[id] || bloodlineCfg[String(id)]);
}

function isValhallaId(itemId) {
  const id = toSafeInt(itemId, 0);
  if (id <= 0) return false;
  const valhallaCfg = config.get('ValhallaConfig') || {};
  return !!(valhallaCfg[id] || valhallaCfg[String(id)]);
}

function isArtifactId(itemId) {
  const id = toSafeInt(itemId, 0);
  if (id <= 0) return false;
  const artifactCfg = config.get('ArtifactConfig') || {};
  return !!(artifactCfg[id] || artifactCfg[String(id)]);
}

function isGemId(itemId) {
  const id = toSafeInt(itemId, 0);
  if (id <= 0) return false;
  const gemCfg = config.get('GemLevelConfig') || {};
  return !!(gemCfg[id] || gemCfg[String(id)]);
}

function isSpecialArtifactId(itemId) {
  const id = toSafeInt(itemId, 0);
  if (id <= 0) return false;
  const specialCfg = config.get('SpecialArtifactConfig') || {};
  return !!(specialCfg[id] || specialCfg[String(id)]);
}

function hasConfigId(tableName, itemId) {
  const id = toSafeInt(itemId, 0);
  if (id <= 0) return false;
  const table = config.get(tableName) || {};
  return !!(table[id] || table[String(id)]);
}

function isFormationId(itemId) {
  return hasConfigId('FormationConfig', itemId);
}

function isSpiritId(itemId) {
  return hasConfigId('SpiritConfig', itemId);
}

function isFashionId(itemId) {
  return hasConfigId('FashionConfig', itemId);
}

function isOldTrekShipSkinId(itemId) {
  const id = toSafeInt(itemId, 0);
  if (id <= 0) return false;
  const table = config.get('OldTrekShipDressConfig') || {};
  return !!(table[id] || table[String(id)]);
}

function resolveMountGrantId(itemId) {
  const id = toSafeInt(itemId, 0);
  if (id <= 0) return 0;
  if (isSwordId(id)) return id;

  const specialCfg = config.get('SpecialSwordConfig') || {};
  const specialRow = specialCfg[id] || specialCfg[String(id)] || null;
  const showId = toSafeInt(specialRow && specialRow.showId, 0);
  if (showId > 0) return showId;

  const assetRow = getAssetRow(id);
  const paramId = toSafeInt(assetRow && assetRow.param, 0);
  if (paramId > 0 && isSwordId(paramId)) return paramId;
  return id;
}

function getRewardKind(itemId) {
  const id = toSafeInt(itemId, 0);
  if (id <= 0) return 'item';
  // A suit box remains an inventory item until the player explicitly opens
  // it. The item handler owns the consumption/ownership transaction.
  if (require('./FashionBoxService').isBox(id)) return 'item';
  if (getAssetRow(id)?.type === 99 && require('./RandomUsableItemRewardService').getGemPackLevel(id)) return 'gemPack';
  if (isOldTrekShipSkinId(id)) return 'oldTrekShip';
  const nativeKind = nativeItems.getKind(id);
  if (nativeKind) return nativeKind;

  // Native ownership wins when an ID is also present in FashionConfig. The
  // matching Fashion row is granted as the display layer below.
  if (isFormationId(id)) return 'formation';
  if (isSwordId(id)) return 'sword';
  if (isPetId(id)) return 'pet';
  if (isPetSoulId(id)) return 'petSoul';
  if (isBloodlineId(id)) return 'bloodline';
  if (isValhallaId(id)) return 'valhalla';
  if (isArtifactId(id)) return 'artifact';
  if (isSpecialArtifactId(id)) return 'specialArtifact';
  if (isSpiritId(id)) return 'spirit';
  if (isGemId(id)) return 'gem';
  if (isFashionId(id)) return 'fashion';

  const assetRow = getAssetRow(id);
  const assetType = toSafeInt(assetRow && assetRow.type, 0);
  if (assetType === 5 || assetType === 94) return 'sword';
  if (assetType === 6) return 'pet';
  if (assetType === 40) return 'petSoul';
  if (assetType === 22) return 'bloodline';
  if (assetType === 16) return 'artifact';
  if (assetType === 18) return 'gem';

  const specialCfg = config.get('SpecialSwordConfig') || {};
  if (specialCfg[id] || specialCfg[String(id)]) return 'sword';

  return 'item';
}

function buildEmptyRewardInfo() {
  return {
    items: [],
    equips: [],
    swords: [],
    pets: [],
    petSouls: [],
    artifacts: [],
    gems: [],
    valhalla: [],
    bloodline: [],
    fashion: [],
    formations: [],
    spirits: [],
    elves: [],
    sailor: [],
    extraReward: {},
    oldTrekShips: [],
  };
}

function migrateOldTrekShipItem(player, shipId) {
  const id = toSafeInt(shipId, 0);
  if (!player || !isOldTrekShipSkinId(id)) return { changed: false, owned: false };
  const oldTrek = require('../handlers/old-trek');
  const info = oldTrek.ensureOldTrekInfo(player);
  const owned = Array.isArray(info.shipSkins) && info.shipSkins.includes(id);
  const count = Math.max(0, toSafeInt(player.items?.[id], 0));
  if (!owned && count <= 0) return { changed: false, owned: false };
  if (!owned) info.shipSkins.push(id);
  if (count > 0) {
    player.items[id] = Math.max(0, count - 1);
    if (player.items[id] <= 0) delete player.items[id];
  }
  return { changed: !owned || count > 0, owned: true, consumed: count > 0 };
}

function grantMountToPlayer(player, swordId) {
  // eslint-disable-next-line global-require
  const mount = require('../handlers/mount');
  if (!mount || typeof mount.ensureMountInfo !== 'function' || typeof mount.grantMountToPlayer !== 'function') {
    return null;
  }
  return mount.grantMountToPlayer(player, swordId);
}

function grantPetToPlayer(player, petId) {
  // eslint-disable-next-line global-require
  const pet = require('../handlers/pet');
  if (!pet || typeof pet.grantPetToPlayer !== 'function') {
    return null;
  }
  return pet.grantPetToPlayer(player, petId);
}

function grantPetSoulToPlayer(player, soulId) {
  // eslint-disable-next-line global-require
  const petSoul = require('../handlers/pet-soul');
  if (!petSoul || typeof petSoul.grantPetSoulToPlayer !== 'function') {
    return null;
  }
  return petSoul.grantPetSoulToPlayer(player, soulId);
}

function grantBloodlineToPlayer(player, bloodlineId) {
  // eslint-disable-next-line global-require
  const bloodline = require('../handlers/bloodline');
  if (!bloodline || typeof bloodline.grantBloodlineToPlayer !== 'function') {
    return null;
  }
  return bloodline.grantBloodlineToPlayer(player, bloodlineId);
}

function grantValhallaToPlayer(player, heroId) {
  // eslint-disable-next-line global-require
  const valhalla = require('../handlers/valhalla');
  if (!valhalla || typeof valhalla.grantValhallaToPlayer !== 'function') {
    return null;
  }
  return valhalla.grantValhallaToPlayer(player, heroId);
}

function grantArtifactToPlayer(player, artifactId) {
  // eslint-disable-next-line global-require
  const artifact = require('../handlers/artifact');
  if (!artifact || typeof artifact.grantArtifactToPlayer !== 'function') return null;
  return artifact.grantArtifactToPlayer(player, artifactId);
}

function grantSpecialArtifactToPlayer(player, specialArtifactId) {
  // eslint-disable-next-line global-require
  const artifact = require('../handlers/artifact');
  if (!artifact || typeof artifact.grantSpecialArtifactToPlayer !== 'function') return null;
  return artifact.grantSpecialArtifactToPlayer(player, specialArtifactId);
}

function grantGemToPlayer(player, gemId) {
  // eslint-disable-next-line global-require
  const gem = require('../handlers/gem');
  if (!gem || typeof gem.ensureGemInfo !== 'function' || typeof gem.addGem !== 'function') return null;
  return gem.addGem(gem.ensureGemInfo(player), gemId);
}

function grantFormationToPlayer(player, formationId) {
  // eslint-disable-next-line global-require
  const formation = require('./FormationService');
  if (!formation || typeof formation.grantFormationToPlayer !== 'function') return null;
  return formation.grantFormationToPlayer(player, formationId);
}

function grantSpiritToPlayer(player, spiritId) {
  // eslint-disable-next-line global-require
  const spirit = require('../handlers/spirit');
  if (!spirit || typeof spirit.grantSpiritToPlayer !== 'function') return null;
  return spirit.grantSpiritToPlayer(player, spiritId);
}

function grantFashionToPlayer(player, fashionId) {
  // eslint-disable-next-line global-require
  const appearance = require('./RoleAppearanceService');
  if (!appearance || typeof appearance.grantFashionOwnership !== 'function') return null;
  return appearance.grantFashionOwnership(player, fashionId, { extendTimed: true });
}

function grantOldTrekShipToPlayer(player, shipId) {
  const id = toSafeInt(shipId, 0);
  if (!player || !isOldTrekShipSkinId(id)) return null;
  // Lazy require avoids a module cycle during handler bootstrap.
  const oldTrek = require('../handlers/old-trek');
  const info = oldTrek.ensureOldTrekInfo(player);
  const owned = Array.isArray(info.shipSkins) && info.shipSkins.includes(id);
  if (!owned) info.shipSkins.push(id);
  return { id, newlyOwned: !owned };
}

function pushUniqueById(rows, value) {
  if (!value || toSafeInt(value.id, 0) <= 0) return;
  if (!rows.some((row) => toSafeInt(row && row.id, 0) === toSafeInt(value.id, 0))) rows.push(value);
}

function grantDisplayFashion(player, rewardId, rewardFashion) {
  if (!isFashionId(rewardId)) return null;
  const result = grantFashionToPlayer(player, rewardId);
  if (result && result.row) pushUniqueById(rewardFashion, result.row);
  return result;
}

function grantRewardRow(player, row = {}, times = 1) {
  const rewardId = toSafeInt(row && row.id, 0);
  const rewardCount = Math.max(0, toSafeInt(row && row.count, 0) * Math.max(1, toSafeInt(times, 1)));
  const kind = rewardId > 0 ? getRewardKind(rewardId) : 'item';
  const state = {
    kind,
    itemDeltas: [],
    rewardItems: [],
    rewardEquips: [],
    rewardGems: [],
    rewardSwords: [],
    rewardPets: [],
    rewardPetSouls: [],
    rewardArtifacts: [],
    rewardBloodlines: [],
    rewardValhalla: [],
    rewardFashion: [],
    rewardFormations: [],
    rewardSpirits: [],
    rewardOldTrekShips: [],
  };
  if (rewardId <= 0 || rewardCount <= 0) return state;
  assertRewardRowsSupported([row]);

  if (kind === 'gemPack') {
    const random = require('./RandomUsableItemRewardService');
    const ids = random.getGemRewardIdsByLevel(random.getGemPackLevel(rewardId));
    if (!ids.length) throw new Error('GEM_REWARD_CONFIG_MISSING');
    for (let index = 0; index < rewardCount; index += 1) {
      const gem = grantGemToPlayer(player, ids[Math.floor(Math.random() * ids.length)]);
      if (!gem) throw new Error('GEM_NATIVE_GRANT_FAILED');
      state.rewardGems.push(gem);
    }
    return state;
  }

  if (nativeItems.getKind(rewardId)) {
    const result = nativeItems.grant(player, rewardId, rewardCount);
    state.rewardItems.push(...result.displayItems);
    state.itemDeltas.push(...result.bagItems);
    return state;
  }

  if (kind === 'oldTrekShip') {
    for (let i = 0; i < rewardCount; i += 1) {
      const ship = grantOldTrekShipToPlayer(player, rewardId);
      if (ship && !state.rewardOldTrekShips.some((row) => row.id === ship.id)) state.rewardOldTrekShips.push(ship);
    }
    return state;
  }

  if (kind === 'formation') {
    for (let i = 0; i < rewardCount; i += 1) {
      if (grantFormationToPlayer(player, rewardId)) pushUniqueById(state.rewardFormations, { id: rewardId });
      grantDisplayFashion(player, rewardId, state.rewardFashion);
    }
    return state;
  }
  if (kind === 'sword') {
    const swordId = resolveMountGrantId(rewardId);
    for (let i = 0; i < rewardCount; i += 1) {
      const mount = grantMountToPlayer(player, swordId);
      if (mount) state.rewardSwords.push(mount);
    }
    grantDisplayFashion(player, rewardId, state.rewardFashion);
    return state;
  }
  if (kind === 'pet') {
    for (let i = 0; i < rewardCount; i += 1) {
      const pet = grantPetToPlayer(player, rewardId);
      if (pet) state.rewardPets.push(pet);
    }
    return state;
  }
  if (kind === 'petSoul') {
    for (let i = 0; i < rewardCount; i += 1) {
      const soul = grantPetSoulToPlayer(player, rewardId);
      if (soul) state.rewardPetSouls.push(soul);
    }
    return state;
  }
  if (kind === 'bloodline') {
    for (let i = 0; i < rewardCount; i += 1) {
      const bloodline = grantBloodlineToPlayer(player, rewardId);
      if (bloodline) state.rewardBloodlines.push(bloodline);
    }
    return state;
  }
  if (kind === 'valhalla') {
    for (let i = 0; i < rewardCount; i += 1) {
      const hero = grantValhallaToPlayer(player, rewardId);
      if (hero) state.rewardValhalla.push(hero);
    }
    return state;
  }
  if (kind === 'artifact') {
    for (let i = 0; i < rewardCount; i += 1) {
      const artifact = grantArtifactToPlayer(player, rewardId);
      if (artifact) state.rewardArtifacts.push(artifact);
    }
    grantDisplayFashion(player, rewardId, state.rewardFashion);
    return state;
  }
  if (kind === 'specialArtifact') {
    for (let i = 0; i < rewardCount; i += 1) {
      const artifact = grantSpecialArtifactToPlayer(player, rewardId);
      if (artifact) state.rewardArtifacts.push(artifact);
    }
    return state;
  }
  if (kind === 'spirit') {
    for (let i = 0; i < rewardCount; i += 1) {
      const spirit = grantSpiritToPlayer(player, rewardId);
      if (spirit) {
        pushUniqueById(state.rewardSpirits, { id: rewardId });
        if (spirit.itemDelta > 0) {
          state.itemDeltas.push({ id: rewardId, count: spirit.itemDelta });
          state.rewardItems.push({ id: rewardId, count: spirit.itemDelta });
        }
      }
      grantDisplayFashion(player, rewardId, state.rewardFashion);
    }
    return state;
  }
  if (kind === 'fashion') {
    const fashionRow = (config.get('FashionConfig') || {})[rewardId];
    const swaps = Array.isArray(fashionRow.swaps) ? fashionRow.swaps
      : (fashionRow.swaps && typeof fashionRow.swaps === 'object' ? [fashionRow.swaps] : []);
    for (let i = 0; i < rewardCount; i += 1) {
      const result = grantFashionToPlayer(player, rewardId);
      if (result && (result.newlyOwned || result.timed)) {
        pushUniqueById(state.rewardFashion, result.row);
      } else if (swaps.length) {
        // Reuse the normal grant pipeline so swaps are real state deltas, not
        // merely UI rewards. All current Fashion swaps are currency item 1.
        const converted = require('../handlers/item').addRewardRowsToPlayer(player, swaps, 1);
        state.itemDeltas.push(...converted.itemDeltas);
        state.rewardItems.push(...converted.rewardInfo.items);
        for (const [target, source] of [['rewardEquips','equips'], ['rewardSwords','swords'],
          ['rewardPets','pets'], ['rewardPetSouls','petSouls'], ['rewardArtifacts','artifacts'],
          ['rewardGems','gems'], ['rewardBloodlines','bloodline'], ['rewardValhalla','valhalla'],
          ['rewardFashion','fashion'], ['rewardFormations','formations'], ['rewardSpirits','spirits']]) {
          state[target].push(...(converted.rewardInfo[source] || []));
        }
      }
    }
    return state;
  }
  if (kind === 'gem') {
    for (let i = 0; i < rewardCount; i += 1) {
      const gem = grantGemToPlayer(player, rewardId);
      if (gem) state.rewardGems.push(gem);
    }
    return state;
  }

  state.rewardItems.push({ id: rewardId, count: rewardCount });
  state.deferBagGrant = false;
  return state;
}

function buildAppearanceSyncPackets(player = {}, rewardInfo = {}, options = {}) {
  const packets = nativeItems.buildSyncPackets(player, rewardInfo);
  const info = rewardInfo && typeof rewardInfo === 'object' ? rewardInfo : {};
  const sources = [info];
  const extra = info.extraReward && typeof info.extraReward === 'object' && !Array.isArray(info.extraReward)
    ? info.extraReward
    : {};
  Object.values(extra).forEach((row) => {
    if (row && typeof row === 'object' && !Array.isArray(row)) sources.push(row);
  });
  const fashionRows = sources.flatMap((source) => (Array.isArray(source.fashion) ? source.fashion : []));
  const formationRows = sources.flatMap((source) => (Array.isArray(source.formations) ? source.formations : []));
  const oldTrekShips = sources.flatMap((source) => (Array.isArray(source.oldTrekShips) ? source.oldTrekShips : []));
  if (fashionRows.length > 0) {
    const fashionInfo = player && player.fashionInfo && typeof player.fashionInfo === 'object'
      ? player.fashionInfo
      : {};
    packets.push({
      tag: 1800,
      msgUid: 0,
      data: {
        result: 0,
        data: Array.isArray(fashionInfo.fashionData) ? fashionInfo.fashionData : [],
        fashion: Array.isArray(fashionInfo.activateFashion) ? fashionInfo.activateFashion : [],
      },
    });
  }
  if (formationRows.length > 0) {
    // eslint-disable-next-line global-require
    const formation = require('./FormationService');
    const formationInfo = formation.ensureFormationInfo(player);
    packets.push({ tag: 3000, msgUid: 0, data: { result: 0, info: formationInfo } });
  }
  if (oldTrekShips.length > 0) {
    const oldTrek = require('../handlers/old-trek');
    packets.push({ tag: 7000, msgUid: 0, data: oldTrek.ensureOldTrekInfo(player) });
  }
  return packets.map((packet) => ({ ...packet, msgUid: toSafeInt(options.msgUid, packet.msgUid || 0) }));
}

function flattenRewardRows(rewardInfo = {}, key) {
  const root = rewardInfo && typeof rewardInfo === 'object' ? rewardInfo : {};
  const sources = [root];
  Object.values(root.extraReward && typeof root.extraReward === 'object' ? root.extraReward : {})
    .forEach((row) => {
      if (row && typeof row === 'object' && !Array.isArray(row)) sources.push(row);
    });
  return sources.flatMap((source) => (Array.isArray(source[key]) ? source[key] : []));
}

function assertRewardRowsSupported(rows = []) {
  for (const row of rows) {
    if (require('./FashionBoxService').isBox(row && row.id)) {
      require('./FashionBoxService').rewardsFor(Number(row.id), Number(row.count));
    }
    const asset = getAssetRow(row && row.id);
    if (asset && asset.type === 99 && /^random_connect_/.test(asset.icon || '')
      && !require('./RandomUsableItemRewardService').getVerifiedBoxPool(asset.id)) {
      const error = new Error('ITEM_REWARD_POOL_UNVERIFIED');
      error.code = 'ITEM_REWARD_POOL_UNVERIFIED';
      error.itemId = asset.id;
      throw error;
    }
  }
}

function buildNativeSyncPackets(player = {}, rewardInfo = {}) {
  const packets = buildAppearanceSyncPackets(player, rewardInfo);
  const swords = flattenRewardRows(rewardInfo, 'swords');
  const pets = flattenRewardRows(rewardInfo, 'pets');
  const artifacts = flattenRewardRows(rewardInfo, 'artifacts');
  const petSouls = flattenRewardRows(rewardInfo, 'petSouls');
  const gems = flattenRewardRows(rewardInfo, 'gems');
  const bloodlineRows = flattenRewardRows(rewardInfo, 'bloodline');
  const valhallaRows = flattenRewardRows(rewardInfo, 'valhalla');
  if (swords.length > 0) {
    packets.push({ tag: 3201, msgUid: 0, data: { result: 0, data: swords } });
    // eslint-disable-next-line global-require
    const mount = require('../handlers/mount');
    const mountInfo = mount.ensureMountInfo(player);
    const payload = typeof mount.buildMountInfoUpdatePayload === 'function'
      ? mount.buildMountInfoUpdatePayload(mountInfo) : mountInfo;
    packets.push({ tag: 3200, msgUid: 0, data: { result: 0, uid: payload && payload.equippedUid, info: payload } });
  }
  if (pets.length > 0) packets.push({ tag: 3300, msgUid: 0, data: { result: 0, data: pets } });
  artifacts.forEach((artifact) => packets.push({ tag: 3500, msgUid: 0, data: { result: 0, artifact } }));
  petSouls.forEach((soul) => packets.push({ tag: 6901, msgUid: 0, data: { result: 0, data: soul } }));
  if (gems.length > 0) {
    // eslint-disable-next-line global-require
    const gem = require('../handlers/gem');
    const info = gem.ensureGemInfo(player);
    packets.push({
      tag: 3900,
      msgUid: 0,
      data: {
        equippedId: 0,
        plan: info.plan,
        gems: info.gems,
        exchangeTimes: info.exchangeTimes,
        fieldCount: info.fieldCount,
      },
    });
    gems.forEach((row) => packets.push({
      tag: 3901,
      msgUid: 0,
      data: { result: 0, uid: toSafeInt(row && row.uid), id: toSafeInt(row && row.id), shapeId: toSafeInt(row && row.shapeId) },
    }));
  }
  if (bloodlineRows.length > 0) {
    // eslint-disable-next-line global-require
    const bloodline = require('../handlers/bloodline');
    if (typeof bloodline.ensureBloodlineInfo === 'function' && typeof bloodline.buildBloodlinePayload === 'function') {
      packets.push({ tag: 4701, msgUid: 0, data: { result: 0, ...bloodline.buildBloodlinePayload(bloodline.ensureBloodlineInfo(player)) } });
    }
  }
  if (valhallaRows.length > 0) {
    // eslint-disable-next-line global-require
    const valhalla = require('../handlers/valhalla');
    if (typeof valhalla.ensureValhallaInfo === 'function' && typeof valhalla.buildValhallaPayload === 'function') {
      packets.push({ tag: 4100, msgUid: 0, data: { result: 0, ...valhalla.buildValhallaPayload(valhalla.ensureValhallaInfo(player)) } });
    }
  }
  const oldTrekShips = flattenRewardRows(rewardInfo, 'oldTrekShips');
  if (oldTrekShips.length > 0) {
    const oldTrek = require('../handlers/old-trek');
    packets.push({ tag: 7000, msgUid: 0, data: oldTrek.ensureOldTrekInfo(player) });
  }
  return packets;
}

module.exports = {
  assertRewardRowsSupported,
  buildEmptyRewardInfo,
  buildAppearanceSyncPackets,
  buildNativeSyncPackets,
  getRewardKind,
  grantRewardRow,
  grantMountToPlayer,
  grantPetToPlayer,
  grantPetSoulToPlayer,
  grantBloodlineToPlayer,
  grantValhallaToPlayer,
  grantArtifactToPlayer,
  grantSpecialArtifactToPlayer,
  grantGemToPlayer,
  grantFormationToPlayer,
  grantSpiritToPlayer,
  grantFashionToPlayer,
  grantOldTrekShipToPlayer,
  migrateOldTrekShipItem,
  isOldTrekShipSkinId,
};

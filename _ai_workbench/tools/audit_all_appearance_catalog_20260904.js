'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const APP = path.resolve(process.env.LHS_APP_ROOT || path.join(ROOT, 'linhhoasu/lhs/newServer'));
const CONFIG = path.resolve(process.env.LHS_CONFIG_PATH
  || path.join(ROOT, 'linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin'));
const LANG = path.resolve(process.env.LHS_LANG_PATH
  || path.join(ROOT, 'linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin'));
const OUTPUT = path.resolve(process.env.LHS_APPEARANCE_OUTPUT
  || path.join(ROOT, '_ai_workbench/temp/appearance_catalog_raw_20260904.json'));

process.env.CONFIG_BIN_PATH = CONFIG;
const config = require(path.join(APP, 'src/services/ConfigService'));
const item = require(path.join(APP, 'src/handlers/item'));
const fashion = require(path.join(APP, 'src/handlers/fashion'));
const roleAppearance = require(path.join(APP, 'src/services/RoleAppearanceService'));
const rewardGrant = require(path.join(APP, 'src/services/RewardGrantService'));
const playerService = require(path.join(APP, 'src/services/PlayerService'));

playerService.savePlayer = async (_userId, player) => player;

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function row(table, id) {
  return object(table)[id] || object(table)[String(id)] || null;
}

function basePlayer() {
  return {
    userId: '',
    playerId: 'appearance-fixture',
    name: 'appearance-fixture',
    level: 999,
    roleInfo: { kungfuId: 4, subJob: 0 },
    items: {},
    currencies: { diamond: 1000000000, silver: 1000000000, gold: 1000000000 },
    fashionInfo: {
      curFashion: {}, fashion: {}, fashionMap: {}, fashions: {}, activateFashion: [],
      fashionData: [], suits: {}, suitColors: {}, starUp: {}, sets: [], setId: 0,
    },
    formationInfo: {},
    swordInfo: {},
    spiritInfo: {},
    artifactInfo: {},
    petInfo: {},
    petSoulInfo: {},
    shopInfo: { buyRecords: {} },
  };
}

function summarizeReward(result = {}) {
  const info = object(result.rewardInfo);
  return {
    items: array(info.items).length,
    fashion: array(info.fashion).length,
    swords: array(info.swords).length,
    artifacts: array(info.artifacts).length,
    pets: array(info.pets).length,
    petSouls: array(result.rewardPetSouls).length,
    formations: array(result.rewardFormations).length,
    spirits: array(result.rewardSpirits).length,
    bloodline: array(info.bloodline).length,
    valhalla: array(info.valhalla).length,
    kind: '',
  };
}

function getCategory(type, assetType) {
  const labels = {
    2: 'Pháp trận/cánh',
    5: 'Thú cưỡi/phi kiếm',
    17: 'Pháp tướng',
    101: 'Danh hiệu',
    102: 'Ảnh đại diện',
    103: 'Khung ảnh đại diện',
    104: 'Bong bóng chat',
    105: 'Dấu chân',
    106: 'Thú vị/đồ chơi',
    107: 'Giao diện chính/theme',
    200: 'Danh thiếp/phông nền',
    301: 'Vũ khí',
    302: 'Phụ kiện đầu',
    303: 'Áo choàng ngoài/thân',
    304: 'Phụ kiện ngoại quan type 304',
    305: 'Nét mặt',
    309: 'Quần',
  };
  if (labels[type]) return labels[type];
  return `Fashion type ${type} / asset ${assetType}`;
}

function expectedNativeKind(assetType) {
  if (assetType === 2) return 'formation';
  if (assetType === 5 || assetType === 94) return 'sword';
  if (assetType === 16 || assetType === 96) return 'artifact';
  if (assetType === 17) return 'spirit';
  if (assetType === 6) return 'pet';
  if (assetType === 40) return 'petSoul';
  return 'fashion';
}

function getDressVariants(dressId, dressRow, tables) {
  let source = {};
  if (number(dressRow.isSuit) === 0) source = row(tables.FashionColorConfig, dressId);
  if (number(dressRow.isSuit) === 1) source = row(tables.FashionDressLevelConfig, dressId);
  if (number(dressRow.isSuit) === 2) source = row(tables.FashionChangeColorConfig, dressId);
  if (number(dressRow.isSuit) === 3) source = row(tables.FashionBathConfig, dressId);
  if (number(dressRow.isSuit) === 4) {
    const entry = row(tables.FashionEndDressConfig, dressId);
    source = entry ? { 0: entry } : {};
  }
  return Object.entries(object(source)).map(([variant, value]) => ({
    variant: number(variant),
    config: object(value),
    fashionIds: array(value && value.fashionIds).map(number).filter((id) => id > 0),
  }));
}

async function main() {
  const tables = config.loadAllTables(CONFIG);
  const names = {};
  config.reload(LANG);
  const language = object(config.get('LanguageConfig'));
  Object.keys(language).forEach((key) => { names[key] = String(language[key] && language[key].cn || ''); });
  config.reload(CONFIG);

  const assets = object(tables.AssetsConfig);
  const appearance = object(tables.AppearanceConfig);
  const fashionConfig = object(tables.FashionConfig);
  const assetUse = object(tables.AssetsUseConfig);
  const nativeTables = {
    formation: object(tables.FormationConfig),
    sword: object(tables.SwordConfig),
    artifact: object(tables.ArtifactConfig),
    specialArtifact: object(tables.SpecialArtifactConfig),
    spirit: object(tables.SpiritConfig),
    pet: object(tables.PetConfig),
    petSoul: object(tables.PetSoulConfig),
    specialSword: object(tables.SpecialSwordConfig),
  };

  const fashionRows = [];
  for (const cfg of Object.values(fashionConfig).sort((a, b) => number(a.id) - number(b.id))) {
    const id = number(cfg.id);
    const itemId = number(cfg.itemId, id);
    const asset = object(row(assets, itemId));
    const assetType = number(asset.type);
    const type = number(cfg.type);
    const appears = array(cfg.appearIds).map(number).filter((value) => value > 0);
    const missingAppearIds = appears.filter((appearId) => !row(appearance, appearId));
    const fixture = basePlayer();
    const grantResult = item.addRewardRowsToPlayer(fixture, [{ id, count: 1 }], 1);
    const rewardSummary = summarizeReward(grantResult);
    const expectedKind = expectedNativeKind(assetType);
    const actualKind = rewardSummary.formations > 0 ? 'formation'
      : rewardSummary.spirits > 0 ? 'spirit'
        : rewardSummary.swords > 0 ? 'sword'
        : rewardSummary.artifacts > 0 ? 'artifact'
          : rewardSummary.pets > 0 ? 'pet'
            : rewardSummary.petSouls > 0 ? 'petSoul'
              : rewardSummary.fashion > 0 ? 'fashion'
              : rewardSummary.items > 0 ? 'item' : 'empty';
    const issues = [];
    if (!row(assets, itemId)) issues.push('MISSING_ASSETS_CONFIG');
    if (missingAppearIds.length > 0 && type !== 107) issues.push('MISSING_APPEARANCE_CONFIG');
    if (object(cfg.condition)['10'] != null && array(fixture.fashionInfo.fashionData).length === 0) {
      issues.push('TIMED_FASHION_MISSING_DURATION_STATE');
    }
    if (expectedKind !== 'fashion' && actualKind !== expectedKind) {
      issues.push(`WRONG_REWARD_ROUTE_EXPECT_${expectedKind.toUpperCase()}_GOT_${actualKind.toUpperCase()}`);
    }
    if (type === 107 && !row(tables.FashionBtnConfig, id)) issues.push('MISSING_FASHION_BUTTON_THEME_CONFIG');
    if (id !== itemId) issues.push('FASHION_ID_DIFFERS_FROM_ITEM_ID');

    fashionRows.push({
      family: 'fashion',
      category: getCategory(type, assetType),
      sendItemId: itemId,
      fashionId: id,
      nameId: number(asset.name),
      name: names[String(asset.name)] || '',
      fashionType: type,
      assetType,
      assetSubType: number(asset.subType),
      quality: number(asset.quality),
      icon: String(asset.icon || ''),
      appearIds: appears,
      appearanceRows: appears.map((appearId) => row(appearance, appearId)),
      condition: object(cfg.condition),
      timedSeconds: Math.max(0, number(object(cfg.condition)['10'])),
      showType: number(cfg.showType, -1),
      showTypeTw: number(cfg.showTypeTw, -1),
      actualRewardKind: actualKind,
      expectedRewardKind: expectedKind,
      issues,
    });
  }

  const dressRows = [];
  const dressConfig = object(tables.FashionDressConfig);
  for (const cfg of Object.values(dressConfig).sort((a, b) => number(a.id) - number(b.id))) {
    const id = number(cfg.id);
    const asset = object(row(assets, id));
    const use = object(row(assetUse, id));
    const variants = getDressVariants(id, cfg, tables);
    const expectedPieces = variants.flatMap((variant) => variant.fashionIds);
    const issues = [];
    if (!row(assets, id) && ![28000, 29810, 29999].includes(id)) issues.push('MISSING_DRESS_ITEM_ASSET');
    if (row(assets, id) && number(asset.useType) !== 105) issues.push('DRESS_ITEM_USE_TYPE_NOT_105');
    if (row(assets, id) && array(use.rewards).length === 0) issues.push('DRESS_ITEM_REWARD_EMPTY');
    const missingPieces = expectedPieces.filter((pieceId) => !row(fashionConfig, pieceId));
    if (missingPieces.length > 0) issues.push('DRESS_VARIANT_MISSING_FASHION_PIECE');

    let useFixture = null;
    if (row(assets, id) && row(assetUse, id)) {
      const player = basePlayer();
      player.items[id] = 1;
      const response = await item.handleUseItem({ id, count: 1 }, { player }, 1);
      useFixture = {
        responseTags: (Array.isArray(response) ? response : [response]).map((packet) => number(packet && packet.tag)),
        itemLeft: number(player.items[id]),
        activated: array(player.fashionInfo.activateFashion).slice().sort((a, b) => a - b),
        expected: array(use.rewards).map((reward) => number(reward && reward.id)).filter((value) => value > 0).sort((a, b) => a - b),
      };
      if (JSON.stringify(useFixture.activated) !== JSON.stringify(useFixture.expected)) {
        issues.push('DRESS_ITEM_USE_DID_NOT_ACTIVATE_CONFIGURED_PIECES');
      }
    }

    const ownedVariant = variants.find((variant) => variant.fashionIds.length > 0);
    let equipFixture = null;
    if (ownedVariant) {
      const player = basePlayer();
      player.fashionInfo.fashions = Object.fromEntries(ownedVariant.fashionIds.map((pieceId) => [String(pieceId), 1]));
      player.fashionInfo.activateFashion = ownedVariant.fashionIds.slice();
      roleAppearance.ensureRoleAppearance(player);
      const beforeFashion = clone(player.fashionInfo.curFashion);
      const response = await fashion.handleChangeSuit(
        { id, color: ownedVariant.variant, set: 0 },
        { player },
        2
      );
      const responseRows = array(response && response.data && response.data.fashion);
      equipFixture = {
        responseRows,
        currentFashion: clone(player.fashionInfo.curFashion),
        expectedPieceIds: ownedVariant.fashionIds,
        beforeFashion,
      };
      const currentIds = Object.values(player.fashionInfo.curFashion).map(number);
      if (JSON.stringify(player.fashionInfo.curFashion) === JSON.stringify(beforeFashion)
        || !ownedVariant.fashionIds.every((pieceId) => currentIds.includes(pieceId))) {
        issues.push('SUIT_EQUIP_DOES_NOT_APPLY_COMPONENTS');
      }
    }

    dressRows.push({
      family: number(cfg.isSuit) === 3 ? 'bathrobe' : 'dress',
      category: number(cfg.isSuit) === 3 ? 'Áo choàng tắm' : 'Thời trang/bộ đồ',
      sendItemId: row(assets, id) ? id : 0,
      dressId: id,
      nameId: number(asset.name || cfg.name),
      name: names[String(asset.name || cfg.name)] || '',
      isSuit: number(cfg.isSuit),
      assetType: number(asset.type),
      useType: number(asset.useType),
      quality: number(asset.quality),
      icon: String(asset.icon || ''),
      variants,
      missingPieces,
      useFixture,
      equipFixture,
      issues,
    });
  }

  const nativeRows = [];
  const nativeDefinitions = [
    ['formation', 'Pháp trận/cánh', nativeTables.formation],
    ['sword', 'Thú cưỡi/phi kiếm', nativeTables.sword],
    ['artifact', 'Pháp bảo', nativeTables.artifact],
    ['specialArtifact', 'Pháp bảo đặc biệt', nativeTables.specialArtifact],
    ['spirit', 'Pháp tướng', nativeTables.spirit],
    ['pet', 'Linh thú', nativeTables.pet],
    ['petSoul', 'Thú hồn', nativeTables.petSoul],
    ['specialSword', 'Thú cưỡi đặc biệt', nativeTables.specialSword],
  ];
  for (const [family, category, table] of nativeDefinitions) {
    for (const cfg of Object.values(table).sort((a, b) => number(a.id) - number(b.id))) {
      const id = number(cfg.id);
      const asset = object(row(assets, id));
      const appearId = Math.max(0, number(cfg.appearId || cfg.showId || asset.param || id));
      const issues = [];
      if (!row(assets, id)) issues.push('MISSING_NATIVE_ITEM_ASSET');
      if (appearId > 0 && !row(appearance, appearId) && !['specialArtifact', 'specialSword'].includes(family)) {
        issues.push('MISSING_NATIVE_APPEARANCE_CONFIG');
      }
      const player = basePlayer();
      const grant = rewardGrant.grantRewardRow(player, { id, count: 1 }, 1);
      const actualKind = grant.kind;
      const expected = family === 'specialArtifact' ? 'specialArtifact'
        : family === 'specialSword' ? 'sword' : family;
      if (actualKind !== expected) issues.push(`REWARD_GRANT_UNSUPPORTED_EXPECT_${expected.toUpperCase()}_GOT_${actualKind.toUpperCase()}`);
      const itemPlayer = basePlayer();
      const itemGrant = item.addRewardRowsToPlayer(itemPlayer, [{ id, count: 1 }], 1);
      const itemSummary = summarizeReward(itemGrant);
      const itemActual = itemSummary.formations > 0 ? 'formation'
        : itemSummary.spirits > 0 ? 'spirit'
          : itemSummary.swords > 0 ? 'sword'
          : itemSummary.artifacts > 0 ? 'artifact'
            : itemSummary.pets > 0 ? 'pet'
              : itemSummary.petSouls > 0 ? 'petSoul'
                : itemSummary.fashion > 0 ? 'fashion'
                : itemSummary.items > 0 ? 'item' : 'empty';
      if (['formation', 'spirit'].includes(family) && itemActual === 'fashion') {
        issues.push('DIRECT_REWARD_ONLY_UNLOCKS_COSMETIC_NOT_NATIVE_COLLECTION');
      }
      if (['sword', 'artifact'].includes(family) && row(fashionConfig, id) && itemActual === 'fashion') {
        issues.push('ITEM_REWARD_FASHION_PRECEDENCE_SKIPS_NATIVE_COLLECTION');
      }

      nativeRows.push({
        family,
        category,
        sendItemId: id,
        nativeId: id,
        nameId: number(asset.name || cfg.name),
        name: names[String(asset.name || cfg.name)] || '',
        assetType: number(asset.type),
        quality: number(asset.quality || cfg.quality),
        icon: String(asset.icon || cfg.icon || cfg.iconShow || ''),
        appearId,
        appearanceRow: row(appearance, appearId),
        fashionOverlap: !!row(fashionConfig, id),
        rewardGrantKind: actualKind,
        itemRewardKind: itemActual,
        issues,
      });
    }
  }

  const bypass = basePlayer();
  const bypassFashionId = fashionRows.find((entry) => entry.expectedRewardKind === 'fashion').fashionId;
  const bypassFashionType = number(row(fashionConfig, bypassFashionId).type);
  const changeWithoutOwnership = await fashion.handleChangeFashion(
    { id: bypassFashionId, type: bypassFashionType, set: 0 },
    { player: bypass },
    50
  );
  const expiredVictim = basePlayer();
  roleAppearance.unlockEquipAppearance(expiredVictim, bypassFashionId);
  const official = require(path.join(APP, 'src/handlers/official-compat'));
  const expiredWithoutValidation = await official.handleFashionExpired(
    { ids: [bypassFashionId] }, { player: expiredVictim }, 51
  );
  const arbitrarySuitColor = basePlayer();
  const colorGroup = Object.values(object(tables.FashionColorConfig))
    .find((group) => Object.keys(object(group)).length > 1);
  const colorRow = colorGroup && Object.values(colorGroup)[1];
  const colorBefore = clone(arbitrarySuitColor.items);
  const colorResponse = colorRow ? await fashion.handleSuitColorUnlock(
    { id: number(colorRow.id), color: number(colorRow.colorId), replace: 0 },
    { player: arbitrarySuitColor }, 52
  ) : null;
  const starPlayer = basePlayer();
  const starDressId = number(Object.keys(object(tables.FashionDressLevelConfig))[0]);
  const starBefore = clone(starPlayer.items);
  const starResponse = await fashion.handleDressStarUp(
    { id: starDressId, star: 999 }, { player: starPlayer }, 53
  );
  const emojiPlayer = basePlayer();
  const emojiBefore = clone(emojiPlayer.items);
  const emojiResponse = await fashion.handlePurchaseEmojiGroup(
    { group: 999 }, { player: emojiPlayer }, 54
  );

  const handlerFindings = {
    changeWithoutOwnership: {
      fashionId: bypassFashionId,
      result: number(changeWithoutOwnership && changeWithoutOwnership.data && changeWithoutOwnership.data.result, -1),
      becameOwned: number(bypass.fashionInfo.fashions[String(bypassFashionId)]) > 0,
    },
    expiryWithoutServerTimeValidation: {
      fashionId: bypassFashionId,
      returnedIds: array(expiredWithoutValidation && expiredWithoutValidation.data && expiredWithoutValidation.data.ids),
      remainsOwned: number(expiredVictim.fashionInfo.fashions[String(bypassFashionId)]) > 0,
    },
    suitColorWithoutCostOrOwnership: {
      id: number(colorRow && colorRow.id),
      color: number(colorRow && colorRow.colorId),
      result: number(colorResponse && colorResponse.data && colorResponse.data.result, -1),
      costUnchanged: JSON.stringify(colorBefore) === JSON.stringify(arbitrarySuitColor.items),
    },
    dressStarWithoutCostOwnershipOrCap: {
      id: starDressId,
      requestedStar: 999,
      result: number(starResponse && starResponse.data && starResponse.data.result, -1),
      storedStar: number(starPlayer.fashionInfo.starUp[String(starDressId)]),
      dressStateIsArray: Array.isArray(starPlayer.fashionInfo.dress),
      costUnchanged: JSON.stringify(starBefore) === JSON.stringify(starPlayer.items),
    },
    emojiGroupWithoutConfigCostOrOwnership: {
      group: 999,
      result: number(emojiResponse && emojiResponse.data && emojiResponse.data.result, -1),
      stored: array(emojiResponse && emojiResponse.data && emojiResponse.data.emoji),
      costUnchanged: JSON.stringify(emojiBefore) === JSON.stringify(emojiPlayer.items),
    },
  };

  const allRows = [...fashionRows, ...dressRows, ...nativeRows];
  const issueCounts = {};
  allRows.forEach((entry) => entry.issues.forEach((issue) => {
    issueCounts[issue] = (issueCounts[issue] || 0) + 1;
  }));
  const categoryCounts = {};
  allRows.forEach((entry) => {
    categoryCounts[entry.category] = (categoryCounts[entry.category] || 0) + 1;
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    configPath: CONFIG,
    languagePath: LANG,
    tableCount: Object.keys(tables).length,
    summary: {
      fashionRows: fashionRows.length,
      dressRows: dressRows.length,
      nativeRows: nativeRows.length,
      allRows: allRows.length,
      issueRows: allRows.filter((entry) => entry.issues.length > 0).length,
      issueCounts,
      categoryCounts,
    },
    handlerFindings,
    fashionRows,
    dressRows,
    nativeRows,
  };
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n');
  console.log(JSON.stringify({ result: 'PASS', output: OUTPUT, summary: payload.summary, handlerFindings }));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});

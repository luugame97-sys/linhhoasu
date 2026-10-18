'use strict';

/**
 * Build the user-approved system-auction catalog from the VN config dump.
 *
 * This deliberately does not write production data.  The CN server export
 * was not found, so the catalog is formula-reconstructed and
 * stays scoped to the approved system-only release; player consignment and
 * recycle remain disabled until they receive a separate design review.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const TABLE_DIR = path.join(ROOT, 'linhhoasu', 'lhs', 'newServer', 'scripts', '_tables_dump');
const OUTPUT = path.join(ROOT, '_ai_workbench', 'temp', 'auction_20261015', 'candidate', 'catalog-vn-system-v1.json');

function readTable(name) {
  const file = path.join(TABLE_DIR, `${name}.json`);
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  return parsed && parsed.data && typeof parsed.data === 'object' ? parsed.data : {};
}

function asInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : fallback;
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function lookup(map, key) {
  if (!map || typeof map !== 'object') return null;
  return map[key] ?? map[String(key)] ?? null;
}

function lookupNested(map, keys) {
  let current = map;
  for (const key of keys) {
    current = lookup(current, key);
    if (!current) return null;
  }
  return current;
}

function maxNumericKey(map, fallback) {
  const keys = Object.keys(asObject(map)).map((key) => asInt(key, 0)).filter((key) => key > 0);
  return keys.length > 0 ? Math.max(...keys) : fallback;
}

function buildExtraAttrs({ quality, fitConfig, forgeAttrs, unlockLevels }) {
  const attrIds = Array.isArray(fitConfig && fitConfig.attr) ? fitConfig.attr : [];
  let attrType = 54;
  for (const attrId of attrIds) {
    const row = lookup(forgeAttrs, attrId);
    if (row && asInt(row.attrId, 0) > 0) {
      attrType = asInt(row.attrId, 54);
      break;
    }
  }
  return unlockLevels
    .map((level) => asInt(level, 0))
    .filter((level) => level > 0)
    .map((level) => ({ type: attrType, value: Math.max(10, quality * level), level }));
}

function buildArtifact({ special, artifactConfig, artifactBase, forgeSkill, forgeAttrs }) {
  const showId = asInt(special.showId, 0);
  const template = lookup(artifactConfig, showId);
  if (!template) throw new Error(`ARTIFACT_CONFIG_MISSING:${showId}`);
  const quality = asInt(template.quality, 0);
  const type = asInt(template.type, 0);
  const mainType = asInt(special.mainType, 0);
  const fitConfig = lookupNested(forgeSkill, [mainType, quality, type]);
  if (!fitConfig || asInt(fitConfig.skillGroupId, 0) <= 0) {
    throw new Error(`ARTIFACT_FIT_SKILL_MISSING:${showId}:${mainType}:${quality}:${type}`);
  }
  const skillLv = maxNumericKey(special.skillStar, Math.max(1, asInt(artifactBase.skillLvLimit?.[quality]?.[0], 1)));
  const extraAttrs = buildExtraAttrs({
    quality,
    fitConfig,
    forgeAttrs,
    unlockLevels: (Array.isArray(artifactBase.eAttrLevelCond) ? artifactBase.eAttrLevelCond : [])
      .filter((level) => asInt(level, 0) <= Math.max(1, asInt(special.lv, 1))),
  });
  const forgeCountMax = Math.max(0, asInt(artifactBase.forgeCountMax, 7));
  const attrValue = Math.max(1, quality * 100 + Math.max(0, asInt(special.lv, 1) - 1) * quality * 10);
  return {
    uid: 90000000 + asInt(special.id, 0),
    id: showId,
    count: forgeCountMax,
    lock: 0,
    attr: { type: mainType, level: Math.max(1, asInt(special.lv, 1)), value: attrValue },
    extraAttrs,
    skillGroup: asInt(fitConfig.skillGroupId, 0),
    skillLv,
    forgeTime: 0,
    forgeName: `ArtifactForgeRobotIndex_${asInt(special.id, 0) % 10 || 10}`,
    quenchLv: 0,
    eSkillGroup: 0,
    element: 0,
    sourceSpecialArtifactId: asInt(special.id, 0),
  };
}

function calculateSystemPrice(artifact, artifactConfig, auctionBase, attrValues) {
  const template = lookup(artifactConfig, artifact.id);
  const quality = asInt(template && template.quality, 0);
  const ratio = asInt(lookup(auctionBase.artifactAttrRatio, quality), 0);
  const attrScore = artifact.extraAttrs.reduce((sum, row) => {
    const attr = lookup(attrValues, row.type);
    return sum + (Number(attr && attr.score) || 0) * (Number(row.value) || 0);
  }, 0);
  const fitValues = lookupNested(auctionBase.artifactFitValue, [quality]);
  const starValues = lookupNested(auctionBase.artifactStarValue, [quality]);
  const skillValue = asInt(lookup(fitValues, artifact.skillLv) || lookup(starValues, artifact.skillLv), 0);
  return Math.max(0, Math.floor(ratio * attrScore + skillValue));
}

function buildCatalog() {
  const auctionBase = readTable('AuctionBaseConfig');
  const auctionOpen = readTable('AuctionOpenConfig');
  const auctionRobot = readTable('AuctionRobotConfig');
  const artifactConfig = readTable('ArtifactConfig');
  const specialArtifacts = readTable('SpecialArtifactConfig');
  const artifactBase = readTable('ArtifactBaseConfig');
  const forgeSkill = readTable('ArtifactForgeSkillConfig');
  const forgeAttrs = readTable('ArtifactForgeAttrsConfig');
  const attrValues = readTable('ArtifactAttrValueConfig');
  const assets = readTable('AssetsConfig');

  const serverIds = [1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008];
  const area = 1;
  const payId = area === 1 ? 1001 : area === 2 ? 1002 : 1003;
  if (!lookup(assets, payId)) throw new Error(`PAY_ASSET_MISSING:${payId}`);

  const selectedSpecialIds = [51301, 51302, 51303, 51304, 51305];
  const fixedValue = asInt(auctionBase.fixedValue, 0);
  const conversion = Number(lookup(auctionBase.moneyConversion, payId));
  const suggestRatio = Number(auctionBase.artifactValueSuggest) / 10000;
  if (!(fixedValue > 0) || !(conversion > 0) || !(suggestRatio > 0)) {
    throw new Error('AUCTION_PRICE_FORMULA_INVALID');
  }

  const lots = selectedSpecialIds.map((specialId, index) => {
    const special = lookup(specialArtifacts, specialId);
    if (!special) throw new Error(`SPECIAL_ARTIFACT_MISSING:${specialId}`);
    const artifact = buildArtifact({ special, artifactConfig, artifactBase, forgeSkill, forgeAttrs });
    const systemPriceStone = calculateSystemPrice(artifact, artifactConfig, auctionBase, attrValues);
    const systemPriceToken = Math.floor(systemPriceStone / conversion);
    const price = Math.floor(systemPriceToken * suggestRatio);
    if (!(price > 0) || price > fixedValue) throw new Error(`LOT_PRICE_INVALID:${specialId}:${price}`);
    const robotId = index + 1;
    if (!lookup(auctionRobot, robotId)) throw new Error(`AUCTION_ROBOT_MISSING:${robotId}`);
    return {
      lotId: `vn-system-${index + 1}`,
      id: index + 1,
      type: 1,
      status: 1,
      item: { id: artifact.id, count: 1 },
      detail: { artifact },
      price,
      fixedValue,
      payType: 0,
      payId,
      bidderId: '',
      bidderName: '',
      playerId: '',
      hideName: 0,
      hasOffer: 0,
      timeOffsetSec: asInt(auctionBase.royalOpenTime && auctionBase.royalOpenTime[0], 72000),
      closeOffsetSec: asInt(auctionBase.royalOpenTime && auctionBase.royalOpenTime[1], 79200),
      systemPriceStone,
      systemPriceToken,
      sourceSpecialArtifactId: specialId,
      sourceRobotId: robotId,
    };
  });

  const activeOpenRows = Object.values(auctionOpen).filter((row) => row && asInt(row.isRoyal, 0) === 1 && asInt(row.isPlayer, 0) === 0);
  return {
    schemaVersion: 1,
    catalogVersion: '20261015_vn_system_formula_v1',
    status: 'approved',
    approvalRequired: false,
    source: {
      cnServerExport: 'not_found_in_workspace_or_vps_scoped_search',
      vnFormula: 'AuctionBaseConfig + ArtifactConfig + SpecialArtifactConfig + ArtifactForge*Config',
      approvalReference: 'user-approved-formula-catalog-20261015',
      generatedAt: new Date().toISOString(),
    },
    scope: {
      mode: 'system_only',
      serverIds,
      area,
      payId,
      playerConsignment: false,
      recycle: false,
    },
    rules: {
      openTime: auctionBase.openTime,
      royalOpenTime: auctionBase.royalOpenTime,
      royalOnshelfTime: auctionBase.royalOnshelfTime,
      delay: auctionBase.delay,
      stopOnShelf: auctionBase.stopOnShelf,
      onShelfLimit: auctionBase.onShelfLimit,
      bidLimit: auctionBase.bidLimit,
      bidAdjustValue: auctionBase.royalBidAdjustValue,
      royalBidAdjustValue: auctionBase.royalBidAdjustValue,
      taxRate: auctionBase.taxRate,
      activeConfigRows: activeOpenRows.map((row) => row.id),
    },
    lots,
  };
}

function main() {
  const catalog = buildCatalog();
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  const summary = {
    output: path.relative(ROOT, OUTPUT).replaceAll(path.sep, '/'),
    status: catalog.status,
    lots: catalog.lots.length,
    serverIds: catalog.scope.serverIds,
    payId: catalog.scope.payId,
    prices: catalog.lots.map((lot) => ({ lotId: lot.lotId, itemId: lot.item.id, price: lot.price, fixedValue: lot.fixedValue })),
    productionWrites: 0,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = { buildCatalog };

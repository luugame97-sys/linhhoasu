'use strict';

/** Validate the approved formula catalog without connecting to production. */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const TABLE_DIR = path.join(ROOT, 'linhhoasu', 'lhs', 'newServer', 'scripts', '_tables_dump');
const CATALOG_PATH = path.join(ROOT, '_ai_workbench', 'temp', 'auction_20261015', 'candidate', 'catalog-vn-system-v1.json');

function readTable(name) {
  return JSON.parse(fs.readFileSync(path.join(TABLE_DIR, `${name}.json`), 'utf8')).data || {};
}

function lookup(map, key) {
  if (!map || typeof map !== 'object') return null;
  return map[key] ?? map[String(key)] ?? null;
}

function asInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : fallback;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const auctionBase = readTable('AuctionBaseConfig');
  const artifactBase = readTable('ArtifactBaseConfig');
  const artifactConfig = readTable('ArtifactConfig');
  const specialArtifacts = readTable('SpecialArtifactConfig');
  const assets = readTable('AssetsConfig');

  assert(catalog.status === 'approved', 'CATALOG_NOT_APPROVED');
  assert(catalog.approvalRequired === false, 'CATALOG_APPROVAL_FLAG_MISSING');
  assert(catalog.scope.mode === 'system_only', 'CATALOG_SCOPE_NOT_SYSTEM_ONLY');
  assert(catalog.scope.playerConsignment === false, 'PLAYER_CONSIGNMENT_ENABLED');
  assert(catalog.scope.recycle === false, 'RECYCLE_ENABLED');
  assert(Array.isArray(catalog.lots) && catalog.lots.length === asInt(auctionBase.onShelfLimit, 0), 'LOT_LIMIT_MISMATCH');
  assert(catalog.scope.payId === 1001 && lookup(assets, 1001), 'VN_PAY_ID_INVALID');

  const ids = new Set();
  for (const lot of catalog.lots) {
    assert(lot && typeof lot === 'object', 'LOT_NOT_OBJECT');
    assert(!ids.has(lot.lotId), `DUPLICATE_LOT:${lot.lotId}`);
    ids.add(lot.lotId);
    assert(lot.type === 1 && lot.status === 1, `LOT_STATE_INVALID:${lot.lotId}`);
    assert(lot.payType === 0 && lot.payId === catalog.scope.payId, `LOT_PAY_INVALID:${lot.lotId}`);
    assert(lot.item && asInt(lot.item.count, 0) === 1, `LOT_ITEM_COUNT_INVALID:${lot.lotId}`);
    const artifact = lot.detail && lot.detail.artifact;
    assert(artifact && asInt(artifact.uid, 0) > 0, `ARTIFACT_UID_INVALID:${lot.lotId}`);
    assert(lookup(artifactConfig, artifact.id), `ARTIFACT_ID_INVALID:${lot.lotId}`);
    const special = lookup(specialArtifacts, lot.sourceSpecialArtifactId);
    assert(special && asInt(special.showId, 0) === asInt(artifact.id, 0), `SPECIAL_ARTIFACT_MISMATCH:${lot.lotId}`);
    assert(asInt(lot.price, 0) > 0 && asInt(lot.price, 0) <= asInt(lot.fixedValue, 0), `LOT_PRICE_INVALID:${lot.lotId}`);
    assert(asInt(lot.timeOffsetSec, 0) === asInt(auctionBase.royalOpenTime[0], 0), `LOT_START_TIME_INVALID:${lot.lotId}`);
    assert(asInt(lot.closeOffsetSec, 0) === asInt(auctionBase.royalOpenTime[1], 0), `LOT_CLOSE_TIME_INVALID:${lot.lotId}`);
    assert(lot.playerId === '' && lot.bidderId === '', `LOT_PLAYER_OWNER_PRESENT:${lot.lotId}`);
    assert(artifact.count === asInt(artifactBase.forgeCountMax, 7), `ARTIFACT_COUNT_INVALID:${lot.lotId}`);
  }

  const result = {
    result: 'PASS',
    catalogVersion: catalog.catalogVersion,
    lots: catalog.lots.length,
    itemIds: catalog.lots.map((lot) => lot.item.id),
    prices: catalog.lots.map((lot) => lot.price),
    productionWrites: 0,
    networkAttempts: 0,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) main();

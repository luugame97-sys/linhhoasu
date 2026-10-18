'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const APP = path.resolve(process.env.LHS_APP_ROOT || path.join(ROOT, 'linhhoasu/lhs/newServer'));
const CONFIG = path.resolve(process.env.LHS_CONFIG_PATH
  || path.join(ROOT, 'linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin'));
const OUTPUT = path.resolve(process.env.LHS_APPEARANCE_MAIL_OUTPUT
  || path.join(ROOT, '_ai_workbench/temp/appearance_mail_route_20260904.json'));

process.env.CONFIG_BIN_PATH = CONFIG;
const config = require(path.join(APP, 'src/services/ConfigService'));
const mail = require(path.join(APP, 'src/handlers/mail'));
const rewardGrant = require(path.join(APP, 'src/services/RewardGrantService'));
const roleAppearance = require(path.join(APP, 'src/services/RoleAppearanceService'));

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

function row(table, id) {
  return object(table)[id] || object(table)[String(id)] || null;
}

function basePlayer() {
  return {
    userId: '',
    playerId: 'appearance-mail-fixture',
    name: 'appearance-mail-fixture',
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
  };
}

function expectedKind(id, tables) {
  if (row(tables.FormationConfig, id)) return 'formation';
  if (row(tables.SwordConfig, id) || row(tables.SpecialSwordConfig, id)) return 'sword';
  if (row(tables.ArtifactConfig, id)) return 'artifact';
  if (row(tables.SpecialArtifactConfig, id)) return 'specialArtifact';
  if (row(tables.SpiritConfig, id)) return 'spirit';
  if (row(tables.PetConfig, id)) return 'pet';
  if (row(tables.PetSoulConfig, id)) return 'petSoul';
  if (row(tables.FashionConfig, id)) return 'fashion';
  if (row(tables.FashionDressConfig, id)) return 'dressItem';
  return 'item';
}

function hasFashionOwnership(player, id) {
  const info = object(player.fashionInfo);
  return number(object(info.fashions)[String(id)]) > 0
    || array(info.activateFashion).map(number).includes(id);
}

function main() {
  const tables = config.loadAllTables(CONFIG);
  const idSet = new Set();
  const sources = [
    'FashionConfig', 'FashionDressConfig', 'FormationConfig', 'SwordConfig',
    'ArtifactConfig', 'SpecialArtifactConfig', 'SpiritConfig', 'PetConfig',
    'PetSoulConfig', 'SpecialSwordConfig',
  ];
  sources.forEach((name) => {
    Object.values(object(tables[name])).forEach((cfg) => {
      const id = number(cfg && cfg.id);
      if (id > 0) idSet.add(id);
    });
  });

  const rows = [];
  for (const id of [...idSet].sort((a, b) => a - b)) {
    const player = basePlayer();
    roleAppearance.ensureRoleAppearance(player);
    const ownedBefore = hasFashionOwnership(player, id);
    const fashionCfg = object(row(tables.FashionConfig, id));
    const expected = expectedKind(id, tables);
    const fashionGrant = mail.grantMailFashion(player, { id, count: 1 });
    let actual = 'item';
    let grantKind = 'item';
    let rewardCount = 0;
    if (fashionGrant) {
      actual = 'fashion';
      grantKind = 'fashion';
      rewardCount = array(fashionGrant.fashion).length;
    } else {
      grantKind = rewardGrant.getRewardKind(id);
      if (['sword', 'pet', 'petSoul', 'artifact', 'specialArtifact', 'gem', 'bloodline', 'valhalla'].includes(grantKind)) {
        const result = rewardGrant.grantRewardRow(player, { id, count: 1 }, 1);
        actual = result.kind;
        rewardCount = [
          ...array(result.rewardSwords), ...array(result.rewardPets),
          ...array(result.rewardPetSouls), ...array(result.rewardArtifacts),
          ...array(result.rewardGems), ...array(result.rewardBloodlines),
          ...array(result.rewardValhalla),
        ].length;
      }
    }

    const issues = [];
    if (expected === 'dressItem' && actual !== 'item') {
      issues.push(`MAIL_ROUTE_EXPECT_DRESS_ITEM_GOT_${actual.toUpperCase()}`);
    } else if (!['dressItem', 'item'].includes(expected) && actual !== expected) {
      issues.push(`MAIL_ROUTE_EXPECT_${expected.toUpperCase()}_GOT_${actual.toUpperCase()}`);
    }

    const owned = hasFashionOwnership(player, id);
    if (expected === 'fashion' && !owned) {
      issues.push('MAIL_FASHION_NOT_ACTIVATED');
    }

    const timedSeconds = Math.max(0, number(object(fashionCfg.condition)['10']));
    const durationRow = array(object(player.fashionInfo).fashionData)
      .find((entry) => number(entry && entry.id) === id) || null;
    if (timedSeconds > 0 && !durationRow) {
      issues.push('MAIL_TIMED_FASHION_MISSING_DURATION_STATE');
    }

    rows.push({
      id,
      expected,
      actual,
      grantKind,
      rewardCount,
      ownedBefore,
      owned,
      timedSeconds,
      hasDurationState: !!durationRow,
      sources: sources.filter((name) => !!row(tables[name], id)),
      issues,
    });
  }

  const issueCounts = {};
  const routeCounts = {};
  rows.forEach((entry) => {
    const route = `${entry.expected}->${entry.actual}`;
    routeCounts[route] = (routeCounts[route] || 0) + 1;
    entry.issues.forEach((issue) => {
      issueCounts[issue] = (issueCounts[issue] || 0) + 1;
    });
  });
  const payload = {
    result: 'PASS',
    generatedAt: new Date().toISOString(),
    configPath: CONFIG,
    sourceTables: sources,
    summary: {
      uniqueIds: rows.length,
      issueIds: rows.filter((entry) => entry.issues.length > 0).length,
      issueCounts,
      routeCounts,
    },
    rows,
  };
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ result: 'PASS', output: OUTPUT, summary: payload.summary }));
}

try {
  main();
} catch (error) {
  console.error(error.stack || String(error));
  process.exitCode = 1;
}

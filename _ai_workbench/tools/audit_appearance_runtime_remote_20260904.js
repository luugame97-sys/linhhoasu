'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const { MongoClient } = require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const config = require('/linhhoasu/lhs/newServer/src/services/ConfigService');

const now = Date.now();
const client = new MongoClient('mongodb://127.0.0.1:27017');

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

function anonymous(dbName, value) {
  return crypto.createHash('sha256')
    .update(`lhs-appearance-runtime-audit-v1|${dbName}|${String(value || '')}`)
    .digest('hex')
    .slice(0, 16);
}

function sha256(path) {
  return fs.existsSync(path)
    ? crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')
    : '';
}

function mapIds(value) {
  return Object.values(object(value)).map(number).filter((id) => id > 0);
}

function nativeIds(player, family) {
  if (family === 'formation') {
    const info = object(player.formationInfo);
    return new Set([
      ...array(info.owns).map(number),
      number(info.id), number(info.curFormation), number(info.equippedId),
    ].filter((id) => id > 0));
  }
  if (family === 'sword') {
    return new Set([
      ...array(object(player.swordInfo).data).map((row) => number(row && row.id)),
      ...array(object(player.swordInfo).optionalSwords).map((row) => number(row && row.id)),
    ].filter((id) => id > 0));
  }
  if (family === 'artifact') {
    return new Set(array(object(player.artifactInfo).artifacts)
      .map((row) => number(row && row.id)).filter((id) => id > 0));
  }
  if (family === 'spirit') {
    const info = object(player.spiritInfo);
    return new Set([
      ...array(info.owns).map(number), number(info.id), number(info.equippedId),
    ].filter((id) => id > 0));
  }
  return new Set();
}

function analyzePlayer(dbName, player, tables) {
  const info = object(player.fashionInfo);
  const active = new Set(array(info.activateFashion).map(number).filter((id) => id > 0));
  Object.keys(object(info.fashions)).forEach((id) => {
    if (number(info.fashions[id]) > 0) active.add(number(id));
  });
  const current = new Set([
    ...mapIds(info.curFashion),
    ...mapIds(info.fashion),
    ...mapIds(info.fashionMap),
    ...mapIds(info.equipped),
  ]);
  const fashionData = array(info.fashionData);
  const dataById = new Map(fashionData.map((row) => [number(row && row.id), row]));
  const issues = [];

  const invalidActive = [...active].filter((id) => !tables.fashion[id]);
  if (invalidActive.length) issues.push({ type: 'ACTIVE_ID_NOT_IN_FASHION_CONFIG', ids: invalidActive });
  const invalidCurrent = [...current].filter((id) => !tables.fashion[id]);
  if (invalidCurrent.length) issues.push({ type: 'CURRENT_ID_NOT_IN_FASHION_CONFIG', ids: invalidCurrent });
  const currentUnowned = [...current].filter((id) => tables.fashion[id] && !active.has(id));
  if (currentUnowned.length) issues.push({ type: 'CURRENT_FASHION_NOT_OWNED', ids: currentUnowned });

  const typeMismatch = [];
  for (const field of ['curFashion', 'fashion', 'fashionMap', 'equipped']) {
    for (const [typeKey, idValue] of Object.entries(object(info[field]))) {
      const id = number(idValue);
      const expectedType = number(typeKey);
      const cfg = tables.fashion[id];
      if (id > 0 && cfg && number(cfg.type) !== expectedType) {
        typeMismatch.push({ field, type: expectedType, id, actualType: number(cfg.type) });
      }
    }
  }
  if (typeMismatch.length) issues.push({ type: 'CURRENT_FASHION_TYPE_MISMATCH', rows: typeMismatch });

  const timedWithoutData = [];
  const expiredStillActive = [];
  for (const id of active) {
    const cfg = tables.fashion[id];
    const seconds = number(object(cfg && cfg.condition)['10']);
    if (seconds <= 0) continue;
    const data = dataById.get(id);
    if (!data) {
      timedWithoutData.push(id);
      continue;
    }
    const limits = object(data.limitValues);
    if (number(limits['10']) > 0 && number(limits['10']) < Math.floor(now / 1000)) {
      expiredStillActive.push(id);
    }
  }
  if (timedWithoutData.length) issues.push({ type: 'TIMED_ACTIVE_WITHOUT_DURATION_DATA', ids: timedWithoutData });
  if (expiredStillActive.length) issues.push({ type: 'EXPIRED_FASHION_STILL_ACTIVE', ids: expiredStillActive });

  const nativeFamilies = [
    ['formation', tables.formation],
    ['sword', tables.sword],
    ['artifact', tables.artifact],
    ['spirit', tables.spirit],
  ];
  for (const [family, nativeTable] of nativeFamilies) {
    const collection = nativeIds(player, family);
    const cosmeticOnly = [...active].filter((id) => nativeTable[id] && !collection.has(id));
    if (cosmeticOnly.length) {
      issues.push({ type: `COSMETIC_OWNED_WITHOUT_NATIVE_${family.toUpperCase()}`, ids: cosmeticOnly });
    }
  }

  if (info.dress && !Array.isArray(info.dress) && Object.keys(object(info.dress)).length > 0) {
    issues.push({ type: 'DRESS_STATE_OBJECT_CLIENT_EXPECTS_ARRAY', count: Object.keys(info.dress).length });
  }

  return {
    subject: anonymous(dbName, player.userId || player.playerId),
    isBot: player.isBot === true,
    level: number(player.level),
    activeCount: active.size,
    currentCount: current.size,
    fashionDataCount: fashionData.length,
    issues,
  };
}

async function main() {
  config.loadAllTables();
  const tables = {
    fashion: object(config.get('FashionConfig')),
    formation: object(config.get('FormationConfig')),
    sword: object(config.get('SwordConfig')),
    artifact: object(config.get('ArtifactConfig')),
    spirit: object(config.get('SpiritConfig')),
  };
  await client.connect();
  const databases = {};
  const issueCounts = {};
  const issueIds = {};
  try {
    for (const dbName of ['lhs_s1001', 'lhs_s1002']) {
      const db = client.db(dbName);
      const exists = (await db.listCollections({ name: 'players' }, { nameOnly: true }).toArray()).length > 0;
      if (!exists) {
        databases[dbName] = { playerCount: 0, issueSubjects: 0, subjects: [] };
        continue;
      }
      const players = await db.collection('players').find({}, {
        projection: {
          userId: 1, playerId: 1, isBot: 1, level: 1,
          fashionInfo: 1, formationInfo: 1, swordInfo: 1,
          artifactInfo: 1, spiritInfo: 1,
        },
      }).toArray();
      const subjects = [];
      for (const player of players) {
        const result = analyzePlayer(dbName, player, tables);
        if (result.issues.length === 0) continue;
        subjects.push(result);
        for (const issue of result.issues) {
          issueCounts[issue.type] = (issueCounts[issue.type] || 0) + 1;
          issueIds[issue.type] = issueIds[issue.type] || new Set();
          array(issue.ids).forEach((id) => issueIds[issue.type].add(number(id)));
        }
      }
      databases[dbName] = {
        playerCount: players.length,
        humanCount: players.filter((player) => player.isBot !== true).length,
        issueSubjects: subjects.length,
        humanIssueSubjects: subjects.filter((player) => !player.isBot).length,
        subjects,
      };
    }
  } finally {
    await client.close();
  }

  const sourcePaths = [
    '/linhhoasu/lhs/newServer/src/handlers/fashion.js',
    '/linhhoasu/lhs/newServer/src/handlers/mail.js',
    '/linhhoasu/lhs/newServer/src/handlers/item.js',
    '/linhhoasu/lhs/newServer/src/services/RoleAppearanceService.js',
    '/linhhoasu/lhs/newServer/src/services/RewardGrantService.js',
    '/linhhoasu/lhs/newServer/src/services/FormationService.js',
    '/linhhoasu/lhs/newServer/src/handlers/mount.js',
    '/linhhoasu/lhs/newServer/src/handlers/artifact.js',
    '/linhhoasu/lhs/newServer/src/handlers/spirit.js',
  ];
  console.log('APPEARANCE_RUNTIME_AUDIT=' + JSON.stringify({
    result: 'PASS',
    generatedAt: new Date().toISOString(),
    now,
    catalog: {
      fashion: Object.keys(tables.fashion).length,
      formation: Object.keys(tables.formation).length,
      sword: Object.keys(tables.sword).length,
      artifact: Object.keys(tables.artifact).length,
      spirit: Object.keys(tables.spirit).length,
    },
    sourceHashes: Object.fromEntries(sourcePaths.map((path) => [path, sha256(path)])),
    databases,
    issueCounts,
    issueIds: Object.fromEntries(Object.entries(issueIds).map(([key, ids]) => [key, [...ids].sort((a, b) => a - b)])),
  }));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});

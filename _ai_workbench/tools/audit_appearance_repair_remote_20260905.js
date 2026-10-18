'use strict';

const { MongoClient, ObjectId } = require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const config = require('/linhhoasu/lhs/newServer/src/services/ConfigService');
const fs = require('node:fs');

const mode = process.argv[2] || 'dry-run';
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

function activeFashionIds(player) {
  const info = object(player.fashionInfo);
  const ids = new Set(array(info.activateFashion).map(number).filter((id) => id > 0));
  Object.keys(object(info.fashions)).forEach((id) => {
    if (number(info.fashions[id]) > 0) ids.add(number(id));
  });
  return ids;
}

function nativeIds(player, family) {
  if (family === 'formation') {
    const info = object(player.formationInfo);
    return new Set([
      ...array(info.owns).map(number), number(info.id), number(info.curFormation), number(info.equippedId),
    ].filter((id) => id > 0));
  }
  if (family === 'sword') {
    const info = object(player.swordInfo);
    return new Set([
      ...array(info.data).map((row) => number(row && row.id)),
      ...array(info.optionalSwords).map((row) => number(row && row.id)),
    ].filter((id) => id > 0));
  }
  if (family === 'artifact') {
    return new Set(array(object(player.artifactInfo).artifacts).map((row) => number(row && row.id)));
  }
  if (family === 'spirit') {
    const info = object(player.spiritInfo);
    return new Set([
      ...array(info.owns).map(number), number(info.id), number(info.equippedId),
    ].filter((id) => id > 0));
  }
  return new Set();
}

function analyze(player, tables) {
  const fashion = activeFashionIds(player);
  const add = { formation: [], sword: [], artifact: [], spirit: [] };
  for (const id of fashion) {
    if (tables.formation[id] && !nativeIds(player, 'formation').has(id)) add.formation.push(id);
    if (tables.sword[id] && !nativeIds(player, 'sword').has(id)) add.sword.push(id);
    if (tables.artifact[id] && !nativeIds(player, 'artifact').has(id)) add.artifact.push(id);
    if (tables.spirit[id] && !nativeIds(player, 'spirit').has(id)) add.spirit.push(id);
  }
  const timedMissing = [];
  const dataIds = new Set(array(object(player.fashionInfo).fashionData).map((row) => number(row && row.id)));
  for (const id of fashion) {
    const seconds = number(object(tables.fashion[id] && tables.fashion[id].condition)['10']);
    if (seconds > 0 && !dataIds.has(id)) timedMissing.push(id);
  }
  const suitSlot = [];
  for (const field of ['curFashion', 'fashion', 'fashionMap', 'equipped']) {
    for (const [type, value] of Object.entries(object(object(player.fashionInfo)[field]))) {
      const id = number(value);
      if (id === 28000 || (id > 0 && !tables.fashion[id])) suitSlot.push({ field, type, id });
    }
  }
  return {
    add: Object.fromEntries(Object.entries(add).map(([key, values]) => [key, [...new Set(values)].sort((a, b) => a - b)])),
    timedMissing: [...new Set(timedMissing)].sort((a, b) => a - b),
    suitSlot,
  };
}

function hasIssues(result) {
  return result.timedMissing.length > 0 || result.suitSlot.length > 0
    || Object.values(result.add).some((values) => values.length > 0);
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
  if (mode === 'rollback') {
    const backupPath = process.env.APPEARANCE_REPAIR_BACKUP;
    if (!backupPath) throw new Error('APPEARANCE_REPAIR_BACKUP_REQUIRED');
    const rows = fs.readFileSync(backupPath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    let restored = 0;
    try {
      for (const row of rows.reverse()) {
        const before = object(row.before);
        const set = {};
        const unset = {};
        for (const field of ['items', 'fashionInfo', 'formationInfo', 'swordInfo', 'artifactInfo', 'spiritInfo']) {
          if (Object.prototype.hasOwnProperty.call(before, field)) set[field] = before[field];
          else unset[field] = '';
        }
        const operation = {};
        if (Object.keys(set).length > 0) operation.$set = set;
        if (Object.keys(unset).length > 0) operation.$unset = unset;
        await client.db(row.db).collection('players').updateOne({ _id: new ObjectId(row.id) }, operation);
        restored += 1;
      }
    } finally {
      await client.close();
    }
    console.log('APPEARANCE_REPAIR_AUDIT=' + JSON.stringify({ result: 'PASS', mode, restored }));
    return;
  }
  const summary = {};
  let backupCount = 0;
  const backupPath = mode === 'apply' ? process.env.APPEARANCE_REPAIR_BACKUP : '';
  if (mode === 'apply' && !backupPath) throw new Error('APPEARANCE_REPAIR_BACKUP_REQUIRED');
  if (mode === 'apply') fs.writeFileSync(backupPath, '');
  try {
    for (const dbName of ['lhs_s1001', 'lhs_s1002']) {
      const collection = client.db(dbName).collection('players');
      const players = await collection.find({}, {
        projection: {
          _id: 1, isBot: 1, fashionInfo: 1, formationInfo: 1,
          swordInfo: 1, artifactInfo: 1, spiritInfo: 1,
        },
      }).toArray();
      const affected = [];
      for (const player of players) {
        const result = analyze(player, tables);
        if (!hasIssues(result)) continue;
        affected.push({ id: String(player._id), isBot: player.isBot === true, ...result });
        if (mode === 'apply') {
          // Load the same authoritative grant helpers used by live reward paths.
          // This preserves native UID/default-attribute construction.
          // eslint-disable-next-line global-require
          const rewardGrant = require('/linhhoasu/lhs/newServer/src/services/RewardGrantService');
          // eslint-disable-next-line global-require
          const appearance = require('/linhhoasu/lhs/newServer/src/services/RoleAppearanceService');
          const fullPlayer = await collection.findOne({ _id: player._id });
          if (!fullPlayer) throw new Error(`PLAYER_DISAPPEARED:${dbName}:${player._id}`);
          const backupRow = {
            db: dbName,
            id: String(player._id),
            before: JSON.parse(JSON.stringify(fullPlayer)),
            plan: result,
          };
          backupCount += 1;
          // Append and fsync the exact preimage before mutating this player.
          fs.appendFileSync(backupPath, `${JSON.stringify(backupRow)}\n`);
          for (const ids of Object.values(result.add)) {
            for (const id of ids) rewardGrant.grantRewardRow(fullPlayer, { id, count: 1 }, 1);
          }
          result.timedMissing.forEach((id) => {
            appearance.grantFashionOwnership(fullPlayer, id, { extendTimed: false });
          });
          result.suitSlot.forEach((row) => {
            const holder = object(object(fullPlayer.fashionInfo)[row.field]);
            delete holder[String(row.type)];
            fullPlayer.fashionInfo[row.field] = holder;
          });
          await collection.updateOne({ _id: fullPlayer._id }, {
            $set: {
              items: object(fullPlayer.items),
              fashionInfo: object(fullPlayer.fashionInfo),
              formationInfo: object(fullPlayer.formationInfo),
              swordInfo: object(fullPlayer.swordInfo),
              artifactInfo: object(fullPlayer.artifactInfo),
              spiritInfo: object(fullPlayer.spiritInfo),
            },
          });
        }
      }
      summary[dbName] = {
        players: players.length,
        affected: affected.length,
        humans: affected.filter((row) => !row.isBot).length,
        counts: {
          formation: affected.reduce((sum, row) => sum + row.add.formation.length, 0),
          sword: affected.reduce((sum, row) => sum + row.add.sword.length, 0),
          artifact: affected.reduce((sum, row) => sum + row.add.artifact.length, 0),
          spirit: affected.reduce((sum, row) => sum + row.add.spirit.length, 0),
          timedMissing: affected.reduce((sum, row) => sum + row.timedMissing.length, 0),
          suitSlot: affected.reduce((sum, row) => sum + row.suitSlot.length, 0),
        },
      };
    }
  } finally {
    await client.close();
  }
  console.log('APPEARANCE_REPAIR_AUDIT=' + JSON.stringify({ result: 'PASS', mode, summary, backupRows: backupCount }));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});

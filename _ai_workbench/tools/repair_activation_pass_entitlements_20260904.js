'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const { MongoClient } = require('/linhhoasu/lhs/newServer/node_modules/mongodb');

const mode = String(process.argv[2] || 'dry-run');
const backupPath = process.argv[3] || '';
const now = Date.now();
const client = new MongoClient('mongodb://127.0.0.1:27017');

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : 0;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function anonymize(dbName, value) {
  return crypto.createHash('sha256')
    .update(`lhs-activation-pass-repair-v1|${dbName}|${String(value || '')}`)
    .digest('hex')
    .slice(0, 16);
}

function getRechargeCount(player) {
  return array(object(player.rechargeInfo).records)
    .filter((row) => number(row && row.id) === 10301)
    .reduce((sum, row) => sum + Math.max(0, number(row && row.count)), 0);
}

function getActivityRow(player, activityId) {
  return array(object(player.activityInfo).datas)
    .find((row) => number(row && row.id) === activityId) || null;
}

function isEntitled(row) {
  return array(row && row.recordList).map(number).includes(10301);
}

async function getTargets(dbName, activityId) {
  const collection = client.db(dbName).collection('players');
  const docs = await collection.find({
    'rechargeInfo.records': {
      $elemMatch: {
        id: { $in: [10301, '10301'] },
        count: { $gt: 0 },
      },
    },
    'activityInfo.datas': {
      $elemMatch: {
        id: { $in: [activityId, String(activityId)] },
        startTime: { $lte: now },
        endTime: { $gt: now },
      },
    },
  }, {
    projection: {
      userId: 1,
      playerId: 1,
      activityInfo: 1,
      rechargeInfo: 1,
      updatedAt: 1,
    },
  }).toArray();
  return docs.filter((player) => {
    const row = getActivityRow(player, activityId);
    return getRechargeCount(player) > 0 && row && !isEntitled(row);
  });
}

async function main() {
  if (!['dry-run', 'apply', 'verify'].includes(mode)) throw new Error('INVALID_MODE');
  if (mode === 'apply' && !backupPath) throw new Error('BACKUP_PATH_REQUIRED');
  await client.connect();
  const specs = [
    { dbName: 'lhs_s1001', activityId: 7001 },
    { dbName: 'lhs_s1002', activityId: 7051 },
  ];
  const result = { mode, generatedAt: new Date().toISOString(), databases: {}, totalTargets: 0, modified: 0 };
  const backups = [];
  try {
    for (const spec of specs) {
      const targets = await getTargets(spec.dbName, spec.activityId);
      result.totalTargets += targets.length;
      result.databases[spec.dbName] = {
        activityId: spec.activityId,
        targets: targets.length,
        subjects: targets.map((row) => anonymize(spec.dbName, row.userId || row.playerId)),
        purchaseCount: targets.reduce((sum, row) => sum + getRechargeCount(row), 0),
      };
      if (mode !== 'apply') continue;
      for (const player of targets) {
        const row = getActivityRow(player, spec.activityId);
        backups.push({
          dbName: spec.dbName,
          _id: player._id,
          userId: player.userId,
          playerId: player.playerId,
          updatedAt: player.updatedAt || null,
          activityId: spec.activityId,
          previousRecordList: array(row && row.recordList),
          activityInfo: player.activityInfo,
        });
      }
    }

    if (mode === 'apply') {
      fs.writeFileSync(backupPath, JSON.stringify({
        version: 1,
        createdAt: new Date().toISOString(),
        records: backups,
      }, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      fs.chmodSync(backupPath, 0o600);
      for (const backup of backups) {
        const collection = client.db(backup.dbName).collection('players');
        const write = await collection.updateOne({
          _id: backup._id,
          updatedAt: backup.updatedAt,
          'rechargeInfo.records': {
            $elemMatch: { id: { $in: [10301, '10301'] }, count: { $gt: 0 } },
          },
        }, {
          $addToSet: { 'activityInfo.datas.$[activity].recordList': 10301 },
          $set: {
            'activityInfo.activationPassRepairV1': {
              appliedAt: new Date(),
              payId: 10301,
              activityId: backup.activityId,
              strategy: 'entitlement-only',
            },
            updatedAt: new Date(),
          },
        }, {
          arrayFilters: [{
            'activity.id': { $in: [backup.activityId, String(backup.activityId)] },
            'activity.startTime': { $lte: now },
            'activity.endTime': { $gt: now },
          }],
        });
        if (write.matchedCount !== 1 || write.modifiedCount !== 1) {
          throw new Error(`STALE_OR_UNMODIFIED:${backup.dbName}:${anonymize(backup.dbName, backup.userId)}`);
        }
        result.modified += write.modifiedCount;
      }
      result.backupPath = backupPath;
    }

    for (const spec of specs) {
      const remaining = await getTargets(spec.dbName, spec.activityId);
      result.databases[spec.dbName].remaining = remaining.length;
    }
    if (mode === 'apply' && result.modified !== result.totalTargets) {
      throw new Error('MODIFIED_COUNT_MISMATCH');
    }
    if ((mode === 'apply' || mode === 'verify')
      && Object.values(result.databases).some((row) => row.remaining !== 0)) {
      throw new Error('REPAIR_REMAINING');
    }
    console.log('ACTIVATION_PASS_REPAIR=' + JSON.stringify(result));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const { MongoClient } = require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const config = require('/linhhoasu/lhs/newServer/src/services/ConfigService');
const { resolveRechargeRewards } = require('/linhhoasu/lhs/newServer/src/services/RechargeRewardResolver');
const { applyRechargeBenefits } = require('/linhhoasu/lhs/newServer/src/services/RechargeBenefitService');

const PAY_ID = 10301;
const ACTIVITY_IDS = [7001, 7051];
const now = Date.now();

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

function sha256(path) {
  return fs.existsSync(path)
    ? crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')
    : '';
}

function readTail(path, maxBytes = 8 * 1024 * 1024) {
  if (!fs.existsSync(path)) return { content: '', fileBytes: 0, scannedBytes: 0 };
  const fileBytes = fs.statSync(path).size;
  const scannedBytes = Math.min(fileBytes, maxBytes);
  const buffer = Buffer.alloc(scannedBytes);
  const handle = fs.openSync(path, 'r');
  try {
    fs.readSync(handle, buffer, 0, scannedBytes, fileBytes - scannedBytes);
  } finally {
    fs.closeSync(handle);
  }
  return { content: buffer.toString('utf8'), fileBytes, scannedBytes };
}

function anonymousId(dbName, value) {
  return crypto.createHash('sha256')
    .update(`lhs-activation-pass-audit-v1|${dbName}|${String(value || '')}`)
    .digest('hex')
    .slice(0, 16);
}

function getStageConfig(activityId, stage) {
  const table = object(config.get('Activity7Config'));
  return object(object(table[activityId])[stage]);
}

function getTypeConfig(activityId, stage) {
  const table = object(config.get('Activity7TypeConfig'));
  return object(object(table[activityId])[stage]);
}

function buildActivityCatalog() {
  const activityTable = object(config.get('ActivityConfig'));
  const payTable = object(config.get('PayConfig'));
  const shopTable = object(config.get('ShopConfig'));
  return ACTIVITY_IDS.map((activityId) => {
    const meta = object(activityTable[activityId]);
    const stage = 1;
    const typeRow = getTypeConfig(activityId, stage);
    const thresholds = Object.values(getStageConfig(activityId, stage))
      .filter((row) => row && typeof row === 'object')
      .sort((left, right) => number(left.param) - number(right.param));
    return {
      activityId,
      area: number(meta.area),
      activityType: number(meta.activityType),
      conditions: array(meta.conditions),
      stage,
      rechargeId: number(typeRow.rechargeId),
      day: number(typeRow.day),
      pay: object(payTable[typeRow.rechargeId]),
      shop: object(shopTable[typeRow.rechargeId]),
      thresholds,
    };
  });
}

function buildRowSummary(row, player) {
  const activityId = number(row && row.id);
  const stage = Math.max(1, number(row && row.record));
  const thresholds = Object.values(getStageConfig(activityId, stage))
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => number(entry.param))
    .sort((left, right) => left - right);
  const records = object(row && row.records);
  const item19 = number(object(player && player.items)[19]);
  const score = Math.max(number(row && row.score), item19);
  const startTime = number(row && row.startTime);
  const endTime = number(row && row.endTime);
  const recordList = array(row && row.recordList).map(number).filter(Boolean);
  const eligible = thresholds.filter((point) => point <= score);
  const claimedFree = eligible.filter((point) => number(records[point]) >= 1);
  const claimedPremium = eligible.filter((point) => number(records[point]) >= 3);
  const malformedRecords = Object.entries(records)
    .filter(([, value]) => ![0, 1, 3].includes(number(value)))
    .map(([point, value]) => ({ point: number(point), value: number(value) }));
  return {
    activityId,
    stage,
    startTime,
    endTime,
    open: startTime > 0 && startTime <= now && now < endTime,
    score,
    item19,
    recordList,
    records: Object.fromEntries(Object.entries(records).map(([key, value]) => [key, number(value)])),
    eligible,
    claimedFree,
    claimedPremium,
    missingFree: eligible.filter((point) => !claimedFree.includes(point)),
    missingPremium: eligible.filter((point) => !claimedPremium.includes(point)),
    malformedRecords,
  };
}

async function collectionExists(db, name) {
  return (await db.listCollections({ name }, { nameOnly: true }).toArray()).length > 0;
}

async function main() {
  config.loadAllTables();
  const catalog = buildActivityCatalog();
  const expectedThresholds = [0, 40, 80, 120, 160, 200, 240, 280, 320, 360, 400, 440, 480, 520, 560, 600];
  const sourcePaths = {
    activity: '/linhhoasu/lhs/newServer/src/handlers/activity.js',
    compat: '/linhhoasu/lhs/newServer/src/handlers/compat.js',
    recharge: '/linhhoasu/lhs/newServer/src/handlers/recharge.js',
    resolver: '/linhhoasu/lhs/newServer/src/services/RechargeRewardResolver.js',
    benefits: '/linhhoasu/lhs/newServer/src/services/RechargeBenefitService.js',
    serverConfig: '/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin',
    clientConfig: '/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin',
    clientMain: '/linhhoasu/webgame/game/js/main.min_a6195824.js',
  };
  const source = Object.fromEntries(Object.entries(sourcePaths).map(([key, path]) => [key, {
    path,
    sha256: sha256(path),
    bytes: fs.existsSync(path) ? fs.statSync(path).size : 0,
  }]));
  const logCounts = {};
  for (const logPath of [
    '/root/.pm2/logs/lhs-s1001-out.log',
    '/root/.pm2/logs/lhs-s1001-error.log',
  ]) {
    if (!fs.existsSync(logPath)) continue;
    const tail = readTail(logPath);
    const content = tail.content;
    logCounts[logPath] = {
      fileBytes: tail.fileBytes,
      scannedBytes: tail.scannedBytes,
      payId10301: (content.match(/payId=10301/g) || []).length,
      rejected10301: (content.match(/\[Recharge1230\] rejected payId=10301/g) || []).length,
      specializedRequired: (content.match(/SPECIALIZED_RECHARGE_REQUIRED/g) || []).length,
    };
  }

  const fakePlayer = {
    level: 15,
    items: { 19: 200 },
    rechargeInfo: { records: [], area: 1 },
    activityInfo: {
      datas: [{
        id: 7001,
        module: 0,
        index: 0,
        param: 0,
        record: 0,
        status: 0,
        startTime: now - 1000,
        endTime: now + 86400000,
        score: 200,
        recordList: [],
        records: {},
        buyRecords: {},
        extra: {},
      }],
    },
  };
  const tokenPlan = resolveRechargeRewards(fakePlayer, {
    route: 'token', payId: PAY_ID, multi: 1, now,
  });
  const cashPlan = resolveRechargeRewards(fakePlayer, {
    route: 'cash', payId: PAY_ID, multi: 1, amount: 68, now,
  });
  const benefitResult = applyRechargeBenefits(fakePlayer, { payId: PAY_ID, now, multi: 1 });
  const inMemoryContract = {
    token: { ok: tokenPlan.ok, reason: tokenPlan.reason, rewardCount: array(tokenPlan.rows).length },
    cash: { ok: cashPlan.ok, reason: cashPlan.reason, rewardCount: array(cashPlan.rows).length },
    genericBenefit: {
      recordWritten: array(fakePlayer.rechargeInfo.records).some((row) => number(row.id) === PAY_ID),
      activityRecordList: array(fakePlayer.activityInfo.datas[0].recordList).map(number),
      activationUpdatePresent: !!(benefitResult && benefitResult.activationPassUpdate),
    },
  };

  const client = new MongoClient('mongodb://127.0.0.1:27017');
  await client.connect();
  const databases = {};
  const allSubjects = [];
  try {
    for (const dbName of ['lhs_s1001', 'lhs_s1002']) {
      const db = client.db(dbName);
      if (!(await collectionExists(db, 'players'))) {
        databases[dbName] = { exists: false, playerCount: 0, subjects: [], transactions: [] };
        continue;
      }
      const players = db.collection('players');
      const playerCount = await players.estimatedDocumentCount();
      const levelEligiblePlayers = await players.countDocuments({ level: { $gte: 15 } });
      const targetActivityPlayers = await players.countDocuments({
        'activityInfo.datas.id': { $in: [...ACTIVITY_IDS, ...ACTIVITY_IDS.map(String)] },
      });
      const purchaseRecordPlayers = await players.countDocuments({
        'rechargeInfo.records.id': { $in: [PAY_ID, String(PAY_ID)] },
      });
      const docs = await players.find({
        $or: [
          { 'rechargeInfo.records.id': { $in: [PAY_ID, String(PAY_ID)] } },
          { 'activityInfo.datas.id': { $in: [...ACTIVITY_IDS, ...ACTIVITY_IDS.map(String)] } },
          { 'activityInfo.datas.recordList': { $in: [PAY_ID, String(PAY_ID)] } },
        ],
      }, {
        projection: {
          userId: 1,
          playerId: 1,
          isBot: 1,
          level: 1,
          items: 1,
          rechargeInfo: 1,
          activityInfo: 1,
          updatedAt: 1,
        },
      }).toArray();

      const subjects = [];
      for (const player of docs) {
        const purchaseCount = array(object(player.rechargeInfo).records)
          .filter((row) => number(row && row.id) === PAY_ID)
          .reduce((sum, row) => sum + Math.max(0, number(row && row.count)), 0);
        const rows = array(object(player.activityInfo).datas)
          .filter((row) => ACTIVITY_IDS.includes(number(row && row.id)))
          .map((row) => buildRowSummary(row, player));
        const entitled = rows.some((row) => row.recordList.includes(PAY_ID));
        const subject = {
          subject: anonymousId(dbName, player.userId || player.playerId),
          db: dbName,
          isBot: player.isBot === true,
          level: number(player.level),
          purchaseCount,
          entitled,
          rows,
          updatedAt: player.updatedAt || null,
          issues: [],
        };
        if (purchaseCount > 0 && !entitled) subject.issues.push('PURCHASE_WITHOUT_ACTIVITY_ENTITLEMENT');
        if (entitled && purchaseCount <= 0) subject.issues.push('ACTIVITY_ENTITLEMENT_WITHOUT_PURCHASE_RECORD');
        if (purchaseCount > 0 && rows.length === 0) subject.issues.push('PURCHASE_WITHOUT_ACTIVITY_ROW');
        if (rows.length > 0 && !rows.some((row) => row.open)) subject.issues.push('NO_OPEN_ACTIVITY_ROW');
        if (rows.some((row) => row.malformedRecords.length > 0)) subject.issues.push('MALFORMED_REWARD_RECORD');
        subjects.push(subject);
        allSubjects.push(subject);
      }

      let transactions = [];
      if (await collectionExists(db, 'transactions')) {
        const transactionDocs = await db.collection('transactions').find({
          $or: [
            { productId: { $in: [PAY_ID, String(PAY_ID)] } },
            { payId: { $in: [PAY_ID, String(PAY_ID)] } },
          ],
        }, {
          projection: {
            userId: 1,
            productId: 1,
            payId: 1,
            amount: 1,
            status: 1,
            channel: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        }).toArray();
        transactions = transactionDocs.map((row) => ({
          subject: anonymousId(dbName, row.userId),
          payId: number(row.productId || row.payId),
          amount: Number(row.amount) || 0,
          status: String(row.status || ''),
          channel: String(row.channel || ''),
          createdAt: row.createdAt || null,
          updatedAt: row.updatedAt || null,
        }));
      }
      const transactionAggregate = [];
      const aggregateMap = new Map();
      for (const transaction of transactions) {
        const key = JSON.stringify({
          payId: transaction.payId,
          amount: transaction.amount,
          status: transaction.status,
          channel: transaction.channel,
        });
        aggregateMap.set(key, (aggregateMap.get(key) || 0) + 1);
      }
      for (const [key, count] of aggregateMap.entries()) {
        transactionAggregate.push({ ...JSON.parse(key), count });
      }
      databases[dbName] = {
        exists: true,
        playerCount,
        levelEligiblePlayers,
        targetActivityPlayers,
        purchaseRecordPlayers,
        subjects,
        transactions,
        transactionAggregate,
      };
    }
  } finally {
    await client.close();
  }

  const summary = {
    totalSubjects: allSubjects.length,
    humanSubjects: allSubjects.filter((row) => !row.isBot).length,
    withPurchaseRecord: allSubjects.filter((row) => row.purchaseCount > 0).length,
    withEntitlement: allSubjects.filter((row) => row.entitled).length,
    purchaseWithoutEntitlement: allSubjects.filter((row) => row.issues.includes('PURCHASE_WITHOUT_ACTIVITY_ENTITLEMENT')).length,
    entitlementWithoutPurchase: allSubjects.filter((row) => row.issues.includes('ACTIVITY_ENTITLEMENT_WITHOUT_PURCHASE_RECORD')).length,
    purchaseWithoutRow: allSubjects.filter((row) => row.issues.includes('PURCHASE_WITHOUT_ACTIVITY_ROW')).length,
    noOpenRow: allSubjects.filter((row) => row.issues.includes('NO_OPEN_ACTIVITY_ROW')).length,
    malformedRewardRecord: allSubjects.filter((row) => row.issues.includes('MALFORMED_REWARD_RECORD')).length,
  };
  config.reload('/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin');
  const clientCatalog = buildActivityCatalog();
  const catalogMatch = JSON.stringify(catalog) === JSON.stringify(clientCatalog);
  console.log('AUDIT_JSON=' + JSON.stringify({
    generatedAt: new Date().toISOString(),
    now,
    expectedThresholds,
    catalog,
    clientCatalog,
    catalogMatch,
    source,
    logCounts,
    inMemoryContract,
    summary,
    databases,
  }));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});

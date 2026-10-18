'use strict';

const crypto = require('node:crypto');
const { MongoClient } = require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const config = require('/linhhoasu/lhs/newServer/src/services/ConfigService');

const PAY_IDS = [10501, 10502];
const DAY_MS = 86400000;
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

function anonymousId(dbName, value) {
  return crypto.createHash('sha256')
    .update(`lhs-a9-audit-v1|${dbName}|${String(value || '')}`)
    .digest('hex')
    .slice(0, 16);
}

function buildRowSummary(row, typeMap, maxDayByActivity) {
  const id = number(row && row.id);
  const payId = typeMap[id];
  const maxDay = maxDayByActivity[id] || 7;
  const records = object(row && row.records);
  const score = Math.min(maxDay, Math.max(0, number(row && row.score)));
  const startTime = number(row && row.startTime);
  const endTime = number(row && row.endTime);
  const open = startTime > 0 && startTime <= now && now < endTime;
  const elapsedDay = startTime > 0
    ? Math.min(maxDay, Math.max(1, Math.floor((now - startTime) / DAY_MS) + 1))
    : score;
  const eligibleDays = Math.min(maxDay, Math.max(score, open ? elapsedDay : score));
  const claimedFree = [];
  const claimedPremium = [];
  const missingFree = [];
  const missingPremium = [];
  for (let day = 1; day <= eligibleDays; day += 1) {
    const bits = number(records[day]);
    (bits & 1 ? claimedFree : missingFree).push(day);
    (bits & 2 ? claimedPremium : missingPremium).push(day);
  }
  return {
    id,
    payId,
    startTime,
    endTime,
    open,
    expired: endTime > 0 && endTime <= now,
    score,
    maxDay,
    recordList: array(row && row.recordList).map(number).filter(Boolean),
    record: number(row && row.record),
    records: Object.fromEntries(Object.entries(records).map(([key, value]) => [key, number(value)])),
    eligibleDays,
    claimedFree,
    claimedPremium,
    missingFree,
    missingPremium,
  };
}

async function main() {
  config.loadAllTables();
  const typeRows = object(config.get('Activity9TypeConfig'));
  const activity9Rows = object(config.get('Activity9Config'));
  const payRows = object(config.get('PayConfig'));
  const typeMap = {};
  for (const [key, row] of Object.entries(typeRows)) {
    const id = number(row && row.activityId) || number(key);
    const payId = number(row && row.rechargeId);
    if (id > 0 && PAY_IDS.includes(payId)) typeMap[id] = payId;
  }
  const maxDayByActivity = {};
  for (const id of Object.keys(typeMap).map(Number)) {
    maxDayByActivity[id] = Math.max(
      0,
      ...Object.values(object(activity9Rows[id])).map((row) => number(row && row.day))
    );
  }

  const client = new MongoClient('mongodb://127.0.0.1:27017');
  await client.connect();
  const databases = {};
  const allSubjects = [];
  try {
    for (const dbName of ['lhs_s1001', 'lhs_s1002']) {
      const db = client.db(dbName);
      const playerCollection = db.collection('players');
      const docs = await playerCollection.find({
        $or: [
          { 'rechargeInfo.records.id': { $in: [10501, 10502, '10501', '10502'] } },
          { 'activityInfo.datas.recordList': { $in: [10501, 10502, '10501', '10502'] } },
        ],
      }, {
        projection: {
          userId: 1,
          playerId: 1,
          isBot: 1,
          level: 1,
          rechargeInfo: 1,
          activityInfo: 1,
          updatedAt: 1,
        },
      }).toArray();

      const subjects = [];
      for (const player of docs) {
        const rechargeRecords = array(object(player.rechargeInfo).records)
          .filter((row) => PAY_IDS.includes(number(row && row.id)) && number(row && row.count) > 0)
          .map((row) => ({ payId: number(row.id), count: number(row.count) }));
        const rows = array(object(player.activityInfo).datas)
          .filter((row) => typeMap[number(row && row.id)])
          .map((row) => buildRowSummary(row, typeMap, maxDayByActivity));
        const paidIds = Array.from(new Set([
          ...rechargeRecords.map((row) => row.payId),
          ...rows.flatMap((row) => row.recordList.filter((value) => PAY_IDS.includes(value))),
        ])).sort((left, right) => left - right);
        if (paidIds.length === 0) continue;

        const subject = {
          subject: anonymousId(dbName, player.userId || player.playerId),
          db: dbName,
          isBot: player.isBot === true,
          level: number(player.level),
          payRecords: rechargeRecords,
          paidIds,
          rows,
          updatedAt: player.updatedAt || null,
          issues: [],
        };
        for (const payId of paidIds) {
          const relevant = rows.filter((row) => row.payId === payId);
          if (!rechargeRecords.some((row) => row.payId === payId)) {
            subject.issues.push(`ACTIVITY_ENTITLEMENT_WITHOUT_RECHARGE_${payId}`);
          }
          if (relevant.length === 0) {
            subject.issues.push(`PURCHASE_WITHOUT_ACTIVITY_ROW_${payId}`);
            continue;
          }
          if (!relevant.some((row) => row.recordList.includes(payId))) {
            subject.issues.push(`PURCHASE_NOT_IN_RECORD_LIST_${payId}`);
          }
          if (!relevant.some((row) => row.open)) {
            subject.issues.push(`NO_OPEN_ACTIVITY_ROW_${payId}`);
          }
          for (const row of relevant) {
            if (row.missingPremium.length > 0) {
              subject.issues.push(`UNCLAIMED_PREMIUM_DAYS_${row.id}:${row.missingPremium.join(',')}`);
            }
          }
        }
        subjects.push(subject);
        allSubjects.push(subject);
      }

      const transactionDocs = await db.collection('transactions').find({
        $or: [
          { productId: { $in: ['10501', '10502', 10501, 10502] } },
          { payId: { $in: ['10501', '10502', 10501, 10502] } },
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
      }).sort({ createdAt: -1 }).toArray();
      const transactions = transactionDocs.map((row) => ({
        subject: anonymousId(dbName, row.userId),
        productId: number(row.productId || row.payId),
        amount: Number(row.amount) || 0,
        status: String(row.status || ''),
        channel: String(row.channel || ''),
        createdAt: row.createdAt || null,
        updatedAt: row.updatedAt || null,
      }));
      const aggregateMap = new Map();
      for (const transaction of transactions) {
        const key = JSON.stringify({
          productId: transaction.productId,
          amount: transaction.amount,
          status: transaction.status,
          channel: transaction.channel,
        });
        aggregateMap.set(key, (aggregateMap.get(key) || 0) + 1);
      }
      const transactionAggregate = Array.from(aggregateMap.entries()).map(([key, count]) => ({
        ...JSON.parse(key),
        count,
      }));
      databases[dbName] = {
        playersScanned: docs.length,
        subjects,
        transactions,
        transactionAggregate,
      };
    }
  } finally {
    await client.close();
  }

  const summary = {
    subjects: allSubjects.length,
    humanSubjects: allSubjects.filter((row) => !row.isBot).length,
    withIssues: allSubjects.filter((row) => row.issues.length > 0).length,
    purchaseWithoutRow: allSubjects.filter((row) => row.issues.some((item) => item.startsWith('PURCHASE_WITHOUT_ACTIVITY_ROW'))).length,
    noOpenRow: allSubjects.filter((row) => row.issues.some((item) => item.startsWith('NO_OPEN_ACTIVITY_ROW'))).length,
    unclaimedPremium: allSubjects.filter((row) => row.issues.some((item) => item.startsWith('UNCLAIMED_PREMIUM_DAYS'))).length,
  };
  console.log('AUDIT_JSON=' + JSON.stringify({
    now,
    nowIso: new Date(now).toISOString(),
    catalog: {
      pay10501: payRows[10501],
      pay10502: payRows[10502],
      typeMap,
      maxDayByActivity,
    },
    summary,
    databases,
  }));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});

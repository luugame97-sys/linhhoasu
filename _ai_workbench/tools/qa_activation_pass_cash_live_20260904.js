'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('/linhhoasu/lhs/newServer/node_modules/mongoose');
const Player = require('/linhhoasu/lhs/newServer/src/db/models/Player');
const Transaction = require('/linhhoasu/lhs/newServer/src/db/models/Transaction');
const recharge = require('/linhhoasu/lhs/newServer/src/handlers/recharge');

const serverId = Number(process.env.QA_SERVER_ID || 1001);
const dbName = process.env.QA_DB || `lhs_s${serverId}`;
const activityId = serverId === 1002 ? 7051 : 7001;
const uid = `qa_activation_cash_${Date.now().toString(36)}`;
const orderPrefix = `qa-activation-cash-${Date.now().toString(36)}`;
const playerId = crypto.randomBytes(12).toString('hex');

async function main() {
  await mongoose.connect(`mongodb://127.0.0.1:27017/${dbName}`, { serverSelectionTimeoutMS: 10000 });
  const source = await Player.collection.findOne({ isBot: true });
  assert(source);
  delete source._id;
  delete source.__v;
  source.userId = uid;
  source.playerId = playerId;
  source.name = `QA Cash ${uid.slice(-8)}`;
  source.accountId = '';
  source.isBot = false;
  delete source.botWorker;
  delete source.inviteCode;
  source.serverId = serverId;
  source.serverName = `S${String(serverId).slice(-1)}`;
  source.level = 20;
  source.items = { 19: 80 };
  source.currencies = { diamond: 0, gold: 0, silver: 0 };
  source.rechargeInfo = { area: serverId === 1002 ? 2 : 1, records: [], totalRecharge: 0, totalrecharge: 0 };
  source.activityInfo = { datas: [], disabledEntryIds: [], operateRecords: {} };
  await Player.collection.insertOne(source);

  try {
    const wrong = await recharge.handleRecharge({
      userId: uid,
      orderId: `${orderPrefix}-wrong`,
      amount: 67,
      productId: '10301',
      channel: 'qa-cash-live',
    });
    assert.equal(wrong.success, false);
    assert.equal(wrong.error, 'AMOUNT_MISMATCH');
    assert.equal(await Transaction.countDocuments({ orderId: `${orderPrefix}-wrong` }), 0);

    const paid = await recharge.handleRecharge({
      userId: uid,
      orderId: `${orderPrefix}-ok`,
      amount: 68,
      productId: '10301',
      channel: 'qa-cash-live',
    });
    assert.equal(paid.success, true);
    assert.equal(paid.data.payId, 10301);
    assert.equal(paid.data.resolverVersion, 'activation-pass-v1');
    assert.deepEqual(paid.data.rewardInfo.items, []);

    let saved = await Player.collection.findOne({ userId: uid });
    assert.deepEqual(saved.rechargeInfo.records, [{ id: 10301, count: 1 }]);
    let row = saved.activityInfo.datas.find((entry) => Number(entry.id) === activityId);
    assert(row);
    assert.deepEqual(row.recordList.map(Number), [10301]);
    const transaction = await Transaction.findOne({ orderId: `${orderPrefix}-ok` }).lean();
    assert(transaction);
    assert.equal(transaction.status, 'success');
    assert.equal(transaction.productId, '10301');
    assert.equal(transaction.extra.recharge.resolverVersion, 'activation-pass-v1');
    assert(transaction.extra.recharge.activationPassUpdate);

    const duplicate = await recharge.handleRecharge({
      userId: uid,
      orderId: `${orderPrefix}-duplicate`,
      amount: 68,
      productId: '10301',
      channel: 'qa-cash-live',
    });
    assert.equal(duplicate.success, false);
    assert.equal(duplicate.error, 'ALREADY_ACTIVE');
    assert.equal(await Transaction.countDocuments({ orderId: `${orderPrefix}-duplicate` }), 0);
    saved = await Player.collection.findOne({ userId: uid });
    assert.deepEqual(saved.rechargeInfo.records, [{ id: 10301, count: 1 }]);
    row = saved.activityInfo.datas.find((entry) => Number(entry.id) === activityId);
    assert.deepEqual(row.recordList.map(Number), [10301]);

    console.log('ACTIVATION_PASS_CASH_LIVE=' + JSON.stringify({
      result: 'PASS',
      checks: 18,
      serverId,
      dbName,
      activityId,
      payId: 10301,
      amountGuard: true,
      resolverVersion: paid.data.resolverVersion,
      activationOnly: true,
      transactionWritten: true,
      duplicateBlocked: true,
    }));
  } finally {
    await Transaction.deleteMany({
      $or: [
        { orderId: { $regex: `^${orderPrefix}` } },
        { userId: uid },
      ],
    });
    await Player.collection.deleteMany({ userId: uid });
    const players = await Player.collection.countDocuments({ userId: uid });
    const transactions = await Transaction.countDocuments({
      $or: [
        { orderId: { $regex: `^${orderPrefix}` } },
        { userId: uid },
      ],
    });
    assert.equal(players, 0);
    assert.equal(transactions, 0);
    console.log('ACTIVATION_PASS_CASH_CLEANUP=' + JSON.stringify({
      result: 'PASS', players, transactions,
    }));
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error.stack || String(error));
  try { await mongoose.disconnect(); } catch (_error) {}
  process.exitCode = 1;
});

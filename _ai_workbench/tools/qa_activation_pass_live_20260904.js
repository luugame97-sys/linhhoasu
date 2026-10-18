'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const WebSocket = require('/linhhoasu/lhs/newServer/node_modules/ws');
const { MongoClient } = require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const { Pack, Unpack } = require('/linhhoasu/lhs/newServer/src/protocol/Codec');
const config = require('/linhhoasu/lhs/newServer/src/services/ConfigService');

const serverId = Number(process.env.QA_SERVER_ID || 1001);
const wsPort = Number(process.env.QA_WS_PORT || (serverId === 1002 ? 9201 : 9200));
const dbName = process.env.QA_DB || `lhs_s${serverId}`;
const activityId = serverId === 1002 ? 7051 : 7001;
const uid = `qa_activation_pass_${Date.now().toString(36)}`;
const dbUid = `${uid}_s${serverId}`;
const playerId = crypto.randomBytes(12).toString('hex');
const db = new MongoClient('mongodb://127.0.0.1:27017');
let ws;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function open() {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(`ws://127.0.0.1:${wsPort}`, {
      headers: { Origin: 'http://127.0.0.1' },
      handshakeTimeout: 10000,
    });
    ws.once('open', resolve);
    ws.once('error', reject);
  });
}

function recv(match, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      done();
      reject(new Error('TIMEOUT'));
    }, timeout);
    function on(raw) {
      let rows;
      try {
        const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        rows = Unpack(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
      } catch (_error) {
        return;
      }
      for (const packet of (Array.isArray(rows) ? rows : [rows])) {
        if (match(packet)) {
          done();
          resolve(packet);
          return;
        }
      }
    }
    function done() {
      clearTimeout(timer);
      ws.off('message', on);
    }
    ws.on('message', on);
  });
}

async function login(msgUid) {
  const activity = recv((packet) => (
    packet && packet.tag === 1700 && packet.data && Array.isArray(packet.data.datas)
  ));
  const response = recv((packet) => packet && packet.tag === 1 && packet.msgUid === msgUid);
  ws.send(Pack(1, {
    platformuid: uid,
    userid: uid,
    userId: uid,
    serverid: serverId,
    serverId,
    firstName: 'QA Activation Pass',
  }, msgUid));
  assert.equal((await response).data.result, 0);
  return activity;
}

function merge(rows) {
  const values = new Map();
  for (const row of rows || []) {
    const id = Number(row.id);
    values.set(id, (values.get(id) || 0) + Number(row.count || 0));
  }
  return Object.fromEntries([...values.entries()].sort((left, right) => left[0] - right[0]));
}

function getCount(player, id) {
  if (Number(id) === 1) return Number(player.currencies && player.currencies.diamond || 0);
  if (Number(id) === 2) return Number(player.currencies && player.currencies.silver || 0);
  if (Number(id) === 6) return Number(player.currencies && player.currencies.gold || 0);
  return Number(player.items && player.items[id] || 0);
}

async function main() {
  await db.connect();
  config.loadAllTables();
  const collection = db.db(dbName).collection('players');
  const source = await collection.findOne({ isBot: true });
  assert(source);
  delete source._id;
  delete source.__v;
  source.userId = dbUid;
  source.playerId = playerId;
  source.name = `QA Activation ${uid.slice(-8)}`;
  source.accountId = '';
  source.isBot = false;
  delete source.botWorker;
  source.serverId = serverId;
  source.serverName = `S${String(serverId).slice(-1)}`;
  source.level = 20;
  source.items = { 19: 80, 1001: 1000 };
  source.currencies = { diamond: 0, gold: 0, silver: 0 };
  source.rechargeInfo = { area: serverId === 1002 ? 2 : 1, records: [], totalRecharge: 0, totalrecharge: 0 };
  source.activityInfo = { datas: [], disabledEntryIds: [], operateRecords: {} };
  source.taskInfo = {
    dailyTaskDayKey: 20200101,
    tasks: {},
    tasksMap: {},
    dailyRewardRecords: [20],
  };
  await collection.insertOne(source);

  try {
    await open();
    const initialPacket = await login(701);
    const initial = await initialPacket;
    const initialRow = initial.data.datas.find((row) => Number(row.id) === activityId);
    assert(initialRow);
    assert.equal(Number(initialRow.score), 80);
    assert.deepEqual(initialRow.recordList || [], []);
    await wait(1000);
    let saved = await collection.findOne({ userId: dbUid });
    assert.equal(Number(saved.items && saved.items[19] || 0), 0);
    assert.equal(Number(saved.activityInfo.datas.find((row) => Number(row.id) === activityId).score), 80);

    const beforeToken = Number(saved.items[1001]);
    const purchaseAck = recv((packet) => packet && packet.tag === 1230 && packet.msgUid === 702);
    const purchaseActivity = recv((packet) => (
      packet && packet.tag === 1701 && packet.data && packet.data.data
      && Number(packet.data.data.id) === activityId
      && (packet.data.data.recordList || []).map(Number).includes(10301)
    ));
    ws.send(Pack(1230, { id: 10301, multi: 1 }, 702));
    const purchase = await purchaseAck;
    const activated = await purchaseActivity;
    assert.equal(purchase.data.result, 0);
    assert.deepEqual(activated.data.data.recordList.map(Number), [10301]);
    await wait(1000);
    saved = await collection.findOne({ userId: dbUid });
    assert.equal(beforeToken - Number(saved.items[1001]), 68);
    assert.deepEqual(saved.rechargeInfo.records, [{ id: 10301, count: 1 }]);
    assert.deepEqual(saved.activityInfo.datas.find((row) => Number(row.id) === activityId).recordList.map(Number), [10301]);

    const beforeDuplicate = Number(saved.items[1001]);
    const duplicateAck = recv((packet) => packet && packet.tag === 1230 && packet.msgUid === 703);
    ws.send(Pack(1230, { id: 10301, multi: 1 }, 703));
    const duplicate = await duplicateAck;
    assert.equal(duplicate.data.result, -1);
    assert.equal(duplicate.data.code, 'ALREADY_ACTIVE');
    await wait(700);
    saved = await collection.findOne({ userId: dbUid });
    assert.equal(Number(saved.items[1001]), beforeDuplicate);
    assert.deepEqual(saved.rechargeInfo.records, [{ id: 10301, count: 1 }]);

    const points = [0, 40, 80];
    const expectedRows = config.get('Activity7Config')[activityId][1];
    const beforeRewards = await collection.findOne({ userId: dbUid });
    const expectedTotal = {};
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const expected = merge([
        ...expectedRows[point].rewards,
        ...expectedRows[point].eRewards,
      ]);
      Object.entries(expected).forEach(([id, count]) => {
        expectedTotal[id] = Number(expectedTotal[id] || 0) + Number(count);
      });
      const reply = recv((packet) => packet && packet.tag === 1700 && packet.msgUid === 710 + index);
      ws.send(Pack(1700, { id: activityId, module: 0, index: 0, param: 0 }, 710 + index));
      const claimed = await reply;
      assert.equal(claimed.data.result, 0);
      assert.deepEqual(merge(claimed.data.rewardInfo.items), expected);
    }
    await wait(1200);
    saved = await collection.findOne({ userId: dbUid });
    const claimedRow = saved.activityInfo.datas.find((row) => Number(row.id) === activityId);
    assert.deepEqual({
      0: Number(claimedRow.records['0']),
      40: Number(claimedRow.records['40']),
      80: Number(claimedRow.records['80']),
    }, { 0: 3, 40: 3, 80: 3 });
    Object.entries(expectedTotal).forEach(([id, count]) => {
      assert.equal(getCount(saved, id) - getCount(beforeRewards, id), Number(count));
    });

    const beforeReplay = JSON.stringify({
      currencies: saved.currencies,
      items: saved.items,
      records: claimedRow.records,
    });
    const replayAck = recv((packet) => packet && packet.tag === 1700 && packet.msgUid === 720);
    ws.send(Pack(1700, { id: activityId, module: 0, index: 0, param: 0 }, 720));
    const replay = await replayAck;
    assert.equal(replay.data.result, 1);
    await wait(700);
    saved = await collection.findOne({ userId: dbUid });
    const replayRow = saved.activityInfo.datas.find((row) => Number(row.id) === activityId);
    assert.equal(JSON.stringify({
      currencies: saved.currencies,
      items: saved.items,
      records: replayRow.records,
    }), beforeReplay);

    ws.close();
    await wait(500);
    await open();
    const relogPacket = await login(730);
    const relog = await relogPacket;
    const relogRow = relog.data.datas.find((row) => Number(row.id) === activityId);
    assert.deepEqual(relogRow.recordList.map(Number), [10301]);
    assert.deepEqual({
      0: Number(relogRow.records['0']),
      40: Number(relogRow.records['40']),
      80: Number(relogRow.records['80']),
    }, { 0: 3, 40: 3, 80: 3 });
    console.log('ACTIVATION_PASS_LIVE=' + JSON.stringify({
      result: 'PASS',
      checks: 28,
      serverId,
      dbName,
      activityId,
      payId: 10301,
      dailyResetPreservedScore: true,
      tokenCost: 68,
      activationPush: true,
      duplicateBlocked: true,
      claimedPoints: points,
      rewardDeltaVerified: true,
      claimReplayBlocked: true,
      relogPreserved: true,
    }));
  } finally {
    if (ws) {
      try { ws.close(); } catch (_error) {}
    }
    await wait(1000);
    await collection.deleteMany({ userId: /^qa_activation_pass_/ });
    const remaining = await collection.countDocuments({ userId: /^qa_activation_pass_/ });
    assert.equal(remaining, 0);
    await db.close();
    console.log('ACTIVATION_PASS_CLEANUP=' + JSON.stringify({ result: 'PASS', remaining }));
  }
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});

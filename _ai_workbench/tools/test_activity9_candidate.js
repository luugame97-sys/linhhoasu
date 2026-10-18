#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const candidateRoot = path.resolve(
  process.env.TIEN_DUYEN_CANDIDATE_ROOT
  || path.join(__dirname, '../temp/tien_duyen_runtime_candidate_20260831_184500')
);
const serverRoot = path.join(candidateRoot, 'linhhoasu/lhs/newServer/src');
const protocol = require(path.join(serverRoot, 'protocol/BinJsonUtil'));
const BinJsonUtil = protocol.BinJsonUtil;
const ByteArray = protocol.ByteArray;

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function decodeTable(bundlePath, targetName) {
  const buffer = fs.readFileSync(bundlePath);
  let offset = 0;
  while (offset < buffer.length) {
    const nameLength = buffer.readUInt8(offset);
    offset += 1;
    const name = buffer.toString('utf8', offset, offset + nameLength);
    offset += nameLength;
    const dataLength = buffer.readUInt32BE(offset);
    offset += 4;
    const compressed = buffer.subarray(offset, offset + dataLength);
    offset += dataLength;
    if (name !== targetName) continue;
    const inflated = zlib.inflateSync(compressed);
    return BinJsonUtil.readFullJson(new ByteArray(toArrayBuffer(inflated)));
  }
  throw new Error(targetName + ' not found in ' + bundlePath);
}

const playerServicePath = require.resolve(path.join(serverRoot, 'services/PlayerService'));
const serverConfigPath = require.resolve(path.join(serverRoot, 'services/ServerConfigService'));
require.cache[playerServicePath] = {
  id: playerServicePath,
  filename: playerServicePath,
  loaded: true,
  exports: {
    savePlayer: async function (_userId, player) { return player; },
    savePlayerDeferred: async function (_userId, player) { return player; },
    wasRecentlySaved: function () { return false; },
  },
};
require.cache[serverConfigPath] = {
  id: serverConfigPath,
  filename: serverConfigPath,
  loaded: true,
  exports: {
    getCurrentRechargeArea: async function () { return 1; },
  },
};

const activity9 = require(path.join(serverRoot, 'services/Activity9Service'));
const activity = require(path.join(serverRoot, 'handlers/activity'));
const compat = require(path.join(serverRoot, 'handlers/compat'));
const config = require(path.join(serverRoot, 'services/ConfigService'));

function newPlayer(extra) {
  return Object.assign({
    level: 50,
    exp: 0,
    roleInfo: { stage: 1, stageId: 1 },
    taskInfo: { tasks: {} },
    items: {},
    currencies: { diamond: 0, gold: 0, silver: 0 },
    rechargeInfo: { area: 1, records: [] },
    activityInfo: { datas: [] },
  }, extra || {});
}

function getActivity9Row(player) {
  return (player.activityInfo.datas || []).find(function (row) {
    return Number(row && row.id) === 9001;
  });
}

function packetByTag(result, tag) {
  const packets = Array.isArray(result) ? result : [result];
  return packets.find(function (packet) { return Number(packet && packet.tag) === tag; });
}

(async function main() {
  assert.strictEqual(activity9.ACTIVITY9_PRICE_R, 68);
  assert.strictEqual(activity9.getActivity9PriceR(10501, 128), 68);
  assert.strictEqual(activity9.getActivity9PriceR(10502, 128), 68);
  assert.strictEqual(activity9.getActivity9PriceR(10301, 99), 99);

  const belowLevel = newPlayer({ level: 29 });
  assert.strictEqual(activity9.ensureActivity9State(belowLevel), null);

  const freePlayer = newPlayer();
  const seeded = activity9.ensureActivity9State(freePlayer, { now: 1700000000000 });
  assert(seeded && seeded.created);
  assert.strictEqual(seeded.activityId, 9001);
  assert.strictEqual(seeded.payId, 10501);
  assert.strictEqual(seeded.row.score, 1);
  assert.strictEqual(seeded.row.startTime, 1700000000000);
  assert.strictEqual(seeded.row.endTime, 1700000000000 + 7 * activity9.DAY_MS);

  const progressed = activity9.ensureActivity9State(freePlayer, {
    now: 1700000000000 + 2 * activity9.DAY_MS + 1000,
  });
  assert.strictEqual(progressed.row.score, 3);
  assert.strictEqual(activity9.isWindowOpen(
    progressed.row,
    1700000000000 + 8 * activity9.DAY_MS
  ), false);

  const freeClaimPlayer = newPlayer();
  activity9.ensureActivity9State(freeClaimPlayer);
  const freeClaim = await activity.handleActivityOperate(
    { id: 9001, module: 0, index: 0, param: 0 },
    { player: freeClaimPlayer },
    1
  );
  const freeReply = packetByTag(freeClaim, 1700);
  assert.strictEqual(freeReply.data.result, 0);
  assert.deepStrictEqual(freeReply.data.rewardInfo.items, [
    { id: 4, count: 10 },
    { id: 80, count: 1 },
  ]);
  assert.strictEqual(getActivity9Row(freeClaimPlayer).records[1], 1);
  assert.strictEqual(freeClaimPlayer.items[4], 10);
  assert.strictEqual(freeClaimPlayer.items[80], 1);

  const freeRepeat = await activity.handleActivityOperate(
    { id: 9001, module: 0, index: 0, param: 0 },
    { player: freeClaimPlayer },
    2
  );
  assert.strictEqual(packetByTag(freeRepeat, 1700).data.result, 1);
  assert.strictEqual(freeClaimPlayer.items[4], 10);
  assert.strictEqual(freeClaimPlayer.items[80], 1);

  const paidClaimPlayer = newPlayer({
    rechargeInfo: { area: 1, records: [{ id: 10501, count: 1 }] },
  });
  activity9.ensureActivity9State(paidClaimPlayer);
  const paidClaim = await activity.handleActivityOperate(
    { id: 9001, module: 0, index: 0, param: 0 },
    { player: paidClaimPlayer },
    3
  );
  const paidReply = packetByTag(paidClaim, 1700);
  assert.strictEqual(paidReply.data.result, 0);
  assert.deepStrictEqual(paidReply.data.rewardInfo.items, [
    { id: 4, count: 60 },
    { id: 80, count: 1 },
    { id: 81, count: 5 },
  ]);
  assert.strictEqual(getActivity9Row(paidClaimPlayer).records[1], 3);
  assert.deepStrictEqual(getActivity9Row(paidClaimPlayer).recordList, [10501]);

  const buyAfterFree = newPlayer({ items: { 1001: 68 } });
  activity9.ensureActivity9State(buyAfterFree);
  await activity.handleActivityOperate(
    { id: 9001, module: 0, index: 0, param: 0 },
    { player: buyAfterFree },
    4
  );
  assert.strictEqual(getActivity9Row(buyAfterFree).records[1], 1);
  const purchase = await compat.handleTokenRecharge1230(
    { id: 10501, multi: 1 },
    { player: buyAfterFree },
    5
  );
  assert.strictEqual(buyAfterFree.items[1001] || 0, 0);
  assert.deepStrictEqual(buyAfterFree.rechargeInfo.records, [{ id: 10501, count: 1 }]);
  assert.deepStrictEqual(getActivity9Row(buyAfterFree).recordList, [10501]);
  assert.deepStrictEqual((Array.isArray(purchase) ? purchase : [purchase]).map(function (p) {
    return p.tag;
  }), [1202, 1701, 1230]);
  assert.strictEqual(packetByTag(purchase, 1230).data.rewardInfo, undefined);
  assert.strictEqual(buyAfterFree.currencies.diamond, 0);

  const premiumClaim = await activity.handleActivityOperate(
    { id: 9001, module: 0, index: 0, param: 0 },
    { player: buyAfterFree },
    6
  );
  assert.deepStrictEqual(packetByTag(premiumClaim, 1700).data.rewardInfo.items, [
    { id: 4, count: 50 },
    { id: 81, count: 5 },
  ]);
  assert.strictEqual(getActivity9Row(buyAfterFree).records[1], 3);

  const beforeDuplicate = JSON.stringify({
    items: buyAfterFree.items,
    records: buyAfterFree.rechargeInfo.records,
    activity: getActivity9Row(buyAfterFree),
    currencies: buyAfterFree.currencies,
  });
  const duplicatePurchase = await compat.handleTokenRecharge1230(
    { id: 10501, multi: 1 },
    { player: buyAfterFree },
    7
  );
  assert.strictEqual(packetByTag(duplicatePurchase, 1230).data.result, 0);
  assert.strictEqual(packetByTag(duplicatePurchase, 1230).data.rewardInfo, undefined);
  assert.strictEqual(JSON.stringify({
    items: buyAfterFree.items,
    records: buyAfterFree.rechargeInfo.records,
    activity: getActivity9Row(buyAfterFree),
    currencies: buyAfterFree.currencies,
  }), beforeDuplicate);

  const multiPlayer = newPlayer({ items: { 1001: 1000 } });
  activity9.ensureActivity9State(multiPlayer);
  const multiReject = await compat.handleTokenRecharge1230(
    { id: 10501, multi: 2 },
    { player: multiPlayer },
    8
  );
  assert.strictEqual(multiReject.data.result, -1);
  assert.strictEqual(multiPlayer.items[1001], 1000);

  const sweepPlayer = newPlayer({
    rechargeInfo: { area: 1, records: [{ id: 10501, count: 1 }] },
  });
  activity9.ensureActivity9State(sweepPlayer, { now: Date.now() - 2 * activity9.DAY_MS });
  activity9.ensureActivity9State(sweepPlayer, { now: Date.now() });
  assert.strictEqual(getActivity9Row(sweepPlayer).score, 3);
  const sweepResult = await activity.handleActivityOperate(
    { id: 9001, module: 0, index: 0, param: 0 },
    { player: sweepPlayer },
    9
  );
  const expectedSweep = new Map();
  Object.values(config.get('Activity9Config')[9001]).filter(function (row) {
    return Number(row.day) <= 3;
  }).forEach(function (row) {
    row.rewards.concat(row.pRewards).forEach(function (reward) {
      expectedSweep.set(reward.id, (expectedSweep.get(reward.id) || 0) + reward.count);
    });
  });
  assert.deepStrictEqual(packetByTag(sweepResult, 1700).data.rewardInfo.items,
    Array.from(expectedSweep.entries()).map(function (pair) {
      return { id: pair[0], count: pair[1] };
    }).sort(function (left, right) { return left.id - right.id; }));
  assert.deepStrictEqual({
    day1: getActivity9Row(sweepPlayer).records[1],
    day2: getActivity9Row(sweepPlayer).records[2],
    day3: getActivity9Row(sweepPlayer).records[3],
  }, { day1: 3, day2: 3, day3: 3 });

  const transactionPath = require.resolve(path.join(serverRoot, 'db/models/Transaction'));
  const playerModelPath = require.resolve(path.join(serverRoot, 'db/models/Player'));
  const mailModelPath = require.resolve(path.join(serverRoot, 'db/models/Mail'));
  const rechargeConfigPath = require.resolve(path.join(serverRoot, 'services/RechargeConfigService'));
  const distClientPath = require.resolve(path.join(serverRoot, 'services/DistClient'));
  const playerGrantPath = require.resolve(path.join(serverRoot, 'services/PlayerGrantService'));
  const mailHandlerPath = require.resolve(path.join(serverRoot, 'handlers/mail'));
  let transactionCreates = 0;
  let playerSaves = 0;
  const markedPaths = [];
  const cashPlayer = newPlayer({
    userId: 'cash-fixture',
    playerId: 'cash-player',
    rechargeInfo: { area: 1, records: [], totalRecharge: 0, totalrecharge: 0 },
  });
  cashPlayer.markModified = function (field) { markedPaths.push(field); };
  cashPlayer.save = async function () { playerSaves += 1; return cashPlayer; };
  require.cache[transactionPath] = {
    id: transactionPath, filename: transactionPath, loaded: true,
    exports: {
      findOne: async function () { return null; },
      create: async function (data) { transactionCreates += 1; return Object.assign({}, data); },
    },
  };
  require.cache[playerModelPath] = {
    id: playerModelPath, filename: playerModelPath, loaded: true,
    exports: { findOne: async function () { return cashPlayer; } },
  };
  require.cache[mailModelPath] = {
    id: mailModelPath, filename: mailModelPath, loaded: true,
    exports: { create: async function (data) { return data; } },
  };
  require.cache[rechargeConfigPath] = {
    id: rechargeConfigPath, filename: rechargeConfigPath, loaded: true,
    exports: {
      normalizeProductId: function (value) { return String(value || '').trim(); },
      getResolvedRow: async function (productId) {
        return {
          productId: String(productId), amount: 68, diamond: 0,
          firstBonus: 0, enabled: true, attachments: [],
        };
      },
      normalizeRewardItems: function (rows) { return Array.isArray(rows) ? rows : []; },
    },
  };
  require.cache[distClientPath] = {
    id: distClientPath, filename: distClientPath, loaded: true,
    exports: { rechargeCallback: async function () { return { success: true }; } },
  };
  require.cache[playerGrantPath] = {
    id: playerGrantPath, filename: playerGrantPath, loaded: true,
    exports: {
      buildItemSyncPayload: function () { return { result: 0, items: [], changed: [] }; },
    },
  };
  require.cache[mailHandlerPath] = {
    id: mailHandlerPath, filename: mailHandlerPath, loaded: true,
    exports: { toClientMail: function (mail) { return mail; } },
  };
  const recharge = require(path.join(serverRoot, 'handlers/recharge'));
  const wrongAmount = await recharge.handleRecharge({
    userId: 'cash-fixture', orderId: 'wrong-amount', amount: 128,
    productId: '10501', channel: 'fixture',
  }, null);
  assert.strictEqual(wrongAmount.success, false);
  assert.strictEqual(wrongAmount.error, 'AMOUNT_MISMATCH');
  assert.strictEqual(playerSaves, 0);
  assert.strictEqual(transactionCreates, 0);

  const pushedTags = [];
  const cashResult = await recharge.handleRecharge({
    userId: 'cash-fixture', orderId: 'correct-amount', amount: 68,
    productId: '10501', channel: 'fixture',
  }, {
    pushToUser: function (_userId, tag, data) { pushedTags.push({ tag: tag, data: data }); },
    syncSessionPlayer: function () {},
  });
  assert.strictEqual(cashResult.success, true);
  assert.strictEqual(cashResult.data.diamond, 0);
  assert.strictEqual(cashResult.data.payId, 10501);
  assert.strictEqual(transactionCreates, 1);
  assert.strictEqual(playerSaves, 1);
  assert(markedPaths.includes('activityInfo'));
  assert.deepStrictEqual(cashPlayer.rechargeInfo.records, [{ id: 10501, count: 1 }]);
  assert.deepStrictEqual(getActivity9Row(cashPlayer).recordList, [10501]);
  assert(pushedTags.some(function (packet) {
    return packet.tag === 1701
      && packet.data
      && packet.data.data
      && packet.data.data.id === 9001;
  }));

  const serverPay = config.get('PayConfig');
  assert.strictEqual(serverPay[10501].priceR, 68);
  assert.strictEqual(serverPay[10502].priceR, 68);
  const clientPay = decodeTable(
    path.resolve(process.env.TIEN_DUYEN_CLIENT_CONFIG),
    'PayConfig'
  );
  assert.strictEqual(clientPay[10501].priceR, 68);
  assert.strictEqual(clientPay[10502].priceR, 68);

  const indexText = fs.readFileSync(path.resolve(process.env.TIEN_DUYEN_INDEX), 'utf8');
  assert(/2026(?:0831_tien_duyen_fix_v1|0904_linkage365_v1)/.test(indexText));
  assert(!indexText.includes('20260831_register_redirect_v1'));
  const clientMainText = fs.readFileSync(path.resolve(process.env.TIEN_DUYEN_CLIENT_MAIN), 'utf8');
  assert(clientMainText.includes('n.Rpc(1230,t,function(t){t&&0===t.result&&('));
  assert(!clientMainText.includes('n.Rpc(1230,t,function(t){t.rewardInfo&&Er.Open(t.rewardInfo),n.addRecords(e,1)'));

  console.log(JSON.stringify({
    result: 'ok',
    activityId: 9001,
    payId: 10501,
    priceR: 68,
    freeClaim: freeReply.data.rewardInfo.items,
    paidClaim: paidReply.data.rewardInfo.items,
    purchaseTags: [1202, 1701, 1230],
    duplicatePurchaseCharged: false,
    cashAmountGuard: true,
    cashActivationPush: true,
    sweepOpenDays: 3,
    tableCount: Object.keys(config.loadAllTables()).length,
  }));
})().catch(function (error) {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});

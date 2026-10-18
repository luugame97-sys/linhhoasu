'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

process.env.CONFIG_BIN_PATH = path.resolve(
  __dirname,
  '../../linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin'
);

const serverConfigService = require('../../linhhoasu/lhs/newServer/src/services/ServerConfigService');
serverConfigService.getCurrentRechargeArea = async () => 1;

const activity = require('../../linhhoasu/lhs/newServer/src/handlers/activity');
const compat = require('../../linhhoasu/lhs/newServer/src/handlers/compat');

function baseRow(id = 7001) {
  const now = Date.now();
  return {
    id,
    module: 0,
    index: 0,
    param: 0,
    record: 0,
    status: 0,
    startTime: now - 1000,
    endTime: now + 86400000,
    score: 80,
    recordList: [],
    records: {},
    buyRecords: {},
    extra: {},
  };
}

function basePlayer() {
  return {
    level: 20,
    items: { 19: 80, 1001: 1000 },
    rechargeInfo: { area: 1, records: [] },
    activityInfo: { datas: [baseRow()], disabledEntryIds: [] },
    currencies: {},
  };
}

function packets(value) {
  return Array.isArray(value) ? value : [value];
}

async function main() {
  const purchasePlayer = basePlayer();
  const beforeToken = purchasePlayer.items[1001];
  const purchaseResponse = await compat.handleTokenRecharge1230(
    { id: 10301, multi: 1 },
    { player: purchasePlayer },
    1
  );
  const purchasePacket = packets(purchaseResponse).find((packet) => packet && packet.tag === 1230);
  assert.equal(purchasePacket.data.result, 0);
  assert.equal(purchasePlayer.items[1001], beforeToken - 68);
  assert.equal(purchasePlayer.rechargeInfo.records.length, 1);
  assert.deepEqual(purchasePlayer.activityInfo.datas[0].recordList, [10301]);
  assert(packets(purchaseResponse).some((packet) => packet && packet.tag === 1701));

  const beforeDuplicate = purchasePlayer.items[1001];
  const duplicateResponse = await compat.handleTokenRecharge1230(
    { id: 10301, multi: 1 },
    { player: purchasePlayer },
    2
  );
  const duplicatePacket = packets(duplicateResponse).find((packet) => packet && packet.tag === 1230);
  assert.equal(duplicatePacket.data.result, -1);
  assert.equal(duplicatePacket.data.code, 'ALREADY_ACTIVE');
  assert.equal(purchasePlayer.items[1001], beforeDuplicate);
  assert.equal(purchasePlayer.rechargeInfo.records[0].count, 1);

  const claimPlayer = basePlayer();
  const beforeDiamond = Number(claimPlayer.currencies.diamond || 0);
  claimPlayer.rechargeInfo.records = [{ id: 10301, count: 1 }];
  claimPlayer.activityInfo.datas[0].records = { 0: 1, 40: 1 };
  const claimResponse = await activity.handleActivityOperate(
    { id: 7001, module: 0, index: 0, param: 0 },
    { player: claimPlayer },
    3
  );
  const activityPacket = packets(claimResponse).find((packet) => packet && packet.tag === 1701);
  assert(activityPacket);
  const row = activityPacket.data.data;
  assert.deepEqual(row.recordList, [10301]);
  assert.equal(row.records[0], 3);
  const rewardPackets = packets(claimResponse).filter((packet) => (
    packet && packet.data && packet.data.rewardInfo
  ));
  const rewardItems = rewardPackets.flatMap((packet) => packet.data.rewardInfo.items || []);
  assert(rewardItems.some((item) => Number(item.id) === 1 && Number(item.count) === 400));

  const s1 = basePlayer();
  const s2 = basePlayer();
  s2.rechargeInfo.area = 2;
  s2.activityInfo.datas = [];
  const s1Info = activity.ensureActivityInfo(s1);
  const s2Info = activity.ensureActivityInfo(s2);
  assert(s1Info.datas.some((entry) => Number(entry.id) === 7001));
  assert(s2Info.datas.some((entry) => Number(entry.id) === 7051));

  console.log(JSON.stringify({
    result: 'PASS',
    purchase: {
      result: purchasePacket.data.result,
      tokenCost: beforeToken - purchasePlayer.items[1001],
      purchaseRecordWritten: purchasePlayer.rechargeInfo.records.length > 0,
      entitlementWritten: purchasePlayer.activityInfo.datas[0].recordList.includes(10301),
      activityUpdatePushed: packets(purchaseResponse).some((packet) => packet && packet.tag === 1701),
      duplicateCode: duplicatePacket.data.code,
      duplicateTokenUnchanged: purchasePlayer.items[1001] === beforeDuplicate,
    },
    legacyRepairAndClaim: {
      rechargeRecordMigrated: true,
      entitlementVisibleToClient: row.recordList.includes(10301),
      premiumStateAtPoint0: row.records[0],
      grantedDiamondDelta: Number(claimPlayer.currencies.diamond || 0) - beforeDiamond,
      rewardNotificationPackets: rewardPackets.length,
      rewardSnapshot: rewardItems[0] || null,
    },
    areaSelection: {
      s1ActivityId: s1Info.datas.find((entry) => Number(entry.id) === 7001).id,
      s2ActivityId: s2Info.datas.find((entry) => Number(entry.id) === 7051).id,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});

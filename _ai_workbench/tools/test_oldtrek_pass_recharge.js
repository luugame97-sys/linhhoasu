const assert = require('assert');
const path = require('path');

const configService = require('../../linhhoasu/lhs/newServer/src/services/ConfigService');
const {
  isOldTrekPassPayId,
  getOldTrekPassMeta,
  resolveRechargeRewards,
} = require('../../linhhoasu/lhs/newServer/src/services/RechargeRewardResolver');
const {
  applyRechargeBenefits,
} = require('../../linhhoasu/lhs/newServer/src/services/RechargeBenefitService');
const {
  ensureOldTrekInfo,
  handleOldTrekAction,
} = require('../../linhhoasu/lhs/newServer/src/handlers/old-trek');
const compat = require('../../linhhoasu/lhs/newServer/src/handlers/compat');
const playerService = require('../../linhhoasu/lhs/newServer/src/services/PlayerService');
const serverConfigService = require('../../linhhoasu/lhs/newServer/src/services/ServerConfigService');

// Stub DB operations for standalone unit test
playerService.savePlayer = async () => true;
playerService.savePlayerDeferred = async () => true;
serverConfigService.getCurrentRechargeArea = async () => 1;

async function runTests() {
  console.log('=== TEST 1: OldTrekPass IDs & Meta ===');
  const expectedPasses = [
    { payId: 11121, destId: 1, isAdvanced: false, bit: 2, sailorId: 360101 },
    { payId: 11122, destId: 1, isAdvanced: true,  bit: 4, sailorId: 370101 },
    { payId: 11123, destId: 2, isAdvanced: false, bit: 2, sailorId: 360201 },
    { payId: 11124, destId: 2, isAdvanced: true,  bit: 4, sailorId: 370201 },
    { payId: 11125, destId: 3, isAdvanced: false, bit: 2, sailorId: 360301 },
    { payId: 11126, destId: 3, isAdvanced: true,  bit: 4, sailorId: 370301 },
    { payId: 11127, destId: 4, isAdvanced: false, bit: 2, sailorId: 360401 },
    { payId: 11128, destId: 4, isAdvanced: true,  bit: 4, sailorId: 370401 },
  ];

  for (const exp of expectedPasses) {
    assert.strictEqual(isOldTrekPassPayId(exp.payId), true, `payId ${exp.payId} should be recognized`);
    const meta = getOldTrekPassMeta(exp.payId);
    assert(meta, `meta for ${exp.payId} should exist`);
    assert.strictEqual(meta.destId, exp.destId, `destId for ${exp.payId}`);
    assert.strictEqual(meta.isAdvanced, exp.isAdvanced, `isAdvanced for ${exp.payId}`);
    assert.strictEqual(meta.bit, exp.bit, `bit for ${exp.payId}`);
    assert.strictEqual(meta.sailorId, exp.sailorId, `sailorId for ${exp.payId}`);
    assert(meta.rewards.length > 0, `rewards for ${exp.payId} should not be empty`);
  }
  console.log('TEST 1 PASSED: All 8 OldTrekPass definitions valid.\n');

  console.log('=== TEST 2: resolveRechargeRewards validation ===');
  const mockPlayer = {
    playerId: 'test_player_01',
    other_attr_info: {
      oldTrekInfo: {
        passRecords: [
          { id: 1, buyRecord: 1, claimRecord: {} }
        ],
      },
    },
  };

  // Test 11121 resolve
  const res1 = resolveRechargeRewards(mockPlayer, { payId: 11121, multi: 1 });
  assert.strictEqual(res1.ok, true, '11121 should resolve OK');
  assert.strictEqual(res1.isOldTrekPass, true);
  assert(res1.rows.some((r) => r.id === 1 && r.count === 1680), 'Should grant 1680 KNB');
  assert(res1.rows.some((r) => r.id === 360101 && r.count === 1), 'Should grant sailor 360101 item');

  // Multi > 1 rejected
  const resMulti = resolveRechargeRewards(mockPlayer, { payId: 11121, multi: 2 });
  assert.strictEqual(resMulti.ok, false);
  assert.strictEqual(resMulti.reason, 'INVALID_MULTI');

  console.log('TEST 2 PASSED: resolveRechargeRewards passed.\n');

  console.log('=== TEST 3: applyRechargeBenefits entitlement & sailor activation ===');
  const player2 = {
    playerId: 'test_player_02',
    other_attr_info: {},
  };

  const benefit1 = applyRechargeBenefits(player2, { payId: 11121 });
  assert(benefit1.oldTrekPassUpdate, 'oldTrekPassUpdate should be present');
  const info2 = player2.other_attr_info.oldTrekInfo;
  const passRec1 = info2.passRecords.find((r) => r.id === 1);
  assert(passRec1, 'passRecord for dest 1 should exist');
  assert.strictEqual(passRec1.buyRecord, 3, 'buyRecord should be 1 | 2 = 3');
  assert(info2.sailorList.some((s) => s.id === 360101), 'sailor 360101 should be in sailorList');
  assert.strictEqual(info2.sailorAtlas[360101], 0, 'sailorAtlas should contain 360101');

  // Attempt duplicate purchase of 11121
  const dupCheck1 = resolveRechargeRewards(player2, { payId: 11121, multi: 1 });
  assert.strictEqual(dupCheck1.ok, false);
  assert.strictEqual(dupCheck1.reason, 'ALREADY_ACTIVE');

  // Buy advanced pass 11122
  const benefit2 = applyRechargeBenefits(player2, { payId: 11122 });
  const passRec2 = info2.passRecords.find((r) => r.id === 1);
  assert.strictEqual(passRec2.buyRecord, 7, 'buyRecord should be 3 | 4 = 7');
  assert(info2.sailorList.some((s) => s.id === 370101), 'sailor 370101 should be in sailorList');
  assert.strictEqual(info2.sailorAtlas[370101], 0, 'sailorAtlas should contain 370101');

  // Attempt duplicate purchase of 11122
  const dupCheck2 = resolveRechargeRewards(player2, { payId: 11122, multi: 1 });
  assert.strictEqual(dupCheck2.ok, false);
  assert.strictEqual(dupCheck2.reason, 'ALREADY_ACTIVE');

  console.log('TEST 3 PASSED: Entitlement & Sailor activation verified.\n');

  console.log('=== TEST 4: Full Token Recharge Flow (RPC 1230) ===');
  const sessionUser = {
    userId: 'test_user_token_01',
    player: {
      playerId: 'test_user_token_01',
      items: {
        '1001': 1000, // 1000 Phieu Nap
      },
      currencies: {
        diamond: 0,
        gold: 0,
        silver: 0,
      },
      rechargeInfo: {
        records: [],
        area: 1,
        totalrecharge: 0,
      },
      other_attr_info: {},
    },
  };

  // Buy 11121 (costs 168 Item 1001)
  const resultPackets = await compat.handleTokenRecharge1230(
    { id: 11121, multi: 1 },
    sessionUser,
    9999
  );

  assert(Array.isArray(resultPackets), 'Response should be array of packets');
  const pkt1230 = resultPackets.find((p) => p.tag === 1230);
  assert(pkt1230, 'tag 1230 packet must exist');
  assert.strictEqual(pkt1230.data.result, 0, 'result must be 0');

  const pkt7000 = resultPackets.find((p) => p.tag === 7000);
  assert(pkt7000, 'tag 7000 sync packet must exist');
  const recs = pkt7000.data.passRecords.find((r) => r.id === 1);
  assert(recs && recs.buyRecord === 3, 'tag 7000 must show buyRecord = 3');

  const pkt1210 = resultPackets.find((p) => p.tag === 1210);
  assert(pkt1210, 'tag 1210 push packet must exist');
  assert.strictEqual(pkt1210.data.payid, 11121);

  // Check token deduction
  const remainingTokens = sessionUser.player.items['1001'];
  assert.strictEqual(remainingTokens, 1000 - 168, '168 tokens should be consumed');

  // Check KNB addition
  const diamondCount = sessionUser.player.currencies.diamond;
  assert.strictEqual(diamondCount, 1680, '1680 KNB should be added');

  console.log(`Remaining tokens: ${remainingTokens}, Diamond: ${diamondCount}`);
  console.log('TEST 4 PASSED: Token recharge flow executed flawlessly.\n');

  console.log('=== TEST 5: RPC 7044 Milestone Reward Claiming ===');
  // Give distance to player to reach milestones
  sessionUser.player.other_attr_info.oldTrekInfo.totalDistance = 50000;
  const claimResult = await handleOldTrekAction(
    7044,
    { id: 1 },
    sessionUser,
    8888
  );
  assert.strictEqual(claimResult.data.result, 0, '7044 claim result should be 0');
  const claimedPassRecord = claimResult.data.passRecord;
  assert(claimedPassRecord, 'claimed passRecord must exist');
  // Milestone claimRecord should have bit 2 set for claimed tiers
  const claimKeys = Object.keys(claimedPassRecord.claimRecord);
  assert(claimKeys.length > 0, 'Milestones should be claimed');
  for (const k of claimKeys) {
    const flag = claimedPassRecord.claimRecord[k];
    assert.strictEqual((flag & 2) !== 0, true, `Milestone tier ${k} should have bit 2 claimed`);
  }
  console.log(`Claimed ${claimKeys.length} milestone tiers successfully via 7044!`);
  console.log('TEST 5 PASSED: Milestone claims working.\n');

  console.log('ALL TESTS PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});

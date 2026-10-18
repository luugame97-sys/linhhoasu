'use strict';
const assert = require('assert');

// 1. Test buildOtherPlayerDetail
const { buildOtherPlayerDetail } = require('../../linhhoasu/lhs/newServer/src/handlers/basic');


console.log('--- Test 1: S2 player inspection ---');
const s2Player = {
  playerId: 'p_u_Wk_1002_test',
  _id: '6a92a867f56f05538c2786ef',
  userId: 'u_Wk_1002_test',
  name: 'ZâmCaCa',
  level: 749,
  serverId: 1002,
  serverName: 'S2',
  roleInfo: { kungfuId: 4, stage: 5, stageId: 1, subJob: 0 },
};
const detail1 = buildOtherPlayerDetail(s2Player, { serverId: 1002 }, 0);
assert.strictEqual(detail1.serverId, 1002, 'detail1.serverId must be 1002');
assert.strictEqual(detail1.serverName, 'S2', 'detail1.serverName must be S2');
console.log('Test 1 PASS: S2 player has serverId=1002, serverName=S2');

console.log('--- Test 2: Legacy Chinese serverName normalization ---');
const legacyPlayer = {
  playerId: 'p_legacy',
  name: 'LegacyPlayer',
  serverId: 1001,
  serverName: '长安一区',
  roleInfo: { kungfuId: 4, stage: 1, stageId: 1, subJob: 0 },
};
const detail2 = buildOtherPlayerDetail(legacyPlayer, { serverId: 1001 }, 0);
assert.strictEqual(detail2.serverId, 1001, 'detail2.serverId must be 1001');
assert.strictEqual(detail2.serverName, 'S1', 'detail2.serverName must be normalized from 长安一区 to S1');
console.log('Test 2 PASS: Legacy 长安一区 correctly normalized to S1');

console.log('--- Test 3: Missing serverName with serverId 1003 ---');
const s3Player = {
  playerId: 'p_s3',
  name: 'S3Player',
  serverId: 1003,
  roleInfo: { kungfuId: 4, stage: 1, stageId: 1, subJob: 0 },
};
const detail3 = buildOtherPlayerDetail(s3Player, { serverId: 1003 }, 0);
assert.strictEqual(detail3.serverId, 1003, 'detail3.serverId must be 1003');
assert.strictEqual(detail3.serverName, 'S3', 'detail3.serverName must be S3');
console.log('Test 3 PASS: Missing serverName auto-resolved to S3');

console.log('--- Test 4: Top Arena RPC 6217 Robot inspection ---');
const arena = require('../../linhhoasu/lhs/newServer/src/handlers/arena');

arena.handleTopArenaCrossPlayerDetail({ playerId: '1001', serverId: 1002 }, { serverId: 1001, player: { playerId: 'caller' } }, 1)
  .then(res => {
    assert.strictEqual(res.tag, 6217);
    assert.strictEqual(res.data.serverId, 1002);
    assert.strictEqual(res.data.serverName, 'S2');
    console.log('Test 4 PASS: Robot opponent has serverId=1002, serverName=S2');

    console.log('--- Test 5: Top Arena RPC 6217 Fallback inspection ---');
    return arena.handleTopArenaCrossPlayerDetail({ playerId: 'unknown_cross_player', serverId: 1005 }, { serverId: 1001, player: { playerId: 'caller' } }, 2);
  })
  .then(res => {
    assert.strictEqual(res.tag, 6217);
    assert.strictEqual(res.data.serverId, 1005);
    assert.strictEqual(res.data.serverName, 'S5');
    console.log('Test 5 PASS: Fallback player has serverId=1005, serverName=S5');

    console.log('\n>>> ALL 5 TESTS PASSED SUCCESSFULLY! <<<');
    process.exit(0);
  })
  .catch(err => {
    console.error('FAILED:', err);
    process.exit(1);
  });

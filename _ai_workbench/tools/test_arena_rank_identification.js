const assert = require('assert');

process.env.APP_ENV = 'development';
process.env.SERVER_ID = '1001';

const basic = require('../../linhhoasu/lhs/newServer/src/handlers/basic');
const arena = require('../../linhhoasu/lhs/newServer/src/handlers/arena');

const mockSelf = {
  _id: '68c746e50e93ca914757ba3b',
  playerId: 'p_u_Wk_1001_1725514605',
  userId: 'u_test_self',
  name: 'SelfHero',
  level: 85,
  serverId: 1001,
  roleInfo: { kungfuId: 4, stage: 5, stageId: 5, subJob: 1 },
};

const mockOther = {
  _id: '68c746e50e93ca914757ba99',
  playerId: 'p_u_Wk_1001_1725519999',
  userId: 'u_test_other',
  name: 'OtherHero',
  level: 80,
  serverId: 1001,
  roleInfo: { kungfuId: 5, stage: 4, stageId: 4, subJob: 0 },
};

const mockSession = {
  userId: mockSelf.userId,
  serverId: 1001,
  player: mockSelf,
};

async function runTests() {
  console.log('Testing Arena Rank Identification (Step 4)...');

  // Test 1: handleGetPlayerDetailCross with self playerId
  const resByPlayerId = await basic.handleGetPlayerDetailCross(
    { playerId: mockSelf.playerId, serverId: 1001 },
    mockSession,
    1
  );
  assert.strictEqual(resByPlayerId.tag, 502);
  assert.strictEqual(resByPlayerId.data.playerId, mockSelf.playerId);
  assert.strictEqual(resByPlayerId.data.name, 'SelfHero');
  console.log('Test 1 (handleGetPlayerDetailCross with self playerId): PASS');

  // Test 2: handleGetPlayerDetailCross with self Mongo _id (from Top 3 podium click)
  const resByMongoId = await basic.handleGetPlayerDetailCross(
    { playerId: mockSelf._id, serverId: 1001 },
    mockSession,
    2
  );
  assert.strictEqual(resByMongoId.tag, 502);
  assert.strictEqual(resByMongoId.data.playerId, mockSelf.playerId);
  assert.strictEqual(resByMongoId.data.name, 'SelfHero');
  console.log('Test 2 (handleGetPlayerDetailCross with self _id): PASS');

  console.log('ALL CHECKS FOR STEP 4 PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});

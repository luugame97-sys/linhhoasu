const assert = require('assert');

process.env.APP_ENV = 'development';
process.env.SERVER_ID = '1001';

const basic = require('../../linhhoasu/lhs/newServer/src/handlers/basic');
const arena = require('../../linhhoasu/lhs/newServer/src/handlers/arena');

const mockCaller = {
  _id: '68c746e50e93ca914757ba3b',
  playerId: 'p_u_caller_1001',
  userId: 'u_caller',
  name: 'SuperCaller',
  level: 99,
  serverId: 1001,
  roleInfo: { kungfuId: 4, stage: 10, stageId: 10, subJob: 1 },
};

const mockSession = {
  userId: mockCaller.userId,
  serverId: 1001,
  player: mockCaller,
};

async function runTests() {
  console.log('Testing RPC 500 & 502 Routing & ServerId handling...');

  // 1. RPC 500 - Inspect self
  const res500Self = await basic.handleGetPlayerDetail({ playerId: mockCaller.playerId }, mockSession, 1);
  assert.strictEqual(res500Self.tag, 500);
  assert.strictEqual(res500Self.data.playerId, mockCaller.playerId);
  assert.strictEqual(res500Self.data.name, 'SuperCaller');
  console.log('Test 1 (RPC 500 Self): PASS');

  // 2. RPC 502 - Inspect self cross
  const res502Self = await basic.handleGetPlayerDetailCross({ playerId: mockCaller.playerId, serverId: 1001 }, mockSession, 2);
  assert.strictEqual(res502Self.tag, 502);
  assert.strictEqual(res502Self.data.playerId, mockCaller.playerId);
  assert.strictEqual(res502Self.data.name, 'SuperCaller');
  assert.strictEqual(res502Self.data.serverId, 1001);
  console.log('Test 2 (RPC 502 Self): PASS');

  // 3. RPC 500 - Unknown player fallback
  const res500Unknown = await basic.handleGetPlayerDetail({ playerId: 'unknown_cross_id' }, mockSession, 3);
  assert.strictEqual(res500Unknown.tag, 500);
  assert.strictEqual(res500Unknown.data.playerId, 'unknown_cross_id');
  assert.strictEqual(res500Unknown.data.result, -1);
  console.log('Test 3 (RPC 500 Unknown fallback): PASS');

  // 4. Check TopArena / TopCombat showInfo serverId
  const topCombatSelf = arena.buildTopCombatSelfShowInfo(mockCaller);
  assert.strictEqual(topCombatSelf.serverId, 1001, 'TopCombatSelf serverId should be 1001, not 1');
  console.log('Test 4.1 (TopCombatSelf serverId): PASS -', topCombatSelf.serverId);

  const topCombatRobot = arena.buildTopCombatRobotShowInfo(mockCaller, 1);
  assert.strictEqual(topCombatRobot.serverId, 1001, 'TopCombatRobot serverId should be 1001, not 1');
  console.log('Test 4.2 (TopCombatRobot serverId): PASS -', topCombatRobot.serverId);

  const topArenaRobot = arena.buildTopArenaRobotShowInfo(mockCaller, 1);
  assert.strictEqual(topArenaRobot.serverId, 1001, 'TopArenaRobot serverId should be 1001, not 1');
  console.log('Test 4.3 (TopArenaRobot serverId): PASS -', topArenaRobot.serverId);

  console.log('ALL CHECKS FOR STEP 3 PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});

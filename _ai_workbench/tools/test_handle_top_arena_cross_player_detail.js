const assert = require('assert');

process.env.APP_ENV = 'development';
process.env.SERVER_ID = '1001';

const arena = require('../../linhhoasu/lhs/newServer/src/handlers/arena');

const mockCaller = {
  _id: '68c746e50e93ca914757ba3b',
  playerId: 'p_u_caller_1001',
  userId: 'u_caller',
  name: 'SuperCaller',
  level: 99,
  power: 999999,
  roleInfo: { kungfuId: 4, stage: 10, stageId: 10, subJob: 1 },
  artifactInfo: {
    artifacts: [{ uid: 1, id: 23101, quenchLv: 1, attr: { level: 5, value: 500 } }],
  },
};

const mockSession = {
  userId: mockCaller.userId,
  serverId: 1001,
  player: mockCaller,
};

async function runTests() {
  console.log('Testing handleTopArenaCrossPlayerDetail (RPC 6217)...');

  // Case 1: Inspect self
  const selfRes = await arena.handleTopArenaCrossPlayerDetail({ playerId: mockCaller.playerId, serverId: 1001 }, mockSession, 1);
  assert.strictEqual(selfRes.tag, 6217);
  assert.strictEqual(selfRes.data.playerId, mockCaller.playerId);
  assert.strictEqual(selfRes.data.name, 'SuperCaller');
  assert.strictEqual(selfRes.data.level, 99);
  console.log('Case 1 (Self inspect): PASS');

  // Case 2: Inspect Robot (ID 101)
  const robotRes = await arena.handleTopArenaCrossPlayerDetail({ playerId: '101', serverId: 1001 }, mockSession, 2);
  assert.strictEqual(robotRes.tag, 6217);
  assert.strictEqual(robotRes.data.playerId, '101');
  assert.notStrictEqual(robotRes.data.name, 'SuperCaller', 'Robot must NOT have caller name');
  assert.notStrictEqual(robotRes.data.level, 99, 'Robot level must NOT be caller level');
  console.log('Case 2 (Robot inspect): PASS - Robot name:', robotRes.data.name, 'Level:', robotRes.data.level);

  // Case 3: Inspect other unknown player
  const otherRes = await arena.handleTopArenaCrossPlayerDetail({ playerId: 'p_u_other_9999', serverId: 1002 }, mockSession, 3);
  assert.strictEqual(otherRes.tag, 6217);
  assert.strictEqual(otherRes.data.playerId, 'p_u_other_9999');
  assert.notStrictEqual(otherRes.data.name, 'SuperCaller', 'Other player must NOT have caller name');
  assert.notStrictEqual(otherRes.data.level, 99, 'Other player must NOT have caller level');
  assert.strictEqual(otherRes.data.level, 1, 'Fallback player should have level 1');
  console.log('Case 3 (Unknown player fallback): PASS - Name:', otherRes.data.name, 'Level:', otherRes.data.level);

  console.log('ALL CHECKS FOR STEP 2 PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});

'use strict';

const assert = require('node:assert/strict');
const service = require('../src/services/PowerDisplaySyncService');
const readModel = require('../src/services/ArenaReadModelService');
const battle = require('../src/services/BattleService');

const session = {
  userId: 'qa-power-sync',
  serverId: 1001,
  player: { playerId: 'p-power-1', name: 'QA', level: 1 },
};
const attrs = battle.calcPlayerPower(session.player);
const expectedPower = readModel.displayPower(attrs);
const expectedScore = battle.calcPowerScore(attrs);

const first = service.packet(session, 44, true);
assert.equal(first.tag, 6198);
assert.equal(first.msgUid, 44);
assert.equal(first.data.result, 0);
assert.equal(first.data.power, expectedPower);
assert.equal(first.data.powerScore, expectedScore);
assert.equal(first.data.powerUnit, 'native-weighted-point');
assert.equal(service.packet(session), null, 'unchanged value must be deduplicated');

const query = service.handleQuery({}, session, 45);
assert.equal(query.tag, 6198);
assert.equal(query.msgUid, 45);
assert.equal(session._powerDisplayV1, true);
assert.equal(service.successfulResponse(query, 6198, 45), true);
assert.equal(service.successfulResponse({ tag: 6198, msgUid: 0, data: { result: 1 } }, 6198, 0), false);

const invalid = service.handleQuery({}, { userId: 'u' }, 46);
assert.equal(invalid.data.code, 'POWER_SESSION_REQUIRED');

console.log(JSON.stringify({ result: 'PASS', checks: 13, expectedPower, expectedScore }));

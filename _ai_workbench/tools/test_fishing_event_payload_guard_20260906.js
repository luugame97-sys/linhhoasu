'use strict';
const path = require('path');
const assert = require('assert/strict');
const root = path.resolve(process.argv[2]);
const app = path.join(root, 'app');
process.env.CONFIG_BIN_PATH = path.join(root, 'server.bin');
process.env.NODE_ENV = 'test';
process.env.LOG_DIR = '';
const loggerPath = require.resolve(path.join(app, 'src/logger'));
require.cache[loggerPath] = { id: loggerPath, filename: loggerPath, loaded: true, exports: { info(){},warn(){},error(){},debug(){} } };
require(path.join(app, 'src/services/ConfigService')).loadAllTables();
const schedule = require(path.join(app, 'src/services/FishingEventSchedule'));
const rules = require(path.join(app, 'src/config/fishingGameplayBalance.json'));
const anchor = Date.parse(rules.schedule.anchor);
let now = anchor + 1000;
Date.now = () => now;
const checks = [];
function test(name, fn) { fn(); checks.push({ name, result: 'PASS' }); }
for (const [name, value] of [['missing_fishInfo', undefined], ['null_fishInfo', null], ['missing_eventStats', {}], ['empty_eventStats', {eventStats:{}}]]) {
  test('active_contest_payload_' + name, () => {
    const player = { level: 116, ...(value === undefined ? {} : {fishInfo:value}) };
    const before = JSON.stringify(player);
    assert.deepEqual(schedule.taskRows(player), []);
    assert.equal(JSON.stringify(player), before, 'Read-only payload must not seed or reset events');
  });
}
test('initialized_contest_still_returns_eight_tasks', () => {
  const player = {level:116};
  schedule.sync(player);
  const before = JSON.stringify(player);
  assert.equal(schedule.taskRows(player).length, 8);
  assert.equal(JSON.stringify(player), before);
});
test('missing_state_safe_before_open_and_after_close', () => {
  now = anchor - 1;
  assert.deepEqual(schedule.taskRows({level:116}), []);
  now = anchor + 90 * 86400000;
  assert.deepEqual(schedule.taskRows({level:116}), []);
});
console.log(JSON.stringify({result:'PASS',count:checks.length,checks,productionWrites:0}));

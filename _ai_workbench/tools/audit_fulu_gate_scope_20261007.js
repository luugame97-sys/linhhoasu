'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const root = path.resolve(__dirname, '../..');
const goal = path.join(root, '_ai_workbench/temp/event_goal_20261007');
const qa = JSON.parse(fs.readFileSync(path.join(goal, 'baseline.json'), 'utf8')).qa;
const tables = Object.fromEntries(['ActivityConfig', 'ActivityShopConfig', 'Activity30Config'].map(name => [name,
  JSON.parse(fs.readFileSync(path.join(root, 'linhhoasu/lhs/newServer/scripts/_tables_dump', name + '.json'), 'utf8')).data]));
const policy = JSON.parse(fs.readFileSync(path.join(root, 'linhhoasu/lhs/newServer/src/config/eventRotation.json'), 'utf8'));
const mod = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(goal, 'phase_ab/candidate/lhs/newServer/src/services/EventExposureGate.js'), 'utf8'), {
  module: mod, exports: mod.exports, require: name => name.endsWith('eventRotation.json') ? policy : { get: name => tables[name] },
});
const gate = mod.exports;
const session = { userId: qa.userId, player: { playerId: qa.playerId, serverId: 1001, taskInfo: {}, activityInfo: { datas: [] } } };
assert.equal(gate.rejectOperate({ id: 52001, module: 1, index: 1 }, session, 1), null);
assert.equal(gate.rejectTasks({ ids: [75001], type: 52001 | (1 << 30) }, session, 2), null);
const shopIds = Object.keys(tables.ActivityShopConfig[52001] || {});
const fuluShopOutcomes = shopIds.map(id => ({ id, blocked: !!gate.rejectShop({ require: { [id]: 1 } }, session, 3) }));
assert.equal(fuluShopOutcomes.some(row => row.blocked), false);
const other = [21001, 27001, 30001].map(id => ({ id, blocked: !!gate.rejectOperate({ id, module: 1, index: 0 }, session, 4) }));
assert(other.every(row => row.blocked));
console.log(JSON.stringify({ qaFuluOperate: 'allowed', qaFuluTask: 'allowed', fuluShopOutcomes, other,
  conclusion: 'Exact source policy permits QA Fulu; identical toast alone cannot identify denied background RPC. Need tag/id or task group capture.' }));

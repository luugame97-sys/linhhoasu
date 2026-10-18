#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const appRoot = process.env.FORTUNE_APP_ROOT
  ? path.resolve(process.env.FORTUNE_APP_ROOT)
  : path.join(repoRoot, '_ai_workbench', 'temp', 'fortune_event_full_candidate_20260902', 'app');
const config = require(path.join(appRoot, 'src', 'services', 'ConfigService'));
const playerService = require(path.join(appRoot, 'src', 'services', 'PlayerService'));
const progress = require(path.join(appRoot, 'src', 'services', 'MainTaskProgressService'));
const Player = require(path.join(appRoot, 'src', 'db', 'models', 'Player'));

const original = {
  get: config.get,
  findOne: Player.findOne,
  updateOne: Player.collection.updateOne,
};

const ACTIVITY_ID = 43001;
const activityType = ACTIVITY_ID | (1 << 30);
const taskRows = {
  61004: { id: 61004, type: 6, updateCycle: 1, activeId: 13, taskValue1: 100, taskValue2: 4 },
  61005: { id: 61005, type: 6, updateCycle: 1, activeId: 44, taskValue1: 50, taskValue2: 0 },
  61006: { id: 61006, type: 6, updateCycle: 1, activeId: 13, taskValue1: 50, taskValue2: 55 },
};
const activityTasks = Object.fromEntries(Object.keys(taskRows).map((id) => [id, { taskId: Number(id) }]));

config.get = (name) => ({
  TaskConfig: taskRows,
  Activity43TaskConfig: { [ACTIVITY_ID]: activityTasks },
  Activity44TaskConfig: {},
  RoleStageConfig: {},
  BoxTierConfig: {},
}[name] || {});

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function player() {
  const tasks = Object.fromEntries(Object.keys(taskRows).map((id) => [id, {
    id: Number(id), type: activityType, status: 10, progress: 0, target: taskRows[id].taskValue1,
  }]));
  return {
    userId: 'consumption-test', playerId: 'role-test', name: 'test', level: 60,
    items: { 4: 200, 55: 100, 65: 100 }, currencies: { diamond: 0, silver: 0, gold: 100 },
    taskInfo: { tasks, tasksMap: { [activityType]: Object.values(tasks) } },
    activityInfo: { datas: [{ id: ACTIVITY_ID }] }, roleInfo: {}, other_attr_info: { mainTaskProgress: {} },
  };
}

async function run() {
  let stored = player();
  let writes = 0;
  Player.findOne = () => ({ maxTimeMS: () => ({ lean: async () => clone(stored) }) });
  Player.collection.updateOne = async (_filter, update) => {
    writes += 1;
    stored = clone({ ...stored, ...(update && update.$set ? update.$set : {}) });
    return { matchedCount: 1 };
  };

  const loaded = await playerService.loadPlayer(stored.userId);
  progress.refreshMainTaskProgress(loaded);
  loaded.items[4] -= 100;
  loaded.items[65] -= 50;
  loaded.items[55] -= 50;
  await playerService.savePlayer(loaded.userId, loaded, { returnSaved: false });

  assert.equal(writes, 1);
  assert.equal(stored.taskInfo.tasks['61004'].status, 20);
  assert.equal(stored.taskInfo.tasks['61005'].status, 20);
  assert.equal(stored.taskInfo.tasks['61006'].status, 20);
  assert.equal(stored.other_attr_info.mainTaskProgress.itemConsume['4'], 100);
  assert.equal(stored.other_attr_info.mainTaskProgress.itemConsume['65'], 50);
  assert.equal(stored.other_attr_info.mainTaskProgress.itemConsume['55'], 50);

  await playerService.savePlayer(loaded.userId, loaded, { returnSaved: false });
  assert.equal(stored.other_attr_info.mainTaskProgress.itemConsume['4'], 100, 'same snapshot was double-counted');

  console.log(JSON.stringify({ result: 'PASS', checks: 8, trackedItems: [4, 55, 65] }));
}

run().finally(() => {
  config.get = original.get;
  Player.findOne = original.findOne;
  Player.collection.updateOne = original.updateOne;
}).catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});

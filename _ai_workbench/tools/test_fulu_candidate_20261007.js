'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '../..');
const base = path.join(root, '_ai_workbench/temp/event_goal_20261007/fulu');
const clone = value => JSON.parse(JSON.stringify(value));
const tables = Object.fromEntries(['Activity52Config', 'Activity52ArrangeConfig'].map(name => [name,
  JSON.parse(fs.readFileSync(path.join(root, 'linhhoasu/lhs/newServer/scripts/_tables_dump', name + '.json'), 'utf8')).data]));
tables.ActivityConfig = { 52001: { activityType: 52 } };
tables.TaskConfig = JSON.parse(fs.readFileSync(path.join(root, 'linhhoasu/lhs/newServer/scripts/_tables_dump/TaskConfig.json'), 'utf8')).data;
const initialTables = clone(tables);
const receipts = require(path.join(base, 'before/services/FeatureReceiptService.js'));
const locks = require(path.join(base, 'before/services/PlayerMutationService.js'));
let persisted, failSave, saveCount, saveHook;
const session = { userId: 'ram-only' };
const playerService = {
  drainPendingSaves: async () => {},
  loadPlayer: async () => clone(persisted),
  savePlayer: async (_id, draft, options) => {
    if (saveHook) saveHook();
    if (failSave === 'throw') throw Error('INJECTED_SAVE_FAILURE');
    if (failSave === 'null') return null;
    for (const field of options.activity52CAS.fields) {
      assert.equal(JSON.stringify(persisted[field]), JSON.stringify(options.activity52CAS.expected[field]), 'CAS guard ' + field);
    }
    saveCount++;
    for (const field of options.onlyFields) persisted[field] = clone(draft[field]);
    if (failSave === 'afterCommit') throw Error('INJECTED_ACK_LOSS_AFTER_COMMIT');
    return draft;
  },
};
const runtime = { getWsServer: () => ({ getPlayerForMutation: () => session.player, invalidatePlayerForMutation() {} }) };
const rewardGrant = {
  assertRewardRowsSupported: rows => { assert(rows.length); },
  grantRewardRow: () => ({ kind: 'item' }),
  buildNativeSyncPackets: () => [],
};
function load(file, dependencies) {
  const module = { exports: {} };
  const context = { module, exports: module.exports, console, Math, Date, Set, Map, process,
    __dirname: path.dirname(file), setTimeout, clearTimeout,
    require: name => dependencies[name] || {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  return module.exports;
}
const service = load(path.join(base, 'candidate/services/Activity52Service.js'), {
  './PlayerMutationService': locks, './PlayerService': playerService,
  './FeatureReceiptService': receipts, './RuntimeBus': runtime,
});
const realRewardSync = load(path.join(root, 'linhhoasu/lhs/newServer/src/services/RewardSync.js'), {
  './CurrencySync': { syncCurrencyItems() {} }, './NativeItemRewardService': { getKind: () => null },
});
const taskService = load(process.env.FULU_TASK_SERVICE_FILE || path.join(base, 'candidate/services/Activity52TaskService.js'), {
  './PlayerMutationService': locks, './PlayerService': playerService,
  './FeatureReceiptService': receipts, './RuntimeBus': runtime,
  './ConfigService': { get: name => tables[name] }, './TaskDirtyService': { markTaskDirty() {} },
  './RewardGrantService': rewardGrant, './RewardSync': realRewardSync,
});
const taskReq = ids => ({ ...req(), ids, type: 52001 | (1 << 30), activityId: 52001, dayKey: taskService.dayKey() });
const taskAck = output => Array.isArray(output) ? output.find(p => p.tag === 1000 && p.msgUid === 17) : output;
const payloadApi = load(path.join(base, 'candidate/handlers/playerPayload.js'), {
  '../services/ConfigService': { get: name => tables[name] },
  '../services/TaskPerfService': { nowNs: () => 0, recordTaskNormalizeNs() {} },
  '../services/ActivationPassService': { ensureActivationPassState() {} },
  '../services/FishingEventSchedule': { taskRows: () => [] },
  '../services/Activity52TaskService': taskService,
});
const sideTaskApi = load(path.join(base, 'candidate/services/SideTaskProgressService.js'), {
  './ConfigService': { get: name => tables[name] }, './TaskDirtyService': { markTaskDirty() {} },
  './Activity52TaskService': taskService,
});
const mainTaskApi = load(path.join(base, 'candidate/services/MainTaskProgressService.js'), {
  './ConfigService': { get: name => tables[name] }, './TaskDirtyService': { markTaskDirty() {} },
  './Activity52TaskService': taskService, '../handlers/playerPayload': payloadApi,
  './EquipService': { ensureEquipInfo: () => ({}) }, './SpiritProgressService': { getHistoricalSpiritUpgradeCount: () => 0 },
});
const realmTaskApi = load(path.join(base, 'before/services/RealmTaskProgressService.js'), {
  './ConfigService': { get: name => tables[name] }, './TaskDirtyService': { markTaskDirty() {} },
  '../handlers/playerPayload': payloadApi, './SpiritProgressService': { getHistoricalSpiritUpgradeCount: () => 0 },
});
const api = load(path.join(base, 'candidate/handlers/activity.js'), {
  '../services/ConfigService': { get: name => tables[name] },
  '../services/PlayerService': playerService,
  '../services/Activity52Service': service,
  '../services/RewardGrantService': rewardGrant,
  '../services/RewardSync': realRewardSync,
  './raid': { addRewardToPlayer: (p, id, count) => { p.items[id] = (p.items[id] || 0) + count; } },
});
function reset() {
  Object.keys(tables).forEach(k => delete tables[k]); Object.assign(tables, clone(initialTables));
  persisted = { userId: 'ram-only', level: 135, items: { 233: 1000 }, currencies: {}, other_attr_info: {},
    activityInfo: { datas: [{ id: 52001, record: 1, score: 0, records: {}, startTime: Date.now() - 10000, endTime: Date.now() + 86400000 }] } };
  session.player = clone(persisted); failSave = null; saveCount = 0; saveHook = null;
}
let serial = 0;
const req = (module = 1, index = 1) => ({ id: 52001, module, index, requestId: `${Date.now()}-ramtest_${++serial}`,
  cycleKey: `52001:${persisted.activityInfo.datas[0]?.startTime || 1}:${persisted.activityInfo.datas[0]?.endTime || 2}` });
const run = p => api.handleActivityOperate(p, session, 17);
const ack = output => Array.isArray(output) ? output.find(p => p.tag === 1700) : output;
let tests = 0;
async function test(name, work) { reset(); await work(); tests++; console.log('PASS ' + name); }
async function runTests() {
  await test('draw charges once and updates persisted score/records', async () => {
    const output = await run(req(1, 5));
    assert.equal(ack(output).data.result, 0);
    const sync = output.find(packet => packet.tag === 1202).data;
    assert.equal(sync.items.find(item => item.id === 233).count, -5);
    assert.equal(sync.changed.find(item => item.id === 233).count, 995);
    assert.equal(persisted.items[233], 995); assert.equal(persisted.activityInfo.datas[0].score, 5);
    assert.equal(persisted.activityInfo.datas[0].records[1], 5);
  });
  for (const mutation of [() => delete tables.Activity52ArrangeConfig[52001], () => delete tables.Activity52Config[52001],
    () => { tables.Activity52ArrangeConfig[52001][1][1].rewards[0].weight = 0; }]) {
    await test('invalid config does not consume/save', async () => {
      mutation(); const before = clone(persisted); assert.notEqual(ack(await run(req())).data.result, 0);
      assert.deepEqual(persisted, before); assert.equal(saveCount, 0);
    });
  }
  for (const [module, index] of [[1, 0], [1, 6], [1, 1.5], [3, 1], [0, 0], [0, 6], [2, 1]]) {
    await test(`invalid request ${module}/${index}`, async () => { assert.notEqual(ack(await run(req(module, index))).data.result, 0); assert.equal(saveCount, 0); });
  }
  await test('insufficient cost leaves state unchanged', async () => {
    persisted.items[233] = 0; const before = clone(persisted);
    assert.notEqual(ack(await run(req())).data.result, 0); assert.deepEqual(persisted, before);
  });
  await test('legacy client without nonce/cycle fails closed', async () => {
    const input = req(); delete input.requestId;
    assert.equal(ack(await run(input)).data.reason, 'FULU_CLIENT_RELOAD_REQUIRED');
    assert.equal(saveCount, 0);
  });
  await test('old cycle request cannot spend on current cycle', async () => {
    const input = req(); input.cycleKey = '52001:1:2';
    assert.equal(ack(await run(input)).data.reason, 'FULU_CYCLE_CHANGED'); assert.equal(saveCount, 0);
  });
  await test('claim respects threshold and triggerTimes', async () => {
    persisted.activityInfo.datas[0].records = { 1: 160, 2: 0 };
    assert.equal(ack(await run(req(2, 0))).data.result, 0); assert.equal(ack(await run(req(2, 0))).data.result, 0);
    assert.notEqual(ack(await run(req(2, 0))).data.result, 0); assert.equal(persisted.items[93022], 2);
  });
  await test('guarantee rejects multi, forces grand prize and resets meter', async () => {
    persisted.activityInfo.datas[0].score = 80;
    assert.notEqual(ack(await run(req(1, 5))).data.result, 0);
    const output = await run(req()); assert.equal(ack(output).data.result, 0);
    assert.equal(persisted.activityInfo.datas[0].score, 0);
    assert.equal(Math.max(...Object.values(output.find(p => p.tag === 1775).data.colorCount)), 5);
  });
  await test('79 plus5 keeps84 before next guaranteed draw', async () => {
    persisted.activityInfo.datas[0].score = 79; await run(req(1, 5)); assert.equal(persisted.activityInfo.datas[0].score, 84);
  });
  await test('matching color grants seeds scaled by display and multiplier', async () => {
    const random = Math.random;
    try {
      Math.random = () => 0;
      persisted.activityInfo.datas[0].record = 2;
      persisted.activityInfo.datas[0].score = 10;
      const output = await run(req(1, 5));
      assert.equal(ack(output).data.result, 0); assert.equal(persisted.items[232], 250);
      assert.equal(persisted.activityInfo.datas[0].score, 15, 'natural jackpot does not reset luck');
    } finally { Math.random = random; }
  });
  await test('concurrent same receipt only charges once', async () => {
    const input = req(); const output = await Promise.all([run(input), run(input)]);
    assert.equal(saveCount, 1); assert.equal(persisted.items[233], 999); assert.equal(ack(output[1]).data.replayed, true);
    const sync = output[1].find(packet => packet.tag === 1202).data;
    assert.equal(sync.items.length, 0); assert.equal(sync.changed.find(item => item.id === 233).count, 999);
  });
  await test('receipt conflict rejected', async () => {
    const input = req(); await run(input); assert.notEqual(ack(await run({ ...input, index: 2 })).data.result, 0); assert.equal(saveCount, 1);
  });
  for (const failure of ['null', 'throw']) await test('failed save ' + failure + ' never publishes mutation', async () => {
    failSave = failure; const before = clone(persisted); await assert.rejects(run(req())); assert.deepEqual(persisted, before); assert.equal(session.player, null);
  });
  await test('lost ACK after commit is recovered by persisted receipt without repeat debit', async () => {
    const input = req(); failSave = 'afterCommit'; await assert.rejects(run(input));
    assert.equal(persisted.items[233], 999); assert.equal(session.player, null);
    session.player = clone(persisted); failSave = null;
    assert.equal(ack(await run(input)).data.replayed, true); assert.equal(saveCount, 1);
    assert.equal(persisted.items[233], 999);
  });
  await test('concurrent external mutation trips CAS and does not overwrite external economy', async () => {
    saveHook = () => { persisted.items[233] = 25; };
    await assert.rejects(run(req())); assert.equal(persisted.items[233], 25); assert.equal(saveCount, 0);
  });
  await test('expired/absent cycle does not get upserted', async () => {
    persisted.activityInfo.datas = []; assert.notEqual(ack(await run(req())).data.result, 0); assert.equal(saveCount, 0);
  });
  await test('receipt after cycle change never reapplies old row or reward', async () => {
    const input = req(); await run(input);
    persisted.activityInfo.datas[0].startTime += 1;
    persisted.activityInfo.datas[0].score = 0;
    const result = await run(input);
    assert.equal(ack(result).data.replayed, true); assert.equal(ack(result).data.datas[0].score, 0);
    assert.equal(result.some(packet => packet.tag === 1775), false); assert.equal(saveCount, 1);
  });
  await test('stale session loads latest persisted economy', async () => {
    session.player.items[233] = 999999; persisted.items[233] = 1;
    session.player.level = 190; persisted.level = 191;
    assert.equal(ack(await run(req())).data.result, 0); assert.equal(persisted.items[233], undefined);
    assert.equal(session.player.level, 191);
  });
  await test('real PlayerService emits atomic CAS including activity and only changed fields', async () => {
    let sentFilter, sentUpdate;
    const playerApi = load(path.join(base, 'candidate/services/PlayerService.js'), {
      fs, path, '../logger': { warn() {} },
      '../db/models/Player': { collection: { updateOne: async (filter, update) => {
        sentFilter = filter; sentUpdate = update; return { matchedCount: 1 };
      } } },
      './CurrencySync': { syncCurrencyItems() {} },
      './TaskDirtyService': { getTaskSyncMeta: () => null, attachTaskSyncMeta: p => p },
    });
    const before = clone(persisted); const draft = clone(before); draft.items[233]--;
    const fields = ['items', 'activityInfo', 'currencies', 'other_attr_info', 'level', 'petInfo'];
    const saved = await playerApi.savePlayer('ram-only', draft, { returnSaved: false,
      onlyFields: ['items'], activity52CAS: { fields, expected: before } });
    assert(saved);
    assert.equal(sentFilter.$and.length, fields.length);
    assert.equal(JSON.stringify(sentFilter.$and.find(x => x.activityInfo).activityInfo.$eq), JSON.stringify(before.activityInfo));
    assert.equal(sentFilter.$and.find(x => x.petInfo).petInfo.$exists, false);
    assert.deepEqual(Object.keys(sentUpdate.$set).sort(), ['items', 'updatedAt']);
  });
  await test('Fulu daily tasks seed five exact config targets, only login complete', async () => {
    const rows = taskService.taskRows(persisted);
    assert.equal(rows.length, 5); assert.equal(rows.find(t => t.id === 75001).status, 20);
    assert.equal(rows.find(t => t.id === 75004).target, 100);
    assert.equal(rows.filter(t => t.status === 10).length, 4);
  });
  await test('daily progress uses post-baseline counters and verified54 only', async () => {
    persisted.other_attr_info.mainTaskProgress = { itemConsume: { 4: 3000 }, arenaChallengeCount: 200 };
    taskService.taskRows(persisted);
    assert.equal(taskService.recordProgress(persisted, 54, 1, {}), false);
    assert.equal(taskService.recordProgress(persisted, 54, 1, { battleUid: 'verified4502' }), true);
    assert.equal(taskService.recordProgress(persisted, 54, 1, { battleUid: 'verified4502' }), false);
    persisted.other_attr_info.mainTaskProgress.itemConsume[4] += 100;
    persisted.other_attr_info.mainTaskProgress.arenaChallengeCount += 3;
    persisted.items[19] = 80;
    const rows = taskService.taskRows(persisted);
    assert.equal(rows.filter(t => t.status === 20).length, 5);
  });
  await test('Fulu claim unfinished denied, login once, replay no new delta', async () => {
    const bad = await taskService.claim(taskReq([75002]), session, 17);
    assert.notEqual(taskAck(bad).data.result, 0); assert.equal(saveCount, 0);
    const input = taskReq([75001]);
    const first = await taskService.claim(input, session, 17);
    assert.equal(taskAck(first).data.result, 0); assert.equal(persisted.items[233], 1001);
    const second = await taskService.claim(input, session, 17);
    assert.equal(taskAck(second).data.replayed, true);
    assert.equal(second.find(p => p.tag === 1202).data.items.length, 0); assert.equal(persisted.items[233], 1001);
    assert.notEqual(taskAck(await taskService.claim(taskReq([75001]), session, 17)).data.result, 0);
  });
  await test('daily task ledger resets on actual GMT+7 next day', async () => {
    taskService.taskRows(persisted);
    const row = persisted.other_attr_info.fuluTaskLedger[52001]; row.claimed.push(75001); row.battleCount = 1;
    const now = Date.now(); persisted.activityInfo.datas[0].endTime = now + 86400000 * 3;
    taskService.taskRows(persisted, now); persisted.other_attr_info.fuluTaskLedger[52001].claimed.push(75001);
    assert.equal(taskService.taskRows(persisted, now).find(t => t.id === 75001).status, 30);
    assert.equal(taskService.taskRows(persisted, now + 86400000).find(t => t.id === 75001).status, 20);
    assert.equal(taskService.taskRows(persisted, now + 86400000).find(t => t.id === 75002).progress, 0);
  });
  await test('task claim save failure never grants inventory or claim flag', async () => {
    const before = clone(persisted); failSave = 'null';
    await assert.rejects(taskService.claim(taskReq([75001]), session, 17));
    assert.deepEqual(persisted, before); assert.equal(session.player, null);
  });
  await test('task legacy/mismatched cycle fails closed', async () => {
    const input = taskReq([75001]); delete input.requestId;
    assert.equal(taskAck(await taskService.claim(input, session, 17)).data.reason, 'FULU_CLIENT_RELOAD_REQUIRED');
    const old = taskReq([75001]); old.dayKey--;
    assert.equal(taskAck(await taskService.claim(old, session, 17)).data.reason, 'FULU_TASK_CYCLE_CHANGED');
  });
  await test('task mixed IDs rejected and same-day previous claimed state preserved', async () => {
    assert.equal(taskAck(await taskService.claim(taskReq([75001, 10001]), session, 17)).data.reason, 'FULU_TASK_INPUT_INVALID');
    persisted.taskInfo = { dailyTaskDayKey: taskService.dayKey(), tasks: { 75001: { id: 75001, status: 30 } } };
    assert.equal(taskService.taskRows(persisted).find(task => task.id === 75001).status, 30);
    assert.equal(saveCount, 0);
  });
  await test('task receipt after cycle rollover does not mark new tasks claimed', async () => {
    const input = taskReq([75001]); await taskService.claim(input, session, 17);
    persisted.activityInfo.datas[0].startTime++;
    const result = await taskService.claim(input, session, 17);
    assert.equal(taskAck(result).data.reason, 'FULU_TASK_CYCLE_CHANGED');
    assert.equal(persisted.items[233], 1001); assert.equal(saveCount, 1);
  });
  await test('real playerPayload normalize preserves scoped Fulu group and claimed tasks', async () => {
    const info = payloadApi.normalizeTaskInfo({}, {}, persisted);
    assert.equal(info.tasksMap[52001 | (1 << 30)].length, 5);
    assert.equal(info.tasks[75001].status, 20);
    persisted.other_attr_info.fuluTaskLedger[52001].claimed.push(75001);
    const again = payloadApi.normalizeTaskInfo(info, {}, persisted);
    assert.equal(again.tasks[75001].status, 30);
    assert.equal(again.tasksMap[52001 | (1 << 30)].length, 5);
    const realmLegacy = payloadApi.normalizeTaskInfo(again, {});
    assert.equal(realmLegacy.tasks[75001].status, 30);
    assert.equal(realmLegacy.tasksMap[52001 | (1 << 30)].length, 5);
  });
  await test('real MainTask and SideTask hooks deliver Fulu progress without OldTrek', async () => {
    tables.TaskConfig = Object.fromEntries(taskService.IDS.map(id => [id, tables.TaskConfig[id]]));
    persisted.taskInfo = payloadApi.normalizeTaskInfo({}, {}, persisted);
    assert.equal(mainTaskApi.addItemConsume(persisted, 4, 100), true);
    assert.equal(mainTaskApi.addArenaChallengeCount(persisted, 3), true);
    assert.equal(sideTaskApi.recordProgress(persisted, 54, 1, { battleUid: 'actual-hook4502' }), true);
    assert.equal(persisted.taskInfo.tasks[75004].status, 20);
    assert.equal(persisted.taskInfo.tasks[75005].status, 20);
    assert.equal(persisted.taskInfo.tasks[75002].status, 20);
  });
  await test('WSServer main->realm refresh order preserves Fulu tasks after claim', async () => {
    tables.RoleStageConfig = { 1: { taskGroup: [45001] } };
    tables.TaskConfig[45001] = { id: 45001, type: 4, activeId: 6, taskValue1: 1 };
    await taskService.claim(taskReq([75001]), session, 17);
    mainTaskApi.refreshMainTaskProgress(session.player);
    realmTaskApi.refreshRealmStageTasks(session.player);
    assert.equal(session.player.taskInfo.tasks[75001].status, 30);
    assert.equal(session.player.taskInfo.tasksMap[52001 | (1 << 30)].length, 5);
    const again = JSON.parse(JSON.stringify(session.player));
    again.taskInfo = payloadApi.normalizeTaskInfo(again.taskInfo, {}, again);
    assert.equal(again.taskInfo.tasks[75001].status, 30, 'relog derives claimed state from ledger');
  });
  await test('complete player context still removes tasks when Fulu event is closed', async () => {
    persisted.taskInfo = payloadApi.normalizeTaskInfo({}, {}, persisted);
    persisted.activityInfo.datas[0].endTime = Date.now() - 1;
    const info = payloadApi.normalizeTaskInfo(persisted.taskInfo, {}, persisted);
    assert.equal(info.tasks[75001], undefined);
    assert.equal(info.tasksMap[52001 | (1 << 30)], undefined);
  });
  await test('native task claim -> real RAM task transaction -> native Fulu draw', async () => {
    persisted.items[233] = 0; session.player = clone(persisted);
    const { harness } = require('./test_fulu_safe_client_20261007.js');
    let pending, h;
    h = harness({ row: clone(persisted.activityInfo.datas[0]), tasks: taskService.taskRows(persisted),
      transport({ tag, payload, success, failure }) {
        pending = (async () => {
          const output = tag === 1000 ? await taskService.claim(payload, session, 71) : await api.handleActivityOperate(payload, session, 71);
          for (const packet of Array.isArray(output) ? output : [output]) {
            if (packet.tag === 1202) { const item = packet.data.changed?.find(item => item.id === 233); if (item) h.setItem233(item.count); }
            else if (packet.tag === 1000 && packet.data.task) h.taskModel.onTaskUpdate(packet.data);
            else if (packet.tag === 1701) h.model.OnActivityDataUpdate(packet.data);
            else if (packet.tag === 1775) h.panel.onDrawResult(packet.data);
            if (packet.tag === tag && packet.msgUid === 71) success(packet.data);
          }
        })();
      },
    });
    h.setItem233(0);
    h.taskModel.sendAllTaskRewardByActivityId(52001);
    await pending;
    assert.equal(persisted.items[233], 1); assert.equal(h.getItem233(), 1);
    assert.equal(h.tasks.find(task => task.id === 75001).status, 30);
    h.panel.onSummonBtnClick(); await pending;
    assert.equal(persisted.items[233], undefined); assert.equal(h.getItem233(), 0);
    assert.equal(persisted.activityInfo.datas[0].records[1], 1);
    assert.ok(h.panel.rendered);
  });
  console.log(JSON.stringify({ tests, result: 'PASS', productionWrites: 0, scope: 'RAM only; reward grant and save mocked' }));
}
module.exports = { reset, session, api, taskService, payloadApi, mainTaskApi, sideTaskApi, tables,
  getPersisted: () => clone(persisted),
  setPersisted: player => { persisted = clone(player); session.player = clone(player); },
};
if (require.main === module) runTests().catch(error => { console.error(error); process.exitCode = 1; });

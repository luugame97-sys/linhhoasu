'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const appRoot = path.resolve(
  process.env.ACTIVATION_PASS_APP_ROOT
  || path.join(__dirname, '../../linhhoasu/lhs/newServer')
);
process.env.CONFIG_BIN_PATH = path.resolve(
  process.env.ACTIVATION_PASS_CONFIG
  || path.join(__dirname, '../../linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin')
);

const config = require(path.join(appRoot, 'src/services/ConfigService'));
const activation = require(path.join(appRoot, 'src/services/ActivationPassService'));
const resolver = require(path.join(appRoot, 'src/services/RechargeRewardResolver'));
const benefits = require(path.join(appRoot, 'src/services/RechargeBenefitService'));
const serverConfig = require(path.join(appRoot, 'src/services/ServerConfigService'));
const playerService = require(path.join(appRoot, 'src/services/PlayerService'));

serverConfig.getCurrentRechargeArea = async () => 1;
playerService.savePlayerDeferred = async () => null;

const activity = require(path.join(appRoot, 'src/handlers/activity'));
const compat = require(path.join(appRoot, 'src/handlers/compat'));
const task = require(path.join(appRoot, 'src/handlers/task'));
const playerPayload = require(path.join(appRoot, 'src/handlers/playerPayload'));

const DAY_MS = activation.DAY_MS;
const T0 = Date.now() - 1000;
let assertions = 0;

function ok(value, message) {
  assert(value, message);
  assertions += 1;
}

function equal(actual, expected, message) {
  assert.equal(actual, expected, message);
  assertions += 1;
}

function deepEqual(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
}

function packets(value) {
  return Array.isArray(value) ? value : [value];
}

function makePlayer(options = {}) {
  return {
    userId: options.userId || '',
    playerId: options.playerId || 'fixture',
    name: options.name || 'fixture',
    level: options.level == null ? 20 : options.level,
    items: { 19: options.points == null ? 0 : options.points, 1001: options.tokens == null ? 1000 : options.tokens },
    currencies: { diamond: 0, silver: 0, gold: 0 },
    rechargeInfo: {
      area: options.area == null ? 1 : options.area,
      records: options.rechargeRecords || [],
    },
    activityInfo: { datas: options.datas || [], disabledEntryIds: [] },
    taskInfo: options.taskInfo || {},
  };
}

function currentRow(player) {
  return (player.activityInfo.datas || []).find((row) => [7001, 7051].includes(Number(row.id)));
}

function itemCount(player, id) {
  if (Number(id) === 1) return Number(player.currencies.diamond || 0);
  if (Number(id) === 2) return Number(player.currencies.silver || 0);
  if (Number(id) === 6) return Number(player.currencies.gold || 0);
  return Number(player.items[id] || 0);
}

async function main() {
  config.loadAllTables();

  const catalog = activation.listCandidates();
  deepEqual(catalog.map((row) => row.id), [7001, 7051], 'catalog activity IDs');
  deepEqual(catalog.map((row) => row.payId), [10301, 10301], 'catalog pay IDs');
  equal(activation.getCycleDurationMs(7001), 7 * DAY_MS, 'seven-day cycle');
  equal(activation.getMaxScore(7001), 600, 'max score');

  const locked = makePlayer({ level: 14 });
  equal(activation.ensureActivationPassState(locked, { now: T0 }), null, 'level gate');

  const s1 = makePlayer({ area: 1, points: 40 });
  const s2 = makePlayer({ area: 2, points: 40 });
  equal(activation.ensureActivationPassState(s1, { now: T0 }).activityId, 7001, 'S1 activity');
  equal(activation.ensureActivationPassState(s2, { now: T0 }).activityId, 7051, 'S2 activity');
  equal(currentRow(s1).score, 40, 'initial score');
  equal(currentRow(s2).score, 40, 'initial S2 score');

  const legacy = makePlayer({
    points: 80,
    rechargeRecords: [{ id: 10301, count: 4 }],
    datas: [{
      id: 7001, record: 1, startTime: T0 - DAY_MS, endTime: T0 + DAY_MS,
      score: 80, recordList: [], records: { 0: 3, 40: 3 }, buyRecords: {}, extra: {},
    }],
  });
  const legacyState = activation.ensureActivationPassState(legacy, { now: T0 });
  deepEqual(legacyState.row.recordList, [10301], 'legacy entitlement self-heal');
  equal(legacyState.row.records[0], 3, 'legacy reward ledger retained');
  equal(legacyState.row.records[40], 3, 'legacy premium ledger retained');

  const fresh = makePlayer({ points: 20 });
  const freshState = activation.ensureActivationPassState(fresh, { now: T0 });
  deepEqual(freshState.row.recordList, [], 'fresh account is not entitled');
  equal(freshState.row.score, 20, 'fresh initial points retained');
  fresh.items[19] = 70;
  activation.ensureActivationPassState(fresh, { now: T0 + 1000 });
  equal(currentRow(fresh).score, 70, 'same-day delta accumulated');
  fresh.items[19] = 0;
  activation.ensureActivationPassState(fresh, { now: T0 + 2000 });
  equal(currentRow(fresh).score, 70, 'daily counter reset does not erase cycle score');
  fresh.items[19] = 40;
  activation.ensureActivationPassState(fresh, { now: T0 + 3000 });
  equal(currentRow(fresh).score, 110, 'next-day points accumulate');

  const cycle = makePlayer({ points: 200 });
  let cycleState = activation.ensureActivationPassState(cycle, { now: T0 });
  activation.activateActivationPassForPayId(cycle, 10301, T0);
  cycleState.row.records = { 0: 3, 40: 3, 80: 3 };
  equal(activation.hasActivationPassEntitlement(cycle, 10301, T0 + DAY_MS), true, 'entitlement active in cycle');
  activation.ensureActivationPassState(cycle, { now: T0 + 7 * DAY_MS - 1 });
  equal(currentRow(cycle).records[80], 3, 'ledger retained before boundary');
  cycle.items[19] = 0;
  cycleState = activation.ensureActivationPassState(cycle, { now: T0 + 7 * DAY_MS });
  equal(cycleState.rolledOver, true, 'rollover detected');
  equal(cycleState.row.score, 0, 'score reset at rollover');
  deepEqual(cycleState.row.records, {}, 'reward ledger reset at rollover');
  deepEqual(cycleState.row.recordList, [], 'entitlement reset at rollover');
  equal(activation.hasActivationPassEntitlement(cycle, 10301, T0 + 7 * DAY_MS), false, 'old recharge record does not reactivate new cycle');
  activation.ensureActivationPassState(cycle, { now: T0 + 7 * DAY_MS + 1 });
  deepEqual(currentRow(cycle).recordList, [], 'rollover remains stable');

  const planPlayer = makePlayer();
  equal(resolver.resolveRechargeRewards(planPlayer, { route: 'token', payId: 10301 }).reason,
    'ACTIVATION_PASS_REQUIRES_ACTIVITY_RESOLVER', 'specialized owner required');
  const tokenPlan = resolver.resolveRechargeRewards(planPlayer, {
    route: 'token', payId: 10301, multi: 1, allowActivationPass: true,
  });
  equal(tokenPlan.ok, true, 'token plan allowed');
  equal(tokenPlan.specialized, 'activation-pass', 'token plan family');
  deepEqual(tokenPlan.rows, [], 'activation-only has no immediate rewards');
  equal(resolver.resolveRechargeRewards(planPlayer, {
    route: 'token', payId: 10301, multi: 2, allowActivationPass: true,
  }).reason, 'INVALID_MULTI', 'multi purchase blocked');
  equal(resolver.resolveRechargeRewards(planPlayer, {
    route: 'cash', payId: 10301, multi: 1, amount: 68, allowActivationPass: true,
  }).ok, true, 'cash amount accepted');
  equal(resolver.resolveRechargeRewards(planPlayer, {
    route: 'cash', payId: 10301, multi: 1, amount: 67, allowActivationPass: true,
  }).reason, 'AMOUNT_MISMATCH', 'cash amount mismatch blocked');

  const buy = makePlayer({ points: 80, tokens: 1000 });
  const beforeBuy = buy.items[1001];
  const buyResponse = await compat.handleTokenRecharge1230({ id: 10301, multi: 1 }, { player: buy }, 10);
  const buyPacket = packets(buyResponse).find((packet) => packet && packet.tag === 1230);
  equal(buyPacket.data.result, 0, 'purchase success');
  equal(beforeBuy - buy.items[1001], 68, 'correct token cost');
  equal(buy.rechargeInfo.records[0].count, 1, 'one purchase record');
  deepEqual(currentRow(buy).recordList, [10301], 'entitlement persisted');
  ok(packets(buyResponse).some((packet) => packet && packet.tag === 1701), 'purchase pushes activity update');
  const beforeDuplicate = buy.items[1001];
  const duplicateResponse = await compat.handleTokenRecharge1230({ id: 10301, multi: 1 }, { player: buy }, 11);
  const duplicatePacket = packets(duplicateResponse).find((packet) => packet && packet.tag === 1230);
  equal(duplicatePacket.data.code, 'ALREADY_ACTIVE', 'duplicate purchase blocked');
  equal(buy.items[1001], beforeDuplicate, 'duplicate does not consume token');
  equal(buy.rechargeInfo.records[0].count, 1, 'duplicate does not add record');

  const benefitPlayer = makePlayer({ points: 40 });
  activation.ensureActivationPassState(benefitPlayer, { now: T0 });
  const applied = benefits.applyRechargeBenefits(benefitPlayer, { payId: 10301, now: T0, multi: 1 });
  equal(applied.recordId, 10301, 'benefit record ID');
  ok(applied.activationPassUpdate && applied.activationPassUpdate.row, 'benefit returns activation update');
  deepEqual(applied.activationPassUpdate.row.recordList, [10301], 'benefit activates pass');

  const rollback = makePlayer({ points: 40, tokens: 500, userId: 'rollback' });
  const rollbackBefore = JSON.parse(JSON.stringify(rollback));
  const originalSavePlayer = playerService.savePlayer;
  playerService.savePlayer = async () => { throw new Error('FIXTURE_SAVE_FAILURE'); };
  let rollbackError = '';
  try {
    await compat.handleTokenRecharge1230({ id: 10301, multi: 1 }, { player: rollback, userId: 'rollback' }, 12);
  } catch (error) {
    rollbackError = error.message;
  } finally {
    playerService.savePlayer = originalSavePlayer;
  }
  equal(rollbackError, 'FIXTURE_SAVE_FAILURE', 'save failure surfaced');
  deepEqual(rollback.items, rollbackBefore.items, 'token rollback');
  deepEqual(rollback.rechargeInfo, rollbackBefore.rechargeInfo, 'recharge rollback');
  deepEqual(rollback.activityInfo, rollbackBefore.activityInfo, 'activity rollback');

  const claim = makePlayer({ points: 600 });
  activation.ensureActivationPassState(claim, { now: T0 });
  activation.activateActivationPassForPayId(claim, 10301, T0);
  let claimSuccess = 0;
  for (let index = 0; index < 16; index += 1) {
    const response = await activity.handleActivityOperate(
      { id: 7001, module: 0, index: 0, param: 0 },
      { player: claim },
      100 + index
    );
    const packet = packets(response).find((entry) => entry && entry.tag === 1700);
    if (packet && packet.data && packet.data.result === 0) claimSuccess += 1;
  }
  equal(claimSuccess, 16, 'all 16 stages claimable');
  const thresholds = Object.values(config.get('Activity7Config')[7001][1]).map((row) => Number(row.param));
  equal(thresholds.filter((point) => Number(currentRow(claim).records[point]) === 3).length, 16,
    'all stage ledgers are free plus premium');
  const beforeReplay = JSON.stringify(currentRow(claim).records);
  const replay = await activity.handleActivityOperate(
    { id: 7001, module: 0, index: 0, param: 0 },
    { player: claim },
    200
  );
  const replayPacket = packets(replay).find((entry) => entry && entry.tag === 1700);
  equal(replayPacket.data.result, 1, 'claim replay blocked');
  equal(JSON.stringify(currentRow(claim).records), beforeReplay, 'claim replay leaves ledger unchanged');

  const dayPlayer = makePlayer({ points: 80 });
  activation.ensureActivationPassState(dayPlayer, { now: T0 });
  currentRow(dayPlayer).score = 40;
  currentRow(dayPlayer).extra.activationPass.lastActivityPoint = 40;
  dayPlayer.taskInfo = {
    dailyTaskDayKey: 20200101,
    tasks: { 20001: { id: 20001, type: 2, status: 30, progress: 100, target: 100 } },
    tasksMap: { 2: [{ id: 20001, type: 2, status: 30, progress: 100, target: 100 }] },
    dailyRewardRecords: [20],
  };
  dayPlayer.taskInfo = playerPayload.normalizeTaskInfo(dayPlayer.taskInfo, {}, dayPlayer);
  equal(dayPlayer.items[19], 0, 'daily activity item resets');
  equal(currentRow(dayPlayer).score, 80, 'final prior-day delta retained in pass');
  deepEqual(dayPlayer.taskInfo.dailyRewardRecords, [], 'daily reward ledger resets');
  equal(dayPlayer.taskInfo.tasks['20001'].status, 10, 'daily task resets');

  const taskPlayer = makePlayer({ points: 0 });
  activation.ensureActivationPassState(taskPlayer, { now: T0 });
  const dayKey = playerPayload.getGameDayKey ? playerPayload.getGameDayKey() : dayPlayer.taskInfo.dailyTaskDayKey;
  taskPlayer.taskInfo = playerPayload.normalizeTaskInfo({ dailyTaskDayKey: dayKey }, {}, taskPlayer);
  taskPlayer.taskInfo.tasks['20001'].status = 20;
  taskPlayer.taskInfo.tasks['20001'].progress = 100;
  taskPlayer.taskInfo.tasksMap['2'] = Object.values(taskPlayer.taskInfo.tasks).filter((row) => row.type === 2);
  const taskResponse = await task.handleClaimTaskRewardCompat({ id: 20001, type: 2 }, { player: taskPlayer }, 300);
  equal(taskPlayer.items[19], 10, 'task awards daily activity points');
  equal(currentRow(taskPlayer).score, 10, 'task points immediately update pass score');
  ok(packets(taskResponse).some((packet) => packet && packet.tag === 1701), 'task claim pushes pass update');

  console.log(JSON.stringify({
    result: 'PASS',
    assertions,
    catalog: { activities: catalog.map((row) => row.id), payId: 10301, cycleDays: 7, stages: 16 },
    purchase: { tokenCost: 68, duplicateGuard: 'ALREADY_ACTIVE', rollback: 'PASS' },
    rewards: { claimedStages: claimSuccess, replayResult: replayPacket.data.result },
    lifecycle: { dailyTaskReset: 'PASS', cycleRollover: 'PASS', areas: [7001, 7051] },
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});

#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const appRoot = process.env.FORTUNE_APP_ROOT
  ? path.resolve(process.env.FORTUNE_APP_ROOT)
  : path.join(repoRoot, '_ai_workbench', 'temp', 'fortune_event_full_candidate_20260902', 'app');
const config = require(path.join(appRoot, 'src', 'services', 'ConfigService'));
const activity = require(path.join(appRoot, 'src', 'handlers', 'activity'));
const progress = require(path.join(appRoot, 'src', 'services', 'MainTaskProgressService'));

const originalRandom = Math.random;
Math.random = () => 0.5;

function player() {
  const now = Date.now();
  return {
    userId: 'real-config-contract', playerId: 'real-config-role', name: 'real-config', level: 90, exp: 0,
    currencies: { diamond: 0, silver: 0, gold: 0 },
    items: { 4: 200, 55: 100, 65: 100, 176: 30, 178: 30, 179: 0 },
    roleInfo: {}, rechargeInfo: { records: [] }, shopInfo: { buyRecords: {} },
    other_attr_info: { mainTaskProgress: {} }, taskInfo: { tasks: {}, tasksMap: {}, dailyTaskDayKey: 0 },
    activityInfo: {
      datas: [
        { id: 43001, startTime: now - 86400000, endTime: now + 864000000, score: 0, record: 0, recordList: [], records: { 1: 1, 3: 0, 10: 0, 11: 0 }, buyRecords: {} },
        { id: 44001, startTime: now - 86400000, endTime: now + 864000000, score: 1, record: 0, recordList: [], records: { 1: 90000 }, buyRecords: {} },
      ],
      operateRecords: {}, dailyShopClaims: {},
    },
  };
}

function row(p, id) { return p.activityInfo.datas.find((entry) => Number(entry.id) === id); }

async function run() {
  let checks = 0;
  const check = (value, message) => { assert(value, message); checks += 1; };
  const tables = config.loadAllTables();
  check(Object.keys(tables).length === 714, 'expected 714 config tables');
  check(config.get('Activity43Config')[43001].rewardPoolCount === 40, 'draw guarantee config changed');
  check(Object.keys(config.get('Activity43TaskConfig')[43001]).length === 9, 'activity task count changed');
  check(Object.keys(config.get('Activity43TaskRewardConfig')[43001]).length === 5, 'daily milestone count changed');
  check(config.get('ActivityShopConfig')[43001][11018000].limit === 1, 'free package daily limit changed');

  const p = player();
  activity.ensureActivityInfo(p);
  progress.refreshMainTaskProgress(p);
  check(p.taskInfo.tasks['61001'].status === 20, 'login task not complete');
  check(p.taskInfo.tasks['61002'].status === 10, 'non-login task started completed');
  progress.addArenaChallengeCount(p, 1);
  progress.addEliteMonsterKillCount(p, 1);
  progress.addItemConsume(p, 4, 100);
  progress.addItemConsume(p, 65, 50);
  progress.addItemConsume(p, 55, 50);
  progress.addGuildChallengeCount(p, 1);
  progress.addDungeonBossChallengeCount(p, 1);
  progress.addCrossRivalChallengeCount(p, 1);
  check(Array.from({ length: 9 }, (_, index) => 61001 + index).every((id) => p.taskInfo.tasks[id].status === 20), 'one or more activity tasks did not complete');

  const taskReward = activity.operateNewYearTaskReward(p, row(p, 43001));
  check(taskReward.result === 0, 'activity task reward failed');
  check(taskReward.taskIds.length === 9, 'activity task reward did not claim nine tasks');
  check(p.items[176] === 50, 'activity task reward total is not 20 fireworks');
  check(row(p, 43001).records[10] === 120, 'daily score total is not 120');

  const daily = activity.operateNewYearDailyScoreReward(p, row(p, 43001));
  check(daily.result === 0 && row(p, 43001).records[11] === 31, 'daily milestone claim/bitmask failed');
  check(p.items[179] === 20 && p.items[178] === 32 && p.items[94415] === 1, 'daily milestone configured rewards mismatch');

  const before178 = p.items[178];
  const draw = activity.handleNewYearDrawOperate(p, row(p, 43001), 0);
  check(draw.result === 0 && p.items[178] === before178 - 1, 'draw cost contract failed');
  check(draw.festival.rewards.length === 1, 'single draw returned wrong reward count');
  check(config.get('Activity43Config')[43001].rewardPoolShow.some((reward) => reward.id === draw.festival.rewards[0].id && reward.count === draw.festival.rewards[0].count), 'draw reward is not in configured pool');

  row(p, 43001).score = 10;
  const score = activity.handleNewYearScoreRewardOperate(p, row(p, 43001), 10);
  check(score.result === 0, 'draw score milestone failed');
  check(p.fashionInfo && p.fashionInfo.fashions['113114'] === 1, 'configured avatar reward was not activated');
  check(!p.items[113114], 'configured avatar reward leaked into item bag');

  const before = { fireworks: p.items[176], merit: Number(p.items[177]) || 0, diamond: p.currencies.diamond, gold: p.currencies.gold, baozi: p.items[4], token: p.items[179] };
  const monster = activity.operateNewYearMonsterAttack(p, row(p, 44001), 0);
  check(monster.result === 0 && monster.defeated === true, 'monster defeat contract failed');
  check(p.items[176] === before.fireworks - 1 && p.items[177] === before.merit + 10, 'monster cost/merit mismatch');
  check(p.currencies.diamond === before.diamond + 10 && p.currencies.gold === before.gold + 1, 'monster currency reward mismatch');
  check(p.items[4] === before.baozi + 10 && p.items[179] === before.token + 10, 'monster item reward mismatch');
  check(row(p, 44001).score === 2 && row(p, 44001).records[1] === 0, 'monster advancement/hp reset mismatch');

  const dailyPolicy = activity.getActiveActivityShopPolicy(p, 11018000);
  const exchangePolicy = activity.getActiveActivityShopPolicy(p, 11018101);
  check(dailyPolicy && dailyPolicy.limit === 1 && dailyPolicy.limitType === 1, 'free package policy resolution failed');
  check(exchangePolicy && exchangePolicy.limit === 1 && exchangePolicy.limitType === 4, 'exchange shop policy resolution failed');

  console.log(JSON.stringify({ result: 'PASS', checks, tables: Object.keys(tables).length, activityId: 43001 }));
}

run().finally(() => { Math.random = originalRandom; }).catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});

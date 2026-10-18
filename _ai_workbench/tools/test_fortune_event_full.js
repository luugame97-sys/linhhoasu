#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');

process.env.NODE_ENV = 'test';

const repoRoot = path.resolve(__dirname, '..', '..');
const appRoot = process.env.FORTUNE_APP_ROOT
  ? path.resolve(process.env.FORTUNE_APP_ROOT)
  : path.join(repoRoot, '_ai_workbench', 'temp', 'fortune_event_full_candidate_20260902', 'app');

const config = require(path.join(appRoot, 'src', 'services', 'ConfigService'));
const playerService = require(path.join(appRoot, 'src', 'services', 'PlayerService'));
const raid = require(path.join(appRoot, 'src', 'handlers', 'raid'));

const original = {
  get: config.get,
  savePlayer: playerService.savePlayer,
  savePlayerDeferred: playerService.savePlayerDeferred,
  addReward: raid.addRewardToPlayer,
  random: Math.random,
  now: Date.now,
};

let now = Date.UTC(2026, 8, 2, 1, 0, 0);
const ACTIVITY_ID = 43001;
const MONSTER_ACTIVITY_ID = 44001;
const ACTIVITY_TASK_TYPE = ACTIVITY_ID | (1 << 30);

const taskRows = {
  61001: { id: 61001, type: 6, updateCycle: 1, activeId: 101, taskValue1: 1, taskValue2: 0, reward: [] },
  61002: { id: 61002, type: 6, updateCycle: 1, activeId: 16, taskValue1: 1, taskValue2: 0, reward: [] },
  61003: { id: 61003, type: 6, updateCycle: 1, activeId: 76, taskValue1: 1, taskValue2: 0, reward: [] },
  61004: { id: 61004, type: 6, updateCycle: 1, activeId: 13, taskValue1: 100, taskValue2: 4, reward: [] },
  61005: { id: 61005, type: 6, updateCycle: 1, activeId: 44, taskValue1: 50, taskValue2: 0, reward: [] },
  61006: { id: 61006, type: 6, updateCycle: 1, activeId: 13, taskValue1: 50, taskValue2: 55, reward: [] },
  61007: { id: 61007, type: 6, updateCycle: 1, activeId: 77, taskValue1: 1, taskValue2: 0, reward: [] },
  61008: { id: 61008, type: 6, updateCycle: 1, activeId: 28, taskValue1: 1, taskValue2: 0, reward: [] },
  61009: { id: 61009, type: 6, updateCycle: 1, activeId: 23, taskValue1: 1, taskValue2: 0, reward: [] },
};

const activityTaskRows = Object.fromEntries(Object.keys(taskRows).map((id) => [id, {
  activityId: ACTIVITY_ID,
  taskId: Number(id),
  score: Number(id) <= 61003 ? 20 : 10,
  rewards: [{ id: 176, count: Number(id) === 61001 ? 4 : 2 }],
}]));

const tables = {
  ActivityConfig: {
    [ACTIVITY_ID]: { id: ACTIVITY_ID, activityType: 43 },
    [MONSTER_ACTIVITY_ID]: { id: MONSTER_ACTIVITY_ID, activityType: 44 },
  },
  Activity43Config: {
    [ACTIVITY_ID]: {
      activityId: ACTIVITY_ID,
      cost: [{ id: 178, count: 1 }, { id: 178, count: 10 }],
      rewardPoolCount: 40,
      triggerTimes: 2,
      loopRewards: [{ id: 176, count: 1 }],
      giftIds: [11018000],
      shopIds: [11018101],
      weightShow: { 1: 0, 2: 10000, 3: 0, 4: 0 },
      rewardShow: { 2: [{ id: 179, count: 40 }] },
      rewardPoolShow: [{ id: 179, count: 40 }],
      rewardPoolShow1: [{ id: 93092, count: 1, limit: 2 }],
    },
  },
  Activity43TaskConfig: { [ACTIVITY_ID]: activityTaskRows },
  Activity43TaskRewardConfig: {
    [ACTIVITY_ID]: {
      1: { id: 1, score: 20, reward: { id: 179, count: 10 } },
      2: { id: 2, score: 40, reward: { id: 178, count: 1 } },
      3: { id: 3, score: 60, reward: { id: 179, count: 10 } },
      4: { id: 4, score: 80, reward: { id: 178, count: 1 } },
      5: { id: 5, score: 100, reward: { id: 94415, count: 1 } },
    },
  },
  ActivityScoreConfig: {
    [ACTIVITY_ID]: {
      1: {
        10: { score: 10, rewards: [{ id: 113114, count: 1 }] },
        25: { score: 25, rewards: [{ id: 94411, count: 1 }] },
        50: { score: 50, rewards: [{ id: 94412, count: 1 }] },
        75: { score: 75, rewards: [{ id: 94413, count: 1 }] },
        100: { score: 100, rewards: [{ id: 94414, count: 1 }] },
      },
      2: {
        25: { score: 25, rewards: [{ id: 94411, count: 1 }] },
        50: { score: 50, rewards: [{ id: 94412, count: 1 }] },
        75: { score: 75, rewards: [{ id: 94413, count: 1 }] },
        100: { score: 100, rewards: [{ id: 94414, count: 1 }] },
      },
    },
  },
  Activity44Config: {
    [MONSTER_ACTIVITY_ID]: { activityId: MONSTER_ACTIVITY_ID, atkCost: [{ id: 176, count: 1 }, { id: 176, count: 10 }], rankScore: 10, blood: 10000, indexMax: 30 },
  },
  Activity44MonsterConfig: {
    [MONSTER_ACTIVITY_ID]: {
      1: { activityId: MONSTER_ACTIVITY_ID, index: 1, bloodMax: 10000, rewards: [{ id: 179, count: 10 }, { id: 1, count: 10 }] },
      2: { activityId: MONSTER_ACTIVITY_ID, index: 2, bloodMax: 20000, rewards: [{ id: 179, count: 20 }] },
    },
  },
  ActivityShopConfig: {
    [ACTIVITY_ID]: {
      11018000: { activityId: ACTIVITY_ID, shopId: 11018000, limit: 1, limitType: 1 },
      11018101: { activityId: ACTIVITY_ID, shopId: 11018101, limit: 1, limitType: 4 },
    },
  },
  ShopConfig: {
    11018000: { id: 11018000, payId: 0, cost: [], rewards: [{ id: 4, count: 10 }], limit: 0, limitType: 0 },
    11018101: { id: 11018101, payId: 0, cost: [{ id: 179, count: 200 }], rewards: [{ id: 11548, count: 1 }], limit: 0, limitType: 0 },
  },
  FashionConfig: {
    113114: { id: 113114, itemId: 113113, type: 102, appearIds: [113114] },
    11548: { id: 11548, itemId: 11548, type: 104, appearIds: [11548] },
  },
  TaskConfig: taskRows,
  BoxConfig: {},
  RoleStageConfig: {},
  BoxTierConfig: {},
  LanguageConfig: {},
};

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function list(result) { return Array.isArray(result) ? result : [result]; }
function packet(result, tag, msgUid = null) {
  return list(result).find((row) => Number(row && row.tag) === Number(tag)
    && (msgUid == null || Number(row && row.msgUid) === Number(msgUid))) || null;
}
function activityRow(player, id = ACTIVITY_ID) {
  return (player.activityInfo.datas || []).find((row) => Number(row.id) === id);
}
function taskState(player, id) { return player.taskInfo.tasks[String(id)]; }

function makePlayer(id = 'fortune-full') {
  return {
    userId: id,
    playerId: `${id}-role`,
    name: id,
    level: 80,
    exp: 0,
    currencies: { diamond: 0, silver: 0, gold: 100 },
    items: { 4: 200, 55: 100, 65: 100, 176: 20, 178: 50, 179: 300 },
    rechargeInfo: { records: [] },
    shopInfo: { buyRecords: {} },
    roleInfo: {},
    other_attr_info: { mainTaskProgress: {} },
    taskInfo: { tasks: {}, tasksMap: {}, dailyTaskDayKey: 0 },
    activityInfo: {
      datas: [
        { id: ACTIVITY_ID, startTime: now - 86400000, endTime: now + 864000000, score: 0, record: 0, recordList: [], records: { 1: 1, 3: 0, 10: 0, 11: 0 }, buyRecords: {}, extra: {} },
        { id: MONSTER_ACTIVITY_ID, startTime: now - 86400000, endTime: now + 864000000, score: 1, record: 0, recordList: [], records: { 1: 0 }, buyRecords: {}, extra: {} },
      ],
      dailyShopClaims: {}, operateRecords: {},
    },
  };
}

const store = new Map();
config.get = (name) => tables[name] || {};
Date.now = () => now;
Math.random = () => 0.2;
raid.addRewardToPlayer = (player, itemId, count) => {
  const id = Number(itemId); const amount = Number(count);
  if (id === 1) player.currencies.diamond += amount;
  else if (id === 2) player.currencies.silver += amount;
  else if (id === 6) player.currencies.gold += amount;
  else if (id === 3) player.exp += amount;
  else player.items[id] = (Number(player.items[id]) || 0) + amount;
};
playerService.savePlayer = async (userId, player) => { store.set(String(userId), clone(player)); return player; };
playerService.savePlayerDeferred = playerService.savePlayer;

const activity = require(path.join(appRoot, 'src', 'handlers', 'activity'));
const item = require(path.join(appRoot, 'src', 'handlers', 'item'));
const progress = require(path.join(appRoot, 'src', 'services', 'MainTaskProgressService'));

async function run() {
  let checks = 0;
  const check = (value, message) => { assert(value, message); checks += 1; };
  const player = makePlayer();
  const session = { userId: player.userId, player };
  store.set(player.userId, clone(player));

  activity.ensureActivityInfo(player);
  progress.refreshMainTaskProgress(player);
  check(taskState(player, 61001).status === 20, 'daily login task not completed');
  check(taskState(player, 61002).status === 10, 'arena task started completed');

  const legacy = makePlayer('legacy-counters');
  legacy.other_attr_info.mainTaskProgress = { arenaChallengeCount: 99, crossRivalChallengeCount: 77, dungeonBossChallengeCount: 55 };
  activity.ensureActivityInfo(legacy);
  progress.refreshMainTaskProgress(legacy);
  check(taskState(legacy, 61002).status === 10 && taskState(legacy, 61002).__fortuneCounterBase === 99, 'legacy arena counter falsely completed event task');
  check(taskState(legacy, 61009).status === 10 && taskState(legacy, 61009).__fortuneCounterBase === 77, 'legacy invasion counter falsely completed event task');
  progress.addArenaChallengeCount(legacy, 1);
  check(taskState(legacy, 61002).status === 20 && taskState(legacy, 61002).progress === 1, 'post-activation arena increment was not counted');

  progress.addArenaChallengeCount(player, 1);
  progress.addEliteMonsterKillCount(player, 1);
  progress.addItemConsume(player, 4, 100);
  progress.addItemConsume(player, 65, 50);
  progress.addItemConsume(player, 55, 50);
  progress.addGuildChallengeCount(player, 1);
  progress.addDungeonBossChallengeCount(player, 1);
  progress.addCrossRivalChallengeCount(player, 1);
  for (const id of Object.keys(taskRows)) check(taskState(player, id).status === 20, `task ${id} not completed`);

  const taskClaim = await activity.handleActivityOperate({ id: ACTIVITY_ID, module: 1, index: 0, param: 0 }, session, 1001);
  check(packet(taskClaim, 1700, 1001).data.result === 0, 'activity task claim failed');
  check(activityRow(player).records[10] === 120, 'daily score did not total configured task score');
  check(player.items[176] === 40, 'task reward item 176 did not total 20');
  check(Object.keys(taskRows).every((id) => taskState(player, id).status === 30), 'task states were not claimed');
  check(packet(taskClaim, 1202) && packet(taskClaim, 1202).data.changed.some((row) => row.id === 176 && row.count === 40), 'task reward did not sync inventory');

  const taskReplay = await activity.handleActivityOperate({ id: ACTIVITY_ID, module: 1, index: 0, param: 0 }, session, 1002);
  check(packet(taskReplay, 1700, 1002).data.result !== 0, 'task replay accepted');
  check(player.items[176] === 40, 'task replay duplicated reward');

  const dailyClaim = await activity.handleActivityOperate({ id: ACTIVITY_ID, module: 2, index: 0, param: 0 }, session, 1003);
  check(packet(dailyClaim, 1700, 1003).data.result === 0, 'daily milestone claim failed');
  check(activityRow(player).records[11] === 31, 'daily milestone bitmask is not 31');
  check(player.items[179] === 320 && player.items[178] === 52 && player.items[94415] === 1, 'daily milestone rewards are wrong');
  const dailyReplay = await activity.handleActivityOperate({ id: ACTIVITY_ID, module: 2, index: 0, param: 0 }, session, 1004);
  check(packet(dailyReplay, 1700, 1004).data.result !== 0, 'daily milestone replay accepted');

  const beforeDrawItem = player.items[178];
  const draw = await activity.handleActivityOperate({ id: ACTIVITY_ID, module: 0, index: 0, param: 0 }, session, 1005);
  check(packet(draw, 1700, 1005).data.result === 0, 'single draw failed');
  check(player.items[178] === beforeDrawItem - 1, 'single draw cost was not consumed');
  check(player.items[179] === 360, 'single draw reward did not reach inventory');
  check(packet(draw, 1796) && packet(draw, 1796).data.rewards[0].id === 179, 'draw animation packet reward mismatch');
  check(packet(draw, 1202).data.changed.some((row) => row.id === 179 && row.count === 360), 'draw inventory sync missing');
  const loopClaim = await activity.handleActivityOperate({ id: ACTIVITY_ID, module: 1, index: 0, param: 0 }, session, 1015);
  check(packet(loopClaim, 1700, 1015).data.result === 0, 'loop reward claim failed');
  check(player.items[176] === 41 && activityRow(player).record === 0, 'loop reward amount/reset is wrong');

  activityRow(player).score = 10;
  const scoreClaim = await activity.handleActivityOperate({ id: ACTIVITY_ID, module: 3, index: 10, param: 0 }, session, 1006);
  check(packet(scoreClaim, 1700, 1006).data.result === 0, 'draw milestone claim failed');
  check(player.fashionInfo && player.fashionInfo.fashions['113114'] === 1, 'draw milestone fashion ownership missing');
  check(!player.items[113114], 'draw milestone fashion leaked into bag');
  check(packet(scoreClaim, 1800) && packet(scoreClaim, 1800).data.fashion.includes(113114), 'draw milestone fashion sync missing');
  check(activityRow(player).recordList.includes(10), 'draw milestone record missing');
  const scoreReplay = await activity.handleActivityOperate({ id: ACTIVITY_ID, module: 3, index: 10, param: 0 }, session, 1007);
  check(packet(scoreReplay, 1700, 1007).data.result === 2, 'draw milestone replay not denied');

  activityRow(player).records[1] = 40;
  activityRow(player).records[3] = 0;
  const guaranteed = await activity.handleActivityOperate({ id: ACTIVITY_ID, module: 0, index: 0, param: 0 }, session, 1008);
  check(packet(guaranteed, 1796).data.rewards[0].id === 93092, '40-draw guarantee did not use special pool');
  check(activityRow(player).records[1] === 1 && activityRow(player).records[3] === 1, 'guarantee counters are wrong');

  const monsterBefore176 = player.items[176];
  const monster = await activity.handleActivityOperate({ id: MONSTER_ACTIVITY_ID, module: 0, index: 0, param: 0 }, session, 1009);
  check(packet(monster, 1700, 1009).data.result === 0, 'monster attack failed');
  check(player.items[176] === monsterBefore176 - 1, 'monster attack cost is wrong');
  check(player.items[177] === 10 && player.currencies.diamond === 10, 'monster configured rewards are wrong');
  check(activityRow(player, MONSTER_ACTIVITY_ID).score === 2, 'monster did not advance after defeat');
  check(packet(monster, 1701).data.rewardInfo.items.some((row) => row.id === 177 && row.count === 10), 'monster reward popup data missing');

  const exchange = await item.handleMultiBuyItem({ require: { 11018101: 1 } }, session, 1010);
  check(packet(exchange, 1202, 1010).data.result === 0, 'event exchange purchase failed');
  check(player.fashionInfo && player.fashionInfo.fashions['11548'] === 1, 'event exchange fashion ownership missing');
  check(activityRow(player).buyRecords[11018101] === 1, 'event exchange ledger missing');
  const exchangeReplay = await item.handleMultiBuyItem({ require: { 11018101: 1 } }, session, 1011);
  check(packet(exchangeReplay, 1202, 1011).data.result !== 0, 'event exchange limit bypassed');

  const previousDayScore = activityRow(player).records[10];
  now += 86400000;
  activity.ensureActivityInfo(player);
  check(previousDayScore > 0 && activityRow(player).records[10] === 0 && activityRow(player).records[11] === 0, 'daily event counters did not reset GMT+8');
  progress.refreshMainTaskProgress(player);
  check(taskState(player, 61001).status === 20, 'next-day login task not reopened');

  console.log(JSON.stringify({ result: 'PASS', checks, activityId: ACTIVITY_ID, monsterActivityId: MONSTER_ACTIVITY_ID }, null, 2));
}

run().finally(() => {
  config.get = original.get;
  playerService.savePlayer = original.savePlayer;
  playerService.savePlayerDeferred = original.savePlayerDeferred;
  raid.addRewardToPlayer = original.addReward;
  Math.random = original.random;
  Date.now = original.now;
}).catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});

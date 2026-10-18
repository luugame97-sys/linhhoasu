#!/usr/bin/env node
'use strict';

/**
 * In-memory contract for the production Fortune daily gift hotfix.
 * No network, MongoDB, Redis, payment, or VPS mutation is performed.
 */

const assert = require('assert');
const path = require('path');

process.env.NODE_ENV = 'test';

const repoRoot = path.resolve(__dirname, '..', '..');
const appRoot = process.env.FORTUNE_APP_ROOT
  ? path.resolve(process.env.FORTUNE_APP_ROOT)
  : path.join(repoRoot, '_ai_workbench', 'temp', 'fortune_daily_limit_candidate_20260901', 'app');

const config = require(path.join(appRoot, 'src', 'services', 'ConfigService'));
const playerService = require(path.join(appRoot, 'src', 'services', 'PlayerService'));
const raid = require(path.join(appRoot, 'src', 'handlers', 'raid'));

const SHOP_ID = 11018000;
const ACTIVITY_ID = 43001;
const DAY_MS = 86400000;
const GMT8_OFFSET_MS = 8 * 60 * 60 * 1000;
let now = Date.UTC(2026, 8, 1, 16, 30, 0); // 2026-09-02 00:30 GMT+8

const fixtures = {
  ActivityConfig: {
    [ACTIVITY_ID]: { id: ACTIVITY_ID, activityType: 43 },
  },
  Activity43Config: {
    [ACTIVITY_ID]: { activityId: ACTIVITY_ID, giftIds: [SHOP_ID, 11018001, 11018002] },
  },
  ActivityShopConfig: {
    [ACTIVITY_ID]: {
      [SHOP_ID]: { activityId: ACTIVITY_ID, shopId: SHOP_ID, limit: 1, limitType: 1 },
    },
  },
  ShopConfig: {
    [SHOP_ID]: {
      id: SHOP_ID,
      payId: 0,
      cost: [],
      costAgain: [],
      rewards: [{ id: 4, count: 10 }],
      limit: 0,
      limitType: 0,
      type: 10,
    },
    101: {
      id: 101,
      payId: 0,
      cost: [{ id: 2, count: 10 }],
      costAgain: [],
      rewards: [{ id: 1, count: 5 }],
      limit: 0,
      limitType: 0,
    },
    9001: {
      id: 9001,
      payId: 9001,
      cost: [],
      costAgain: [],
      rewards: [{ id: 1, count: 999 }],
      limit: 0,
      limitType: 0,
    },
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function dayKey(value = now) {
  return Math.floor((value + GMT8_OFFSET_MS) / DAY_MS);
}

function makePlayer(userId = 'fortune-user', overrides = {}) {
  return {
    userId,
    playerId: `${userId}-role`,
    name: userId,
    level: 60,
    exp: 0,
    currencies: { diamond: 100, silver: 100, gold: 0 },
    items: { 4: 100 },
    rechargeInfo: { records: [] },
    shopInfo: { buyRecords: {} },
    activityInfo: {
      datas: [{
        id: ACTIVITY_ID,
        startTime: now - DAY_MS,
        endTime: now + (10 * DAY_MS),
        records: { 1: 1, 3: 0, 10: 0, 11: 0 },
        buyRecords: {},
        recordList: [],
      }],
      dailyShopClaims: {},
    },
    taskInfo: { tasks: {}, tasksMap: {} },
    roleInfo: {},
    ...clone(overrides),
  };
}

function packets(result) {
  return Array.isArray(result) ? result : [result];
}

function packet(result, tag, msgUid = null) {
  return packets(result).find((row) => (
    Number(row && row.tag) === Number(tag)
    && (msgUid == null || Number(row && row.msgUid) === Number(msgUid))
  )) || null;
}

function claimCount(player) {
  const info = player.activityInfo || {};
  const activityLedger = (info.dailyShopClaims || {})[String(ACTIVITY_ID)] || {};
  const row = activityLedger[String(SHOP_ID)] || {};
  return Number(row.dayKey) === dayKey() ? Number(row.count) || 0 : 0;
}

function activityBuyCount(player) {
  const row = ((player.activityInfo || {}).datas || []).find((item) => Number(item.id) === ACTIVITY_ID) || {};
  return Number((row.buyRecords || {})[String(SHOP_ID)]) || 0;
}

function fortuneTotalRecord(player) {
  return Number((((player.shopInfo || {}).buyRecords || {})[String(SHOP_ID)])) || 0;
}

const original = {
  dateNow: Date.now,
  configGet: config.get,
  raidGrant: raid.addRewardToPlayer,
  raidExp: raid.addExpToPlayer,
  loadPlayer: playerService.loadPlayer,
  savePlayer: playerService.savePlayer,
  savePlayerDeferred: playerService.savePlayerDeferred,
};

Date.now = () => now;
config.get = (name) => fixtures[name] || {};
raid.addRewardToPlayer = (player, itemId, count) => {
  const id = Math.floor(Number(itemId) || 0);
  const amount = Math.max(0, Math.floor(Number(count) || 0));
  player.items = player.items || {};
  player.currencies = player.currencies || { diamond: 0, silver: 0, gold: 0 };
  if (id === 1) player.currencies.diamond = (Number(player.currencies.diamond) || 0) + amount;
  else if (id === 2) player.currencies.silver = (Number(player.currencies.silver) || 0) + amount;
  else if (id === 6) player.currencies.gold = (Number(player.currencies.gold) || 0) + amount;
  else if (id === 3) player.exp = (Number(player.exp) || 0) + amount;
  else player.items[id] = (Number(player.items[id]) || 0) + amount;
};
raid.addExpToPlayer = (player, count) => raid.addRewardToPlayer(player, 3, count);

const store = new Map();
let saveCalls = 0;
let failNextSave = false;
let saveDelayMs = 0;
playerService.loadPlayer = async (userId) => {
  const value = store.get(String(userId));
  return value ? clone(value) : null;
};
playerService.savePlayer = async (userId, player) => {
  saveCalls += 1;
  if (saveDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, saveDelayMs));
  if (failNextSave) {
    failNextSave = false;
    throw new Error('fixture save failed');
  }
  store.set(String(userId), clone(player));
  return player;
};
playerService.savePlayerDeferred = playerService.savePlayer;

const itemPath = path.join(appRoot, 'src', 'handlers', 'item.js');
const activityPath = path.join(appRoot, 'src', 'handlers', 'activity.js');
let item = require(itemPath);
const activity = require(activityPath);

async function buyViaClient(userId, msgUid) {
  const session = { userId, player: clone(store.get(userId)) };
  const result = await item.handleGetItems({ id: SHOP_ID, count: 1 }, session, msgUid);
  return { result, session };
}

async function run() {
  let checks = 0;
  const check = (condition, message) => { assert(condition, message); checks += 1; };

  store.set('first', makePlayer('first'));
  saveCalls = 0;
  const first = await buyViaClient('first', 101);
  check(packet(first.result, 1200, 101).data.result === 0, 'first daily claim failed');
  check(packet(first.result, 1701) != null, 'first claim did not push activity update');
  check(store.get('first').items[4] === 110, 'first claim did not grant exactly 10 Baozi');
  check(claimCount(store.get('first')) === 1, 'first claim ledger count is not 1');
  check(activityBuyCount(store.get('first')) === 1, 'activity buyRecords was not synchronized');
  check(fortuneTotalRecord(store.get('first')) === 1, 'lifetime audit counter was not retained');
  check(saveCalls === 1, 'first claim did not persist exactly once');

  const replay = await buyViaClient('first', 102);
  check(packet(replay.result, 1200, 102).data.result !== 0, 'same-day replay was accepted');
  check(packet(replay.result, 1202, 102).data.code === 'DAILY_LIMIT_REACHED', 'replay error code is wrong');
  check(store.get('first').items[4] === 110, 'replay changed Baozi');
  check(fortuneTotalRecord(store.get('first')) === 1, 'replay changed total counter');
  check(saveCalls === 1, 'replay persisted a mutation');

  store.set('concurrent', makePlayer('concurrent'));
  saveCalls = 0;
  saveDelayMs = 30;
  const [left, right] = await Promise.all([
    buyViaClient('concurrent', 201),
    buyViaClient('concurrent', 202),
  ]);
  saveDelayMs = 0;
  const successes = [left, right].filter((entry) => packet(entry.result, 1200).data.result === 0);
  check(successes.length === 1, 'concurrent claims did not produce exactly one success');
  check(store.get('concurrent').items[4] === 110, 'concurrent claims granted more than 10 Baozi');
  check(claimCount(store.get('concurrent')) === 1, 'concurrent ledger count is not 1');
  check(saveCalls === 1, 'concurrent claims saved more than once');

  // New module instance simulates a process restart: the in-memory lock is
  // cleared, but the persisted ledger must still reject the replay.
  delete require.cache[require.resolve(itemPath)];
  item = require(itemPath);
  const afterRestart = await buyViaClient('concurrent', 203);
  check(packet(afterRestart.result, 1200, 203).data.result !== 0, 'restart bypassed the persisted ledger');
  check(store.get('concurrent').items[4] === 110, 'restart replay changed Baozi');

  // At the next GMT+8 day, login normalization reopens the single daily slot.
  now += DAY_MS;
  const loginCopy = clone(store.get('concurrent'));
  activity.ensureActivityInfo(loginCopy);
  check(activityBuyCount(loginCopy) === 0, 'next-day login did not reset displayed buy count');
  const nextDay = await buyViaClient('concurrent', 204);
  check(packet(nextDay.result, 1200, 204).data.result === 0, 'next GMT+8 day claim was blocked');
  check(store.get('concurrent').items[4] === 120, 'next-day claim did not grant exactly 10 Baozi');
  check(claimCount(store.get('concurrent')) === 1, 'next-day ledger was not replaced');
  check(activityBuyCount(store.get('concurrent')) === 1, 'next-day activity count is not 1 after claim');
  check(fortuneTotalRecord(store.get('concurrent')) === 2, 'total audit counter did not reach 2');

  store.set('inactive', makePlayer('inactive', {
    activityInfo: { datas: [{ id: ACTIVITY_ID, startTime: now - (3 * DAY_MS), endTime: now - 1, buyRecords: {} }] },
  }));
  saveCalls = 0;
  const inactive = await buyViaClient('inactive', 301);
  check(packet(inactive.result, 1200, 301).data.result !== 0, 'expired activity gift was accepted');
  check(store.get('inactive').items[4] === 100, 'expired activity mutated Baozi');
  check(saveCalls === 0, 'expired activity persisted a mutation');

  store.set('multi', makePlayer('multi'));
  const multiSession = { userId: 'multi', player: clone(store.get('multi')) };
  const multi = await item.handleGetItems({ id: SHOP_ID, count: 2 }, multiSession, 302);
  check(packet(multi, 1200, 302).data.result !== 0, 'multi-count daily claim was accepted');
  check(store.get('multi').items[4] === 100, 'multi-count request changed Baozi');

  store.set('save-fail', makePlayer('save-fail'));
  const failSession = { userId: 'save-fail', player: clone(store.get('save-fail')) };
  failNextSave = true;
  await assert.rejects(
    () => item.handleGetItems({ id: SHOP_ID, count: 1 }, failSession, 401),
    /fixture save failed/,
  );
  checks += 1;
  check(store.get('save-fail').items[4] === 100, 'failed save changed persisted Baozi');
  check(failSession.player.items[4] === 100, 'failed save did not restore session snapshot');
  const retry = await buyViaClient('save-fail', 402);
  check(packet(retry.result, 1200, 402).data.result === 0, 'retry after failed save did not succeed');
  check(store.get('save-fail').items[4] === 110, 'retry after failed save granted wrong Baozi');

  // Regression: paid rows stay blocked and an unrelated free row still works.
  store.set('control', makePlayer('control'));
  const controlSession = { userId: 'control', player: clone(store.get('control')) };
  const paid = await item.handleMultiBuyItem({ require: { 9001: 1 } }, controlSession, 501);
  check(packet(paid, 1202, 501).data.code === 'PAID_USE_RECHARGE_PATH', 'paid-route guard regressed');
  const free = await item.handleMultiBuyItem({ require: { 101: 1 } }, controlSession, 502);
  check(packet(free, 1202, 502).data.result === 0, 'unrelated free shop row regressed');
  check(store.get('control').currencies.silver === 90, 'unrelated free row cost is wrong');
  check(store.get('control').currencies.diamond === 105, 'unrelated free row reward is wrong');

  console.log(JSON.stringify({ result: 'PASS', checks, shopId: SHOP_ID, timezone: 'GMT+8' }, null, 2));
}

run().finally(() => {
  Date.now = original.dateNow;
  config.get = original.configGet;
  raid.addRewardToPlayer = original.raidGrant;
  raid.addExpToPlayer = original.raidExp;
  playerService.loadPlayer = original.loadPlayer;
  playerService.savePlayer = original.savePlayer;
  playerService.savePlayerDeferred = original.savePlayerDeferred;
}).catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});

'use strict';

// Local-only contract for generic free activity-shop protection.
// No network, MongoDB, Redis, payment, or VPS mutation is performed.

const assert = require('assert');
const path = require('path');

process.env.NODE_ENV = 'test';
const appRoot = process.env.FREE_ACTIVITY_APP_ROOT
  ? path.resolve(process.env.FREE_ACTIVITY_APP_ROOT)
  : path.resolve(__dirname, '..', '..', 'linhhoasu', 'lhs', 'newServer');
const config = require(path.join(appRoot, 'src', 'services', 'ConfigService'));
const playerService = require(path.join(appRoot, 'src', 'services', 'PlayerService'));
const raid = require(path.join(appRoot, 'src', 'handlers', 'raid'));

const DAY = 86400000;
const ACTIVITY_A = 21001;
const ACTIVITY_B = 23001;
const FREE_A = 11007000;
const FREE_B = 11008000;
const INVALID = 11003000;
let now = Date.UTC(2026, 8, 1, 16, 30, 0);

const fixtures = {
  ActivityConfig: {
    [ACTIVITY_A]: { id: ACTIVITY_A, activityType: 21 },
    [ACTIVITY_B]: { id: ACTIVITY_B, activityType: 23 },
  },
  ActivityShopConfig: {
    [ACTIVITY_A]: {
      [FREE_A]: { activityId: ACTIVITY_A, shopId: FREE_A, limit: 1, limitType: 1 },
      [INVALID]: { activityId: ACTIVITY_A, shopId: INVALID, limit: 1, limitType: 1 },
    },
    [ACTIVITY_B]: {
      [FREE_B]: { activityId: ACTIVITY_B, shopId: FREE_B, limit: 1, limitType: 1 },
    },
  },
  ShopConfig: {
    [FREE_A]: { id: FREE_A, payId: 0, cost: [], rewards: [{ id: 4, count: 10 }], limit: 0, limitType: 0 },
    [FREE_B]: { id: FREE_B, payId: 0, cost: [], rewards: [{ id: 4, count: 10 }, { id: 105, count: 1 }], limit: 0, limitType: 0 },
    [INVALID]: { id: INVALID, payId: 0, cost: [], rewards: [], limit: 0, limitType: 0 },
  },
  AssetsConfig: {},
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const makePlayer = (userId) => ({
  userId,
  playerId: `${userId}-role`,
  level: 60,
  exp: 0,
  items: { 4: 0 },
  currencies: { diamond: 0, silver: 0, gold: 0 },
  rechargeInfo: { records: [] },
  shopInfo: { buyRecords: {} },
  activityInfo: {
    datas: [
      { id: ACTIVITY_A, startTime: now - DAY, endTime: now + DAY, buyRecords: {} },
      { id: ACTIVITY_B, startTime: now - DAY, endTime: now + DAY, buyRecords: {} },
    ],
    dailyShopClaims: {},
  },
  taskInfo: { tasks: {}, tasksMap: {} },
});

const original = {
  now: Date.now,
  get: config.get,
  load: playerService.loadPlayer,
  save: playerService.savePlayer,
  drain: playerService.drainPendingSaves,
  grant: raid.addRewardToPlayer,
};
Date.now = () => now;
config.get = (name) => fixtures[name] || {};
raid.addRewardToPlayer = (player, itemId, count) => {
  const id = Number(itemId) || 0;
  const amount = Number(count) || 0;
  player.items = player.items || {};
  player.items[id] = (Number(player.items[id]) || 0) + amount;
};

const store = new Map();
let saves = 0;
playerService.loadPlayer = async (userId) => clone(store.get(String(userId)) || null);
playerService.drainPendingSaves = async () => {};
playerService.savePlayer = async (userId, player) => {
  saves += 1;
  const saved = clone(player);
  store.set(String(userId), saved);
  return saved;
};

const item = require(path.join(appRoot, 'src', 'handlers', 'item'));
const packet = (result, tag, msgUid) => (Array.isArray(result) ? result : [result]).find((row) => (
  Number(row && row.tag) === Number(tag) && (msgUid == null || Number(row.msgUid) === Number(msgUid))
));

async function run() {
  let checks = 0;
  const check = (value, message) => { assert(value, message); checks += 1; };

  store.set('activity-user', makePlayer('activity-user'));
  const first = await item.handleMultiBuyItem({ require: { [FREE_A]: 1 } }, { userId: 'activity-user' }, 1);
  check(packet(first, 1202, 1).data.result === 0, 'activity 21 free package was rejected');
  check(store.get('activity-user').items[4] === 10, 'activity 21 reward mismatch');
  check(store.get('activity-user').activityInfo.dailyShopClaims[String(ACTIVITY_A)][String(FREE_A)].count === 1, 'activity 21 daily ledger missing');

  const replay = await item.handleMultiBuyItem({ require: { [FREE_A]: 1 } }, { userId: 'activity-user' }, 2);
  check(packet(replay, 1202, 2).data.code === 'limit reached' || packet(replay, 1202, 2).data.result !== 0, 'same-day replay bypassed generic policy');
  check(store.get('activity-user').items[4] === 10, 'same-day replay granted a second reward');

  const concurrent = makePlayer('concurrent-activity');
  store.set('concurrent-activity', concurrent);
  const [left, right] = await Promise.all([
    item.handleMultiBuyItem({ require: { [FREE_B]: 1 } }, { userId: 'concurrent-activity' }, 3),
    item.handleMultiBuyItem({ require: { [FREE_B]: 1 } }, { userId: 'concurrent-activity' }, 4),
  ]);
  const successes = [left, right].filter((result) => packet(result, 1202)?.data?.result === 0);
  check(successes.length === 1, 'concurrent activity claims were not serialized');
  check(store.get('concurrent-activity').items[4] === 10, 'concurrent activity claim duplicated reward');

  now += DAY;
  const next = await item.handleMultiBuyItem({ require: { [FREE_A]: 1 } }, { userId: 'activity-user' }, 5);
  check(packet(next, 1202, 5).data.result === 0, 'next GMT+8 day did not reopen free package');
  check(store.get('activity-user').items[4] === 20, 'next-day reward mismatch');

  const before = clone(store.get('activity-user'));
  const invalid = await item.handleMultiBuyItem({ require: { [INVALID]: 1 } }, { userId: 'activity-user' }, 6);
  check(packet(invalid, 1202, 6).data.code === 'SHOP_REWARD_CONFIG_INVALID', 'empty free reward row was not fail-closed');
  check(JSON.stringify(store.get('activity-user')) === JSON.stringify(before), 'invalid free row mutated player');
  check(saves === 3, 'unexpected save count for successful claims');

  console.log(JSON.stringify({ result: 'PASS', checks, activities: [ACTIVITY_A, ACTIVITY_B], freeShopIds: [FREE_A, FREE_B] }, null, 2));
}

run().finally(() => {
  Date.now = original.now;
  config.get = original.get;
  playerService.loadPlayer = original.load;
  playerService.savePlayer = original.save;
  playerService.drainPendingSaves = original.drain;
  raid.addRewardToPlayer = original.grant;
}).catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});

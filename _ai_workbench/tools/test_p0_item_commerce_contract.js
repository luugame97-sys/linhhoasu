'use strict';

/**
 * Local-only P0 contract probe for item/commerce handlers.
 *
 * This script deliberately replaces ConfigService and PlayerService with
 * in-memory fixtures/stubs.  It never opens a socket, talks to Mongo/Redis,
 * sends a payment request, or mutates a VPS.  Run from the repository root:
 *
 *   node _ai_workbench/tools/test_p0_item_commerce_contract.js
 *
 * Optional handler overrides are useful when checking an isolated candidate:
 *   P0_ITEM_HANDLER_PATH=... P0_COMMERCE_HANDLER_PATH=... node ...
 */

const assert = require('assert');
const path = require('path');

process.env.NODE_ENV = 'test';

const repoRoot = path.resolve(__dirname, '..', '..');
const appRoot = process.env.APP_ROOT
  ? path.resolve(process.env.APP_ROOT)
  : path.join(repoRoot, 'linhhoasu', 'lhs', 'newServer');

const config = require(path.join(appRoot, 'src', 'services', 'ConfigService'));
const playerService = require(path.join(appRoot, 'src', 'services', 'PlayerService'));
const raid = require(path.join(appRoot, 'src', 'handlers', 'raid'));

// Fixed clock: 2026-09-02 00:30 in GMT+8.  The previous timestamp below is
// 2026-09-01 23:00 in GMT+8, which is <24h old but a different claim day.
const NOW = Date.UTC(2026, 8, 1, 16, 30, 0);
const PREVIOUS_LOCAL_DAY = Date.UTC(2026, 8, 1, 15, 0, 0);
const SAME_LOCAL_DAY = Date.UTC(2026, 8, 1, 16, 0, 0);

const fixtures = {
  ShopConfig: {
    // Free goods remain a valid path and must consume its configured cost.
    101: {
      id: 101,
      payId: 0,
      cost: [{ id: 2, count: 10 }],
      costAgain: [],
      rewards: [{ id: 1, count: 5 }],
      extraRewards: [],
      firstRewards: [],
      subsequentRewards: [],
      limit: 0,
      limitType: 0,
    },
    // Forged requests for this row must never grant the paid reward.  Empty
    // cost is intentional: this is the production bypass shape found in the
    // 614 pay-linked rows.
    9001: {
      id: 9001,
      payId: 12345,
      cost: [],
      costAgain: [],
      rewards: [{ id: 1, count: 999 }],
      extraRewards: [],
      firstRewards: [],
      subsequentRewards: [],
      limit: 0,
      limitType: 0,
    },
    // Month-card purchase/daily fixture.  `rewards` are purchase-time rows;
    // `extraRewards` are the daily claim rows from the client contract.
    11000001: {
      id: 11000001,
      payId: 11000001,
      type: 8,
      cost: [],
      costAgain: [],
      rewards: [{ id: 1, count: 1980 }],
      extraRewards: [{ id: 1, count: 100 }, { id: 4, count: 100 }],
      firstRewards: [],
      subsequentRewards: [],
      days: 30,
      limit: 0,
      limitType: 0,
    },
    50001: {
      id: 50001,
      payId: 50001,
      cost: [],
      costAgain: [],
      rewards: [],
      extraRewards: [],
      firstRewards: [],
      subsequentRewards: [],
      limit: 0,
      limitType: 0,
    },
    50002: {
      id: 50002,
      payId: 50002,
      cost: [],
      costAgain: [],
      rewards: [],
      extraRewards: [],
      firstRewards: [],
      subsequentRewards: [],
      limit: 0,
      limitType: 0,
    },
  },
  PrivilegeConfig: {
    11000001: { id: 11000001, groups: {} },
  },
  ShopGiftCondConfig: {
    50001: { id: 50001, duration: 1440, qualityShow: 6 },
    50010: { id: 50010, duration: 1440, qualityShow: 7 },
    50011: { id: 50011, duration: 1440, qualityShow: 7 },
  },
  // Three steps let the probe verify both current-index advancement and final
  // removal.  The reward values are intentionally distinct from the old
  // hard-coded 1 x (30 + index * 10) fallback.
  ShopGiftConfig: {
    50001: {
      1: {
        id: 50001,
        index: 1,
        type: 3,
        rewards: [{ id: 160002, count: 5 }, { id: 4, count: 10 }],
      },
      2: {
        id: 50001,
        index: 2,
        type: 3,
        rewards: [{ id: 175, count: 25 }],
      },
      3: {
        id: 50001,
        index: 3,
        type: 3,
        rewards: [{ id: 2, count: 777 }],
      },
    },
    // A paid current row is never claimable through 1241.  The client routes
    // type=1 through recharge instead, so accepting this fixture would restore
    // a second free paid-goods bypass.
    50010: {
      1: {
        id: 50010,
        index: 1,
        type: 1,
        shopId: 50001,
        rewards: [{ id: 1, count: 5000 }],
      },
    },
    // A type=2 step requires the ad-verified route and must not be claimable
    // as a free 1241 reward.
    50011: {
      1: {
        id: 50011,
        index: 1,
        type: 2,
        rewards: [{ id: 175, count: 25 }],
      },
    },
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function grantStub(player, itemId, count) {
  const id = Math.max(0, Math.floor(Number(itemId) || 0));
  const amount = Math.max(0, Math.floor(Number(count) || 0));
  if (!player || id <= 0 || amount <= 0) return;
  player.currencies = player.currencies && typeof player.currencies === 'object'
    ? player.currencies
    : { diamond: 0, silver: 0, gold: 0 };
  player.items = player.items && typeof player.items === 'object' ? player.items : {};
  if (id === 1) player.currencies.diamond = (Number(player.currencies.diamond) || 0) + amount;
  else if (id === 2) player.currencies.silver = (Number(player.currencies.silver) || 0) + amount;
  else if (id === 6) player.currencies.gold = (Number(player.currencies.gold) || 0) + amount;
  else if (id === 3) player.exp = (Number(player.exp) || 0) + amount;
  else player.items[id] = (Number(player.items[id]) || 0) + amount;
}

// The handlers import these two functions by value.  Replacing them before
// requiring the handlers keeps the probe entirely in memory and avoids task,
// equipment, and persistence side effects unrelated to this P0 contract.
const originalRaidGrant = raid.addRewardToPlayer;
const originalRaidExp = raid.addExpToPlayer;
raid.addRewardToPlayer = grantStub;
raid.addExpToPlayer = (player, amount) => grantStub(player, 3, amount);

const originalConfigGet = config.get;
config.get = (name) => fixtures[name] || {};

let saveCount = 0;
const savedSnapshots = [];
const originalSavePlayer = playerService.savePlayer;
const originalSavePlayerDeferred = playerService.savePlayerDeferred;
playerService.savePlayer = async (_userId, player) => {
  saveCount += 1;
  savedSnapshots.push(clone(player));
  return player;
};
playerService.savePlayerDeferred = async (_userId, player) => {
  saveCount += 1;
  savedSnapshots.push(clone(player));
  return player;
};

const originalDateNow = Date.now;
Date.now = () => NOW;

const itemPath = process.env.P0_ITEM_HANDLER_PATH
  ? path.resolve(process.env.P0_ITEM_HANDLER_PATH)
  : path.join(appRoot, 'src', 'handlers', 'item');
const commercePath = process.env.P0_COMMERCE_HANDLER_PATH
  ? path.resolve(process.env.P0_COMMERCE_HANDLER_PATH)
  : path.join(appRoot, 'src', 'handlers', 'commerce-compat');
const item = require(itemPath);
const commerce = require(commercePath);

function packetList(result) {
  return Array.isArray(result) ? result : [result];
}

function packet(result, tag) {
  return packetList(result).find((row) => Number(row && row.tag) === Number(tag)) || null;
}

function makePlayer(overrides = {}) {
  return {
    userId: 'p0-contract-user',
    playerId: 'p0-contract-player',
    name: 'P0 Contract',
    level: 60,
    exp: 0,
    currencies: { diamond: 100, silver: 100, gold: 0 },
    items: {},
    rechargeInfo: {
      records: [],
      monthCards: {},
      monthCardRecords: {},
    },
    shopInfo: {
      buyRecords: {},
      chainPack: [],
    },
    taskInfo: { tasks: {}, tasksMap: {} },
    roleInfo: {},
    ...overrides,
  };
}

function stateSnapshot(player) {
  return clone({
    currencies: player.currencies,
    items: player.items,
    exp: player.exp,
    rechargeInfo: player.rechargeInfo,
    shopInfo: player.shopInfo,
  });
}

function assertNoMutation(before, player, label) {
  assert.deepStrictEqual(stateSnapshot(player), before, `${label}: player mutated`);
}

function rewardRows(response) {
  const data = response && response.data ? response.data : {};
  const info = data.rewardInfo || {};
  return Array.isArray(info.items) ? info.items.map((row) => ({ id: Number(row.id), count: Number(row.count) })) : [];
}

async function runPaidGoodsContract() {
  saveCount = 0;
  savedSnapshots.length = 0;

  const player = makePlayer();
  const session = { userId: player.userId, player };
  const before = stateSnapshot(player);

  const forged1202 = await item.handleMultiBuyItem({ require: { 9001: 1 } }, session, 101);
  const forged1202Packet = packet(forged1202, 1202);
  assert(forged1202Packet && forged1202Packet.data && forged1202Packet.data.result !== 0,
    '1202 accepted a pay-linked goods row');
  assertNoMutation(before, player, '1202 paid-goods rejection');
  assert.strictEqual(saveCount, 0, '1202 paid-goods rejection persisted a mutation');

  const forged1210 = await item.handleShopBuy({ goodsId: 9001, count: 1 }, session, 102);
  const forged1210Packet = packet(forged1210, 1210);
  assert(forged1210Packet && forged1210Packet.data && forged1210Packet.data.result !== 0,
    '1210 accepted a pay-linked goods row');
  assertNoMutation(before, player, '1210 paid-goods rejection');
  assert.strictEqual(saveCount, 0, '1210 paid-goods rejection persisted a mutation');

  // A mixed request must be atomic: rejecting the paid row cannot still grant
  // the free row that appeared earlier in the object iteration.
  const mixed = await item.handleMultiBuyItem({ require: { 101: 1, 9001: 1 } }, session, 103);
  const mixedPacket = packet(mixed, 1202);
  assert(mixedPacket && mixedPacket.data && mixedPacket.data.result !== 0,
    'mixed 1202 request was not rejected');
  assertNoMutation(before, player, 'mixed paid/free rejection');
  assert.strictEqual(saveCount, 0, 'mixed paid/free rejection persisted a mutation');

  // Control: a genuinely free row remains usable and consumes exactly its
  // configured cost while granting its configured reward.
  const free = await item.handleMultiBuyItem({ require: { 101: 1 } }, session, 104);
  const freePacket = packet(free, 1202);
  assert(freePacket && freePacket.data && freePacket.data.result === 0, 'free goods row was incorrectly blocked');
  assert.strictEqual(player.currencies.silver, 90, 'free row did not consume silver cost');
  assert.strictEqual(player.currencies.diamond, 105, 'free row did not grant configured reward');
  assert.strictEqual(saveCount, 1, 'free row did not persist exactly once');
  return { checks: 8, name: 'paid goods blocked / free control' };
}

function makeMonthPlayer(monthCards, monthCardRecords = {}) {
  return makePlayer({
    rechargeInfo: {
      records: [{ id: 11000001, count: 1 }],
      monthCards: { 11000001: monthCards },
      monthCardRecords,
    },
  });
}

async function runMonthClaimContract() {
  saveCount = 0;
  savedSnapshots.length = 0;

  const active = makeMonthPlayer(NOW + (2 * 24 * 60 * 60 * 1000), { 11000001: PREVIOUS_LOCAL_DAY });
  const activeSession = { userId: active.userId, player: active };
  const beforeDiamond = active.currencies.diamond;
  const beforeBaozi = active.items[4] || 0;
  const success = await commerce.handleMonthcardsReward({ id: 11000001 }, activeSession, 201);
  const successPacket = packet(success, 1211);
  assert(successPacket && successPacket.data && successPacket.data.result === 0,
    'active month card with previous GMT+8-day claim was rejected');
  assert.deepStrictEqual(rewardRows(successPacket), [{ id: 1, count: 100 }, { id: 4, count: 100 }],
    'month claim did not use configured extraRewards only');
  assert.strictEqual(active.currencies.diamond, beforeDiamond + 100, 'month daily diamond delta is wrong');
  assert.strictEqual(active.items[4], beforeBaozi + 100, 'month daily item delta is wrong');
  assert.strictEqual(saveCount, 1, 'month claim did not persist exactly once');

  // Sequential replay on the same GMT+8 day is idempotently rejected.
  const afterFirst = stateSnapshot(active);
  const replay = await commerce.handleMonthcardsReward({ id: 11000001 }, activeSession, 202);
  const replayPacket = packet(replay, 1211);
  assert(replayPacket && replayPacket.data && replayPacket.data.result !== 0,
    'month claim replay on the same day was accepted');
  assertNoMutation(afterFirst, active, 'month same-day replay');
  assert.strictEqual(saveCount, 1, 'month same-day replay persisted a mutation');

  // Unknown ID, inactive card, and expired card are all fail-closed.
  const unknown = makePlayer();
  const unknownBefore = stateSnapshot(unknown);
  const unknownResult = await commerce.handleMonthcardsReward({ id: 999999 }, { userId: unknown.userId, player: unknown }, 203);
  assert(packet(unknownResult, 1211).data.result !== 0, 'unknown month-card ID was accepted');
  assertNoMutation(unknownBefore, unknown, 'unknown month-card ID');

  const inactive = makeMonthPlayer(0, {});
  const inactiveBefore = stateSnapshot(inactive);
  const inactiveResult = await commerce.handleMonthcardsReward({ id: 11000001 }, { userId: inactive.userId, player: inactive }, 204);
  assert(packet(inactiveResult, 1211).data.result !== 0, 'inactive month card was accepted');
  assertNoMutation(inactiveBefore, inactive, 'inactive month card');

  const expired = makeMonthPlayer(NOW - 1, {});
  const expiredBefore = stateSnapshot(expired);
  const expiredResult = await commerce.handleMonthcardsReward({ id: 11000001 }, { userId: expired.userId, player: expired }, 205);
  assert(packet(expiredResult, 1211).data.result !== 0, 'expired month card was accepted');
  assertNoMutation(expiredBefore, expired, 'expired month card');

  // A timestamp in the same GMT+8 day but less than 24h old must still be
  // blocked (guards against a naïve elapsed-time-only implementation).
  const sameDay = makeMonthPlayer(NOW + 1, { 11000001: SAME_LOCAL_DAY });
  const sameDayBefore = stateSnapshot(sameDay);
  const sameDayResult = await commerce.handleMonthcardsReward({ id: 11000001 }, { userId: sameDay.userId, player: sameDay }, 206);
  assert(packet(sameDayResult, 1211).data.result !== 0, 'same GMT+8-day month claim was accepted');
  assertNoMutation(sameDayBefore, sameDay, 'same GMT+8-day month claim');

  return { checks: 13, name: 'month validation / daily reward / idempotency' };
}

function chainRow(player, id) {
  const rows = player.shopInfo && Array.isArray(player.shopInfo.chainPack) ? player.shopInfo.chainPack : [];
  return rows.find((row) => Number(row && row.id) === Number(id)) || null;
}

async function runChainTriggerContract() {
  saveCount = 0;
  savedSnapshots.length = 0;

  const player = makePlayer();
  const session = { userId: player.userId, player };
  const opened = await commerce.handleTriggerPackage({ trigger: 50001, param: 0 }, session, 290);
  const openedPacket = packet(opened, 1240);
  const openedState = packet(opened, 1231);
  assert(openedPacket && openedPacket.data && openedPacket.data.result === 0,
    'valid chain trigger was rejected');
  assert(openedState && openedState.data && openedState.data.index === 1,
    'chain trigger did not seed the first configured index');
  assert.strictEqual(chainRow(player, 50001).index, 1, 'chain trigger state did not start at index 1');
  assert.strictEqual(saveCount, 1, 'chain trigger did not persist once');

  const activeBefore = stateSnapshot(player);
  const activeAgain = await commerce.handleTriggerPackage({ trigger: 50001, param: 0 }, session, 291);
  assert(packet(activeAgain, 1240).data.result === 0, 'active chain retrigger did not return current state');
  assert.strictEqual(packet(activeAgain, 1231).data.index, 1, 'active chain retrigger reset/changed the index');
  assertNoMutation(activeBefore, player, 'active chain retrigger');
  assert.strictEqual(saveCount, 1, 'active chain retrigger persisted/reset state');

  const completed = makePlayer({
    shopInfo: { buyRecords: {}, chainPack: [], chainCompleted: { 50001: NOW - 1 } },
  });
  const completedBefore = stateSnapshot(completed);
  const completedResult = await commerce.handleTriggerPackage(
    { trigger: 50001, param: 0 }, { userId: completed.userId, player: completed }, 292,
  );
  assert(packet(completedResult, 1240).data.result !== 0, 'completed chain was reopened');
  assertNoMutation(completedBefore, completed, 'completed chain retrigger');

  return { checks: 10, name: 'chain trigger seed / replay / completed guard' };
}

async function runChainContract() {
  saveCount = 0;
  savedSnapshots.length = 0;

  const player = makePlayer({
    shopInfo: {
      buyRecords: {},
      chainPack: [{ id: 50001, index: 1, expireTime: NOW + 60 * 60 * 1000, trigger: 1240 }],
    },
  });
  const session = { userId: player.userId, player };

  const first = await commerce.handleChainPackageReward({ id: 50001, index: 1 }, session, 301);
  const firstPacket = packet(first, 1241);
  assert(firstPacket && firstPacket.data && firstPacket.data.result === 0, 'chain current index claim failed');
  assert.deepStrictEqual(rewardRows(firstPacket), [{ id: 160002, count: 5 }, { id: 4, count: 10 }],
    'chain claim did not use ShopGiftConfig rewards');
  assert.deepStrictEqual(chainRow(player, 50001) && chainRow(player, 50001).index, 2,
    'chain current index did not advance to 2');
  assert(packet(first, 1231), 'chain non-final claim did not emit updated chain state');

  const afterFirst = stateSnapshot(player);
  const replay = await commerce.handleChainPackageReward({ id: 50001, index: 1 }, session, 302);
  assert(packet(replay, 1241).data.result !== 0, 'chain replay of index 1 was accepted');
  assertNoMutation(afterFirst, player, 'chain replay index 1');

  const outOfOrder = await commerce.handleChainPackageReward({ id: 50001, index: 3 }, session, 303);
  assert(packet(outOfOrder, 1241).data.result !== 0, 'chain out-of-order index 3 was accepted');
  assertNoMutation(afterFirst, player, 'chain out-of-order index 3');

  const second = await commerce.handleChainPackageReward({ id: 50001, index: 2 }, session, 304);
  assert(packet(second, 1241).data.result === 0, 'chain current index 2 claim failed');
  assert.deepStrictEqual(rewardRows(packet(second, 1241)), [{ id: 175, count: 25 }],
    'chain index 2 returned the wrong configured reward');
  assert.strictEqual(chainRow(player, 50001).index, 3, 'chain current index did not advance to 3');

  const final = await commerce.handleChainPackageReward({ id: 50001, index: 3 }, session, 305);
  assert(packet(final, 1241).data.result === 0, 'chain final claim failed');
  assert.deepStrictEqual(rewardRows(packet(final, 1241)), [{ id: 2, count: 777 }],
    'chain final claim returned the wrong configured reward');
  assert.strictEqual(chainRow(player, 50001), null, 'final chain claim did not remove the pack');

  const afterFinal = stateSnapshot(player);
  const finalReplay = await commerce.handleChainPackageReward({ id: 50001, index: 3 }, session, 306);
  assert(packet(finalReplay, 1241).data.result !== 0, 'chain final replay was accepted');
  assertNoMutation(afterFinal, player, 'chain final replay');

  const expired = makePlayer({
    shopInfo: { chainPack: [{ id: 50001, index: 1, expireTime: NOW - 1 }] },
  });
  const expiredBefore = stateSnapshot(expired);
  const expiredResult = await commerce.handleChainPackageReward(
    { id: 50001, index: 1 }, { userId: expired.userId, player: expired }, 307,
  );
  assert(packet(expiredResult, 1241).data.result !== 0, 'expired chain pack was accepted');
  assertNoMutation(expiredBefore, expired, 'expired chain pack');

  const paidStep = makePlayer({
    shopInfo: { chainPack: [{ id: 50010, index: 1, expireTime: NOW + 60 * 60 * 1000 }] },
  });
  const paidStepBefore = stateSnapshot(paidStep);
  const paidStepResult = await commerce.handleChainPackageReward(
    { id: 50010, index: 1 }, { userId: paidStep.userId, player: paidStep }, 310,
  );
  assert(packet(paidStepResult, 1241).data.result !== 0,
    '1241 accepted a paid type=1 chain row instead of requiring recharge');
  assertNoMutation(paidStepBefore, paidStep, 'paid type=1 chain row');

  const adStep = makePlayer({
    shopInfo: { chainPack: [{ id: 50011, index: 1, expireTime: NOW + 60 * 60 * 1000 }] },
  });
  const adStepBefore = stateSnapshot(adStep);
  const adStepResult = await commerce.handleChainPackageReward(
    { id: 50011, index: 1 }, { userId: adStep.userId, player: adStep }, 311,
  );
  assert.strictEqual(packet(adStepResult, 1241).data.code, 'CHAIN_PACKAGE_AD_REQUIRED',
    '1241 accepted a type=2 ad chain row without the ad route');
  assertNoMutation(adStepBefore, adStep, 'ad-gated type=2 chain row');

  // Concurrent duplicate requests must produce one reward at most.  The
  // result may be success+reject in either Promise order, but state/reward
  // cardinality must remain exactly one claim.
  const concurrent = makePlayer({
    shopInfo: { chainPack: [{ id: 50001, index: 1, expireTime: NOW + 60 * 60 * 1000 }] },
  });
  const concurrentSession = { userId: concurrent.userId, player: concurrent };
  const beforeConcurrent = stateSnapshot(concurrent);
  const concurrentResults = await Promise.all([
    commerce.handleChainPackageReward({ id: 50001, index: 1 }, concurrentSession, 308),
    commerce.handleChainPackageReward({ id: 50001, index: 1 }, concurrentSession, 309),
  ]);
  const concurrentSuccesses = concurrentResults.filter((result) => packet(result, 1241).data.result === 0);
  assert.strictEqual(concurrentSuccesses.length, 1, 'concurrent chain duplicate produced more than one success');
  assert.strictEqual(concurrent.items[160002], 5, 'concurrent chain duplicate granted reward twice');
  assert.strictEqual(concurrent.items[4], 10, 'concurrent chain duplicate granted Baozi twice');
  assert.notDeepStrictEqual(stateSnapshot(concurrent), beforeConcurrent, 'concurrent valid chain claim made no progress');

  return { checks: 22, name: 'chain config / current index / paid-step/ad guard / idempotency' };
}

async function run() {
  const results = [];
  if (process.env.P0_ONLY_MONTH !== '1' && process.env.P0_ONLY_CHAIN !== '1') {
    results.push(await runPaidGoodsContract());
  }
  if (process.env.P0_ONLY_PAID !== '1' && process.env.P0_ONLY_CHAIN !== '1') {
    results.push(await runMonthClaimContract());
  }
  if (process.env.P0_ONLY_PAID !== '1' && process.env.P0_ONLY_MONTH !== '1') {
    results.push(await runChainTriggerContract());
    results.push(await runChainContract());
  }
  const checks = results.reduce((sum, row) => sum + row.checks, 0);
  console.log(JSON.stringify({
    result: 'ok',
    scope: 'local-stub-only',
    checks,
    suites: results.map((row) => row.name),
    network: false,
    persistence: false,
  }));
}

run()
  .catch((error) => {
    console.error(JSON.stringify({
      result: 'fail',
      scope: 'local-stub-only',
      error: error && (error.stack || error.message || String(error)),
    }));
    process.exitCode = 1;
  })
  .finally(() => {
    // Restore shared module methods for embedders that require this script.
    config.get = originalConfigGet;
    playerService.savePlayer = originalSavePlayer;
    playerService.savePlayerDeferred = originalSavePlayerDeferred;
    raid.addRewardToPlayer = originalRaidGrant;
    raid.addExpToPlayer = originalRaidExp;
    Date.now = originalDateNow;
  });

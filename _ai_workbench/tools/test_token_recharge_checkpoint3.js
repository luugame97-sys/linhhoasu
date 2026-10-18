'use strict';

/** In-memory contract for the checkpoint-3 tag 1230 candidate. */

const assert = require('assert');
const path = require('path');

const appRoot = path.resolve(process.env.APP_ROOT || path.join(__dirname, '..', '..', 'linhhoasu', 'lhs', 'newServer'));
const config = require(path.join(appRoot, 'src', 'services', 'ConfigService.js'));
const playerService = require(path.join(appRoot, 'src', 'services', 'PlayerService.js'));
const serverConfig = require(path.join(appRoot, 'src', 'services', 'ServerConfigService.js'));

let saveCount = 0;
let failNextSave = false;
playerService.savePlayer = async (_userId, value) => {
  saveCount += 1;
  if (failNextSave) {
    failNextSave = false;
    throw new Error('CHECKPOINT3_SAVE_FAILURE');
  }
  return value;
};
playerService.savePlayerDeferred = async (_userId, value) => value;
serverConfig.getCurrentRechargeArea = async () => 1;

const compat = require(path.join(appRoot, 'src', 'handlers', 'compat.js'));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makePlayer(overrides = {}) {
  return {
    userId: 'checkpoint3-user',
    playerId: 'checkpoint3-player',
    level: 80,
    exp: 0,
    currencies: { diamond: 1000, silver: 1000, gold: 1000 },
    items: { 1001: 1_000_000, 1002: 1_000_000, 1003: 1_000_000 },
    rechargeInfo: { area: 1, records: [], monthCards: {}, monthCardRecords: {}, periodRecords: {} },
    shopInfo: { pack: [], chainPack: [] },
    roleInfo: {},
    taskInfo: { tasks: {}, tasksMap: {} },
    markModified() {},
    ...overrides,
  };
}

function snapshot(value) {
  return clone({
    currencies: value.currencies,
    items: value.items,
    exp: value.exp,
    rechargeInfo: value.rechargeInfo,
    shopInfo: value.shopInfo,
    fashionInfo: value.fashionInfo,
    gemInfo: value.gemInfo,
    other_attr_info: value.other_attr_info,
    equipInfo: value.equipInfo,
    roleInfo: value.roleInfo,
  });
}

function packets(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function packet(value, tag) {
  return packets(value).find((entry) => Number(entry && entry.tag) === Number(tag)) || null;
}

function rechargeCount(value, payId) {
  const found = (value.rechargeInfo.records || []).find((entry) => Number(entry.id) === Number(payId));
  return found ? Number(found.count) : 0;
}

function rewardInfo(value) {
  const result = packet(value, 1230);
  return (result && result.data && result.data.rewardInfo) || {};
}

async function run() {
  const checks = [];

  {
    const p = makePlayer();
    const beforeCost = p.items[1001];
    const result = await compat.handleTokenRecharge1230({ id: 11027001, multi: 2 }, { userId: p.userId, player: p }, 1);
    assert.strictEqual(packet(result, 1230).data.result, 0);
    assert.strictEqual(rechargeCount(p, 11027001), 2, 'multi record count mismatch');
    assert.strictEqual(p.items[1001], beforeCost - (6 * 2), 'multi token cost mismatch');
    assert.deepStrictEqual(rewardInfo(result).items, [{ id: 1, count: 120 }, { id: 2, count: 6000 }, { id: 4, count: 120 }], 'multi base rewards mismatch');
    checks.push('base_multi');
  }

  {
    const p = makePlayer();
    const beforeDiamond = p.currencies.diamond;
    const result = await compat.handleTokenRecharge1230({ id: 2000001, multi: 1 }, { userId: p.userId, player: p }, 2);
    const info = rewardInfo(result);
    assert.strictEqual(p.currencies.diamond, beforeDiamond + 120, 'first double was not granted exactly twice');
    assert.deepStrictEqual(info.items, [{ id: 1, count: 60 }]);
    assert.deepStrictEqual(info.extraReward[1].items, [{ id: 1, count: 60 }]);
    checks.push('first_double');
  }

  {
    const p = makePlayer({ rechargeInfo: { area: 1, records: [{ id: 2000001, count: 1 }], monthCards: {}, monthCardRecords: {}, periodRecords: {} } });
    const beforeDiamond = p.currencies.diamond;
    const result = await compat.handleTokenRecharge1230({ id: 2000001, multi: 1 }, { userId: p.userId, player: p }, 3);
    assert.strictEqual(p.currencies.diamond, beforeDiamond + 60, 'double replayed after first purchase');
    assert(!rewardInfo(result).extraReward[1], 'double metadata replayed after first purchase');
    checks.push('double_replay_blocked');
  }

  {
    const p = makePlayer();
    const result = await compat.handleTokenRecharge1230({ id: 11000001, multi: 1 }, { userId: p.userId, player: p }, 4);
    const items = rewardInfo(result).items || [];
    assert(items.some((entry) => entry.id === 1 && entry.count === 1980), 'month purchase reward mismatch');
    assert(!items.some((entry) => entry.id === 4), 'month daily extra leaked into purchase');
    assert(Number(p.rechargeInfo.monthCards[11000001]) > Date.now(), 'month card was not activated');
    checks.push('month_purchase_vs_daily');
  }

  {
    const p = makePlayer({ activityInfo: { datas: [] } });
    const beforeToken = p.items[1001];
    const beforeDiamond = p.currencies.diamond;
    const first = await compat.handleTokenRecharge1230({ id: 10501, multi: 1 }, { userId: p.userId, player: p }, 41);
    assert.strictEqual(packet(first, 1230).data.result, 0, `Activity9 purchase failed: ${JSON.stringify(first)}`);
    assert(packet(first, 1701), 'Activity9 activation packet missing');
    assert.strictEqual(p.items[1001], beforeToken - 68, 'Activity9 price drifted');
    assert.strictEqual(p.currencies.diamond, beforeDiamond, 'Activity9 received synthetic fallback diamond');
    assert.strictEqual(rechargeCount(p, 10501), 1, 'Activity9 record missing');
    const paidRow = (p.activityInfo.datas || []).find((entry) => (entry.recordList || []).includes(10501));
    assert(paidRow, 'Activity9 did not activate paid record');
    const afterFirstToken = p.items[1001];
    const replay = await compat.handleTokenRecharge1230({ id: 10501, multi: 1 }, { userId: p.userId, player: p }, 42);
    assert.strictEqual(packet(replay, 1230).data.result, 0, 'Activity9 repair replay failed');
    assert.strictEqual(p.items[1001], afterFirstToken, 'Activity9 repair replay charged again');
    checks.push('activity9_regression');
  }

  {
    const p = makePlayer();
    const first = await compat.handleTokenRecharge1230({ id: 10902, multi: 1 }, { userId: p.userId, player: p }, 43);
    assert.strictEqual(packet(first, 1230).data.result, 0, 'type6 lifetime package was blocked');
    assert.strictEqual(rechargeCount(p, 10902), 1);
    const before = snapshot(p);
    p.rechargeInfo.records.find((entry) => Number(entry.id) === 10902).count = 5;
    const replay = await compat.handleTokenRecharge1230({ id: 10902, multi: 1 }, { userId: p.userId, player: p }, 44);
    assert.strictEqual(packet(replay, 1230).data.code, 'LIMIT_REACHED');
    assert.strictEqual(p.items[1001], before.items[1001], 'type6 limit rejection charged token');
    checks.push('type6_lifetime_limit');
  }

  {
    const p = makePlayer();
    const result = await compat.handleTokenRecharge1230({ id: 11000003, multi: 1 }, { userId: p.userId, player: p }, 5);
    assert(packet(result, 1800), 'fashion native sync packet missing');
    assert((p.fashionInfo.activateFashion || []).includes(29001), 'fashion ownership was not activated');
    assert(!p.items[29001], 'fashion was incorrectly granted as a bag item');
    checks.push('native_fashion');
  }

  {
    const p = makePlayer();
    const result = await compat.handleTokenRecharge1230({ id: 11006006, multi: 1 }, { userId: p.userId, player: p }, 6);
    assert(packet(result, 3900), 'gem info sync packet missing');
    assert(packet(result, 3901), 'gem update packet missing');
    assert(p.other_attr_info && p.other_attr_info.gemInfo && Array.isArray(p.other_attr_info.gemInfo.gems)
      && p.other_attr_info.gemInfo.gems.length > 0, 'gem was not granted natively');
    checks.push('native_gem');
  }

  for (const [params, code] of [
    [{ id: 2000258, multi: 1 }, 'CASH_ONLY_PACKAGE'],
    [{ id: 50001, multi: 1 }, 'CHAIN_PACKAGE_REQUIRES_CHAIN_RESOLVER'],
    [{ id: 11000018, multi: 1 }, 'ACTIVITY999_REQUIRES_ACTIVITY_RESOLVER'],
    [{ id: 999999999, multi: 1 }, 'RECHARGE_CONFIG_MISSING'],
    [{ id: 11027001, multi: 1.5 }, 'INVALID_MULTI'],
    [{ id: 11027001, multi: 100 }, 'INVALID_MULTI'],
  ]) {
    const p = makePlayer();
    const before = snapshot(p);
    const beforeSaves = saveCount;
    const result = await compat.handleTokenRecharge1230(params, { userId: p.userId, player: p }, 20);
    assert.notStrictEqual(packet(result, 1230).data.result, 0, `${code} request succeeded`);
    assert.strictEqual(packet(result, 1230).data.code, code, `${code} response code mismatch`);
    assert.deepStrictEqual(snapshot(p), before, `${code} mutated player`);
    assert.strictEqual(saveCount, beforeSaves, `${code} persisted player`);
  }
  checks.push('fail_closed_matrix');

  {
    const p = makePlayer({ items: { 1001: 0, 1002: 0, 1003: 0 } });
    const before = snapshot(p);
    const result = await compat.handleTokenRecharge1230({ id: 11027001, multi: 1 }, { userId: p.userId, player: p }, 30);
    assert.strictEqual(packet(result, 1230).data.code, 'NOT_ENOUGH_TOKEN');
    assert.deepStrictEqual(snapshot(p), before, 'insufficient token mutated player');
    checks.push('insufficient_token');
  }

  {
    const p = makePlayer();
    const before = snapshot(p);
    failNextSave = true;
    await assert.rejects(
      () => compat.handleTokenRecharge1230({ id: 11027001, multi: 1 }, { userId: p.userId, player: p }, 31),
      /CHECKPOINT3_SAVE_FAILURE/
    );
    assert.deepStrictEqual(snapshot(p), before, 'save failure did not restore in-memory player');
    checks.push('save_failure_rollback');
  }

  assert.strictEqual(Object.keys(config.get('PayConfig') || {}).length, 694);
  assert.strictEqual(Object.values(config.get('ShopConfig') || {}).filter((entry) => Number(entry && entry.payId) > 0).length, 614);
  console.log(JSON.stringify({ result: 'ok', checks: checks.length, names: checks, saves: saveCount, network: false, persistence: false }));
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

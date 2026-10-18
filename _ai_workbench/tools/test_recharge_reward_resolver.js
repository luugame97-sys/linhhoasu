'use strict';

/** Catalog and handler contract for the checkpoint-3 token recharge resolver. */

const assert = require('assert');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const appRoot = process.env.APP_ROOT
  ? path.resolve(process.env.APP_ROOT)
  : path.join(repoRoot, 'linhhoasu', 'lhs', 'newServer');
const config = require(path.join(appRoot, 'src', 'services', 'ConfigService.js'));
const resolverPath = process.env.RECHARGE_RESOLVER_PATH
  ? path.resolve(process.env.RECHARGE_RESOLVER_PATH)
  : path.join(appRoot, 'src', 'services', 'RechargeRewardResolver.js');
const resolver = require(resolverPath);

function player(records = [], extra = {}) {
  return {
    rechargeInfo: { records, periodRecords: {}, ...(extra.rechargeInfo || {}) },
    ...extra,
  };
}

function row(id, count) {
  return { id, count };
}

function runTargetedContracts() {
  let checks = 0;

  const base = resolver.resolveRechargeRewards(player(), { route: 'token', payId: 11027001, multi: 1 });
  assert(base.ok && base.rows.length > 0, 'normal base package was rejected'); checks += 1;

  const activity9 = resolver.resolveRechargeRewards(player(), { route: 'token', payId: 10501, multi: 1, allowActivity9: true });
  assert(activity9.ok && activity9.specialized === 'activity9' && activity9.rows.length === 0, 'Activity9 regression'); checks += 1;

  const activity999 = resolver.resolveRechargeRewards(player(), { route: 'token', payId: 11000018, multi: 1 });
  assert(!activity999.ok && activity999.reason === 'ACTIVITY999_REQUIRES_ACTIVITY_RESOLVER', 'Activity999 did not fail closed'); checks += 1;

  const cashOnly = resolver.resolveRechargeRewards(player(), { route: 'token', payId: 2000258, multi: 1 });
  assert(!cashOnly.ok && cashOnly.reason === 'CASH_ONLY_PACKAGE', 'cash-only type14 was accepted by token route'); checks += 1;

  const cashFirst = resolver.resolveRechargeRewards(player(), { route: 'cash', payId: 2000258, multi: 1, amount: 1000 });
  assert(cashFirst.ok, 'cash first package was rejected');
  assert.deepStrictEqual(cashFirst.rows, [row(1, 2000), row(62, 10), row(23022, 1)], 'cash firstRewards mismatch'); checks += 2;

  const cashSub = resolver.resolveRechargeRewards(player([{ id: 2000258, count: 1 }]), { route: 'cash', payId: 2000258, multi: 1, amount: 1000 });
  assert.deepStrictEqual(cashSub.rows, [row(1, 1500), row(53, 1), row(62, 5), row(81, 1)], 'cash subsequentRewards mismatch'); checks += 1;

  const multiTransition = resolver.resolveRechargeRewards(player(), { route: 'cash', payId: 2000258, multi: 2, amount: 1000 });
  assert.deepStrictEqual(
    multiTransition.rows,
    [row(1, 3500), row(53, 1), row(62, 15), row(81, 1), row(23022, 1)],
    'multi did not transition first -> subsequent exactly once'
  ); checks += 1;

  const month = resolver.resolveRechargeRewards(player(), { route: 'token', payId: 11000001, multi: 1 });
  assert(month.ok && month.rows.some((entry) => entry.id === 1 && entry.count === 1980), 'month purchase base reward mismatch');
  assert(!month.rows.some((entry) => entry.id === 4), 'month daily extraRewards leaked into purchase'); checks += 2;

  const double = resolver.resolveRechargeRewards(player(), { route: 'token', payId: 2000001, multi: 1 });
  assert.deepStrictEqual(double.rows, [row(1, 60)], 'double normal rows mismatch');
  assert.deepStrictEqual(double.doubleRows, [row(1, 60)], 'double bonus rows mismatch'); checks += 2;

  const doubleUsed = resolver.resolveRechargeRewards(player([{ id: 2000001, count: 1 }]), { route: 'token', payId: 2000001, multi: 1 });
  assert.deepStrictEqual(doubleUsed.doubleRows, [], 'isDouble replayed after first purchase'); checks += 1;

  const cashDouble = resolver.resolveRechargeRewards(player(), { route: 'cash', payId: 2000001, multi: 1, amount: 6 });
  assert.deepStrictEqual(cashDouble.rows, [row(1, 60)], 'cash double normal rows mismatch');
  assert.deepStrictEqual(cashDouble.doubleRows, [row(1, 60)], 'cash double bonus rows mismatch'); checks += 2;

  const cashAmountMismatch = resolver.resolveRechargeRewards(player(), { route: 'cash', payId: 2000001, multi: 1, amount: 5 });
  assert(!cashAmountMismatch.ok && cashAmountMismatch.reason === 'AMOUNT_MISMATCH', 'cash amount mismatch was accepted'); checks += 1;

  const lifetime6 = resolver.resolveRechargeRewards(player(), { route: 'token', payId: 10902, multi: 1 });
  assert(lifetime6.ok && lifetime6.limitType === 6 && lifetime6.limit === 5, 'limitType6 was not treated as lifetime');
  const lifetime6Blocked = resolver.resolveRechargeRewards(player([{ id: 10902, count: 5 }]), { route: 'token', payId: 10902, multi: 1 });
  assert(!lifetime6Blocked.ok && lifetime6Blocked.reason === 'LIMIT_REACHED', 'limitType6 lifetime replay was accepted'); checks += 2;

  const chain = resolver.resolveRechargeRewards(player(), { route: 'token', payId: 50001, multi: 1 });
  assert(!chain.ok && chain.reason === 'CHAIN_PACKAGE_REQUIRES_CHAIN_RESOLVER', 'chain was accepted by generic resolver'); checks += 1;

  const legacy = resolver.resolveRechargeRewards(player(), { route: 'token', payId: 11000008, multi: 1 });
  assert(!legacy.ok && legacy.reason === 'SPECIALIZED_RECHARGE_REQUIRED', 'legacy 11000008 was opened'); checks += 1;

  const horse = resolver.resolveRechargeRewards(player(), { route: 'token', payId: 11026000, multi: 1 });
  assert(!horse.ok && horse.reason === 'SPECIALIZED_RECHARGE_REQUIRED', 'HorseRace extra contract was opened'); checks += 1;

  const dailyPlayer = player();
  const daily = resolver.resolveRechargeRewards(dailyPlayer, { route: 'token', payId: 11002, multi: 1 });
  assert(daily.ok && daily.period && daily.period.type === 'day', 'daily limit plan missing');
  resolver.applyPeriodPurchaseLedger(dailyPlayer, daily);
  const dailyReplay = resolver.resolveRechargeRewards(dailyPlayer, { route: 'token', payId: 11002, multi: 1 });
  assert(!dailyReplay.ok && dailyReplay.reason === 'LIMIT_REACHED', 'daily replay was accepted'); checks += 2;

  const weeklyPlayer = player();
  const weekly = resolver.resolveRechargeRewards(weeklyPlayer, { route: 'token', payId: 4000101, multi: 1 });
  assert(weekly.ok && weekly.period && weekly.period.type === 'week', 'weekly limit plan missing');
  resolver.applyPeriodPurchaseLedger(weeklyPlayer, weekly);
  const weeklyReplay = resolver.resolveRechargeRewards(weeklyPlayer, { route: 'token', payId: 4000101, multi: 1 });
  assert(!weeklyReplay.ok && weeklyReplay.reason === 'LIMIT_REACHED', 'weekly replay was accepted'); checks += 2;

  assert.strictEqual(resolver.parseMulti(0), 0); checks += 1;
  assert.strictEqual(resolver.parseMulti(1.5), 0); checks += 1;
  assert.strictEqual(resolver.parseMulti(100), 0); checks += 1;
  assert.strictEqual(resolver.parseMulti(99), 99); checks += 1;

  return checks;
}

function runCatalogContract() {
  const shop = config.get('ShopConfig') || {};
  const pay = config.get('PayConfig') || {};
  const paidRows = Object.values(shop).filter((entry) => Number(entry && entry.payId) > 0);
  assert.strictEqual(Object.keys(pay).length, 694, 'PayConfig count drifted');
  assert.strictEqual(paidRows.length, 614, 'paid ShopConfig count drifted');

  const outcomes = {};
  let syntheticFallbacks = 0;
  for (const entry of paidRows) {
    const payId = Number(entry.payId);
    const result = resolver.resolveRechargeRewards(player(), { route: 'token', payId, multi: 1, allowActivity9: true });
    const key = result.ok ? (result.specialized || 'generic') : result.reason;
    outcomes[key] = (outcomes[key] || 0) + 1;
    const hasConfiguredSixty = Array.isArray(entry.rewards)
      && entry.rewards.some((reward) => Number(reward.id) === 1 && Number(reward.count) === 60);
    if (result.ok && result.rows.some((reward) => reward.id === 1 && reward.count === 60) && !hasConfiguredSixty) {
      syntheticFallbacks += 1;
    }
  }
  assert.strictEqual(syntheticFallbacks, 0, 'synthetic ID1x60 fallback remains');
  assert.strictEqual(Object.values(outcomes).reduce((sum, count) => sum + count, 0), 614, 'catalog outcome total mismatch');
  return outcomes;
}

const checks = runTargetedContracts();
const outcomes = runCatalogContract();
console.log(JSON.stringify({ result: 'ok', checks, catalog: 614, outcomes, network: false, persistence: false }));

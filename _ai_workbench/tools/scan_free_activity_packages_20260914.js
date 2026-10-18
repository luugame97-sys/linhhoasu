'use strict';

// Read-only catalog/source scan. It never loads a player, connects to a
// service, or mutates game data.

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const dumpRoot = path.join(repoRoot, 'linhhoasu', 'lhs', 'newServer', 'scripts', '_tables_dump');
const sourceRoot = path.join(repoRoot, 'linhhoasu', 'lhs', 'newServer', 'src');
const reportPath = path.join(repoRoot, '_ai_workbench', 'reports', 'free_activity_packages_scan_20260914.json');

function table(name) {
  const raw = JSON.parse(fs.readFileSync(path.join(dumpRoot, `${name}.json`), 'utf8'));
  return raw && raw.data && typeof raw.data === 'object' ? raw.data : raw;
}

function rows(value) { return Array.isArray(value) ? value : []; }

const shop = table('ShopConfig');
const activityShop = table('ActivityShopConfig');
const gift = table('ShopGiftConfig');
const itemSource = fs.readFileSync(path.join(sourceRoot, 'handlers', 'item.js'), 'utf8');
const activitySource = fs.readFileSync(path.join(sourceRoot, 'handlers', 'activity.js'), 'utf8');
const commerceSource = fs.readFileSync(path.join(sourceRoot, 'handlers', 'commerce-compat.js'), 'utf8');

const freeShopRows = Object.entries(shop)
  .filter(([, row]) => Number(row && row.payId) === 0 && rows(row && row.cost).length === 0)
  .map(([id, row]) => ({
    shopId: Number(id),
    rewards: rows(row && row.rewards),
    rewardValid: rows(row && row.rewards).length > 0 && rows(row && row.rewards).every((reward) => (
      Number.isSafeInteger(Number(reward && reward.id))
      && Number(reward && reward.id) > 0
      && Number.isSafeInteger(Number(reward && reward.count))
      && Number(reward && reward.count) > 0
    )),
    shopLimit: Number(row && row.limit) || 0,
    shopLimitType: Number(row && row.limitType) || 0,
  }));

const linkedFreeRows = [];
for (const [activityId, map] of Object.entries(activityShop)) {
  for (const [shopId, policy] of Object.entries(map || {})) {
    const goods = shop[shopId] || shop[String(shopId)] || null;
    if (!goods || Number(goods.payId) !== 0 || rows(goods.cost).length !== 0) continue;
    linkedFreeRows.push({
      activityId: Number(activityId),
      shopId: Number(shopId),
      limit: Number(policy && policy.limit) || 0,
      limitType: Number(policy && policy.limitType) || 0,
      rewardValid: rows(goods.rewards).length > 0 && rows(goods.rewards).every((reward) => (
        Number(reward && reward.id) > 0 && Number(reward && reward.count) > 0
      )),
    });
  }
}

const chainSteps = [];
for (const [packageId, map] of Object.entries(gift)) {
  for (const step of Object.values(map || {})) {
    chainSteps.push({
      packageId: Number(packageId),
      index: Number(step && step.index) || 0,
      type: Number(step && step.type) || 0,
      rewardValid: rows(step && step.rewards).length > 0 && rows(step && step.rewards).every((reward) => (
        Number(reward && reward.id) > 0 && Number(reward && reward.count) > 0
      )),
    });
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  readOnly: true,
  catalog: {
    freeShopConfigRows: freeShopRows.length,
    freeShopConfigRowsWithValidRewards: freeShopRows.filter((row) => row.rewardValid).length,
    freeShopConfigRowsWithEmptyOrInvalidRewards: freeShopRows.filter((row) => !row.rewardValid).map((row) => row.shopId),
    activityLinkedFreeRows: linkedFreeRows.length,
    activityLinkedFreeDailyRows: linkedFreeRows.filter((row) => row.limitType === 1 && row.limit > 0).length,
    activityLinkedFreeRowsByLimitType: Object.fromEntries(
      [...new Set(linkedFreeRows.map((row) => row.limitType))]
        .sort((a, b) => a - b)
        .map((type) => [String(type), linkedFreeRows.filter((row) => row.limitType === type).length]),
    ),
    chainSteps: {
      total: chainSteps.length,
      byType: Object.fromEntries(
        [...new Set(chainSteps.map((row) => row.type))]
          .sort((a, b) => a - b)
          .map((type) => [String(type), chainSteps.filter((row) => row.type === type).length]),
      ),
      invalidRewardSteps: chainSteps.filter((row) => !row.rewardValid),
    },
  },
  sourceGates: {
    genericActivityPolicy: (() => {
      const start = activitySource.indexOf('function getActiveActivityShopPolicy');
      const end = activitySource.indexOf('function commitDailyShopClaim', start);
      const resolver = activitySource.slice(start, end > start ? end : undefined);
      return resolver.includes('getActivityShopPolicy(activityId, safeShopId)')
        && !/getActivityTypeById\(activityId\) !== 43/.test(resolver);
    })(),
    fishingLedgerExcluded: activitySource.includes('FISHING_EVENT_FREE_SHOP_ID'),
    genericFreePurchaseLock: itemSource.includes('withFreeActivityPurchaseLock'),
    emptyRewardFailClosed: itemSource.includes('SHOP_REWARD_CONFIG_INVALID'),
    chainAdGuard: commerceSource.includes('CHAIN_PACKAGE_AD_REQUIRED'),
    chainFreeGuard: commerceSource.includes('SHOP_GIFT_TYPE_FREE'),
  },
  rows: { freeShopRows, activityLinkedFreeRows: linkedFreeRows, chainSteps },
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  result: 'PASS',
  readOnly: true,
  reportPath,
  catalog: report.catalog,
  sourceGates: report.sourceGates,
}, null, 2));

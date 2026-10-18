'use strict';

const fs = require('fs');
const path = require('path');

const workspace = path.resolve(__dirname, '../..');
const configService = require(path.join(workspace, 'linhhoasu/lhs/newServer/src/services/ConfigService'));

function table(name) {
  return configService.get(name) || {};
}

function rows(object) {
  return Object.values(object || {}).filter((row) => row && typeof row === 'object' && !Array.isArray(row));
}

function rewardRows(value) {
  return Array.isArray(value)
    ? value.map((row) => ({ id: Number(row && row.id) || 0, count: Number(row && row.count) || 0 }))
        .filter((row) => row.id > 0 && row.count > 0)
    : [];
}

const payRows = rows(table('PayConfig'));
const shopRows = rows(table('ShopConfig'));
const linkedByPay = new Map();
for (const shop of shopRows) {
  const payId = Number(shop.payId || shop.payid || shop.rechargeId || 0);
  if (payId <= 0) continue;
  if (!linkedByPay.has(payId)) linkedByPay.set(payId, []);
  linkedByPay.get(payId).push(shop);
}

const summary = payRows.map((pay) => {
  const payId = Number(pay.id) || 0;
  const linked = linkedByPay.get(payId) || [];
  return {
    payId,
    priceR: Number(pay.priceR) || 0,
    priceD: Number(pay.priceD) || 0,
    priceNT: Number(pay.priceNT) || 0,
    payRewards: rewardRows(pay.rewards),
    linkedShops: linked.map((shop) => ({
      shopId: Number(shop.id) || 0,
      type: Number(shop.type) || 0,
      limit: Number(shop.limit) || 0,
      limitType: Number(shop.limitType) || 0,
      cost: rewardRows(shop.cost),
      rewards: rewardRows(shop.rewards),
      firstRewards: rewardRows(shop.firstRewards),
      extraRewards: rewardRows(shop.extraRewards),
      subsequentRewards: rewardRows(shop.subsequentRewards),
    })),
  };
}).sort((a, b) => a.payId - b.payId);

const findings = {
  counts: {
    payRows: summary.length,
    shopRows: shopRows.length,
    payRowsWithLinkedShop: summary.filter((row) => row.linkedShops.length > 0).length,
    payRowsWithoutLinkedShop: summary.filter((row) => row.linkedShops.length === 0).length,
    payRowsWithInlineRewards: summary.filter((row) => row.payRewards.length > 0).length,
    linkedPayRowsWithoutAnyBaseReward: summary.filter((row) => row.linkedShops.length > 0
      && row.payRewards.length === 0
      && row.linkedShops.every((shop) => shop.rewards.length === 0)).length,
  },
  linkedPayRowsWithoutAnyBaseReward: summary.filter((row) => row.linkedShops.length > 0
    && row.payRewards.length === 0
    && row.linkedShops.every((shop) => shop.rewards.length === 0)),
  linkedPayRowsWithNonBaseRewardFields: summary.filter((row) => row.linkedShops.some((shop) => (
    shop.firstRewards.length > 0 || shop.extraRewards.length > 0 || shop.subsequentRewards.length > 0
  ))),
  allPayRows: summary,
};

const outputPath = path.join(workspace, '_ai_workbench/temp/server_pay_package_contract_audit.json');
fs.writeFileSync(outputPath, `${JSON.stringify(findings, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outputPath, ...findings.counts,
  nonBaseRewardRows: findings.linkedPayRowsWithNonBaseRewardFields.length }, null, 2));

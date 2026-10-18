'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../../linhhoasu/lhs/newServer');
const config = require(path.join(root, 'src/services/ConfigService'));
const pay = config.get('PayConfig') || {};
const shop = config.get('ShopConfig') || {};
const rows = Object.values(shop).filter((r) => r && typeof r === 'object' && !Array.isArray(r));
const reward = (v) => (Array.isArray(v) ? v : []).map((r) => ({ id: Number(r && r.id) || 0, count: Number(r && r.count) || 0, show: r && r.show })).filter((r) => r.id > 0 && r.count > 0);
const cash = rows.filter((r) => Number(r.payId || r.payid || r.rechargeId || 0) > 0 && (!Array.isArray(r.cost) || r.cost.length === 0));
const out = cash.map((r) => {
  const payId = Number(r.payId || r.payid || r.rechargeId || 0);
  const p = pay[payId] || pay[String(payId)] || {};
  const base = reward(r.rewards); const first = reward(r.firstRewards); const extra = reward(r.extraRewards); const subsequent = reward(r.subsequentRewards);
  const nonDiamond = [...base, ...first, ...extra, ...subsequent].filter((x) => x.id !== 1);
  return { shopId: Number(r.id) || 0, payId, type: Number(r.type) || 0, tab: Number(r.tab) || 0, tag: Number(r.tag) || 0,
    priceR: Number(p.priceR) || 0, priceD: Number(p.priceD) || 0, priceNT: Number(p.priceNT) || 0,
    base, first, extra, subsequent, nonDiamond,
    expectedDiamond: (base.find((x) => x.id === 1) || first.find((x) => x.id === 1) || {}).count || 0,
    payName: p.name || 0,
  };
}).sort((a, b) => a.payId - b.payId || a.shopId - b.shopId);

const byType = {};
for (const row of out) {
  const key = String(row.type); const x = byType[key] || { count: 0, baseRewardRows: 0, nonDiamondRows: 0, bonusRows: 0, samples: [] };
  x.count++; if (row.base.length) x.baseRewardRows++; if (row.nonDiamond.length) x.nonDiamondRows++; if (row.first.length + row.extra.length + row.subsequent.length) x.bonusRows++;
  if (x.samples.length < 12 && (row.nonDiamond.length || row.bonusRows)) x.samples.push(row);
  byType[key] = x;
}
const chain = {};
for (const [k, v] of Object.entries(config.get('ShopGiftConfig') || {})) chain[k] = Object.values(v || {}).map((r) => ({ index: Number(r.index) || 0, type: Number(r.type) || 0, shopId: Number(r.shopId) || 0, rewards: reward(r.rewards) }));
const result = { generatedAt: new Date().toISOString(), cashCount: out.length, byType, cashRows: out, chainPackages: chain };
const outPath = path.resolve(__dirname, '../temp/server_cash_package_classification.json');
fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ outPath, cashCount: out.length, byType: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, { count: v.count, nonDiamondRows: v.nonDiamondRows, bonusRows: v.bonusRows }])), chainPackages: Object.fromEntries(Object.entries(chain).map(([k, v]) => [k, v.length])) }, null, 2));

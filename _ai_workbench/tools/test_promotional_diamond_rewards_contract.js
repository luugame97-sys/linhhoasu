'use strict';

const assert = require('assert');
const path = require('path');

const repo = path.resolve(__dirname, '..', '..');
const app = process.env.PROMO_APP_ROOT
  ? path.resolve(process.env.PROMO_APP_ROOT)
  : path.join(repo, 'linhhoasu', 'lhs', 'newServer');
const configBin = process.env.PROMO_CONFIG_BIN
  || path.join(repo, '_ai_workbench', 'temp', 'promotional_rewards_20260914', 'live_now', 'server.bin');
process.env.CONFIG_BIN_PATH = configBin;
process.env.NODE_ENV = 'test';

const config = require(path.join(app, 'src/services/ConfigService'));
const resolver = require(path.join(app, 'src/services/RechargeRewardResolver'));
const tables = config.loadAllTables();
const shop = tables.ShopConfig || {};
const ids = [11007001, 11007002, 11007003, 11007004, 11007005, 11007006,
  11018001, 11018002, 11018003, 11018004, 11018005, 11018006];
const expectedDiamond = (id) => [300, 680, 1280, 1980, 3280, 6480][
  (id >= 11018000 ? id - 11018000 : id - 11007000) - 1
] * 1000;
let checks = 0;
for (const id of ids) {
  const row = shop[id] || shop[String(id)];
  assert(row && Number(row.payId) === id, `missing target ${id}`);
  const diamond = (row.rewards || []).find((reward) => Number(reward.id) === 1);
  assert(diamond && Number(diamond.count) > 0, `missing diamond reward ${id}`);
  assert.strictEqual(Number(diamond.count), expectedDiamond(id), `binary reward mismatch ${id}`);
  checks += 1;
}

for (const id of ids) {
  const pay = tables.PayConfig[id] || tables.PayConfig[String(id)] || {};
  const resolved = resolver.resolveRechargeRewards({ rechargeInfo: { records: [] } }, { payId: id, multi: 1, route: 'cash', amount: Number(pay.priceR) });
  assert(resolved.ok, `resolver rejected target ${id}: ${resolved.reason}`);
  const diamond = (resolved.rows || []).find((reward) => Number(reward.id) === 1);
  assert(diamond && Number(diamond.count) === expectedDiamond(id), `resolver diamond reward mismatch ${id}`);
  checks += 1;
}

console.log(JSON.stringify({ result: 'PASS', checks, multiplier: 1000, packageIds: ids, configBin }));

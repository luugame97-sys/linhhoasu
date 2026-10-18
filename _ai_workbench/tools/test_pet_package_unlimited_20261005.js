'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '../..');
const app = process.env.FEATURE_APP || path.join(root, 'linhhoasu/lhs/newServer');
const config = require(path.join(app, 'src/services/ConfigService'));
const policy = require(path.join(app, 'src/config/petPackageUnlimited'));
const tables = {};
['ShopConfig', 'PayConfig', 'PrivilegeConfig'].forEach(name => {
  tables[name] = JSON.parse(JSON.stringify(config.get(name)));
});
// The live preflight on 2026-10-05 confirmed exactly these prior caps.
// Restore only those fields on the private fixture after production overlays.
[[4000004, 1], [4000103, 2]].forEach(([id, limitType]) => {
  assert.strictEqual(tables.ShopConfig[id].payId, id);
  tables.ShopConfig[id].limit = 1;
  tables.ShopConfig[id].limitType = limitType;
});
const before = JSON.parse(JSON.stringify(tables));
const resolverPath = process.env.PET_PACKAGE_RESOLVER || path.join(root, '_ai_workbench/temp/pet_package_unlimited_20261005/RechargeRewardResolver.live.js');
const sandbox = { module: { exports: {} }, require(name) {
  if (name === './ConfigService') return { get: name => tables[name] || {} };
  if (name === './TopArenaPassService') return { check: () => null };
  if (name === './OldTrekPassService') return { metadata: () => null };
  if (name === './FishingEventShopService') return { policy: () => null };
  if (name === './RewardGrantService') return { assertRewardRowsSupported: rows => assert(rows.every(r => r.id > 0 && r.count > 0)) };
  throw new Error('Unexpected dependency: ' + name);
} };
vm.runInNewContext(fs.readFileSync(resolverPath, 'utf8'), sandbox);
const resolve = sandbox.module.exports.resolveRechargeRewards;
const plain = data => JSON.parse(JSON.stringify(data));
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }
check('existing daily/weekly caps reproduce', () => {
  policy.PACKAGE_IDS.forEach(id => {
    const result = resolve({ rechargeInfo: { records: [{ id, count: 1 }] } }, { payId: id });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'LIMIT_LEDGER_REQUIRED');
  });
});
policy.apply(tables);
check('only both selected limit fields change, reward/price and others preserved', () => {
  const expected = JSON.parse(JSON.stringify(before));
  policy.PACKAGE_IDS.forEach(id => { expected.ShopConfig[id].limit = 0; expected.ShopConfig[id].limitType = 0; });
  assert.deepStrictEqual(tables, expected);
});
check('policy is idempotent and mapping failure is atomic', () => {
  const existing = JSON.stringify(tables); policy.apply(tables); assert.strictEqual(JSON.stringify(tables), existing);
  const broken = JSON.parse(JSON.stringify(before)); delete broken.ShopConfig[4000103];
  const original = JSON.stringify(broken); assert.throws(() => policy.apply(broken)); assert.strictEqual(JSON.stringify(broken), original);
});
check('fresh and historical purchases resolve independently at unchanged unit rewards', () => {
  policy.PACKAGE_IDS.forEach(id => [0, 1, 100000].forEach(count => {
    const player = { rechargeInfo: { records: [{ id, count }] } };
    const prior = JSON.stringify(player);
    ['token', 'cash'].forEach(route => {
      const result = resolve(player, { payId: id, route, amount: before.PayConfig[id].priceR });
      assert.strictEqual(result.ok, true); assert.strictEqual(result.limit, 0);
      assert.deepStrictEqual(plain(result.rows), before.ShopConfig[id].rewards.slice().sort((a,b) => a.id-b.id));
      assert.deepStrictEqual(plain(result.doubleRows), []);
    });
    assert.strictEqual(JSON.stringify(player), prior);
  }));
});
check('cash amount mismatch and zero amount still rejected', () => {
  policy.PACKAGE_IDS.forEach(id => [0, 1, before.PayConfig[id].priceR - 1].forEach(amount => {
    const result = resolve({}, { payId: id, route: 'cash', amount });
    assert.strictEqual(result.ok, false); assert.strictEqual(result.reason, 'AMOUNT_MISMATCH');
  }));
});
check('other daily paid package remains limited', () => {
  const result = resolve({ rechargeInfo: { records: [{ id: 4000003, count: 1 }] } }, { payId: 4000003 });
  assert.strictEqual(result.ok, false); assert.strictEqual(result.reason, 'LIMIT_LEDGER_REQUIRED');
});
check('per-request bounded multi still enforced', () => {
  [0, -1, 1.5, 100].forEach(multi => assert.strictEqual(resolve({}, { payId: 4000004, multi }).reason, 'INVALID_MULTI'));
});
console.log(JSON.stringify({ checks, mode: 'RAM_ONLY', playerWrites: 0, purchasesSent: 0 }));

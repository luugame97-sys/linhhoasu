'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const overlay = require('../../linhhoasu/lhs/newServer/src/config/petPackageUnlimited');
const patcher = require('./patch_shop_package_limits_20261014');

const dump = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../linhhoasu/lhs/newServer/scripts/_tables_dump/ShopConfig.json'), 'utf8')).data;
const fixture = JSON.parse(JSON.stringify(dump));
overlay.apply({ ShopConfig: fixture });
for (const id of overlay.PACKAGE_IDS) {
  assert.strictEqual(fixture[String(id)].limit, 0, `overlay limit ${id}`);
  assert.strictEqual(fixture[String(id)].limitType, 0, `overlay type ${id}`);
}
assert.deepStrictEqual(
  { limit: fixture['4000001'].limit, limitType: fixture['4000001'].limitType },
  { limit: 1, limitType: 1 },
  'free daily pack changed'
);
for (const id of [4000007, 4000008]) {
  assert.deepStrictEqual(
    { limit: fixture[String(id)].limit, limitType: fixture[String(id)].limitType },
    { limit: 1, limitType: 1 },
    `hidden pack changed ${id}`
  );
}

const binary = fs.readFileSync(path.resolve(__dirname, '../../linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin'));
const patched = patcher.patchBuffer(binary).after;
const shop = patcher.decodeChunks(patched).find((chunk) => chunk.name === 'ShopConfig').value;
for (const id of patcher.TARGET_IDS) {
  assert.strictEqual(shop[String(id)].limit, 0, `binary limit ${id}`);
  assert.strictEqual(shop[String(id)].limitType, 0, `binary type ${id}`);
}
assert.strictEqual(shop['4000001'].limit, 1);
assert.strictEqual(shop['4000001'].limitType, 1);
assert.strictEqual(shop['4000007'].limit, 1);
assert.strictEqual(shop['4000008'].limitType, 1);

console.log(JSON.stringify({ result: 'PASS', overlayIds: overlay.PACKAGE_IDS, binaryIds: patcher.TARGET_IDS, productionWrites: 0 }));

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const modulePath = path.join(root, '_ai_workbench/temp/gem10_stop_shop_candidate_20261002/server/config/gemLevel10Choice.js');
const addonPath = path.join(root, '_ai_workbench/temp/gem10_stop_shop_candidate_20261002/client/lhs-gem10-box-v1.js');
const choice = require(modulePath);

function tables(withShop = true) {
  const gem = {};
  const assets = {};
  for (let id = 25091; id <= 25096; id += 1) {
    gem[id] = { id, level: 10, synthesisLevel: 0 };
    assets[id] = { id, type: 18, quality: 9, icon: `icon_${id}` };
  }
  const shopRow = {
    id: 10000007, icon: '', tab: 10, tag: 0, payId: 0,
    cost: [{ id: 1, count: 1049760 }], costAgain: [], rewards: [{ id: 100097, count: 1 }],
    extraRewards: [], firstRewards: [], subsequentRewards: [], isDouble: 0, limit: 0,
    limitType: 0, showConds: [], type: 0, conditions: [], preId: -1, nextId: -1,
    intervalTri: [], duration: 0, showMultiple: 0, priority: 7,
  };
  return {
    AssetsConfig: assets, AssetsUseConfig: {}, ShopConfig: withShop ? { 10000007: shopRow } : {},
    GemLevelConfig: gem, GemBaseConfig: { sizeLength: 5 },
  };
}

const serverWithShop = tables(true);
choice.apply(serverWithShop);
assert.equal(choice.SHOP_ENABLED, false);
assert.equal(serverWithShop.ShopConfig[10000007], undefined);
assert.equal(serverWithShop.AssetsConfig[100097].useType, 101);
assert.deepEqual(serverWithShop.AssetsUseConfig[100097].rewards.map(x => x.id), [25091, 25092, 25093, 25094, 25095, 25096]);

const serverWithoutShop = tables(false);
choice.apply(serverWithoutShop);
assert.equal(serverWithoutShop.ShopConfig[10000007], undefined);

const conflict = tables(true);
conflict.ShopConfig[10000007].rewards = [{ id: 999, count: 1 }];
assert.throws(() => choice.apply(conflict), /GEM10_CHOICE_CONFLICT:10000007/);

function runClient(withShop) {
  const cfg = tables(withShop);
  // Test both a server-provided bag and an older client table without it.
  const hasAuthoritativeBag = withShop === 'existing-bag';
  if (hasAuthoritativeBag) {
    cfg.AssetsConfig[100097] = { id: 100097, type: 1, useType: 101 };
    cfg.AssetsUseConfig[100097] = { id: 100097, type: 101, rewards: [{ id: 25091, count: 1 }] };
  }
  if (hasAuthoritativeBag) withShop = true;
  if (!hasAuthoritativeBag) { delete cfg.AssetsConfig[100097]; delete cfg.AssetsUseConfig[100097]; }
  const context = { window: null, GlobalManager: { Config: cfg }, setTimeout() {}, console };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(addonPath, 'utf8'), context, { filename: addonPath });
  return { cfg, api: context.LhsGem10BoxV1 };
}

const clientWithShop = runClient(true);
assert.equal(clientWithShop.cfg.ShopConfig[10000007], undefined);
assert.equal(clientWithShop.cfg.AssetsConfig[100097].useType, 101);
assert.equal(clientWithShop.api.shopEnabled, false);
const clientWithoutShop = runClient(false);
assert.equal(clientWithoutShop.cfg.ShopConfig[10000007], undefined);
assert.equal(clientWithoutShop.cfg.AssetsUseConfig[100097].rewards.length, 6);
const clientWithAuthoritativeBag = runClient('existing-bag');
assert.equal(clientWithAuthoritativeBag.cfg.ShopConfig[10000007], undefined);
assert.equal(clientWithAuthoritativeBag.cfg.AssetsConfig[100097].useType, 101);

console.log(JSON.stringify({
  pass: true,
  shopId: 10000007,
  bagId: 100097,
  shopRemoved: true,
  bagStillUsable: true,
  conflictFailClosed: true,
}));

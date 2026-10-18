'use strict';

const assert = require('assert');
const path = require('path');
const Module = require('module');

const appRoot = process.env.APP_ROOT || path.resolve(__dirname, '..', '..', 'linhhoasu', 'lhs', 'newServer');
const config = require(path.join(appRoot, 'src', 'services', 'ConfigService'));
const equipServicePath = process.env.EQUIP_SERVICE_PATH || path.join(appRoot, 'src', 'services', 'EquipService');
const originalLoad = Module._load;
Module._load = function loadCandidateDependency(request, parent, isMain) {
  if (parent && path.resolve(parent.filename) === path.resolve(equipServicePath)) {
    if (request === './ConfigService') return config;
    if (request === './CurrencySync') return require(path.join(appRoot, 'src', 'services', 'CurrencySync'));
    if (request === './RoleAppearanceService') return require(path.join(appRoot, 'src', 'services', 'RoleAppearanceService'));
  }
  return originalLoad.call(this, request, parent, isMain);
};
const equipService = require(equipServicePath);
Module._load = originalLoad;

config.loadAllTables();

const assets = config.get('AssetsConfig') || {};
const equipAsset = Object.values(assets).find((row) => row && Number(row.type) === 3 && Number(row.subType) > 0);
assert.ok(equipAsset, 'an equipment asset is required');

const attrCfg = config.get('AttrConfig') || {};
const powerAttrId = Object.keys(attrCfg).find((id) => Number(attrCfg[id] && attrCfg[id].power) > 0);
assert.ok(powerAttrId, 'a weighted power attribute is required');

function makeEquip(uid, value) {
  return {
    uid,
    id: Number(equipAsset.id),
    type: Number(equipAsset.subType),
    quailty: Math.max(1, Number(equipAsset.quality) || 1),
    lv: 10,
    attrs: { [powerAttrId]: value },
  };
}

function makePlayer(worn, open, otherPlan = null) {
  const equipSetMap = { 0: { [worn.type]: worn } };
  if (otherPlan) equipSetMap[1] = { [otherPlan.type]: otherPlan };
  return {
    currencies: { silver: 0, diamond: 0, gold: 0 },
    items: {},
    equipInfo: {
      curIndex: 0,
      openListMap: { 0: open },
      equipSetMap,
      setInfoMap: {},
      raidSetMap: {},
      equipList: [],
    },
  };
}

const worn = makeEquip(1001, 100);
const stronger = makeEquip(1002, 200);
const weaker = makeEquip(1003, 50);
const futureStrong = makeEquip(1004, 300);
const player = makePlayer(worn, [stronger, weaker, futureStrong]);

const upgraded = equipService.replaceOpenEquipToPlan(player, {
  uid: stronger.uid,
  listId: 0,
  mapId: 0,
  requirePowerUpgrade: true,
});
assert.strictEqual(upgraded.result, 0, 'stronger equipment must auto-equip');
assert.ok(upgraded.afterPower > upgraded.beforePower, 'power must strictly increase');

const sale = equipService.saleOpenEquips(player, [worn.uid, weaker.uid, futureStrong.uid], {
  safeAutoDelegate: true,
});
assert.deepStrictEqual(new Set(sale.uids), new Set([worn.uid, weaker.uid]), 'only weaker equipment may auto-sell');
assert.deepStrictEqual(sale.ignoredUids, [futureStrong.uid], 'stronger open equipment must be protected');

const current = player.equipInfo.equipSetMap['0'][String(worn.type)];
assert.strictEqual(current.uid, stronger.uid, 'active slot must keep the strongest equipped item');

const rejectPlayer = makePlayer(worn, [weaker]);
const rejected = equipService.replaceOpenEquipToPlan(rejectPlayer, {
  uid: weaker.uid,
  listId: 0,
  mapId: 0,
  requirePowerUpgrade: true,
});
assert.strictEqual(rejected.result, 1, 'weaker equipment must not auto-equip');
assert.ok(rejectPlayer.equipInfo.openListMap['0'].some((row) => row.uid === weaker.uid), 'rejected item must remain available');

const protectedWorn = makeEquip(2001, 80);
const protectedPlayer = makePlayer(makeEquip(2002, 200), [protectedWorn], protectedWorn);
const protectedSale = equipService.saleOpenEquips(protectedPlayer, [protectedWorn.uid], {
  safeAutoDelegate: true,
});
assert.deepStrictEqual(protectedSale.uids, [], 'equipment used by another preset must not be sold');
assert.deepStrictEqual(protectedSale.ignoredUids, [protectedWorn.uid], 'protected preset item must be reported');

const equalPower = makeEquip(3001, 100);
const equalPlayer = makePlayer(worn, [equalPower]);
const equalRejected = equipService.replaceOpenEquipToPlan(equalPlayer, {
  uid: equalPower.uid,
  listId: 0,
  mapId: 0,
  requirePowerUpgrade: true,
});
assert.strictEqual(equalRejected.result, 1, 'equal-power equipment must not auto-equip');
assert.strictEqual(equalRejected.code, 'AUTO_EQUIP_NOT_UPGRADE');
assert.ok(equalPlayer.equipInfo.openListMap['0'].some((row) => row.uid === equalPower.uid), 'rejected equal item must remain in open list');
assert.strictEqual(equalPlayer.equipInfo.equipSetMap['0'][String(worn.type)].uid, worn.uid, 'failed auto-equip must not mutate worn item');

const emptySlotPlayer = makePlayer(worn, []);
const emptySlotEquip = makeEquip(3002, 150);
delete emptySlotPlayer.equipInfo.equipSetMap['0'][String(worn.type)];
emptySlotPlayer.equipInfo.openListMap['0'].push(emptySlotEquip);
const emptyEquipped = equipService.replaceOpenEquipToPlan(emptySlotPlayer, {
  uid: emptySlotEquip.uid,
  listId: 0,
  mapId: 0,
  requirePowerUpgrade: true,
});
assert.strictEqual(emptyEquipped.result, 0, 'positive-power equipment must fill an empty slot');

const unsafeManualPlayer = makePlayer(worn, [stronger]);
const manualReplace = equipService.replaceOpenEquipToPlan(unsafeManualPlayer, {
  uid: stronger.uid,
  listId: 0,
  mapId: 0,
});
assert.strictEqual(manualReplace.result, 0, 'manual replacement compatibility must remain');

console.log(JSON.stringify({
  result: 'ok',
  attrId: Number(powerAttrId),
  equippedUid: current.uid,
  soldUids: sale.uids,
  ignoredUids: sale.ignoredUids,
  protectedUid: protectedSale.ignoredUids[0],
}));

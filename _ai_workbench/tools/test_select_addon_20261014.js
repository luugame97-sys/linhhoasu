'use strict';

const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const vm = require('vm');
const Module = require('module');
let saves = 0, networkAttempts = 0, writeAttempts = 0;
require('net').Socket.prototype.connect = function () { networkAttempts++; throw Error('NETWORK_FORBIDDEN'); };
for (const key of ['writeFileSync','appendFileSync','mkdirSync','unlinkSync','rmSync','renameSync','createWriteStream']) {
  fs[key] = () => { writeAttempts++; throw Error('WRITE_FORBIDDEN'); };
}
const load = Module._load;
Module._load = function (name, parent, isMain) {
  if (/(^|\/)logger$/.test(name)) return { info(){}, warn(){}, error(){}, debug(){} };
  if (/(^|\/)PlayerService$/.test(name)) return { drainPendingSaves:async()=>{},
    savePlayer:async()=>{saves++;return true;}, savePlayerDeferred:async()=>{saves++;return true;} };
  return load.call(this, name, parent, isMain);
};
global.setTimeout = () => 0; global.setInterval = () => 0;

const web = '/linhhoasu/webgame/game';
const configService = require('/linhhoasu/lhs/newServer/src/services/ConfigService');
const config = configService.decodeTables(fs.readFileSync(web + '/update/resource/assets/excel/config_fashion_20260909.bin'));
const addonPath = web + '/js/lhs-select-legacy-boxes-v1.js';
const source = globalThis.ADDON_SOURCE || fs.readFileSync(addonPath, 'utf8');
const root = {
  GlobalManager: { Config: config },
  setTimeout() {},
};
vm.runInNewContext(source, { window: root, Object, Number, Math, Array, console }, { timeout: 3000 });
const expected = Object.values(config.ElfConfig || {})
  .filter((row) => row && Number(row.quality) === 4 && row.piece && Number.isSafeInteger(Number(row.piece.id)))
  .map((row) => Number(row.piece.id))
  .filter((id, index, list) => config.AssetsConfig[id] && Number(config.AssetsConfig[id].type) === 1 && list.indexOf(id) === index)
  .sort((a, b) => a - b);
for (const id of [90021, 90022]) {
  const use = config.AssetsUseConfig[id];
  assert.equal(use.type, 101);
  assert.deepEqual(use.rewards.map((row) => Number(row.id)), expected);
  assert.ok(use.rewards.length > 0);
}
assert.equal(root.LhsSelectLegacyBoxesV1.installed, true);
assert.deepEqual(Array.from(root.LhsSelectLegacyBoxesV1.patchedIds).sort((a, b) => a - b), [90021, 90022]);
const hash = crypto.createHash('sha256').update(source).digest('hex');
const random = require('/linhhoasu/lhs/newServer/src/services/RandomUsableItemRewardService');
const targets = random.CUSTOM_BOX_DEFINITIONS.filter(row => row.allowNoUse).map(row => row.id).sort((a,b)=>a-b);
assert.equal(targets.length, 26);
assert.deepEqual(Array.from(root.LhsSelectLegacyBoxesV1.randomIds).sort((a,b)=>a-b), targets);
for (const id of targets) {
  assert.equal(config.AssetsUseConfig[id].type, 102);
  assert.equal(config.AssetsConfig[id].useType, 102);
  assert.ok(config.AssetsConfig[id].ifShow, 'invisible route '+id);
}
root.LhsSelectLegacyBoxesV1.install();
assert.equal(root.LhsSelectLegacyBoxesV1.randomIds.length, 26, 'idempotent install');
assert.equal(root.LhsSelectLegacyBoxesV1.skippedIds.length, 0);
const handler = require('/linhhoasu/lhs/newServer/src/handlers/item');
(async () => {
let selectionCases = 0;
for (const id of [90021,90022]) {
  assert.deepEqual(JSON.parse(JSON.stringify(config.AssetsUseConfig[id].rewards)), random.getCustomSelectionRewards(id), 'client/server choice order');
  for (let index=0; index<expected.length; index++) {
    const player = {userId:'ISOLATED_ADDON_TEST',playerId:'ISOLATED_ADDON_TEST',items:{[id]:3},currencies:{diamond:0,gold:0,silver:0},other_attr_info:{},roleInfo:{stage:999999},level:999};
    saves=0;
    const packets=await handler.handleUseItem({index:id,count:3,selects:{[index]:3}},{userId:player.userId,player},17);
    const reply=(Array.isArray(packets)?packets:[packets]).find(p=>p.tag===1300).data;
    assert.equal(reply.result,0);
    assert.equal(player.items[id]||0,0);
    assert.equal(player.items[expected[index]],3,'selected piece grant');
    assert.equal(saves,1);
    selectionCases++;
  }
  for (const selects of [undefined,{'999':1},{'0':2},{'0':-1},{'0':1.5}]) {
    const player={userId:'ISOLATED_ADDON_TEST',items:{[id]:1},roleInfo:{stage:999999}};
    saves=0;
    const packets=await handler.handleUseItem({index:id,count:1,selects},{userId:player.userId,player},18);
    const reply=(Array.isArray(packets)?packets:[packets]).find(p=>p.tag===1300).data;
    assert.notEqual(reply.result,0); assert.equal(player.items[id],1); assert.equal(saves,0);
    selectionCases++;
  }
}
assert.equal(networkAttempts,0); assert.equal(writeAttempts,0);
console.log('SELECT_ADDON_RESULT=' + JSON.stringify({
  installed: root.LhsSelectLegacyBoxesV1.installed,
  patchedIds: root.LhsSelectLegacyBoxesV1.patchedIds,
  rewardCount: expected.length,
  rewardIds: expected,
  sha256: hash,
  randomRoutes:targets.length, selectionCases, networkAttempts, writeAttempts,
}));
})().catch(error=>{console.error(error.stack);process.exitCode=1;});

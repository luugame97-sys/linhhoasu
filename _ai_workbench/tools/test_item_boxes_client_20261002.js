'use strict';
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const configService = require('../../linhhoasu/lhs/newServer/src/services/ConfigService');
const base = '_ai_workbench/temp/item_boxes_20261002/';
const addon = fs.readFileSync(base + 'candidate/client/lhs-item-boxes-v1.js', 'utf8');
const catalog = JSON.parse(fs.readFileSync(base + 'definitions.json', 'utf8'));
const expectedGuards = [...catalog.boxes, ...(catalog.legacyBoxes || [])].map(row => ({id:row.id,type:row.type,icon:row.icon,quality:row.quality,...(row.param != null ? {param:row.param} : {})}));
assert.deepEqual(JSON.parse(addon.match(/var rows = (\[[^\n]+\]);/)[1]), expectedGuards, 'addon whitelist must match current verified definitions');
const config = configService.decodeTables(fs.readFileSync('_ai_workbench/temp/petsoul_release_20261002/baseline/config.bin'));
const original = JSON.parse(JSON.stringify(config));
const bundle = fs.readFileSync('linhhoasu/webgame/game/js/main.min_drop100.js', 'utf8');
let calls = [], opens = [], allow = true, timers = [];
const item = { _itemMap: {}, GetItemUseRecord() { return 0; }, sendUseItem(...args) { calls.push(args); } };
const root = { GlobalManager: { Config: config, ItemModel: item, UnlockSystem: { checkConditions() { return allow; }, isSystemUnlock() { return true; } } }, setTimeout(fn) { timers.push(fn); } };
const ctx = vm.createContext({ window: root, Y: root.GlobalManager, S: { ins() { return { showTipsByLangId() {} }; } }, P: { ins() { return { open(...args) { opens.push(args); } }; } }, wA: 'ItemUseView', TA: 'ArtifactItemUseView', Object, Number, Math });
function native(marker, from = 0) {
  const at = bundle.indexOf(marker, from); assert(at >= 0, marker);
  const start = bundle.indexOf('function', at), open = bundle.indexOf('{', start);
  let depth = 1, quote = '', escape = false, end = open + 1;
  for (; end < bundle.length; end++) { const c = bundle[end]; if (quote) { if (escape) escape = false; else if (c === '\\') escape = true; else if (c === quote) quote = ''; continue; } if (c === '"' || c === "'") { quote = c; continue; } if (c === '{') depth++; if (c === '}' && !--depth) break; }
  return vm.runInContext('(' + bundle.slice(start, end + 1) + ')', ctx);
}
item.CheckItemCanUse = native('CheckItemCanUse=function');
item.getBagItems = native('m.getBagItems=function');
vm.runInContext(addon, ctx);
assert(root.LhsItemBoxesV1.installed);
const ids = root.LhsItemBoxesV1.patchedIds;
assert(ids.length > 0);
const useStart = bundle.indexOf('t(kA=pie,"ItemPreviewView")');
for (const id of ids) {
  assert(!original.AssetsUseConfig[id], 'only absent use rows added');
  assert(item.CheckItemCanUse(id), 'native can-use ' + id);
  assert.equal(config.AssetsConfig[id].useType, 102);
  item._itemMap[id] = 7;
  const bagRow = item.getBagItems().find(row => row.id === id);
  assert(bagRow, 'existing inventory visible in native bag ' + id);
  assert.equal(bagRow.count, 7); assert.equal(bagRow.canUse, 1); assert.equal(config.AssetsConfig[id].ifShowNum, 1);
  const owned = { id, count: 55, isOwner: true };
  native('yre.onClickUseBtn=function', bundle.indexOf('t(ck=mre,"SysHelpImageContentAndJump")')).call({ _itemData: owned });
  assert.deepEqual(opens.pop(), ['ItemUseView', owned], 'native item tooltip route');
  const view = { _useItemData: { id, count: 55 }, numInput: {}, CloseSelf() { this.closed = true; }, _nowUseType: 102 };
  native('Ane.refreshByDropBox=function', useStart).call(view, view._useItemData);
  assert.equal(view._nowMaxNum, 55); assert.equal(view.numInput.data.maxNum, 55);
  view.numInput.nowNum = 3;
  native('Ane.onClickUseBtn=function', useStart).call(view);
  assert.deepEqual(calls.pop(), [id, 3, null]); assert(view.closed);
  view.numInput.nowNum = 56; native('Ane.onClickUseBtn=function', useStart).call(view); assert.equal(calls.length, 0);
}
for (const [id, row] of Object.entries(original.AssetsUseConfig)) assert.deepEqual(config.AssetsUseConfig[id], row, 'existing route/conditions/limit ' + id);
for (const [id, asset] of Object.entries(original.AssetsConfig)) {
  const expected = JSON.parse(JSON.stringify(asset)); if (ids.includes(Number(id))) { expected.useType = 102; if (!expected.ifShow) expected.ifShow = 1; expected.ifShowNum = 1; }
  assert.deepEqual(config.AssetsConfig[id], expected, 'unrelated asset/visibility ' + id);
}
allow = false; assert(!item.CheckItemCanUse(ids[0])); allow = true;
root.LhsItemBoxesV1.install(); assert.equal(timers.length, 0, 'no polling after install');
const configBad = JSON.parse(JSON.stringify(original));
for (const id of ids) configBad.AssetsConfig[id].icon += '_drift';
const badRoot = { GlobalManager: { Config: configBad }, setTimeout() { throw new Error('metadata drift must not poll'); } };
vm.runInNewContext(addon, { window: badRoot, Object, Number, Math });
assert.equal(badRoot.LhsItemBoxesV1.patchedIds.length, 0, 'metadata mismatch fail-closed');
assert.deepEqual(configBad.AssetsUseConfig, original.AssetsUseConfig);
console.log('PASS native client box contract: ' + ids.length + ' whitelist routes; count/native1300, existing config preservation, locked conditions, metadata drift, no polling. No network/player calls.');

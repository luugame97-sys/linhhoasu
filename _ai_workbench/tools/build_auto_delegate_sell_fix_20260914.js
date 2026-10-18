'use strict';
// Always build from the captured live preimage, never an old full bundle.
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const acorn = require('../../linhhoasu/lhs/newServer/node_modules/acorn');
const crypto = require('crypto');
const root = path.resolve(__dirname, '../temp/auto_delegate_sell_fix_20260914');
const chunks = require('./auto_delegate_sell_fix_functions_20260914');
let source = fs.readFileSync(path.join(root, 'main.js.before'), 'utf8');
const changes = [];
function once(old, next, label) {
  assert.equal(source.split(old).length - 1, 1, label);
  source = source.replace(old, next); changes.push(label);
}
function replaceFunction(marker, fn) {
  const at = source.indexOf(marker); assert(at >= 0, marker);
  const start = at + marker.length;
  let node = acorn.parseExpressionAt(source, start, { ecmaVersion: 'latest' });
  if (node.type === 'SequenceExpression') node = node.expressions[0];
  assert.equal(node.type, 'FunctionExpression');
  source = source.slice(0, start) + fn.toString() + source.slice(node.end);
  changes.push(marker);
}
once('_.onBtnStart=function(){U9.updateRecord(),xV.isFastMode=U9.autoConfig.isFastMode,U9.isOpen=!0,Y.BoxLayerModel.changeState(4)',
  '_.onBtnStart=function(){U9.updateRecord(),xV.isFastMode=U9.autoConfig.isFastMode,U9.isOpen=!0,Y.BoxLayerModel.beginAutoSellDropSession(),Y.BoxLayerModel.changeState(4)', 'initialize approved drop scope on start');
once('C.sendBoxReward=function(T){var S=this;', 'C.beginAutoSellDropSession=' + chunks.begin.toString() +
  ',C.trackAutoSellDrops=' + chunks.track.toString() + ',C.autoSellDroppedEquipments=' + chunks.select.toString() +
  ',C.sendBoxReward=function(T){var S=this;if(U9.isOpen&&U9.autoConfig.sellAllEquipments&&!this._lhsAutoSellDropSession)this.beginAutoSellDropSession();', 'track new drop UIDs only');
once('S._openEquipList.length>t.rewardInfo.equips.length&&(U9.isOpen&&(U9.isOpen=!1),e=!0);',
  'S.trackAutoSellDrops(t.rewardInfo);S._openEquipList.length>t.rewardInfo.equips.length&&!(U9.isOpen&&U9.autoConfig.sellAllEquipments)&&(U9.isOpen&&(U9.isOpen=!1),e=!0);', 'do not turn off sell-all when unsold list differs');
once('U9.autoConfig.sellAllEquipments?(t.addSaleList(e),t.changeState(2)):(U9.autoConfig.autoEquipUpgrade||U9.autoConfig.isSilentMode)?',
  'U9.autoConfig.sellAllEquipments?t.autoSellDroppedEquipments():U9.autoConfig.autoEquipUpgrade?', 'sell-all bypasses power and keep filters; silent is visual only');
once('C.openEquipReplaceView=function(t){var e;',
  'C.openEquipReplaceView=function(t){if(U9.isOpen&&U9.autoConfig.sellAllEquipments){if(this.isInState(6))this.autoSellDroppedEquipments();return;}var e;', 'do not open equipment matrix while auto-selling');
replaceFunction('C.sendEquipSale=', chunks.sale);
replaceFunction('r.dealSale=', chunks.continueSale);
// Move the existing keep toggle into the native quality row, not a second
// setting elsewhere in the panel. Keep the saved sellAll flag unchanged.
const uiStart = source.indexOf('this.sellAllEquipmentsBox=new U.CheckBox');
const uiEnd = source.indexOf('this.baseGroup&&this.baseGroup.addChild(this.autoEquipNewAccountGroup)', uiStart);
assert(uiStart >= 0 && uiEnd > uiStart);
source = source.slice(0, uiStart) + 'this.installKeepQualityToggle(),' + source.slice(uiEnd);
once('_.autoEquipUpgradeCheckBox=function()', '_.installKeepQualityToggle=' + chunks.installKeepQualityToggle.toString() + ',_.autoEquipUpgradeCheckBox=function()', 'checkbox beside native full label');
once('this.sellAllEquipmentsBox.selected=!e.sellAllEquipments,',
  'this.sellAllEquipmentsBox.selected=!e.sellAllEquipments,this.qualityCheckBox.enabled=!e.sellAllEquipments,this.qualityCheckBox.alpha=e.sellAllEquipments?.5:1,', 'bind dropdown enabled state to keep toggle');
once('this.autoEquipNewAccountGroup.width=342', 'this.autoEquipNewAccountGroup.width=300', 'remove unused second control space');
// This warning dialog belongs to manual sale and stays unchanged.
assert(source.includes('C.CheckSaleWarnWin=function'));
assert(source.includes('sellAllEquipmentsBox.selected=!e.sellAllEquipments'));
assert(!source.includes('autoEquipUpgrade||U9.autoConfig.isSilentMode'));
assert(!source.includes('this.sellAllEquipmentsLabel='));
fs.writeFileSync(path.join(root, 'main.js'), source);
let index = fs.readFileSync(path.join(root, 'index.html.before'), 'utf8');
const oldUrl = 'js/main.min_a6195824.js?v=20260914_auto_delegate_silent_v1';
assert.equal(index.split(oldUrl).length - 1, 1);
index = index.replace(oldUrl, 'js/main.min_a6195824.js?v=20260914_auto_sell_fix_v2');
fs.writeFileSync(path.join(root, 'index.html'), index);
fs.writeFileSync(path.join(root, 'build.json'), JSON.stringify({ changes, marker: '20260914_auto_sell_fix_v2' }, null, 2));
// Remote QA needs no parser installation. These exact function slices are
// tied to the full bundle SHA and evaluated by the same native VM tests.
const extracted = {};
for (const name of ['main.js', 'main.js.before']) {
  const text = fs.readFileSync(path.join(root, name), 'utf8'), funcs = {};
  for (const marker of ['C.beginAutoSellDropSession=', 'C.trackAutoSellDrops=', 'C.autoSellDroppedEquipments=', 'C.sendEquipSale=',
    'o.dealSelect=', 'r.dealSale=', 'C.sendBoxReward=', 'n7e.Init=', 'n7e.updateTemporaryConfig=', 'n7e.updateRecord=',
    '_.installKeepQualityToggle=', '_.sellAllEquipmentsCheckBox=', '_.onSilentMode=', 'e7e.CheckAutoStop=', 'e7e.CheckQuality=', '_.qualityCheckBoxChange=']) {
    const at = text.indexOf(marker); if (at < 0) continue;
    let node = acorn.parseExpressionAt(text, at + marker.length, { ecmaVersion: 'latest' });
    if (node.expressions) node = node.expressions[0];
    funcs[marker] = text.slice(node.start, node.end);
  }
  extracted[crypto.createHash('sha256').update(text).digest('hex')] = funcs;
}
fs.writeFileSync(path.join(root, 'functions.json'), JSON.stringify(extracted));
console.log(JSON.stringify({ result: 'BUILT', changes }));

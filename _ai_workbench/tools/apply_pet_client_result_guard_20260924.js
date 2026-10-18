'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '../..');
const bundlePath = path.join(root, 'linhhoasu/webgame/game/js/main.min_drop100.js');
const indexPath = path.join(root, 'linhhoasu/webgame/game/index.html');
const beforeBundle = '0e662b2b3c405cfea3981032d90ba7751e13cb78de004ebfda5f479586aa0ed2';
const beforeIndex = '55769cf9e1692aaccb2890c091ea9a11b56dab09d57af79ac0790291756a9029';

function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function replaceOnce(source, oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${label}:EXPECTED_ONE_GOT_${count}`);
  return source.replace(oldText, newText);
}

let bundle = fs.readFileSync(bundlePath, 'utf8');
let index = fs.readFileSync(indexPath, 'utf8');
if (sha(bundlePath) !== beforeBundle) throw new Error('BUNDLE_HASH_DRIFT');
if (sha(indexPath) !== beforeIndex) throw new Error('INDEX_HASH_DRIFT');

bundle = replaceOnce(
  bundle,
  'function(t){if(t){for(var e=[],i=0,n=t.data;i<n.length;i++){var a=n[i];r.updatePetData(a),e.push(a.slot)}A.ins().dispatch(E.PET_GET_UPDATE,e,s,o)}else l&&l()},null,function(){l&&l()}',
  'function(t){if(!t||t.result!==0||!Array.isArray(t.data))return void(l&&l(t));if(t){for(var e=[],i=0,n=t.data;i<n.length;i++){var a=n[i];r.updatePetData(a),e.push(a.slot)}A.ins().dispatch(E.PET_GET_UPDATE,e,s,o)}else l&&l(t)},null,function(){l&&l()}',
  'sendUseEgg result guard',
);
bundle = replaceOnce(
  bundle,
  'function(t){if(t){if(r._petInfo){',
  'function(t){if(t&&t.result===0){if(r._petInfo){',
  'sendChangeSlot result guard',
);
bundle = replaceOnce(
  bundle,
  'function(t){var e,i,n,a;t?(e=d.getPetDataByUid(o),n=d.getPetDataByUid(s),i=e.id,n=n.id,d.deletePet(s),d.deletePet(o),t.data&&',
  'function(t){if(!t||t.result!==0||!t.data)return void(c&&c(t));var e,i,n,a;t?(e=d.getPetDataByUid(o),n=d.getPetDataByUid(s),i=e&&e.id,n=n&&n.id,d.deletePet(s),d.deletePet(o),t.data&&',
  'sendCompose result guard',
);
{
  const start = bundle.indexOf('a.sendPetEat=function');
  const end = bundle.indexOf('a.sendPetSwap=function', start);
  if (start < 0 || end < 0) throw new Error('sendPetEat method boundary missing');
  const method = bundle.slice(start, end);
  const oldText = 'function(t){var e,i;t?('; const newText = 'function(t){if(!t||t.result!==0||!t.data)return void(h&&h(t));var e,i;t?(';
  if ((method.split(oldText).length - 1) !== 1) throw new Error('sendPetEat method guard anchor mismatch');
  bundle = bundle.slice(0, start) + method.replace(oldText, newText) + bundle.slice(end);
}
bundle = replaceOnce(
  bundle,
  'function(t){if(Y.RechargeModel.addRecords(s,o),h.saveLocalBuyRecord(s,T.serverTimeMilli),r&&Er.Open(t.rewardInfo),r&&Er.CheckOpenSpGetView(t.rewardInfo,!1),t.rewardInfo&&t.rewardInfo.items&&0<t.rewardInfo.items.length)',
  'function(t){if(!t||t.result!==0){S.ins().showTips(t&&t.msg||"Mua thất bại; tài nguyên được giữ nguyên");return void(l&&l(t))}if(Y.RechargeModel.addRecords(s,o),h.saveLocalBuyRecord(s,T.serverTimeMilli),r&&Er.Open(t.rewardInfo),r&&Er.CheckOpenSpGetView(t.rewardInfo,!1),t.rewardInfo&&t.rewardInfo.items&&0<t.rewardInfo.items.length)',
  'sendBuyItem result guard',
);
index = replaceOnce(index, 'js/main.min_drop100.js?v=20260922_demon_boss_sweep_v1', 'js/main.min_drop100.js?v=20260924_pet_result_guard_v1', 'client cache bust');

fs.writeFileSync(bundlePath, bundle, 'utf8');
fs.writeFileSync(indexPath, index, 'utf8');
const result = {
  status: 'PATCHED_LOCAL',
  files: {
    bundle: { path: bundlePath, before: beforeBundle, after: sha(bundlePath), bytes: Buffer.byteLength(bundle) },
    index: { path: indexPath, before: beforeIndex, after: sha(indexPath), bytes: Buffer.byteLength(index) },
  },
  guards: ['sendUseEgg:3300', 'sendChangeSlot:3301', 'sendCompose:3302', 'sendPetEat:3311', 'ShopModel.sendBuyItem:1200'],
};
const evidence = path.join(root, '_ai_workbench/temp/pet_client_result_guard_20260924.json');
fs.writeFileSync(evidence, JSON.stringify(result, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(result, null, 2));

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '../..');
const bundlePath = path.join(root, 'linhhoasu/webgame/game/js/main.min_drop100.js');
const before = '4a6b12eea8863a1b02d9d80b4bef91deb6312ea7678e8d513fab92c4bae40230';
const source = fs.readFileSync(bundlePath, 'utf8');
const actual = crypto.createHash('sha256').update(source).digest('hex');
if (actual !== before) throw new Error(`BUNDLE_HASH_DRIFT:${actual}`);

const oldText = 'if(!t||t.result!==0||!t.data){S.ins().showTips(t&&t.msg||"Ghép thất bại; pet và vật liệu được giữ nguyên");return void(c&&c(t))}var e,i,n,a;t?(e=d.getPetDataByUid(o),n=d.getPetDataByUid(s),i=e&&e.id,n=n&&n.id,d.deletePet(s),d.deletePet(o),';
const newText = 'if(!t||t.result!==0||!t.data){S.ins().showTips(t&&t.msg||"Ghép thất bại; pet và vật liệu được giữ nguyên");return void(c&&c(t))}if(t.composeSuccess===false){var e=d.getPetDataByUid(o);d.deletePet(s),t.data&&d.updatePetData(t.data),S.ins().showTips(t.msg||"Ghép thất bại; giữ linh thú chính, tiêu hao linh thú phụ"),A.ins().dispatch(E.PET_COMP_UPDATE,e,t.data,[r,l],h),A.ins().dispatch(E.ATTR_CHANGE,6);return void(c&&c(t))}var e,i,n,a;t?(e=d.getPetDataByUid(o),n=d.getPetDataByUid(s),i=e&&e.id,n=n&&n.id,d.deletePet(s),d.deletePet(o),';
if (source.split(oldText).length - 1 !== 1) throw new Error('COMPOSE_GUARD_ANCHOR_MISMATCH');
const candidate = source.replace(oldText, newText);
const after = crypto.createHash('sha256').update(candidate).digest('hex');
fs.writeFileSync(bundlePath, candidate, 'utf8');
const evidence = path.join(root, '_ai_workbench/temp/pet_vusa_port_20260929/client-compose-patch.json');
fs.writeFileSync(evidence, JSON.stringify({ result: 'PASS', before: actual, after, marker: 'composeSuccess===false', productionWrites: 0 }, null, 2) + '\n');
console.log(JSON.stringify({ result: 'PASS', before: actual, after, productionWrites: 0 }));

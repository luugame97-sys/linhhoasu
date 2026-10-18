'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '../..');
const sourcePath = path.join(root, '_ai_workbench/temp/pet_vusa_port_20260929/remote_baseline/index.html');
const outPath = path.join(root, '_ai_workbench/temp/pet_vusa_port_20260929/candidate/index.html');
const source = fs.readFileSync(sourcePath, 'utf8');
const before = crypto.createHash('sha256').update(source).digest('hex');
function once(text, from, to, label) {
  if (text.split(from).length - 1 !== 1) throw new Error(`${label}_ANCHOR`);
  return text.replace(from, to);
}
let candidate = source;
candidate = once(candidate, "var translationVersion = '20260924_fishing_scene8_10_v1';", "var translationVersion = '20260929_pet_vusa_port_v1';", 'TRANSLATION_VERSION');
candidate = once(candidate, 'default.res_main_c669f2c0_fashion_candidate.bin', 'default.res_main_c669f2c0_pet_vusa_20260929.bin', 'MAIN_MANIFEST');
candidate = once(candidate, 'default.res_cn_main_f70d4753_fashion_candidate.bin', 'default.res_cn_main_f70d4753_pet_vusa_20260929.bin', 'CN_MANIFEST');
candidate = once(candidate, 'js/main.min_drop100.js?v=20260924_pet_result_guard_v2', 'js/main.min_drop100.js?v=20260929_pet_vusa_port_v1', 'MAIN_CACHE_KEY');
fs.writeFileSync(outPath, candidate, 'utf8');
const after = crypto.createHash('sha256').update(candidate).digest('hex');
fs.writeFileSync(path.join(root, '_ai_workbench/temp/pet_vusa_port_20260929/index-build.json'), JSON.stringify({ result: 'PASS', before, after, cacheKey: '20260929_pet_vusa_port_v1', productionWrites: 0 }, null, 2) + '\n');
console.log(JSON.stringify({ result: 'PASS', before, after, bytes: Buffer.byteLength(candidate) }));

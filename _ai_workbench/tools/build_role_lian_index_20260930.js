'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const sourcePath = path.join(root, 'linhhoasu/webgame/game/index.html');
const outDir = path.join(root, '_ai_workbench/temp/role_lian_manifest_20260930');
const outPath = path.join(outDir, 'index.html');
const oldName = 'default.res_main_c669f2c0_pet_vusa_20260929.bin';
const newName = 'default.res_main_c669f2c0_pet_vusa_lian_20260930.bin';
const oldToken = '20260930_pet_cap1000_v1';
const newToken = '20260930_spine_lian_v1';

const source = fs.readFileSync(sourcePath, 'utf8');
if (source.split(oldName).length - 1 !== 1) throw new Error('MAIN_MANIFEST_ANCHOR');
if (source.split(oldToken).length - 1 !== 1) throw new Error('CACHE_TOKEN_ANCHOR');
const candidate = source.replace(oldName, newName).replace(oldToken, newToken);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, candidate, 'utf8');
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const report = {
  result: 'PASS',
  source: { path: sourcePath, bytes: Buffer.byteLength(source), sha256: sha(source) },
  candidate: { path: outPath, bytes: Buffer.byteLength(candidate), sha256: sha(candidate) },
  oldName,
  newName,
  oldToken,
  newToken,
  productionWrites: 0,
};
fs.writeFileSync(path.join(outDir, 'index-build.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));

'use strict';
// Read-only verification of the staged pet delta, and explicit release gates.
// No gameplay calls or production writes. Does not certify unobserved behavior.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const base = path.join(root, '_ai_workbench/temp/pet_vusa_port_20260929');
const app = path.join(root, 'linhhoasu/lhs/newServer');
const logger = require.resolve(path.join(app, 'src/logger'));
require.cache[logger] = { id: logger, filename: logger, loaded: true, exports: { info() {}, warn() {}, error() {} } };
const config = require(path.join(app, 'src/services/ConfigService'));
const read = p => fs.readFileSync(path.join(root, p));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const tables = config.decodeTables(fs.readFileSync(path.join(base, 'candidate/config_e5ac72c2.bin')));
const before = config.decodeTables(read('linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin'));
const vusa = config.decodeTables(read('_ai_workbench/temp/vusa_login_assets_20260928/config_e5ac72c2.bin'));
const lang = config.decodeTables(fs.readFileSync(path.join(base, 'candidate/config_lang_c2fa8585.bin'))).LanguageConfig;
const langBefore = config.decodeTables(fs.readFileSync(path.join(base, 'remote_baseline/config_lang_c2fa8585.bin'))).LanguageConfig;
const ref = path.join(root, '_ai_workbench/temp/vusa_login_assets_20260928');
const ids = [810101, 810201, 810301, 810401, 810501];
const allowed = ['PetConfig','PetSkillConfig','PetQualityConfig','PetBaseConfig','SkillConfig','SkillBehaviorConfig','SkillEffectConfig','EffectConfig','AssetsConfig','AppearanceConfig'];
const deltas = {};
for (const [name, rows] of Object.entries(before)) {
  if (!allowed.includes(name)) assert.deepEqual(tables[name], rows, 'UNRELATED_TABLE_CHANGED:' + name);
  else if (!['PetBaseConfig','PetQualityConfig'].includes(name)) {
    for (const [id, row] of Object.entries(rows)) assert.deepEqual(tables[name][id], row, 'EXISTING_ROW_CHANGED:' + name + ':' + id);
    deltas[name] = Object.keys(tables[name]).length - Object.keys(rows).length;
    for (const id of Object.keys(tables[name]).filter(id => !rows[id])) assert.deepEqual(tables[name][id], vusa[name][id]);
  }
}
for (const [id,row] of Object.entries(langBefore)) assert.deepEqual(lang[id], row, 'LANGUAGE_CHANGED:' + id);
assert.equal(Object.keys(lang).length - Object.keys(langBefore).length, 47);
for (const id of ids) for (const skillRow of Object.values(tables.PetSkillConfig[id])) {
  for (const sid of [skillRow.skill,skillRow.extraSkill]) {
    const skill = tables.SkillConfig[sid]; assert.ok(skill, 'MISSING_SKILL:' + sid);
    assert.ok(lang[skill.desc], 'MISSING_SKILL_DESCRIPTION:' + sid);
    for (const aid of skill.actions) assert.ok(tables.SkillBehaviorConfig[aid]);
  }
}
let assetBytes = 0;
for (const item of JSON.parse(fs.readFileSync(path.join(ref, 'download_results.json'),'utf8'))) {
  const file = fs.readFileSync(path.join(base,'candidate', item.url));
  assert.equal(sha(file), item.sha256, 'ASSET_HASH:' + item.name);
  assetBytes += file.length;
}
const frame = fs.readFileSync(path.join(base, 'candidate/assets/atlas_ui/1_lilian/lingshou/zhujiemian/ls_bm_frame_10_d7d6d87a.png'));
assert.equal(sha(frame), '5c0b9ee44b1d33547adc885940b91914654c5096da44e4f0ca454dabc16118aa');
const bodyFiles = JSON.parse(fs.readFileSync(path.join(ref, 'pet_810_manifest_rows.json'),'utf8')).rows;
const bodies = [];
for (const id of ids) {
  const row = bodyFiles.find(r => r.name === 'sp_pet_' + id + '_json');
  const body = JSON.parse(fs.readFileSync(path.join(ref, row.url),'utf8'));
  const atlasRow = bodyFiles.find(r => r.name === 'sp_pet_' + id + '_atlas');
  const atlas = fs.readFileSync(path.join(ref,atlasRow.url),'utf8');
  const textureRow = bodyFiles.find(r => r.name === 'sp_pet_' + id + '_png');
  const png = fs.readFileSync(path.join(ref,textureRow.url));
  assert.equal(body.skeleton.spine,'3.7.94');
  assert.ok(atlas.includes('sp_pet_' + id + '.png'));
  assert.equal(png.subarray(0,8).toString('hex'), '89504e470d0a1a0a');
  for (const animation of ['stand','attack']) assert.ok(body.animations[animation]);
  bodies.push({id,version:body.skeleton.spine,animations:Object.keys(body.animations),width:png.readUInt32BE(16),height:png.readUInt32BE(20)});
}
const report = {
  result: 'DATA_DELTA_PASS_RELEASE_BLOCKED',
  checks: { configTables: Object.keys(tables).length, unchangedTables: Object.keys(tables).length-allowed.length, deltas, languageKeysAdded:47, assets:31, assetBytes:assetBytes+frame.length },
  q9Rate: { numerator: tables.PetQualityConfig[9].composeSuccessRate, denominator:10000, percent:tables.PetQualityConfig[9].composeSuccessRate/100 },
  bodies,
  sourceConflict: { commonRuleKey:30010506, commonRule:lang[30010506], vusaNewKey:39100002, vusaNewRule:lang[39100002], status:'text conflict; no authoritative reference RPC trace; do not generalize retain-primary to all qualities' },
  releaseBlockers: [
    'Reference failed-compose contract unresolved across qualities (common EXP rule versus new retained-primary message)',
    'Existing battle simulator has no native pet-skill context; five pet effects/extraSkill not integrated',
    'EXP overflow-to-item36 conversion formula not verified',
    'Draft hand-compose and auto-compose differ on main UID/different-type outcomes',
    'Persistence failure/retry and full native-client regression not yet QAed',
    'Five new pets not QAed end-to-end on vanduc97'
  ],
  productionSourceWrites:0, playerWrites:0, at:new Date().toISOString()
};
fs.writeFileSync(path.join(base,'release-gates.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({ result:report.result, checks:report.checks, q9Rate:report.q9Rate, releaseBlockers:report.releaseBlockers }));

'use strict';

// Candidate-only builder for the five VUSA quality-10 pets. It merges only
// additive pet/config rows plus the documented q9/q10 thresholds; all other
// tables and existing rows remain byte-for-byte in their original frame.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const assert = require('node:assert/strict');
const { BinJsonUtil, ByteArray } = require('../../linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, '_ai_workbench/temp/pet_vusa_port_20260929/candidate');
const LOCAL_CONFIG = path.join(ROOT, 'linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin');
const VUSA_CONFIG = path.join(ROOT, '_ai_workbench/temp/vusa_login_assets_20260928/config_e5ac72c2.bin');
const REMOTE_LANG = path.join(ROOT, '_ai_workbench/temp/pet_vusa_port_20260929/remote_baseline/config_lang_c2fa8585.bin');
const VUSA_LANG = path.join(ROOT, '_ai_workbench/temp/vusa_login_assets_20260928/config_lang_c2fa8585_vusa.bin');

const PET_IDS = [810101, 810201, 810301, 810401, 810501];
const ADDITIVE_TABLES = [
  'PetConfig', 'PetSkillConfig', 'SkillConfig', 'SkillBehaviorConfig',
  'SkillEffectConfig', 'EffectConfig', 'AssetsConfig', 'AppearanceConfig',
];

function sha(data) { return crypto.createHash('sha256').update(data).digest('hex'); }

function decodeFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset < buffer.length) {
    const nameLen = buffer.readUInt8(offset); offset += 1;
    assert.ok(nameLen > 0 && offset + nameLen + 4 <= buffer.length, 'CONFIG_FRAME_HEADER');
    const name = buffer.subarray(offset, offset + nameLen).toString('utf8'); offset += nameLen;
    const length = buffer.readUInt32BE(offset); offset += 4;
    assert.ok(length > 0 && offset + length <= buffer.length, `CONFIG_FRAME_LENGTH:${name}`);
    const data = Buffer.from(buffer.subarray(offset, offset + length)); offset += length;
    const inflated = zlib.inflateSync(data);
    const value = BinJsonUtil.readFullJson(new ByteArray(inflated));
    frames.push({ name, data, value });
  }
  assert.equal(offset, buffer.length, 'CONFIG_FRAME_TRAILING_BYTES');
  return frames;
}

function encodeTable(value) {
  // The largest changed table here is AssetsConfig; 32 MiB is ample for its
  // binary form and avoids allocating a 128 MiB buffer per table in parallel
  // Node processes.
  const bytes = new ByteArray(undefined, 64 * 1024);
  BinJsonUtil.json2bin(value, bytes);
  return zlib.deflateSync(Buffer.from(bytes.bytes.subarray(0, bytes.position)), { level: 9 });
}

function encodeFrames(frames) {
  return Buffer.concat(frames.map((frame) => {
    const name = Buffer.from(frame.name, 'utf8');
    assert.ok(name.length <= 255, `CONFIG_NAME_TOO_LONG:${frame.name}`);
    const data = frame.changed ? encodeTable(frame.value) : frame.data;
    const header = Buffer.alloc(1 + name.length + 4);
    header.writeUInt8(name.length, 0);
    name.copy(header, 1);
    header.writeUInt32BE(data.length, 1 + name.length);
    return Buffer.concat([header, data]);
  }));
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function row(table, id) { return table[id] || table[String(id)] || null; }

function mergeConfig(localPath, vusaPath) {
  const localBytes = fs.readFileSync(localPath);
  const vusaBytes = fs.readFileSync(vusaPath);
  const localFrames = decodeFrames(localBytes);
  const vusaFrames = decodeFrames(vusaBytes);
  const original = Object.fromEntries(localFrames.map((f) => [f.name, clone(f.value)]));
  const local = Object.fromEntries(localFrames.map((f) => [f.name, f.value]));
  const vusa = Object.fromEntries(vusaFrames.map((f) => [f.name, f.value]));
  const changed = [];

  for (const tableName of ADDITIVE_TABLES) {
    assert.ok(local[tableName] && vusa[tableName], `TABLE_MISSING:${tableName}`);
    const target = local[tableName];
    const source = vusa[tableName];
    const ids = ['SkillConfig', 'SkillBehaviorConfig', 'SkillEffectConfig', 'EffectConfig'].includes(tableName)
      ? Object.keys(source).filter((id) => PET_IDS.some((petId) => id.startsWith(String(petId))))
      : PET_IDS;
    const added = [];
    for (const id of ids) {
      const key = String(id);
      if (source[key] == null) continue;
      if (target[key] != null) {
        assert.deepEqual(target[key], source[key], `CONFLICT:${tableName}:${key}`);
        continue;
      }
      target[key] = clone(source[key]);
      added.push(id);
    }
    if (added.length) changed.push({ table: tableName, added });
  }

  assert.ok(local.PetQualityConfig && vusa.PetQualityConfig, 'TABLE_MISSING:PetQualityConfig');
  const localQ9 = local.PetQualityConfig['9'];
  const vusaQ9 = vusa.PetQualityConfig['9'];
  assert.ok(localQ9 && vusaQ9, 'QUALITY9_MISSING');
  assert.equal(localQ9.consumes[0].id, vusaQ9.consumes[0].id, 'QUALITY9_COST_ID');
  assert.equal(localQ9.consumes[0].count, vusaQ9.consumes[0].count, 'QUALITY9_COST');
  local.PetQualityConfig['9'] = clone(vusaQ9);
  local.PetQualityConfig['10'] = clone(vusa.PetQualityConfig['10']);
  changed.push({ table: 'PetQualityConfig', changed: ['9'], added: ['10'] });

  assert.ok(local.PetBaseConfig && vusa.PetBaseConfig, 'TABLE_MISSING:PetBaseConfig');
  local.PetBaseConfig.breakLimitPetQuality = clone(vusa.PetBaseConfig.breakLimitPetQuality);
  changed.push({ table: 'PetBaseConfig', changed: ['breakLimitPetQuality'] });

  const configCandidate = encodeFrames(localFrames.map((frame) => ({
    ...frame,
    value: local[frame.name],
    changed: frame.name === 'PetQualityConfig' || frame.name === 'PetBaseConfig' || ADDITIVE_TABLES.includes(frame.name),
  })));
  const decoded = Object.fromEntries(decodeFrames(configCandidate).map((f) => [f.name, f.value]));
  const expectedAdds = { PetConfig: 5, PetSkillConfig: 5, SkillConfig: 30, SkillBehaviorConfig: 48, SkillEffectConfig: 18, EffectConfig: 5, AssetsConfig: 5, AppearanceConfig: 5 };
  for (const [name, expected] of Object.entries(expectedAdds)) {
    assert.equal(Object.keys(decoded[name]).length - Object.keys(original[name]).length, expected, 'DELTA_COUNT:' + name);
    for (const [id, value] of Object.entries(original[name])) assert.deepEqual(decoded[name][id], value, `EXISTING_ROW_CHANGED:${name}:${id}`);
  }
  for (const frame of decodeFrames(configCandidate)) {
    assert.deepEqual(frame.value, local[frame.name], 'ROUNDTRIP:' + frame.name);
    if (!ADDITIVE_TABLES.includes(frame.name) && !['PetQualityConfig', 'PetBaseConfig'].includes(frame.name)) {
      assert.ok(frame.data.equals(localFrames.find(f => f.name === frame.name).data), 'UNRELATED_FRAME_CHANGED:' + frame.name);
    }
  }
  for (const id of PET_IDS) {
    assert.equal(row(decoded.PetConfig, id).quality, 10, `PET_QUALITY:${id}`);
    assert.ok(row(decoded.AppearanceConfig, id), `PET_APPEARANCE:${id}`);
    assert.ok(row(decoded.AssetsConfig, id), `PET_ASSET_ROW:${id}`);
    assert.ok(row(decoded.PetSkillConfig, id), `PET_SKILL_ROW:${id}`);
    for (const level of Object.values(decoded.PetSkillConfig[id])) {
      for (const skillId of [level.skill, level.extraSkill]) {
        const skill = decoded.SkillConfig[skillId];
        assert.ok(skill, 'MISSING_SKILL:' + skillId);
        for (const action of skill.actions || []) assert.ok(decoded.SkillBehaviorConfig[action], 'MISSING_BEHAVIOR:' + action);
      }
    }
  }
  assert.equal(decoded.PetQualityConfig['10'].passiveSkillCount, 7, 'QUALITY10_PASSIVES');
  assert.deepEqual(decoded.PetBaseConfig.breakLimitPetQuality, [7, 9, 10], 'BREAK_LIMITS');
  return { bytes: configCandidate, changed, before: { sha256: sha(localBytes), bytes: localBytes.length }, after: { sha256: sha(configCandidate), bytes: configCandidate.length }, tableCounts: Object.fromEntries(Object.entries(decoded).map(([k, v]) => [k, Object.keys(v || {}).length])) };
}

function mergeLanguage(localPath, vusaPath) {
  const localBytes = fs.readFileSync(localPath);
  const vusaBytes = fs.readFileSync(vusaPath);
  const localFrames = decodeFrames(localBytes);
  const vusaFrames = decodeFrames(vusaBytes);
  const localLanguage = localFrames.find((f) => f.name === 'LanguageConfig');
  const vusaLanguage = vusaFrames.find((f) => f.name === 'LanguageConfig');
  assert.ok(localLanguage && vusaLanguage, 'LANGUAGE_TABLE_MISSING');
  const added = [];
  for (const [key, value] of Object.entries(vusaLanguage.value)) {
    if (localLanguage.value[key] != null) continue;
    localLanguage.value[key] = clone(value);
    added.push(key);
  }
  assert.equal(added.length, 47, `LANGUAGE_DELTA_COUNT:${added.length}`);
  const candidate = encodeFrames(localFrames.map((frame) => ({ ...frame, changed: frame.name === 'LanguageConfig' })));
  const decoded = Object.fromEntries(decodeFrames(candidate).map((f) => [f.name, f.value]));
  for (const id of ['810101', '810201', '810301', '810401', '810501', '39100001', '39100002']) assert.ok(decoded.LanguageConfig[id], `LANGUAGE_KEY:${id}`);
  return { bytes: candidate, added, before: { sha256: sha(localBytes), bytes: localBytes.length }, after: { sha256: sha(candidate), bytes: candidate.length } };
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const config = mergeConfig(LOCAL_CONFIG, VUSA_CONFIG);
  const language = mergeLanguage(REMOTE_LANG, VUSA_LANG);
  fs.writeFileSync(path.join(OUT, 'config_e5ac72c2.bin'), config.bytes);
  fs.writeFileSync(path.join(OUT, 'config_lang_c2fa8585.bin'), language.bytes);
  const report = {
    result: 'PASS',
    scope: 'vusa-pet-quality10-additive',
    petIds: PET_IDS,
    config: { ...config, bytes: undefined },
    language: { ...language, bytes: undefined },
    productionWrites: 0,
  };
  fs.writeFileSync(path.join(OUT, 'build.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ result: report.result, config: report.config.after, language: report.language.after, changed: report.config.changed.map(r=>({table:r.table,added:(r.added||[]).length})), productionWrites: 0 }));
}

main();

'use strict';

/* Round-trip/semantic checks for the scene8..10 candidate outputs. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { CANDIDATE_SCENES, decodeTables } = require('./patch_fishing_scene8_10_binary_candidate');

const ROOT = path.resolve(__dirname, '..', '..');
const CANDIDATE_DIR = path.join(ROOT, '_ai_workbench', 'temp', 'fishing_scene8_10_candidate_20260924');
const OUTPUTS = [
  'lhs_config_e5ac72c2.bin',
  'webgame_config_e5ac72c2.bin',
  'lhs_config_fashion_20260909.bin',
  'webgame_config_fashion_20260909.bin',
];

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function checkOutput(name) {
  const file = path.join(CANDIDATE_DIR, name);
  assert.ok(fs.existsSync(file), `OUTPUT_MISSING:${name}`);
  const tables = decodeTables(fs.readFileSync(file));
  assert.equal(tables.length, 714, `TABLE_COUNT:${name}`);
  const map = new Map(tables.map((table) => [table.name, table.value]));
  const scenes = map.get('FishSceneConfig');
  assert.ok(scenes, `FISH_SCENE_MISSING:${name}`);
  for (const spec of CANDIDATE_SCENES) {
    const row = scenes[String(spec.id)];
    const source = scenes[String(spec.source)];
    assert.ok(row, `SCENE_MISSING:${name}:${spec.id}`);
    assert.equal(row.id, spec.id, `SCENE_ID:${name}:${spec.id}`);
    assert.equal(row.cond, spec.cond, `SCENE_COND:${name}:${spec.id}`);
    assert.equal(row.openDay, spec.openDay, `SCENE_OPEN_DAY:${name}:${spec.id}`);
    assert.equal(row.isActivity, 0, `SCENE_ACTIVITY:${name}:${spec.id}`);
    assert.deepEqual(row.fishes, source.fishes, `SCENE_FISHES:${name}:${spec.id}`);
    assert.deepEqual(row.relics, source.relics, `SCENE_RELICS:${name}:${spec.id}`);
    for (const field of ['picture', 'banner', 'miniBanner']) {
      assert.equal(row[field], source[field], `SCENE_ASSET:${name}:${spec.id}:${field}`);
    }
  }
  return { name, bytes: fs.statSync(file).size, sha256: sha256(file), scenes: CANDIDATE_SCENES.map((s) => s.id) };
}

function main() {
  const outputs = OUTPUTS.map(checkOutput);
  const hashes = new Set(outputs.map((row) => row.sha256));
  assert.equal(hashes.size, 1, 'OUTPUT_HASHES_DIVERGED');
  const evidence = {
    result: 'PASS',
    version: 'fishing_scene8_10_candidate_v1',
    outputs,
    productionWrites: 0,
    checks: ['table_count=714', 'scene8..10 rows', 'fish/relic/resource reuse', 'all output hashes equal'],
  };
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = { checkOutput, OUTPUTS };

'use strict';

// Candidate-only contract test.  It loads the shipped config binary, enables
// the opt-in extension, and exercises scene gating/payload normalization.
process.env.FISHING_SCENES_8_10_ENABLED = '1';
process.env.NODE_ENV = 'test';

const assert = require('assert');
const config = require('../src/services/ConfigService');
const integrity = require('../src/services/FishingIntegrityService');
const payload = require('../src/handlers/playerPayload');

async function main() {
  const tables = config.loadAllTables();
  const scenes = tables.FishSceneConfig;
  const extension = tables.FishingScenesExtensionConfig;
  assert.deepStrictEqual(extension.ids, [8, 9, 10]);
  assert.strictEqual(extension.version, 'fishing_scenes_8_10_v1');
  assert.strictEqual(extension.reusedNativeAssets, true);

  const expected = { 8: 31, 9: 34, 10: 37 };
  for (const id of [8, 9, 10]) {
    const row = scenes[id];
    assert.ok(row, `scene ${id} must exist`);
    assert.strictEqual(row.cond, expected[id]);
    assert.strictEqual(row.openDay, 1);
    assert.strictEqual(row.isActivity, 0);
    assert.ok(Array.isArray(row.fishes) && row.fishes.length >= 15);
    assert.ok(Array.isArray(row.relics) && row.relics.length >= 6);
    assert.strictEqual(row.picture, 'fishing_scene_7');
    assert.strictEqual(row.banner, 'ui_dydj_bm_banner7');

    const below = await integrity.canUseScene({ fishInfo: { level: row.cond - 1 } }, id);
    const at = await integrity.canUseScene({ fishInfo: { level: row.cond } }, id);
    assert.strictEqual(below, false, `scene ${id} must stay locked below cond`);
    assert.strictEqual(at, true, `scene ${id} must unlock at cond`);
  }

  const normalized = payload.buildPlayer500Data({
    playerId: 'candidate-fishing-scenes',
    fishInfo: { level: 40, scene: 10 },
  });
  assert.strictEqual(normalized.fishInfo.scene, 10, 'login payload must preserve configured scene 10');

  console.log(JSON.stringify({
    pass: true,
    productionWrites: 0,
    scenes: [8, 9, 10].map((id) => ({
      id,
      cond: scenes[id].cond,
      fishCount: scenes[id].fishes.length,
      relicCount: scenes[id].relics.length,
    })),
  }));
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

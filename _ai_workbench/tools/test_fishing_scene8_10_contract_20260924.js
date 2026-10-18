'use strict';

// Candidate-only contract test. It uses the patched config binary and never
// connects to Mongo/Redis or saves a player.
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const candidate = process.env.SCENE_CONFIG_BIN
  || path.join(root, '_ai_workbench', 'temp', 'fishing_scene8_10_candidate_20260924', 'lhs_config_fashion_20260909.bin');
process.env.CONFIG_BIN_PATH = candidate;
process.env.NODE_ENV = 'test';
process.env.LOG_DIR = '';

const config = require(path.join(root, 'linhhoasu', 'lhs', 'newServer', 'src', 'services', 'ConfigService'));
const integrity = require(path.join(root, 'linhhoasu', 'lhs', 'newServer', 'src', 'services', 'FishingIntegrityService'));
const playerService = require(path.join(root, 'linhhoasu', 'lhs', 'newServer', 'src', 'services', 'PlayerService'));
playerService.savePlayer = async (_userId, player) => player;
const fish = require(path.join(root, 'linhhoasu', 'lhs', 'newServer', 'src', 'handlers', 'fish'));

const tables = config.loadAllTables(candidate);
const scenes = tables.FishSceneConfig;
const normal = Object.values(scenes).filter((row) => row && !row.isActivity && Array.isArray(row.fishes) && row.fishes.length);
const expected = { 8: 31, 9: 34, 10: 37 };
assert.deepEqual(normal.filter((row) => row.id >= 8).map((row) => row.id), [8, 9, 10]);
for (const [idText, level] of Object.entries(expected)) {
  const id = Number(idText);
  const row = scenes[id];
  assert.equal(row.cond, level, `scene${id}:cond`);
  assert.equal(row.isActivity, 0, `scene${id}:activity`);
  assert.ok(row.fishes.length > 0, `scene${id}:fishes`);
  assert.ok(row.relics.length > 0, `scene${id}:relics`);
  assert.ok(tables.FishConfig[row.fishes[0]], `scene${id}:fish-config`);
  assert.ok(tables.AssetsConfig[row.relics[0]], `scene${id}:relic-config`);
  assert.ok(typeof row.picture === 'string' && typeof row.banner === 'string' && typeof row.miniBanner === 'string', `scene${id}:assets`);
}

const player = {
  userId: 'scene8-10-contract',
  playerId: 'scene8-10-contract',
  fishInfo: { level: 1, scene: 1 },
};
const gate = async (level, sceneId) => {
  player.fishInfo.level = level;
  return integrity.canUseScene(player, sceneId);
};
const checks = [];
(async () => {
  for (const [idText, required] of Object.entries(expected)) {
    const id = Number(idText);
    checks.push({ scene: id, level: required - 1, open: await gate(required - 1, id) });
    checks.push({ scene: id, level: required, open: await gate(required, id) });
  }
  assert.deepEqual(checks.map((row) => row.open), [false, true, false, true, false, true]);
  for (const level of [1, 27, 28, 30, 31, 33, 34, 36, 37, 39, 40]) {
    player.fishInfo.level = level;
    const opened = normal.filter((row) => integrity.canUseScene(player, row.id));
    assert.ok(opened.length >= 1, `no-scene-at-level-${level}`);
  }
  const originalIds = [1, 2, 3, 4, 5, 6, 7];
  assert.deepEqual(normal.slice(0, 7).map((row) => row.id), originalIds);
  assert.ok(Object.values(scenes).filter((row) => row.isActivity).every((row) => row.id >= 101));
  const pool = [...new Set(normal.filter((row) => row.cond <= player.fishInfo.level).flatMap((row) => row.fishes))];
  assert.ok(Array.isArray(pool) && pool.length > 0);
  player.fishInfo.level = 31;
  player.fishInfo.scene = 7;
  const session = {
    userId: player.userId,
    player,
    _fishRooms: {
      async enter(current, mapId, _roomId, save) {
        await save();
        return { tag: 4002, msgUid: 77, data: { result: 0, id: mapId } };
      },
    },
  };
  const transition = await fish.handleFishChangeScene({ id: 8 }, session, 77);
  assert.equal(transition.data.result, 0);
  assert.equal(transition.data.id, 8);
  assert.equal(session.player.fishInfo.scene, 8);
  process.stdout.write(`${JSON.stringify({ result: 'PASS', version: 'fishing_scene8_10_contract_v1', scenes: expected, boundaryChecks: checks, poolSizeAtLevel40: pool.length, productionWrites: 0 }, null, 2)}\n`);
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

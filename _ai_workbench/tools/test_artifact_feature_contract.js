'use strict';

const assert = require('assert');
const path = require('path');

process.env.NODE_ENV = 'test';
const appRoot = process.env.APP_ROOT || path.resolve(__dirname, '..', '..', 'linhhoasu', 'lhs', 'newServer');
const config = require(path.join(appRoot, 'src', 'services', 'ConfigService'));
const playerService = require(path.join(appRoot, 'src', 'services', 'PlayerService'));
const artifact = require(process.env.ARTIFACT_HANDLER_PATH || path.join(appRoot, 'src', 'handlers', 'artifact'));

config.loadAllTables();
const originalSavePlayer = playerService.savePlayer;
playerService.savePlayer = async (_userId, player) => player;

function packetList(result) {
  return Array.isArray(result) ? result : [result];
}

function packet(result, tag) {
  return packetList(result).find((row) => Number(row && row.tag) === tag) || null;
}

function itemDelta(result, id) {
  const sync = packet(result, 1202);
  const rows = sync && sync.data && Array.isArray(sync.data.items) ? sync.data.items : [];
  const row = rows.find((entry) => Number(entry && entry.id) === id);
  return row ? Number(row.count) : 0;
}

function freshPlayer(overrides = {}) {
  return {
    userId: 'artifact-contract',
    currencies: { diamond: 1000, silver: 2000, gold: 3000 },
    items: { 52: 100, 53: 10, 54: 100, 191: 10, 192: 100, 193: 10, 200: 20, 205: 200 },
    artifactInfo: {
      artifacts: [{ uid: 300001, id: 23101, count: 0, lock: 0, attr: { type: 54, level: 1, value: 400 }, extraAttrs: [], skillGroup: 0, skillLv: 1, quenchLv: 0, element: 1 }],
      equipMap: { 1: 300001 },
      orbInfo: {
        slotData: [{ index: 0, slot: 0, orbId: 9101, level: 1 }],
        orbDataMap: { 9101: { id: 9101, level: 1, star: 0, exp: 0, subCount: 1, spAttrs: [] } },
      },
    },
    ...overrides,
  };
}

async function run() {
  const session = (player) => ({ userId: 'artifact-contract', player });

  const upgradePlayer = freshPlayer();
  const beforeUpgrade = upgradePlayer.items[52];
  const upgrade = await artifact.handleArtifactUpgrade({ uid: 300001, useItem: 0 }, session(upgradePlayer), 1);
  assert.strictEqual(packet(upgrade, 3500).data.result, 0, 'artifact upgrade should succeed');
  assert.strictEqual(itemDelta(upgrade, 52), -(beforeUpgrade - upgradePlayer.items[52]), 'upgrade sync must be a delta');
  assert.strictEqual(itemDelta(upgrade, 1), 0, 'upgrade sync must not add diamond');
  assert.strictEqual(itemDelta(upgrade, 2), 0, 'upgrade sync must not add silver');
  assert.strictEqual(itemDelta(upgrade, 6), 0, 'upgrade sync must not add gold');
  const upgradeItems = packet(upgrade, 1202).data.items;
  assert.ok(upgradeItems.every((row) => Number(row.count) < 0), 'upgrade item sync must contain only consumed deltas');

  const insufficient = freshPlayer({ items: { 52: 100, 191: 3, 193: 5, 192: 0 } });
  const beforeInsufficient = JSON.stringify(insufficient.items);
  const blockedQuench = await artifact.handleArtifactQuench({ uid: 300001, element: 1, trans: 0 }, session(insufficient), 2);
  assert.strictEqual(packet(blockedQuench, 3505).data.result, -1, 'quench must reject when replacement material is unavailable');
  assert.strictEqual(JSON.stringify(insufficient.items), beforeInsufficient, 'failed quench must not partially consume materials');

  const quenchPlayer = freshPlayer({
    items: { 191: 3, 192: 10, 193: 5 },
    artifactInfo: {
      artifacts: [{ uid: 300001, id: 23103, count: 0, lock: 0, attr: { type: 54, level: 30, value: 4000 }, extraAttrs: [], skillGroup: 23009, skillLv: 1, quenchLv: 0, element: 1 }],
      equipMap: { 1: 300001 },
    },
  });
  const quench = await artifact.handleArtifactQuench({ uid: 300001, element: 1, trans: 2 }, session(quenchPlayer), 3);
  assert.strictEqual(packet(quench, 3505).data.result, 0, 'quench with replacement material should succeed');
  assert.ok(quenchPlayer.artifactInfo.artifacts[0].eSkillGroup > 0, 'quench should assign an element skill group');
  assert.strictEqual(quenchPlayer.items[191], 0, 'quench should consume available base material');
  assert.strictEqual(quenchPlayer.items[192], 0, 'quench should consume exact replacement material');
  assert.strictEqual(quenchPlayer.items[193], 0, 'quench should consume catalyst');
  assert.strictEqual(itemDelta(quench, 192), -10, 'quench sync should report replacement delta');
  assert.strictEqual(itemDelta(quench, 1), 0, 'quench sync must not add diamond');

  const invalidElementPlayer = freshPlayer({
    items: { 191: 100, 192: 100, 193: 100 },
    artifactInfo: {
      artifacts: [{ uid: 300001, id: 23103, count: 0, lock: 0, attr: { type: 54, level: 30, value: 4000 }, extraAttrs: [], skillGroup: 23009, skillLv: 1, quenchLv: 0, element: 1 }],
      equipMap: { 1: 300001 },
    },
  });
  const invalidElement = await artifact.handleArtifactQuench({ uid: 300001, element: 99, trans: 0 }, session(invalidElementPlayer), 31);
  assert.strictEqual(packet(invalidElement, 3505).data.result, -1, 'quench must reject invalid element');

  const summonPlayer = freshPlayer();
  const summonBefore = summonPlayer.items[200];
  const summon = await artifact.handleArtifactOrbSummon({ count: 2 }, session(summonPlayer), 4);
  assert.strictEqual(packet(summon, 6403).data.result, 0, 'orb summon should succeed with cost');
  assert.strictEqual(summonPlayer.items[200], summonBefore - 2, 'orb summon must consume call material');
  assert.strictEqual(itemDelta(summon, 200), -2, 'orb summon sync must be a cost delta');
  assert.strictEqual(itemDelta(summon, 1), 0, 'orb summon sync must not add diamond');

  const levelPlayer = freshPlayer();
  const level = await artifact.handleArtifactOrbLevelUp({ slot: 0, level: 2 }, session(levelPlayer), 5);
  assert.strictEqual(packet(level, 6401).data.result, 0, 'orb level-up should succeed with material');
  assert.strictEqual(levelPlayer.artifactInfo.orbInfo.slotData[0].level, 2, 'orb slot level must advance exactly one step');
  assert.ok(itemDelta(level, 205) < 0, 'orb level-up must consume configured material');
  const levelBeforeRetry = JSON.stringify(levelPlayer.items);
  const retry = await artifact.handleArtifactOrbLevelUp({ slot: 0, level: 4 }, session(levelPlayer), 6);
  assert.strictEqual(packet(retry, 6401).data.result, -1, 'orb level-up must reject skipped levels');
  assert.strictEqual(JSON.stringify(levelPlayer.items), levelBeforeRetry, 'rejected orb level-up must not consume materials');

  const starPlayer = freshPlayer();
  const star = await artifact.handleArtifactOrbStarUp({ id: 9101, star: 1 }, session(starPlayer), 7);
  assert.strictEqual(packet(star, 6402).data.result, 0, 'orb star-up should succeed with duplicate orb progress');
  assert.strictEqual(starPlayer.artifactInfo.orbInfo.orbDataMap[9101].star, 1, 'orb star must advance exactly one step');
  assert.strictEqual(starPlayer.artifactInfo.orbInfo.orbDataMap[9101].subCount, 0, 'orb star-up must consume duplicate progress');

  const decomposePlayer = freshPlayer();
  const decompose = await artifact.handleArtifactOrbDecompose({ ids: [9101] }, session(decomposePlayer), 8);
  assert.strictEqual(packet(decompose, 6405).data.result, 0, 'orb decompose should succeed');
  assert.strictEqual(itemDelta(decompose, 205), 2, 'orb decompose sync must report only reward delta');
  assert.strictEqual(itemDelta(decompose, 1), 0, 'orb decompose sync must not add diamond');

  playerService.savePlayer = originalSavePlayer;
  console.log(JSON.stringify({ result: 'ok', checks: 7 }));
}

run().catch((error) => {
  playerService.savePlayer = originalSavePlayer;
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});

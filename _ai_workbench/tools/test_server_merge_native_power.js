'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const worker = require('./server_merge_native_power');

const repo = path.resolve(__dirname, '..', '..');
const sourceRoot = path.join(repo, 'linhhoasu', 'lhs', 'newServer');
const configPath = path.join(repo, 'linhhoasu', 'lhs', 'update', 'resource', 'assets', 'excel', 'config_e5ac72c2.bin');
assert.ok(fs.existsSync(configPath), 'fixture config must exist');

function player(level) {
  return { playerId: 'merge-test-1', userId: 'merge-user-1', name: 'Merge Test', level,
    roleInfo: { stage: 1 }, boxInfo: { level: 1 }, equipInfo: { curIndex: 0, equipSetMap: { 0: {} } },
    formationInfo: {}, fashionInfo: {}, swordInfo: {}, spiritInfo: {}, artifactInfo: {}, petInfo: {},
    other_attr_info: {}, items: {} };
}

const before = [player(10)];
const after = [player(10)];
const beforeHash = worker.stableHash(before);
const result = worker.run({ sourceRoot, configPath, clock: 1234567890, playersBefore: before, playersAfter: after,
  sourceHash: 'src-test', configHash: 'cfg-test', buildHash: 'build-test' });
assert.equal(result.ok, true);
assert.equal(result.count, 1);
assert.deepEqual(result.ids, ['merge-test-1']);
assert.equal(result.rows[0].displayPowerDelta, 0);
assert.equal(result.rows[0].powerScoreDelta, 0);
assert.equal(result.writes, 0);
assert.equal(result.networkAttempts, 0);
assert.equal(result.databaseAttempts, 0);
assert.equal(worker.stableHash(before), beforeHash, 'input snapshot must remain unchanged');

assert.throws(() => worker.run({ sourceRoot, configPath, clock: 1, playersBefore: before, playersAfter: [] }), /PLAYERS_AFTER_REQUIRED/);
assert.throws(() => worker.run({ sourceRoot, configPath, clock: 1, playersBefore: before, playersAfter: [player(11), { playerId: 'other', level: 1 }] }), /PLAYER_SET_MISMATCH/);
assert.throws(() => worker.run({ sourceRoot, configPath: path.join(repo, 'missing.bin'), clock: 1, playersBefore: before, playersAfter: after }), /CONFIG_FILE_MISSING/);
console.log(JSON.stringify({ ok: true, checks: 10, productionWrites: 0, networkAttempts: 0, databaseAttempts: 0 }));

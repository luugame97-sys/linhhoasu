'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert/strict');

const root = path.resolve(__dirname, '..', '..');
process.env.CONFIG_BIN_PATH = path.join(root, '_ai_workbench/temp/petsoul_release_20261002/baseline/config.bin');
const Config = require(path.join(root, 'linhhoasu/lhs/newServer/src/services/ConfigService'));
const tables = Config.loadAllTables();
require(path.join(root, '_ai_workbench/temp/gem10_candidate_20261002/server/config/gemLevel10Choice')).apply(tables);

let saves = 0;
let failSave = false;
const sandbox = {
  module: { exports: {} },
  require(name) {
    if (name === '../services/ConfigService') return Config;
    if (name === '../services/PlayerService') return {
      savePlayer: async () => { saves += 1; return !failSave; },
      drainPendingSaves: async () => {},
    };
    if (name === '../services/MainTaskProgressService') return {
      addGemComposeCount: () => false,
      addGemObtainCount: () => false,
    };
    if (name === '../services/PlayerMutationService') return { run: (_u, work) => work() };
    throw new Error(`unexpected require: ${name}`);
  },
};
vm.runInNewContext(
  fs.readFileSync(path.join(root, '_ai_workbench/temp/gem10_candidate_20261002/server/handlers/gem.js'), 'utf8'),
  sandbox,
);
const handler = sandbox.module.exports;

function session(ids, placedUids = []) {
  const player = {
    userId: 'GEM_SPECIAL_BATCH_FIXTURE', items: {},
    currencies: { diamond: 0, gold: 0, silver: 0 }, other_attr_info: {},
    roleInfo: { stage: 1 }, level: 200, exp: 0,
  };
  handler.ensureGemInfo(player);
  player.other_attr_info.gemInfo.gems = ids.map((id, i) => ({ id, uid: i + 1, shapeId: 1 }));
  player.other_attr_info.gemInfo.nextUid = ids.length + 1;
  player.other_attr_info.gemInfo.plan.positions = placedUids.map(uid => ({ uid, pos: 1 }));
  return { userId: player.userId, player };
}

function dataOf(reply) {
  return (Array.isArray(reply) ? reply : [reply]).find(p => p.tag === 3906 && p.msgUid !== 0).data;
}
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

(async () => {
  let cases = 0;

  // Recipe 25061 consumes 2x25051 + 2x25052. 10/12 inputs and count=5
  // must produce five exact 25061 gems and leave two 25052 inputs.
  const s = session([
    ...Array(10).fill(25051), ...Array(12).fill(25052),
  ]);
  const before = s.player.other_attr_info.gemInfo.gems.length;
  const out = dataOf(await handler.handleGemSpecialCompose(
    { id: 25061, count: 5, compose: true }, s, 1,
  ));
  assert.equal(out.result, 0);
  assert.equal(out.gems.length, 5);
  assert.equal(JSON.stringify(out.gems.map(g => g.id)), JSON.stringify([25061, 25061, 25061, 25061, 25061]));
  assert.equal(out.uids.length, 20);
  assert.equal(s.player.other_attr_info.gemInfo.gems.filter(g => g.id === 25052).length, 2);
  assert.equal(s.player.other_attr_info.gemInfo.gems.length, before - 20 + 5);
  cases += 1;

  // Placed gems are unavailable inputs; the operation must be rejected atomically.
  const placed = session([...Array(10).fill(25051), ...Array(10).fill(25052)], [1]);
  handler.ensureGemInfo(placed.player);
  const placedBefore = stable(placed.player);
  const placedReply = dataOf(await handler.handleGemSpecialCompose(
    { id: 25061, count: 5, compose: true }, placed, 2,
  ));
  assert.equal(placedReply.result, undefined);
  assert.equal(placedReply.gems.length, 0);
  assert.equal(stable(placed.player), placedBefore);
  cases += 1;

  // Invalid count is rejected with no mutation and no save.
  const invalid = session([...Array(10).fill(25051), ...Array(10).fill(25052)]);
  const invalidBefore = stable(invalid.player);
  const savesBeforeInvalid = saves;
  const invalidReply = dataOf(await handler.handleGemSpecialCompose(
    { id: 25061, count: 0, compose: true }, invalid, 3,
  ));
  assert.equal(invalidReply.result, -1);
  assert.equal(saves, savesBeforeInvalid);
  assert.equal(stable(invalid.player), invalidBefore);
  cases += 1;

  // Insufficient materials are rejected with no mutation and no save.
  const short = session([...Array(10).fill(25051), ...Array(9).fill(25052)]);
  const shortBefore = stable(short.player);
  const savesBeforeShort = saves;
  const shortReply = dataOf(await handler.handleGemSpecialCompose(
    { id: 25061, count: 5, compose: true }, short, 4,
  ));
  assert.equal(shortReply.result, undefined);
  assert.equal(shortReply.gems.length, 0);
  assert.equal(saves, savesBeforeShort);
  assert.equal(stable(short.player), shortBefore);
  cases += 1;

  // Save failure must never publish a success response or retain a mutated player.
  failSave = true;
  const failed = session([...Array(2).fill(25051), ...Array(2).fill(25052)]);
  const failedReply = dataOf(await handler.handleGemSpecialCompose(
    { id: 25061, count: 1, compose: true }, failed, 5,
  ));
  assert.equal(failedReply.result, -1);
  assert.equal(failedReply.code, 'GEM_SAVE_UNCONFIRMED');
  assert.equal(failed.player, null);
  cases += 1;

  console.log(JSON.stringify({ pass: true, cases, saves, network: 'blocked', playerWrites: 0 }));
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });

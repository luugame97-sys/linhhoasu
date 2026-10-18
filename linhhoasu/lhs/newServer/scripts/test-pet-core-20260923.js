'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(app, 'src/handlers/pet.js'), 'utf8');
const tables = {
  PetBaseConfig: { initialField: 8, fieldMax: 8, fieldConsume: [100], levelMax: 2 },
  PetEggConfig: { 24: { id: 24 }, 25: { id: 25 }, 26: { id: 26 } },
  PetConfig: {
    82001: { id: 82001, quality: 2, type: 0, tag: 2 },
    82101: { id: 82101, quality: 2, type: 1, tag: 1 },
    83101: { id: 83101, quality: 3, type: 1, tag: 1 },
  },
  PetQualityConfig: { 2: { consumes: [{ id: 36, count: 5 }], composeSuccessRate: 10000 }, 3: { consumes: [], composeSuccessRate: 0 } },
  PetPassiveSkillConfig: {}, PetPassiveSkillWashConfig: {},
};
function load() {
  const deps = {
    '../services/ConfigService': { get: name => tables[name] || {} },
    '../services/PlayerService': { savePlayer: async () => {}, savePlayerDeferred: async () => {} },
    '../logger': { warn() {} },
    '../services/MainTaskProgressService': { addPetComposeCount() { return false; }, addPetWashCount() { return false; }, refreshMainTaskProgress() { return false; } },
    './raid': { addRewardToPlayer(player, id, n) { player.items ||= {}; player.items[id] = (player.items[id] || 0) + n; } },
    './task': { buildActiveTaskUpdatePackets() { return []; } },
  };
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require: r => deps[r], process: { env: { PET_COMPOSE_FAIL_OPEN: 'true' } }, console, Date, Math }, { filename: 'pet.js' });
  return module.exports;
}
const pet = load();
const session = player => ({ userId: 'ram', player });
const player = (items, pets, field = 8) => ({ items: { ...items }, currencies: { diamond: 0 }, petInfo: { field, nextUid: 100010, pets, unlockAtlas: [], rewardedAtlas: [], wishMap: {}, timeRecords: {} } });
async function main() {
  let p = player({ 36: 0 }, [{ uid: 1, id: 82101, slot: 0 }, { uid: 2, id: 82101, slot: 1 }]);
  let r = await pet.handlePetCompose({ uid: 1, targetUid: 2 }, session(p), 1);
  assert.equal(r.data.result, -1); assert.equal(r.data.code, 'PET_COMPOSE_INSUFFICIENT_COST'); assert.match(r.data.msg, /Quả Linh/); assert.equal(r.data.missingItems[0].missing, 5); assert.equal(p.petInfo.pets.length, 2); assert.equal(p.items[36], 0);
  p = player({ 24: 1 }, []); r = await pet.handlePetUseEgg({ eggId: 0 }, session(p), 2); assert.equal(r.data.result, -1); assert.equal(p.petInfo.pets.length, 0); assert.equal(p.items[24], 1);
  p = player({}, [], 8); r = await pet.handlePetBuyField({}, session(p), 3); assert.equal(r.data.result, -1); assert.equal(p.petInfo.field, 8);
  p = player({}, [{ uid: 1, id: 82101, slot: 0 }, { uid: 2, id: 82001, slot: 1 }]); r = await pet.handlePetEat({ matUid: 1, targetUid: 2 }, session(p), 4); assert.equal(r.data.result, 0); assert.deepEqual(p.petInfo.pets.map(x => x.uid), [1]);
  p = player({}, [{ uid: 1, id: 82001, level: 1, slot: 0 }, { uid: 2, id: 82101, level: 2, slot: 1 }]); r = await pet.handlePetEat({ matUid: 1, targetUid: 2 }, session(p), 5); assert.equal(r.data.result, -1); assert.deepEqual(p.petInfo.pets.map(x => x.uid), [1, 2]);
  console.log(JSON.stringify({ result: 'PASS', productionWrites: 0, cases: 5 }));
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });

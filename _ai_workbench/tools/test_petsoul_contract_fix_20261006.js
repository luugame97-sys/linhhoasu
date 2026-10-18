'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const root = path.resolve(__dirname, '../..');
const app = process.env.FEATURE_APP || path.join(root, 'linhhoasu/lhs/newServer');
const config = require(path.join(app, 'src/services/ConfigService'));
const tables = config.loadAllTables();
tables.ShopConfig[11000021] = { id: 11000021, payId: 11000021, type: 9, limit: 1, limitType: 4, rewards: [{ id: 288, count: 1 }, { id: 287, count: 1 }, { id: 1, count: 1280 }, { id: 261, count: 50 }] };
let saves = 0;
function compile(file, deps) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module, exports: module.exports, Date, Number, Math, Set, Map, JSON, console,
    require(name) { if (deps[name]) return deps[name]; throw Error('UNEXPECTED_DEP:' + name); },
  }, { filename: file });
  return module.exports;
}
const playerService = { savePlayer: async () => { saves++; return true; } };
const runtimeBus = { getWsServer: () => ({ invalidatePlayerForMutation: () => {} }) };
const rechargeBenefit = compile(process.env.PET_BENEFIT || path.join(root, 'linhhoasu/lhs/newServer/src/services/RechargeBenefitService.js'), {
  './ConfigService': { get: key => tables[key] }, './Activity9Service': { activateActivity9ForPayId: () => null },
  './ActivationPassService': { activateActivationPassForPayId: () => null },
  './OldTrekPassService': { apply: () => null }, './TopArenaPassService': { apply: () => null },
});
const soul = compile(process.env.PET_SOUL_HANDLER || path.join(root, 'linhhoasu/lhs/newServer/src/handlers/pet-soul.js'), {
  '../services/ConfigService': { get: key => tables[key] }, '../services/PlayerService': playerService,
  '../services/RuntimeBus': runtimeBus,
  './raid': { addRewardToPlayer: (p, id, count) => { p.items[id] = (p.items[id] || 0) + count; } },
  '../config/petSoulRewards': require(path.join(app, 'src/config/petSoulRewards')),
});
const clone = x => JSON.parse(JSON.stringify(x));
const q6 = Object.values(tables.PetSoulConfig).find(r => r.quality === 6);
const q7 = Object.values(tables.PetSoulConfig).find(r => r.quality === 7);
assert(q6 && q7);
function player(active = true) {
  const p = { level: 300, items: { 260: 10 }, currencies: {}, petInfo: { pets: [] }, rechargeInfo: { privilegeItem: active ? { 44: -1 } : {} }, other_attr_info: {} };
  soul.ensurePetSoulInfo(p); soul.grantPetSoulToPlayer(p, q6.id); soul.grantPetSoulToPlayer(p, q7.id); return p;
}
(async () => {
  const p = player(false), benefit = rechargeBenefit.applyRechargeBenefits(p, { productId: 11000021, payId: 11000021, now: 1770000000000 });
  assert.equal(p.rechargeInfo.privilegeItem['44'], -1); assert.equal(benefit.petSoulWishUpdate.endTime, -1);
  const s = { userId: 'RAM', player: player(true) };
  const set = await soul.handlePetSoulSetWish({ ids: [q7.id, q6.id] }, s, 1);
  assert.equal(set.data.result, 0); assert.equal(set.data.wishId['7'], q7.id); assert.equal(set.data.wishId['6'], q6.id);
  const oldRandom = Math.random; Math.random = () => 0.999999;
  const summon = await soul.handlePetSoulSummon({ id: 260, trans: 0 }, s, 2); Math.random = oldRandom;
  const ack = (Array.isArray(summon) ? summon : [summon]).find(x => x.tag === 6920).data;
  assert.equal(ack.result, 0); assert(ack.summon.some(x => x.id === q7.id)); assert.equal(s.player.other_attr_info.petSoulInfo.wishCount['7'], 1);
  const inactive = { userId: 'RAM2', player: player(false) };
  const rejected = await soul.handlePetSoulSetWish({ ids: [q7.id, q6.id] }, inactive, 3);
  assert.equal(rejected.data.code, 'PET_SOUL_WISH_PRIVILEGE_REQUIRED');
  const partial = { userId: 'RAM3', player: player(true) };
  const partialReply = await soul.handlePetSoulSetWish({ ids: [q7.id] }, partial, 5);
  assert.equal(partialReply.data.result, 0); assert.equal(partialReply.data.wishId['7'], q7.id);
  const unowned = { userId: 'RAM4', player: player(true) };
  const unownedId = Object.values(tables.PetSoulConfig).find(r => r.quality === 7 && r.id !== q7.id).id;
  const unownedReply = await soul.handlePetSoulSetWish({ ids: [unownedId] }, unowned, 6);
  assert.equal(unownedReply.data.result, 0); assert.equal(unownedReply.data.wishId['7'], unownedId);
  console.log(JSON.stringify({ checks: 6, entitlement44: -1, qualityKeys: [6, 7], summonUsesWish: true, productionWrites: 0, networkAttempts: 0 }));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });

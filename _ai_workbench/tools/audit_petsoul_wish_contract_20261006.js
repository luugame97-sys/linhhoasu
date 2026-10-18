'use strict';
// Exact-live handler/config in isolated RAM. No sockets, DB, or real purchases.
const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
const app = '/linhhoasu/lhs/newServer';
const cp = require('child_process');
const proc = JSON.parse(cp.execFileSync('pm2', ['jlist'], { encoding: 'utf8' })).find(p => p.name === 'lhs-s1001');
const env = { ...require(app + '/node_modules/dotenv').parse(fs.readFileSync(app + '/.env')), ...proc.pm2_env.env, ...proc.pm2_env };
for (const key of ['CONFIG_BIN_PATH', 'ROLE_LEVEL_2000_ENABLED', 'DROP_LEVEL_46_ENABLED', 'DROP_LEVEL_100_ENABLED', 'FASHION_CONTENT_OVERLAY_PATH', 'FASHION_CHOICE_OVERLAY_PATH', 'FASHION_CHOICE_STARS_OVERLAY_PATH']) if (env[key] != null) process.env[key] = String(env[key]);
require.cache[require.resolve(app + '/src/logger')] = { exports: { info() {}, warn() {}, error() {}, debug() {} } };
const config = require(app + '/src/services/ConfigService'), tables = config.loadAllTables();
let mockSaves = 0, networkAttempts = 0;
const deny = () => { networkAttempts++; throw Error('QA_NETWORK_DENIED'); };
require('net').Socket.prototype.connect = require('tls').connect = deny;
const math = Object.create(Math); math.random = () => 0.999999;
const mod = { exports: {} };
vm.runInNewContext(fs.readFileSync(app + '/src/handlers/pet-soul.js', 'utf8'), {
  module: mod, exports: mod.exports, Date, Math: math, Number, console,
  require(name) {
    if (name === '../services/ConfigService') return { get: key => tables[key] };
    if (name === '../services/PlayerService') return { savePlayer: async () => { mockSaves++; return true; } };
    if (name === './raid') return { addRewardToPlayer: (player, id, count) => { player.items[id] = (player.items[id] || 0) + count; } };
    if (name === '../config/petSoulRewards') return require(app + '/src/config/petSoulRewards');
    throw Error('UNEXPECTED_DEPENDENCY:' + name);
  }
});
const handler = mod.exports, clone = x => JSON.parse(JSON.stringify(x));
const q6 = Object.values(tables.PetSoulConfig).filter(r => r.quality === 6);
const q7 = Object.values(tables.PetSoulConfig).filter(r => r.quality === 7);
function session(active = true) {
  const player = { userId: 'RAM_PETSOUL_WISH', level: 300, items: { 260: 10 }, currencies: {},
    petInfo: { pets: [] }, other_attr_info: {}, rechargeInfo: { privilegeItem: active ? { 44: -1 } : {} } };
  handler.ensurePetSoulInfo(player);
  handler.grantPetSoulToPlayer(player, q6[0].id); handler.grantPetSoulToPlayer(player, q7[0].id);
  return { userId: player.userId, player };
}
const ack = (result, tag) => (Array.isArray(result) ? result : [result]).find(r => r.tag === tag).data;
(async () => {
  const findings = {};
  const active = session();
  const selected = ack(await handler.handlePetSoulSetWish({ ids: [q7[0].id, q6[0].id] }, active, 1), 6922);
  const info = active.player.other_attr_info.petSoulInfo;
  assert.equal(selected.result, 0);
  findings.selectedOwned = { returned: clone(selected.wishId), expectedNative: { 7: q7[0].id, 6: q6[0].id },
    nativeVisibleQ7: selected.wishId[7] || 0, nativeVisibleQ6: selected.wishId[6] || 0 };
  const unowned = session();
  const unownedResponse = ack(await handler.handlePetSoulSetWish({ ids: [q7[1].id, q6[1].id] }, unowned, 2), 6922);
  findings.selectedUnowned = { result: unownedResponse.result, wishId: clone(unownedResponse.wishId) };
  const inactive = session(false);
  const inactiveResponse = ack(await handler.handlePetSoulSetWish({ ids: [q7[0].id, q6[0].id] }, inactive, 3), 6922);
  findings.noPrivilege = { result: inactiveResponse.result, wishId: clone(inactiveResponse.wishId) };
  // Give the handler the native shape directly in RAM, then force quality 7.
  info.wishId = { 7: q7[0].id, 6: q6[0].id }; info.wishCount = { 7: 0, 6: 0 };
  const summoned = ack(await handler.handlePetSoulSummon({ id: 260, trans: 0 }, active, 4), 6920);
  findings.summonWithValidWish = { result: summoned.result, selectedId: q7[0].id,
    summoned: summoned.summon.map(r => ({ id: r.id, quality: tables.PetSoulConfig[r.id].quality })), wishCountAfter: clone(info.wishCount) };
  assert(summoned.summon.every(r => tables.PetSoulConfig[r.id].quality === 7));
  assert(summoned.summon.every(r => r.id !== q7[0].id));
  assert.deepEqual(clone(info.wishCount), { 7: 0, 6: 0 });
  console.log(JSON.stringify({ mode: 'EXACT_LIVE_HANDLER_RAM_AUDIT', findings, mockSaves, productionWrites: 0, networkAttempts }));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });

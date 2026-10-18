'use strict';
// Isolated live-source audit. Config reads only; all saves and players are RAM.
const app = '/linhhoasu/lhs/newServer', fs = require('fs'), vm = require('vm'), cp = require('child_process');
const proc = JSON.parse(cp.execFileSync('pm2', ['jlist'], { encoding: 'utf8' })).find(p => p.name === 'lhs-s1001');
const env = { ...require(app + '/node_modules/dotenv').parse(fs.readFileSync(app + '/.env')), ...proc.pm2_env.env, ...proc.pm2_env };
for (const key of ['CONFIG_BIN_PATH', 'ROLE_LEVEL_2000_ENABLED', 'DROP_LEVEL_46_ENABLED', 'DROP_LEVEL_100_ENABLED', 'FASHION_CONTENT_OVERLAY_PATH', 'FASHION_CHOICE_OVERLAY_PATH', 'FASHION_CHOICE_STARS_OVERLAY_PATH']) if (env[key] != null) process.env[key] = String(env[key]);
require.cache[require.resolve(app + '/src/logger')] = { exports: { info() {}, warn() {}, error() {}, debug() {} } };
const tables = require(app + '/src/services/ConfigService').loadAllTables();
require('net').Socket.prototype.connect = require('tls').connect = () => { throw Error('QA_NETWORK_DENIED'); };
let saves = 0;
const moduleCopy = { exports: {} };
vm.runInNewContext(fs.readFileSync(app + '/src/handlers/gem.js', 'utf8'), {
  module: moduleCopy, exports: moduleCopy.exports, Date, Math, process: { env: {} }, require(name) {
    if (name === '../services/ConfigService') return { get: key => tables[key] };
    if (name === '../services/PlayerService') return { savePlayer: async () => { saves++; return true; }, drainPendingSaves: async () => {} };
    if (name === '../services/PlayerMutationService') return require(app + '/src/services/PlayerMutationService');
    if (name === '../services/MainTaskProgressService') return { addGemComposeCount: () => false, addGemObtainCount: () => false, refreshMainTaskProgress: () => false };
    if (name === './task') return { buildActiveTaskUpdatePackets: () => [] };
    throw Error('UNEXPECTED_DEPENDENCY:' + name);
  }
});
function session(ids, suffix) {
  return { userId: 'RAM_PRICING_' + suffix, player: { level: 100, items: {}, currencies: { diamond: 1000 },
    other_attr_info: { gemInfo: { nextUid: ids.length + 1, gems: ids.map((id, i) => ({ uid: i + 1, id, shapeId: 1 })), plan: { id: 0, positions: [] } } } } };
}
(async () => {
  const exchanges = [];
  for (const [input, type] of [[25031, 1], [25001, 23]]) {
    const state = session([input], input + '_' + type);
    const result = await moduleCopy.exports.handleGemExchange({ type, uids: [1] }, state, 1);
    exchanges.push({ inputLevel: tables.GemLevelConfig[input].level, requestedType: type,
      outputLevels: result.data.gems.map(g => tables.GemLevelConfig[g.id].level) });
  }
  const state = session([25051, 25051, 25052, 25052], 'legal6to7');
  const result = await moduleCopy.exports.handleGemSpecialCompose({ id: 25061, count: 1, compose: true }, state, 2);
  if (result.data.result !== 0 || state.player.currencies.diamond !== 1000 || result.data.uids.length !== 4) throw Error('LEGAL_RECIPE_MISMATCH');
  console.log(JSON.stringify({ exchanges, legalRecipe: { consumedLevel6: 4, outputLevel: 7, feeNguyenBao: 0 },
    scope: 'actual live handlers in VM; no game RPC', mockSaves: saves, productionWrites: 0 }));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });

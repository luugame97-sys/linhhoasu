'use strict';
// Investigation only. Load calculators in isolated contexts and use raw Mongo
// reads if --mongo is explicit. Never load a game handler or a Mongoose model.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const root = process.env.POWER_AUDIT_ROOT || path.resolve(__dirname, '../../linhhoasu');
const app = path.join(root, 'lhs/newServer');
const services = path.join(app, 'src/services');
const loggerPath = path.join(app, 'src/logger.js');
require.cache[loggerPath] = { id: loggerPath, filename: loggerPath, loaded: true,
  exports: { info() {}, warn() {}, error() {}, debug() {} } };
const config = require(path.join(services, 'ConfigService'));
const cache = new Map([['crypto', crypto], ['ConfigService', config], ['PlayerService', new Proxy({}, {
  get() { throw new Error('AUDIT_PLAYER_SERVICE_DENIED'); },
})]]);
const allowed = new Set(['PowerDisplayService', 'NativeBonusService', 'BattleService', 'FishingIntegrityService', 'HomelandSkinUnlockService', 'RoleAppearanceService']);
function load(name) {
  if (cache.has(name)) return cache.get(name);
  if (!allowed.has(name)) throw new Error(`AUDIT_DEPENDENCY_DENIED:${name}`);
  const filename = path.join(services, name + '.js');
  const module = { exports: {} };
  cache.set(name, module.exports);
  const context = vm.createContext({ module, exports: module.exports, Buffer,
    require: rel => load(rel.replace(/^\.\//, '')), console: { log() {}, warn() {} } });
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  cache.set(name, module.exports);
  return module.exports;
}
const battle = load('BattleService');
const appearance = load('RoleAppearanceService');
const clone = value => JSON.parse(JSON.stringify(value));
function attributes(player) {
  const copy = clone(player);
  appearance.ensureRoleAppearance(copy);
  return battle.calcPlayerPower(copy);
}
function score(player) { return battle.calcPowerScore(attributes(player)); }
const arena = fs.readFileSync(path.join(app, 'src/handlers/arena.js'), 'utf8');
const start = arena.indexOf('const playerRows = await Player.find({ userId: { $in: userIds } })');
const projectionText = arena.slice(start).match(/\.select\((\{[\s\S]*?\})\)/);
if (!projectionText) throw new Error('AUDIT_ARENA_PROJECTION_NOT_FOUND');
const projection = vm.runInNewContext('(' + projectionText[1] + ')');
function projected(p) { return Object.fromEntries(Object.keys(projection).filter(k => p[k] !== undefined).map(k => [k, p[k]])); }
const tables = config.loadAllTables();
const mainSource = fs.readFileSync(path.join(root, 'webgame/game/js/main.min_a6195824.js'), 'utf8');
const clientCalcText = mainSource.match(/calPowerByAttr=(function\(t\)\{[^}]+\}return Math\.ceil\(i\)\})/);
if (!clientCalcText) throw new Error('AUDIT_CLIENT_CALC_ANCHOR_NOT_FOUND');
const clientCalc = vm.runInNewContext('(' + clientCalcText[1] + ')', { Y: { Config: tables } });
const activeConfigCandidates = ['lhs/LHS-re/update/resource/assets/excel/config_e5ac72c2.bin',
  'lhs/update/resource/assets/excel/config_e5ac72c2.bin', 'lhs/LHS-re/update/resource/assets/excel/config_d315747e.bin',
  'lhs/update/resource/assets/excel/config_d315747e.bin'];
const activeConfig = process.env.CONFIG_BIN_PATH || activeConfigCandidates.map(p => path.join(root, p)).find(p => fs.existsSync(p));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const clientConfigPath = path.join(root, 'webgame/game/update/resource/assets/excel/config_e5ac72c2.bin');
const clientTables = config.decodeTables(fs.readFileSync(clientConfigPath));
const { BinJsonUtil, ByteArray } = require(path.join(app, 'src/protocol/BinJsonUtil'));
function codecRoundtrip(power) {
  const buf = new ByteArray();
  BinJsonUtil.json2bin({ power, powerScore: power }, buf);
  const out = BinJsonUtil.readFullJson(new ByteArray(buf.buffer));
  return { power, readPower: out.power, equal: out.power === power && out.powerScore === power };
}
const skin = Object.values(tables.HomelandSkinConfig || {}).find(r => Number(r.attrs?.[703]) > 0);
const building = Object.values(tables.HomelandBuildingConfig || {}).find(r => r.attrs && Object.keys(r.attrs).length);
const fixture = { level: 100, roleInfo: { kungfuId: 4, stage: 5 },
  homelandInfo: { lv: 1, buildingLv: building ? { [building.id]: 10 } : {} }, items: skin ? { [skin.id]: 1 } : {} };
const result = { readOnly: true, productionWrites: 0,
  battleSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(services, 'BattleService.js'))).digest('hex'),
  arenaProjectionKeys: Object.keys(projection),
  projectionFixture: { skinId: skin?.id, buildingId: building?.id, full: score(fixture), challenger: score(projected(fixture)) },
  config: { activePath: activeConfig, activeSha256: hash(fs.readFileSync(activeConfig)),
    serverAttrWeightsHash: hash(JSON.stringify(tables.AttrConfig)),
    clientAttrWeightsHash: hash(JSON.stringify(clientTables.AttrConfig)),
    clientConfigPath, clientConfigSha256: hash(fs.readFileSync(clientConfigPath)) },
  sameAttrsFormula: [{ 1: 1000 }, { 1: 1000, 2: 100, 3: 10, 4: 10 }, { 1: 1, 2: 1, 3: 1, 4: 1 }]
    .map(attrs => ({ attrs, serverScore: battle.calcPowerScore(attrs), nativeClientScore: clientCalc(attrs) })),
  codecRoundtrips: [1, 46, 621107, 2147483647, 4294967296, 1000000000000, Number.MAX_SAFE_INTEGER].map(codecRoundtrip),
  samples: [] };
// Construct one virtual bot only inside an isolated VM. Do not start its
// scheduler or emit map/chat packets to the running game.
const botModule = { exports: {} };
const botDependencies = {
  crypto, './ConfigService': config, './BattleService': battle, './RoleAppearanceService': appearance,
  './PowerDisplayService': load('PowerDisplayService'),
  './PreparedNameService': { getNameByIndex: () => 'Audit virtual bot' },
  './PreparedChatService': {}, '../logger': require.cache[loggerPath].exports,
};
vm.runInNewContext(fs.readFileSync(path.join(services, 'BotPopulationService.js'), 'utf8'), {
  module: botModule, exports: botModule.exports, process: { env: { SERVER_ID: '1001' } },
  require: rel => { if (!(rel in botDependencies)) throw new Error('AUDIT_BOT_DEPENDENCY_DENIED'); return botDependencies[rel]; },
});
const botService = new botModule.exports.BotPopulationService({ enabled: false, chatEnabled: false });
const virtual = botService._makeBot(10001, 0, 0, { x: 0, y: 0 },
  Object.values(tables.RobotAppearanceConfig || {}), Object.values(tables.RobotAttrsConfig || {}), [{ x: 0, y: 0 }]);
const botDisplay = load('PowerDisplayService').fromPlayer(virtual.player, { serverId: virtual.player.serverId });
result.virtualBotFixture = { level: virtual.player.level,
  mapPower: virtual.mapPlayer.showInfo.combatPowerValue, legacyMapPower: virtual.mapPlayer.showInfo.power,
  profileRecalculated: botDisplay.combatPowerValue,
  hasRobotAttrsInSnapshot: !!virtual.player.powerDisplayRobotAttrs,
  note: 'Pure fixture from production config/source; not a live bot-session read.' };
async function main() {
  if (process.argv.includes('--mongo')) {
    const { MongoClient } = require(path.join(app, 'node_modules/mongodb'));
    const client = new MongoClient('mongodb://127.0.0.1:27017', { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    try {
      for (const serverId of [1001, 1002]) {
        const players = client.db('lhs_s' + serverId).collection('players');
        const queries = [
          ['known-player', { name: 'nicky' }],
          ['top-arena-sample', { arenaScore: { $gt: 1000 }, isBot: { $ne: true } }],
          ['managed-bot-sample', { $or: [{ isBot: true }, { managedBot: true }, { userId: /lhs_real_bot_/ }] }],
        ];
        for (const [label, query] of queries) {
          const doc = await players.findOne(query, { sort: { arenaScore: -1 }, maxTimeMS: 5000 });
          if (!doc) { result.samples.push({ serverId, label, missing: true }); continue; }
          const fullPower = score(doc);
          const nativeScoreSameServerAttrs = clientCalc(attributes(doc));
          result.samples.push({ serverId, label, name: label === 'known-player' ? doc.name : undefined,
            level: doc.level, calculatedPower: fullPower, challengerProjectionPower: score(projected(doc)),
            nativeFormulaOnServerAttrs: nativeScoreSameServerAttrs,
            stored: { power: doc.power ?? null, powerScore: doc.powerScore ?? null },
            updatedAt: doc.updatedAt, safeInteger: Number.isSafeInteger(fullPower) });
        }
      }
    } finally { await client.close(); }
  }
  console.log(JSON.stringify(result));
}
main().catch(error => { console.error(JSON.stringify({ readOnly: true, error: error.message })); process.exitCode = 1; });

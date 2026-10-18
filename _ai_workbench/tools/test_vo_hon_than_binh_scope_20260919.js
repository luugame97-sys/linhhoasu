'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const installedApp = process.env.FEATURES_APP || path.resolve(__dirname, '../../linhhoasu/lhs/newServer');
const candidateRoot = process.env.FEATURE_CANDIDATE_ROOT || path.resolve(__dirname, '../temp/feature_unlock_release_20260917/candidate');
const app = fs.existsSync(path.join(candidateRoot, 'server/src')) ? path.join(candidateRoot, 'server') : candidateRoot;
const sourceFile = relative => fs.existsSync(path.resolve(app, relative)) ? path.resolve(app, relative) : path.resolve(installedApp, relative);
const copy = value => JSON.parse(JSON.stringify(value));
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
let persisted;
const cfg = {
  MineBlockConfig: { 1: { picTimeRes: [1] } },
  MineBaseConfig: { triggerNum: 20, boxRewards: [{ id: 71, count: 10 }] },
  MineEventConfig: { 100: { type: 1, challengeTimes: 1, energyUse: [{ id: 55, count: 1 }], rewards: [[{ id: 71, count: 10 }]] } },
  MineLevelConfig: { 1: { 0: { rewards: [{ id: 71, count: 20 }] } } },
  ValhallaConfig: { 701: { type: 1, quality: 1 } },
  ValhallaBaseConfig: { fightLimit: 4 },
};
const cache = new Map();
const mocks = {
  ConfigService: { get: key => cfg[key] || {} },
  RuntimeBus: { getWsServer: () => ({ getPlayerForMutation: id => null, invalidatePlayerForMutation() {} }) },
  PlayerService: { drainPendingSaves: async () => {}, savePlayer: async (_id, player) => { persisted = copy(player); return player; } },
  BattleService: { calcPlayerPower: () => ({}), generateOpponentAttrs: () => ({}), simulateBattle: () => ({ win: true }) },
  CurrencySync: { buildClientItemList: () => [] },
  SideTaskProgressService: { recordProgress: (player, activeId, delta, options = {}) => {
    player._testProgress ||= {};
    const key = `${activeId}:${options.itemId || 0}`;
    player._testProgress[key] = (player._testProgress[key] || 0) + delta;
    return true;
  } },
  FeatureMutationService: { wrap: handler => handler, save: async (session, player) => { persisted = copy(player); session.player = player; return player; } },
  raid: { addRewardToPlayer: (player, id, count) => { player.items ||= {}; player.items[id] = (player.items[id] || 0) + count; } },
};
function load(relative) {
  const filename = sourceFile(relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const localRequire = request => {
    const key = path.basename(request);
    if (mocks[key]) return mocks[key];
    if (request.startsWith('node:')) return require(request);
    if (key === 'logger') return { info() {}, warn() {}, error() {}, debug() {} };
    const root = filename.startsWith(path.resolve(app) + path.sep) ? app : installedApp;
    return load(path.relative(root, path.resolve(path.dirname(filename), request + '.js')));
  };
  vm.runInThisContext(`(function(require,module,exports){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(localRequire, module, module.exports);
  return module.exports;
}
function session() {
  return { userId: 'scope-qa', player: { userId: 'scope-qa', level: 100, items: { 55: 3 },
    mineInfo: { cycle: 1, levelId: 0, boxCounter: 0, boxRewardCount: 0,
      currentLevel: { levelId: 0, finish: false, blocks: [{ uid: 1, id: 1, status: 0 }], events: [{ uid: 1, id: 100, useTime: 0 }] } } } };
}

(async () => {
  const mine = load('src/handlers/mine.js');
  const valhalla = load('src/handlers/valhalla.js');
  let s = session();
  const duplicate = await mine.handleMineDealEvent({ uids: [1, 1] }, s, 1);
  check(duplicate.data.result === 1, 'Mine duplicate UID rejected');
  const responses = await Promise.all([mine.handleMineDealEvent({ uids: [1] }, s, 2), mine.handleMineDealEvent({ uids: [1] }, s, 3)]);
  check(s.player.items[55] === 2 && s.player._testProgress['13:55'] === 1, 'item55 progress committed once');
  check(responses.every(Array.isArray), 'Mine native packet shape preserved');
  s = session();
  s.player.other_attr_info = { valhallaInfo: { valhalla: [{ uid: 1, id: 701, level: 1, star: 0 }], plan: 0, planInfo: [{ id: 0, equippedMap: {}, skillHeroIds: [] }] } };
  await valhalla.handleValhallaEquip({ uid: 1, index: 0, set: true }, s, 20);
  check(s.player._testProgress['55:0'] === 1, 'valid Valhalla equip advances active55');
  await valhalla.handleValhallaEquip({ uid: 1, index: 0, set: true }, s, 21);
  await valhalla.handleValhallaEquip({ uid: 999, index: 1, set: true }, s, 22);
  check(s.player._testProgress['55:0'] === 1, 'Valhalla replay/invalid UID does not duplicate');
  check(persisted && persisted.other_attr_info, 'mutation save confirmed');
  console.log(JSON.stringify({ result: 'PASS', checks, productionWrites: 0 }));
})().catch(error => { console.error(error.stack || String(error)); process.exitCode = 1; });

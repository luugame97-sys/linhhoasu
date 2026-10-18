'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const installedApp = process.env.FEATURES_APP || path.resolve(__dirname, '../../linhhoasu/lhs/newServer');
const candidateRoot = process.env.FEATURE_CANDIDATE_ROOT || path.resolve(__dirname, '../temp/feature_unlock_release_20260917/candidate');
const app = fs.existsSync(path.join(candidateRoot, 'server/src')) ? path.join(candidateRoot, 'server') : candidateRoot;
const sourceFile = relative => fs.existsSync(path.resolve(app, relative)) ? path.resolve(app, relative) : path.resolve(installedApp, relative);
const copy = x => JSON.parse(JSON.stringify(x));
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
let saveMode = 'ok', persisted, saves = 0, invalidated = 0;
const cfg = {
  MineBlockConfig: { 1: { picTimeRes: [1] } },
  MineBaseConfig: { triggerNum: 20, boxRewards: [{ id: 71, count: 10 }] },
  MineEventConfig: { 100: { type: 1, challengeTimes: 1, energyUse: [{ id: 55, count: 1 }], rewards: [[{ id: 71, count: 10 }]] } },
  MineLevelConfig: { 1: { 0: { rewards: [{ id: 71, count: 20 }] } } },
  BloodlineConfig: { 101: { quality: 3 }, 102: { quality: 3 } },
  BloodlineComposeConfig: {},
  CuriosConfig: { 501: { quality: 1, pieceID: 502 } },
  CuriosBaseConfig: { composeNum: { 1: 10 } },
  ValhallaConfig: { 701: { type: 1, quality: 1 } },
  ValhallaBaseConfig: { fightLimit: 4 },
};
const cache = new Map();
const mocks = {
  ConfigService: { get: key => cfg[key] || {} },
  RuntimeBus: { getWsServer: () => ({ invalidatePlayerForMutation: () => { invalidated++; } }) },
  PlayerService: {
    drainPendingSaves: async () => {},
    savePlayer: async (_id, draft) => {
      saves++;
      await Promise.resolve();
      if (saveMode === 'throw') throw new Error('mock uncertain write');
      if (saveMode === 'null') return null;
      persisted = copy(draft);
      return draft;
    },
  },
  BattleService: { calcPlayerPower: () => ({}), generateOpponentAttrs: () => ({}), simulateBattle: () => ({ win: true }) },
  CurrencySync: { buildClientItemList: () => [] },
  SideTaskProgressService: { recordProgress: (player, activeId, delta, options = {}) => {
    player._testProgress ||= {};
    const key = `${activeId}:${options.itemId || 0}`;
    player._testProgress[key] = (player._testProgress[key] || 0) + delta;
  } },
  raid: { addRewardToPlayer: (p, id, count) => { p.items ||= {}; p.items[id] = (p.items[id] || 0) + count; } },
};
function load(relative) {
  const filename = sourceFile(relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const localRequire = request => {
    const key = path.basename(request);
    if (mocks[key]) return mocks[key];
    if (request.startsWith('node:')) return require(request);
    const root = filename.startsWith(path.resolve(app) + path.sep) ? app : installedApp;
    return load(path.relative(root, path.resolve(path.dirname(filename), request + '.js')));
  };
  vm.runInThisContext(`(function(require,module,exports){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(localRequire, module, module.exports);
  return module.exports;
}
const mine = load('src/handlers/mine.js');
const bloodline = load('src/handlers/bloodline.js');
const curios = load('src/handlers/curios.js');
const valhalla = load('src/handlers/valhalla.js');
function session() {
  return { userId: 'isolated-p0', player: { userId: 'isolated-p0', level: 100, items: { 55: 3 }, mineInfo: { cycle: 1, levelId: 0, boxCounter: 0, boxRewardCount: 0, currentLevel: { levelId: 0, finish: false, blocks: [{ uid: 1, id: 1, status: 0 }], events: [{ uid: 1, id: 100, useTime: 0 }] } } } };
}
(async () => {
  // Execute the real WSServer methods, not a similarly named test stub.
  const wsSource = fs.readFileSync(sourceFile('src/net/WSServer.js'), 'utf8');
  const methodStart = wsSource.indexOf('  getPlayerForMutation(userId) {');
  const methodEnd = wsSource.indexOf('\n  /**', methodStart);
  assert.ok(methodStart >= 0 && methodEnd > methodStart, 'actual WSServer mutation methods must exist');
  const WsMethods = vm.runInThisContext(`(class {${wsSource.slice(methodStart, methodEnd)}})`);
  const actualWs = new WsMethods();
  const old = { userId: 'x', wsId: 1, player: { version: 1 }, _responseCache: new Map([[1, true]]) };
  const newer = { userId: 'x', wsId: 2, player: { version: 2 }, _responseCache: new Map([[2, true]]) };
  const closing = { userId: 'x', wsId: 0, player: { version: 0 }, _responseCache: new Map([[3, true]]) };
  actualWs.clients = new Map([[1, { session: old }], [2, { session: newer }]]);
  actualWs._closingPlayers = new Map([[0, { session: closing }]]);
  check(actualWs.getPlayerForMutation('x') === newer.player, 'real runtime canonical lookup selects newest session');
  actualWs.invalidatePlayerForMutation('x');
  check([old, newer, closing].every(row => row.player === null && row._responseCache.size === 0), 'real runtime invalidates live and closing sessions and response caches');
  let s = session(), before = JSON.stringify(s.player);
  const duplicate = await mine.handleMineDealEvent({ uids: [1, 1] }, s, 1);
  check(duplicate.data.result === 1 && JSON.stringify(s.player) === before, 'duplicate UIDs must not consume or reward');
  const responses = await Promise.all([mine.handleMineDealEvent({ uids: [1] }, s, 2), mine.handleMineDealEvent({ uids: [1] }, s, 3)]);
  check(s.player.items[55] === 2 && s.player.items[71] === 10, 'concurrent event settles once');
  check(s.player.mineInfo.currentLevel.events[0].useTime === 1, 'event useTime persisted');
  check(s.player._testProgress['13:55'] === 1, 'actual item55 consumption emits task13 once');
  check(responses.every(r => Array.isArray(r)), 'native event packet shape');
  s = { userId: s.userId, player: copy(persisted) };
  await mine.handleMineDealEvent({ uids: [1] }, s, 4);
  check(s.player.items[71] === 10, 'event replay after relog has no reward');
  check(s.player._testProgress['13:55'] === 1, 'event replay does not progress task13');
  s = session();
  await mine.handleMineLevelFinish({}, s, 5);
  await mine.handleMineLevelFinish({}, s, 6);
  check(s.player.items[71] === 20 && s.player.mineInfo.currentLevel.finishRewardClaimed, 'finish receipt exactly once');
  s = { userId: s.userId, player: copy(persisted) };
  const replay = await mine.handleMineLevelFinish({}, s, 7);
  check(replay.data.result === 1 && s.player.items[71] === 20, 'finish replay after relog');
  for (const mode of ['throw', 'null']) {
    s = session(); const original = s.player; before = JSON.stringify(original); saveMode = mode;
    await assert.rejects(mine.handleMineDealEvent({ uids: [1] }, s, 8)); checks++;
    check(JSON.stringify(original) === before && s.player === null, `${mode} save cannot publish economy draft`);
  }
  saveMode = 'ok';
  s = session(); s.player.other_attr_info = { valhallaInfo: { valhalla: [{ uid: 1, id: 701, level: 1, star: 0 }], plan: 0, planInfo: [{ id: 0, equippedMap: {}, skillHeroIds: [] }] } };
  await valhalla.handleValhallaEquip({ uid: 1, index: 0, set: true }, s, 20);
  check(s.player._testProgress?.['55:0'] === 1, 'valid owned equip emits task55');
  await valhalla.handleValhallaEquip({ uid: 1, index: 0, set: true }, s, 21);
  await valhalla.handleValhallaEquip({ uid: 999, index: 1, set: true }, s, 22);
  check(s.player._testProgress?.['55:0'] === 1, 'equip replay and invalid UID do not advance task55');
  await valhalla.handleValhallaEquip({ uid: 1, index: 0, set: false }, s, 23);
  check(s.player._testProgress?.['55:0'] === 1, 'unequip does not advance task55');
  saveMode = 'null'; const valhallaOriginal = s.player; const valhallaBefore = JSON.stringify(valhallaOriginal);
  await assert.rejects(valhalla.handleValhallaEquip({ uid: 1, index: 0, set: true }, s, 24)); checks++;
  check(JSON.stringify(valhallaOriginal) === valhallaBefore && s.player === null, 'equip savefailure preserves canonical hero and task');
  saveMode = 'ok';
  s = session(); s.player.other_attr_info = { bloodlineInfo: { dataList: [{ uid: 1, id: 101, lock: 0 }, { uid: 2, id: 102, lock: 0 }] } };
  before = JSON.stringify(s.player); const savesBefore = saves;
  const invalid = await bloodline.handleBloodlineCompose({ mainId: 1, subIds: [2] }, s, 9);
  check(invalid.data.result === 1 && JSON.stringify(s.player) === before && saves === savesBefore, 'invalid recipe preserves every bloodline and never saves');
  const oldPolicy = process.env.CURIOS_RESOURCE_POLICY;
  try {
    process.env.CURIOS_RESOURCE_POLICY = 'typo';
    s = session();
    await curios.handleCuriosCompose({ id: 501 }, s, 10);
    check(!s.player.other_attr_info.curiosInfo.curiosData.some(row => row.id === 501), 'unknown policy never grants missing-material curios');
    check((s.player.items[502] || 0) === 0, 'unknown policy cannot overdraft materials');
    s = session(); s.player.items[502] = 10;
    await curios.handleCuriosCompose({ id: 501 }, s, 11);
    check(s.player.other_attr_info.curiosInfo.curiosData.some(row => row.id === 501), 'valid native compose grants owned curios');
    check((s.player.items[502] || 0) === 0, 'valid compose consumes exact materials');
    s = { userId: s.userId, player: copy(persisted) };
    check(s.player.other_attr_info.curiosInfo.curiosData.length === 1, 'curios ownership survives relog snapshot');
    s.player.items[502] = 10;
    await curios.handleCuriosCompose({ id: 501 }, s, 11);
    check(s.player.items[502] === 10 && s.player.other_attr_info.curiosInfo.curiosData.length === 1, 'compose replay preserves fragments and owned card');
    s = session(); s.player.items[502] = 10;
    const original = s.player; before = JSON.stringify(original); saveMode = 'null';
    await assert.rejects(curios.handleCuriosCompose({ id: 501 }, s, 12)); checks++;
    check(JSON.stringify(original) === before && s.player === null, 'curios failed save keeps materials and ownership unpublished');
    saveMode = 'ok';
  } finally { if (oldPolicy === undefined) delete process.env.CURIOS_RESOURCE_POLICY; else process.env.CURIOS_RESOURCE_POLICY = oldPolicy; }
  check(invalidated === 4, 'uncertain saves invalidate sessions');
  console.log(JSON.stringify({ pass: checks, productionWrites: 0, mode: 'RAM mocked persistence', limitations: ['native client not exercised', 'Mine exit path validation unresolved', 'DoubleTower authoritative defense simulation unresolved', 'Curios combat not changed'] }));
})().catch(error => { console.error(error); process.exitCode = 1; });

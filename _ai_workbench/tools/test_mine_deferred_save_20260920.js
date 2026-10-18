'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = path.resolve(__dirname, '../temp/mine_fix_20260920/candidate/server');
const cache = new Map();
let saveCalls = 0;
const configData = {
  MineBlockConfig: { 1: { shape: [[1], [1]], picTimeRes: ['x'] } },
  MineLevelConfig: { 1: { 0: { deep: 1, rewards: [] } } },
  MineBaseConfig: { triggerNum: 20, autoPowerCost: 3, autoRowNum: 4, rocketheight: 12, boomCenter: [-2, -2], boomShape: Array.from({ length: 5 }, () => [1, 1, 1, 1, 1]), boxRewards: [] },
  MineEventConfig: {},
};
const mocks = {
  ConfigService: { get: key => configData[key] || {} },
  FeatureMutationService: {
    wrap: fn => fn,
    saveDeferred: (session, player) => {
      saveCalls += 1;
      session.player = player;
      session._featureMutationSaved = true;
      return Promise.resolve(player);
    },
  },
  SideTaskProgressService: { recordProgress: () => false },
  PlayerService: { savePlayer: async (_id, p) => p },
  BattleService: { calcPlayerPower: () => ({}), generateOpponentAttrs: () => ({}), simulateBattle: () => ({ win: true }) },
  raid: { addRewardToPlayer() {} },
};
function load(rel) {
  const file = path.resolve(app, rel);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} };
  cache.set(file, mod);
  const req = name => {
    const key = path.basename(name);
    if (mocks[key]) return mocks[key];
    if (name.startsWith('node:')) return require(name);
    if (key === 'logger') return { info() {}, warn() {}, error() {}, debug() {} };
    return load(path.relative(app, path.resolve(path.dirname(file), name + '.js')));
  };
  vm.runInThisContext(`(function(require,module,exports){${fs.readFileSync(file, 'utf8')}\n})`, { filename: file })(req, mod, mod.exports);
  return mod.exports;
}
(async () => {
  const mine = load('src/handlers/mine.js');
  const session = { userId: 'deferred', player: {
    userId: 'deferred', level: 100, items: { 55: 3 }, currencies: { gold: 0, silver: 0, diamond: 0 },
    mineInfo: { cycle: 1, levelId: 0, meter: 6, currentLevel: { levelId: 0, meter: 6, playerMeter: 3, playerCol: 3, finish: false, blocks: [{ uid: 1, id: 1, status: 0, meter: 5, col: 3 }], events: [] } },
  } };
  const start = Date.now();
  const response = await mine.handleMineDigBlock({ itemId: 55, meter: 5, col: 3, path: [{ meter: 3, col: 3 }, { meter: 3, col: 4 }, { meter: 4, col: 4 }, { meter: 5, col: 4 }] }, session, 1);
  const elapsed = Date.now() - start;
  assert(Array.isArray(response));
  assert.equal(saveCalls, 1);
  assert(elapsed < 100, `deferred handler took ${elapsed}ms`);
  assert.equal(session.player.items[55], 2);
  console.log(JSON.stringify({ result: 'PASS', checks: 4, elapsedMs: elapsed, productionWrites: 0 }));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });

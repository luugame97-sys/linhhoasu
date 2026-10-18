'use strict';

// RAM-only regression for the class-2 starter outfit fallback.  The fixture
// never calls a socket, writes a player, or changes production configuration.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', '..');
const app = process.env.FEATURE_APP || path.join(root, 'linhhoasu', 'lhs', 'newServer');
const game = process.env.FEATURE_GAME || path.join(root, 'linhhoasu', 'webgame', 'game');
const clone = value => JSON.parse(JSON.stringify(value));

const loggerPath = require.resolve(path.join(app, 'src/logger'));
require.cache[loggerPath] = {
  id: loggerPath,
  filename: loggerPath,
  loaded: true,
  exports: { info() {}, warn() {}, error() {}, debug() {} },
};
let saves = 0;
const playerServicePath = require.resolve(path.join(app, 'src/services/PlayerService'));
require.cache[playerServicePath] = {
  id: playerServicePath,
  filename: playerServicePath,
  loaded: true,
  exports: {
    drainPendingSaves: async () => {},
    savePlayer: async (_userId, player) => { saves += 1; return player; },
  },
};

const config = require(path.join(app, 'src/services/ConfigService'));
const tables = config.loadAllTables();
const appearance = require(path.join(app, 'src/services/RoleAppearanceService'));
const fashion = require(path.join(app, 'src/handlers/fashion'));

function ack(result, tag) {
  return (Array.isArray(result) ? result : [result]).find(row => row && row.tag === tag)?.data;
}

function makePlayer(subJob) {
  return {
    userId: `class2_appearance_${subJob}`,
    playerId: `class2_appearance_${subJob}`,
    level: 120,
    roleInfo: { kungfuId: 2, subJob },
    items: {},
    currencies: { diamond: 0, silver: 0, gold: 0 },
    fashionInfo: {
      curFashion: {}, fashion: {}, fashionMap: {}, equipped: {}, fashions: {},
      activateFashion: [], fashionData: [], sets: [], setId: 0, suits: {}, dress: [],
    },
  };
}

async function main() {
  const checks = [];
  for (const subJob of [0, 1]) {
    const player = makePlayer(subJob);
    appearance.ensureRoleAppearance(player);
    const initShows = tables.RoleGenderConfig[2][subJob].initShows;
    assert.deepEqual(
      initShows.map(Number),
      [30201, 30202, 30203, 30209].map((id, index) => subJob ? id + 10 : id),
      `class 2/${subJob} starter rows`
    );
    assert(initShows.every(id => appearance.hasFashionOwnership(player, id)), `ownership ${subJob}`);
    const beforeSaves = saves;
    const equipped = await fashion.handleChangeSuit(
      { id: 28000, color: 0, set: 0 },
      { userId: player.userId, player },
      1802 + subJob
    );
    const equipAck = ack(equipped, 1802);
    assert.equal(equipAck.result, 0, `class 2/${subJob} base equip`);
    assert.equal(saves, beforeSaves + 1);
    for (const id of initShows) {
      const type = tables.FashionConfig[id].type;
      assert.equal(player.fashionInfo.fashion[type], id, `selected starter part ${id}`);
    }

    const stable = clone(player);
    const rejected = await fashion.handleChangeSuit(
      { id: 28000, color: 1, set: 0 },
      { userId: player.userId, player },
      1902 + subJob
    );
    assert.equal(ack(rejected, 1802).result, -1, `class 2/${subJob} unsupported color`);
    assert.deepEqual(player, stable, `unsupported color ${subJob} does not mutate`);
    checks.push(`server-class2-${subJob}`);
  }

  if (process.env.FEATURE_SKIP_CLIENT === '1') {
    console.log(JSON.stringify({
      result: 'PASS', checks, fallbackRows: 0, savesInMemory: saves,
      productionWrites: 0, networkAttempts: 0, clientSkipped: true,
    }));
    return;
  }

  // Execute the shipped native methods plus the patched addon against the
  // actual runtime tables.  This verifies missing rows are rendered safely,
  // while colors 1/2 remain empty and therefore not active.
  const mainBundle = fs.readFileSync(path.join(game, 'js/main.min_drop100.js'), 'utf8');
  const addon = fs.readFileSync(path.join(game, 'js/lhs-appearance-preview-v1.js'), 'utf8');
  const acorn = require(path.join(app, 'node_modules/acorn'));
  const panelEnd = mainBundle.indexOf('t(DM=ffe,"DisguiseSuitPanel")');
  const source = (marker, panel = false) => {
    const at = panel ? mainBundle.lastIndexOf(marker, panelEnd) : mainBundle.indexOf(marker);
    assert(at >= 0, marker);
    let node = acorn.parseExpressionAt(mainBundle, at + marker.indexOf('function'), { ecmaVersion: 2022 });
    if (node.type === 'SequenceExpression') node = node.expressions[0];
    return mainBundle.slice(node.start, node.end);
  };
  const fm = {
    _fashionInfo: { activateFashion: [], dress: [], fashion: {} },
    GetSuitFashions: null,
    IsFashionActive(id) { return this._fashionInfo.activateFashion.includes(Number(id)); },
    IsSuitActive(id, color) { return this.GetSuitFashions(id, color).length > 0 && this.GetSuitFashions(id, color).every(value => this.IsFashionActive(value)); },
    getAllSuit: () => [{ suitId: 28000, dyeing: 0 }, { suitId: 28000, dyeing: 1 }, { suitId: 28000, dyeing: 2 }],
  };
  const manager = { Config: clone(tables), FashionModel: fm, RoleModel: { kungfuId: 2, subJob: 0 } };
  const ctx = vm.createContext({
    Y: manager, GlobalManager: manager, O: Math,
    x: { INITIAL_ROLE_SUIT: 28000, ESuitType: { normal: 0, linkage: 1, changeColor: 2, bathrobe: 3, endSkill: 4 } },
    console: { info() {}, warn() {} }, setTimeout() {},
    window: null, root: null,
    eui: { ArrayCollection: class { constructor(source = []) { this.source = source; } replaceAll(rows) { this.source = rows; } } },
    UserTips: { ins: () => ({ showTips() {} }) },
  });
  ctx.window = ctx;
  fm.GetSuitFashions = vm.runInContext(`(${source('f.GetSuitFashions=function')})`, ctx);
  vm.runInContext(addon, ctx);
  const fallback = manager.Config.FashionColorPlayerConfig[2][0];
  assert.deepEqual(fallback[0].fashionIds.map(Number), [30201, 30202, 30203, 30209]);
  assert.deepEqual(Array.from(fallback[1].fashionIds), []);
  assert.deepEqual(Array.from(fallback[2].fashionIds), []);
  assert.deepEqual(Array.from(fm.GetSuitFashions(28000, 0)), [30201, 30202, 30203, 30209]);
  assert.deepEqual(Array.from(fm.GetSuitFashions(28000, 1)), []);
  assert.equal(ctx.LhsAppearancePreviewV1.version, '20260927_appearance_preview_v3');
  checks.push('client-class2-render-fallback');

  console.log(JSON.stringify({
    result: 'PASS',
    checks,
    fallbackRows: ctx.LhsAppearancePreviewV1.initialRoleFallbackRows,
    savesInMemory: saves,
    productionWrites: 0,
    networkAttempts: 0,
  }));
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

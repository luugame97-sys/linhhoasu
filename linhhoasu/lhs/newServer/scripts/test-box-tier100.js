'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const config = require('../src/services/ConfigService');
const drop = require('../src/config/dropLevel100');
process.env.DROP_LEVEL_100_ENABLED = '1';
process.env.SERVER_ID = '1001';
const tables = config.loadAllTables();
const tiers = tables.BoxTierConfig, tasks = tables.TaskConfig;
assert.equal(Object.keys(tiers).length, 100);
assert.equal(tiers[10].count, 10);
assert.equal(tiers[100].count, 100);
assert.deepEqual(tiers[100].tierUpCost, []);
for (let tier = 11; tier <= 100; tier += 1) {
  assert.equal(tiers[tier].count, tier);
  assert.equal(tiers[tier].task.length, 3);
  tiers[tier].task.forEach((id) => assert(tasks[id] && tasks[id].id === id));
  if (tier < 100) assert.equal(tiers[tier].tierUpCost.length, 5);
}
const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../../webgame/game/js/lhs-box-tier100-v1.js'), 'utf8');
const browser = { setTimeout() {}, console: { error() {} } };
browser.window = browser;
function BoxModel() {}
BoxModel.prototype.getAutoNum = () => 101;
BoxModel.getBoxInfo = () => ({ tier: 100 });
const Auto = { multipleData: [], UpdateMultipleData() { this.multipleData = Array.from({ length: 101 }, (_, i) => i + 1); } };
function Panel() {}
Panel.prototype.updateUI = function () { this.labLeftMult.text = '101'; this.labMonthCardExtraDrop.visible = true; this.groupLeftExtra.visible = true; };
browser.GlobalManager = { Config: {
  BoxTierConfig: Object.fromEntries(Object.entries(tiers).filter(([id]) => Number(id) <= 10)),
  TaskConfig: Object.fromEntries(Object.entries(tasks).filter(([id]) => Number(id) < 70300)),
}, BoxLayerModel: BoxModel, OpenBoxAutoSettingModel: Auto, BoxStageUpPanel: Panel };
vm.runInNewContext(source, browser, { filename: 'lhs-box-tier100-v1.js' });
const clientTiers = browser.GlobalManager.Config.BoxTierConfig;
assert.equal(browser.LhsBoxTier100V1.installed, true);
assert.equal(clientTiers[100].count, 100);
assert.equal(clientTiers[100].task.length, 3);
assert.equal(clientTiers[50].tierUpCost[0], 2450);
assert.equal(clientTiers[99].timeCost, tiers[99].timeCost);
for (let tier = 11; tier <= 100; tier += 1) assert.deepEqual(JSON.parse(JSON.stringify(clientTiers[tier])), tiers[tier]);
assert.equal(new BoxModel().getAutoNum(), 100);
assert.equal(Math.max(...Auto.multipleData), 100);
const panel = new Panel(); panel.labLeftMult = { text: '' }; panel.labMonthCardExtraDrop = { visible: true }; panel.groupLeftExtra = { visible: true }; panel.updateUI();
assert.equal(panel.labLeftMult.text, '100'); assert.equal(panel.labMonthCardExtraDrop.visible, false); assert.equal(panel.groupLeftExtra.visible, false);
const loggerPath = require.resolve('../src/logger');
require.cache[loggerPath] = { id: loggerPath, filename: loggerPath, loaded: true, exports: { info() {}, warn() {}, error() {}, debug() {} } };
const playerServicePath = require.resolve('../src/services/PlayerService');
require.cache[playerServicePath] = { id: playerServicePath, filename: playerServicePath, loaded: true, exports: {} };
const box = require('../src/handlers/box');
const tier100Player = { level: 100, roleInfo: { stage: 1 }, boxInfo: { level: 100, tier: 100 }, rechargeInfo: { monthCards: { 11000002: Date.now() + 60000 } } };
assert.equal(box.getAuthoritativeDelegateCount(tier100Player, 999), 100, 'server hard cap must include card privilege');
const open = box.buildOpenInfo(tier100Player, 100);
assert.equal(open.count, 100);
assert.equal(open.items.filter(row => row.id !== 3).reduce((sum, row) => sum + row.count, 0), 100);
assert(Buffer.byteLength(JSON.stringify(open)) < 128 * 1024, 'open packet too large');
console.log(JSON.stringify({ result: 'PASS', tierCount: Object.keys(tiers).length, maxOpenCount: tiers[100].count, productionWrites: 0 }));

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const game = path.join(root, 'linhhoasu/webgame/game');
const sourcePath = path.join(game, 'js/lhs-power-relogin-v1.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const index = fs.readFileSync(path.join(game, 'index.html'), 'utf8');
assert(source.includes('20260921_power_relogin_v3'));
assert(index.includes('js/lhs-power-relogin-v1.js?v=20260921_power_relogin_v3'));
assert(source.includes('powerModelReady'));
assert(source.includes('queuePowerRetry'));

const timers = [];
const warnings = [];
const dispatches = [];
const center = {
  listeners: {},
  dispatch(name, value) {
    dispatches.push({ name, value });
    (this.listeners[name] || []).forEach(fn => fn(value));
  },
  addListener(name, fn) { (this.listeners[name] || (this.listeners[name] = [])).push(fn); },
};
function MessageCenter() {}
MessageCenter.ins = () => center;

let equipReady = false;
let changeAllAttr = 0;
let integrationAttrs = 0;
const role = {
  _oldPower: 0,
  changeAllAttr() { changeAllAttr += 1; },
  integrationAttrs() { integrationAttrs += 1; },
  calAllPower() { return 898296095; },
  changeAttr() {},
};
const equip = {
  getAttrs() { return {}; },
  getPresetIdx() { if (!equipReady) throw new TypeError("Cannot read properties of undefined (reading 'curIndex')"); return 0; },
};
function MainPanel() {}
MainPanel.prototype.initPower = function () {};
MainPanel.prototype.OnOpen = function () {};
function MainPanelNew() {}
MainPanelNew.prototype.initPower = function () {};
MainPanelNew.prototype.OnOpen = function () {};
function GemModel() {}
GemModel.prototype.initData = function () {};
function PetSoulModel() {}
PetSoulModel.prototype.sc_pet_soul_info = function () {};
const context = {
  GameGlobalYDXZ: { RoleModel: role, EquipModel: equip, ViewManager: { getView() { return null; } } },
  MainPanel, MainPanelNew, GemModel, PetSoulModel, MessageCenter,
  MessageDef: { ATTR_CHANGE: 'ATTR_CHANGE', MAINPANEL_POWER_REFRESH: 'POWER', ROLE_ATTR_UPDATE: 'ROLE' },
  setTimeout(fn) { timers.push(fn); return timers.length; },
  console: { warn(value) { warnings.push(String(value)); }, info() {} },
};
vm.createContext(context);
vm.runInContext(source, context, { filename: sourcePath });
assert(context.LhsPowerReloginFix.installed);
MainPanel.prototype.OnOpen.call({ powerCell: { data: 0 } });
assert.equal(changeAllAttr, 0, 'must not calculate before EquipModel init');
assert(timers.length > 0, 'must retry while EquipModel is not ready');
equipReady = true;
let guard = 0;
while (timers.length && guard++ < 200) timers.shift()();
assert(changeAllAttr > 0, 'must calculate after EquipModel init');
assert(integrationAttrs > 0, 'must integrate after EquipModel init');
assert.equal(role._oldPower, 898296095);
assert.equal(warnings.length, 0, 'expected early-init TypeError must not be logged');
assert(dispatches.some(row => row.name === 'POWER' && row.value === 898296095));
console.log(JSON.stringify({ status: 'PASS', checks: 9, changeAllAttr, integrationAttrs, timersRun: guard, warnings: warnings.length }));

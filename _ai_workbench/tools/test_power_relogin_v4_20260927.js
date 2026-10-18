'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const reloginPath = path.join(root, 'linhhoasu/webgame/game/js/lhs-power-relogin-v1.js');
const index = fs.readFileSync(path.join(root, 'linhhoasu/webgame/game/index.html'), 'utf8');
const source = fs.readFileSync(reloginPath, 'utf8');
assert.match(source, /20260927_power_relogin_v4/);
assert.match(index, /lhs-power-relogin-v1\.js\?v=20260927_power_relogin_v4/);

const timers = [];
const dispatches = [];
const center = { listeners: {}, dispatch(name, value) {
  dispatches.push({ name, value });
  (this.listeners[name] || []).forEach(fn => fn(value));
}, addListener(name, fn) { (this.listeners[name] || (this.listeners[name] = [])).push(fn); } };
function MessageCenter() {}
MessageCenter.ins = () => center;
const role = {
  _oldPower: 0,
  changeAllAttr() {}, integrationAttrs() {}, calAllPower() { return 931805829; }, changeAttr() {},
};
const cell = { data: 0 };
function MainPanel() {}
MainPanel.prototype.initPower = function () { this.powerCell.data = 931805829; };
MainPanel.prototype.OnOpen = function () { this.powerCell = cell; this.initPower(); };
function MainPanelNew() {}
MainPanelNew.prototype.initPower = function () {};
MainPanelNew.prototype.OnOpen = function () {};
const manager = {
  RoleModel: role,
  PlayerInfoModel: { playerInfo: { power: 837705799, powerScore: 8377057 } },
  EquipModel: { getAttrs() { return {}; }, getPresetIdx() { return 0; } },
  ViewManager: { getView(Type) { return Type === MainPanel ? { powerCell: cell } : null; } },
};
const context = {
  GameGlobalYDXZ: manager, MainPanel, MainPanelNew, MessageCenter,
  MessageDef: { MAINPANEL_POWER_REFRESH: 'POWER', ROLE_ATTR_UPDATE: 'ROLE', ON_LOGIN_INFO_UPDATE: 'LOGIN' },
  LhsPowerAuthoritativeV1: { getDisplayPower() { return 837705799; } },
  LhsHudPowerFullV1: { render() {} },
  setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {},
  console: { warn() {} },
};
vm.createContext(context);
vm.runInContext(source, context, { filename: reloginPath });
MainPanel.prototype.OnOpen.call(new MainPanel());
assert.equal(role._lhsClientPower, 931805829);
assert.equal(role._oldPower, 837705799);
assert.equal(cell.data, 837705799);
assert.equal(dispatches.some(row => row.value === 931805829), false, 'local value must not be dispatched to display');
assert.equal(dispatches.some(row => row.value === 837705799), true);
console.log(JSON.stringify({ result: 'PASS', checks: 7, localCalculator: role._lhsClientPower,
  displayPower: role._oldPower, localDisplayDispatches: dispatches.filter(x => x.value === 931805829).length }));

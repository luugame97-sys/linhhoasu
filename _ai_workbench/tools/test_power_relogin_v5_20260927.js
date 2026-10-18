'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const sourcePath = path.join(root, 'linhhoasu/webgame/game/js/lhs-power-relogin-v1.js');
const indexPath = path.join(root, 'linhhoasu/webgame/game/index.html');
const source = fs.readFileSync(sourcePath, 'utf8');
const index = fs.readFileSync(indexPath, 'utf8');
assert.match(source, /20260927_power_relogin_v5/);
assert.match(index, /lhs-power-relogin-v1\.js\?v=20260927_power_relogin_v5/);

const timers = [];
const dispatches = [];
const tips = [];
const center = {
  dispatch(name, value) { dispatches.push({ name, value }); },
  addListener() {},
};
function MessageCenter() {}
MessageCenter.ins = () => center;

function RoleModel() {}
RoleModel.prototype.calAllPower = function () { return 926454824; };
RoleModel.prototype.onPowerChange = function () {
  tips.push({ old: this._oldPower, next: this.calAllPower() });
  this._oldPower = this.calAllPower();
};
const role = new RoleModel();
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
  GameGlobalYDXZ: {
    RoleModel: role,
    EquipModel: { getAttrs() { return {}; }, getPresetIdx() { return 0; } },
    ViewManager: { getView() { return null; } },
  },
  RoleModel,
  MainPanel,
  MainPanelNew,
  GemModel,
  PetSoulModel,
  MessageCenter,
  MessageDef: { MAINPANEL_POWER_REFRESH: 'POWER', ROLE_ATTR_UPDATE: 'ROLE' },
  LhsPowerAuthoritativeV1: {
    getDisplayPower() { return 837803451; },
    renderSelf(value) { dispatches.push({ name: 'RENDER_SELF', value }); },
  },
  setTimeout(fn) { timers.push(fn); return timers.length; },
  clearTimeout() {},
  console: { warn() {}, info() {} },
};
vm.createContext(context);
vm.runInContext(source, context, { filename: sourcePath });

assert.equal(typeof role.onPowerChange, 'function');
role.onPowerChange();
assert.equal(tips.length, 0, 'native local power tip must be suppressed');
assert.equal(role._lhsClientPower, 926454824, 'local calculator remains available');
assert.equal(role._oldPower, 837803451, 'display state is server-authoritative');
assert.ok(dispatches.some(row => row.name === 'POWER' && row.value === 837803451));
assert.ok(dispatches.some(row => row.name === 'RENDER_SELF' && row.value === 837803451));

console.log(JSON.stringify({ result: 'PASS', checks: 7,
  localCalculator: role._lhsClientPower, displayPower: role._oldPower,
  localPowerTips: tips.length }));

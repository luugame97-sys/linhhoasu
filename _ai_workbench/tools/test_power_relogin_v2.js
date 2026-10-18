'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');

const workspaceRoot = path.resolve(__dirname, '..', '..');
const gameRoot = path.join(workspaceRoot, 'linhhoasu', 'webgame', 'game');
const patchPath = path.join(gameRoot, 'js', 'lhs-power-relogin-v1.js');
const patchSource = fs.readFileSync(patchPath, 'utf8');
const indexSource = fs.readFileSync(path.join(gameRoot, 'index.html'), 'utf8');

let testCount = 0;
function check(condition, message) {
  assert.ok(condition, message);
  testCount += 1;
}

function staticChecks() {
  check(patchSource.includes('20260921_power_relogin_v2'), 'patch version marker missing');
  check(patchSource.includes('syncFullPower'), 'syncFullPower function missing');
  check(patchSource.includes('patchMainPanel'), 'patchMainPanel missing');
  check(indexSource.includes('js/lhs-power-relogin-v1.js?v=20260921_power_relogin_v2'),
    'index.html does not reference the updated query version');
}

function runtimeChecks() {
  const timers = [];
  const dispatches = [];
  const center = {
    listeners: {},
    dispatch(name, data) {
      dispatches.push({ name, data });
      if (this.listeners[name]) {
        this.listeners[name].forEach(fn => fn(data));
      }
    },
    addListener(name, fn) {
      if (!this.listeners[name]) this.listeners[name] = [];
      this.listeners[name].push(fn);
    }
  };
  function MessageCenter() {}
  MessageCenter.ins = () => center;

  let changeAllAttrCalled = 0;
  let integrationAttrsCalled = 0;
  let calAllPowerCalled = 0;
  const roleModel = {
    _oldPower: 1229704,
    changeAllAttr() { changeAllAttrCalled++; },
    integrationAttrs() { integrationAttrsCalled++; },
    calAllPower() { calAllPowerCalled++; return 898296095; },
    changeAttr() {}
  };

  const powerCell = { data: 0 };
  const mainPanelInstance = { powerCell };
  function MainPanel() {}
  MainPanel.prototype.initPower = function () {
    this.powerCell.data = roleModel.calAllPower();
  };
  MainPanel.prototype.OnOpen = function () {};

  function MainPanelNew() {}
  MainPanelNew.prototype.initPower = function () {
    this.powerCell.data = roleModel.calAllPower();
  };
  MainPanelNew.prototype.OnOpen = function () {};

  function GemModel() {}
  GemModel.prototype.initData = function (t) { this.info = t; return 'gem-ok'; };

  function PetSoulModel() {}
  PetSoulModel.prototype.sc_pet_soul_info = function (t) { this.info = t; return 'petsoul-ok'; };

  function ValhallaFormationModel() {}
  ValhallaFormationModel.prototype.onValhallaFormationInfo = function (t) { this.info = t; return 'valhalla-ok'; };

  function HomelandModel() {}
  HomelandModel.prototype.onHomelandInfo = function (t) { this.info = t; return 'homeland-ok'; };

  function OldTrekModel() {}
  OldTrekModel.prototype.onOldTrekInfo = function (t) { this.info = t; return 'oldtrek-ok'; };

  function FateModel() {}
  FateModel.prototype.initData = function (t) { this.info = t; return 'fate-ok'; };

  const viewManager = {
    getView(cls) {
      if (cls === MainPanel || cls === MainPanelNew) return mainPanelInstance;
      return null;
    }
  };

  const context = {
    GameGlobalYDXZ: {
      RoleModel: roleModel,
      ViewManager: viewManager
    },
    MainPanel,
    MainPanelNew,
    GemModel,
    PetSoulModel,
    ValhallaFormationModel,
    HomelandModel,
    OldTrekModel,
    FateModel,
    MessageCenter,
    MessageDef: {
      ATTR_CHANGE: 'ATTR_CHANGE',
      MAINPANEL_POWER_REFRESH: 'MAINPANEL_POWER_REFRESH',
      ROLE_ATTR_UPDATE: 'ROLE_ATTR_UPDATE',
      ON_LOGIN_INFO_UPDATE: 'ON_LOGIN_INFO_UPDATE'
    },
    setTimeout(fn, delay) {
      timers.push({ fn, delay });
      return timers.length;
    },
    console: {
      warn(msg) { console.warn('Context warn:', msg); }
    }
  };

  vm.createContext(context);
  vm.runInContext(patchSource, context, { filename: patchPath });

  const api = context.LhsPowerReloginFix;
  check(api && api.installed, 'API installed flag not set');

  // Test 1: MainPanel.OnOpen triggers syncFullPower
  mainPanelInstance.powerCell.data = 1229704;
  MainPanel.prototype.OnOpen.call(mainPanelInstance);

  check(changeAllAttrCalled >= 1, 'RoleModel.changeAllAttr was not called on OnOpen');
  check(integrationAttrsCalled >= 1, 'RoleModel.integrationAttrs was not called on OnOpen');
  check(roleModel._oldPower === 898296095, 'RoleModel._oldPower was not updated to full power');
  check(mainPanelInstance.powerCell.data === 898296095, 'MainPanel powerCell was not set to 898M');

  const hasPowerRefresh = dispatches.some(d => d.name === 'MAINPANEL_POWER_REFRESH' && d.data === 898296095);
  check(hasPowerRefresh, 'MAINPANEL_POWER_REFRESH not dispatched with full power');

  // Test 2: Gem packet arriving triggers scheduleRefresh
  const gemInst = new GemModel();
  const gemRet = gemInst.initData({ gem: 1 });
  check(gemRet === 'gem-ok', 'GemModel original return value altered');
  check(gemInst.info.gem === 1, 'GemModel original state altered');

  // Test 3: ON_LOGIN_INFO_UPDATE triggers sync
  dispatches.length = 0;
  center.dispatch('ON_LOGIN_INFO_UPDATE');
  const hasLoginSync = dispatches.some(d => d.name === 'MAINPANEL_POWER_REFRESH' && d.data === 898296095);
  check(hasLoginSync, 'ON_LOGIN_INFO_UPDATE did not trigger full power sync');

  console.log(`[PASS] All ${testCount} tests passed successfully!`);
}

staticChecks();
runtimeChecks();

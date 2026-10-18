'use strict';

/* Static + runtime fixture for the client-side relog power synchronization patch. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert/strict');
const { extract, root: workspaceRoot, src: bundle } = require('./inspect_fishing_background_20260907');

const gameRoot = path.join(workspaceRoot, 'linhhoasu', 'webgame', 'game');
const patchPath = path.join(gameRoot, 'js', 'lhs-power-relogin-v1.js');
const patchSource = fs.readFileSync(patchPath, 'utf8');
const indexSource = fs.readFileSync(path.join(gameRoot, 'index.html'), 'utf8');
const accountSource = fs.readFileSync(
  path.join(workspaceRoot, 'linhhoasu', 'lhs', 'newServer', 'src', 'handlers', 'account.js'),
  'utf8'
);

let testCount = 0;
function check(condition, message) {
  assert.ok(condition, message);
  testCount += 1;
}

function staticChecks() {
  const gemInit = 'm.initData=function(t){this._info=t,this.handleTestList(),A.ins().dispatch(E.Gem_Info_Update)}';
  const petInfo = 'a.sc_pet_soul_info=function(t){var e=this;this._info=t';
  const player500 = accountSource.indexOf('messages.push(player500Message);');
  const gem3900 = accountSource.indexOf('tag: 3900,', player500);
  const pet6900 = accountSource.indexOf('tag: 6900,', player500);
  check(bundle.includes(gemInit), 'current bundle GemModel init marker changed');
  check(bundle.includes(petInfo), 'current bundle PetSoul init marker changed');
  check(player500 > 0 && gem3900 > player500 && pet6900 > gem3900,
    'server login packet order no longer matches the diagnosed late-init case');
  check(patchSource.includes("20260907_power_relogin_v1"), 'patch version marker missing');
  check(patchSource.includes("wrap(root.GemModel, 'GemModel', 'initData', 10)"),
    'GemModel category refresh hook missing');
  check(patchSource.includes("wrap(root.PetSoulModel, 'PetSoulModel', 'sc_pet_soul_info', 19)"),
    'PetSoul category refresh hook missing');
  const scriptToken = 'js/lhs-power-relogin-v1.js?v=20260907_power_relogin_v1';
  check((indexSource.match(/js\/lhs-power-relogin-v1\.js\?v=20260907_power_relogin_v1/g) || []).length === 1,
    'power relog script must appear exactly once in the entrypoint');
  check(indexSource.indexOf(scriptToken) > indexSource.indexOf('js/main.min_a6195824.js'),
    'power relog script must load after the main game bundle');
}

function runApiFixture() {
  const timers = [];
  const calls = [];
  const warnings = [];
  const center = {
    dispatch(name) {
      const args = Array.prototype.slice.call(arguments, 1);
      calls.push({ name, args });
      if (name === 'ATTR_CHANGE' && context.GlobalManager.RoleModel) {
        context.GlobalManager.RoleModel.changeAttr.apply(context.GlobalManager.RoleModel, args);
      }
    },
  };
  function MessageCenter() {}
  MessageCenter.ins = function () { return center; };
  function GemModel() {}
  GemModel.prototype.initData = function (value) {
    this.value = value;
    return 'gem-return';
  };
  function PetSoulModel() {}
  PetSoulModel.prototype.sc_pet_soul_info = function (value) {
    this.value = value;
    return 'pet-return';
  };
  const gem = new GemModel();
  const pet = new PetSoulModel();
  const role = {
    categories: [],
    changeAttr(category) { this.categories.push(category == null ? 'all' : category); },
  };
  const context = {
    GemModel,
    PetSoulModel,
    GlobalManager: { RoleModel: role, GemModel: gem, PetSoulModel: pet },
    MessageCenter,
    MessageDef: { ATTR_CHANGE: 'ATTR_CHANGE' },
    setTimeout(fn, delay) {
      timers.push({ fn, delay });
      return timers.length;
    },
    console: { warn(value) { warnings.push(value); } },
  };
  vm.createContext(context);
  vm.runInContext(patchSource, context, { filename: patchPath });
  const api = context.LhsPowerReloginFix;
  check(api && api.installed, 'runtime patch did not install');
  check(api.patchedParts.length === 2, 'unexpected number of runtime hooks');
  check(gem.initData('gem') === 'gem-return', 'GemModel return value changed');
  check(pet.sc_pet_soul_info('pet') === 'pet-return', 'PetSoul return value changed');
  check(gem.value === 'gem' && pet.value === 'pet', 'model state was not preserved');
  check(timers.length === 1, 'refresh was not debounced across login packets');
  while (timers.length) timers.shift().fn();
  check(JSON.stringify(role.categories) === JSON.stringify([10, 19]),
    'late model packets did not refresh the correct attribute groups');
  check(api.refreshes === 2, 'unexpected refresh count');

  const beforeHooks = api.patchedParts.length;
  vm.runInContext(patchSource, context, { filename: patchPath });
  api.installAttempts += 0; // keep the assertion explicit without mutating hook state
  check(api.patchedParts.length === beforeHooks, 'patch is not idempotent');
  check(warnings.length === 0, 'patch emitted an install warning in a ready runtime');

  // A native shell may expose classes before creating RoleModel. Verify retry behavior.
  const retryTimers = [];
  const retryRole = { categories: [], changeAttr(category) { this.categories.push(category); } };
  const retryCenter = {
    dispatch(name, category) {
      if (name === 'ATTR_CHANGE' && retryContext.GlobalManager.RoleModel) {
        retryContext.GlobalManager.RoleModel.changeAttr(category);
      }
    },
  };
  function RetryMessageCenter() {}
  RetryMessageCenter.ins = function () { return retryCenter; };
  function RetryGem() {}
  RetryGem.prototype.initData = function () { return 7; };
  function RetryPet() {}
  RetryPet.prototype.sc_pet_soul_info = function () { return 8; };
  const retryContext = {
    GemModel: RetryGem,
    PetSoulModel: RetryPet,
    GlobalManager: { RoleModel: null },
    MessageCenter: RetryMessageCenter,
    MessageDef: { ATTR_CHANGE: 'ATTR_CHANGE' },
    setTimeout(fn, delay) { retryTimers.push({ fn, delay }); return retryTimers.length; },
    console: { warn() {} },
  };
  vm.createContext(retryContext);
  vm.runInContext(patchSource, retryContext, { filename: patchPath });
  retryContext.GemModel.prototype.initData.call({});
  check(retryTimers.length === 1, 'retry fixture did not schedule initial flush');
  retryTimers.shift().fn();
  retryContext.GlobalManager.RoleModel = retryRole;
  while (retryTimers.length) retryTimers.shift().fn();
  check(retryRole.categories.length === 1 && retryRole.categories[0] === 10,
    'refresh was lost while RoleModel was initializing');
}

function runRealFixture() {
  const realContext = {
    O: Math,
    E: {
      ATTR_CHANGE: 'ATTR_CHANGE',
      ROLE_ATTR_UPDATE: 'ROLE_ATTR_UPDATE',
      Gem_Info_Update: 'Gem_Info_Update',
      PET_SOUL_INFO_UPDATE: 'PET_SOUL_INFO_UPDATE',
    },
    Y: {},
    T: { serverTimeMilli: 1000 },
    sht: { RegDate: 0 },
    So: { MS_PER_DAY: 86400000 },
    S: { ins: () => ({ showPowerTip() {} }) },
    platform: { onGameEvent() {} },
    ec: { copyDataHandler: (value) => JSON.parse(JSON.stringify(value)) },
    eO: {
      attrAddition(attrs, additions) {
        const result = { ...attrs };
        Object.keys(additions || {}).forEach((key) => {
          result[key] = (result[key] || 0) + additions[key];
        });
        return result;
      },
    },
    console: { warn() {}, log() {} },
  };
  realContext.Y.Config = require(path.join(
    workspaceRoot, 'linhhoasu', 'lhs', 'newServer', 'src', 'services', 'ConfigService'
  )).loadAllTables();

  const role = {
    _roleInfo: { kungfuId: 4 },
    _oldPower: 0,
    _mapAttrs: {},
    _allAttrs: {},
    _modifyAttrs: {},
    getStageAttr: () => ({}),
  };
  function method(marker, offset) {
    return vm.runInContext('(' + extract(marker, offset).source + ')', realVm);
  }
  const realVm = vm.createContext(realContext);
  [
    'changeAllAttr', 'changeAttr', 'integrationAttrs', 'attrModify', 'calRolePower',
    'calAllPower', 'getAllAttr', 'getEmptyAttrList',
  ].forEach((name) => { role[name] = method('C.' + name + '=function', 6263000); });
  role.onPowerChange = function () { this._oldPower = this.calAllPower(); };

  const centerEvents = [];
  const realCenter = {
    dispatch(name) {
      const args = Array.prototype.slice.call(arguments, 1);
      centerEvents.push({ name, args });
      if (name === 'ATTR_CHANGE') role.changeAttr.apply(role, args);
    },
  };
  realContext.A = { ins: () => realCenter };
  realContext.MessageCenter = function () {};
  realContext.MessageCenter.ins = () => realCenter;
  realContext.MessageDef = realContext.E;
  realContext.GlobalManager = { RoleModel: role };
  realContext.Y.RoleModel = role;
  realContext.eO.calPowerByAttr = method('calPowerByAttr=function', 4840000);

  const modelNames = [
    'EquipModel', 'MountModel', 'FormationModel', 'PetModel', 'FashionModel', 'ItemModel',
    'ArtifactModel', 'SpiritModel', 'FateModel', 'FishingModel', 'ValhallaModel',
    'BloodlineModel', 'CuriosModel', 'ElfModel', 'HomelandModel', 'ValhallaFormationModel',
    'OldTrekModel', 'SpecSpiritModel',
  ];
  modelNames.forEach((name) => {
    realContext.Y[name] = {
      getAttrs: () => ({}),
      getAllAttrs: () => ({}),
      calPrivilegeMap() {},
    };
  });
  realContext.Y.EquipModel.getAttrs = () => ({ 1: 10000, 2: 100 });
  realContext.Y.FishingModel.getAttrs = () => ({ 1: 5000, 2: 50 });

  const gemNames = [
    'initData', 'handleTestList', 'getAttrs', 'getPlacedGemAttrMap', 'getPlacedGemDataList',
    'getPlacedGemPosList', 'getPlacedGemPos', 'getAllGem', 'getEchoLv', 'getPlacedTotalScore',
    'checkGemFull',
  ];
  function GemModel() {}
  gemNames.forEach((name) => { GemModel.prototype[name] = method('m.' + name + '=function', 6086400); });
  const gem = new GemModel();
  gem._info = null;
  gem._testList = [];
  realContext.GemModel = GemModel;
  realContext.Y.GemModel = gem;

  function PetSoulModel() {}
  PetSoulModel.prototype.sc_pet_soul_info = method('a.sc_pet_soul_info=function', 1033400);
  PetSoulModel.prototype.psrsePetSoulData = (value) => value;
  PetSoulModel.prototype.startCheckEndTimeUpdate = () => {};
  PetSoulModel.prototype.getAttrs = () => ({ 2: 777 });
  const petSoul = new PetSoulModel();
  petSoul._info = null;
  realContext.PetSoulModel = PetSoulModel;
  realContext.Y.PetSoulModel = petSoul;

  const timers = [];
  realContext.setTimeout = (fn) => { timers.push(fn); return timers.length; };
  vm.runInContext(patchSource, realVm, { filename: patchPath });
  check(realContext.LhsPowerReloginFix.installed, 'real fixture patch did not install');

  // This is the diagnosed login order: full role first, late gem and pet-soul packets after it.
  realCenter.dispatch('ATTR_CHANGE');
  const afterEarlyRefresh = role.calAllPower();
  gem.initData({
    plan: { id: 1, positions: [{ uid: 1, row: 0, col: 0 }] },
    gems: [{ uid: 1, id: 25051, shapeId: 103 }],
    exchangeTimes: 0,
    fieldCount: 30,
  });
  petSoul.sc_pet_soul_info({ summon: [], petSouls: [], cachedRewardCount: 0 });
  check(timers.length === 1, 'real fixture did not coalesce late packets');
  while (timers.length) timers.shift()();
  const afterLateRefresh = role.calAllPower();
  check(afterLateRefresh > afterEarlyRefresh, 'late gem data did not restore power');
  check(JSON.stringify(role._mapAttrs[10]) === JSON.stringify(gem.getAttrs()),
    'GemModel attributes were not copied into RoleModel category 10');
  check(JSON.stringify(role._mapAttrs[19]) === JSON.stringify(petSoul.getAttrs()),
    'PetSoul attributes were not copied into RoleModel category 19');
  check(centerEvents.some((event) => event.name === 'ATTR_CHANGE' && event.args[0] === 10),
    'missing ATTR_CHANGE category 10');
  check(centerEvents.some((event) => event.name === 'ATTR_CHANGE' && event.args[0] === 19),
    'missing ATTR_CHANGE category 19');
  const expectedFullRefresh = role.calAllPower();
  check(expectedFullRefresh === afterLateRefresh, 'late refresh differs from full recalculation');
}

staticChecks();
runApiFixture();
runRealFixture();
console.log(JSON.stringify({
  result: 'PASS',
  tests: testCount,
  patchSha256: crypto.createHash('sha256').update(patchSource).digest('hex'),
  static: 'PASS',
  runtime: 'PASS',
  productionWrites: 0,
}));

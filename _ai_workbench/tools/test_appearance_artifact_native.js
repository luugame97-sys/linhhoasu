'use strict';

// Native contract test for the read-only artifact preview. The test extracts
// the artifact model/list methods from the shipped game bundle and runs them
// with the server's real table dumps. It then loads the preview addon around
// those native methods to prove that a synthetic negative uid is display-only
// while an owned uid still reaches the native RPC path.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const BUNDLE_PATH = path.join(ROOT, 'linhhoasu', 'webgame', 'game', 'js', 'main.min_drop100.js');
const ADDON_PATH = path.join(ROOT, 'linhhoasu', 'webgame', 'game', 'js', 'lhs-appearance-preview-v1.js');
const DUMP = path.join(ROOT, 'linhhoasu', 'lhs', 'newServer', 'scripts', '_tables_dump');

function readTable(name) {
  const parsed = JSON.parse(fs.readFileSync(path.join(DUMP, `${name}.json`), 'utf8'));
  return parsed.data || parsed;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// Extract one minified `x.method=function(...) {...}` assignment without
// evaluating the complete 7MB bundle. A balanced scanner is used instead of
// a regex because native method bodies contain nested callbacks and literals.
function extractFunction(source, assignment) {
  const start = source.indexOf(assignment);
  assert.ok(start >= 0, `missing native assignment: ${assignment}`);
  const functionStart = source.indexOf('function', start + assignment.length - 8);
  assert.strictEqual(source[functionStart - 1], '=', `${assignment} is not a function assignment`);
  const open = source.indexOf('{', functionStart);
  assert.ok(open > functionStart, `missing function body: ${assignment}`);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(functionStart, i + 1);
    }
  }
  throw new Error(`unterminated native function: ${assignment}`);
}

function compileNative(source, assignment, deps) {
  const expression = extractFunction(source, assignment);
  const names = Object.keys(deps || {});
  const values = names.map((name) => deps[name]);
  return Function(...names, `return (${expression});`)(...values); // eslint-disable-line no-new-func
}

function loadNative(source, config) {
  const ec = {
    copyDataHandler: clone,
    getObjectLength: (value) => Object.keys(value || {}).length,
  };
  const Y = { Config: config };
  const U = { ArrayCollection: function ArrayCollection(sourceRows) { this.source = sourceRows || []; } };
  const native = {
    getArtifactDataByUId: compileNative(source, 'C.getArtifactDataByUId=function', { Y, ec }),
    getArtifactTypeById: compileNative(source, 'C.getArtifactTypeById=function', { Y, ec }),
    getArtifactQualityById: compileNative(source, 'C.getArtifactQualityById=function', { Y, ec }),
    sortArtifactList: compileNative(source, 'C.sortArtifactList=function', { Y, ec }),
    getArtifactInfo: compileNative(source, 'C.getArtifactInfo=function', { Y, ec }),
    getCurEquipUidMap: compileNative(source, 'C.getCurEquipUidMap=function', { Y, ec }),
    getMainArtifactData: compileNative(source, 'C.getMainArtifactData=function', { Y, ec }),
    getSecondArtifactData: compileNative(source, 'C.getSecondArtifactData=function', { Y, ec }),
    getArtifactAttrListByData: compileNative(source, 'C.getArtifactAttrListByData=function', { Y, ec }),
    getArtifactAttrListByUid: compileNative(source, 'C.getArtifactAttrListByUid=function', { Y, ec }),
    sendArtifactEquip: compileNative(source, 'C.sendArtifactEquip=function', { Y, ec }),
    sendArtifactUpgrade: compileNative(source, 'C.sendArtifactUpgrade=function', { Y, ec }),
    sendArtifactLock: compileNative(source, 'C.sendArtifactLock=function', { Y, ec }),
    updateArtifactList: compileNative(source, 'a.updateArtifactList=function', { Y, U, ec }),
    updateArtifactInfo: compileNative(source, 'a.updateArtifactInfo=function', {
      Y,
      U,
      B: {
        setGaryEnabled: () => {},
        strformatByLangId: (_id, value) => value,
        setIncludeInLayoutVisible: (control, visible) => { if (control) control.visible = !!visible; },
      },
      oA: { checkforgeName: () => '' },
      O: { floor: Math.floor },
      T: { serverTimeMilli: Date.now() },
      PV: { checkForgeState: () => false },
      qo: { Prop: 1 },
      ec,
    }),
  };
  return { native, Y, ec };
}

function pickAttrType(row, forge) {
  const attrs = Array.isArray(row.initAttrs) ? row.initAttrs : [];
  for (const attr of attrs) {
    const id = Number(attr && attr.id !== undefined ? attr.id : attr);
    const byAttr = forge[String(id)] || forge[id];
    const byQuality = byAttr && (byAttr[String(row.quality)] || byAttr[row.quality]);
    if (byQuality && (byQuality[String(row.type)] || byQuality[row.type])) return id;
  }
  for (const id of Object.keys(forge)) {
    const byQuality = forge[id] && (forge[id][String(row.quality)] || forge[id][row.quality]);
    if (byQuality && (byQuality[String(row.type)] || byQuality[row.type])) return Number(id);
  }
  return 0;
}

function previewData(row, forge) {
  return {
    uid: -Number(row.id),
    id: Number(row.id),
    attr: { type: pickAttrType(row, forge), value: 0, level: 1 },
    extraAttrs: [],
    skillGroup: 0,
    skillLv: 0,
    quenchLv: 0,
    eSkillGroup: 0,
    element: 0,
    count: 0,
    forgeTime: 0,
    lock: true,
    isPreview: true,
  };
}

function runNativeSignatureChecks(bundle) {
  const required = [
    'a.updateArtifactList=function',
    'a.updateArtifactInfo=function',
    'a.onArtifactItemList=function',
    'a.onEquip=function',
    'a.onUpgrade=function',
    'a.onDecompose=function',
    'a.onLock=function',
  ];
  for (const signature of required) assert.ok(bundle.includes(signature), `missing native artifact method: ${signature}`);

  const listIndex = bundle.indexOf('a.updateArtifactList=function');
  const upgradePanelRegistration = bundle.indexOf('t(Ii=_ft,"ArtifactUpgradePanel")');
  const mainWinRegistration = bundle.indexOf('t(cE=zZt,"ArtifactMainWin")');
  assert.ok(listIndex > 0, 'native artifact list method not found');
  assert.ok(upgradePanelRegistration > 0, 'ArtifactUpgradePanel registration not found');
  assert.ok(mainWinRegistration > upgradePanelRegistration, 'ArtifactMainWin registration ordering changed');
  assert.ok(listIndex < mainWinRegistration, 'artifact list method no longer belongs to upgrade panel block');
}

function runConfigChecks(config) {
  const artifacts = Object.values(config.ArtifactConfig);
  const forge = config.ArtifactForgeSkillConfig;
  assert.strictEqual(artifacts.length, 54, `expected 54 artifact rows, got ${artifacts.length}`);
  const ids = new Set();
  const typeCounts = { 1: 0, 2: 0 };
  for (const row of artifacts) {
    assert.ok(row && Number(row.id) > 0, 'artifact id must be positive');
    assert.ok(!ids.has(Number(row.id)), `duplicate artifact id ${row.id}`);
    ids.add(Number(row.id));
    assert.ok(row.type === 1 || row.type === 2, `unsupported artifact type ${row.type} for ${row.id}`);
    assert.ok([4, 6, 7].includes(Number(row.quality)), `unexpected artifact quality ${row.quality} for ${row.id}`);
    assert.ok(pickAttrType(row, forge) > 0, `no ForgeSkillConfig attr mapping for ${row.id}`);
    typeCounts[row.type] += 1;
  }
  assert.strictEqual(typeCounts[1], 27, `type 1 count changed: ${typeCounts[1]}`);
  assert.strictEqual(typeCounts[2], 27, `type 2 count changed: ${typeCounts[2]}`);
  return { artifacts, typeCounts };
}

function runNativeModelChecks(native, config, artifacts) {
  const model = {
    artifactInfo: { artifactMap: { 1: [], 2: [] }, equipMap: {} },
  };
  Object.keys(native).forEach((name) => {
    if (name !== 'updateArtifactList') model[name] = native[name];
  });
  model.checkArtifactSkillIsFit = () => false;
  model.checkIsNew = () => false;
  model.getQuenchAttr = () => ({});
  model.checkHaveNewArtfactByType = () => false;
  model.checkIsForgeLevel = () => false;
  model.checkArtifactCanForge = () => false;
  model.checkIsArtifactMaxLevel = () => false;
  model.Rpc = () => {};

  // Empty server state is handled by the actual model methods, not a fixture
  // reimplementation. Native main/secondary getters are intentionally not
  // null-safe; the addon wraps those getters for an unopened panel.
  assert.deepStrictEqual(model.getArtifactInfo(), { 1: [], 2: [] }, 'native empty artifact map changed');
  assert.deepStrictEqual(model.getCurEquipUidMap(), {}, 'native empty equip map changed');
  assert.strictEqual(model.getMainArtifactData(), null, 'native main empty slot should be null');
  assert.strictEqual(model.getSecondArtifactData(), null, 'native secondary empty slot should be null');
  model.artifactInfo = null;
  assert.deepStrictEqual(model.getArtifactInfo(), {}, 'native null artifactInfo should produce empty info');
  assert.deepStrictEqual(model.getCurEquipUidMap(), {}, 'native null artifactInfo should produce empty equip map');
  assert.throws(() => model.getMainArtifactData(), TypeError, 'native main getter null-state behavior changed unexpectedly');
  assert.throws(() => model.getSecondArtifactData(), TypeError, 'native secondary getter null-state behavior changed unexpectedly');

  const owned = {
    uid: 88001,
    id: Number(artifacts[0].id),
    attr: { type: pickAttrType(artifacts[0], config.ArtifactForgeSkillConfig), value: 250, level: 2 },
    extraAttrs: [], skillGroup: 0, skillLv: 0, quenchLv: 0, eSkillGroup: 0,
    element: 0, count: 0, forgeTime: 0, lock: false,
  };
  const secondRow = artifacts.find((row) => row.type === 2);
  const second = {
    uid: 88002,
    id: Number(secondRow.id),
    attr: { type: pickAttrType(secondRow, config.ArtifactForgeSkillConfig), value: 120, level: 1 },
    extraAttrs: [], skillGroup: 0, skillLv: 0, quenchLv: 0, eSkillGroup: 0,
    element: 0, count: 0, forgeTime: 0, lock: true,
  };
  model.artifactInfo = { artifactMap: { 1: [owned], 2: [second] }, equipMap: { 1: owned.uid, 2: second.uid } };
  const info = model.getArtifactInfo();
  assert.strictEqual(info[1][0].uid, owned.uid, 'native getArtifactInfo lost owned artifact');
  assert.notStrictEqual(info[1][0], owned, 'native getArtifactInfo did not clone rows');
  info[1][0].attr.level = 99;
  assert.strictEqual(owned.attr.level, 2, 'native getArtifactInfo leaked mutable row');
  assert.strictEqual(model.getArtifactDataByUId(owned.uid).uid, owned.uid, 'native owned uid lookup failed');
  assert.strictEqual(model.getArtifactDataByUId(-artifacts[0].id), null, 'native model unexpectedly accepted synthetic uid');
  assert.strictEqual(model.getMainArtifactData().uid, owned.uid, 'native main equipped lookup failed');
  assert.strictEqual(model.getSecondArtifactData().uid, second.uid, 'native secondary equipped lookup failed');

  // Run the native attribute calculator against every real artifact row. This
  // catches missing quality/type/ForgeSkill/ForgeAttrs combinations used by
  // preview rows.
  let attrRows = 0;
  for (const row of artifacts) {
    const attrs = model.getArtifactAttrListByData(previewData(row, config.ArtifactForgeSkillConfig));
    assert.ok(Array.isArray(attrs), `native attr list is not an array for ${row.id}`);
    attrs.forEach((attr) => {
      assert.ok(Number(attr.id) > 0, `native attr id invalid for ${row.id}`);
      assert.ok(Number.isFinite(Number(attr.val)), `native attr value invalid for ${row.id}`);
    });
    attrRows += attrs.length;
  }
  assert.ok(attrRows > 0, 'native attribute calculator produced no forge attributes for all rows');
  return { model, attrRows };
}

function Collection(source) {
  this.source = Array.isArray(source) ? source.slice() : [];
}
Collection.prototype.replaceAll = function replaceAll(rows) { this.source = (rows || []).slice(); };
Collection.prototype.validateNow = function validateNow() {};

function runAddonNativeChecks(native, config, model, artifacts) {
  const calls = [];
  const Y = { Config: config, ArtifactModel: model, UnlockSystem: { isSystemUnlock: (id) => Number(id) === 209 || Number(id) === 210 } };
  const ArtifactUpgradePanel = function ArtifactUpgradePanel() {};
  ArtifactUpgradePanel.prototype.updateArtifactList = native.updateArtifactList;
  ArtifactUpgradePanel.prototype.updateArtifactInfo = native.updateArtifactInfo;
  ArtifactUpgradePanel.prototype.updateSkillInfo = function updateSkillInfo() {};
  ArtifactUpgradePanel.prototype.onArtifactItemList = function onArtifactItemList() {};
  ArtifactUpgradePanel.prototype.onClickArtifactItem = function onClickArtifactItem() { return true; };
  ArtifactUpgradePanel.prototype.updateViewUI = function updateViewUI() {};
  ArtifactUpgradePanel.prototype.updateCurUid = function updateCurUid() {};
  ArtifactUpgradePanel.prototype.onEquip = function onEquip() { return model.sendArtifactEquip(this._curUId); };
  ArtifactUpgradePanel.prototype.onUpgrade = function onUpgrade() { return model.sendArtifactUpgrade(this._curUId, 0); };
  ArtifactUpgradePanel.prototype.onLock = function onLock() { return model.sendArtifactLock(this._curUId, 1); };

  model.Rpc = (code, payload) => calls.push({ code, payload: clone(payload) });
  const context = {
    console: { info: () => {}, warn: () => {}, error: () => {} },
    setTimeout: () => {},
    GlobalManager: Y,
    ArtifactModel: model,
    ArtifactUpgradePanel,
    window: null,
    UserTips: { ins: () => ({ showTips: () => {} }) },
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(ADDON_PATH, 'utf8'), context, { filename: ADDON_PATH });
  assert.ok(context.LhsAppearancePreviewV1 && context.LhsAppearancePreviewV1.installed, 'addon did not install native artifact wrappers');

  const ownedId = Number(artifacts[0].id);
  const ownedUid = model.artifactInfo.artifactMap[1][0].uid;
  const panel = new ArtifactUpgradePanel();
  panel._curType = 1;
  panel._curUId = ownedUid;
  panel.itemList = { dataProvider: new Collection(), validateNow: () => {} };
  panel.artifactShowComp = {};
  panel.equipBtn = {};
  panel.forgePlayerLab = {};
  panel.auctionLimitGroup = {};
  panel.auctionLimitLab = { SetEndTime: () => {}, SetCallbackFunc: () => {} };
  panel.mainAttr = {};
  panel.elementAttr = {};
  panel.artfactAttrList = { dataProvider: null, validateNow: () => {} };
  panel.item0 = {};
  panel.item1 = { setKong: () => {}, setFit: () => {}, setLock: () => {} };
  panel.link = {};
  panel.tip2Group = {};
  panel.tip2 = { SetEndTime: () => {}, SetCallbackFunc: () => {} };
  panel.labTip3 = {};
  panel.quenchBtn = {};
  panel.upgradeBtn = {};
  panel.upCost = {};
  panel.rateGroup = {};
  panel.stabilizeGroup = {};
  panel.stabilize = { selected: false };
  panel.costList = { dataProvider: null, validateNow: () => {} };
  panel.elementResetBtn = {};
  panel.rate = {};
  panel.setForgeState = () => {};
  panel.updateArtifactList();
  const rows = panel.itemList.dataProvider.source;
  assert.ok(rows.some((row) => row.uid === ownedUid), 'native list lost owned artifact row');
  assert.strictEqual(rows.filter((row) => row.isPreview).length, 26, 'type1 preview catalog should contain remaining 26 rows');

  const locked = rows.find((row) => row.isPreview);
  assert.ok(locked && locked.uid < 0, 'native list did not append a negative-uid preview row');
  const before = JSON.stringify(model.artifactInfo);
  panel._curUId = locked.uid;
  assert.doesNotThrow(() => panel.updateArtifactInfo(), 'native detail renderer rejected a locked preview row');
  assert.strictEqual(panel.onEquip(), false, 'locked preview equip was not rejected');
  assert.strictEqual(panel.onUpgrade(), false, 'locked preview upgrade was not rejected');
  assert.strictEqual(panel.onLock(), false, 'locked preview lock was not rejected');
  assert.strictEqual(calls.length, 0, 'locked preview issued native RPC');
  assert.strictEqual(JSON.stringify(model.artifactInfo), before, 'locked preview mutated native artifact state');
  const resolvedPreview = model.getArtifactDataByUId(locked.uid);
  assert.ok(resolvedPreview && resolvedPreview.isPreview, 'addon lookup did not resolve negative uid preview');
  assert.strictEqual(resolvedPreview.id, Number(locked.id), 'negative uid resolved to wrong preview id');

  panel._curUId = ownedUid;
  assert.strictEqual(panel.onEquip(), undefined, 'owned equip native return contract changed');
  assert.ok(calls.some((call) => call.code === 3502 && call.payload.uid === ownedUid), 'owned equip did not reach native RPC');
  const callCount = calls.length;
  assert.strictEqual(panel.onUpgrade(), undefined, 'owned upgrade native return contract changed');
  assert.strictEqual(panel.onLock(), undefined, 'owned lock native return contract changed');
  assert.strictEqual(calls.length, callCount + 2, 'owned native actions did not reach RPC');
  return { rows: rows.length, rpcCalls: calls.length };
}

const bundle = fs.readFileSync(BUNDLE_PATH, 'utf8');
const config = {
  ArtifactConfig: readTable('ArtifactConfig'),
  ArtifactForgeSkillConfig: readTable('ArtifactForgeSkillConfig'),
  ArtifactForgeAttrsConfig: readTable('ArtifactForgeAttrsConfig'),
  ArtifactBaseConfig: readTable('ArtifactBaseConfig'),
  ArtifactConsumeConfig: readTable('ArtifactConsumeConfig'),
  ArtifactQuenchConfig: readTable('ArtifactQuenchConfig'),
  ArtifactElementSkillConfig: readTable('ArtifactElementSkillConfig'),
};
runNativeSignatureChecks(bundle);
const { artifacts, typeCounts } = runConfigChecks(config);
const { native, Y } = loadNative(bundle, config);
const { model, attrRows } = runNativeModelChecks(native, config, artifacts);
Y.ArtifactModel = model;
const addonResult = runAddonNativeChecks(native, config, model, artifacts);
console.log(`appearance artifact native contract PASS: ${artifacts.length} rows (type1=${typeCounts[1]}, type2=${typeCounts[2]}), nativeAttrs=${attrRows}, listRows=${addonResult.rows}, locked no-RPC + owned RPC PASS (${addonResult.rpcCalls} calls)`);

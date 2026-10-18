'use strict';

// Native-contract/fixture QA for the read-only appearance preview addon.
// This does not start a browser, login, player, or RPC connection.  It checks
// the shipped native bundle for the signatures the addon relies on, then runs
// the addon against native-shaped Mount/Valhalla views to prove that locked
// rows only open detail and that owned rows retain their original actions.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const ADDON = path.join(ROOT, 'linhhoasu', 'webgame', 'game', 'js', 'lhs-appearance-preview-v1.js');
const BUNDLE = path.join(ROOT, 'linhhoasu', 'webgame', 'game', 'js', 'main.min_drop100.js');
const DUMP = path.join(ROOT, 'linhhoasu', 'lhs', 'newServer', 'scripts', '_tables_dump');

function readTable(name) {
  const parsed = JSON.parse(fs.readFileSync(path.join(DUMP, `${name}.json`), 'utf8'));
  return parsed.data || parsed;
}

function count(text, needle) {
  let at = 0;
  let n = 0;
  while ((at = text.indexOf(needle, at)) >= 0) {
    n += 1;
    at += needle.length;
  }
  return n;
}

function assertNativeBundleContract(bundle) {
  // Mount entrance sends an item row to EquipSkinWin's native callback.  The
  // addon replaces this UI with an explicit catalog, so this shape must not
  // silently change to a different argument contract.
  assert.ok(bundle.includes('P.ins().open($9,e,function(t){Y.MountModel.SendEquipSkin(t.id)})'),
    'native mount entrance callback contract changed');
  assert.ok(bundle.includes('this.heroId=t[0],this.idList=t[1]||[]'),
    'MountHandbookDetailView.OnOpen(id,idList) contract missing');

  // EquipSkinWin creates and disposes roleSpine, and its item tap reads
  // event.itemRenderer.data.  The addon must preserve these native shapes.
  const equip = bundle.indexOf('t($9=I7e,"EquipSkinWin")');
  assert.ok(equip > 0, 'EquipSkinWin registration missing');
  const equipBlock = bundle.slice(Math.max(0, equip - 6500), equip + 300);
  assert.ok(equipBlock.includes('_.onTapItem=function(t){t=t.itemRenderer;this.selectId=t.data.id'),
    'EquipSkinWin.onTapItem native row shape changed');
  assert.ok(equipBlock.includes('_.OnClose=function(){this.roleSpine.Dispose()'),
    'EquipSkinWin.OnClose roleSpine disposal contract changed');

  // Native cells use the quality helper rather than a hard-coded frame name.
  assert.ok(count(bundle, 'getItemQualityFrameBg') > 0,
    'native quality-frame helper is absent');

  // Valhalla handbook list is filtered by the native gate, while the addon
  // temporarily supplies the complete preview catalog (excluding showType 0).
  const valid = bundle.indexOf('m.GetValidListId=function(){var t,e=[],i=Y.Config.ValhallaConfig');
  assert.ok(valid > 0, 'ValhallaModel.GetValidListId native method missing');
  const validBlock = bundle.slice(valid, valid + 1100);
  assert.ok(validBlock.includes('0==a.showType'), 'Valhalla showType=0 gate missing');
  assert.ok(validBlock.includes('2==a.showType&&!Y.ValhallaModel.CheckHeroUnlock(a.id)'),
    'Valhalla locked showType=2 gate missing');

  const tap = bundle.indexOf('b.onTapItem=function(t){var t=t.itemRenderer,e=Y.ValhallaModel.CheckHeroUnlock(t.data)');
  assert.ok(tap > 0, 'ValhallaHandBookItem.onTapItem native method missing');
  const tapBlock = bundle.slice(tap, tap + 480);
  assert.ok(tapBlock.includes('sendAtlasReward(-1)'), 'Valhalla claim callback contract missing');
  assert.ok(tapBlock.includes('P.ins().open(Sst,t.data)'), 'Valhalla detail callback contract missing');

  // Another native detail view uses the same title; anchor this assertion to
  // the Valhalla-specific argument code instead of a minifier-local class id.
  const detail = bundle.indexOf('var i=t[0]||-1');
  assert.ok(detail > 0, 'ValhallaHandBookDetailView.OnOpen native method missing');
  const detailBlock = bundle.slice(detail - 260, detail + 950);
  assert.ok(detailBlock.includes('var i=t[0]||-1'), 'Valhalla detail id argument contract changed');
  assert.ok(detailBlock.includes('this.isShowCard=null==t[1]||t[1]'), 'Valhalla detail show-card argument contract changed');
  assert.ok(detailBlock.includes('a=1==t[2]'), 'Valhalla detail single-id argument contract changed');
}

function assertConfigIntegrity() {
  const swords = readTable('SwordConfig');
  const assets = readTable('AssetsConfig');
  const valhalla = readTable('ValhallaConfig');
  const swordRows = Object.values(swords);
  const valhallaRows = Object.values(valhalla);

  assert.ok(swordRows.length > 0, 'SwordConfig is empty');
  for (const row of swordRows) {
    assert.ok(row && Number(row.id) > 0, 'SwordConfig contains a non-positive id');
    assert.ok(assets[row.id] || assets[String(row.id)], `SwordConfig ${row.id} has no AssetsConfig row`);
  }

  const previewValhalla = valhallaRows.filter((row) => row && Number(row.showType) !== 0);
  assert.ok(previewValhalla.length > 0, 'ValhallaConfig has no previewable rows');
  for (const row of previewValhalla) {
    assert.ok(Number(row.id) > 0, 'Valhalla preview id must be positive');
  }
  return { swordCount: swordRows.length, valhallaCount: valhallaRows.length, previewValhallaCount: previewValhalla.length };
}

class Collection {
  constructor(rows) { this.source = (rows || []).slice(); }
  get length() { return this.source.length; }
  getItemAt(index) { return this.source[index]; }
  replaceAll(rows) { this.source = (rows || []).slice(); }
  addAll(rows) { this.source.push(...(rows || [])); }
}

function control(initial) {
  return Object.assign({
    visible: true,
    includeInLayout: true,
    enabled: true,
    touchEnabled: true,
    label: '',
    text: '',
    labelDisplay: { text: '' },
  }, initial || {});
}

function hostArray(value) {
  return Array.prototype.slice.call(value || []);
}

function runAddonFixture() {
  const calls = {
    mountEquip: 0,
    mountDetailOpens: [],
    mountNativeOpen: 0,
    mountNativeConfirm: 0,
    mountNativeTap: 0,
    mountNativeClose: 0,
    mountRoleDispose: 0,
    mountCommonWinAdded: 0,
    mountClose: 0,
    valhallaClaim: 0,
    valhallaNativeDetailOpens: 0,
    valhallaDetailOpens: [],
    valhallaNativeList: [],
    valhallaNativeDetail: [],
    qualityFrames: [],
  };

  const mountState = {
    skinId: 9001,
    unlocked: { 9001: true, 9002: false },
  };
  const valhallaState = {
    unlocked: { 601: true, 602: false, 604: false },
    rewarded: {},
  };

  const Config = {
    SwordConfig: {
      9001: { id: 9001, quality: 2 },
      9002: { id: 9002, quality: 3 },
    },
    AssetsConfig: {
      9001: { id: 9001, icon: 'mount_9001', quality: 2 },
      9002: { id: 9002, icon: 'mount_9002', quality: 3 },
    },
    QualityConfig: {
      2: { qualityBg: 4 },
      3: { qualityBg: 6 },
    },
    ValhallaConfig: {
      601: { id: 601, quality: 5, showType: 1 },
      602: { id: 602, quality: 5, showType: 2 },
      603: { id: 603, quality: 5, showType: 0 },
      604: { id: 604, quality: 6, showType: 3 },
    },
  };
  const MountModel = {
    getMountSkinId: () => mountState.skinId,
    getUnlockedMap: () => mountState.unlocked,
    SendEquipSkin: (id) => {
      calls.mountEquip += 1;
      mountState.skinId = Number(id);
      return true;
    },
  };
  const ValhallaModel = {
    // This is the native gate: the addon temporarily replaces only this
    // method while rendering the catalog/detail, then restores it.
    GetValidListId: () => Object.values(Config.ValhallaConfig)
      .filter((row) => Number(row.showType) !== 0 && (Number(row.showType) !== 2 || !!valhallaState.unlocked[row.id]))
      .map((row) => row.id),
    CheckHeroUnlock: (id) => !!valhallaState.unlocked[Number(id)],
    CheckHeroRewarded: (id) => !!valhallaState.rewarded[Number(id)],
    sendAtlasReward: () => { calls.valhallaClaim += 1; },
  };

  function MountEntranceView() {}
  MountEntranceView.prototype.onClickSkinBtn = function () { throw new Error('native mount entrance should be replaced'); };

  function EquipSkinWin() {
    // Native skin uses `commonWin` (capital W).  Keeping only this spelling in
    // the fixture catches a preview wrapper that silently uses `commonwin`.
    this.commonWin = { OnAdded: () => { calls.mountCommonWinAdded += 1; }, Title: '' };
    this.confirm = control({ visible: true, label: 'native-confirm', labelDisplay: { text: 'native-confirm' } });
    this.labLock = control({ visible: false, text: 'native-lock' });
    this.roleSpine = {
      visible: true,
      Dispose: () => { calls.mountRoleDispose += 1; },
    };
    this.skinList = {
      scrollV: 7,
      dataProvider: new Collection([]),
      addEventListener: (event, handler, context) => {
        this.skinTapHandler = handler;
        this.skinTapContext = context;
      },
      dataProviderRefreshed: () => {},
      validateNow: () => {},
    };
    this.AddClick = () => {};
    this.CloseSelf = () => { calls.mountClose += 1; };
  }
  EquipSkinWin.prototype.OnOpen = function () { calls.mountNativeOpen += 1; this.nativeOpenRoleVisible = this.roleSpine.visible; };
  EquipSkinWin.prototype.updateUI = function () { calls.mountNativeOpen += 1; };
  EquipSkinWin.prototype.onClickConfirm = function () { calls.mountNativeConfirm += 1; };
  EquipSkinWin.prototype.onTapItem = function () { calls.mountNativeTap += 1; };
  EquipSkinWin.prototype.OnClose = function () { calls.mountNativeClose += 1; this.roleSpine.Dispose(); };

  function EquipSkinCell() {
    this.isSelected = { visible: false };
    this.imgIcon = {};
    this.imgBg = {};
    this.validateNow = () => {};
  }
  EquipSkinCell.prototype.dataChanged = function () {};

  function MountHandbookDetailView() {}
  function ValhallaHandBookView() {}
  ValhallaHandBookView.prototype.updateUI = function () {
    calls.valhallaNativeList = ValhallaModel.GetValidListId();
    this.rows = calls.valhallaNativeList.slice();
  };
  function ValhallaHandBookDetailView() {}
  ValhallaHandBookDetailView.prototype.OnOpen = function (id) {
    calls.valhallaNativeDetail = ValhallaModel.GetValidListId();
    this.openedId = Number(id);
    this.ids = calls.valhallaNativeDetail.slice();
  };
  function ValhallaHandBookItem() {}
  ValhallaHandBookItem.prototype.onTapItem = function (event) {
    const row = event && event.itemRenderer && event.itemRenderer.data;
    const id = Number(row);
    if (ValhallaModel.CheckHeroUnlock(id) && !ValhallaModel.CheckHeroRewarded(id)) calls.valhallaClaim += 1;
    else if (!ValhallaModel.CheckHeroUnlock(id)) throw new Error('locked Valhalla row reached native claim handler');
    else calls.valhallaNativeDetailOpens += 1;
  };

  const context = {
    console: { info: () => {}, warn: () => {}, error: () => {} },
    setTimeout: () => {},
    Number, Object, Array, JSON, Math, String, Boolean, isFinite, parseInt, parseFloat,
    eui: { ArrayCollection: Collection, ItemTapEvent: { ITEM_TAP: 'itemTap' } },
    GlobalManager: { Config, MountModel, ValhallaModel },
    MountModel,
    ValhallaModel,
    MountEntranceView,
    MountHandbookDetailView,
    EquipSkinWin,
    EquipSkinCell,
    ValhallaHandBookView,
    ValhallaHandBookDetailView,
    ValhallaHandBookItem,
    QualityUtil: {
      getItemQualityFrameBg: (qualityBg) => {
        calls.qualityFrames.push(Number(qualityBg));
        return `quality-frame-${qualityBg}`;
      },
    },
    ViewManager: {
      ins: () => ({
        open: (Ctor, ...args) => {
          if (Ctor === MountHandbookDetailView) calls.mountDetailOpens.push({ Ctor, args });
          if (Ctor === ValhallaHandBookDetailView) calls.valhallaDetailOpens.push({ Ctor, args });
          return null;
        },
      }),
    },
    UserTips: { ins: () => ({ showTips: () => {} }) },
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(ADDON, 'utf8'), context, { filename: ADDON });
  assert.ok(context.LhsAppearancePreviewV1 && context.LhsAppearancePreviewV1.installed,
    'appearance preview addon did not install in Mount/Valhalla fixture');

  // Mount entrance must open the addon catalog, not invoke native equip.
  const entrance = new MountEntranceView();
  entrance.onClickSkinBtn();
  assert.strictEqual(calls.mountEquip, 0, 'mount entrance preview issued equip RPC');

  const win = new EquipSkinWin();
  win.OnOpen({ __lhsMountCatalog: true });
  assert.strictEqual(calls.mountNativeOpen, 0, 'custom Mount catalog incorrectly called native OnOpen');
  assert.strictEqual(calls.mountCommonWinAdded, 1, 'custom Mount catalog skipped native commonWin.OnAdded');
  assert.strictEqual(win.commonWin.Title, 'Ngoại hình thú cưỡi', 'custom Mount catalog did not set commonWin title');
  assert.deepStrictEqual(hostArray(win.dataList).map((row) => row.id), [-1, 0, 9001, 9002],
    'mount catalog did not include reset/base/all configured skins');
  const locked = win.dataList.find((row) => row.id === 9002);
  const owned = win.dataList.find((row) => row.id === 9001);
  assert.ok(locked && locked.state === 'lock', 'locked mount row missing lock state');
  assert.ok(owned && owned.state !== 'lock', 'owned mount row became locked');

  const mountBefore = JSON.stringify(mountState);
  win.onTapItem({ itemRenderer: { data: locked } });
  assert.strictEqual(calls.mountEquip, 0, 'locked mount tap issued equip RPC');
  assert.strictEqual(JSON.stringify(mountState), mountBefore, 'locked mount tap mutated mount state');
  assert.strictEqual(calls.mountDetailOpens.length, 1, 'locked mount tap did not open detail view');
  assert.strictEqual(calls.mountDetailOpens[0].args[0], 9002, 'mount detail received wrong id');
  assert.deepStrictEqual(hostArray(calls.mountDetailOpens[0].args[1]), [9002],
    'mount detail did not receive the same-quality configured id list');

  win.onClickConfirm();
  assert.strictEqual(calls.mountEquip, 0, 'locked mount confirm issued equip RPC');
  assert.strictEqual(calls.mountDetailOpens.length, 2, 'locked mount confirm did not remain read-only');

  win.onTapItem({ itemRenderer: { data: owned } });
  win.onClickConfirm();
  assert.strictEqual(calls.mountEquip, 1, 'owned mount confirm did not retain equip action');
  assert.strictEqual(calls.mountClose, 1, 'owned mount confirm did not close popup');
  assert.strictEqual(mountState.skinId, 9001, 'owned mount selection changed unexpectedly');

  // Direct model guard: locked IDs are rejected, owned IDs continue to the
  // original native method.
  const beforeLockedRpc = calls.mountEquip;
  assert.strictEqual(MountModel.SendEquipSkin(9002), false, 'locked mount model call was accepted');
  assert.strictEqual(calls.mountEquip, beforeLockedRpc, 'locked mount model call reached native RPC');
  assert.strictEqual(MountModel.SendEquipSkin(9001), true, 'owned mount model call was blocked');
  assert.strictEqual(calls.mountEquip, beforeLockedRpc + 1, 'owned mount model call did not reach native RPC');

  // Native OnClose disposes roleSpine.  The addon must suppress that dispose
  // only for the custom catalog so the same popup can be reopened safely.
  win.OnClose();
  assert.strictEqual(calls.mountRoleDispose, 0, 'custom mount close disposed reusable roleSpine');
  assert.strictEqual(win.__lhsMountCatalog, false, 'custom mount marker was not cleared on close');
  win.OnOpen({ __lhsMountCatalog: false });
  assert.strictEqual(calls.mountNativeOpen, 1, 'owned/native popup reopen did not call native OnOpen');
  assert.strictEqual(win.nativeOpenRoleVisible, true, 'roleSpine visibility was not restored before native reopen');

  // Quality frame must be resolved through the native helper/config path.
  const cell = new EquipSkinCell();
  cell.data = locked;
  cell.dataChanged();
  assert.strictEqual(cell.imgIcon.source, 'mount_9002', 'mount icon did not use AssetsConfig');
  assert.strictEqual(cell.imgBg.source, 'quality-frame-6', 'mount frame did not use QualityUtil/config');
  assert.deepStrictEqual(calls.qualityFrames, [6], 'quality frame helper was not called exactly once');

  // Valhalla list/detail wrappers must expose all non-hidden config rows only
  // for the duration of native rendering, and then restore the native gate.
  const valhallaView = new ValhallaHandBookView();
  valhallaView.updateUI();
  assert.deepStrictEqual(hostArray(calls.valhallaNativeList), [601, 602, 604],
    'Valhalla preview list did not include all non-showType0 config rows');
  assert.deepStrictEqual(ValhallaModel.GetValidListId(), [601, 604],
    'Valhalla native gate was not restored after list render');

  const valhallaBefore = JSON.stringify(valhallaState);
  const item = new ValhallaHandBookItem();
  item.onTapItem({ itemRenderer: { data: 602 } });
  assert.strictEqual(calls.valhallaClaim, 0, 'locked Valhalla row issued claim reward');
  assert.strictEqual(JSON.stringify(valhallaState), valhallaBefore, 'locked Valhalla row mutated state');
  assert.strictEqual(calls.valhallaDetailOpens.length, 1, 'locked Valhalla row did not open detail');
  assert.deepStrictEqual(calls.valhallaDetailOpens[0].args, [602], 'Valhalla detail received wrong id/extra mutation args');

  const detailView = new ValhallaHandBookDetailView();
  detailView.OnOpen(...calls.valhallaDetailOpens[0].args);
  assert.deepStrictEqual(hostArray(detailView.ids), [601, 602, 604],
    'Valhalla detail did not receive temporary complete catalog');
  assert.deepStrictEqual(ValhallaModel.GetValidListId(), [601, 604],
    'Valhalla native gate was not restored after detail render');

  item.onTapItem({ itemRenderer: { data: 601 } });
  assert.strictEqual(calls.valhallaClaim, 1, 'owned Valhalla row no longer reaches native claim action');
  valhallaState.rewarded[601] = true;
  item.onTapItem({ itemRenderer: { data: 601 } });
  assert.strictEqual(calls.valhallaClaim, 1, 'rewarded Valhalla row claimed atlas reward twice');
  assert.strictEqual(calls.valhallaNativeDetailOpens, 1, 'rewarded Valhalla row did not retain native detail action');

  return calls;
}

const bundle = fs.readFileSync(BUNDLE, 'utf8');
assertNativeBundleContract(bundle);
const config = assertConfigIntegrity();
const calls = runAddonFixture();
console.log(`appearance Mount/Valhalla native contract PASS: SwordConfig=${config.swordCount}, Valhalla=${config.valhallaCount} (preview=${config.previewValhallaCount}); locked no-RPC, owned preserve, QualityUtil frame, popup reopen, temporary GetValidListId catalog PASS`);

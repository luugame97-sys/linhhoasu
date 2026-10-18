'use strict';

// Static contract fixture for the read-only appearance catalog.  It runs the
// addon against tiny native-shaped objects; it never opens a browser, sends a
// socket message, or writes a player record.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const ADDON = path.join(ROOT, 'linhhoasu', 'webgame', 'game', 'js', 'lhs-appearance-preview-v1.js');

function Collection(source) {
  this.source = Array.isArray(source) ? source.slice() : [];
}
Object.defineProperty(Collection.prototype, 'length', { get: function () { return this.source.length; } });
Collection.prototype.getItemAt = function (index) { return this.source[index]; };
Collection.prototype.replaceAll = function (rows) { this.source = (rows || []).slice(); };
Collection.prototype.refresh = function () {};

function panelProto(name, methods) {
  function Panel() {}
  Panel.displayName = name;
  Object.keys(methods || {}).forEach((key) => { Panel.prototype[key] = methods[key]; });
  return Panel;
}

const calls = {
  fashion: 0,
  mount: 0,
  artifact: 0,
  formationEquip: 0,
  formationBuy: 0,
  valhallaClaim: 0,
  opens: [],
};

const fashionInfo = { current: {}, owned: {} };
const mountInfo = { skinId: 0, unlocked: {} };
const artifactInfo = { artifactMap: {}, equipMap: {} };
const formationInfo = { owns: {} };
const valhallaInfo = { unlocked: {} };

const FashionModel = {
  IsFashionActive: (id) => !!fashionInfo.owned[Number(id)],
  GetFashionDuration: () => -1,
  GetCurFashionSkin: (type) => Number(fashionInfo.current[type] || 0),
  // Native CN/local model supplies the visibility-filtered list; the addon
  // must not manufacture catalog rows on its own.
  GetFashionList: () => [30101],
  checkShowType: () => true,
  GetShowServerData: () => ({ fashionMap: {} }),
  GetSuitList: () => [40101],
  IsSuitActive: () => false,
  getAllSuit: () => [],
  sendChangeFshion: () => { calls.fashion += 1; },
  sendSuitColorUnlock: () => { calls.fashion += 1; },
  GetSortItemList: () => [],
};

const MountModel = {
  getMountSkinId: () => mountInfo.skinId,
  getUnlockedMap: () => mountInfo.unlocked,
  SendEquipSkin: (id) => { calls.mount += 1; mountInfo.skinId = Number(id); },
};

const ArtifactModel = {
  artifactInfo,
  getArtifactInfo: () => artifactInfo,
  getMainArtifactData: () => null,
  getSecondArtifactData: () => null,
  getArtifactDataByUId: (uid) => {
    for (const rows of Object.values(artifactInfo.artifactMap)) {
      const found = rows.find((row) => Number(row.uid) === Number(uid));
      if (found) return found;
    }
    return null;
  },
  sendArtifactEquip: () => { calls.artifact += 1; },
  sendArtifactUpgrade: () => { calls.artifact += 1; },
  sendArtifactForge: () => { calls.artifact += 1; },
  sendArtifactLock: () => { calls.artifact += 1; },
  sendArtifactQuench: () => { calls.artifact += 1; },
  sendArtifactQuenchRefresh: () => { calls.artifact += 1; },
  sendArtifactQuenchRefreshConfirm: () => { calls.artifact += 1; },
  sendArtifactDecompose: () => { calls.artifact += 1; },
};

const FormationModel = {
  getFormationList: () => [],
  isHaveFormation: (id) => !!formationInfo.owns[Number(id)],
  sendFormationEquip: () => { calls.formationEquip += 1; },
  sendBuyFormation: () => { calls.formationBuy += 1; },
};

const ValhallaModel = {
  GetValidListId: () => [],
  CheckHeroUnlock: (id) => !!valhallaInfo.unlocked[Number(id)],
  sendAtlasReward: () => { calls.valhallaClaim += 1; },
};

const Config = {
  AssetsConfig: {
    30101: { icon: 'fashion_30101', quality: 4 },
    10101: { icon: 'title_10101', quality: 4 },
    10201: { icon: 'avatar_10201', quality: 4 },
    10301: { icon: 'frame_10301', quality: 4 },
    10401: { icon: 'bubble_10401', quality: 4 },
    20001: { icon: 'bg_20001', quality: 4 },
    10501: { icon: 'foot_10501', quality: 4 },
    10601: { icon: 'toy_10601', quality: 4 },
    40101: { icon: 'suit_40101', quality: 4 },
    40201: { icon: 'bathrobe_40201', quality: 4 },
    23101: { icon: 'artifact_23101', quality: 4 },
    24101: { icon: 'artifact_24101', quality: 4 },
    50101: { icon: 'formation_50101', quality: 4 },
  },
  FashionConfig: {
    30101: { id: 30101, type: 301, showType: 1, appearIds: [1], attrs: { 1: 10 } },
    10101: { id: 10101, type: 101, tab: 1, attrs: { 1: 10 } },
    10201: { id: 10201, type: 102, tab: 1, attrs: { 1: 10 } },
    10301: { id: 10301, type: 103, attrs: { 1: 10 } },
    10401: { id: 10401, type: 104, attrs: { 1: 10 } },
    20001: { id: 20001, type: 200, attrs: { 1: 10 } },
    10501: { id: 10501, type: 105, appearIds: [1], attrs: { 1: 10 } },
    10601: { id: 10601, type: 106, attrs: { 1: 10 } },
  },
  FashionDressConfig: {
    40101: { id: 40101, isSuit: 0, attrs: { 1: 10 } },
    40201: { id: 40201, isSuit: 3, attrs: { 1: 10 } },
  },
  ArtifactConfig: {
    23101: { id: 23101, type: 1, quality: 4, initAttrs: [54] },
    24101: { id: 24101, type: 2, quality: 4, initAttrs: [54] },
  },
  ArtifactForgeSkillConfig: { 54: { 4: { 1: { skillGroupId: 1 } } } },
  FormationConfig: {
    50101: { id: 50101, showType: 1, shopItemId: 950101, spAttrs: {}, spAttrGrades: {} },
  },
  ValhallaConfig: {
    60101: { id: 60101, showType: 1, name: 1, skills: [], attrs: {} },
  },
  SwordConfig: { 90101: { id: 90101 } },
};

const FashionPanel = panelProto('DisguiseFashionPanel', {
  updateDataList: function () { this.dataList = FashionModel.GetFashionList(this.showType).map((id) => ({ id })); },
  updateUI: function () {},
  onClickActive: function () { calls.fashion += 1; },
  onClickSelect: function () { calls.fashion += 1; },
});
const SuitPanel = panelProto('DisguiseSuitPanel', {
  updateSuitList: function () { this.listItem.dataProvider.replaceAll([{ id: 40101, isUnlock: false }]); },
  updateDyeingList: function () { this.listDyeing.dataProvider.replaceAll([]); },
  updateUI: function () {},
  onClickSelect: function () { calls.fashion += 1; },
  onClickBuy: function () { calls.fashion += 1; },
});
const BathrobePanel = panelProto('DisguiseBathrobePanel', {
  updateSuitList: function () { this.listItem.dataProvider.replaceAll([{ id: 40201, isUnlock: false }]); },
  updateDyeingList: function () { this.listDyeing.dataProvider.replaceAll([]); },
  updateUI: function () {},
  onClickSelect: function () { calls.fashion += 1; },
  onClickBuy: function () { calls.fashion += 1; },
});
const TitlePanel = panelProto('DisguiseTitlePanel', { updateUI: function () {}, onClickActive: function () { calls.fashion += 1; }, onClickSelect: function () { calls.fashion += 1; }, onClickTakeOff: function () { calls.fashion += 1; } });
const AvatarPanel = panelProto('DisguiseAvatarPanel', { updateUI: function () {}, onClickActive: function () { calls.fashion += 1; }, onClickSelect: function () { calls.fashion += 1; } });
const BgPanel = panelProto('DisguiseBgPanel', { updateUI: function () {}, onClickSelect: function () { calls.fashion += 1; } });
const FootPanel = panelProto('DisguiseFootPrintPanel', { updateUI: function () {}, onClickSelect: function () { calls.fashion += 1; }, onClickTakeOff: function () { calls.fashion += 1; } });
const ToyPanel = panelProto('DisguiseToyPanel', { updateUI: function () {} });

const MountEntranceView = panelProto('MountEntranceView', { onClickSkinBtn: function () { calls.mount += 1; } });
const EquipSkinWin = panelProto('EquipSkinWin', {
  OnOpen: function () {},
  updateUI: function () {},
  onClickConfirm: function () { calls.mount += 1; },
  onTapItem: function () {},
});
const EquipSkinCell = panelProto('EquipSkinCell', { dataChanged: function () {} });

const ArtifactUpgradePanel = panelProto('ArtifactUpgradePanel', {
  updateArtifactList: function () {},
  updateArtifactInfo: function () {},
  updateSkillInfo: function () {},
  onArtifactItemList: function () {},
  onClickArtifactItem: function () { return true; },
  updateViewUI: function () {},
  updateCurUid: function () {},
  onEquip: function () { calls.artifact += 1; },
  onUpgrade: function () { calls.artifact += 1; },
  onDecompose: function () { calls.artifact += 1; },
  onLock: function () { calls.artifact += 1; },
  onForge: function () { calls.artifact += 1; },
  onQuench: function () { calls.artifact += 1; },
  onReset: function () { calls.artifact += 1; },
});
const ArtifactMainWin = function () {};
ArtifactMainWin.openCheck = function () { return false; };

const FormationMainView = panelProto('FormationMainView', {
  updataInfoUI: function () {},
  updateViewUI: function () {},
  onChange: function () { calls.formationEquip += 1; },
  onUp: function () { calls.formationEquip += 1; },
});
const FormationChangeView = panelProto('FormationChangeView', { updateViewUI: function () {}, onChange: function () { calls.formationEquip += 1; } });
const ValhallaHandBookView = panelProto('ValhallaHandBookView', { updateUI: function () {} });
const ValhallaHandBookDetailView = panelProto('ValhallaHandBookDetailView', { OnOpen: function () {} });
const ValhallaHandBookItem = panelProto('ValhallaHandBookItem', { onTapItem: function () { calls.valhallaClaim += 1; } });

const context = {
  console: { info: function () {}, warn: function () {}, error: function () {} },
  setTimeout: function () {},
  Number, Object, Array, JSON, Math, String, Boolean, isFinite, parseInt, parseFloat,
  eui: { ArrayCollection: Collection, ItemTapEvent: { ITEM_TAP: 'itemTap' } },
  Const: { ShowTypeToFashionType: { 0: 305 } },
  GlobalManager: {
    Config,
    FashionModel,
    MountModel,
    ArtifactModel,
    FormationModel,
    ValhallaModel,
    UnlockSystem: { isSystemUnlock: (id) => Number(id) === 209 || Number(id) === 210 },
  },
  ViewManager: { ins: function () { return { open: function (Ctor) { calls.opens.push({ Ctor, args: Array.prototype.slice.call(arguments, 1) }); return null; } }; } },
  UserTips: { ins: function () { return { showTips: function () {} }; } },
  FashionModel,
  MountModel,
  ArtifactModel,
  FormationModel,
  ValhallaModel,
  DisguiseFashionPanel: FashionPanel,
  DisguiseSuitPanel: SuitPanel,
  DisguiseBathrobePanel: BathrobePanel,
  DisguiseTitlePanel: TitlePanel,
  DisguiseAvatarPanel: AvatarPanel,
  DisguiseBgPanel: BgPanel,
  DisguiseFootPrintPanel: FootPanel,
  DisguiseToyPanel: ToyPanel,
  MountEntranceView,
  EquipSkinWin,
  EquipSkinCell,
  ArtifactUpgradePanel,
  ArtifactMainWin,
  FormationMainView,
  FormationChangeView,
  ValhallaHandBookView,
  ValhallaHandBookDetailView,
  ValhallaHandBookItem,
};
context.window = context;
vm.runInNewContext(fs.readFileSync(ADDON, 'utf8'), context, { filename: ADDON });
assert.ok(context.LhsAppearancePreviewV1 && context.LhsAppearancePreviewV1.installed, 'addon did not install');

function provider(rows) { return { dataProvider: new Collection(rows || []) }; }

const fashion = new FashionPanel();
fashion.showType = 1;
fashion.selectId = 30101;
fashion.dataList = [];
fashion.btnActive = { visible: true };
fashion.btnSelect = { visible: true };
fashion.costItem = { visible: true };
fashion.imgUse = { visible: true };
fashion.updateDataList();
assert.ok(fashion.dataList.some((row) => row.id === 30101), 'fashion preview row missing');
fashion.updateUI();
fashion.onClickActive();
assert.strictEqual(calls.fashion, 0, 'locked fashion called RPC');

const title = new TitlePanel();
title.selectId = 10101;
title.listItem = provider([]);
title.updateUI();
assert.ok(title.listItem.dataProvider.source.some((row) => row.id === 10101), 'title preview row missing');
title.onClickSelect();
assert.strictEqual(calls.fashion, 0, 'locked title called RPC');

const avatar = new AvatarPanel();
avatar.tabType = 1;
avatar.selectId = 10301;
avatar.listFrame = provider([]);
avatar.listAvatar = provider([]);
avatar.listBubble = provider([]);
avatar.updateUI();
assert.ok(avatar.listFrame.dataProvider.source.some((row) => row.frameId === 10301), 'frame preview row missing');
avatar.onClickSelect();
assert.strictEqual(calls.fashion, 0, 'locked frame called RPC');

const bg = new BgPanel();
bg.selectId = 20001;
bg.listItem = provider([]);
bg.updateUI();
assert.ok(bg.listItem.dataProvider.source.some((row) => row.id === 20001), 'background preview row missing');
bg.onClickSelect();
assert.strictEqual(calls.fashion, 0, 'locked background called RPC');

const foot = new FootPanel();
foot.selectId = 10501;
foot.listItem = provider([]);
foot.updateUI();
assert.ok(foot.listItem.dataProvider.source.some((row) => row.id === 10501), 'footprint preview row missing');
foot.onClickSelect();
assert.strictEqual(calls.fashion, 0, 'locked footprint called RPC');

const toy = new ToyPanel();
toy.selectId = 10601;
toy.updateUI();

const suit = new SuitPanel();
suit.selectId = 40101;
suit.dyeingId = 0;
suit.listItem = provider([]);
suit.listDyeing = provider([]);
suit.updateSuitList();
assert.ok(suit.listItem.dataProvider.source.some((row) => row.id === 40101), 'normal suit preview row missing');
suit.onClickBuy();
assert.strictEqual(calls.fashion, 0, 'locked suit called RPC');

const bathrobe = new BathrobePanel();
bathrobe.selectId = 40201;
bathrobe.dyeingId = 0;
bathrobe.listItem = provider([]);
bathrobe.listDyeing = provider([]);
bathrobe.updateSuitList();
assert.ok(bathrobe.listItem.dataProvider.source.some((row) => row.id === 40201), 'bathrobe preview row missing');
bathrobe.onClickBuy();
assert.strictEqual(calls.fashion, 0, 'locked bathrobe called RPC');

const mountBefore = JSON.stringify(mountInfo);
MountEntranceView.prototype.onClickSkinBtn.call({});
assert.strictEqual(calls.mount, 0, 'mount entrance click called equip RPC');
assert.strictEqual(MountModel.SendEquipSkin(90101), false, 'locked mount equip was accepted');
assert.strictEqual(JSON.stringify(mountInfo), mountBefore, 'mount preview mutated ownership');

const artifactBefore = JSON.stringify(artifactInfo);
const artifact = new ArtifactUpgradePanel();
artifact._curType = 1;
artifact._curUId = -23101;
artifact.itemList = provider([]);
artifact.updateArtifactList();
assert.ok(artifact.itemList.dataProvider.source.some((row) => row.uid === -23101), 'artifact preview row missing');
artifact.onArtifactItemList({ item: artifact.itemList.dataProvider.source.find((row) => row.uid === -23101) });
artifact.onEquip();
assert.strictEqual(calls.artifact, 0, 'preview artifact called RPC');
assert.strictEqual(JSON.stringify(artifactInfo), artifactBefore, 'artifact preview mutated artifactInfo');
assert.strictEqual(artifact.onClickArtifactItem(2), false, 'missing secondary artifact did not open preview catalog');

const formationBefore = JSON.stringify(formationInfo);
assert.ok(FormationModel.getFormationList().some((row) => row.id === 50101), 'formation preview row missing');
FormationModel.sendFormationEquip(50101);
assert.strictEqual(calls.formationEquip, 0, 'preview formation equip called RPC');
// Buying remains an authoritative acquisition path for other UI flows; the
// preview guard belongs to the preview panel, not to the model-wide buy RPC.
FormationModel.sendBuyFormation(950101);
assert.strictEqual(calls.formationBuy, 1, 'formation buy RPC was globally blocked');
const formationMain = new FormationMainView();
formationMain._nowChooseItem = { data: { id: 50101 } };
formationMain.updataInfoUI();
formationMain.onChange();
formationMain.onUp({ target: formationMain.up0 });
assert.strictEqual(calls.formationEquip, 0, 'locked formation panel action called RPC');
assert.strictEqual(JSON.stringify(formationInfo), formationBefore, 'formation preview mutated ownership');

const valhallaBefore = JSON.stringify(valhallaInfo);
const valItem = new ValhallaHandBookItem();
ValhallaHandBookItem.prototype.onTapItem.call(valItem, { itemRenderer: { data: 60101 } });
assert.strictEqual(calls.valhallaClaim, 0, 'locked Valhalla item claimed reward');
assert.strictEqual(JSON.stringify(valhallaInfo), valhallaBefore, 'Valhalla preview mutated ownership');

console.log('appearance preview read-only fixture PASS: fashion tabs, mount, artifact, formation, Valhalla; no preview RPC/state mutation');

'use strict';
// Shipped native methods + current runtime config + preview addon, RAM only.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const app = path.resolve(__dirname, '..'), game = path.resolve(app, '../../webgame/game');
let networkAttempts = 0;
const deny = () => { networkAttempts++; throw Error('FASHION_PREVIEW_NETWORK_DENIED'); };
require('net').Socket.prototype.connect = deny;
for (const name of ['http', 'https']) { require(name).request = deny; require(name).get = deny; }
global.fetch = deny;
const logger = require.resolve('../src/logger');
require.cache[logger] = { id: logger, filename: logger, loaded: true, exports: { info(){}, warn(){}, error(){}, debug(){} } };
const config = require('../src/services/ConfigService'), c = config.loadAllTables();
const main = fs.readFileSync(path.join(game, 'js/main.min_drop100.js'), 'utf8');
const addon = fs.readFileSync(process.env.FASHION_PREVIEW_SOURCE || path.join(game, 'js/lhs-appearance-preview-v1.js'), 'utf8');
const acorn = require('acorn');
const panelEnd = main.indexOf('t(DM=ffe,"DisguiseSuitPanel")');
function source(marker, panel = false, before = panelEnd) {
  const at = panel ? main.lastIndexOf(marker, before) : main.indexOf(marker);
  assert(at >= 0, marker);
  let node = acorn.parseExpressionAt(main, at + marker.indexOf('function'), { ecmaVersion: 2022 });
  if (node.type === 'SequenceExpression') node = node.expressions[0];
  return main.slice(node.start, node.end);
}
class Collection { constructor(rows = []) { this.source = rows; } replaceAll(rows) { this.source = rows; } }
const visible = (node, value) => { node.visible = node.includeInLayout = !!value; };
const sent = [], opened = [], tips = [];
let currentSuit = { suitId: 28000, dyeing: 0 };
const fm = {
  _fashionInfo: { activateFashion: [], dress: [], fashion: {} },
  IsFashionActive(id) { return this._fashionInfo.activateFashion.includes(Number(id)); },
  GetCurFashionSkin(type) { return this._fashionInfo.fashion[type] || -1; },
  GetCurSuitData: () => currentSuit,
  GetSuitTimeData: () => null,
  GetSuitStars: () => 0, GetSuitMaxStar: () => 100,
  CreateEmptyShowInfo: () => ({ fashionMap: {} }), CreteShowDataByInfo: info => info,
  CheckFashionIsDeying: () => false, checkSuitShow: () => true,
  GetFashionDuration: () => -1, getSetName: () => 'Test',
  sendDressStarUp: (...args) => sent.push({ type: 'star', args }),
  sendSuitColorUnlock: (...args) => sent.push({ type: 'dye', args }),
  sendChangeSuit: (...args) => sent.push({ type: 'equip', args }),
  sendChangeFshion: (...args) => sent.push({ type: 'effect', args }),
};
let enough = true;
const manager = { Config: c, FashionModel: fm, RoleModel: { kungfuId: 4, subJob: 0 },
  ItemModel: { GetItemCount: () => enough ? 1e8 : 0, checkItemsEnough: () => enough, checkItemEnough: () => enough } };
const ctx = vm.createContext({ Y: manager, GlobalManager: manager, O: Math, AppInfo: { inChina: true },
  x: { INITIAL_ROLE_SUIT: 28000, COMMON_ROLE_SUIT: 28000, EMPTY_FASHION_ID: -1, ESuitType: { normal: 0, linkage: 1, changeColor: 2, bathrobe: 3, endSkill: 4 } },
  B: { ConvertLanguageToText: String, generateTextFlowByLangId: id => [{ text: String(id) }], setIncludeInLayoutVisible: visible },
  D: { setIncludeInLayoutVisible: visible }, Cc: { generateTextFlow: text => [{ text }] },
  A: { ins: () => ({ dispatch(){} }) }, E: {}, $c: {}, qo: { Prop: 1 }, qk: { Skill: 1 }, Ar: class {}, Lr: class {},
  U: { ArrayCollection: Collection }, eui: { ArrayCollection: Collection }, _t: (a,b) => a.concat(b),
  P: { ins: () => ({ open: (...args) => opened.push(args), isShow: () => false }) }, vv: class {},
  S: { ins: () => ({ showTips: text => tips.push(text) }) },
  Ost: { ins: () => ({ showWarnLabel: (_text, action) => action.func(), showItemCost: (_text, action) => action.func() }) },
  yht: { 102: ['stand'], 103: ['stand2'], 109: ['attack'] }, it: { wuqi: 1 },
  RES: { hasRes: () => false },
  setTimeout(){}, console: { info(){}, warn(){} },
});
ctx.window = ctx; ctx.UserTips = ctx.S;
const native = (marker, panel) => vm.runInContext('(' + source(marker, panel) + ')', ctx);
for (const name of ['GetSuitFashions', 'getFashionStarLevel', 'IsSuitActive', 'isLinkageSuit', 'isCompleteSuit', 'getSingleSuitStar', 'getAllSuit', 'CreateSuitFashionData']) fm[name] = native('f.' + name + '=function');
const methods = ['updateUI', 'updateSuitShow', 'updateSkillAndAttr', 'updateDyeingList', 'updateButtons', 'updateEndSkill', 'onClickBuy', 'onClickCpSkillUp', 'onClickESCheckBox', 'onClickSelect', 'onClickSwitch', 'playExRoleAction'];
const methodSources = methods.map(name => source('_ge.' + name + '=function', true));
function node() { return { visible: true, includeInLayout: true, enabled: true, touchEnabled: true, text: '', labelDisplay: {}, iconDisplay: {}, dataProvider: new Collection(), setData(){}, SetEndTime(){}, validateNow(){} }; }
class Panel {
  constructor(id, level = 0) {
    for (const text of methodSources) for (const match of text.matchAll(/this\.(\w+)/g)) if (!(match[1] in this)) this[match[1]] = node();
    this.selectId = id; this.dyeingId = level; this.isMale = true; this.soundChannel = null;
    this.listItem = node(); this.scrollerDyeing = node(); this.listDyeing = node();
    this.groupEndSkillLockState = node(); this.groupEndSkillUnlockState = node(); this.groupEndSkillLock = node();
    this.roleShow = { setData(){}, setLoadCallBack: callback => callback(), setAnimtion: () => null, setEntityAnimtion(){}, showData: {} };
  }
  getCurSuitData() { return currentSuit; }
  updateSuitList() { this.listItem.dataProvider.replaceAll([]); }
}
for (const name of methods) Panel.prototype[name] = native('_ge.' + name + '=function', true);
for (const name of ['getSuitName', 'getCurCost', 'getSuitDuration']) Panel[name] = native('ffe.' + name + '=function');
ctx.ffe = ctx.DM = ctx.DisguiseSuitPanel = Panel;
vm.runInContext(addon, ctx);
assert(ctx.LhsAppearancePreviewV1.installed);
function own(id, level = 0) {
  fm._fashionInfo.activateFashion = Array.from(fm.GetSuitFashions(id, 0));
  fm._fashionInfo.dress = c.FashionDressConfig[id].isSuit === 1 ? [{ id, star: level }] : [];
}
function clear() { fm._fashionInfo = { activateFashion: [], dress: [], fashion: {} }; sent.length = opened.length = tips.length = 0; enough = true; currentSuit = { suitId: 28000, dyeing: 0 }; }
const counts = { nativePanelCases: 0, nativeDyeRenderers: 0, upgrades: 0, dyePurchases: 0, checks: 0 };
function check(name, fn) { fn(); counts.checks++; }
check('all configured suit panels render unowned/owned; null animation is safe', () => {
  for (const dress of Object.values(c.FashionDressConfig)) {
    if (dress.isSuit === 3 || dress.id === 28000) continue;
    const table = c[['FashionColorConfig', 'FashionDressLevelConfig', 'FashionChangeColorConfig', 'FashionBathConfig', 'FashionEndDressConfig'][dress.isSuit]][dress.id];
    for (const level of dress.isSuit === 4 ? [0] : Object.keys(table || {}).map(Number)) for (const owned of [false, true]) {
      clear(); if (owned) own(dress.id, level);
      const p = new Panel(dress.id, level), before = JSON.stringify(fm._fashionInfo);
      p.updateUI(); assert.equal(JSON.stringify(fm._fashionInfo), before); assert.equal(sent.length, 0);
      if (!owned) { p.onClickSelect(); assert.equal(sent.length, 0); }
      counts.nativePanelCases++;
    }
  }
});
check('every appended dye row runs the real renderer, including opening/end effects', () => {
  const end = main.indexOf('t(PM=ufe,"DisguiseSuitDyeingItem")');
  assert(end > 0);
  const text = source('_ge.dataChanged=function', true, end);
  const render = vm.runInContext('(' + text + ')', ctx);
  for (const role of [{ kungfuId: 2, subJob: 0 }, { kungfuId: 2, subJob: 1 }, { kungfuId: 4, subJob: 0 }, { kungfuId: 8, subJob: 1 }]) {
    manager.RoleModel = role;
    for (const dress of Object.values(c.FashionDressConfig)) {
      // 28000 is the class starter outfit.  Its icon is supplied by the
      // role/gender table at runtime, not by the dye item renderer.
      if (dress.id === 28000) continue;
      clear(); const p = new Panel(dress.id); p.updateDyeingList();
      const rows = p.listDyeing.dataProvider.source;
      for (const row of rows) {
        const cell = { data: row };
        for (const match of text.matchAll(/this\.(\w+)/g)) if (!(match[1] in cell)) cell[match[1]] = node();
        assert.doesNotThrow(() => render.call(cell), 'native dye renderer ' + dress.id + '/' + row.dyeing);
        assert(cell.imgHead.source, 'empty portrait ' + dress.id + '/' + row.dyeing);
        counts.nativeDyeRenderers++;
      }
    }
  }
  manager.RoleModel = { kungfuId: 4, subJob: 0 };
});
check('chromatic suits use native colour buttons, effects never create dye cells', () => {
  const p = new Panel(28240);
  for (const id of [28240, 28340, 28320, 28330, 28410, 28240]) {
    p.selectId = id; p.dyeingId = 0; p.updateDyeingList();
    assert.equal(p.listDyeing.dataProvider.source.length, 0, 'unexpected dye strip ' + id);
    assert(Number.isNaN(p.scrollerDyeing.width)); assert.equal(p.scrollerDyeing.horizontalCenter, 0);
  }
});
check('dye selection preserves equipped marker, single-variant layout and repeated transitions', () => {
  clear(); own(28370, 4); currentSuit = { suitId: 28370, dyeing: 4 };
  const before = JSON.stringify(fm._fashionInfo), p = new Panel(28370, 4);
  for (let i = 0; i < 12; i++) {
    p.selectId = 28370; p.dyeingId = 4; p.updateDyeingList();
    const rows = p.listDyeing.dataProvider.source;
    assert.equal(rows.length, 5); assert.equal(new Set(rows.map(r => r.dyeing)).size, 5);
    assert.equal(rows.filter(r => r.isUse).length, 1); assert(rows.find(r => r.dyeing === 4).isUse);
    assert.equal(p.scrollerDyeing.width, 440); assert.equal(p.scrollerDyeing.horizontalCenter, -20);
    p.selectId = 28410; p.dyeingId = 0; p.updateDyeingList();
    assert.equal(p.listDyeing.dataProvider.source.length, 0);
  }
  const single = Object.values(c.FashionDressConfig).find(d => d.isSuit === 0 && Object.keys(c.FashionColorConfig[d.id] || {}).length === 1);
  assert(single); p.selectId = single.id; p.updateDyeingList(); assert.equal(p.listDyeing.dataProvider.source.length, 0);
  assert.equal(JSON.stringify(fm._fashionInfo), before); assert.equal(sent.length, 0);
});
check('every upgrade level preserves native progression / resources / equip guards', () => {
  for (const [key, rows] of Object.entries(c.FashionDressLevelConfig)) for (const level of Object.keys(rows).map(Number).filter(n => n > 0)) {
    const id = Number(key); clear(); own(id, level - 1);
    const p = new Panel(id, level); p.updateUI(); assert(p.groupBuy.visible, id + '/' + level); assert(p.btnCpSkillUp.visible);
    p.onClickCpSkillUp(); assert.equal(opened.length, 1); assert.equal(sent.length, 0);
    enough = false; p.onClickBuy(); assert.equal(sent.length, 0);
    enough = true; p.onClickBuy(); assert.equal(sent.length, 1); assert.equal(sent[0].type, 'star'); assert.deepEqual(sent[0].args, [id, level]);
    sent.length = 0; p.onClickSelect(); assert.equal(sent.length, 0);
    clear(); p.updateUI(); p.onClickBuy(); assert.equal(sent.length, 0); assert(!p.groupBuy.visible);
    own(id, level); p.updateUI(); assert(!p.__lhsAppearancePreview); p.onClickSelect(); assert.equal(sent[0].type, 'equip');
    counts.upgrades++;
  }
});
check('normal and chromatic dye preserve native confirmation and costs', () => {
  for (const dress of Object.values(c.FashionDressConfig).filter(d => [0,2].includes(d.isSuit) && d.id !== 28000)) {
    const rows = c[dress.isSuit === 0 ? 'FashionColorConfig' : 'FashionChangeColorConfig'][dress.id];
    for (const [key,row] of Object.entries(rows || {})) {
      const level = Number(key); if (level <= 0 || !row.cost || row.cost.count <= 0) continue;
      clear(); own(dress.id); const p = new Panel(dress.id, level); p.updateUI(); assert(p.groupBuy.visible);
      enough = false; p.onClickBuy(); assert.equal(sent.length, 0); enough = true; p.onClickBuy();
      assert.equal(sent.length, 1); assert.equal(sent[0].type, 'dye'); counts.dyePurchases++;
    }
  }
});
check('effect ownership is independent of suit; unowned checkbox resets, 28410 is opening-only', () => {
  for (const id of [28320,28330]) {
    clear(); const p = new Panel(id); p.updateUI(); assert(p.groupEndSkill.visible);
    p.checkboxEndSkill.selected = true; p.onClickESCheckBox(); assert.equal(sent.length, 0); assert.equal(p.checkboxEndSkill.selected, false);
    const effect = c.FashionEndDressConfig[id].endEffectId; fm._fashionInfo.activateFashion = [effect];
    p.onClickESCheckBox(); assert.equal(sent.length, 1); assert.deepEqual(sent[0].args, [effect,304]);
  }
  clear(); const p = new Panel(28410); p.updateUI(); assert(!p.groupEndSkill.visible);
  p.onClickESCheckBox(); assert.equal(sent.length, 0);
});
check('animation guard preserves real tracks and renderer identity', () => {
  clear(); const p = new Panel(28410); let listeners = 0; const play = () => ({ on(){ listeners++; } });
  p.roleShow.setAnimtion = play; p.playExRoleAction(true); assert.equal(listeners, 1); assert.equal(p.roleShow.setAnimtion, play);
  p.roleShow.setAnimtion = () => null; const original = p.roleShow.setAnimtion; p.playExRoleAction(true); assert.equal(p.roleShow.setAnimtion, original);
});
check('seven names use the existing Vietnamese catalog', () => {
  c.LanguageConfig = {};
  vm.runInContext(fs.readFileSync(path.join(game,'js/lhs-fashion-content-v1.js'),'utf8'),ctx);
  const language = JSON.parse(fs.readFileSync(path.resolve(app,'../configMap,json'),'utf8'));
  for (const id of [11291,11837,11838,12078,23046,23047,23048]) assert.equal(c.LanguageConfig[id].cn, language[id].cn);
  assert(!JSON.stringify(c.LanguageConfig).includes('NaN'));
});
assert.equal(networkAttempts,0);
console.log(JSON.stringify({ result:'PASS', ...counts, productionWrites:0, networkAttempts }));

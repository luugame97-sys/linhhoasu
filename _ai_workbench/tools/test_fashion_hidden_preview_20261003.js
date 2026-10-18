'use strict';

// Client-only contract: hidden catalog rows are selectable for preview, while
// an unowned selection must never reach the native equip callback.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const workspace = path.resolve(__dirname, '../..');
const config = require(path.join(workspace, 'linhhoasu/lhs/newServer/src/services/ConfigService')).loadAllTables();
const source = fs.readFileSync(path.join(workspace, 'linhhoasu/webgame/game/js/lhs-fashion-hidden-preview-v1.js'), 'utf8');
const owned = new Set();

function suitParts(id, color) {
  const dress = config.FashionDressConfig[id];
  if (!dress) return [];
  if (dress.isSuit === 4) return (config.FashionEndDressConfig[id] || {}).fashionIds || [];
  const names = ['FashionColorConfig', 'FashionDressLevelConfig', 'FashionChangeColorConfig', 'FashionBathConfig'];
  const table = (config[names[dress.isSuit]] || {})[id] || {};
  return (table[color] || {}).fashionIds || [];
}

const fashionModel = {
  IsSuitActive: (id, color) => {
    const ids = suitParts(id, color);
    return ids.length > 0 && ids.every((part) => owned.has(Number(part)));
  },
  GetSuitFashions: suitParts,
  IsFashionActive: (id) => owned.has(Number(id)),
  GetFashionDuration: () => -1,
};

function collection(rows = []) {
  return {
    source: rows,
    replaceAll(next) { this.source = next.slice(); },
    get length() { return this.source.length; },
    getItemAt(index) { return this.source[index]; },
  };
}

function SuitPanel() {
  this.selectId = 28240; this.dyeingId = 0; this.calls = 0;
  this.listItem = { dataProvider: collection() };
  this.listDyeing = { dataProvider: collection() };
  this.scrollerDyeing = {};
}
SuitPanel.prototype.updateSuitList = function () { this.listItem.dataProvider.replaceAll([{ id: 28370 }]); };
SuitPanel.prototype.updateDyeingList = function () { this.listDyeing.dataProvider.replaceAll([]); };
SuitPanel.prototype.onClickSelect = function () { this.calls += 1; };

function FashionPanel() { this.showType = 1; this.selectId = 23001; this.dataList = []; this.calls = 0; }
FashionPanel.prototype.updateDataList = function () { this.dataList = [{ id: 23001, state: 'normal' }]; };
FashionPanel.prototype.onClickSelect = function () { this.calls += 1; };

const root = {
  GlobalManager: { Config: config, FashionModel: fashionModel },
  DisguiseSuitPanel: SuitPanel,
  DisguiseBathrobePanel: null,
  DisguiseFashionPanel: FashionPanel,
  AppInfo: { inChina: true },
  setTimeout() {},
  console: { info() {} },
};
root.window = root;
vm.runInNewContext(source, root);
assert.equal(root.LhsFashionHiddenPreviewV1.installed, true);

const suit = new SuitPanel();
suit.updateSuitList();
assert(suit.listItem.dataProvider.source.some((row) => row.id === 28240));
suit.onClickSelect();
assert.equal(suit.calls, 0);
owned.clear(); suitParts(28240, 0).forEach((id) => owned.add(Number(id)));
suit.onClickSelect();
assert.equal(suit.calls, 1);
suit.updateDyeingList();
assert(suit.listDyeing.dataProvider.source.length > 0);

const fashion = new FashionPanel();
fashion.updateDataList();
assert(fashion.dataList.length > 1);
owned.clear();
fashion.onClickSelect();
assert.equal(fashion.calls, 0);

console.log(JSON.stringify({
  result: 'PASS',
  hiddenSuitRows: suit.listItem.dataProvider.source.length,
  hiddenDyeRows: suit.listDyeing.dataProvider.source.length,
  hiddenFashionRows: fashion.dataList.length,
  equipRpcAttempts: suit.calls + fashion.calls,
}));

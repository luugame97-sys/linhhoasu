'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(
  '_ai_workbench/temp/gem10_candidate_20261002/client/lhs-gem-quick100-v1.js',
  'utf8',
);

class Button {
  constructor() {
    this.width = 0;
    this.height = 0;
    this.scaleX = 1;
    this.scaleY = 1;
    this.left = NaN;
    this.right = NaN;
    this.top = NaN;
    this.bottom = NaN;
  }

  addClickEvent(handler, context) {
    this.handler = handler.bind(context);
  }
}

function GemModel() {}
GemModel.prototype.Rpc = () => {};
GemModel.prototype.getGemCount = () => 4;

function AutoPanel() {}
AutoPanel.prototype.OnOpen = function onOpen() {};
AutoPanel.prototype.initEvent = function initEvent() {};

function SpecialPanel() {}
SpecialPanel.prototype.OnOpen = function onOpen() {};
SpecialPanel.prototype.updateMaterialList = function updateMaterialList() {};

const manager = {
  Config: {
    GemBaseConfig: { fieldMax: 1200, maxQuickLevel: 100 },
    GemLevelConfig: { 11: { level: 1 }, 100: { level: 100 } },
    GemComposeConfig: { 100: { consume: [{ id: 11, count: 2 }] } },
  },
  GemModel: new GemModel(),
};
const root = {
  GlobalManager: manager,
  eui: { Button },
  egret: {
    TouchEvent: { TOUCH_TAP: 'touchTap' },
    getDefinitionByName(name) {
      return name === 'FateGemAutoComposePanel'
        ? AutoPanel
        : name === 'FateGemSpecialComposePanel' ? SpecialPanel : null;
    },
  },
  setTimeout() {},
  console,
};
root.window = root;
vm.runInNewContext(source, root, { filename: 'lhs-gem-quick100-v1.js' });

const panel = new SpecialPanel();
panel._selectId = 100;
panel.addChild = (child) => { child.parent = panel; panel.specialButton = child; };
panel.composeBtn = new Button();
panel.composeBtn.parent = panel;
panel.composeBtn.skinName = 'BtnNavyBlue0Skin';
panel.composeBtn.width = 230;
panel.composeBtn.height = 80;
panel.composeBtn.scaleX = 0.9;
panel.composeBtn.scaleY = 0.9;
panel.composeBtn.bottom = 50;
panel.OnOpen();

const b = panel.specialButton;
assert.ok(b);
assert.equal(panel.composeBtn.width, b.width);
assert.equal(panel.composeBtn.height, b.height);
assert.equal(panel.composeBtn.scaleX, b.scaleX);
assert.equal(panel.composeBtn.scaleY, b.scaleY);
assert.equal(panel.composeBtn.horizontalCenter, -103);
assert.equal(b.horizontalCenter, 103);
assert.equal(b.bottom, panel.composeBtn.bottom);
assert.equal(Number.isNaN(b.top), true);
assert.equal(b.label, 'Hợp thành hết (2)');
assert.equal(b.enabled, true);
console.log(JSON.stringify({ pass: true, width: b.width, scaleX: b.scaleX, centers: [-103, 103], gap: 16 }));

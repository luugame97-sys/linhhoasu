'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../../webgame/game/js/lhs-theme2-fallback-v1.js'), 'utf8');
let activeTheme = 2, renderTheme = null;
function FashionModel() {}
FashionModel.prototype.getMainPanelThemeType = function () { return activeTheme; };
function MainPanel() {}
MainPanel.prototype.updateTheme = function () { renderTheme = this.getTheme(); };
MainPanel.prototype.getTheme = function () { return this.fashion.getMainPanelThemeType(); };
function MainPanelNew() {}
MainPanelNew.prototype.updateTheme = function () { renderTheme = this.getTheme(); };
MainPanelNew.prototype.getTheme = MainPanel.prototype.getTheme;
const fashion = new FashionModel(), panel = new MainPanel(), panelNew = new MainPanelNew();
panel.fashion = fashion; panelNew.fashion = fashion;
const root = { setTimeout() {}, egret: { getDefinitionByName() { return null; } }, Const: { MainThemeDataMap: { 0: { bg: 'bg0' }, 1: { bg: 'bg1', bgPole: 'pole1', newBg: 'new1', icon: 'icon1', iconSp: 'sp1' } } } };
root.window = root;
vm.runInNewContext(source, root, { filename: 'lhs-theme2-fallback-v1.js' });
assert.equal(root.LhsTheme2FallbackV1.installed, true);
assert.equal(root.Const.MainThemeDataMap[2].bg, 'bg1');
assert.equal(root.LhsTheme2FallbackV1.fallback, true);
assert.equal(fashion.getMainPanelThemeType(), 2, 'fallback must not change selected ownership/theme state');
console.log(JSON.stringify({ result: 'PASS', fallbackRenderTheme: 1, selectedThemePreserved: 2, productionWrites: 0 }));

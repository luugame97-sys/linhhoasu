const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'temp', 'webgm_ui_refactor_current');
const page = fs.readFileSync(path.join(root, 'index.php'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets', 'css', 'ui-refactor.css'), 'utf8');

const menuStart = page.indexOf('id="playerSidebarMenu"');
const menuEnd = page.indexOf('gm-content-col', menuStart);
assert(menuStart >= 0 && menuEnd > menuStart, 'player menu not found');
const menu = page.slice(menuStart, menuEnd);
const tabs = [];
for (const match of menu.matchAll(/data-tab="([^"]+)"/g)) tabs.push(match[1]);

const order = new Map();
for (const match of css.matchAll(/\.player-page\s+#playerSidebarMenu\s+\.menu-btn\[data-tab="([^"]+)"\]\s*\{\s*order:\s*(-?\d+)\s*;/g)) {
  order.set(match[1], Number(match[2]));
}
const visual = tabs
  .map((tab, index) => ({ tab, index, order: order.has(tab) ? order.get(tab) : 0 }))
  .sort((a, b) => a.order - b.order || a.index - b.index)
  .map((row) => row.tab);

assert.deepStrictEqual(visual.slice(-2), ['tab-transactions', 'tab-spend-history']);
assert.strictEqual(order.get('tab-transactions'), 999);
assert.strictEqual(order.get('tab-spend-history'), 1000);
console.log(JSON.stringify({ result: 'PASS', sourceOrder: tabs, visualOrder: visual, lastTwo: visual.slice(-2) }));

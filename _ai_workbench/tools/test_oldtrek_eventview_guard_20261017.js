'use strict';
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('linhhoasu/webgame/game/js/lhs-oldtrek-eventview-v1.js', 'utf8');
let closed = 0, current = { id: 152 }, logs = [];
const model = {
  getCurEvent: () => current,
  isCheckEvent: id => Number(id) === 152,
  getTrekEventLogs: () => logs,
};
function View() {
  this.listEvent = { dataProvider: { source: [] } };
  this.CloseSelf = () => { closed += 1; };
}
View.prototype.updateUI = function () { this.listEvent.dataProvider.source = []; };
const root = { GlobalManager: { OldTrekModel: model }, OldTrekEventView: View,
  setTimeout: fn => fn(), console: { warn() {} } };
vm.runInNewContext(source, { window: root, setTimeout: root.setTimeout, console: root.console });
assert.equal(root.LhsOldTrekEventViewGuard.installed, true);
const empty = new View(); empty.updateUI(); assert.equal(closed, 1);
logs = [{ id: 151 }]; const withHistory = new View(); withHistory.updateUI(); assert.equal(closed, 1);
current = { id: 454 }; const normal = new View(); normal.updateUI(); assert.equal(closed, 1);
console.log(JSON.stringify({ result: 'PASS', emptyCheckClosed: 1, historyPreserved: true, normalEventPreserved: true, productionWrites: 0 }));

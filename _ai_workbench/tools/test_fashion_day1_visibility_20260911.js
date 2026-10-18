const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.resolve(__dirname, '../../linhhoasu/webgame/game/js/lhs-fashion-day1-v1.js'), 'utf8');
const timers = [];
function FashionModel() {}
FashionModel.prototype.checkShowTypeOpenDay = function nativeGate(showType, owned, openDay) {
  return Number(showType) !== 0 && (!!owned || !(Number(showType) === 2 && !owned)
    && !(Number(showType) === 3 && Number(openDay) > 0 && 6 < Number(openDay)));
};

const root = {
  GlobalManager: { FashionModel },
  setTimeout(fn) { timers.push(fn); return timers.length; },
};
vm.runInNewContext(source, { window: root });

const model = new FashionModel();
assert.strictEqual(root.LhsFashionDay1V1.installed, true);
assert.strictEqual(model.checkShowTypeOpenDay(3, false, 57), true);
assert.strictEqual(model.checkShowTypeOpenDay(2, false, 57), false);
assert.strictEqual(model.checkShowTypeOpenDay(0, false, 57), false);
vm.runInNewContext(source, { window: root });
assert.strictEqual(root.LhsFashionDay1V1.installed, true);
assert.strictEqual(timers.length, 0);
console.log(JSON.stringify({ result: 'PASS', dayGateBypassed: true, ownershipGatePreserved: true }));

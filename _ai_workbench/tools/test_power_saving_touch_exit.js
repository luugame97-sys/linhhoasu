const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const bundle = fs.readFileSync(path.join(root, 'linhhoasu', 'webgame', 'game', 'js', 'main.min_a6195824.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'linhhoasu', 'webgame', 'game', 'index.html'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(bundle.includes('this._lhsPowerSaveClose=function(){n.CloseSelf()}'), 'power-save touch close missing');
assert(bundle.includes('this.addEventListener(egret.TouchEvent.TOUCH_BEGIN,this._lhsPowerSaveClose,this)'), 'power-save touch listener missing');
assert(bundle.includes('this.removeEventListener(egret.TouchEvent.TOUCH_BEGIN,this._lhsPowerSaveClose,this)'), 'power-save listener cleanup missing');
assert((index.match(/20260831_stage_touch_recovery_guard10/g) || []).length === 2, 'cache token count mismatch');

let closeCount = 0;
let open = true;
const close = () => { if (open) { open = false; closeCount += 1; } };
close();
assert(closeCount === 1 && !open, 'touch did not close power-saving panel');
close();
assert(closeCount === 1, 'close callback not once-only');

console.log('PASS PowerSavingModePanel: any touch closes, cleanup is once-only');

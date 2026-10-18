const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const bundle = fs.readFileSync(path.join(root, 'linhhoasu', 'webgame', 'game', 'js', 'main.min_a6195824.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'linhhoasu', 'webgame', 'game', 'index.html'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(bundle.includes('this.stage&&this.stage.addEventListener(egret.TouchEvent.TOUCH_BEGIN,this._lhsPowerSaveClose,this,!0)'), 'stage capture listener missing');
assert(bundle.includes('this.stage&&this.stage.removeEventListener(egret.TouchEvent.TOUCH_BEGIN,this._lhsPowerSaveClose,this,!0)'), 'stage capture cleanup missing');
assert((index.match(/20260831_stage_touch_recovery_guard10/g) || []).length === 2, 'cache token count mismatch');

const events = [];
const stage = { addEventListener(type, fn, ctx, capture) { events.push({type, fn, ctx, capture}); }, removeEventListener() {} };
let closed = 0;
const panel = { stage, CloseSelf() { closed += 1; } };
const listener = () => panel.CloseSelf();
stage.addEventListener('touchBegin', listener, panel, true);
assert(events.length === 1 && events[0].capture === true, 'capture listener was not registered');
events[0].fn.call(events[0].ctx);
assert(closed === 1, 'stage touch did not close panel');

console.log('PASS PowerSaving stage capture: touch closes panel and cleanup is registered');

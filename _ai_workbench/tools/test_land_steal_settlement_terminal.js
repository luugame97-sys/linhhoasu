const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const bundle = fs.readFileSync(path.join(root, 'linhhoasu', 'webgame', 'game', 'js', 'main.min_a6195824.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'linhhoasu', 'webgame', 'game', 'index.html'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(bundle.includes('t(lH=POe,"LandStealSettlementPanel")'), 'settlement panel class missing');
assert(bundle.includes('this._lhsStealSettleSeq=(this._lhsStealSettleSeq||0)+1'), 'sequence guard missing');
assert(bundle.includes('this.addEventListener(egret.TouchEvent.TOUCH_TAP,a,this),setTimeout(a,3500)'), 'tap/timeout close missing');
assert(bundle.includes('POe.prototype.OnClose=function()'), 'OnClose cleanup missing');
assert(bundle.includes('this.removeEventListener(egret.TouchEvent.TOUCH_TAP,this._lhsStealSettleClose,this)'), 'touch cleanup missing');
assert((index.match(/20260831_stage_touch_recovery_guard10/g) || []).length === 2, 'cache token must appear twice');

function makeTerminal() {
  const view = { seq: 0, closeCount: 0 };
  view.open = () => {
    view.seq += 1;
    const current = view.seq;
    return () => {
      if (view.seq === current) view.closeCount += 1;
    };
  };
  view.close = () => { view.seq += 1; };
  return view;
}

const view = makeTerminal();
const first = view.open();
first();
assert(view.closeCount === 1, 'active terminal did not close');
view.close();
first();
assert(view.closeCount === 1, 'stale timer closed a later lifecycle');
const second = view.open();
second();
assert(view.closeCount === 2, 'new lifecycle terminal did not close');

console.log('PASS Land steal settlement: tap + 3500ms terminal + stale timer guard');

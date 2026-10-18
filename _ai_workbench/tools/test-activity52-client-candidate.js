'use strict';

// RAM-only harness for the Activity52 client transport guard.  It evaluates
// the addon with small native-shaped mocks; no browser, network, account, or
// player state is touched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(
  require('node:path').resolve(__dirname, '../temp/fulu_fix_candidate_20260928/lhs-fulu-guard-v1.js'),
  'utf8',
);

const timers = [];
function fakeSetTimeout(fn, ms) {
  const handle = { fn, ms, cleared: false };
  timers.push(handle);
  return handle;
}
function fakeClearTimeout(handle) {
  if (handle) handle.cleared = true;
}
function flushTimers(predicate) {
  for (const handle of timers.splice(0)) {
    if (!handle.cleared && (!predicate || predicate(handle))) handle.fn();
  }
}

const events = [];
const ctx = {
  console,
  setTimeout: fakeSetTimeout,
  clearTimeout: fakeClearTimeout,
  Date,
  Number,
  String,
  Object,
  Array,
  Math,
  JSON,
  TypeError,
};
ctx.window = ctx;
ctx.Config = { ActivityConfig: { 52001: { activityType: 52 } } };

class ActivityModel {
  constructor() { this.mode = 'success'; this.calls = []; }
  sendActivityOperate(id, module, index, param, callback, context) {
    const payload = {
      id, module, index, param,
      requestId: 'native-request-id',
    };
    this.Rpc(1700, payload, (reply) => callback && callback.call(context, reply), null, context);
  }
  Rpc(tag, payload, success, error) {
    this.calls.push({ tag, payload });
    if (this.mode === 'pending') return undefined;
    if (this.mode === 'transport') return error && error({ result: -1 });
    return success && success({ result: this.mode === 'reject' ? 1 : 0 });
  }
}

class ActivityFuluData {
  constructor(model) {
    this.id = 52001;
    this.record = 4;
    this.model = model;
  }
  sendDrawHulu(multi) {
    return this.model.sendActivityOperate(this.id, 1, multi, null, () => {
      events.push('draw-success-callback');
    });
  }
  sendSelectHulu(selected) {
    return this.model.sendActivityOperate(this.id, 0, selected, null, () => {
      events.push('select-success-callback');
    });
  }
}

class FuluMainPanel {
  constructor(data) {
    this._actData = data;
    this._selectedHuluIndex = data.record;
    this.summonBtn = { touchEnabled: true };
    this.closeBtn = { touchEnabled: true };
    this.chooseHulu = { touchEnabled: true };
    this.noHulu = { visible: false };
    this.myHulu = { visible: true };
    this.cleanupCallback = null;
  }
  onSummonBtnClick() {
    this.summonBtn.touchEnabled = false;
    this.closeBtn.touchEnabled = false;
    this.chooseHulu.touchEnabled = false;
    return this._actData.sendDrawHulu(1);
  }
  onYesBtnClick() {
    this._actData.record = this._selectedHuluIndex;
    return this._actData.sendSelectHulu(this._selectedHuluIndex);
  }
  updateMyHuluResource() {}
  updateHuluSelectionDisplay() {}
  showRewardsAndCleanup() {
    if (this.cleanupCallback) this.cleanupCallback();
  }
  onDrawResult(packet) { events.push(['native-draw', packet]); }
}

const model = new ActivityModel();
const data = new ActivityFuluData(model);
ctx.GlobalManager = { ActivityModel: model, Config: ctx.Config };
ctx.ActivityModel = ActivityModel;
ctx.ActivityFuluData = ActivityFuluData;
ctx.FuluMainPanel = FuluMainPanel;
ctx.Er = { Open(_reward, cb) { ctx.lastRewardCallback = cb; } };

vm.runInNewContext(source, ctx, { filename: 'lhs-fulu-guard-v1.js' });
const api = ctx.LhsFuluGuardV1;
assert.equal(api.installed, true, 'all patches install when native classes exist');
assert.ok(api.patched.includes('ActivityModel.Rpc'));
assert.ok(api.patched.includes('ActivityFuluData.sendDrawHulu'));
assert.ok(api.patched.includes('FuluMainPanel.onDrawResult'));

const validPacket = {
  rewards: [{ id: 228, count: 1 }, { id: 232, count: 3 }],
  colorCount: { 1: 2, 2: 1, 3: 1, 4: 1 },
  score: 1,
  special: 0,
  records: { 1: 1, 2: 0 },
};

// Accepted draw: controls stay disabled until native reward cleanup callback.
const panel = new FuluMainPanel(data);
panel.onSummonBtnClick();
assert.equal(panel.summonBtn.touchEnabled, false);
assert.equal(model.calls.at(-1).payload.requestId.startsWith('fulu_52001_'), true);
panel.onDrawResult(validPacket);
panel.showRewardsAndCleanup();
assert.equal(panel.summonBtn.touchEnabled, false, 'guard must not re-enable before Er.Open callback');
panel.cleanupCallback = () => {
  panel.summonBtn.touchEnabled = true;
  panel.closeBtn.touchEnabled = true;
  panel.chooseHulu.touchEnabled = true;
};
panel.showRewardsAndCleanup();
// The second cleanup is not native in production; directly model callback timing.
panel.cleanupCallback();
assert.equal(panel.summonBtn.touchEnabled, true);

// Duplicate click while a request is unresolved is rejected and does not issue RPC.
model.mode = 'pending';
panel.onSummonBtnClick();
const callsBeforeDuplicate = model.calls.length;
assert.equal(panel.onSummonBtnClick(), false);
assert.equal(model.calls.length, callsBeforeDuplicate);
flushTimers((entry) => entry.ms === 20000);
assert.equal(panel.summonBtn.touchEnabled, true, 'timeout must recover controls');

// Transport failure recovers controls; malformed push is ignored and recovered.
model.mode = 'transport';
panel.onSummonBtnClick();
assert.equal(panel.summonBtn.touchEnabled, true);
model.mode = 'success';
panel.onSummonBtnClick();
panel.onDrawResult({ rewards: [], colorCount: { 1: 1 }, score: 0, special: 0, records: {} });
assert.equal(panel.summonBtn.touchEnabled, true);
assert.ok(api.malformed >= 1);

// Selection rejection rolls the optimistic record back to the prior value.
data.record = 4;
panel._selectedHuluIndex = 2;
model.mode = 'transport';
panel.onYesBtnClick();
assert.equal(data.record, 4);
assert.equal(panel._selectedHuluIndex, 4);

// Non-Activity52 RPC remains untouched.
model.mode = 'success';
let unrelatedCallback = 0;
model.Rpc(1700, { id: 999, module: 1 }, () => { unrelatedCallback++; }, null);
assert.equal(unrelatedCallback, 1);

// Partial install retry: all three patches are called independently and later
// become installed instead of short-circuiting after the first unavailable type.
const partialTimers = [];
const partial = {
  console,
  setTimeout(fn, ms) { partialTimers.push({ fn, ms }); return { cleared: false }; },
  clearTimeout() {}, Date, Number, String, Object, Array, Math, JSON,
  Config: ctx.Config,
};
partial.window = partial;
partial.GlobalManager = { ActivityModel: new ActivityModel(), Config: partial.Config };
partial.ActivityModel = ActivityModel;
partial.FuluMainPanel = FuluMainPanel;
vm.runInNewContext(source, partial, { filename: 'lhs-fulu-partial.js' });
assert.equal(partial.LhsFuluGuardV1.installed, false);
partial.ActivityFuluData = ActivityFuluData;
for (const timer of partialTimers.splice(0)) timer.fn();
assert.equal(partial.LhsFuluGuardV1.installed, true);

console.log('activity52 client candidate harness: PASS');

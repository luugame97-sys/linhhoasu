'use strict';
const vm = require('vm'), fs = require('fs'), assert = require('assert/strict');
let next, tips = 0, nativeCalls = 0, snapshots = 0, lastArgs;
let bidKingArgs;
function Model() { this.sailInfo = { trekData: {} }; }
Model.prototype.Rpc = function () { lastArgs = [...arguments]; return arguments[2](next); };
Model.prototype.updateTrek = () => snapshots++;
Model.prototype.getTrekData = function () { return this.sailInfo.trekData; };
Model.prototype.isHaveEvent = function () { return !!(this.sailInfo && this.sailInfo.currentEvent); };
Model.prototype.sendEndTrek = function () { nativeCalls++; };
Model.prototype.checkHandleEvent = function () { nativeCalls++; };
Model.prototype.onEventUpdate = function () { this.sailInfo.currentEvent = null; };
Model.prototype.onEndTrek = function () {};
Model.prototype.sendTrekSailInfo = function (callback) {
  this.sailInfo.currentEvent = { uid: 88 };
  if (callback) callback();
};
function ChatData() {}
ChatData.prototype.parseOldTrekMsg = function (row) {
  this.summary = row.summary;
  this.dbid = row.summary.dbid;
  this.name = row.summary.name;
};
function OldTrekAIUnit() { this.mEntity = { GetInfo: () => null }; }
OldTrekAIUnit.prototype.playResumeIdleOrControlAnim = function () { throw Error('should be guarded'); };
function OldTrekBSpineEventAction() {}
OldTrekBSpineEventAction.prototype.OnEnter = function () { this.entered = true; };
OldTrekBSpineEventAction.prototype.OnExit = function () { this.exited = true; };
OldTrekBSpineEventAction.prototype.triggerCallback = function () { this.triggered = true; };
function BidKingModel() { this.gameCtr = { getCurRound: () => 2 }; }
BidKingModel.prototype.Rpc = function () { bidKingArgs = [...arguments]; return arguments[2]({}); };
function BidKingGameGuideView() { this._isClueTouchBlocked = true; }
BidKingGameGuideView.prototype.setClueTouchBlock = function (value) { this._isClueTouchBlocked = value; };
BidKingGameGuideView.prototype.setGuideGridTouchBlock = function (value) { this._guideGridTouchBlocked = value; };
BidKingGameGuideView.prototype.onClueDisplayReady = function () { this.ready = true; };
BidKingGameGuideView.prototype.OnOpen = function () {};
const root = { OldTrekModel: Model, ChatData, OldTrekAIUnit, OldTrekBSpineEventAction, BidKingModel, BidKingGameGuideView, GuideUtil: { RunningStep: 1, continueGuide: () => {} }, UserTips: { ins: () => ({ showTips: () => tips++ }) }, setTimeout(fn) { fn(); return 1; } };
const source = fs.readFileSync('linhhoasu/webgame/game/js/lhs-oldtrek-errors-v1.js', 'utf8');
vm.runInNewContext(source, { window: root });
const wrapped = Model.prototype.Rpc;
vm.runInNewContext(source, { window: root }); assert.equal(Model.prototype.Rpc, wrapped);
const m = new Model();
for (const tag of [7000, 7001, 7002, 7004, 7005, 7009]) {
  // Generic failures must not run native success callbacks. Pending-event
  // failures now intentionally resync; their real contract has a separate fixture.
  next = { result: 1, code: 'OLD_TREK_COST_NOT_ENOUGH', updateData: {} };
  const error = () => {}; m.Rpc(tag, {}, () => nativeCalls++, error);
  assert.equal(lastArgs[3], error);
}
assert.equal(nativeCalls, 0); assert.equal(tips, 6); assert.equal(snapshots, 6);
next = { result: 0, data: {} }; m.Rpc(7000, {}, () => nativeCalls++); assert.equal(nativeCalls, 1);
next = { result: 1 }; m.Rpc(1230, {}, () => nativeCalls++); assert.equal(nativeCalls, 2);
const chat = new ChatData();
chat.parseOldTrekMsg({ dbid: 'legacy-1', name: 'Legacy', content: 'old' });
assert.equal(chat.summary.dbid, 'legacy-1');
assert.equal(chat.summary.name, 'Legacy');
const unit = new OldTrekAIUnit();
assert.doesNotThrow(() => unit.playResumeIdleOrControlAnim());
const action = new OldTrekBSpineEventAction();
action.OnEnter(); action.OnExit(); action.triggerCallback();
assert.equal(action.triggered, undefined);
const bidKing = new BidKingModel();
bidKing.Rpc(7304, { bid: 100 }, () => {});
assert.equal(bidKingArgs[1].round, 2);
assert.match(bidKingArgs[1].requestId, /^bk_/);
const guide = new BidKingGameGuideView();
guide.onClueDisplayReady();
assert.equal(guide._isClueTouchBlocked, false);
assert.equal(guide._guideGridTouchBlocked, false);
const beforeRecovery = nativeCalls;
m.sailInfo.trekData = { uid: 77 };
next = { result: 0, pendingEvent: true };
m.Rpc(7005, { uid: 77 });
m.onEventUpdate({ event: null });
assert.equal(nativeCalls, beforeRecovery + 1);
m.onEndTrek({});
m.sendTrekSailInfo(() => {});
assert.equal(nativeCalls, beforeRecovery + 2);
console.log('PASS: malformed legacy OldTrek chat row normalized');
console.log('PASS: six error routes, valid callback, unrelated RPC, error argument, repeat install');
console.log('PASS: pending terminal event retries 7005 and relog resumes current event');

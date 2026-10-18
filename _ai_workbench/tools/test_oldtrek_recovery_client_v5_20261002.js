'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let mode = 'success';
let lastRpc = null;
let checks = 0;
let snapshots = 0;
let tips = [];

function Model() {
  this.info = { stateRevision: 7 };
  this.sailInfo = { trekData: { uid: 77 }, currentEvent: null };
}
Model.prototype.Rpc = function rpc(tag, params, callback, context, error) {
  lastRpc = { tag, params, hasError: typeof error === 'function' };
  if (tag === 7005 && mode === 'error') return error && error({ result: -1, code: 'OLD_TREK_RPC_FAILED' });
  if (tag === 7008) {
    snapshots += 1;
    this.sailInfo.currentEvent = { uid: 99 };
    return callback && callback({ result: 0, revision: 8, trekData: this.sailInfo.trekData, currentEvent: this.sailInfo.currentEvent });
  }
  return callback && callback(mode === 'pending'
    ? { result: 0, pendingEvent: true, revision: 8 }
    : { result: 0, revision: 8 });
};
Model.prototype.getTrekData = function getTrekData() { return this.sailInfo.trekData; };
Model.prototype.isHaveEvent = function isHaveEvent() { return !!this.sailInfo.currentEvent; };
Model.prototype.checkHandleEvent = function checkHandleEvent() { checks += 1; };
Model.prototype.sendEndTrek = function sendEndTrek() { this.Rpc(7005, { uid: 77 }, () => {}); };
Model.prototype.sendTrekSailInfo = function sendTrekSailInfo(callback) { this.Rpc(7008, {}, callback, this, callback); };
Model.prototype.onEndTrek = function onEndTrek() {};
Model.prototype.onEventUpdate = function onEventUpdate(update) { this.sailInfo.currentEvent = update && update.event || null; };

function ChatData() {}
ChatData.prototype.parseOldTrekMsg = function parseOldTrekMsg(row) { this.row = row; };
function OldTrekAIUnit() {}
OldTrekAIUnit.prototype.playResumeIdleOrControlAnim = function playResumeIdleOrControlAnim() {};
function OldTrekBSpineEventAction() {}
OldTrekBSpineEventAction.prototype.OnEnter = function OnEnter() {};
OldTrekBSpineEventAction.prototype.OnExit = function OnExit() {};
OldTrekBSpineEventAction.prototype.triggerCallback = function triggerCallback() {};
function BidKingModel() {}
BidKingModel.prototype.Rpc = function rpc() {};
function BidKingGameGuideView() {}
BidKingGameGuideView.prototype.OnOpen = function OnOpen() {};

const model = new Model();
const root = {
  OldTrekModel: Model,
  GlobalManager: { OldTrekModel: model },
  ChatData,
  OldTrekAIUnit,
  OldTrekBSpineEventAction,
  BidKingModel,
  BidKingGameGuideView,
  UserTips: { ins: () => ({ showTips: message => tips.push(message) }) },
  setTimeout: fn => { fn(); return 1; },
};
root.window = root;
const source = fs.readFileSync('_ai_workbench/temp/oldtrek_recovery_20261002/candidate/client/lhs-oldtrek-errors-v1.js', 'utf8');
vm.runInNewContext(source, { window: root });
assert.equal(root.LhsOldTrekErrors.version, '20261002_v5');

mode = 'pending';
model.Rpc(7005, { uid: 77 }, () => {});
assert.equal(lastRpc.hasError, true);
assert.equal(model.__lhsOldTrekSettlementPending, true);

mode = 'error';
model.Rpc(7005, { uid: 77 }, () => {});
assert.ok(snapshots >= 1);
assert.ok(tips.length >= 1);

mode = 'success';
model.Rpc(7001, { multi: 1 }, () => {});
assert.equal(lastRpc.params.revision, 8);

console.log(JSON.stringify({ pass: true, version: root.LhsOldTrekErrors.version, snapshots, tips: tips.length, checks }));

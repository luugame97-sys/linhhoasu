'use strict';
const vm = require('vm');
const assert = require('assert/strict');

const timers = [];
let closed = 0;
let sent = [];
let lastRpc = null;
function Model() {
  this.info = { stateRevision: 4 };
  this.sailInfo = { currentEvent: { uid: 88 } };
}
function ChatData() {}
ChatData.prototype.parseOldTrekMsg = function (row) { return row; };
Model.prototype.isHaveEvent = function () { return !!this.sailInfo.currentEvent; };
Model.prototype.sendHandleEvent = function (uid, operate, score) { sent.push({ uid, operate, score }); };
Model.prototype.sendTrekSailInfo = function (callback) { if (callback) callback(); };
Model.prototype.Rpc = function () {
  const args = [...arguments];
  lastRpc = args;
  if (args[2]) args[2]({ result: 1, code: 'OLD_TREK_MINIGAME_SCORE_INVALID' });
};
function Spot() {
  this._countDown = 0;
  this._realScore = 100;
  this._winScore = 3500;
  this._evtDataUid = 88;
  this.parent = {};
}
Spot.prototype.update = function () { return true; };
Spot.prototype.CloseSelf = function () { closed += 1; };
const model = new Model();
const spot = new Spot();
const root = {
  GlobalManager: { OldTrekModel: model },
  OldTrekModel: Model,
  ChatData,
  OldTrekSpotDiffMainView: Spot,
  OldTrekPinballMainView: function Pinball() {},
  OldTrekMiniGameEntrance: function Entrance() {},
  ViewManager: { ins: () => ({ getView: (Type) => Type === Spot ? spot : null }) },
  egret: { getDefinitionByName: (name) => ({ OldTrekSpotDiffMainView: Spot, OldTrekPinballMainView: root.OldTrekPinballMainView, OldTrekMiniGameEntrance: root.OldTrekMiniGameEntrance, OldTrekModel: Model }[name]) },
  setTimeout: (fn) => { timers.push(fn); return timers.length; },
  UserTips: { ins: () => ({ showTips: () => {} }) },
};
const source = require('fs').readFileSync('linhhoasu/webgame/game/js/lhs-oldtrek-errors-v1.js', 'utf8');
vm.runInNewContext(source, { window: root });

spot.update(16);
assert.equal(timers.length, 1);
timers.shift()();
assert.deepEqual(sent, [{ uid: 88, operate: 1, score: 100 }]);
assert.equal(closed, 1);

model.Rpc(7002, { eventUid: 88 }, () => { throw Error('rejected callback must not run'); });
assert.equal(lastRpc[1].revision, 4);
assert.equal(closed, 2);
console.log('PASS: timed-out mini-game sends one bounded failure and closes the view');
console.log('PASS: rejected 7002 closes the mini-game and preserves revision/request contract');

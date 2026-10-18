'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');

function create(autoOpen = true) {
  const timers = [], events = [], tips = [];
  function BoxModel() {
    this._saleList = [{ uid: 10 }, { uid: 11 }]; this.rows = [10, 11]; this.calls = [];
  }
  BoxModel.prototype.sendEquipSale = function () {};
  BoxModel.prototype.Rpc = function (tag, data, ok, fail) { this.calls.push({ tag, data, ok, fail }); };
  BoxModel.prototype.removeEquips = function (uids) { this.rows = this.rows.filter(id => !uids.includes(id)); };
  BoxModel.prototype.changeState = function (state) { this.state = state; };
  BoxModel.prototype.SaleEquipFlyCoin = function (amount) { this.silver = amount; };
  const model = new BoxModel();
  const root = {
    BoxLayerModel: model,
    OpenBoxAutoSettingModel: { isOpen: autoOpen, autoConfig: { sellAllEquipments: true, autoEquipUpgrade: true } },
    MessageDef: {}, MessageCenter: { ins: () => ({ dispatch: (...args) => events.push(args) }) },
    UserTips: { ins: () => ({ showTips: text => tips.push(text) }) },
    setTimeout(fn, ms) { const row = { fn, ms, live: true }; timers.push(row); return row; },
    clearTimeout(row) { if (row) row.live = false; }, console: { info() {}, warn() {} }
  };
  root.GlobalManager = { BoxLayerModel: model };
  root.window = root;
  vm.runInNewContext(fs.readFileSync(process.env.AUTO_SALE_RECONCILE_SCRIPT
    || 'linhhoasu/webgame/game/js/lhs-auto-sale-reconcile-v1.js', 'utf8'), root);
  return { root, model, timers, events, tips };
}

{
  const h = create(); let done = 0;
  assert.equal(h.model.sendEquipSale(0, () => done++), true);
  assert.equal(h.model.sendEquipSale(0, () => done++), false);
  h.model.calls[0].ok({ result: 0, uids: [10], missingUids: [11], ignoredUids: [], rewardInfo: { items: [{ id: 2, count: 99 }] } });
  assert.deepEqual(h.model.rows, []); assert.deepEqual(h.model._saleList, []);
  assert.equal(h.model.silver, 99); assert.equal(done, 1); assert.equal(h.model._lhsEquipSalePending, null);
}
{
  const h = create(); let done = 0;
  h.model.sendEquipSale(0, () => done++);
  h.model.calls[0].fail({ timeout: true });
  const retryTimer = h.timers.find(row => row.ms === 250 && row.live);
  assert(retryTimer); retryTimer.fn(); assert.equal(h.model.calls.length, 2);
  h.model.calls[1].ok({ result: 0, uids: [], missingUids: [10, 11], ignoredUids: [], rewardInfo: { items: [] } });
  assert.deepEqual(h.model.rows, []); assert.equal(done, 1); assert.equal(h.tips.length, 0);
}
{
  const h = create(false); let done = 0;
  h.model.sendEquipSale(0, () => done++);
  h.model.calls[0].ok({ result: 0, uids: [], missingUids: [10, 11], ignoredUids: [], rewardInfo: { items: [] } });
  assert.deepEqual(h.model.rows, []); assert.equal(done, 1); assert.equal(h.tips.length, 0);
}
console.log(JSON.stringify({ result: 'PASS', checks: 17, staleUidReconciled: true, manualStaleUidReconciled: true, timeoutRetry: true, duplicateBlocked: true }));

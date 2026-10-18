/* Equipment-sale ACK reconciliation. Server remains authoritative for inventory and silver. */
(function (root) {
  'use strict';
  var VERSION = '20260915_auto_sale_reconcile_v1';
  if (root.LhsAutoSaleReconcileV1 && root.LhsAutoSaleReconcileV1.version === VERSION) return;
  var api = root.LhsAutoSaleReconcileV1 = { version: VERSION, installed: false, attempts: 0 };

  function manager() { return root.GlobalManager || root.GameGlobalYDXZ || root.W || null; }
  function settings() { return root.OpenBoxAutoSettingModel || null; }
  function emit(name, value) {
    var center = root.MessageCenter && root.MessageCenter.ins && root.MessageCenter.ins();
    if (center && typeof center.dispatch === 'function') {
      center.dispatch(root.MessageDef && root.MessageDef[name] || name, value);
    }
  }
  function tip(text) {
    var tips = root.UserTips && root.UserTips.ins && root.UserTips.ins();
    if (tips && typeof tips.showTips === 'function') tips.showTips(text);
  }

  function install() {
    api.attempts += 1;
    var m = manager(), model = m && m.BoxLayerModel;
    var proto = model && model.constructor && model.constructor.prototype;
    if (!proto || typeof proto.sendEquipSale !== 'function') {
      root.setTimeout(install, 250);
      return false;
    }
    if (proto.sendEquipSale.__lhsAutoSaleReconcileV1) {
      api.installed = true;
      return true;
    }
    var original = proto.sendEquipSale;
    proto.sendEquipSale = function (_type, callback) {
      var box = this;
      if (box._lhsEquipSalePending) return false;
      var rows = box._saleList || [], uids = [], seen = {};
      for (var i = 0; i < rows.length; i += 1) {
        var uid = Number(rows[i] && rows[i].uid);
        if (uid > 0 && !seen[uid]) { seen[uid] = true; uids.push(uid); }
      }
      if (!uids.length) return false;
      var auto = settings(), sellAll = !!(auto && auto.isOpen && auto.autoConfig && auto.autoConfig.sellAllEquipments);
      var guard = { finished: false, timer: null, reconciled: false };
      box._lhsEquipSalePending = guard;
      function finishError(reason) {
        if (guard.finished) return;
        guard.finished = true;
        root.clearTimeout(guard.timer);
        if (box._lhsEquipSalePending === guard) box._lhsEquipSalePending = null;
        if (auto) auto.isOpen = false;
        if (root.console && root.console.warn) root.console.warn('[LHS][EquipSale] stopped', reason);
        tip('Chưa xác nhận bán trang bị. Đồ chưa bán được giữ lại; hãy thử lại.');
        if (typeof box.changeState === 'function') box.changeState(3);
      }
      guard.timer = root.setTimeout(function () { finishError('client deadline'); }, 43000);
      function sendAttempt() {
        try {
          box.Rpc(2201, {
          uids: uids,
          autoDelegate: !!(auto && auto.isOpen && auto.autoConfig
            && (auto.autoConfig.autoEquipUpgrade || sellAll)),
          sellAllEquipments: sellAll
          }, function (reply) {
          if (guard.finished) return;
          if (!reply || Number(reply.result || 0) !== 0 || !Array.isArray(reply.uids)
            || !reply.rewardInfo || !Array.isArray(reply.rewardInfo.items)) {
            finishError('invalid response');
            return;
          }
          var requested = {}, sold = {}, ignored = {}, missing = {}, amount = 0;
          uids.forEach(function (id) { requested[id] = true; });
          reply.uids.forEach(function (id) { id = Number(id); if (requested[id]) sold[id] = true; });
          (reply.ignoredUids || []).forEach(function (id) { id = Number(id); if (requested[id]) ignored[id] = true; });
          (reply.missingUids || []).forEach(function (id) { id = Number(id); if (requested[id]) missing[id] = true; });
          var resolved = uids.filter(function (id) { return sold[id] || missing[id]; });
          if (resolved.length && typeof box.removeEquips === 'function') box.removeEquips(resolved);
          box._saleList = (box._saleList || []).filter(function (row) {
            var id = Number(row && row.uid);
            return !sold[id] && !missing[id] && !ignored[id];
          });
          var state = box._lhsAutoSellDropSession;
          if (state) uids.forEach(function (id) {
            if (sold[id] || missing[id] || ignored[id]) delete state.pending[id];
            if (ignored[id]) state.excluded[id] = true;
          });
          reply.rewardInfo.items.forEach(function (row) {
            if (Number(row && row.id) === 2) amount += Number(row.count) || 0;
          });
          if (amount > 0 && typeof box.SaleEquipFlyCoin === 'function') box.SaleEquipFlyCoin(amount);
          emit('EQUIP_SALE_RESPONSE', resolved);
          emit('EQUIP_MATRIX_VIEW_UPDATE');
          if (uids.some(function (id) { return !sold[id] && !missing[id] && !ignored[id]; })) {
            finishError('partial response');
            return;
          }
          if (!sellAll && Object.keys(ignored).length) {
            finishError('protected equipment');
            return;
          }
          guard.finished = true;
          root.clearTimeout(guard.timer);
          if (box._lhsEquipSalePending === guard) box._lhsEquipSalePending = null;
          if (typeof callback === 'function') callback();
          }, function (error) {
            if (!guard.finished && error && error.timeout && !guard.reconciled) {
              guard.reconciled = true;
              root.setTimeout(sendAttempt, 250);
              return;
            }
            finishError(error && (error.code || error.timeout && 'rpc timeout') || 'rpc failed');
          });
        } catch (error) {
          finishError(error && error.message || 'send failed');
        }
      }
      sendAttempt();
      return true;
    };
    proto.sendEquipSale.__lhsAutoSaleReconcileV1 = true;
    proto.sendEquipSale.__lhsOriginal = original;
    api.installed = true;
    if (root.console && root.console.info) root.console.info('[LHS][EquipSale] installed ' + VERSION);
    return true;
  }
  api.install = install;
  install();
}(window));

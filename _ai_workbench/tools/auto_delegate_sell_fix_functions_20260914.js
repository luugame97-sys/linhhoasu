'use strict';
// Function bodies compiled into the native client, globals match its scope.
module.exports = {
  installKeepQualityToggle: function () {
    var parent = this.qualityCheckBox && this.qualityCheckBox.parent;
    if (!parent || this.sellAllEquipmentsBox) return;
    var label = null;
    for (var i = 0; i < parent.numChildren; i++) {
      var child = parent.getChildAt(i);
      if (Number(child.textId) === 30030102) { label = child; break; }
    }
    if (!label) throw new Error('KEEP_QUALITY_LABEL_MISSING');
    label.textId = 0;
    label.text = 'Giữ lại phẩm chất trang bị';
    label.left = 58; label.width = 284; label.size = 20;
    this.qualityCheckBox.width = 200;
    this.qualityCheckBox.right = 9;
    this.sellAllEquipmentsBox = new U.CheckBox;
    this.sellAllEquipmentsBox.left = 12;
    this.sellAllEquipmentsBox.verticalCenter = 0;
    this.sellAllEquipmentsBox.scaleX = .72;
    this.sellAllEquipmentsBox.scaleY = .72;
    this.sellAllEquipmentsBox.skinName = 'CheckBox1Skin';
    this.sellAllEquipmentsBox.selected = U9.autoConfig.sellAllEquipments !== true;
    parent.addChild(this.sellAllEquipmentsBox);
  },
  begin: function () {
    var excluded = {}, old = this.openEquipList || [];
    for (var i = 0; i < old.length; i++) excluded[String(old[i].uid)] = true;
    this._lhsAutoSellDropSession = { excluded: excluded, pending: {} };
  },
  track: function (reward) {
    if (!(U9.isOpen && U9.autoConfig.sellAllEquipments)) return;
    if (!this._lhsAutoSellDropSession) this.beginAutoSellDropSession();
    var state = this._lhsAutoSellDropSession, rows = (reward && reward.equips || []).slice();
    var extra = reward && reward.extraReward || {};
    Object.keys(extra).forEach(function (key) { rows = rows.concat(extra[key] && extra[key].equips || []); });
    for (var i = 0; i < rows.length; i++) {
      var uid = String(rows[i].uid);
      if (Number(uid) > 0 && !state.excluded[uid]) state.pending[uid] = true;
    }
  },
  select: function () {
    if (!(U9.isOpen && U9.autoConfig.sellAllEquipments)) return false;
    var state = this._lhsAutoSellDropSession, seen = {}, rows = this.openEquipList || [], sale = [];
    if (!state) { this.beginAutoSellDropSession(); state = this._lhsAutoSellDropSession; }
    for (var i = 0; i < rows.length; i++) {
      var uid = String(rows[i].uid);
      if (state.pending[uid] && !state.excluded[uid] && !seen[uid]) { sale.push(rows[i]); seen[uid] = true; }
    }
    this._saleList = sale;
    this.changeState(sale.length ? 2 : 3);
    return true;
  },
  sale: function (t, callback) {
    var model = this;
    if (model._lhsEquipSalePending) return;
    var uids = [], seen = {}, rows = model._saleList || [];
    for (var i = 0; i < rows.length; i++) {
      var uid = Number(rows[i].uid);
      if (uid > 0 && !seen[uid]) { uids.push(uid); seen[uid] = true; }
    }
    var sellAll = !!(U9.isOpen && U9.autoConfig.sellAllEquipments);
    var guard = { finished: false, timer: null };
    model._lhsEquipSalePending = guard;
    var fail = function (reason) {
      if (guard.finished) return;
      guard.finished = true; clearTimeout(guard.timer);
      model._lhsEquipSalePending = null;
      U9.isOpen = false;
      console.warn('[LHS][AutoSale] stopped without clearing unsold equipment', reason);
      S.ins().showTips('Chưa xác nhận bán trang bị. Đồ chưa bán được giữ lại; hãy thử lại.');
      model.changeState(3);
    };
    guard.timer = setTimeout(function () { fail('timeout'); }, 12000);
    try {
      model.Rpc(2201, { uids: uids, autoDelegate: !!(U9.isOpen && (U9.autoConfig.autoEquipUpgrade || sellAll)), sellAllEquipments: sellAll }, function (reply) {
        if (guard.finished) return;
        if (!reply || (reply.result != null && Number(reply.result) !== 0) || !Array.isArray(reply.uids) || !reply.rewardInfo || !Array.isArray(reply.rewardInfo.items)) return fail('invalid response');
        var sold = {}, ignored = {}, requested = {}, amount = 0;
        uids.forEach(function (id) { requested[id] = true; });
        reply.uids.forEach(function (id) { if (requested[id]) sold[id] = true; });
        (reply.ignoredUids || []).forEach(function (id) { if (requested[id]) ignored[id] = true; });
        var confirmed = uids.filter(function (id) { return sold[id]; });
        model.removeEquips(confirmed);
        model._saleList = (model._saleList || []).filter(function (row) { return !sold[row.uid] && !ignored[row.uid]; });
        var state = model._lhsAutoSellDropSession;
        if (state) uids.forEach(function (id) {
          if (sold[id] || ignored[id]) delete state.pending[id];
          if (ignored[id]) state.excluded[id] = true; // retained, never pretend it was sold
        });
        reply.rewardInfo.items.forEach(function (row) { if (Number(row.id) === 2) amount += Number(row.count) || 0; });
        model.SaleEquipFlyCoin(amount);
        A.ins().dispatch(E.EQUIP_SALE_RESPONSE, confirmed);
        A.ins().dispatch(E.EQUIP_MATRIX_VIEW_UPDATE);
        if (uids.some(function (id) { return !sold[id] && !ignored[id]; })) return fail('partial response');
        if (!sellAll && Object.keys(ignored).length) return fail('protected equipment');
        guard.finished = true; clearTimeout(guard.timer); model._lhsEquipSalePending = null;
        if (callback) callback();
      });
    } catch (error) { fail(error && error.message || 'send failed'); }
  },
  continueSale: function () {
    var model = Y.BoxLayerModel;
    if (!model.doEquipSale(0, function () {
      if (U9.isOpen && U9.autoConfig.sellAllEquipments) model.changeState(3);
      else model.changeState(model.getEquipListLength() > 0 ? 6 : 3);
    })) { U9.isOpen = false; model.changeState(6); }
  },
};

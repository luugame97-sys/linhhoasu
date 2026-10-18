(function (root) {
  'use strict';
  if (root.LhsFarmSocialOffline) return;
  var api = root.LhsFarmSocialOffline = { version: '20260910_social_only_v1', installed: false };
  var tries = 0;
  function manager() { return root.GlobalManager || root.GameGlobalYDXZ || root.W; }
  function notice(text) { if (root.UserTips && root.UserTips.ins) root.UserTips.ins().showTips(text); }
  function install() {
    var m = manager();
    var Alliance = root.AllianceModel && root.AllianceModel.prototype;
    if (!m || !Alliance) {
      if (++tries < 200) root.setTimeout(install, 100);
      else console.warn('[Farm social] installation pending', !!m, !!Alliance);
      return;
    }
    var originalAssist = Alliance.sendAssistOther;
    Alliance.sendAssistOther = function (owner, type, index, uid) {
      if (type !== 2 && type !== 3) return originalAssist.apply(this, arguments);
      var self = this;
      var key = String(uid);
      self._lhsFarmAssistPending = self._lhsFarmAssistPending || {};
      if (self._lhsFarmAssistPending[key]) return;
      self._lhsFarmAssistPending[key] = true;
      function done() { delete self._lhsFarmAssistPending[key]; }
      self.Rpc(1519, { playerId: owner, type: type, index: index, uid: uid }, function (data) {
        done();
        notice(data && data.result === 1 ? 'Đã trợ giúp.' : 'Yêu cầu đã hết hạn, đã giúp hoặc hết lượt hôm nay.');
        root.MessageCenter.ins().dispatch(root.MessageDef.Guild_Assist_Update);
      }, self, function () {
        done();
        notice('Chưa xác nhận trợ giúp. Có thể thử lại cùng yêu cầu.');
      });
    };
    var added = Alliance.onAddRecord;
    Alliance.onAddRecord = function (data) {
      if (data && data.record && data.record.farmAssist && this._recordData) {
        var list = this._recordData.records || [];
        var found = list.filter(function (row) { return row.uid === data.record.uid; })[0];
        if (found) {
          Object.assign(found, data.record);
          root.MessageCenter.ins().dispatch(root.MessageDef.Guild_Assist_Update);
          return;
        }
      }
      return added.apply(this, arguments);
    };
    var AssistItem = root.AllianceAssistItem && root.AllianceAssistItem.prototype;
    if (AssistItem) {
      var changed = AssistItem.dataChanged;
      AssistItem.dataChanged = function () {
        var records = m.AllianceModel.getRecordDataList();
        var row = this.data && records.filter(function (item) { return item.uid === this.data.uid; }, this)[0];
        if (row && row.farmAssist) this.data.helperCount = row.helperLimit;
        return changed.apply(this, arguments);
      };
    }
    api.installed = true;
    console.info('[Farm social] installed ' + api.version);
  }
  install();
})(window);

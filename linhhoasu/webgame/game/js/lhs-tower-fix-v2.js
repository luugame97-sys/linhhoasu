/* Tower sweep: one in-flight request, stable retry ID, server-confirmed state. */
(function(root) {
  'use strict';
  if (root.LhsTowerFixV2) return;
  var api = root.LhsTowerFixV2 = { version: '20261018_tower_fix_v3' };
  var pending = false, request = null, actor = '', installed = false, attempt = 0;
  function manager() { return root.GlobalManager || root.GameGlobalYDXZ || root.W || {}; }
  function owner() { var m = manager(), u = root.UserInfo || {}; return m.ActorModel && m.ActorModel.actorID ? u.ServerID + ':' + u.UserID + ':' + m.ActorModel.actorID : ''; }
  function tips(text) { if (root.UserTips && root.UserTips.ins) root.UserTips.ins().showTips(text); }
  function refresh() { if (root.LhsTowerDaily) root.LhsTowerDaily.refresh(); }
  function hasSkillChoice(m) {
    var info = m && m.towerInfo;
    return !!info && (Number(info.skillCount) > 0 || Array.isArray(info.skills) && info.skills.length > 0);
  }
  function send() {
    var m = manager().ClimbingTowerModel, id = owner();
    if (!id || !m || pending) return;
    // A stale sweep button must reopen the existing choices, never discard them.
    if (hasSkillChoice(m)) return m.continueFighting();
    if (actor !== id) { actor = id; request = null; }
    if (!request) request = { requestId: Date.now() + '-tower_' + Math.random().toString(36).slice(2, 14) };
    var params = request;
    var currentAttempt = ++attempt;
    pending = true;
    var timer = root.setTimeout(function() { if (attempt !== currentAttempt) return; pending = false; tips('Chưa nhận được kết quả. Bấm quét để kiểm tra lại cùng giao dịch.'); }, 10000);
    function finish() { root.clearTimeout(timer); if (attempt === currentAttempt) pending = false; }
    try {
      m.Rpc(3705, params, function(r) {
        finish();
        if (owner() !== id || request !== params) return;
        if (!r || r.result !== 0) {
          tips(r && r.msg || 'Không thể quét. Vui lòng thử lại.');
          // An uncertain commit must retain the ID for reconciliation after login.
          if (r && r.code !== 'TOWER_SAVE_UNCONFIRMED') request = null;
          refresh(); return;
        }
        request = null;
        if (root.LhsTowerDaily) root.LhsTowerDaily.apply(r.updateInfo);
        else if (r.updateInfo) m.initData(r.updateInfo);
        refresh();
        tips(r.replay ? 'Đã xác nhận kết quả quét trước đó.' : 'Đã quét ' + Number(r.sweepCount || 0) + ' tầng.');
      }, function() { finish(); tips('Kết nối gián đoạn. Bấm quét để kiểm tra lại kết quả.'); });
    } catch (_) { finish(); tips('Chưa gửi được yêu cầu quét.'); }
  }
  function install() {
    var m = manager().ClimbingTowerModel;
    if (!m || typeof m.onFighting !== 'function' || typeof m.Rpc !== 'function') return false;
    if (!m.__lhsTowerFixV2) {
      var fight = m.onFighting, rpc = m.Rpc;
      m.onFighting = function(state) {
        if (hasSkillChoice(this)) return this.continueFighting();
        return Number(state) === 3 ? send() : fight.apply(this, arguments);
      };
      m.Rpc = function(tag, data, ok, error) {
        if ([3700, 3702, 3703].indexOf(Number(tag)) < 0) return rpc.apply(this, arguments);
        var self = this;
        return rpc.call(this, tag, data, function(r) {
          if (!r || r.result !== 0) { tips(r && r.msg || 'Chưa cập nhật được kỹ năng.'); refresh(); if (typeof error === 'function') error.call(self, r); return; }
          if (typeof ok === 'function') ok.call(self, r);
        }, error);
      };
      m.__lhsTowerFixV2 = true;
    }
    return true;
  }
  api.send = send;
  (function tick() { installed = install(); api.installed = installed; root.setTimeout(tick, 1000); }());
}(window));

/* Server calendar for independent CrossArena and alternating cross events. */
(function (root) {
  'use strict';
  var VERSION = '20261003_toparena_v3';
  if (root.LhsCrossEvents && root.LhsCrossEvents.version === VERSION) return;
  var api = root.LhsCrossEvents = { version: VERSION, snapshot: null, receivedAt: 0, installed: false };
  var pending = false, sequence = 0, lastRequest = 0, identity = '', lastSignature = '';
  function manager() { return root.GlobalManager || root.GameGlobalYDXZ || root.W || {}; }
  function type(name) {
    var item = manager()[name] || root[name];
    if (typeof item === 'function') return item;
    if (item && item.constructor !== Object) return item.constructor;
    try { return root.egret && root.egret.getDefinitionByName(name); } catch (_) { return null; }
  }
  function actor() {
    var user = root.UserInfo || {}, model = manager().ActorModel;
    return model && model.actorID ? String(user.ServerID) + ':' + String(user.UserID) + ':' + String(model.actorID) : '';
  }
  function serverNow() { return api.snapshot ? Number(api.snapshot.serverTime) + Date.now() - api.receivedAt : 0; }
  function state(event) { return api.snapshot && api.snapshot.events[event]; }
  function isOpen(event) {
    var row = state(event), now = serverNow();
    return !!(row && row.open && row.cycle && Date.now() - api.receivedAt < 65000 && now >= row.cycle.startTime && now < row.cycle.endTime);
  }
  function dispatch(name, value) {
    var center = root.MessageCenter, key = (root.MessageDef || {})[name] || name;
    if (center && center.ins) center.ins().dispatch(key, value);
  }
  function notice(message) { var tips = root.UserTips; if (tips && tips.ins) tips.ins().showTips(message); }
  function applyModel(event) {
    var m = manager(), row = state(event), model = event === 'topArena' ? m.TopArenaModel : m.CrossRivalModel;
    if (!row || !model || typeof model === 'function') return;
    var cfg = m.Config || root.Config, current = row.cycle;
    if (cfg && row.matchConfig) {
      var name = event === 'topArena' ? 'TopArenaOpenConfig' : 'CrossRivalOpenConfig';
      cfg[name] = cfg[name] || {}; cfg[name][row.matchConfig.id] = row.matchConfig;
    }
    if (event === 'topArena') {
      // This switch is supplied by the authoritative calendar. Native unlock
      // checks and the server's level/day/pool gate still apply independently.
      if (root.AppInfo && root.AppInfo.params) root.AppInfo.params.topArenaOpen = 1;
      var info = model.info || (model.info = {});
      var changed = current && info.cycleKey !== current.key;
      if (changed) { model.matchInfo = null; model.showInfo = null; model.selfRoomIdMap = {}; model.challengeInfo = null; }
      info.stage = isOpen(event) ? (row.info ? row.info.stage : serverNow() < row.matchConfig.promotionStartTime ? 1 : 2) : 0;
      info.startTime = current ? current.startTime : 0; info.endTime = current ? current.endTime : 0;
      info.matchId = current ? row.matchConfig.id : 0; info.season = current ? current.index + 1 : 0;
      info.cycleKey = current ? current.key : ''; info.round = row.info ? row.info.round : info.round || 0;
      if (row.info) info.step = row.info.step;
    } else if (model._crossRivalInfo) {
      var rival = model._crossRivalInfo;
      rival.stage = isOpen(event) ? (rival.stage || 2) : 0;
      rival.matchId = current ? row.matchConfig.id : rival.matchId;
      rival.endTime = current ? current.endTime : 0;
    }
  }
  function apply(payload) {
    if (!payload || payload.result !== 0 || !payload.events || !Number.isFinite(payload.serverTime)
        || ['crossArena','crossRival','topArena'].some(function (e) { return !payload.events[e]; })) return false;
    if (root.UserInfo && root.UserInfo.ServerID != null && Number(payload.serverId) !== Number(root.UserInfo.ServerID)) return false;
    api.snapshot = payload; api.receivedAt = Date.now();
    applyModel('crossRival'); applyModel('topArena');
    var signature = ['crossArena','crossRival','topArena'].map(function (e) {
      var row = state(e); return e + ':' + row.open + ':' + (row.cycle && row.cycle.key || '') + ':' + row.reason;
    }).join('|') + ':' + (manager().TopArenaModel && manager().TopArenaModel.info && manager().TopArenaModel.info.stage || 0);
    if (signature !== lastSignature) {
      lastSignature = signature;
      var m = manager();
      dispatch('CROSS_RIVAL_INFO_UPDATE'); dispatch('TOP_ARENA_STAGE_UPDATE', m.TopArenaModel && m.TopArenaModel.info && m.TopArenaModel.info.stage || 0);
      var center = root.MessageCenter;
      if (center && center.ins) center.ins().dispatch(((root.MessageDef || {}).SYSTEM_UNLOCK_UPDATE || 'SYSTEM_UNLOCK_UPDATE') + 317);
      dispatch('MAINPANEL_CHANGE_BUTTON_GROUP_STATE');
      if (isOpen('topArena') && m.TopArenaModel && typeof m.TopArenaModel.Rpc === 'function') m.TopArenaModel.Rpc(6200, {});
      if (isOpen('crossRival') && m.CrossRivalModel && typeof m.CrossRivalModel.Rpc === 'function') m.CrossRivalModel.Rpc(6560, {});
    }
    return true;
  }
  function reset() { sequence++; pending = false; lastRequest = 0; api.snapshot = null; lastSignature = ''; }
  function refresh() {
    var m = manager(), model = m.ArenaModel, owner = actor();
    if (!owner || !model || typeof model.Rpc !== 'function' || pending) return;
    pending = true; lastRequest = Date.now(); var request = ++sequence;
    var timeout = root.setTimeout(function () { if (sequence === request) pending = false; }, 8000);
    try { model.Rpc(6199, {}, function (payload) {
      root.clearTimeout(timeout);
      if (sequence !== request || actor() !== owner) return;
      pending = false; apply(payload);
    }, function () { root.clearTimeout(timeout); if (sequence === request) pending = false; }); }
    catch (_) { root.clearTimeout(timeout); pending = false; }
  }
  function patchModel(name, event, openMethod, infoMethod) {
    var Type = type(name), p = Type && Type.prototype;
    if (!p || p.__lhsParallelV2 || typeof p[openMethod] !== 'function') return !!(p && p.__lhsParallelV2);
    var nativeOpen = p[openMethod], nativeInfo = p[infoMethod], rpc = p.Rpc, close = p.OnSocketClose;
    p[openMethod] = function () { return isOpen(event) && nativeOpen.apply(this, arguments); };
    if (nativeInfo) p[infoMethod] = function (payload) {
      var result = nativeInfo.apply(this, arguments); applyModel(event); return result;
    };
    if (rpc) p.Rpc = function (tag, data, callback, error) {
      var self = this, owner = actor();
      return rpc.call(this, tag, data, function (response) {
        if (actor() !== owner) return;
        if (response && response.schedule) apply(response.schedule);
        if (response && /^CROSS_EVENT_/.test(response.code || '')) { notice(response.msg); if (error) error.call(self); return; }
        if (callback) callback.call(self, response);
      }, error);
    };
    p.OnSocketClose = function () { reset(); if (close) return close.apply(this, arguments); };
    p.__lhsParallelV2 = true; return true;
  }
  function patchCrossView() {
    var Type = type('CrossArenaRankView');
    if (Type && Type.openCheck && !Type.__lhsParallelV2) {
      var open = Type.openCheck;
      Type.openCheck = function (tips) { if (!isOpen('crossArena')) { if (tips !== false) notice('Chưa đủ điều kiện mở Đỉnh Phong Diễn Võ.'); refresh(); return false; } return open.apply(this, arguments); };
      Type.__lhsParallelV2 = true;
    }
    var Icon = type('CrossArenaIconRule'), p = Icon && Icon.prototype;
    if (p && p.checkShowIcon && !p.__lhsParallelV2) {
      var check = p.checkShowIcon;
      p.checkShowIcon = function () { var shown = check.apply(this, arguments); if (!isOpen('crossArena')) this.tar.setUnlock(false); return shown; };
      p.__lhsParallelV2 = true;
    }
    // The old icon timer describes a fixed daily phase, not this weekly cycle.
    var RivalIcon = type('CrossRivalIconRule'), r = RivalIcon && RivalIcon.prototype;
    if (r && r._updateIconRule && !r.__lhsParallelV2) {
      r._updateIconRule = function () {
        var row = state('crossRival'), label = this.tar.timeLabel;
        if (label && row) { label.visible = isOpen('crossRival'); label.SetCallbackFunc(null); if (row.cycle) label.SetEndTime(row.cycle.endTime / 1000); }
      };
      r.__lhsParallelV2 = true;
    }
  }
  function install() {
    var rival = patchModel('CrossRivalModel','crossRival','checkActivityIsOpen','doCrossRivalInfo');
    var top = patchModel('TopArenaModel','topArena','IsTopArenaOpen','onInfoUpdate');
    patchCrossView(); api.installed = rival && top; return api.installed;
  }
  api.apply = apply; api.refresh = refresh; api.isOpen = isOpen; api.install = install; api.reset = reset;
  (function tick() {
    install(); var owner = actor();
    if (owner !== identity) { identity = owner; reset(); }
    if (owner && Date.now() - lastRequest >= 30000) refresh();
    root.setTimeout(tick, 1000);
  }());
}(window));

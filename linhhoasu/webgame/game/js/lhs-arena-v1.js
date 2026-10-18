/* Võ Đạo Hội client contract guard. Server remains authoritative for rank,
 * costs, cooldowns and challenge state; this patch only hydrates/repairs UI. */
(function (root) {
  'use strict';

  var VERSION = '20260917_competitions_contract_v3';
  if (root.LhsArenaContractV1 && root.LhsArenaContractV1.version === VERSION) return;
  var api = root.LhsArenaContractV1 = { version: VERSION, installed: false, patched: [] };

  function manager() {
    return root.GlobalManager || root.GameGlobalYDXZ || root.W || null;
  }

  function prototypeFor(instanceName, globalName) {
    var m = manager();
    var instance = m && m[instanceName];
    if (typeof instance === 'function') return instance.prototype;
    if (instance && instance.constructor && instance.constructor !== Object && instance.constructor.prototype) return instance.constructor.prototype;
    var Type = root[globalName];
    if (!Type && root.egret && root.egret.getDefinitionByName) Type = root.egret.getDefinitionByName(globalName);
    return Type && Type.prototype ? Type.prototype : null;
  }

  function dispatch(eventName) {
    var centerType = root.MessageCenter;
    if (!centerType || typeof centerType.ins !== 'function') return;
    var center = centerType.ins();
    if (center && typeof center.dispatch === 'function') center.dispatch(eventName);
  }

  function event(name) {
    var def = root.MessageDef || {};
    return def[name] || name;
  }

  function mergePayload(model, payload) {
    if (!payload || typeof payload !== 'object' || Number(payload.result) === -1) return false;
    var arenaInfo = model.arenaInfo || (model.arenaInfo = {});
    ['score', 'dailyCount', 'maxCount', 'refreshtime', 'challengeVersion', 'challengelist', 'loglist', 'cycleKey', 'open', 'endTime'].forEach(function (key) {
      if (payload[key] !== undefined) arenaInfo[key] = payload[key];
    });
    if (Array.isArray(payload.ranklist) || Array.isArray(payload.toplist) || payload.rank !== undefined) {
      var rank = model.rankInfo || (model.rankInfo = {});
      ['rank', 'ranklist', 'toplist', 'score'].forEach(function (key) {
        if (payload[key] !== undefined) rank[key] = payload[key];
      });
    }
    return true;
  }

  var serial = 0;
  var stateRevision = 0;
  function actorKey() {
    var m = manager(), actor = m && m.ActorModel;
    var user = root.UserInfo || root.AccountInfo || {};
    // actorID is recreated on reconnect; account/user id is the stable scope
    // needed for idempotent mutation intents in sessionStorage.
    var stable = user.UserID || user.userId || user.uid || user.accountId || (actor && (actor.userId || actor.uid));
    return String(user.ServerID || user.serverId || 'unknown-server') + ':' + String(stable || 'anonymous');
  }
  function notice(message) {
    api.lastError = message;
    var Type = root.UserTips;
    if (Type && Type.ins && Type.ins().showTips) Type.ins().showTips(message);
    else if (root.console && root.console.warn) root.console.warn('[Arena] ' + message);
  }
  function intent(model, key, payload) {
    var storageKey = 'lhs-arena-v2-intent:' + actorKey() + ':' + key;
    var record;
    try { record = JSON.parse(root.sessionStorage.getItem(storageKey)); } catch (_) {}
    model.__lhsArenaIntents = model.__lhsArenaIntents || {};
    record = record || model.__lhsArenaIntents[storageKey];
    if (!record || !record.payload || typeof record.payload.requestId !== 'string') {
      var random = root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : Date.now().toString(36) + '-' + (++serial) + '-' + Math.random().toString(36).slice(2);
      record = {payload: Object.assign({}, payload || {}, {requestId: 'arena-' + random})};
      try { root.sessionStorage.setItem(storageKey, JSON.stringify(record)); } catch (_) {}
    }
    model.__lhsArenaIntents[storageKey] = record;
    return { payload: JSON.parse(JSON.stringify(record.payload)), clear: function () {
      delete model.__lhsArenaIntents[storageKey];
      try { root.sessionStorage.removeItem(storageKey); } catch (_) {}
    } };
  }
  function invalidate(model) {
    model.__lhsArenaEpoch = (model.__lhsArenaEpoch || 0) + 1;
    var pending = model.__lhsArenaPending || {};
    Object.keys(pending).forEach(function (key) { root.clearTimeout(pending[key].timer); });
    model.__lhsArenaPending = {};
    model.__lhsArenaRefreshPending = false;
  }
  // Timeout is UNKNOWN, never a synthetic success. The next click reuses the
  // persisted id so a server receipt can return the original committed result.
  function call(model, rpc, tag, payload, callback, error, key, mutation) {
    var pending = model.__lhsArenaPending || (model.__lhsArenaPending = {});
    if (pending[key]) return;
    var entry = {}, epoch = model.__lhsArenaEpoch || 0, actor = actorKey(), revision = stateRevision;
    var request = mutation ? intent(model, key, payload) : null;
    if (request) payload = request.payload;
    pending[key] = entry;
    if (tag === 2601 || tag === 5001) model.__lhsArenaRefreshPending = true;
    function finish() {
      if (pending[key] !== entry) return false;
      delete pending[key]; root.clearTimeout(entry.timer);
      if (tag === 2601 || tag === 5001) model.__lhsArenaRefreshPending = false;
      return epoch === (model.__lhsArenaEpoch || 0) && actor === actorKey();
    }
    function fail(reason) {
      if (!finish()) return;
      notice(reason || 'Mất kết nối đấu trường. Hãy thử lại để kiểm tra kết quả.');
      if (typeof error === 'function') error.call(model);
    }
    entry.timer = root.setTimeout(function () { fail('Đấu trường chưa nhận được phản hồi. Hãy thử lại để đồng bộ.'); }, 15000);
    try {
      return rpc.call(model, tag, payload, function (response) {
        if (!finish()) return;
        // A list/rank query started before a committed refresh/fight cannot
        // overwrite the newer challenge snapshot, even if its reply is late.
        if (!mutation && revision !== stateRevision) return;
        if (!response || typeof response !== 'object' || Number(response.result) === -1) {
          // Only explicit final errors retire an intent; busy/unknown must retry it.
          if (request && response && response.retryable === false) request.clear();
          if (response && response.open === false && (tag >= 5000 && tag <= 5002 || payload && [16,17].indexOf(Number(payload.type)) >= 0)) {
            var crossModel = manager() && manager().CrossArenaModel;
            if (crossModel) { crossModel.arenaInfo = {challengelist: [], loglist: [], open: false}; crossModel.rankInfo = {ranklist: [], toplist: [], rank: -1}; }
            dispatch(event('ARENA_CHALLENGE_VIEW_UPDATE')); dispatch(event('ARENA_RANK_VIEW_UPDATE'));
          }
          notice(response && (response.message || response.msg) || 'Yêu cầu Võ Đạo Hội bị từ chối.');
          if (typeof error === 'function') error.call(model, response);
          return;
        }
        if (tag === 2300 && (!response.fightResult || !Array.isArray(response.fightResult.entitys) || response.fightResult.entitys.length < 2 || typeof response.enemyid !== 'string')) {
          notice('Dữ liệu trận đấu chưa đầy đủ. Hãy thử lại để đồng bộ.'); return;
        }
        if (request) request.clear();
        if (mutation) stateRevision += 1;
        callback.call(model, response);
      }, function () { fail(); });
    } catch (_) { fail('Không gửi được yêu cầu Võ Đạo Hội. Hãy kết nối lại rồi thử lại.'); }
  }

  function patchArenaModel(proto, crossMode) {
    if (!proto || proto === Function.prototype || proto.__lhsArenaContractV2) return false;
    proto.onArenaInfo = function (payload) {
      if (!payload || Number(payload.result) === -1) return;
      invalidate(this);
      stateRevision += 1;
      this.arenaInfo = { challengelist: [], loglist: [] };
      this.rankInfo = {};
      mergePayload(this, payload);
    };
    var originalInfoUpdate = proto.onArenaInfoUpdate;
    proto.onArenaInfoUpdate = function (payload) {
      if (!mergePayload(this, payload)) return;
      if (originalInfoUpdate && payload.score !== undefined) originalInfoUpdate.apply(this, arguments);
      else dispatch(event('ARENA_RANK_VIEW_UPDATE'));
    };
    var close = proto.OnSocketClose;
    proto.OnSocketClose = function () { invalidate(this); if (close) return close.apply(this, arguments); };
    proto.onArenaLogAdd = function (payload) {
      if (!payload || !payload.loginfo || payload.loginfo.uid == null) return;
      var info = this.arenaInfo || (this.arenaInfo = {challengelist: []});
      var list = info.loglist || (info.loglist = []), row = payload.loginfo;
      var index = list.findIndex(function (entry) { return String(entry.uid) === String(row.uid); });
      if (index >= 0) list[index] = row; else list.push(row);
      dispatch(event('ARENA_LOG_VIEW_UPDATE'));
    };
    proto.requestRankInfo = function () {
      var self = this;
      call(this, this.Rpc, crossMode ? 5000 : 2600, null, function (payload) {
        if (!mergePayload(self, payload)) return;
        dispatch(event('ARENA_RANK_VIEW_UPDATE'));
        dispatch(event('ARENA_CHALLENGE_VIEW_UPDATE'));
      }, null, crossMode ? 'cross-rank' : 'rank', false);
    };
    proto.requestGetChallengeList = function () {
      var self = this;
      call(this, this.Rpc, crossMode ? 5002 : 2602, null, function (payload) {
        if (!mergePayload(self, payload)) return;
        dispatch(event('ARENA_CHALLENGE_VIEW_UPDATE'));
      }, null, crossMode ? 'cross-list' : 'list', false);
    };
    proto.requestRefreshChllengeList = function () {
      var self = this;
      var data = {challengeVersion: self.arenaInfo && self.arenaInfo.challengeVersion || ''};
      if (crossMode) data.cycleKey = self.arenaInfo && self.arenaInfo.cycleKey || '';
      call(this, this.Rpc, crossMode ? 5001 : 2601, data, function (payload) {
        if (!mergePayload(self, payload)) return;
        dispatch(event('ARENA_CHALLENGE_VIEW_UPDATE'));
        dispatch(event('ARENA_RANK_VIEW_UPDATE'));
      }, null, crossMode ? 'cross-refresh' : 'refresh', true);
    };
    proto.__lhsArenaContractV2 = true;
    if (crossMode) proto.__lhsCrossArenaContractV3 = true;
    api.patched.push(crossMode ? 'CrossArenaModel' : 'ArenaModel');
    return true;
  }

  function patchRankView(proto) {
    if (!proto || typeof proto.updateUI !== 'function' || proto.__lhsArenaRankContractV1) return false;
    var original = proto.updateUI;
    proto.updateUI = function () {
      var result = original.apply(this, arguments);
      var m = manager();
      var arena = m && m.ArenaModel;
      var authoritative = arena && typeof arena.getSlefRank === 'function' ? Number(arena.getSlefRank()) : 0;
      if (!(authoritative > 0)) return result;
      if (this.selfItem && this.selfItem.data && this.selfItem.data.rankItemData) {
        this.selfItem.data.rankItemData.rank = authoritative;
        this.selfItem.data = this.selfItem.data;
      }
      var provider = this.list && this.list.dataProvider;
      var actorModel = (m && m.ActorModel) || root.ActorModel;
      var actor = actorModel && actorModel.actorID;
      var ranks = arena && typeof arena.getRankList === 'function' ? arena.getRankList() : [];
      if (provider && typeof provider.getItemAt === 'function' && actor != null) {
        for (var i = 0; i < provider.length; i += 1) {
          var row = provider.getItemAt(i);
          var info = row && row.rankItemData && row.rankItemData.playerIconData;
          if (!info) continue;
          var source = ranks[i];
          if (source && Number(source.rank) > 0) row.rankItemData.rank = Number(source.rank);
          if (String(info.playerId) === String(actor)) row.rankItemData.rank = authoritative;
          if (typeof provider.replaceItemAt === 'function') provider.replaceItemAt(row, i);
        }
      }
      return result;
    };
    proto.__lhsArenaRankContractV1 = true;
    api.patched.push('ArenaRankView');
    return true;
  }

  function patchRaidInfo(proto) {
    if (!proto || proto === Function.prototype || typeof proto.sendStartFightPart !== 'function' || proto.__lhsArenaRaidContractV2) return false;
    var rpc = proto.Rpc;
    if (typeof rpc !== 'function') return false;
    proto.Rpc = function (tag, payload, callback, error) {
      if (Number(tag) !== 2300 || !payload || [2, 3, 16, 17].indexOf(Number(payload.type)) < 0) return rpc.apply(this, arguments);
      // Version is inside the immutable intent, not its lookup key. Reconnect
      // can replace the visible list while the previous target's result is UNKNOWN.
      var key = 'fight:' + Number(payload.type) + ':' + String(payload.enemyid || '');
      return call(this, rpc, tag, payload, function (response) {
        var m = manager(), arena = m && ([16,17].indexOf(Number(payload.type)) >= 0 ? m.CrossArenaModel : m.ArenaModel);
        if (arena) mergePayload(arena, response);
        if (typeof callback === 'function') callback.call(this, response);
      }, error, key, true);
    };
    var close = proto.OnSocketClose;
    proto.OnSocketClose = function () { invalidate(this); if (close) return close.apply(this, arguments); };
    var original = proto.sendStartFightPart;
    proto.sendStartFightPart = function (payload) {
      var next = payload;
      if (payload && [2,16].indexOf(Number(payload.type)) >= 0 && !payload.challengeVersion) {
        var m = manager();
        var arena = m && (Number(payload.type) === 16 ? m.CrossArenaModel : m.ArenaModel);
        var list = arena && typeof arena.getChallengeList === 'function' ? arena.getChallengeList() : [];
        var enemy = String(payload.enemyid || '');
        for (var i = 0; i < list.length; i += 1) {
          var row = list[i];
          if (row && (String(row.dbid) === enemy || String(row.playerId) === enemy)) {
            next = Object.assign({}, payload, { challengeVersion: row.challengeVersion || '' });
            if (Number(payload.type) === 16) next.cycleKey = row.cycleKey || arena.arenaInfo && arena.arenaInfo.cycleKey || '';
            break;
          }
        }
      }
      if (payload && [3,17].indexOf(Number(payload.type)) >= 0) {
        // Native revenge passes log.uid, not player dbid. Keep it intact.
        next = Object.assign({}, next, {logUid: String(payload.enemyid || '')});
        if (Number(payload.type) === 17) {
          var crossInfo = manager() && manager().CrossArenaModel && manager().CrossArenaModel.arenaInfo || {};
          next.challengeVersion = crossInfo.challengeVersion || '';
          next.cycleKey = crossInfo.cycleKey || '';
        }
      }
      return original.apply(this, [next].concat(Array.prototype.slice.call(arguments, 1)));
    };
    proto.__lhsArenaRaidContractV2 = true;
    api.patched.push('RaidInfoModel');
    return true;
  }

  function install() {
    var arena = prototypeFor('ArenaModel', 'ArenaModel');
    var rank = prototypeFor('ArenaRankView', 'ArenaRankView');
    var raid = prototypeFor('RaidInfoModel', 'RaidInfoModel');
    var cross = prototypeFor('CrossArenaModel', 'CrossArenaModel');
    patchArenaModel(arena); patchRankView(rank); patchRaidInfo(raid); patchArenaModel(cross, true);
    api.crossInstalled = !!(cross && cross.__lhsCrossArenaContractV3);
    api.installed = !!(arena && arena.__lhsArenaContractV2 && rank && rank.__lhsArenaRankContractV1 && raid && raid.__lhsArenaRaidContractV2);
    return api.installed;
  }

  api.install = install;
  (function retry() {
    if (!install()) root.setTimeout(retry, 250);
  }());
}(window));

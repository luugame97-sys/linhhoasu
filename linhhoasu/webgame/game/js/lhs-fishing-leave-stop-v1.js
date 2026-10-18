/* Stop online auto-fishing when the fishing room is left. */
(function (root) {
  'use strict';

  var VERSION = '20260926_fishing_leave_stop_v2';
  if (root.LhsFishingLeaveStopV1 && root.LhsFishingLeaveStopV1.version === VERSION) return;

  var api = root.LhsFishingLeaveStopV1 = {
    version: VERSION,
    installed: false,
    attempts: 0,
    patched: [],
    leaveRequests: 0,
    invalidations: 0,
    ignoredEntries: 0
  };

  function manager() {
    return root.GlobalManager || root.GameGlobalYDXZ || root.W || root.Y || null;
  }

  function prototypeOf(value) {
    if (!value) return null;
    if (value.constructor && value.constructor.prototype) return value.constructor.prototype;
    return Object.getPrototypeOf ? Object.getPrototypeOf(value) : null;
  }

  function fishModel() {
    var m = manager();
    return (m && m.FishingModel) || root.FishingModel || null;
  }

  function fishRoomModel() {
    var m = manager();
    return (m && m.FishRoomModel) || root.FishRoomModel || null;
  }

  function currentRaid() {
    var m = manager();
    return m && m.RaidMgr && m.RaidMgr.mFishRaid;
  }

  function setValue(target, key, value) {
    try { target[key] = value; } catch (_) {}
  }

  function invalidate(model) {
    if (!model) return;
    setValue(model, 'isAutoFish', false);
    setValue(model, '_autoPowerGeneration', (Number(model._autoPowerGeneration) || 0) + 1);
    setValue(model, '_catchRequestPending', false);
    setValue(model, '_autoPowerPending', false);
    setValue(model, 'fishing', false);
    setValue(model, 'clickProtect', false);
    setValue(model, 'changeSceneCallBack', null);
    if (root.OldTrekFishingModel) setValue(root.OldTrekFishingModel, 'isAutoFish', false);
    api.invalidations += 1;
  }

  function clearPending(model) {
    if (!model) return;
    setValue(model, '__lhsFishingLeavePending', false);
    setValue(model, '__lhsFishingLeaveRaid', null);
  }

  function clearRaid(raid) {
    var m = manager(), raids = m && m.RaidMgr;
    if (!raid || !raids || raids.mFishRaid !== raid || typeof raids.FishMapClear !== 'function') return;
    try { raids.FishMapClear(); } catch (_) {}
  }

  function requestLeave(model, raid) {
    if (!model) return false;
    if (model.__lhsFishingLeavePending === true) return true;
    api.leaveRequests += 1;
    // A room-change request can leave this flag set while the user presses
    // Back. Leaving the room takes precedence over that transition.
    setValue(model, '_fishRoomChanging', false);

    if (typeof model.cs_fish_map_leave === 'function') {
      try {
        // The patched method owns the pending marker. Setting it here first
        // makes the wrapper think another leave is already in flight and
        // suppress its own 4051 RPC.
        return model.cs_fish_map_leave() !== false;
      } catch (_) {}
    }
    if (typeof model.Rpc !== 'function') {
      clearPending(model);
      return false;
    }
    setValue(model, '__lhsFishingLeavePending', true);
    setValue(model, '__lhsFishingLeaveRaid', raid || null);
    try {
      model.Rpc(4051, {}, function (data) {
        clearPending(model);
        if (data && Number(data.result) === 0) clearRaid(raid);
      }, model);
      return true;
    } catch (_) {
      clearPending(model);
      return false;
    }
  }

  function patchLeave(model) {
    var proto = prototypeOf(model);
    if (!proto || typeof proto.cs_fish_map_leave !== 'function') proto = model;
    if (!proto || typeof proto.cs_fish_map_leave !== 'function') return false;
    var original = proto.cs_fish_map_leave;
    if (original.__lhsFishingLeaveStopV1) return true;
    proto.cs_fish_map_leave = function () {
      var raid = currentRaid();
      invalidate(this);
      // The native method refuses to leave while a scene change is flagged.
      // A user-initiated leave supersedes that transition; the generation
      // bump above makes its late ACK harmless.
      setValue(this, '_fishRoomChanging', false);
      if (this.__lhsFishingLeavePending === true) return false;
      setValue(this, '__lhsFishingLeavePending', true);
      setValue(this, '__lhsFishingLeaveRaid', raid || null);
      if (typeof this.Rpc !== 'function') {
        clearPending(this);
        return false;
      }
      try {
        var self = this;
        this.Rpc(4051, {}, function (data) {
          clearPending(self);
          if (data && Number(data.result) === 0) clearRaid(raid);
        });
        return true;
      } catch (_) {
        clearPending(this);
        return false;
      }
    };
    proto.cs_fish_map_leave.__lhsFishingLeaveStopV1 = true;
    proto.cs_fish_map_leave.__lhsFishingLeaveStopV1Original = original;
    api.patched.push('FishingModel.cs_fish_map_leave');
    return true;
  }

  function patchBlockedModelMethod(model, name) {
    var proto = prototypeOf(model);
    if (!proto || typeof proto[name] !== 'function') proto = model;
    if (!proto || typeof proto[name] !== 'function') return false;
    var original = proto[name];
    if (original.__lhsFishingLeaveStopV1) return true;
    proto[name] = function () {
      if (this.__lhsFishingLeavePending === true) return false;
      // autoDealAllFish can be left behind by a timer created before the
      // user exits. The leave invalidation turns auto mode off; do not let
      // that stale timer start another 4008/4000 cycle after the ACK.
      if (name === 'autoDealAllFish' && this.isAutoFish !== true) return false;
      return original.apply(this, arguments);
    };
    proto[name].__lhsFishingLeaveStopV1 = true;
    proto[name].__lhsFishingLeaveStopV1Original = original;
    api.patched.push('FishingModel.' + name);
    return true;
  }

  function patchReconnect(model) {
    var proto = prototypeOf(model);
    if (!proto || typeof proto.reconnectSuccess !== 'function') proto = model;
    if (!proto || typeof proto.reconnectSuccess !== 'function') return false;
    var original = proto.reconnectSuccess;
    if (original.__lhsFishingLeaveStopV1) return true;
    proto.reconnectSuccess = function () {
      clearPending(this);
      return original.apply(this, arguments);
    };
    proto.reconnectSuccess.__lhsFishingLeaveStopV1 = true;
    proto.reconnectSuccess.__lhsFishingLeaveStopV1Original = original;
    api.patched.push('FishingModel.reconnectSuccess');
    return true;
  }

  function patchRoomEnter(roomModel) {
    var proto = prototypeOf(roomModel);
    if (!proto || typeof proto.sc_fish_map_enter !== 'function') proto = roomModel;
    if (!proto || typeof proto.sc_fish_map_enter !== 'function') return false;
    var original = proto.sc_fish_map_enter;
    if (original.__lhsFishingLeaveStopV1) return true;
    proto.sc_fish_map_enter = function () {
      var model = fishModel();
      if (model && model.__lhsFishingLeavePending === true) {
        api.ignoredEntries += 1;
        return false;
      }
      return original.apply(this, arguments);
    };
    proto.sc_fish_map_enter.__lhsFishingLeaveStopV1 = true;
    proto.sc_fish_map_enter.__lhsFishingLeaveStopV1Original = original;
    api.patched.push('FishRoomModel.sc_fish_map_enter');
    return true;
  }

  function patchRaidManager(raidManager) {
    if (!raidManager) return false;
    var target = prototypeOf(raidManager);
    if (!target || typeof target.EnterFishMapRaid !== 'function') target = raidManager;
    var enterReady = false;
    if (target && typeof target.EnterFishMapRaid === 'function') {
      var originalEnter = target.EnterFishMapRaid;
      if (!originalEnter.__lhsFishingLeaveStopV1) {
        target.EnterFishMapRaid = function () {
          var model = fishModel();
          if (model && model.__lhsFishingLeavePending === true) {
            api.ignoredEntries += 1;
            return null;
          }
          var result = originalEnter.apply(this, arguments);
          patchRaid(this.mFishRaid);
          return result;
        };
        target.EnterFishMapRaid.__lhsFishingLeaveStopV1 = true;
        target.EnterFishMapRaid.__lhsFishingLeaveStopV1Original = originalEnter;
        api.patched.push('RaidMgr.EnterFishMapRaid');
      }
      enterReady = true;
    }
    target = prototypeOf(raidManager);
    if (!target || typeof target.FishMapClear !== 'function') target = raidManager;
    var clearReady = false;
    if (target && typeof target.FishMapClear === 'function') {
      var originalClear = target.FishMapClear;
      if (!originalClear.__lhsFishingLeaveStopV1) {
        target.FishMapClear = function () {
          var model = fishModel();
          var pending = !!(model && model.__lhsFishingLeavePending === true);
          var result = originalClear.apply(this, arguments);
          // Keep the leave gate until the 4051 ACK. An unrelated clear can
          // happen while the request is in flight; releasing it early would
          // allow a stale auto-fish timer to send another catch.
          if (!pending) clearPending(model);
          return result;
        };
        target.FishMapClear.__lhsFishingLeaveStopV1 = true;
        target.FishMapClear.__lhsFishingLeaveStopV1Original = originalClear;
        api.patched.push('RaidMgr.FishMapClear');
      }
      clearReady = true;
    }
    return enterReady || clearReady;
  }

  function patchRaid(raid) {
    if (!raid || typeof raid.backExit !== 'function') return false;
    var target = prototypeOf(raid);
    if (!target || typeof target.backExit !== 'function') target = raid;
    var original = target.backExit;
    if (typeof original !== 'function' || original.__lhsFishingLeaveStopV1) return true;
    target.backExit = function () {
      var model = fishModel(), activeRaid = currentRaid() || this;
      invalidate(model);
      requestLeave(model, activeRaid);
      return original.apply(this, arguments);
    };
    target.backExit.__lhsFishingLeaveStopV1 = true;
    target.backExit.__lhsFishingLeaveStopV1Original = original;
    api.patched.push('FishMapRaid.backExit');
    return true;
  }

  function install() {
    api.attempts += 1;
    var m = manager(), model = fishModel(), raid = currentRaid();
    var modelReady = patchLeave(model);
    ['startAutoFish', 'sendFishing', 'sendAutoPowerFish', 'autoDealAllFish'].forEach(function (name) {
      modelReady = patchBlockedModelMethod(model, name) || modelReady;
    });
    modelReady = patchReconnect(model) || modelReady;
    var roomReady = patchRoomEnter(fishRoomModel());
    var managerReady = patchRaidManager(m && m.RaidMgr);
    var raidReady = patchRaid(raid);
    if (modelReady || roomReady || managerReady || raidReady) api.installed = true;
    if ((!modelReady || !roomReady || !managerReady || !raidReady) && api.attempts < 600 && typeof root.setTimeout === 'function') {
      root.setTimeout(install, 100);
    }
    return api.installed;
  }

  install();
}(window));

/* OldTrek: rejected replies must not enter native success-only callbacks. */
(function (root) {
  'use strict';
  var api = root.LhsOldTrekErrors = root.LhsOldTrekErrors || {};
  if (api.version === '20261002_v6') return;
  api.version = '20261002_v6';
  var sequence = 0;
  var messages = {
    OLD_TREK_DESTINATION_LOCKED: 'Điểm đến hoặc độ khó chưa được mở.',
    OLD_TREK_ALREADY_SAILING: 'Bạn đang có một chuyến đi. Vui lòng quay lại chuyến hiện tại.',
    OLD_TREK_DEPART_CLOSED: 'Đã hết thời gian khởi hành của mùa này.',
    OLD_TREK_NOT_ARRIVED: 'Chưa tới đích. Vui lòng chờ thuyền hoàn tất hành trình.',
    OLD_TREK_EVENT_PENDING: 'Hãy hoàn thành sự kiện đang chờ trước.',
    OLD_TREK_EVENT_POLICY_REQUIRED: 'Sự kiện đang được bảo trì; tiến độ được giữ nguyên.',
    OLD_TREK_EVENT_NOT_FOUND: 'Không tìm thấy sự kiện hiện tại; hãy đồng bộ lại hành trình.',
    OLD_TREK_TREK_UID_INVALID: 'Chuyến đi đã thay đổi; đang đồng bộ lại dữ liệu.',
    OLD_TREK_SETTLEMENT_IN_PROGRESS: 'Hành trình đang được kết toán; vui lòng chờ một chút.',
    OLD_TREK_NOT_SAILING: 'Không còn chuyến đi đang chạy.',
    OLD_TREK_REVISION_STALE: 'Dữ liệu hành trình vừa thay đổi; hãy thử lại.',
    OLD_TREK_SAVE_UNKNOWN: 'Chưa xác nhận lưu dữ liệu. Hãy đăng nhập lại để đồng bộ.',
    OLD_TREK_EVENT_ACTION_INVALID: 'Lượt mini-game không hợp lệ; đang mở lại trạng thái hành trình.',
    OLD_TREK_MINIGAME_SCORE_INVALID: 'Kết quả mini-game không hợp lệ; lượt chơi đã được kết thúc an toàn.',
    OLD_TREK_MINIGAME_CONFIG: 'Cấu hình mini-game chưa đồng bộ; đang tải lại hành trình.',
    OLD_TREK_PUZZLE_PROOF_INVALID: 'Dữ liệu mini-game không khớp; tiến độ được giữ nguyên.',
    OLD_TREK_OPERATION_FAILED: 'Thao tác hành trình chưa hoàn tất; tiến độ được giữ nguyên.',
    OLD_TREK_RESYNC_REQUIRED: 'Dữ liệu hành trình vừa thay đổi; đang đồng bộ lại.',
    OLD_TREK_MULTI_INVALID: 'Hệ số tăng tốc chưa được mở.',
    OLD_TREK_COST_NOT_ENOUGH: 'Không đủ vật phẩm khởi hành.',
    OLD_TREK_ACCELERATE_COST_NOT_ENOUGH: 'Không đủ vật phẩm tăng tốc.',
    OLD_TREK_SWEEP_FIRST_CLEAR_REQUIRED: 'Cần nhận thưởng lần đầu ở đủ các độ khó trước khi quét.'
  };
  function normalizeChatRow(row) {
    row = row && typeof row === 'object' ? row : {};
    var summary = row.summary && typeof row.summary === 'object' ? row.summary : {};
    var dbid = String(summary.dbid || row.dbid || '').trim();
    var name = String(summary.name || row.name || 'Player').slice(0, 64);
    row = Object.assign({}, row);
    row.summary = Object.assign({}, summary, { dbid: dbid, name: name });
    row.dbid = row.dbid || dbid;
    row.name = row.name || name;
    if (row.content == null) row.content = '';
    return row;
  }
  function installChatGuard() {
    var Type = root.ChatData;
    try { Type = Type || (root.egret && root.egret.getDefinitionByName('ChatData')); } catch (_) {}
    var p = Type && Type.prototype;
    if (!p || typeof p.parseOldTrekMsg !== 'function') return false;
    if (Object.prototype.hasOwnProperty.call(p, '__lhsOldTrekChatGuard')) return true;
    var parse = p.parseOldTrekMsg;
    p.parseOldTrekMsg = function (row) {
      return parse.call(this, normalizeChatRow(row));
    };
    p.__lhsOldTrekChatGuard = true;
    api.chatInstalled = true;
    return true;
  }
  function installLifecycleGuard() {
    var AI = root.OldTrekAIUnit;
    var aiProto = AI && AI.prototype;
    var installed = false;
    if (aiProto && typeof aiProto.playResumeIdleOrControlAnim === 'function'
        && !Object.prototype.hasOwnProperty.call(aiProto, '__lhsOldTrekLifecycleGuard')) {
      var resume = aiProto.playResumeIdleOrControlAnim;
      aiProto.playResumeIdleOrControlAnim = function () {
        var entity = this && this.mEntity, info = null;
        try { info = entity && typeof entity.GetInfo === 'function' ? entity.GetInfo() : null; } catch (_) { info = null; }
        if (!info) {
          api.lifecycleSkips = Number(api.lifecycleSkips || 0) + 1;
          return;
        }
        return resume.apply(this, arguments);
      };
      aiProto.__lhsOldTrekLifecycleGuard = true;
      installed = true;
    }
    var Action = root.OldTrekBSpineEventAction;
    var actionProto = Action && Action.prototype;
    if (actionProto && !Object.prototype.hasOwnProperty.call(actionProto, '__lhsOldTrekActionGuard')) {
      var enter = actionProto.OnEnter;
      var exit = actionProto.OnExit;
      var trigger = actionProto.triggerCallback;
      if (typeof enter === 'function') actionProto.OnEnter = function () {
        this.__lhsOldTrekDisposed = false;
        return enter.apply(this, arguments);
      };
      if (typeof exit === 'function') actionProto.OnExit = function () {
        this.__lhsOldTrekDisposed = true;
        return exit.apply(this, arguments);
      };
      if (typeof trigger === 'function') actionProto.triggerCallback = function () {
        if (this.__lhsOldTrekDisposed) return;
        return trigger.apply(this, arguments);
      };
      actionProto.__lhsOldTrekActionGuard = true;
      installed = true;
    }
    if (installed) api.lifecycleInstalled = true;
    return installed;
  }
  function installBidKingContract() {
    var Type = root.BidKingModel;
    try { Type = Type || (root.egret && root.egret.getDefinitionByName('BidKingModel')); } catch (_) {}
    var p = Type && Type.prototype;
    if (!p || typeof p.Rpc !== 'function') return false;
    if (Object.prototype.hasOwnProperty.call(p, '__lhsBidKingContract')) return true;
    var rpc = p.Rpc;
    p.Rpc = function (tag, params, callback) {
      var args = Array.prototype.slice.call(arguments);
      if (Number(tag) === 7303 || Number(tag) === 7304 || Number(tag) === 7305) {
        params = Object.assign({}, params || {});
        var controller = this.gameCtr;
        if (controller && typeof controller.getCurRound === 'function') params.round = controller.getCurRound();
        if (!params.requestId) params.requestId = 'bk_' + Date.now() + '_' + Math.floor(Math.random() * 1e9);
        args[1] = params;
      }
      return rpc.apply(this, args);
    };
    p.__lhsBidKingContract = true;
    api.bidKingInstalled = true;
    return true;
  }
  function releaseGuideIfOrphaned(view) {
    if (!view || !view._isClueTouchBlocked) return false;
    var guide = root.GuideUtil, hand = guide && guide.guideHand;
    var visible = !!(hand && hand.parent && hand.descGr && hand.descGr.visible);
    if (visible) return false;
    try {
      if (guide && Number(guide.RunningStep) === 1 && typeof guide.continueGuide === 'function') guide.continueGuide();
    } catch (_) {}
    try { if (typeof view.setClueTouchBlock === 'function') view.setClueTouchBlock(false); } catch (_) {}
    try { if (typeof view.setGuideGridTouchBlock === 'function') view.setGuideGridTouchBlock(false); } catch (_) {}
    api.guideReleases = Number(api.guideReleases || 0) + 1;
    return true;
  }
  function installBidKingGuideGuard() {
    var Type = root.BidKingGameGuideView;
    try { Type = Type || (root.egret && root.egret.getDefinitionByName('BidKingGameGuideView')); } catch (_) {}
    var p = Type && Type.prototype;
    if (!p || Object.prototype.hasOwnProperty.call(p, '__lhsBidKingGuideGuard')) return !!p;
    if (typeof p.onClueDisplayReady === 'function') {
      var ready = p.onClueDisplayReady;
      p.onClueDisplayReady = function () {
        var result = ready.apply(this, arguments);
        releaseGuideIfOrphaned(this);
        return result;
      };
    }
    if (typeof p.OnOpen === 'function') {
      var open = p.OnOpen;
      p.OnOpen = function () {
        var result = open.apply(this, arguments), view = this;
        // Only this guide view gets a bounded orphan check; no global touch bypass.
        if (typeof root.setTimeout === 'function') root.setTimeout(function () {
          if (view && view._isClueTouchBlocked) releaseGuideIfOrphaned(view);
        }, 4500);
        return result;
      };
    }
    p.__lhsBidKingGuideGuard = true;
    api.bidKingGuideInstalled = true;
    return true;
  }
  function hasCurrentEvent(model) {
    try {
      if (model && typeof model.isHaveEvent === 'function') return !!model.isHaveEvent();
    } catch (_) {}
    return !!(model && model.sailInfo && model.sailInfo.currentEvent);
  }
  function resumePendingEvent(model) {
    if (!hasCurrentEvent(model) || !model || typeof model.checkHandleEvent !== 'function') return;
    if (model.__lhsOldTrekEventResumeQueued) return;
    model.__lhsOldTrekEventResumeQueued = true;
    var eventUid = model.sailInfo && model.sailInfo.currentEvent && model.sailInfo.currentEvent.uid;
    root.setTimeout(function () {
      model.__lhsOldTrekEventResumeQueued = false;
      var currentUid = model.sailInfo && model.sailInfo.currentEvent && model.sailInfo.currentEvent.uid;
      // A push may advance the event chain before this queued callback runs.
      // Native onEventUpdate already handles that next event; do not handle it twice.
      if (hasCurrentEvent(model) && currentUid === eventUid) {
        try { model.checkHandleEvent(); } catch (_) {}
      }
    }, 0);
  }
  function refreshPendingSnapshot(model, skipEventUid) {
    if (!model || model.__lhsOldTrekSnapshotPending || typeof model.sendTrekSailInfo !== 'function') return;
    var token = ++sequence;
    model.__lhsOldTrekSnapshotPending = token;
    model.__lhsOldTrekSkipResumeUid = skipEventUid;
    function release() { if (model.__lhsOldTrekSnapshotPending === token) model.__lhsOldTrekSnapshotPending = false; }
    root.setTimeout(release, 15000);
    model.sendTrekSailInfo(release);
  }
  function closeMiniGameViews() {
    var manager = root.ViewManager, vm = null;
    try { vm = manager && typeof manager.ins === 'function' ? manager.ins() : null; } catch (_) { vm = null; }
    if (!vm) return 0;
    var closed = 0;
    ['OldTrekSpotDiffMainView', 'OldTrekPinballMainView', 'OldTrekMiniGameEntrance'].forEach(function (name) {
      var Type = root[name];
      try { Type = Type || (root.egret && root.egret.getDefinitionByName(name)); } catch (_) {}
      if (!Type) return;
      try {
        var view = typeof vm.getView === 'function' ? vm.getView(Type) : null;
        if (view && typeof view.CloseSelf === 'function') view.CloseSelf();
        else if (typeof vm.close === 'function') vm.close(Type);
        if (view || typeof vm.close === 'function') closed += 1;
      } catch (_) {}
    });
    if (closed) api.miniGameClosures = Number(api.miniGameClosures || 0) + closed;
    return closed;
  }
  function getOldTrekModel() {
    var manager = root.GlobalManager || root.GameGlobalYDXZ || root.W || {};
    return manager.OldTrekModel || root.OldTrekModel || null;
  }
  function failTimedOutMiniGame(view) {
    if (!view || view.__lhsOldTrekTimeoutFallback || Number(view._countDown) > 0) return;
    view.__lhsOldTrekTimeoutFallback = true;
    var model = getOldTrekModel(), uid = Number(view._evtDataUid), score = Math.max(0, Number(view._realScore || 0));
    var current = model && model.sailInfo && model.sailInfo.currentEvent;
    if (model && uid > 0 && current && Number(current.uid) === uid && typeof model.sendHandleEvent === 'function') {
      try { model.sendHandleEvent(uid, 1, score); } catch (_) {}
    }
    closeMiniGameViews();
  }
  function installMiniGameTimeoutGuard() {
    var installed = false;
    ['OldTrekSpotDiffMainView', 'OldTrekPinballMainView'].forEach(function (name) {
      var Type = root[name];
      try { Type = Type || (root.egret && root.egret.getDefinitionByName(name)); } catch (_) {}
      var p = Type && Type.prototype;
      if (!p || Object.prototype.hasOwnProperty.call(p, '__lhsOldTrekTimeoutGuard')) return;
      var update = p.update;
      if (typeof update !== 'function') return;
      p.update = function () {
        var result = update.apply(this, arguments), view = this;
        if (Number(view._countDown) <= 0 && !view.__lhsOldTrekTimeoutTimer) {
          view.__lhsOldTrekTimeoutTimer = root.setTimeout(function () {
            view.__lhsOldTrekTimeoutTimer = null;
            if (view.parent && Number(view._realScore || view._score || 0) < Number(view._winScore || 0)) failTimedOutMiniGame(view);
          }, 1600);
        }
        return result;
      };
      p.__lhsOldTrekTimeoutGuard = true;
      installed = true;
    });
    if (installed) api.miniGameTimeoutInstalled = true;
    return installed;
  }
  function installManualEventRecovery() {
    var Type = root.OldTrekMainView;
    try { Type = Type || (root.egret && root.egret.getDefinitionByName('OldTrekMainView')); } catch (_) {}
    var p = Type && Type.prototype;
    if (!p || p.__lhsOldTrekManualRecovery) return;
    ['onClickSpeedUp', 'onClickEventBtn'].forEach(function (name) {
      var original = p[name];
      if (typeof original !== 'function') return;
      p[name] = function () {
        var manager = root.GlobalManager || root.GameGlobalYDXZ || root.W || {};
        var model = manager.OldTrekModel;
        // Native Dock/Arrived blocks speed clicks locally while an event exists.
        // Refresh on that explicit click, never automatically repeat acceleration.
        if (hasCurrentEvent(model)) return refreshPendingSnapshot(model);
        return original.apply(this, arguments);
      };
    });
    p.__lhsOldTrekManualRecovery = true;
  }
  function retrySettlement(model) {
    if (!model || !model.__lhsOldTrekSettlementPending || model.__lhsOldTrekSettlementRetrying) return;
    if (hasCurrentEvent(model) || typeof model.sendEndTrek !== 'function') return;
    var trek = null;
    try { trek = typeof model.getTrekData === 'function' ? model.getTrekData() : model.sailInfo && model.sailInfo.trekData; } catch (_) {}
    if (!trek || !trek.uid) return;
    if (model.__lhsOldTrekSettlementUid && Number(model.__lhsOldTrekSettlementUid) !== Number(trek.uid)) return;
    model.__lhsOldTrekSettlementRetrying = true;
    root.setTimeout(function () {
      model.__lhsOldTrekSettlementRetrying = false;
      if (!model.__lhsOldTrekSettlementPending || hasCurrentEvent(model)) return;
      var current = null;
      try { current = typeof model.getTrekData === 'function' ? model.getTrekData() : model.sailInfo && model.sailInfo.trekData; } catch (_) {}
      if (!current || !current.uid) return;
      try { model.sendEndTrek(); } catch (_) {}
    }, 50);
  }
  function installOldTrekSettlementRecovery(p) {
    var installed = false;
    if (typeof p.onEndTrek === 'function' && !Object.prototype.hasOwnProperty.call(p, '__lhsOldTrekSettlementEndGuard')) {
      var end = p.onEndTrek;
      p.onEndTrek = function () {
        // 7010 arrived and native opened the settlement view; consume the
        // durable relog marker so the next main-panel open is not duplicated.
        try { if (this.info) this.info.endCache = false; } catch (_) {}
        try { if (typeof this.Rpc === 'function') this.Rpc(7065, {}, function () {}); } catch (_) {}
        this.__lhsOldTrekSettlementPending = false;
        this.__lhsOldTrekSettlementUid = 0;
        this.__lhsOldTrekSettlementRetrying = false;
        return end.apply(this, arguments);
      };
      p.__lhsOldTrekSettlementEndGuard = true;
      installed = true;
    }
    if (typeof p.onEventUpdate === 'function' && !Object.prototype.hasOwnProperty.call(p, '__lhsOldTrekSettlementEventGuard')) {
      var eventUpdate = p.onEventUpdate;
      p.onEventUpdate = function () {
        var result = eventUpdate.apply(this, arguments);
        if (this.__lhsOldTrekSettlementPending && !hasCurrentEvent(this)) retrySettlement(this);
        return result;
      };
      p.__lhsOldTrekSettlementEventGuard = true;
      installed = true;
    }
    if (typeof p.sendTrekSailInfo === 'function' && !Object.prototype.hasOwnProperty.call(p, '__lhsOldTrekSettlementRelogGuard')) {
      var sailInfo = p.sendTrekSailInfo;
      p.sendTrekSailInfo = function (callback) {
        var model = this;
        return sailInfo.call(this, function () {
          var result = callback && callback.apply(this, arguments);
          var skipUid = model.__lhsOldTrekSkipResumeUid;
          model.__lhsOldTrekSkipResumeUid = null;
          var event = model.sailInfo && model.sailInfo.currentEvent;
          if (!skipUid || !event || Number(event.uid) !== Number(skipUid)) resumePendingEvent(model);
          if (model.__lhsOldTrekSettlementPending && !hasCurrentEvent(model)) retrySettlement(model);
          return result;
        });
      };
      p.__lhsOldTrekSettlementRelogGuard = true;
      installed = true;
    }
    if (installed) api.settlementRecoveryInstalled = true;
    return installed;
  }
  function install() {
    installManualEventRecovery();
    installMiniGameTimeoutGuard();
    var chatReady = installChatGuard();
    var lifecycleReady = installLifecycleGuard();
    var bidKingReady = installBidKingContract();
    var bidKingGuideReady = installBidKingGuideGuard();
    var manager = root.GlobalManager || root.GameGlobalYDXZ || root.W || {};
    var Type = root.OldTrekModel;
    try { Type = Type || (root.egret && root.egret.getDefinitionByName('OldTrekModel')); } catch (_) {}
    var p = Type && Type.prototype;
    if (!p && manager.OldTrekModel) p = Object.getPrototypeOf(manager.OldTrekModel);
    // ChatData can be defined before OldTrekModel.  Keep retrying until the
    // travel model is available; otherwise a successful chat install used to
    // suppress all later recovery hooks permanently.
    if (!p || typeof p.Rpc !== 'function') return false;
    if (Object.prototype.hasOwnProperty.call(p, '__lhsTravelErrors')) return !!api.chatInstalled;
    installOldTrekSettlementRecovery(p);
    var rpc = p.Rpc;
    p.Rpc = function (tag, params, callback) {
      if (Number(tag) < 7000 || Number(tag) > 7065) return rpc.apply(this, arguments);
      var args = Array.prototype.slice.call(arguments), model = this;
      params = Object.assign({}, params || {});
      if (!params.requestId) params.requestId = 'ot_' + Date.now() + '_' + (++sequence) + '_' + Math.floor(Math.random() * 1e9);
      if (model.info && model.info.stateRevision != null && params.revision == null) params.revision = Number(model.info.stateRevision) || 0;
      args[1] = params;
      if (root.LhsOldTrekMinigames && root.LhsOldTrekMinigames.installed) params.oldTrekPuzzleVersion = '20260921_v1';
      args[4] = function (error) {
        error = error || { result: -1, code: 'OLD_TREK_RPC_FAILED' };
        if (Number(tag) === 7005) model.__lhsOldTrekSettlementPending = true;
        if ([7000, 7001, 7002, 7005, 7008].indexOf(Number(tag)) >= 0) refreshPendingSnapshot(model, params.eventUid);
        if (Number(tag) === 7002) closeMiniGameViews();
        var tips = root.UserTips;
        if (tips && tips.ins) tips.ins().showTips(messages[error.code] || 'Kết nối hành trình bị gián đoạn; dữ liệu được giữ nguyên.');
      };
      args[2] = function (payload) {
        if (Number(tag) === 7005 && payload && Number(payload.result) === 0 && payload.pendingEvent) {
          model.__lhsOldTrekSettlementPending = true;
          try {
            var arrivedTrek = typeof model.getTrekData === 'function' ? model.getTrekData() : model.sailInfo && model.sailInfo.trekData;
            model.__lhsOldTrekSettlementUid = arrivedTrek && arrivedTrek.uid || 0;
          } catch (_) {}
        }
        if (Number(tag) === 7005 && payload && payload.code === 'OLD_TREK_EVENT_PENDING') {
          model.__lhsOldTrekSettlementPending = true;
          try {
            var pendingTrek = typeof model.getTrekData === 'function' ? model.getTrekData() : model.sailInfo && model.sailInfo.trekData;
            model.__lhsOldTrekSettlementUid = pendingTrek && pendingTrek.uid || 0;
          } catch (_) {}
        }
        if (payload && payload.revision != null && model.info && Number(payload.revision) < Number(model.info.stateRevision || 0)) return;
        if (payload && payload.revision != null && model.info) model.info.stateRevision = Number(payload.revision);
        if (payload && payload.result != null && Number(payload.result) !== 0) {
          if (payload.updateData && model.sailInfo && model.sailInfo.trekData && typeof model.updateTrek === 'function') {
            model.updateTrek(payload.updateData);
          }
          // Rejected native callbacks must not run, but their authoritative
          // event still needs to replace the stale local event. Otherwise
          // accelerate/end repeatedly reject until a panel reopen fetches 7008.
          if (payload.code === 'OLD_TREK_EVENT_PENDING' && (Number(tag) === 7001 || Number(tag) === 7005)) {
            if (Object.prototype.hasOwnProperty.call(payload, 'event') && model.sailInfo) {
              if (typeof model.updateEventData === 'function') model.updateEventData(payload.event);
              else model.sailInfo.currentEvent = payload.event;
              resumePendingEvent(model);
            } else refreshPendingSnapshot(model);
          }
          if (Number(tag) === 7002 && (payload.code === 'OLD_TREK_EVENT_UID_INVALID' || payload.code === 'OLD_TREK_REVISION_STALE')) {
            refreshPendingSnapshot(model, params.eventUid);
          }
          if (Number(tag) === 7002) closeMiniGameViews();
          var tips = root.UserTips;
          if (tips && tips.ins) tips.ins().showTips(messages[payload.code] || 'Thao tác chưa hoàn tất; dữ liệu được giữ nguyên.');
          if (Number(tag) === 7009 && root.ViewManager && root.ViewManager.ins && root.OldTrekDestSweepView) {
            root.ViewManager.ins().close(root.OldTrekDestSweepView);
          }
          if ((payload.expiredRecovery || payload.recovery && payload.recovery.state === 'EVENT_EXPIRED') && hasCurrentEvent(model)) {
            resumePendingEvent(model);
          }
          return;
        }
        if (callback) return callback.apply(this, arguments);
      };
      return rpc.apply(this, args);
    };
    p.__lhsTravelErrors = true;
    api.installed = true;
    return !!api.chatInstalled;
  }
  api.install = install;
  var attempts = 0;
  (function retry() { if (!install() && ++attempts < 120) root.setTimeout(retry, 1000); }());
}(window));

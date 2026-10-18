/* Native 6 x 8 pet board; server remains authoritative for slots and merges. */
(function (root) {
  'use strict';
  var VERSION = '20261005_pet_auto_continuous_v3';
  var TARGET_QUALITIES = [2, 3, 4, 5, 6, 7, 9, 10];
  if (root.LhsPetGrid48V1 && root.LhsPetGrid48V1.version === VERSION) return;
  var api = root.LhsPetGrid48V1 = { version: VERSION, installed: false, attempts: 0 };
  function manager() { return root.GlobalManager || root.GameGlobalYDXZ || root.W; }
  function def(name) { return root[name] || (root.egret && root.egret.getDefinitionByName(name)); }
  function notice(text) { if (root.UserTips && root.UserTips.ins) root.UserTips.ins().showTips(text); }
  function mergeNotice(reply) {
    if (reply.replayed) return 'Đã đồng bộ kết quả ghép trước.';
    var summary = reply.summary;
    if (!summary || !Number.isSafeInteger(summary.composeCount) || !Number.isSafeInteger(summary.expMergeCount)) return 'Đã đồng bộ Tinh Linh.';
    var text = summary.composeCount || summary.expMergeCount
      ? 'Đã ghép ' + summary.composeCount + ' lần, gộp EXP ' + summary.expMergeCount + ' lần.'
      : 'Không còn cặp phù hợp với mục tiêu đã chọn.';
    if (Array.isArray(summary.blockedCostQualities) && summary.blockedCostQualities.length) text += ' Còn cặp thiếu nguyên liệu.';
    if (summary.blockedExpCap) text += ' EXP còn lại vượt giới hạn cấp.';
    return text;
  }
  function dispatch(name, arg) {
    if (root.MessageCenter && root.MessageDef) root.MessageCenter.ins().dispatch(root.MessageDef[name], arg);
  }
  function boardAvailable() {
    var g = manager();
    return !!(g && g.PetModel && g.PetModel._petInfo)
      && (!g.UnlockSystem || g.UnlockSystem.isSystemUnlock(206));
  }
  function configure() {
    var g = manager(), base = g && g.Config && g.Config.PetBaseConfig;
    if (!base) return false;
    base.initialField = 48; base.fieldMax = 48; base.fieldConsume = [];
    var systems = g.Config.SystemConfig;
    if (systems && systems[206] && systems[229]) {
      systems[229].conditions = JSON.parse(JSON.stringify(systems[206].conditions || []));
      systems[229].openDay = systems[206].openDay || 0;
    }
    var shops = g.Config.ShopConfig;
    [4000004, 4000103].forEach(function (id) {
      if (shops && shops[id]) { shops[id].limit = 0; shops[id].limitType = 0; }
    });
    if (root.AppInfo && root.AppInfo.params) root.AppInfo.params.petAutoCompose = 1;
    return true;
  }
  function layout(view, Item) {
    var group = view.composeGroup, list = view._composeItems;
    if (!group || !list || !list.length || !(group.width > 0) || !(group.height > 0)) return false;
    if (!view.__lhsGridDimensions) view.__lhsGridDimensions = { width: list[0].width || 162, height: list[0].height || 150 };
    // Freeze the measured native TileLayout extent before replacing its implicit layout.
    if (!view.__lhsBoardExtent) view.__lhsBoardExtent = { width: group.width, height: group.height };
    group.width = view.__lhsBoardExtent.width; group.height = view.__lhsBoardExtent.height;
    group.layout = null;
    while (list.length < 48) {
      var child = new Item();
      group.addChild(child);
      if (child.validateNow) child.validateNow();
      child.data = { isUnlock: false, petData: null };
      list.push(child);
    }
    var cellW = group.width / 6, cellH = group.height / 8;
    var native = view.__lhsGridDimensions, scale = Math.min(cellW / native.width, cellH / native.height);
    for (var i = 0; i < 48; i++) {
      child = list[i];
      child.left = child.right = child.top = child.bottom = child.horizontalCenter = child.verticalCenter = NaN;
      child.percentWidth = child.percentHeight = NaN;
      child.width = native.width; child.height = native.height;
      child.scaleX = child.scaleY = scale;
      child.x = (i % 6) * cellW + (cellW - native.width * scale) / 2;
      child.y = Math.floor(i / 6) * cellH + (cellH - native.height * scale) / 2;
    }
    view._listItemWidth = cellW; view._listItemHeight = cellH;
    return true;
  }
  function point(view, x, y) {
    var group = view.composeGroup;
    if (!group) return null;
    var parent = view.tempSpine && view.tempSpine.parent;
    if (parent && parent.localToGlobal && group.globalToLocal) {
      var world = parent.localToGlobal(x, y);
      return group.globalToLocal(world.x, world.y);
    }
    return { x: x - group.x, y: y - group.y };
  }
  function slot(view, x, y) {
    var p = point(view, x, y), group = view.composeGroup;
    if (!p || p.x < 0 || p.y < 0 || p.x >= group.width || p.y >= group.height) return -1;
    return Math.floor(p.y / (group.height / 8)) * 6 + Math.floor(p.x / (group.width / 6));
  }
  function validPets(pets) {
    if (!Array.isArray(pets)) return false;
    var uids = {}, slots = {};
    return pets.every(function (pet) {
      if (!pet || !Number.isSafeInteger(pet.uid) || pet.uid <= 0 || !Number.isSafeInteger(pet.id) || pet.id <= 0 ||
          !Number.isSafeInteger(pet.slot) || pet.slot < -3 || pet.slot >= 48 || uids[pet.uid] || slots[pet.slot]) return false;
      uids[pet.uid] = slots[pet.slot] = true; return true;
    });
  }
  function storageKey() {
    var g = manager(), id = g && g.ActorModel && g.ActorModel.actorID;
    return id ? 'lhs:pet-grid48:pending:' + id : null;
  }
  function pending(model) {
    var key = storageKey();
    if (model.__lhsPendingKey !== key) {
      model.__lhsPendingKey = key; model.__lhsPendingMerge = null;
      try { model.__lhsPendingMerge = key && JSON.parse(root.sessionStorage.getItem(key)); } catch (_) {}
    }
    return model.__lhsPendingMerge;
  }
  function savePending(model, value) {
    model.__lhsPendingMerge = value;
    var key = storageKey(); model.__lhsPendingKey = key;
    try { if (key) { if (value) root.sessionStorage.setItem(key, JSON.stringify(value)); else root.sessionStorage.removeItem(key); } } catch (_) {}
  }
  function patchModel(model) {
    if (model.__lhsGrid48) return;
    model.__lhsGrid48 = true;
    model.sendBuyField = function () {
      if (!this._petInfo || this.__lhsBuying || this._petInfo.field >= 48) return;
      var self = this, actor = storageKey(), info = this._petInfo, complete = false; this.__lhsBuying = true;
      function current() { return storageKey() === actor && self._petInfo === info; }
      function fail() { if (complete) return; complete = true; root.clearTimeout(watchdog); self.__lhsBuying = false; if (current()) notice('Chưa mở được ô. Vui lòng thử lại.'); }
      var watchdog = root.setTimeout(fail, 15000);
      try { this.Rpc(3308, {}, function (reply) {
        if (complete) return;
        if (!current()) return fail();
        if (!reply || reply.result !== 0 || !Number.isSafeInteger(reply.field) || reply.field < self._petInfo.field || reply.field > 48) return fail();
        complete = true; root.clearTimeout(watchdog); self.__lhsBuying = false;
        self._petInfo.field = reply.field; dispatch('PET_DATA_UPDATE');
      }, null, fail); } catch (_) { fail(); }
    };
    model.sendAutoCompose = function (quality, onSuccess, onFailure, options) {
      options = options || {};
      if (!this._petInfo || this.__lhsMerging) return false;
      var self = this, request = pending(this);
      if (!request) {
        if (TARGET_QUALITIES.indexOf(quality) < 0) return false;
        request = { quality: quality, requestId: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 14).padEnd(8, '0') };
        if (options.openEggs === true) request.openEggs = true;
        savePending(this, request);
      }
      this.__lhsMerging = true;
      var complete = false, actor = storageKey(), info = this._petInfo;
      function current() { return storageKey() === actor && self._petInfo === info; }
      function fail(reply) {
        if (complete) return; complete = true; root.clearTimeout(watchdog); self.__lhsMerging = false;
        if (!current()) {
          if (options.quiet && onFailure) onFailure({ code: 'PET_AUTO_STALE_ACTOR', retryable: false });
          return;
        }
        if (reply && reply.retryable === false) savePending(self, null);
        if (!options.quiet) notice('Ghép chưa được xác nhận. Vui lòng thử lại để đồng bộ.');
        if (onFailure) onFailure(reply);
      }
      var watchdog = root.setTimeout(fail, 15000);
      try { this.Rpc(3314, request, function (reply) {
        if (complete) return;
        if (!current()) return fail();
        if (!reply || reply.result !== 0 || reply.field !== 48 || !validPets(reply.pets) || !Array.isArray(reply.unlockAtlas)) return fail(reply);
        complete = true; root.clearTimeout(watchdog); self.__lhsMerging = false;
        self._petInfo.pets = reply.pets; self._petInfo.field = reply.field;
        self._petInfo.unlockAtlas = reply.unlockAtlas; self.petUnlockMap = {};
        if (reply.timeRecords) {
          var items = manager().ItemModel;
          if (items && items._timeRecords) Object.keys(reply.timeRecords).forEach(function (id) {
            // Native GetItemCount adds recovered virtual eggs to the owned
            // item map. Reset that virtual count after authoritative settlement.
            items._timeRecords[id] = { count: 0, time: Number(reply.timeRecords[id]) || 0 };
            if (root.MessageCenter && root.MessageDef) root.MessageCenter.ins().dispatch(root.MessageDef.ITEM_UPDATE + id);
          });
        }
        reply.unlockAtlas.forEach(function (id) { self.petUnlockMap[id] = true; });
        savePending(self, null); dispatch('PET_DATA_UPDATE'); dispatch('ATTR_CHANGE', 6);
        if (onSuccess) onSuccess(reply);
      }, null, fail); } catch (_) { fail(); }
      return true;
    };
  }
  function stopRun(view) {
    var run = view.__lhsAutoRun;
    if (run) { run.cancelled = true; root.clearTimeout(run.timer); }
    view.__lhsAutoRun = null;
    view._autoComposeState = 0;
    if (view.maskGr) view.maskGr.visible = false;
    if (view.autoComposeLabel) view.autoComposeLabel.visible = false;
    if (view.autoComposeSpine) view.autoComposeSpine.visible = false;
  }
  function startRun(view, openEggs, quality, delay) {
    stopRun(view);
    var model = manager().PetModel;
    var run = { actor: storageKey(), info: model._petInfo, cancelled: false, retries: 0,
      quality: quality, openEggs: openEggs, timer: null };
    view.__lhsAutoRun = run; view._autoComposeState = 1;
    if (view.maskGr) view.maskGr.visible = true;
    if (view.autoComposeLabel) view.autoComposeLabel.visible = true;
    if (view.autoComposeSpine) view.autoComposeSpine.visible = true;
    function current() { return !run.cancelled && view.__lhsAutoRun === run
      && storageKey() === run.actor && model._petInfo === run.info; }
    function schedule(wait) {
      if (!current()) return stopRunIfOwn();
      root.clearTimeout(run.timer); run.timer = root.setTimeout(step, wait);
    }
    function stopRunIfOwn() { if (view.__lhsAutoRun === run) stopRun(view); }
    function step() {
      run.timer = null;
      if (!current()) return stopRunIfOwn();
      var sent = model.sendAutoCompose(run.quality, function (reply) {
        if (!current()) return stopRunIfOwn();
        run.retries = 0;
        // A replay first settles a previous uncertain request. Ask the server
        // for the next fresh cycle instead of trusting its old stop summary.
        if (reply.replayed || reply.summary && reply.summary.canContinue) return schedule(250);
        stopRunIfOwn();
        var summary = reply.summary || {};
        if (summary.stopReason === 'BOARD_FULL') notice('Đã dừng: bàn đầy, không còn cặp phù hợp.');
        else notice(mergeNotice(reply));
      }, function (reply) {
        if (!current()) return stopRunIfOwn();
        if (reply && reply.retryable === false) { stopRunIfOwn(); notice('Không thể tiếp tục tự động. Vui lòng mở lại.'); return; }
        if (run.retries++ === 0) notice('Đang chờ kết nối để tiếp tục tự động.');
        schedule(Math.min(5000, 1000 * Math.pow(2, Math.min(run.retries - 1, 3))));
      }, { openEggs: run.openEggs, quiet: true });
      if (!sent) schedule(500);
    }
    schedule(delay || 0);
  }
  function install() {
    api.attempts++;
    var View = def('PetMainView'), Item = def('PetMainComposeItem'), Panel = def('PetAutoComposePanel');
    var g = manager();
    if (!View || !Item || !Panel || !g || !g.PetModel || !configure()) {
      if (api.attempts < 600) root.setTimeout(install, 100);
      return;
    }
    patchModel(g.PetModel);
    var proto = View.prototype;
    var nativeInit = proto.initEvent, nativeClose = proto.OnClose;
    proto.initEvent = function () {
      var observe = this.observe;
      if (!observe || !root.MessageDef) return nativeInit && nativeInit.apply(this, arguments);
      // Preserve every native subscription except the old stop-on-pause rule.
      this.observe = function (event) {
        if (event === root.MessageDef.APPLICATION_ON_PAUSE) return;
        return observe.apply(this, arguments);
      };
      try { return nativeInit && nativeInit.apply(this, arguments); }
      finally { this.observe = observe; }
    };
    proto.checkAutoComposeGroup = function () {
      if (this.autoComposeGroup) this.autoComposeGroup.visible = boardAvailable();
    };
    Panel.openCheck = boardAvailable;
    proto.changeAutoComposeState = function (state) {
      if (state === 0) return stopRun(this);
      if (state === 1 && !this.__lhsAutoRun) return startRun(this, true, g.PetModel.autoComposeQuality, 0);
    };
    proto.onAutoComposeStart = function () { return startRun(this, true, g.PetModel.autoComposeQuality, 0); };
    proto.onAutoComposeStop = function () { return stopRun(this); };
    // Old animation/network callbacks cannot restart or stop a newer run.
    proto.onAutoComposeOpenEgg = proto.onAutoComposeCompose = function () {};
    proto.OnClose = function () {
      stopRun(this); if (api.activeView === this) api.activeView = null;
      return nativeClose && nativeClose.apply(this, arguments);
    };
    ['childrenCreated', 'OnOpen', 'update', 'updateDisplayList'].forEach(function (method) {
      var original = proto[method];
      proto[method] = function () {
        configure();
        if (method === 'OnOpen') { stopRun(this); api.activeView = this; }
        if (method !== 'childrenCreated') layout(this, Item);
        var result = original && original.apply(this, arguments);
        layout(this, Item); return result;
      };
    });
    proto.getTouchSlotIndex = function (x, y) { return slot(this, x, y); };
    proto.isTouchSlotGroup = function (x, y) { return slot(this, x, y) >= 0; };
    proto.onUnlockSlot = function () { manager().PetModel.sendBuyField(); };
    var panel = Panel.prototype, cancel = panel.onClickCancelBtn, close = panel.OnClose, updatePanel = panel.updateView;
    panel.updateView = function () {
      configure(); var result = updatePanel.apply(this, arguments);
      this._indexToQuality = TARGET_QUALITIES.slice();
      var quality = manager().PetModel.autoComposeQuality, Quality = def('QualityUtil');
      if (Quality && this.qualityCheckBox && this.qualityCheckBox.labelDisplay) {
        this.qualityCheckBox.labelDisplay.textFlow = Quality.getPetAutoQualityNameTextFlow(quality);
      }
      this.label2.textFlow = null;
      this.label2.text = 'Ghép nhanh Tinh Linh đang có';
      return result;
    };
    panel.qualityCheckBoxChange = function () {
      var Popup = def('PopupScrollList'), Quality = def('QualityUtil');
      if (!Popup || !Quality) { this.qualityCheckBox.selected = false; return; }
      var self = this, popup = new Popup();
      var rows = TARGET_QUALITIES.map(function (quality, i) {
        return { id: i + 1, textFlow: Quality.getPetAutoQualityNameTextFlow(quality) };
      });
      this.qualityCheckBox.selected = true;
      popup.initWithData(rows, 1, TARGET_QUALITIES.indexOf(manager().PetModel.autoComposeQuality), function (index) {
        if (!rows[index]) return;
        manager().PetModel.autoComposeQuality = TARGET_QUALITIES[index];
        self.qualityCheckBox.labelDisplay.textFlow = rows[index].textFlow;
        if (TARGET_QUALITIES[index] === 10) notice('Phẩm 9 lên Hỗn Độn: 150 Quả Linh/lần, tỷ lệ 0,1%.');
      }, this);
      popup.setEndCall(function () { self.qualityCheckBox.selected = false; });
      popup.setPosition(this.getListPos(this.qualityCheckBox, 1));
      this.baseGroup.addChild(popup);
      if (popup.validateNow) popup.validateNow();
      if (popup.scroll) {
        var item = popup.popupList && popup.popupList.getElementAt(0);
        var gap = popup.popupList && popup.popupList.layout && popup.popupList.layout.gap || 0;
        var maxHeight = (item && item.height || 80) * 4 + gap * 3;
        popup.scroll.height = Math.min(popup.scroll.height || maxHeight, maxHeight);
        popup.scroll.maxHeight = maxHeight;
        popup.scroll.verticalScrollPolicy = 'on';
        if (popup.validateNow) popup.validateNow();
      }
    };
    panel.onClickConfirmBtn = function () {
      var view = api.activeView;
      if (!view) { notice('Vui lòng mở bàn Tinh Linh trước.'); return; }
      // Quick only merges existing pets; ordinary auto also hatches owned eggs.
      startRun(view, !this.checkBox.selected, manager().PetModel.autoComposeQuality, 0);
      this.CloseSelf();
    };
    function clear(panel) { if (panel.__lhsQuickTimer) root.clearTimeout(panel.__lhsQuickTimer); panel.__lhsQuickTimer = null; }
    panel.onClickCancelBtn = function () { clear(this); return cancel.apply(this, arguments); };
    panel.OnClose = function () { clear(this); return close.apply(this, arguments); };
    api.installed = true;
  }
  api.layout = layout; api.slot = slot; api.validPets = validPets; api.mergeNotice = mergeNotice;
  api.startRun = startRun; api.stopRun = stopRun;
  install();
}(window));

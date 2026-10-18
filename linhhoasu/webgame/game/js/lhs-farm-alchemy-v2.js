/* Narrow native RPC adaptation. No reward arithmetic or optimistic bag grants. */
(function (root) {
  'use strict';
  if (root.LhsFarmAlchemyV2) return;
  var api = root.LhsFarmAlchemyV2 = { installed: false, attempts: 0, authLost: false, authFailures: 0 };
  api.version = '20261017_auth_guard_v1';
  var toastAt = 0;
  function elapsedClock() { return root.performance && root.performance.now ? root.performance.now() : Date.now(); }
  var tags = [2400,2401,2402,2403,2404,2405,2406,2407,2408,2410,2411,2412,2413,2414,2415,2416,2417,2418,2419,2420,2421,2422,2423,2424,2425,2426,2427,2428,2500,2501];
  var readTags = [2403,2404,2405,2408,2411,2418,2425];
  function isAuthFailure(data) {
    if (!data) return false;
    var code = String(data.code || data.reason || data.errorCode || '').toUpperCase();
    var msg = String(data.msg || data.message || data.error || '').trim().toLowerCase();
    return ['AUTH_REQUIRED','NOT_LOGGED_IN','LOGIN_REQUIRED','SESSION_EXPIRED'].indexOf(code) >= 0
      || /not\s*logged\s*in|session\s*expired|login\s*required/.test(msg);
  }
  function silentAuthError() { return { result: -1, code: 'AUTH_REQUIRED', msg: 'not logged in', silent: true }; }
  function rememberAuthLost(socket) {
    if (!socket || socket._lhsAuthLost) return;
    socket._lhsAuthLost = true;
    socket._lhsFeatureEpoch = null;
    api.authLost = true;
    api.authFailures++;
  }
  function clearAuth(socket) {
    if (socket) {
      socket._lhsAuthLost = false;
      socket._lhsFeatureEpoch = null;
    }
    api.authLost = false;
  }
  function markAuthLost(socket) {
    rememberAuthLost(socket);
    var queue = socket && socket._lhsFeatureEpochQueue;
    if (!queue) return;
    socket._lhsFeatureEpochQueue = null;
    queue.forEach(function (job) { try { job.fail(silentAuthError()); } catch (_) {} });
  }
  function manager() { return root.W || root.GlobalManager || root.GameGlobalYDXZ; }
  function isShop(id) {
    var m = manager(), cfg = m && m.Config, shop = cfg && cfg.ShopConfig[id];
    return shop && (shop.tab === 6 || Number(id) === 104 || (shop.rewards || []).some(function (r) { return cfg.AssetsConfig[r.id] && cfg.AssetsConfig[r.id].type === 9; }));
  }
  function notify(data) {
    if (isAuthFailure(data) || data && data.silent) return;
    if (Date.now() - toastAt < 1500) return;
    toastAt = Date.now();
    var code = data && (data.code || data.reason);
    var messages = { VERIFIED_AD_REQUIRED: 'Chưa có xác thực quảng cáo. Chức năng này cần quyền bỏ qua quảng cáo.',
      FARM_ASSIST_UNAVAILABLE: 'Trợ giúp linh điền chưa được hỗ trợ.', USE_NORMAL_PLANT: 'Hãy dùng nút gieo hạt thường.',
      FARM_REWARD_CONFIG_MISSING: 'Cấu hình cây chưa đầy đủ; vật phẩm được giữ nguyên.', invalid_recipe_or_count: 'Đan phương hoặc số lượng không hợp lệ.',
      insufficient_materials: 'Không đủ nguyên liệu luyện đan.', recipe_not_owned: 'Bạn chưa sở hữu đan phương.',
      FARM_AD_DAILY_LIMIT: 'Đã hết lượt quảng cáo hôm nay.' };
    if (root.UserTips && root.UserTips.ins) root.UserTips.ins().showTips(messages[code] || 'Thao tác chưa thành công. Kiểm tra nguyên liệu, thời gian và điều kiện.');
  }
  function install() {
    api.attempts++;
    var Type = root.GameSocket;
    if (!Type || !Type.prototype || !Type.prototype.Rpc) { if (api.attempts < 120) root.setTimeout(install,100); return; }
    var original = Type.prototype.Rpc;
    // Allocation is server-issued. Device wall clock never controls receipt
    // expiry. Queue the original operation until its epoch is durably saved.
    function withEpoch(socket, work, fail) {
      if (socket._lhsAuthLost) return fail(silentAuthError());
      var state = socket._lhsFeatureEpoch;
      if (state && state.id && elapsedClock() >= state.localStart && elapsedClock() - state.localStart < state.ttl - 60000) return work(state);
      var queue = socket._lhsFeatureEpochQueue;
      if (queue) { if (queue.length >= 64) return fail({code:'FEATURE_QUEUE_FULL'}); queue.push({ work: work, fail: fail }); return; }
      socket._lhsFeatureEpochQueue = [{ work: work, fail: fail }];
      function finish(data) {
        var waiting = socket._lhsFeatureEpochQueue || [];
        socket._lhsFeatureEpochQueue = null;
        if (isAuthFailure(data)) {
          rememberAuthLost(socket);
          waiting.forEach(function (job) { job.fail(silentAuthError()); });
          return;
        }
        var valid = data && data.result === 0 && /^[a-f0-9]{32}$/.test(data.epoch);
        var next = valid ? { id: data.epoch, seq: Number(data.sequence) || 0, localStart: elapsedClock(), ttl: Number(data.expiresIn) || 0 } : null;
        socket._lhsFeatureEpoch = next;
        waiting.forEach(function (job) { if (next) job.work(next); else job.fail(data || { code: 'FEATURE_EPOCH_UNAVAILABLE' }); });
      }
      original.call(socket, 2499, {}, finish, socket, finish);
    }
    Type.prototype.Rpc = function (tag, data, callback, context, onError) {
      var socket = this;
      if (tag === 1) {
        this._lhsFeatureEpoch = null;
        if (typeof callback === 'function') {
          var loginArgs = Array.prototype.slice.call(arguments);
          loginArgs[2] = function (result) {
            if (result && result.result === 0) clearAuth(socket);
            else if (isAuthFailure(result)) markAuthLost(socket);
            return callback.apply(this, arguments);
          };
          return original.apply(this, loginArgs);
        }
      }
      if (!this._lhsFarmDayHandler && this.AddHandler) {
        this._lhsFarmDayHandler = true;
        this.AddHandler(2498, function (state) {
          var m = manager(); if (!m || !state) return;
          api.policy = state.policy;
          if (m.AlchemyModel) m.AlchemyModel.setDayCount(state.dayCount);
          if (m.RechargeModel) m.RechargeModel.setBuyCount(state.shopRecords);
          if (m.AdModel) m.AdModel.setAdCount(state.adRecords);
          if (m.AdModel && state.adTimeRecords) m.AdModel._adTimeRecords = state.adTimeRecords;
          if (m.ItemModel) m.ItemModel.SetItemUseRecord(state.useRecords);
          if (root.MessageCenter && root.MessageDef) ['Shop_Buy_Item','Alchemy_Generate_Update','Land_Dumpling_Update'].forEach(function (key) {
            if (root.MessageDef[key]) root.MessageCenter.ins().dispatch(root.MessageDef[key]);
          });
        }, this);
      }
      var p = data || {}, shop = (tag === 1200 || tag === 1210) && isShop(p.id || p.goodsId)
        || tag === 1202 && Object.keys(p.require || {}).some(isShop);
      var ad = tag === 1220 && [1,2,5].indexOf(Number(p.adId)) >= 0;
      if (tags.indexOf(tag) < 0 && !shop && !ad) return original.apply(this, arguments);
      if (socket._lhsAuthLost) {
        if (onError) onError.call(context, silentAuthError());
        return;
      }
      p = Object.assign({}, p);
      var write = readTags.indexOf(tag) < 0 && !(tag === 2400 && !p.seed);
      var m = manager(), land = m && m.LandModel;
      var cacheBefore = land && land._cacheUseItem ? Object.assign({}, land._cacheUseItem) : null;
      function cleanup() {
        if (!land) return;
        var id = tag === 2400 ? p.seed : tag === 2406 ? p.itemId : 0;
        var used = tag === 2400 ? 1 : Number(p.count) || 0;
        if (id && cacheBefore && cacheBefore[id] > 0 && land._cacheUseItem[id] > 0) land._cacheUseItem[id] = Math.max(0, land._cacheUseItem[id] - used);
        if (m.RepeatRpcBlockModel && [2406,2414,2415,2416,2417,2428].indexOf(tag) >= 0) m.RepeatRpcBlockModel.setRpcRecord(tag===2428?2416:tag,1);
      }
      function received(result) {
        if (isAuthFailure(result)) {
          cleanup();
          markAuthLost(socket);
          if (onError) onError.call(context, silentAuthError());
          return;
        }
        var rejected = !result || result.rejected || result.result < 0 || tag !== 2500 && tag !== 2501 && result.result != null && result.result !== 0;
        if (rejected) {
          cleanup();
          if (land && ((tag === 2426 && result && result.result === 100) || ([2427,2428].indexOf(tag) >= 0 && result && result.result === 2))) {
            land.isLandCardAuto = false;
          }
          if (result && /^FEATURE_EPOCH_/.test(result.code || '')) socket._lhsFeatureEpoch = null;
          notify(result); return;
        }
        if (callback) return callback.call(context,result);
      }
      function failed(error) {
        cleanup();
        if (isAuthFailure(error)) {
          markAuthLost(socket);
          if (onError) onError.call(context, silentAuthError());
          return;
        }
        if (onError) onError.call(context,error); else notify(error);
      }
      function send(epoch) {
        if (epoch) p.requestId = 'v3_' + epoch.id + '_' + (++epoch.seq);
        return original.call(socket,tag,p,received,context,failed);
      }
      if (write && !p.requestId) return withEpoch(socket,send,failed);
      return send(null);
    };
    var Item = root.ItemModel && root.ItemModel.prototype;
    if (Item && Item.onItemChange) {
      var oldChange = Item.onItemChange;
      Item.onItemChange = function (data) {
        // Absolute counts already include accrued recovery. Clear only the
        // pending virtual count for this resource, never unrelated timers.
        if (!this.isFreeze && data && Array.isArray(data.changed) && data.changed.some(function (r) { return r.id === 27; }) && this._timeRecords && this._timeRecords[27]) this._timeRecords[27].count = 0;
        return oldChange.apply(this,arguments);
      };
    }
    var Ad = root.AdModel && root.AdModel.prototype;
    if (Ad && Ad.showRewardAd) {
      var oldAd = Ad.showRewardAd;
      Ad.showRewardAd = function (id, callback, onError, show, claim) {
        if (!api.policy || !api.policy.dailySupport.enabled || [1,2,5].indexOf(id) < 0) return oldAd.apply(this,arguments);
        if (claim === false || id === 5) { if (callback) callback(null); return; }
        return this.sendAdReward(id,callback,show);
      };
    }
    [['LandPlantSelectPanel','updateUi'],['LandSpeedUpPanel','updateUi'],['LandBuildLvupPanel','refreshContent']].forEach(function (entry) {
      var proto = root[entry[0]] && root[entry[0]].prototype, name = entry[1];
      if (!proto || typeof proto[name] !== 'function') return;
      var old = proto[name];
      proto[name] = function () {
        var result = old.apply(this,arguments);
        if (api.policy && api.policy.dailySupport.enabled && this.adBtn) this.adBtn.label = 'Hỗ trợ hằng ngày';
        return result;
      };
    });
    // The native "one-key plant" button starts several seed animations at
    // once. On slow devices the animation callbacks can overlap with socket
    // reservations, leaving an unlocked empty plot unplanted even though the
    // server accepts each individual 2400 request. Serialize only the visual
    // animation callback chain; the server contract and seed selection remain
    // unchanged, and manual single-plot planting is unaffected.
    var LandMain = root.LandMainPanel && root.LandMainPanel.prototype;
    if (LandMain && typeof LandMain.playSeedingAni === 'function' && !LandMain._lhsSeedQueueInstalled) {
      var oldPlaySeedingAni = LandMain.playSeedingAni;
      LandMain._lhsSeedQueueInstalled = true;
      LandMain.playSeedingAni = function (index, callback) {
        var self = this;
        var state = self._lhsSeedAnimationQueue;
        if (!state) state = self._lhsSeedAnimationQueue = { active: false, jobs: [] };
        state.jobs.push({ index: index, callback: callback });
        if (state.active) return;
        var drain = function () {
          var job;
          if (!state.jobs.length) { state.active = false; return; }
          state.active = true;
          job = state.jobs.shift();
          oldPlaySeedingAni.call(self, job.index, function () {
            try { if (job.callback) job.callback(); }
            finally { drain(); }
          });
        };
        drain();
      };
    }
    var Formula = root.AlchemyFormulaSelectPanel && root.AlchemyFormulaSelectPanel.prototype;
    if (Formula && Formula.refreshTabContent) {
      var oldContent = Formula.refreshTabContent;
      Formula.refreshTabContent = function () {
        var result = oldContent.apply(this,arguments), provider = this.probabilityList && this.probabilityList.dataProvider;
        var list = provider && provider.source;
        if (list && list.length) {
          var total = list.reduce(function (sum,row) { return sum + row.baseWeight + row.addWeight; },0);
          if (total > 0) provider.replaceAll(list.map(function (row) { return Object.assign({},row,{normalizedPercent:(row.baseWeight+row.addWeight)*100/total}); }));
        }
        return result;
      };
    }
    var Probability = root.AlchemyMainProbabilityItem && root.AlchemyMainProbabilityItem.prototype;
    if (Probability && Probability.dataChanged) {
      var oldProbability = Probability.dataChanged;
      Probability.dataChanged = function () {
        var result = oldProbability.apply(this,arguments);
        if (this.data && typeof this.data.normalizedPercent === 'number') {
          this.baseValLab.text = this.data.normalizedPercent.toFixed(2) + '%';
          if (this.addValLab) { this.addValLab.visible=false; this.addValLab.includeInLayout=false; }
        }
        return result;
      };
    }
    api.installed = true;
  }
  install();
})(window);

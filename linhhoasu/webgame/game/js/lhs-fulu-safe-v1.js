/* Fulu native transport safety. Server owns economy, outcome and progress. */
(function (root) {
  'use strict';
  var VERSION = '20261008_fulu_safe_v3', MAX_ATTEMPTS = 4, TIMEOUT = 12000;
  if (root.LhsFuluSafeV1 && root.LhsFuluSafeV1.version === VERSION) return;
  var api = root.LhsFuluSafeV1 = { version: VERSION, installed: false,
    rejectedPackets: 0, attempts: 0, timeouts: 0, completed: 0, lastError: '' };
  var active = null, taskPending = null, sequence = 0, memory = {}, originalResult;
  function manager() { return root.GlobalManager || root.GameGlobalYDXZ || root.Y || {}; }
  function definition(name) {
    if (root[name]) return root[name];
    try { return root.egret && root.egret.getDefinitionByName(name); } catch (_) { return null; }
  }
  function owner() {
    var user = root.UserInfo || {}, actor = manager().ActorModel || {};
    var id = user.UserID || user.userId || actor.userId || actor.uid;
    var server = user.ServerID || user.serverId;
    return id && server ? String(server) + ':' + String(id) : '';
  }
  function cycle(data) { return data.id + ':' + data.startTime + ':' + data.endTime; }
  function notify(message) {
    api.lastError = message;
    var tips = definition('UserTips');
    if (tips && tips.ins && tips.ins().showTips) tips.ins().showTips(message);
  }
  function store(key, value) {
    if (value) memory[key] = value; else delete memory[key];
    try {
      if (value) root.sessionStorage.setItem(key, JSON.stringify(value));
      else root.sessionStorage.removeItem(key);
    } catch (_) {}
  }
  function load(key) {
    try { return JSON.parse(root.sessionStorage.getItem(key)) || memory[key]; }
    catch (_) { return memory[key]; }
  }
  function controls(panel) {
    if (!panel) return;
    ['summonBtn', 'closeBtn', 'chooseHulu', 'skipCheckBox'].forEach(function (key) {
      if (panel[key]) panel[key].touchEnabled = true;
    });
  }
  function recoverView(item) {
    var panel = item.panel, data = item.data;
    if (!panel || panel._actData !== data) return;
    controls(panel);
    if (item.payload.module === 0) {
      var selected = Number(data.record) || 0;
      panel._selectedHuluIndex = selected;
      if (panel.noHulu) panel.noHulu.visible = !selected;
      if (panel.myHulu) panel.myHulu.visible = !!selected;
      if (panel.updateMyHuluResource) panel.updateMyHuluResource(selected);
      if (panel.updateHuluSelectionDisplay) panel.updateHuluSelectionDisplay(selected);
    }
  }
  function release(item, message, definitive) {
    if (active !== item) return;
    root.clearTimeout(item.timer);
    if (definitive) store(item.key, null);
    active = null;
    if (item.owner === owner() && cycle(item.data) === item.payload.cycleKey
      && !item.authoritative && item.payload.module === 0
      && Number(item.data.record) === item.payload.index) item.data.record = item.previous;
    recoverView(item);
    if (message) notify(message);
  }
  function validRow(row, item) {
    return row && Number(row.id) === item.payload.id && cycle(row) === item.payload.cycleKey
      && Number.isSafeInteger(row.record) && row.record >= 0 && row.record <= 5
      && Number.isSafeInteger(row.score) && row.score >= 0
      && row.records && typeof row.records === 'object' && !Array.isArray(row.records);
  }
  function validDraw(draw, item) {
    if (!draw || draw.id !== item.payload.id || draw.requestId !== item.payload.requestId
      || draw.cycleKey !== item.payload.cycleKey || !Array.isArray(draw.rewards)
      || !draw.colorCount || typeof draw.colorCount !== 'object' || Array.isArray(draw.colorCount)
      || !Number.isSafeInteger(draw.score) || draw.score < 0
      || !Number.isInteger(draw.special) || draw.special < 0 || draw.special > 5
      || !draw.records || typeof draw.records !== 'object' || Array.isArray(draw.records)) return false;
    var total = 0;
    for (var key in draw.colorCount) {
      var count = draw.colorCount[key];
      if (!Number.isInteger(Number(key)) || Number(key) < 1 || Number(key) > 5
        || !Number.isInteger(count) || count < 0 || count > 5) return false;
      total += count;
    }
    return total === 5 && draw.rewards.every(function (reward) {
      return reward && Number.isSafeInteger(reward.id) && reward.id > 0
        && Number.isSafeInteger(reward.count) && reward.count > 0;
    });
  }
  function current(item) {
    return active === item && item.owner === owner() && cycle(item.data) === item.payload.cycleKey;
  }
  api.onMaintenance = function (reply) {
    if (taskPending && taskMatches(taskPending, reply)) {
      finishTask(taskPending, '', true);
      return true;
    }
    var item = active;
    if (!item || !current(item) || !reply || reply.id !== item.payload.id
      || reply.requestId !== item.payload.requestId || reply.cycleKey !== item.payload.cycleKey) return false;
    applyRow(item, reply);
    release(item, '', true);
    return true;
  };
  function applyRow(item, response) {
    var rows = response && response.datas;
    var row = Array.isArray(rows) && rows.find(function (entry) { return validRow(entry, item); });
    if (!row) return false;
    item.model.OnActivityDataUpdate({ data: row, rewardInfo:
      item.payload.module === 2 && response.result === 0 && !response.replayed ? response.rewardInfo : null });
    item.authoritative = true;
    return true;
  }
  function send(item) {
    if (!current(item)) { release(item, 'Phiên Phúc Lộc đã thay đổi. Hãy mở lại sự kiện.', false); return; }
    if (item.saved.attempts >= MAX_ATTEMPTS) {
      release(item, 'Chưa xác nhận được kết quả Phúc Lộc. Bấm lại đúng thao tác để đồng bộ.', false); return;
    }
    item.saved.attempts++;
    store(item.key, item.saved);
    var attempt = item.saved.attempts;
    api.attempts++;
    function unknown() {
      if (active !== item || item.saved.attempts !== attempt) return;
      if (!current(item)) {
        release(item, 'Phiên Phúc Lộc đã thay đổi. Hãy mở lại sự kiện.', false); return;
      }
      root.clearTimeout(item.timer);
      api.timeouts++;
      send(item);
    }
    item.timer = root.setTimeout(unknown, TIMEOUT);
    try {
      item.model.Rpc(1700, Object.assign({}, item.payload), function (response) {
        if (!current(item) || item.acknowledged) return;
        if (!response || typeof response !== 'object' || !Number.isInteger(response.result)) {
          unknown(); return;
        }
        if (response.requestId && response.requestId !== item.payload.requestId) return;
        if (response.cycleKey && response.cycleKey !== item.payload.cycleKey) return;
        if (response.result !== 0) {
          if (item.saved.attempts !== attempt) return;
          applyRow(item, response);
          if (response.retryable === true || response.result < 0) { unknown(); return; }
          release(item, response.reason || 'Yêu cầu Phúc Lộc bị từ chối.', true); return;
        }
        if (response.requestId !== item.payload.requestId || response.cycleKey !== item.payload.cycleKey
          || !Array.isArray(response.datas) || !response.datas.some(function (r) { return validRow(r, item); })) {
          unknown(); return;
        }
        var draw = response.draw || item.draw;
        if (item.payload.module === 1 && !validDraw(draw, item)) { unknown(); return; }
        root.clearTimeout(item.timer);
        item.acknowledged = true;
        applyRow(item, response);
        store(item.key, null);
        if (item.payload.module === 1 && item.panel && item.panel._actData === item.data) {
          // Hold the native busy state through animation and reward dismissal.
          item.rendering = true;
          item.timer = root.setTimeout(function () {
            if (active === item) release(item, 'Kết quả đã lưu. Hãy mở lại Phúc Lộc để xem.', true);
          }, 60000);
          item.panel.__lhsFuluAnim = {hits: 0, completes: 0, total: 5, final: false};
          try { originalResult.call(item.panel, draw); }
          catch (_) { release(item, 'Kết quả đã lưu. Hãy mở lại Phúc Lộc để xem.', true); }
        } else {
          active = null;
          recoverView(item);
        }
        api.completed++;
        if (typeof item.callback === 'function') item.callback.call(item.context, response);
      }, unknown);
    } catch (_) { unknown(); }
  }
  function begin(model, id, module, index, param, callback, context) {
    var data = model.getActivityDataById(id), actor = owner();
    var panel = data && data.__lhsFuluPanel;
    if (!data || !actor || !Number.isFinite(data.startTime) || !Number.isFinite(data.endTime)) {
      controls(panel); notify('Vui lòng đăng nhập lại để đồng bộ Phúc Lộc.'); return false;
    }
    if (active || taskPending) return false;
    var key = 'lhs-fulu-safe:' + actor + ':' + cycle(data);
    var selected = module === 0 ? index : data.record;
    var signature = [module, index, selected].join(':');
    var saved = load(key);
    if (saved && saved.signature !== signature) {
      controls(panel); notify('Lượt trước chưa được xác nhận. Hãy giữ lựa chọn và đồng bộ lại.'); return false;
    }
    if (!saved) {
      var random = root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID()
        : Date.now().toString(36) + '-' + (++sequence) + '-' + Math.random().toString(36).slice(2);
      saved = { signature: signature, attempts: 0, payload: { id: id, module: module,
        index: index, param: param, selectedColor: selected, cycleKey: cycle(data),
        requestId: Date.now() + '-fulu_' + random.replace(/-/g, '') } };
    }
    // Each explicit user action gets a bounded retry budget. An unresolved
    // persisted request always keeps its exact nonce, cycle and payload.
    saved.attempts = 0;
    var item = active = {model: model, data: data, panel: panel, owner: actor, key: key,
      saved: saved, payload: saved.payload, callback: callback, context: context,
      previous: data.__lhsFuluPrevious !== undefined ? data.__lhsFuluPrevious : data.record};
    delete data.__lhsFuluPrevious;
    send(item);
    return true;
  }
  function install() {
    var model = manager().ActivityModel, Panel = definition('FuluMainPanel');
    if (!model || !Panel || !Panel.prototype || !model.sendActivityOperate) return false;
    var proto = Object.getPrototypeOf(model), panel = Panel.prototype;
    if (!panel.onDrawResult || !panel.onSummonBtnClick || !panel.onYesBtnClick || !panel.showRewardsAndCleanup) return false;
    var operate = proto.sendActivityOperate;
    proto.sendActivityOperate = function (id, module, index, param, callback, context) {
      var cfg = manager().Config && manager().Config.ActivityConfig[id];
      if (!cfg || Number(cfg.activityType) !== 52) return operate.apply(this, arguments);
      return begin(this, id, module, index, param, callback, context);
    };
    var summon = panel.onSummonBtnClick, yes = panel.onYesBtnClick;
    panel.onSummonBtnClick = function () {
      if (active || taskPending) return false;
      this._actData.__lhsFuluPanel = this;
      return summon.apply(this, arguments);
    };
    panel.onYesBtnClick = function () {
      if (active || taskPending) return false;
      this._actData.__lhsFuluPanel = this;
      this._actData.__lhsFuluPrevious = this._actData.record;
      var result = yes.apply(this, arguments);
      if (!active && this._actData.__lhsFuluPrevious !== undefined) {
        this._actData.record = this._actData.__lhsFuluPrevious;
        delete this._actData.__lhsFuluPrevious;
      }
      return result;
    };
    var nativeHit = panel.onHuluDropHit, nativeComplete = panel.onHuluDropComplete;
    var nativeFinal = panel.performFinalJudgment;
    if (nativeHit && nativeComplete && nativeFinal) {
      panel.onHuluDropHit = function (event) {
        var state = this.__lhsFuluAnim;
        if (state) state.hits++;
        var result = nativeHit.apply(this, arguments);
        if (state && !state.final && state.hits >= state.total && state.completes >= state.total) nativeFinal.call(this);
        return result;
      };
      panel.onHuluDropComplete = function () {
        var state = this.__lhsFuluAnim;
        if (state) state.completes++;
        return nativeComplete.apply(this, arguments);
      };
      panel.performFinalJudgment = function () {
        var state = this.__lhsFuluAnim;
        if (state && state.final) return false;
        if (state) state.final = true;
        return nativeFinal.apply(this, arguments);
      };
    }
    originalResult = panel.onDrawResult;
    panel.onDrawResult = function (packet) {
      var item = active;
      if (!item || !current(item) || item.panel !== this || item.acknowledged || !validDraw(packet, item)) {
        api.rejectedPackets++; return;
      }
      item.draw = packet;
    };
    var cleanup = panel.showRewardsAndCleanup;
    panel.showRewardsAndCleanup = function () {
      var self = this, item = active;
      // Native can call cleanup again while the reward popup from the first
      // call is still open. The native second call takes the empty-pending
      // branch and re-enables the draw controls behind that popup. Keep the
      // committed draw owned by the current item until the popup dismisses.
      if (item && item.panel === self && item.rendering && item.cleanupStarted) return false;
      if (item && item.panel === self && item.rendering) item.cleanupStarted = true;
      var result = cleanup.apply(this, arguments);
      if (item && item.panel === self && item.rendering) {
        root.clearTimeout(item.timer);
        // Native reward popup callback changes touchEnabled only after dismissal.
        var elapsed = 0;
        function finished() {
          if (active !== item) return;
          if (self.summonBtn.touchEnabled) { active = null; return; }
          if ((elapsed += 250) >= 60000) { release(item, '', true); return; }
          item.timer = root.setTimeout(finished, 250);
        }
        finished();
      }
      return result;
    };
    var close = panel.OnClose;
    panel.OnClose = function () {
      if (active && active.panel === this) release(active, '', !!active.acknowledged);
      return close && close.apply(this, arguments);
    };
    var disconnect = proto.OnSocketClose;
    proto.OnSocketClose = function () {
      if (active) release(active, 'Mất kết nối. Lượt Phúc Lộc sẽ được đối soát khi thử lại.', !!active.acknowledged);
      if (taskPending) finishTask(taskPending, 'Mất kết nối. Bấm nhận lại để đối soát nhiệm vụ Phúc Lộc.', false);
      return disconnect && disconnect.apply(this, arguments);
    };
    api.installed = true;
    return true;
  }
  var count = 0;
  function boot() { if (!install() && ++count < 300) root.setTimeout(boot, 100); }
  function taskDay() {
    var clock = definition('GameServer');
    var date = new Date((Number(clock && clock.serverTimeMilli) || Date.now()) + 7 * 3600000);
    return date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
  }
  function taskMatches(item, reply) {
    return taskPending === item && item.owner === owner() && cycle(item.data) === item.payload.cycleKey
      && taskDay() === item.payload.dayKey
      && reply && reply.requestId === item.payload.requestId && reply.cycleKey === item.payload.cycleKey
      && reply.dayKey === item.payload.dayKey;
  }
  function finishTask(item, message, definitive) {
    if (taskPending !== item) return;
    root.clearTimeout(item.timer);
    if (definitive) store(item.key, null);
    taskPending = null;
    if (message) notify(message);
  }
  function applyTaskInfo(item, response) {
    var tasks = response.taskInfo && response.taskInfo.tasks;
    if (!tasks || typeof item.model.onTaskUpdate !== 'function') return;
    Object.keys(tasks).forEach(function (id) {
      var task = tasks[id];
      if (Number(id) >= 75001 && Number(id) <= 75005 && task && task.type === item.payload.type
        && [10,20,30].indexOf(task.status) >= 0) item.model.onTaskUpdate({task: task});
    });
  }
  function taskClaimConfirmed(item) {
    if (item.owner !== owner() || cycle(item.data) !== item.payload.cycleKey
      || taskDay() !== item.payload.dayKey || typeof item.model.getTaskDataByType !== 'function') return false;
    var rows = item.model.getTaskDataByType(item.payload.type) || [];
    return item.payload.ids.every(function (id) {
      return rows.some(function (row) {return row.id === id && row.status === 30;});
    });
  }
  function sendTask(item) {
    if (taskPending !== item || item.owner !== owner() || cycle(item.data) !== item.payload.cycleKey
      || taskDay() !== item.payload.dayKey) {
      finishTask(item, 'Phiên nhiệm vụ Phúc Lộc đã thay đổi.', false); return;
    }
    if (item.saved.attempts >= MAX_ATTEMPTS) {
      finishTask(item, 'Chưa xác nhận được phần thưởng. Bấm nhận lại đúng nhiệm vụ để đồng bộ.', false); return;
    }
    item.saved.attempts++;
    store(item.key, item.saved);
    var attempt = item.saved.attempts;
    function unknown() {
      if (taskPending !== item || item.saved.attempts !== attempt) return;
      // Native task state is server-pushed, never optimistically marked claimed.
      // A confirmed status30 for every requested task proves the one-time ledger
      // is settled even if its RPC ACK vanished. No new reward is fabricated.
      if (taskClaimConfirmed(item)) {finishTask(item, 'Phần thưởng nhiệm vụ đã được đồng bộ.', true); return;}
      root.clearTimeout(item.timer); sendTask(item);
    }
    item.timer = root.setTimeout(unknown, TIMEOUT);
    try {
      item.rpc.call(item.model, item.tag, JSON.parse(JSON.stringify(item.payload)), function (response) {
        if (taskPending !== item) return;
        if (item.owner !== owner() || cycle(item.data) !== item.payload.cycleKey
          || taskDay() !== item.payload.dayKey) {
          finishTask(item, 'Phiên nhiệm vụ Phúc Lộc đã thay đổi.', false); return;
        }
        if (!response || !Number.isInteger(response.result)) { unknown(); return; }
        if (!taskMatches(item, response)) return;
        if (response.result !== 0) {
          if (item.saved.attempts !== attempt) return;
          if (response.retryable === true || response.result < 0) { unknown(); return; }
          applyTaskInfo(item, response);
          finishTask(item, response.reason || 'Chưa nhận được phần thưởng nhiệm vụ.', true);
          return;
        }
        if (!Array.isArray(response.ids) || response.ids.some(function (id) {return item.payload.ids.indexOf(id) < 0;})
          || !response.rewardInfo || !Array.isArray(response.rewardInfo.items)
          || response.rewardInfo.items.some(function (reward) {
            return !reward || !Number.isSafeInteger(reward.id) || reward.id <= 0
              || !Number.isSafeInteger(reward.count) || reward.count <= 0;
          })) { unknown(); return; }
        applyTaskInfo(item, response);
        finishTask(item, '', true);
        if (typeof item.callback === 'function') item.callback.call(item.model, response);
      }, unknown);
    } catch (_) { unknown(); }
  }
  function installTasks() {
    if (api.tasksInstalled) return true;
    var model = manager().TaskModel;
    if (!model || typeof model.Rpc !== 'function') return false;
    var proto = Object.getPrototypeOf(model), rpc = proto.Rpc;
    proto.Rpc = function (tag, payload, callback, failure) {
      var ids = payload && (Array.isArray(payload.ids) ? payload.ids.slice() : [payload.taskId || payload.id]);
      var scoped = ids && ids.length && ids.some(function (id) {return Number(id) >= 75001 && Number(id) <= 75005;});
      if ((tag !== 1000 && tag !== 1801) || !scoped) return rpc.apply(this, arguments);
      if (active || taskPending) return false;
      if (ids.some(function (id) {return !Number.isInteger(id) || id < 75001 || id > 75005;})) {
        notify('Danh sách nhiệm vụ Phúc Lộc không hợp lệ.'); return false;
      }
      var actor = owner(), activityId = Number(payload.activityId) || (Number(payload.type) ^ (1 << 30));
      var activity = manager().ActivityModel, data = activity && activity.getActivityDataById(activityId);
      var cfg = manager().Config && manager().Config.ActivityConfig[activityId];
      if (!actor || !data || !cfg || Number(cfg.activityType) !== 52) {
        notify('Hãy mở lại Phúc Lộc để đồng bộ nhiệm vụ.'); return false;
      }
      ids = ids.filter(function (id, index) {return ids.indexOf(id) === index;}).sort(function (a,b) {return a-b;});
      var day = taskDay(), key = 'lhs-fulu-tasks:' + actor + ':' + cycle(data) + ':' + day;
      var signature = tag + ':' + ids.join(',');
      var saved = load(key);
      if (saved && saved.signature !== signature) {
        notify('Phần thưởng trước chưa xác nhận. Hãy nhận lại đúng nhiệm vụ đó.'); return false;
      }
      if (!saved) {
        var random = root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID().replace(/-/g,'')
          : Date.now().toString(36) + '_' + (++sequence) + '_' + Math.random().toString(36).slice(2);
        saved = {signature: signature, attempts: 0, payload: Object.assign({}, payload, {
          ids: ids, type: activityId | (1 << 30), activityId: activityId, cycleKey: cycle(data), dayKey: day,
          requestId: Date.now() + '-fulutask_' + random})};
      }
      saved.attempts = 0;
      var item = taskPending = {rpc: rpc, model: this, tag: tag, callback: callback, failure: failure,
        owner: actor, data: data, key: key, saved: saved, payload: saved.payload};
      sendTask(item);
      return true;
    };
    api.tasksInstalled = true;
    return true;
  }
  var taskCount = 0;
  function taskBoot() {if (!installTasks() && ++taskCount < 300) root.setTimeout(taskBoot, 100);}
  boot();
  taskBoot();
}(window));

/* Tower choices and sweep: server snapshots, offer identity and retry receipts. */
(function(root) {
  'use strict';
  if (root.LhsTowerFixV2) return;
  var api = root.LhsTowerFixV2 = { version: '20261019_tower_complete_v7' };
  var identity = '', highDay = 0, highRevision = -1, skill = null, sweep = null;
  function manager() { return root.GlobalManager || root.GameGlobalYDXZ || root.W || {}; }
  function owner() { var m = manager(), u = root.UserInfo || {}; return m.ActorModel && m.ActorModel.actorID ? u.ServerID + ':' + u.UserID + ':' + m.ActorModel.actorID : ''; }
  function bindOwner() {
    var id = owner();
    if (id !== identity) { identity = id; highDay = 0; highRevision = -1; skill = sweep = null; }
    return id;
  }
  function tips(text) { if (root.UserTips && root.UserTips.ins) root.UserTips.ins().showTips(text); }
  function emit(key) { var c = root.MessageCenter && root.MessageCenter.ins(); if (c) c.dispatch((root.MessageDef || {})[key] || key); }
  function refresh() { if (root.LhsTowerDaily) root.LhsTowerDaily.refresh(); }
  function hasChoice(m) { var i = m && m.towerInfo; return !!i && (Number(i.skillCount) > 0 || Array.isArray(i.skills) && i.skills.length > 0); }
  function newId() { return Date.now() + '-tower_' + Math.random().toString(36).slice(2, 14); }
  function applySnapshot(r) {
    var m = manager().ClimbingTowerModel;
    if (!m || !r || r.result !== 0 || !Number.isFinite(r.nextResetAt) || !Number.isSafeInteger(r.towerRevision)) return false;
    bindOwner();
    if (r.dayKey < highDay || (r.dayKey === highDay && r.towerRevision < highRevision)) return false;
    var before = m.towerInfo || {};
    var choiceChanged = before.offerId !== r.offerId || before.skillCount !== r.skillCount ||
      JSON.stringify(before.skills || []) !== JSON.stringify(r.skills || []) || JSON.stringify(before.slotlist || []) !== JSON.stringify(r.slotlist || []);
    highDay = r.dayKey; highRevision = r.towerRevision;
    // A fresh snapshot can reconcile a lost skill ACK. The old offer can no
    // longer commit, so keeping its pending lock would trap a closed popup.
    if (skill && r.offerId !== skill.params.offerId &&
      (r.dayKey > skill.day || r.towerRevision > skill.revision)) skill = null;
    (m.__lhsTowerNativeInit || m.initData).call(m, r);
    if (root.LhsTowerDaily) { root.LhsTowerDaily.day = r.dayKey; root.LhsTowerDaily.nextResetAt = r.nextResetAt; }
    emit('CLIMBING_TOWER_INFO_UPDATE');
    if (choiceChanged) emit('CLIMBING_TOWER_SKILL_SELECT');
    emit('CLIMBING_TOWER_AUTO_SKILL_SELECT');
    return true;
  }
  function sendTransaction(kind, tag, data, ok, error) {
    var m = manager().ClimbingTowerModel, id = bindOwner();
    if (!id || !m) return false;
    var op = kind === 'skill' ? skill : sweep;
    if (op && (op.inFlight || op.blocked)) return false;
    if (!op) {
      op = { id: id, params: data, ok: ok, error: error, attempt: 0, day: Number(m.towerInfo && m.towerInfo.dayKey || 0), revision: Number(m.towerInfo && m.towerInfo.towerRevision || 0) };
      op.params.requestId = newId();
      if (kind === 'skill') skill = op; else sweep = op;
    }
    // Reconcile the original transaction before accepting a new choice after timeout.
    op.inFlight = true;
    var attempt = ++op.attempt;
    var timer = root.setTimeout(function() {
      if (op.attempt !== attempt || (kind === 'skill' ? skill : sweep) !== op || owner() !== id) return;
      op.inFlight = false;
      tips('Chưa nhận được kết quả. Bấm lại để kiểm tra giao dịch vừa gửi.');
    }, 10000);
    function finish() { root.clearTimeout(timer); if (op.attempt === attempt) op.inFlight = false; }
    function current() { return owner() === id && (kind === 'skill' ? skill : sweep) === op; }
    function failed(r) {
      finish(); if (!current()) return;
      tips('Kết nối gián đoạn. Bấm lại để kiểm tra kết quả.');
      if (typeof op.error === 'function') op.error.call(m, r);
    }
    try {
      return m.__lhsTowerNativeRpc.call(m, tag, op.params, function(r) {
        finish(); if (!current()) return;
        if (!r || r.result !== 0) {
          if (r && r.code === 'TOWER_SAVE_UNCONFIRMED') op.blocked = true;
          else if (kind === 'skill') skill = null; else sweep = null;
          if (!(r && applySnapshot(r.updateInfo))) refresh();
          tips(r && r.msg || 'Chưa cập nhật được lựa chọn. Vui lòng mở lại bảng.');
          if (typeof op.error === 'function') op.error.call(m, r);
          return;
        }
        if (kind === 'skill') skill = null; else sweep = null;
        applySnapshot(r.updateInfo || r);
        // Native callbacks must not restore an older offer after a delayed response.
        var callbackData = kind === 'skill' ? Object.assign({}, r, m.towerInfo, { result: 0 }) : r;
        if (typeof op.ok === 'function') op.ok.call(m, callbackData);
      }, failed);
    } catch (e) { failed(e); return false; }
  }
  function sendSkill(data, ok, error) {
    var m = manager().ClimbingTowerModel; bindOwner();
    if (skill) return sendTransaction('skill', 3700, data, ok, error);
    var info = m && m.towerInfo;
    if (!info || !info.offerId) { refresh(); tips('Đang cập nhật bảng kỹ năng. Vui lòng chọn lại.'); return false; }
    var expected = data.offerId || info.offerId;
    if (expected !== info.offerId) { refresh(); tips('Lựa chọn đã thay đổi. Vui lòng chọn lại.'); return false; }
    return sendTransaction('skill', 3700, {
      select: data.select, replace: data.replace, offerId: expected,
      skillId: data.select < 0 ? 0 : (data.skillId == null ? info.skills[data.select] : data.skillId),
    }, ok, error);
  }
  function sendSweep() {
    var m = manager().ClimbingTowerModel; bindOwner();
    if (!m || skill) return false;
    if (hasChoice(m)) return m.continueFighting();
    return sendTransaction('sweep', 3705, {}, function(r) {
      tips(r.replay ? 'Đã xác nhận kết quả quét trước đó.' : 'Đã quét ' + Number(r.sweepCount || 0) + ' tầng.');
      if (hasChoice(m)) m.continueFighting();
    });
  }
  function definition(name) { try { return root[name] || (root.egret && root.egret.getDefinitionByName(name)); } catch (_) { return null; } }
  function installViews() {
    var Main = definition('ClimbingTowerMain');
    if (Main && !Main.prototype.__lhsTowerClockV6) {
      var mainUpdate = Main.prototype.updateViewUI;
      Main.prototype.updateViewUI = function() {
        var result = mainUpdate.apply(this, arguments), info = manager().ClimbingTowerModel.towerInfo;
        if (this.timeLab && info && Number.isFinite(info.nextResetAt)) this.timeLab.SetEndTime(info.nextResetAt / 1000);
        return result;
      };
      Main.prototype.__lhsTowerClockV6 = true;
    }
    var Selection = definition('ClimbingTowerSkillSelectionMain'), Replace = definition('ClimbingTowerReplaceSkillPanel');
    var Reward = definition('ClimbingTowerReward'), Item = definition('ClimbingTowerRewardItem');
    if (Selection && !Selection.prototype.__lhsTowerV5) {
      var p = Selection.prototype, update = p.updateViewUI;
      p.updateViewUI = function() { var r = update.apply(this, arguments); this.__lhsOfferId = manager().ClimbingTowerModel.towerInfo.offerId; return r; };
      p.onConfirm = function() {
        var m = manager().ClimbingTowerModel, info = m.towerInfo, row = this.skillList[this.index];
        if (!row) return;
        if (!this.__lhsOfferId || this.__lhsOfferId !== info.offerId) { refresh(); return; }
        var offer = this.__lhsOfferId, index = this.index, chosen = row.id;
        var send = function(slot) { m.sendSelectSkill(index, slot, null, { offerId: offer, skillId: chosen }); };
        var slot = m.getIndexById(chosen);
        if (slot >= 0) send(slot);
        else if (m.checkEmptySlot()) send(m.getSkillSlotCount());
        else {
          var views = root.ViewManager || definition('ViewManager');
          if (views && views.ins && Replace) views.ins().open(Replace, send);
        }
      };
      p.__lhsTowerV5 = true;
    }
    if (Reward && !Reward.prototype.__lhsTowerV5 && root.eui) {
      var rp = Reward.prototype, open = rp.OnOpen;
      rp.update = function() {
        var m = manager(), i = m.ClimbingTowerModel.towerInfo || {}, rows = [], table = m.Config.TowerRewardConfig;
        Object.keys(table || {}).forEach(function(k) { var r = table[k]; rows.push({ level: r.id, rewards: r.rewards,
          done: (i.claimedMilestones || []).indexOf(r.id) >= 0, unknown: r.id <= Number(i.curlayer || 0) && (i.claimedMilestones || []).indexOf(r.id) < 0 }); });
        this.list.dataProvider = new root.eui.ArrayCollection(rows);
      };
      rp.OnOpen = function() {
        var result = open.apply(this, arguments); this.commonWin.Title = 'Thưởng mốc hôm nay';
        if (this.observe) this.observe((root.MessageDef || {}).CLIMBING_TOWER_INFO_UPDATE || 'CLIMBING_TOWER_INFO_UPDATE', this.update);
        refresh(); return result;
      };
      rp.__lhsTowerV5 = true;
    }
    if (Item && !Item.prototype.__lhsTowerV5) {
      var itemData = Item.prototype.dataChanged;
      Item.prototype.dataChanged = function() { itemData.apply(this, arguments); if (this.data) { this.titleLabel.text = 'Thưởng mốc tầng ' + this.data.level; this.unfinishedLab.text = this.data.unknown ? 'Chưa xác minh' : 'Chưa đạt'; } };
      Item.prototype.__lhsTowerV5 = true;
    }
    return !!(Selection && Selection.prototype.__lhsTowerV5 && Reward && Reward.prototype.__lhsTowerV5);
  }
  function install() {
    var m = manager().ClimbingTowerModel;
    if (!m || typeof m.onFighting !== 'function' || typeof m.Rpc !== 'function') return false;
    if (!m.__lhsTowerFixV5) {
      var fight = m.onFighting, update = m.updateTowerInfo;
      m.__lhsTowerNativeInit = m.initData; m.__lhsTowerNativeRpc = m.Rpc;
      m.updateTowerInfo = function(r) { if (r && Number.isFinite(r.nextResetAt)) return applySnapshot(r); return update.apply(this, arguments); };
      m.onFighting = function(state) { if (skill || sweep && sweep.inFlight) return; if (hasChoice(this)) return this.continueFighting(); return Number(state) === 3 ? sendSweep() : fight.apply(this, arguments); };
      m.Rpc = function(tag, data, ok, error) {
        var self = this, id = bindOwner();
        if (Number(tag) === 3700) return sendSkill(data, ok, error);
        if ([3702, 3703].indexOf(Number(tag)) < 0) return this.__lhsTowerNativeRpc.apply(this, arguments);
        if (skill && skill.inFlight) return false;
        return this.__lhsTowerNativeRpc.call(this, tag, data, function(r) {
          if (owner() !== id) return;
          if (r && r.updateInfo) applySnapshot(r.updateInfo);
          if (!r || r.result !== 0) { tips(r && r.msg || 'Chưa cập nhật được kỹ năng.'); refresh(); if (typeof error === 'function') error.call(self, r); return; }
          if (typeof ok === 'function') ok.call(self, Object.assign({}, r, self.towerInfo, { result: 0, priority: self.towerInfo.autoPriority }));
        }, error);
      };
      m.sendSelectSkill = function(index, slot, callback, expected) {
        return this.Rpc(3700, { select: index, replace: slot, offerId: expected && expected.offerId, skillId: expected && expected.skillId }, function() { if (typeof callback === 'function') callback(); });
      };
      m.__lhsTowerFixV5 = true;
    }
    return installViews();
  }
  api.send = sendSweep; api.applySnapshot = applySnapshot;
  (function tick() { bindOwner(); api.installed = install(); root.setTimeout(tick, 1000); }());
}(window));

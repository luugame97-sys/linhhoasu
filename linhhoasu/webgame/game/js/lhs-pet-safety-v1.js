/* Pet response guards and equipped-recipient EXP feeding. */
(function (root) {
  'use strict';
  var VERSION = '20261018_pet_safety_v4';
  if (root.LhsPetSafety && root.LhsPetSafety.version === VERSION) return;
  var api = root.LhsPetSafety = { version: VERSION, installed: false, attempts: 0 };
  function manager() { return root.GlobalManager || root.GameGlobalYDXZ || root.W; }
  function def(name) { return root[name] || (root.egret && root.egret.getDefinitionByName(name)); }
  function notice(text) { if (root.UserTips && root.UserTips.ins) root.UserTips.ins().showTips(text); }
  function dispatch(name, a, b, c, d) { if (root.MessageCenter && root.MessageDef) root.MessageCenter.ins().dispatch(root.MessageDef[name], a, b, c, d); }
  var messages = {
    3304: 'Không thể nâng cấp. Hãy kiểm tra giới hạn cấp và nguyên liệu.',
    3305: 'Không thể thay đổi khóa kỹ năng. Hãy mở lại thông tin thú.',
    3306: 'Không thể tẩy kỹ năng. Hãy kiểm tra kỹ năng đang khóa và nguyên liệu.',
    3307: 'Không thể đặt lại thú. Hãy kiểm tra nguyên liệu.',
    3308: 'Không thể mở thêm ô linh thú.',
    3309: 'Không thể nhận thưởng đồ giám. Hãy kiểm tra điều kiện hoặc phần thưởng đã nhận.',
    3310: 'Không thể thay đổi khóa linh thú.',
    3312: 'Không thể đổi linh thú. Hãy kiểm tra khóa, Hồn thú liên kết và nguyên liệu.',
    3313: 'Không thể thay đổi nguyện vọng linh thú.'
  };
  function valid(tag, reply) {
    if (!reply || reply.result !== 0) return false;
    if ([3304,3305,3306,3307,3310,3312].indexOf(tag) >= 0 && (!reply.data || !Number.isSafeInteger(reply.data.uid))) return false;
    if (tag === 3312 && !Array.isArray(reply.costUid)) return false;
    if (tag === 3309 && (!Array.isArray(reply.rewardedAtlas) || !reply.rewards)) return false;
    return true;
  }
  function upgradeQuote(model, uid, requested) {
    var g = manager(), pet = model.getPetDataByUid(uid), cfg = g && g.Config;
    var row = pet && cfg && cfg.PetConfig[pet.id];
    var quality = row && cfg.PetQualityConfig[row.quality];
    var base = quality && quality.consumes && quality.consumes[0];
    var add = quality && quality.addConsumes && quality.addConsumes[0];
    if (!pet || !base || !Number.isSafeInteger(pet.level) || !g.ItemModel) return null;
    var count = Math.min(10, Math.max(1, Math.floor(Number(requested) || 1)), Math.max(0, model.getPetLevelMax(row.quality, true) - pet.level));
    var owned = Number(g.ItemModel.GetItemCount(base.id)), total = 0, levels = 0;
    var first = Number(base.count) + Number(add && add.count || 0) * (pet.level - 1);
    if (!Number.isFinite(owned) || !Number.isSafeInteger(first) || first < 0) return null;
    for (var i = 0; i < count; i++) {
      var cost = first + Number(add && add.count || 0) * i;
      if (!Number.isSafeInteger(cost) || cost < 0 || !Number.isSafeInteger(total + cost) || total + cost > owned) break;
      total += cost; levels++;
    }
    return { levels: levels, cost: total, firstCost: first, itemId: base.id, remaining: Math.max(0, model.getPetLevelMax(row.quality, true) - pet.level) };
  }
  function installUpgrade(model, Detail, nativeRpc) {
    function actor() { var g = manager(); return g && g.ActorModel && g.ActorModel.actorID; }
    function blocked() {
      var op = model.__lhsUpgradeOp;
      if (op && (op.info !== model._petInfo || op.actor !== actor())) { root.clearTimeout(op.timer); model.__lhsUpgradeOp = null; op = null; }
      return !!op;
    }
    model.sendUpgrade = function (uid, requested, onSuccess, onFailure) {
      if (blocked()) return false;
      var quote = upgradeQuote(this, uid, requested);
      if (!quote || !quote.levels) {
        notice(quote && !quote.remaining ? 'Linh thú đã đạt cấp tối đa.' : 'Không đủ Quả Linh để nâng thêm cấp.');
        if (onFailure) onFailure({ result: -1, retryable: false });
        return false;
      }
      var self = this, op = { info: this._petInfo, actor: actor(), gesture: this.__lhsUpgradeGesture, done: false, timer: null };
      this.__lhsUpgradeOp = op;
      function current() { return self.__lhsUpgradeOp === op && self._petInfo === op.info && actor() === op.actor; }
      function reject(reply, uncertain) {
        if (op.done) return;
        op.done = true; root.clearTimeout(op.timer);
        if (!current()) return;
        if (!uncertain) self.__lhsUpgradeOp = null;
        notice(uncertain ? 'Chưa xác nhận được nâng cấp. Hãy đăng nhập lại để kiểm tra trước khi thử tiếp.'
          : reply && reply.msg || messages[3304]);
        if (onFailure) onFailure(reply);
      }
      op.timer = root.setTimeout(function () { reject(null, true); }, 15000);
      try {
        nativeRpc.call(this, 3304, { uid: uid, lv: quote.levels }, function (reply) {
          if (op.done || !current()) return;
          if (!valid(3304, reply) || reply.data.uid !== uid || !Number.isSafeInteger(reply.data.level)) {
            var definite = reply && reply.result === -1 && !reply.requiresReconnect
              && !/SAVE|SESSION|TIMEOUT|REQUEST_FAILED|OPERATION_TIMEOUT/i.test(reply.code || '')
              && !/^not logged in$/i.test(reply.msg || '');
            reject(reply, !definite); return;
          }
          op.done = true; root.clearTimeout(op.timer); self.__lhsUpgradeOp = null;
          self.updatePetData(reply.data);
          var g = manager();
          if (g.SoundManager) g.SoundManager.PlayEffect('common_levelup_1_mp3');
          if (self.__lhsUpgradeGesture === op.gesture) self.nowUpgradeTimes++;
          dispatch('PET_DATA_UPDATE'); dispatch('ATTR_CHANGE', 6); dispatch('PET_EQUIP_RED_UPDATE');
          if (g.CuriosModel) g.CuriosModel.taskCheck();
          if (onSuccess) onSuccess(reply);
        }, null, function (reply) { reject(reply, true); });
      } catch (_) { reject(null, true); }
      return true;
    };
    function requested(view) {
      // Acceleration belongs to this held gesture, never a previous pet/press.
      if (!view.__lhsUpgradeHeld) return 1;
      var base = manager().Config.PetBaseConfig, counts = base.speedUpScale || [0], levels = base.speedUpLevel || [1];
      for (var i = counts.length - 1; i >= 0; i--) if (model.nowUpgradeTimes >= counts[i]) return levels[i] || 1;
      return 1;
    }
    function resetGesture(view, held) {
      view.__lhsUpgradeHeld = held;
      model.nowUpgradeTimes = 0;
      model.__lhsUpgradeGesture = (model.__lhsUpgradeGesture || 0) + 1;
    }
    function showCost(view) {
      var quote = upgradeQuote(model, view._petUId, requested(view));
      if (quote && view.costItem && view.costItem.data) {
        var data = Object.assign({}, view.costItem.data);
        data.costId = quote.itemId; data.costCount = quote.levels ? quote.cost : quote.firstCost;
        view.costItem.data = data;
      }
    }
    var proto = Detail.prototype, nativeOpen = proto.OnOpen, nativeClose = proto.OnClose, nativeUpdate = proto.update;
    proto.OnOpen = function () {
      this.__lhsUpgradeClosed = false; this.__lhsUpgradeStopped = false; this.__lhsUpgradeHeld = false;
      resetGesture(this, false);
      this.__lhsUpgradeGeneration = (this.__lhsUpgradeGeneration || 0) + 1;
      var result = nativeOpen && nativeOpen.apply(this, arguments), self = this;
      if (this.upgradeBtn && !this.__lhsUpgradeTouchInstalled && root.egret && root.egret.TouchEvent) {
        this.__lhsUpgradeTouchInstalled = true;
        this.upgradeBtn.addEventListener(root.egret.TouchEvent.TOUCH_BEGIN, function () {
          self.__lhsUpgradeStopped = false; resetGesture(self, true); showCost(self);
        }, this);
        [root.egret.TouchEvent.TOUCH_END, root.egret.TouchEvent.TOUCH_RELEASE_OUTSIDE, root.egret.TouchEvent.TOUCH_CANCEL].forEach(function (event) {
          if (event) self.upgradeBtn.addEventListener(event, function () {
            resetGesture(self, false); showCost(self);
          }, self);
        });
      }
      return result;
    };
    proto.OnClose = function () {
      this.__lhsUpgradeClosed = true; this.__lhsUpgradeStopped = true; this.__lhsUpgradeHeld = false;
      resetGesture(this, false);
      this.__lhsUpgradeGeneration = (this.__lhsUpgradeGeneration || 0) + 1;
      if (this.compSpine) this.compSpine.visible = false;
      return nativeClose && nativeClose.apply(this, arguments);
    };
    proto.update = function () { var result = nativeUpdate && nativeUpdate.apply(this, arguments); showCost(this); return result; };
    proto.sendUpgrade = function () {
      if (this.__lhsUpgradeClosed || this.__lhsUpgradeStopped || blocked() || !(this._petUId > 0)) return;
      var self = this, uid = this._petUId, generation = this.__lhsUpgradeGeneration;
      showCost(this);
      model.sendUpgrade(uid, requested(this), function () {
        if (self.__lhsUpgradeClosed || self._petUId !== uid || self.__lhsUpgradeGeneration !== generation || !self.compSpine) return;
        self.compSpine.visible = true;
        self.compSpine.setAnimation(0, 'a_1', false).waitPlayEnd().then(function () {
          if (self.__lhsUpgradeGeneration === generation && self.compSpine) self.compSpine.visible = false;
        });
      }, function () { if (self.__lhsUpgradeGeneration === generation) self.__lhsUpgradeStopped = true; });
    };
    api.upgradeQuote = function (uid, count) { return upgradeQuote(model, uid, count); };
  }
  function install() {
    api.attempts++;
    var g = manager(), View = def('PetMainView'), Detail = def('PetDetailView');
    if (!g || !g.PetModel || !View || !Detail) { if (api.attempts < 600) root.setTimeout(install, 100); return; }
    // Register after the resource catalog is ready, before EUI reads this badge.
    // The existing image is missing only from the CN resource manifest.
    var Info = def('PetInfoItem'), nativeInfo = Info && Info.prototype.setData;
    if (nativeInfo) Info.prototype.setData = function (data) {
      if (data && data.quality === 10 && !root.RES.hasRes('common_bm_quality_10')) {
        root.RES.$addResourceData({ name: 'common_bm_quality_10', type: 'image',
          url: '/update/resource/assets/atlas_ui/0_common/bm/lang_cn/common_bm_quality_10_264c3006.png' });
      }
      return nativeInfo.apply(this, arguments);
    };
    var model = g.PetModel, nativeRpc = model.Rpc;
    model.Rpc = function (tag, params, success, context, failure) {
      if (!messages[tag]) return nativeRpc.apply(this, arguments);
      var args = Array.prototype.slice.call(arguments);
      args[2] = function (reply) {
        if (!valid(tag, reply)) {
          notice(reply && reply.msg || messages[tag]);
          if (failure) failure.call(this, reply);
          return;
        }
        if (success) return success.apply(this, arguments);
      };
      return nativeRpc.apply(this, args);
    };
    installUpgrade(model, Detail, nativeRpc);
    model.sendPetEat = function (matUid, targetUid, fromSlot, toSlot, onSuccess, onFailure) {
      var self = this;
      this.Rpc(3311, { matUid: matUid, targetUid: targetUid }, function (reply) {
        if (!reply || reply.result !== 0 || !reply.data) {
          notice(reply && reply.msg || 'Không thể cho ăn. Hãy kiểm tra khóa pet và nguyên liệu EXP.');
          if (onFailure) onFailure(reply);
          return;
        }
        var target = reply.data, previous = self.getPetDataByUid(target.uid);
        self.deletePet(target.uid === matUid ? targetUid : matUid);
        self.updatePetData(target);
        if (target.slot < 0) {
          dispatch('PET_DATA_UPDATE', [fromSlot, toSlot]);
          if (onSuccess) onSuccess();
        } else {
          dispatch('PET_FLYICON_UPDATE', reply.rewards, target.slot);
          dispatch('PET_COMP_UPDATE', previous, target, [fromSlot, toSlot], onSuccess);
        }
        dispatch('ATTR_CHANGE', 6, 19);
        dispatch('CHANGE_IDLE_MAP_ROLE_SHOW');
      }, null, function (reply) {
        notice('Chưa xác nhận được thao tác. Hãy đăng nhập lại để kiểm tra trước khi thử tiếp.');
        if (onFailure) onFailure(reply);
      });
    };
    var nativeEnd = View.prototype.onTouchEnd;
    View.prototype.onTouchEnd = function (event, click) {
      var touch = this._touchData;
      if (!click && !this._dragLock && touch && this.tempSpine && this.tempSpine.parent) {
        var pos = this.tempSpine.parent.globalToLocal(event.stageX, event.stageY);
        var source = model.getPetDataByUid(touch.uid), recipient, material;
        if (source && this.isTouchEquipGroup(pos.x, pos.y)) {
          var index = this.getTouchEquipIndex(pos.x), entry = this._equipItems[index];
          if (entry && entry.data && entry.data.isUnlock) recipient = model.getPetDataByUid(model.getPetEquips()[index]);
          if (g.Config.PetConfig[source.id] && g.Config.PetConfig[source.id].tag === 2) material = source;
        } else if (source && source.slot < 0 && this.isTouchSlotGroup(pos.x, pos.y)) {
          var slot = this.getTouchSlotIndex(pos.x, pos.y), uid = model.getPetComposes()[slot];
          material = model.getPetDataByUid(uid); recipient = source;
        }
        if (material && recipient && material.uid !== recipient.uid && recipient.slot < 0 && material.slot >= 0
          && g.Config.PetConfig[material.id] && g.Config.PetConfig[material.id].tag === 2
          && g.Config.PetConfig[recipient.id] && g.Config.PetConfig[recipient.id].tag !== 2) {
          this._isDragging = false; this.tempSpine.visible = false;
          if (this._chooseSpine) this._chooseSpine.visible = true;
          for (var i = 0; i < this._composeItems.length; i++) this._composeItems[i].setMask(false);
          model.sendPetEat(material.uid, recipient.uid, material.slot, recipient.slot);
          return;
        }
      }
      return nativeEnd.apply(this, arguments);
    };
    api.installed = true;
  }
  install();
}(window));

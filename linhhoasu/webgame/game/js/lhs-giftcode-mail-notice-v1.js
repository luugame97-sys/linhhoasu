(function (root) {
  'use strict';
  var VERSION = '20261010_giftcode_mail_notice_v1';
  if (root.LhsGiftcodeMailNoticeV1 && root.LhsGiftcodeMailNoticeV1.version === VERSION) return;
  var api = root.LhsGiftcodeMailNoticeV1 = { version: VERSION, installed: false, attempts: 0 };

  function definition(name) {
    if (root[name]) return root[name];
    try { return root.egret && root.egret.getDefinitionByName(name); } catch (_) { return null; }
  }

  function notice(message) {
    try {
      var tips = definition('UserTips');
      if (tips && tips.ins && typeof tips.ins().showTips === 'function') tips.ins().showTips(message);
    } catch (_) {}
  }

  function outcome(reply) {
    if (!reply || typeof reply !== 'object') return null;
    var status = String(reply.deliveryStatus || '');
    if (reply.collision === true) {
      return { message: 'Giftcode cần được đối soát. Vui lòng liên hệ GM.', complete: false };
    }
    if (reply.bridge === 'webgm') {
      if (status === 'sent' && reply.result === 0 && Number(reply.deliveryId) > 0) {
        return { message: 'Quà giftcode đã vào Hòm thư. Hãy mở thư để nhận quà.', complete: true };
      }
      // Pending also has retryRequired=true. It must not become generic success.
      if (status === 'pending') {
        return { message: 'Quà giftcode đang chờ giao. Xem mục Quà chờ giao trên WebGM để gửi lại.', complete: false };
      }
      if (status === 'already_claimed') {
        return { message: 'Giftcode này đã được dùng trên máy chủ này. Kiểm tra Hòm thư nếu chưa nhận quà.', complete: true };
      }
      return { message: 'Chưa xác nhận được thư giftcode. Kiểm tra Hòm thư hoặc thử lại cùng mã.', complete: false };
    }
    if (reply.retryRequired === true || status === 'retry_required') {
      return { message: 'Chưa xác nhận được thư giftcode. Kiểm tra Hòm thư hoặc thử lại cùng mã.', complete: false };
    }
    return null;
  }

  function install() {
    var Type = definition('SettingModel'), proto = Type && Type.prototype;
    if (!proto || typeof proto.sendActivityGiftCode !== 'function' || typeof proto.Rpc !== 'function') {
      if (++api.attempts < 240) root.setTimeout(install, 250);
      return;
    }
    if (proto.__lhsGiftcodeMailNoticeV1) { api.installed = true; return; }
    var original = proto.sendActivityGiftCode;
    proto.sendActivityGiftCode = function (code, complete) {
      var model = this, rpc = model.Rpc;
      var descriptor = Object.getOwnPropertyDescriptor(model, 'Rpc');
      // Intercept only this method's callback registration, then immediately
      // restore Rpc. Keep the native callback/analytics for legacy direct grants.
      model.Rpc = function (tag, data, callback, onError) {
        if (Number(tag) !== 1750) return rpc.apply(this, arguments);
        var args = Array.prototype.slice.call(arguments), settled = false;
        args[2] = function (reply) {
          if (settled) return;
          settled = true;
          var result = outcome(reply);
          if (!result) return callback && callback.apply(this, arguments);
          notice(result.message);
          // Preserve the entered code for pending/network failures.
          if (result.complete && typeof complete === 'function') complete();
        };
        // BaseSystem.Rpc uses its fourth argument as the error callback.
        args[3] = function (error) {
          if (settled) return;
          settled = true;
          notice('Mất phản hồi giftcode. Kiểm tra Hòm thư hoặc thử lại cùng mã.');
          if (typeof onError === 'function') return onError.apply(this, arguments);
        };
        return rpc.apply(this, args);
      };
      try { return original.apply(model, arguments); }
      finally {
        if (descriptor) Object.defineProperty(model, 'Rpc', descriptor);
        else delete model.Rpc;
      }
    };
    proto.__lhsGiftcodeMailNoticeV1 = true;
    api.installed = true;
  }
  install();
})(window);

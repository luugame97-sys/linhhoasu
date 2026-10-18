/* Authoritative accepted counts; rejected RPCs must not play success animations. */
(function (root) {
  'use strict';
  if (root.LhsAlchemyFix) return;
  var api = root.LhsAlchemyFix = { installed: false, attempts: 0 };
  function install() {
    api.attempts++;
    var Type = root.AlchemyModel;
    if (!Type || !Type.prototype || !Type.prototype.sendGenerate || !Type.prototype.sendAutoGenerate) {
      if (api.attempts < 100) root.setTimeout(install, 100);
      return;
    }
    ['sendGenerate', 'sendAutoGenerate'].forEach(function (name) {
      var original = Type.prototype[name], callbackIndex = name === 'sendGenerate' ? 2 : 3;
      Type.prototype[name] = function () {
        var args = Array.prototype.slice.call(arguments), self = this, callback = args[callbackIndex];
        args[callbackIndex] = function (data) {
          if (data && typeof data.dayCount === 'number') self.setDayCount(data.dayCount);
          if (data && data.rejected) {
            var tips = root.UserTips;
            if (tips && tips.ins) tips.ins().showTips('Không thể luyện đan: kiểm tra đan phương, nguyên liệu và giới hạn.');
            return;
          }
          if (callback) return callback.apply(this, arguments);
        };
        return original.apply(this, args);
      };
    });
    api.installed = true;
  }
  install();
})(window);

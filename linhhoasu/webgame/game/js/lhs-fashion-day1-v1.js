(function (root) {
  'use strict';
  if (root.LhsFashionDay1V1) return;

  var api = root.LhsFashionDay1V1 = {
    version: '20260911_fashion_day1_v1',
    installed: false
  };

  function install() {
    var manager = root.GlobalManager || root.GameGlobalYDXZ || root.W;
    var proto = manager && manager.FashionModel && manager.FashionModel.prototype;
    if (!proto || typeof proto.checkShowTypeOpenDay !== 'function') return false;
    if (proto._lhsFashionDay1Wrapped) {
      api.installed = true;
      return true;
    }

    var original = proto.checkShowTypeOpenDay;
    proto.checkShowTypeOpenDay = function (showType) {
      // showType=3 is the server-open-day catalog gate. Keep all other
      // visibility and ownership rules in the original native method.
      if (Number(showType) === 3) return true;
      return original.apply(this, arguments);
    };
    proto._lhsFashionDay1Wrapped = true;
    api.installed = true;
    return true;
  }

  (function waitForFashionModel() {
    if (!install()) root.setTimeout(waitForFashionModel, 100);
  }());
}(window));

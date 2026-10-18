(function (root) {
  'use strict';
  if (root.LhsFashionChoiceV1) return;
  var api = root.LhsFashionChoiceV1 = { version: '20260912_fashion_choice_v6', installed: false };
  function apply() {
    var manager = root.GlobalManager || root.GameGlobalYDXZ || root.W;
    if (!manager) return false;
    // The two custom chest PNGs are served as direct URLs so the native RES
    // manifest stays unchanged and existing suit icons are not repurposed.
    var paths = {
      99001: './update/resource/assets/atlas_ui/0_common/icon/prop/lhs_choice_99001.png',
      99002: './update/resource/assets/atlas_ui/0_common/icon/prop/lhs_choice_99002.png'
    };
    var dataPath = root.ResDataPath;
    if (dataPath && !dataPath._lhsChoiceIcons) {
      var oldImage = dataPath.GetImgByID;
      var oldItemImage = dataPath.GetItemIconById;
      dataPath.GetImgByID = function (id) { return paths[id] || oldImage.call(this, id); };
      dataPath.GetItemIconById = function (id) { return paths[id] || oldItemImage.call(this, id); };
      dataPath._lhsChoiceIcons = true;
    }
    api.installed = true;
    if (root.console && root.console.info) root.console.info('[LHS] fashion-choice v6 native contract active');
    return true;
  }
  function install() {
    if (apply()) return;
    if (root.setTimeout) root.setTimeout(install, 100);
  }
  install();
}(window));

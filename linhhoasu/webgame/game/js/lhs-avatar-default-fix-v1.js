/* Add the native default-avatar option (id 0) to the avatar tab. */
(function (root) {
  'use strict';
  var VERSION = '20260922_avatar_default_fix_v1';
  if (root.LhsAvatarDefaultFixV1 && root.LhsAvatarDefaultFixV1.version === VERSION) return;
  var api = root.LhsAvatarDefaultFixV1 = { version: VERSION, installed: false, attempts: 0 };
  function manager() { return root.GlobalManager || root.GameGlobalYDXZ || root.W || root.Y || null; }
  function addDefault(panel) {
    if (!panel || Number(panel.tabType) !== 0 || !panel.listAvatar || !panel.listAvatar.dataProvider) return;
    var provider = panel.listAvatar.dataProvider, rows = [];
    if (typeof provider.getItemAt === 'function' && Number(provider.length) > 0) {
      for (var i = 0; i < provider.length; i++) rows.push(provider.getItemAt(i));
    } else if (Array.isArray(provider.source)) rows = provider.source.slice();
    var group = null;
    for (var j = 0; j < rows.length; j++) {
      if (rows[j] && Number(rows[j].tab) === -1 && Array.isArray(rows[j].list)) { group = rows[j]; break; }
    }
    if (!group || group.list.some(function (id) { return Number(id) === 0; })) return;
    group.list = [0].concat(group.list);
    if (typeof provider.replaceAll === 'function') provider.replaceAll(rows);
    api.added = true;
  }
  function install() {
    api.attempts += 1;
    var Panel = root.DisguiseAvatarPanel, proto = Panel && Panel.prototype;
    if (!proto || typeof proto.updateUI !== 'function') {
      if (api.attempts < 120 && root.setTimeout) root.setTimeout(install, 100);
      return false;
    }
    if (!proto.__lhsAvatarDefaultFix) {
      var original = proto.updateUI;
      proto.updateUI = function () {
        var result = original.apply(this, arguments);
        addDefault(this);
        return result;
      };
      proto.__lhsAvatarDefaultFix = true;
    }
    api.installed = true;
    if (root.console && root.console.info) root.console.info('[LHS Avatar] default option id=0 ready');
    return true;
  }
  install();
}(window));

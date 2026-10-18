/* Keep the avatar grid aligned with the native six-items-per-row layout. */
(function (root) {
  'use strict';

  var VERSION = '20261016_avatar_layout_fix_v1';
  if (root.LhsAvatarLayoutFixV1 && root.LhsAvatarLayoutFixV1.version === VERSION) return;
  var api = root.LhsAvatarLayoutFixV1 = {
    version: VERSION,
    installed: false,
    attempts: 0,
    repairs: 0
  };

  function readRows(provider) {
    var rows = [];
    if (!provider) return rows;
    if (typeof provider.getItemAt === 'function' && Number(provider.length) > 0) {
      for (var i = 0; i < provider.length; i++) rows.push(provider.getItemAt(i));
    } else if (Array.isArray(provider.source)) {
      rows = provider.source.slice();
    }
    return rows;
  }

  function normalize(panel) {
    if (!panel || Number(panel.tabType) !== 0 || !panel.listAvatar || !panel.listAvatar.dataProvider) return;
    var provider = panel.listAvatar.dataProvider;
    var rows = readRows(provider);
    if (!rows.length) return;

    var normalized = [], changed = false;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row || Number(row.tab) !== -1 || !Array.isArray(row.list)) {
        normalized.push(row);
        continue;
      }

      var ids = row.list.slice();
      if (!ids.length) {
        normalized.push(row);
        continue;
      }
      if (ids.length > 6) changed = true;
      for (var start = 0; start < ids.length; start += 6) {
        var chunk = ids.slice(start, start + 6);
        if (ids.length <= 6 && start === 0) {
          normalized.push(row);
        } else {
          normalized.push({ tab: -1, list: chunk, panel: panel });
        }
      }
    }

    if (changed && typeof provider.replaceAll === 'function') {
      provider.replaceAll(normalized);
      api.repairs += 1;
    }
  }

  function install() {
    api.attempts += 1;
    var Panel = root.DisguiseAvatarPanel, proto = Panel && Panel.prototype;
    if (!proto || typeof proto.updateUI !== 'function') {
      if (api.attempts < 120 && root.setTimeout) root.setTimeout(install, 100);
      return false;
    }
    if (!proto.__lhsAvatarLayoutFixV1) {
      var original = proto.updateUI;
      proto.updateUI = function () {
        var result = original.apply(this, arguments);
        normalize(this);
        return result;
      };
      proto.__lhsAvatarLayoutFixV1 = true;
    }
    api.installed = true;
    if (root.console && root.console.info) root.console.info('[LHS Avatar] six-column layout fix ready');
    return true;
  }

  install();
}(window));

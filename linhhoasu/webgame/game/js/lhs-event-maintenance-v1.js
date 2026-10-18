(function (root) {
  'use strict';
  if (root.LhsEventMaintenanceV1) return;
  var api = root.LhsEventMaintenanceV1 = { version: '20261008_event_quiet_v1', installed: false, rejected: 0 };
  api.install = function () {
    var Base = root.BaseSystem, proto = Base && Base.prototype;
    if (!proto || typeof proto.Rpc !== 'function') return false;
    if (proto.Rpc.__lhsEventMaintenanceV1) return true;
    var original = proto.Rpc;
    function rpc(tag, payload, callback, onError) {
      if ([1700, 1000, 1801].indexOf(Number(tag)) === -1) return original.apply(this, arguments);
      var args = Array.prototype.slice.call(arguments);
      args[2] = function (response) {
        if (!response || response.code !== 'EVENT_MAINTENANCE' || response.result === 0) {
          if (typeof callback === 'function') return callback.apply(this, arguments);
          return;
        }
        api.rejected++;
        // Only sanitized gameplay coordinates, bounded to one diagnostic per
        // refusal and 20 per page. Never log credentials or player identity.
        if (api.rejected <= 20 && root.console && typeof root.console.warn === 'function') {
          var ids = payload && Array.isArray(payload.ids) ? payload.ids.slice(0, 20) : [];
          root.console.warn('[EventMaintenance] ' + JSON.stringify({
            tag: Number(tag), id: Number(payload && payload.id) || 0,
            module: Number(payload && payload.module) || 0, type: Number(payload && payload.type) || 0,
            ids: ids.map(function (id) { return Number(id) || 0; })
          }));
        }
        var fulu = root.LhsFuluSafeV1;
        // Release any matching Fulu request without showing a maintenance toast.
        if (fulu && typeof fulu.onMaintenance === 'function') fulu.onMaintenance(response);
        var manager = root.GlobalManager || root.GameGlobalYDXZ;
        if (manager && manager.ViewManagerImpl && typeof manager.ViewManagerImpl.HideLoading === 'function') {
          manager.ViewManagerImpl.HideLoading();
        }
        // Do not run native success animation, nor transport error retries:
        // this is a definitive server refusal with no economy side effect.
      };
      return original.apply(this, args);
    }
    rpc.__lhsEventMaintenanceV1 = true;
    proto.Rpc = rpc;
    api.installed = true;
    return true;
  };
  api.install();
}(window));

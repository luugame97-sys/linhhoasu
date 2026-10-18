/* Homeland: single-flight RPCs and reject-safe native callbacks. */
(function (root) {
  'use strict';
  var VERSION = '20261003_homeland_guard_v1';
  if (root.LhsHomelandGuardV1 && root.LhsHomelandGuardV1.version === VERSION) return;
  var api = root.LhsHomelandGuardV1 = {
    version: VERSION, installed: false, attempts: 0, blocked: 0, rejected: 0,
    lastError: ''
  };
  var guarded = {
    6700: true, 6701: true, 6702: true, 6703: true, 6704: true,
    6705: true, 6706: true, 6707: true, 6708: true, 6709: true,
    6710: true, 6711: true, 6714: true, 6715: true, 6716: true,
    6717: true, 6718: true, 6719: true, 6722: true, 6723: true,
    6724: true, 6725: true, 6726: true, 6727: true, 6728: true,
    6729: true, 6740: true, 6741: true, 6742: true, 6750: true
  };
  var writes = {
    6700: true, 6701: true, 6703: true, 6704: true, 6705: true,
    6706: true, 6707: true, 6708: true, 6709: true, 6710: true,
    6711: true, 6714: true, 6715: true, 6716: true, 6717: true,
    6718: true, 6719: true, 6722: true, 6723: true, 6724: true,
    6725: true, 6726: true, 6727: true, 6728: true, 6729: true,
    6740: true, 6741: true, 6742: true, 6750: true
  };
  function manager() { return root.GlobalManager || root.GameGlobalYDXZ || root.W || root.Y || null; }
  function proto(value) { return value && value.constructor && value.constructor.prototype ? value.constructor.prototype : value; }
  function safeResult(data) { return data && Number(data.result) !== 0; }
  function installModel(model) {
    if (!model || typeof model.Rpc !== 'function') return false;
    var target = proto(model), original = target && target.Rpc;
    if (typeof original !== 'function' || original.__lhsHomelandGuardV1) return !!(target && target.__lhsHomelandGuardV1);
    var pending = Object.create(null);
    target.Rpc = function (tag, params, callback) {
      var n = Number(tag);
      if (!guarded[n]) return original.apply(this, arguments);
      if (writes[n] && pending[n]) {
        api.blocked += 1;
        return false;
      }
      var args = Array.prototype.slice.call(arguments);
      if (writes[n]) {
        var request = args[1] && typeof args[1] === 'object' ? Object.assign({}, args[1]) : {};
        if (!request.requestId) request.requestId = 'hl-' + Date.now().toString(36) + '-' + (++api.attempts).toString(36);
        args[1] = request;
      }
      if (writes[n]) {
        var token = {};
        pending[n] = token;
        root.setTimeout(function () { if (pending[n] === token) delete pending[n]; }, 15000);
      }
      var wrapped = typeof callback === 'function' ? function (data) {
        if (writes[n]) delete pending[n];
        if (safeResult(data)) {
          api.rejected += 1;
          api.lastError = String(data && (data.code || data.reason || 'HOMELAND_REQUEST_REJECTED'));
          // Native Homeland callbacks are success-only and would otherwise
          // open an empty reward window or mutate local state after rejection.
          return;
        }
        return callback.apply(this, arguments);
      } : callback;
      args[2] = wrapped;
      return original.apply(this, args);
    };
    target.Rpc.__lhsHomelandGuardV1 = true;
    target.__lhsHomelandGuardV1 = true;
    api.installed = true;
    return true;
  }
  function install() {
    api.attempts += 1;
    var m = manager(), model = m && m.HomelandModel;
    if (!model) {
      if (api.attempts < 600) root.setTimeout(install, 250);
      return false;
    }
    installModel(model);
    if (!api.installed && api.attempts < 600) root.setTimeout(install, 250);
    return api.installed;
  }
  api.install = install;
  install();
}(window));

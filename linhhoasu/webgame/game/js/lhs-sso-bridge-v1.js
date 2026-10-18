(function (root) {
  'use strict';
  var VERSION = '20260930_sso_bridge_v1';
  if (root.LhsSsoBridgeV1 && root.LhsSsoBridgeV1.version === VERSION) return;

  function readAuth() {
    var info = root.UserInfo || root.sht || {};
    var token = String(info.Token || info.userToken || '').trim();
    var serverId = Number(info.ServerID != null ? info.ServerID : info.serverId);
    if (!/^ats_[a-z0-9]+_[a-f0-9]{32}$/.test(token) || !Number.isSafeInteger(serverId) || serverId <= 0) return null;
    return { userToken: token, serverId: serverId };
  }

  function reloadWebFrame() {
    var frame = document.getElementById('lhs-web-modal-frame');
    if (!frame) return;
    var src = frame.getAttribute('data-src') || '/web-panel/?is_popup=1';
    frame.src = src + (src.indexOf('?') >= 0 ? '&' : '?') + 'sso_refresh=' + Date.now();
  }

  function exchange() {
    var auth = readAuth();
    if (!auth || root.LhsSsoBridgeV1.pending) return Promise.resolve(false);
    root.LhsSsoBridgeV1.pending = true;
    return fetch('/web-panel/api/sso_exchange.php', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(auth)
    }).then(function (response) {
      return response.ok ? response.json() : null;
    }).then(function (result) {
      if (result && result.status === 'success') {
        reloadWebFrame();
        return true;
      }
      return false;
    }).catch(function () { return false; }).then(function (ok) {
      root.LhsSsoBridgeV1.pending = false;
      return ok;
    });
  }

  root.LhsSsoBridgeV1 = { version: VERSION, pending: false, exchange: exchange, readAuth: readAuth };
  var trigger = document.getElementById('lhs-web-popup');
  if (trigger) trigger.addEventListener('click', function () { void exchange(); });
}(window));

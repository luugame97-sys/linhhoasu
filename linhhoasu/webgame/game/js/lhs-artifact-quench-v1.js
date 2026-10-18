(function (root) {
  'use strict';
  if (root.LhsArtifactQuenchV1) return;
  var api = root.LhsArtifactQuenchV1 = { installed: false, version: '20261010_quench_v1', attempts: 0 };
  var active = null, volatile = {};
  function manager() { return root.W || root.GlobalManager || root.GameGlobalYDXZ; }
  function notice(message) { if (root.UserTips && root.UserTips.ins) root.UserTips.ins().showTips(message); }
  function owner(socket) {
    var m = manager();
    return String(m && m.ActorModel && m.ActorModel.actorID || '') + '|' + String(socket._host || '');
  }
  function key(socket) { return 'lhs-quench-v1:' + owner(socket); }
  function read(k) { try { return JSON.parse(root.localStorage.getItem(k) || 'null') || volatile[k]; } catch (_) { return volatile[k]; } }
  function store(k, value) {
    if (value) volatile[k] = value; else delete volatile[k];
    try { if (value) root.localStorage.setItem(k, JSON.stringify(value)); else root.localStorage.removeItem(k); } catch (_) {}
  }
  function install() {
    var Socket = root.GameSocket;
    if (!Socket || !Socket.prototype || !Socket.prototype.Rpc) {
      if (++api.attempts < 120) root.setTimeout(install, 100);
      return;
    }
    var original = Socket.prototype.Rpc;
    Socket.prototype.Rpc = function (tag, data, callback, context, onError) {
      if ([3505, 3506, 3507].indexOf(Number(tag)) < 0) return original.apply(this, arguments);
      var socket = this, who = owner(socket), storageKey = key(socket);
      if (active && active.owner === who) { notice('Đang xác nhận thao tác Tôi luyện.'); return; }
      var saved = read(storageKey);
      if (saved && (saved.tag !== Number(tag) || Number(saved.params.uid) !== Number(data && data.uid))) {
        notice('Hãy xác nhận lại thao tác Tôi luyện trước đó trước khi đổi thao tác.'); return;
      }
      var job = active = { owner: who, settled: false, params: saved ? saved.params : Object.assign({}, data), tag: Number(tag) };
      function end() { if (job.settled) return false; job.settled = true; root.clearTimeout(job.timer); if (active === job) active = null; return owner(socket) === who; }
      function reconcile(reply) {
        var m = manager();
        if (!m || !reply) return;
        if (Array.isArray(reply.itemCounts) && m.ItemModel && m.ItemModel.onItemChange) {
          m.ItemModel.onItemChange({ result: 0, items: [], changed: reply.itemCounts });
        }
        if (reply.artifact && m.ArtifactModel) {
          var row = m.ArtifactModel.getArtifactDataByUId(job.params.uid);
          if (row) Object.assign(row, reply.artifact);
          if (m.ArtifactModel.updateArtifactDate) m.ArtifactModel.updateArtifactDate(reply.artifact);
        }
      }
      function failed(reply) {
        if (!end()) return;
        var code = reply && (reply.code || reply.reason) || '';
        // A structured server rejection is final. A lost response remains an
        // unresolved intent and the next click reuses the same durable receipt.
        if (reply && reply.result != null && code !== 'ARTIFACT_SAVE_UNCONFIRMED' && code !== 'REQUEST_ALREADY_PENDING') store(storageKey, null);
        reconcile(reply);
        var messages = {
          ARTIFACT_QUENCH_LOCKED: 'Thần binh cần đủ phẩm chất, cấp và đã rèn để Tôi luyện.',
          ARTIFACT_NOT_QUENCHED: 'Thần binh chưa đủ điều kiện làm mới nguyên tố.',
          ARTIFACT_MATERIALS_NOT_ENOUGH: 'Không đủ nguyên liệu hoặc đá chọn nguyên tố.',
          ARTIFACT_REFRESH_EXPIRED: 'Kết quả làm mới đã hết hạn hoặc không còn hợp lệ.',
          ARTIFACT_CLIENT_RELOAD_REQUIRED: 'Hãy tải lại game để cập nhật tính năng Tôi luyện.',
          ARTIFACT_SAVE_CONFLICT: 'Dữ liệu vừa thay đổi. Hãy kiểm tra nguyên liệu và thử lại.',
          ARTIFACT_RECEIPT_INVALID: 'Phiên thao tác đã hết hạn. Hãy kiểm tra trạng thái rồi thử lại.'
        };
        notice(messages[code] || 'Chưa xác nhận được Tôi luyện. Bấm lại cùng thao tác để kiểm tra kết quả.');
        if (onError) onError.call(context, reply);
      }
      function received(reply) {
        if (!reply || reply.result !== 0) return failed(reply);
        if (reply.requestId !== job.params.requestId) return failed({ code: 'ARTIFACT_RESPONSE_MISMATCH' });
        if (!end()) return;
        store(storageKey, null);
        reconcile(reply);
        if (callback) callback.call(context, reply);
      }
      function send() {
        if (owner(socket) !== who) return failed({ code: 'ARTIFACT_SESSION_CHANGED' });
        store(storageKey, { tag: job.tag, params: job.params });
        try { return original.call(socket, job.tag, Object.assign({}, job.params), received, context, failed); }
        catch (error) { failed(error); }
      }
      job.timer = root.setTimeout(function () { failed({ code: 'ARTIFACT_TIMEOUT' }); }, 15000);
      if (job.params.requestId) return send();
      // Always request the server's current epoch sequence. Other feature
      // adapters may also allocate receipt IDs on this socket.
      return original.call(socket, 2499, {}, function (epoch) {
        if (job.settled) return;
        if (!epoch || epoch.result !== 0 || !/^[a-f0-9]{32}$/.test(epoch.epoch)) return failed(epoch);
        var shared = socket._lhsFeatureEpoch;
        var sequence = Math.max(Number(epoch.sequence) || 0, shared && shared.id === epoch.epoch ? Number(shared.seq) || 0 : 0) + 1;
        if (shared && shared.id === epoch.epoch) shared.seq = sequence;
        job.params.requestId = 'v3_' + epoch.epoch + '_' + sequence;
        send();
      }, socket, failed);
    };
    api.installed = true;
  }
  install();
})(window);

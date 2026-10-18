from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / '_ai_workbench/temp/artifact_forge_20261013/baseline'
OUT = ROOT / '_ai_workbench/temp/artifact_forge_20261013/candidate'

CLIENT = r'''(function (root) {
  'use strict';
  if (root.LhsArtifactForgeV1) return;
  var api = root.LhsArtifactForgeV1 = { installed: false, attempts: 0, version: '20261013_forge_v2' };
  var active = null, volatileStore = {};
  function manager() { return root.W || root.GlobalManager || root.GameGlobalYDXZ; }
  function notice(message) { if (root.UserTips && root.UserTips.ins) root.UserTips.ins().showTips(message); }
  function owner(socket) { var m = manager(); return String(m && m.ActorModel && m.ActorModel.actorID || '') + '|' + String(socket._host || ''); }
  function storageKey(socket) { return 'lhs-forge-v1:' + owner(socket); }
  function read(key) { try { return JSON.parse(root.localStorage.getItem(key) || 'null') || volatileStore[key]; } catch (_) { return volatileStore[key]; } }
  function store(key, value) { if (value) volatileStore[key] = value; else delete volatileStore[key]; try { if (value) root.localStorage.setItem(key, JSON.stringify(value)); else root.localStorage.removeItem(key); } catch (_) {} }
  function forgeEligible(row) {
    var m = manager(), cfg = m && m.Config || root.Config || {};
    var base = cfg.ArtifactBaseConfig || {}, artifactCfg = cfg.ArtifactConfig && cfg.ArtifactConfig[row && row.id];
    var minQuality = base.forgeQuality == null ? 6 : Math.max(1, Number(base.forgeQuality) || 6);
    if (!row || !artifactCfg || Number(artifactCfg.quality) < minQuality) return false;
    if (Number(row.attr && row.attr.level || 0) < Number(base.forgeLevel || 20)) return false;
    if (Number(row.count || 0) >= Number(base.forgeCountMax || 7)) return false;
    if (Number(row.forgeTime || 0) > 0 && Number(row.forgeTime) <= Number((root.T && root.T.serverTimeMilli) || Date.now())) return false;
    return !!(m && m.ArtifactModel && m.ArtifactModel.getArtifactFitSkillGroupIdByData && m.ArtifactModel.getArtifactFitSkillGroupIdByData(row));
  }
  function installModel() {
    var m = manager(), model = m && m.ArtifactModel;
    if (!model || model.__lhsForgeV1) return !!model;
    if (typeof model.getAllCanForgeArtifact === 'function') {
      var originalList = model.getAllCanForgeArtifact;
      model.getAllCanForgeArtifact = function () {
        var list = originalList.apply(this, arguments) || [];
        return list.filter(forgeEligible);
      };
    }
    if (typeof model.checkArtifactCanForge === 'function') {
      model.checkArtifactCanForge = function (uid) { var row = this.getArtifactDataByUId(uid); return forgeEligible(row); };
    }
    model.__lhsForgeV1 = true;
    return true;
  }
  function installSocket() {
    var Socket = root.GameSocket;
    if (!Socket || !Socket.prototype || !Socket.prototype.Rpc || Socket.prototype.__lhsForgeV1) return !!Socket;
    var original = Socket.prototype.Rpc;
    Socket.prototype.Rpc = function (tag, data, callback, context, onError) {
      if (Number(tag) !== 3501) return original.apply(this, arguments);
      var socket = this, who = owner(socket), key = storageKey(socket), params = Object.assign({}, data || {});
      if (active && active.owner === who) { notice('Đang xác nhận thao tác Rèn.'); return; }
      var saved = read(key);
      if (saved && Number(saved.params && saved.params.uid) !== Number(params.uid)) { notice('Hãy xác nhận thao tác Rèn trước đó.'); return; }
      var job = active = { owner: who, settled: false, params: saved ? saved.params : params };
      function end() { if (job.settled) return false; job.settled = true; root.clearTimeout(job.timer); if (active === job) active = null; return owner(socket) === who; }
      function fail(reply) {
        var stillOwner = end(); if (!stillOwner) return;
        var code = reply && (reply.code || reply.reason) || '';
        if (reply && reply.result != null && code !== 'ARTIFACT_SAVE_UNCONFIRMED') store(key, null);
        var messages = { ARTIFACT_FORGE_INELIGIBLE: 'Thần binh chưa đủ phẩm chất, cấp, kỹ năng hoặc thời gian Rèn.', ARTIFACT_MATERIALS_NOT_ENOUGH: 'Không đủ nguyên liệu Rèn.', ARTIFACT_CLIENT_RELOAD_REQUIRED: 'Hãy tải lại game để cập nhật tính năng Rèn.' };
        notice(messages[code] || 'Chưa xác nhận được thao tác Rèn.');
        if (onError) onError.call(context, reply);
      }
      function receive(reply) {
        if (!reply || reply.result !== 0 || reply.requestId !== job.params.requestId) return fail(reply || { code: 'ARTIFACT_RESPONSE_MISMATCH' });
        if (!end()) return;
        store(key, null);
        if (callback) callback.call(context, reply);
      }
      function send() { store(key, { params: job.params }); try { return original.call(socket, 3501, job.params, receive, context, fail); } catch (e) { return fail(e); } }
      job.timer = root.setTimeout(function () { fail({ code: 'ARTIFACT_TIMEOUT' }); }, 15000);
      if (job.params.requestId) return send();
      return original.call(socket, 2499, {}, function (epoch) {
        if (job.settled) return;
        if (!epoch || epoch.result !== 0 || !/^[a-f0-9]{32}$/.test(epoch.epoch)) return fail(epoch);
        var shared = socket._lhsFeatureEpoch, sequence = Math.max(Number(epoch.sequence) || 0, shared && shared.id === epoch.epoch ? Number(shared.seq) || 0 : 0) + 1;
        socket._lhsFeatureEpoch = { id: epoch.epoch, seq: sequence };
        job.params.requestId = 'v3_' + epoch.epoch + '_' + sequence;
        send();
      }, socket, fail);
    };
    Socket.prototype.__lhsForgeV1 = true;
    return true;
  }
  function install() { var ready = installModel() && installSocket(); if (ready) api.installed = true; return ready; }
  var attempts = 0, timer = root.setInterval(function () { attempts += 1; if (install() || attempts >= 240) root.clearInterval(timer); }, 250);
  install();
})(window);
'''

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    client = OUT / 'lhs-artifact-forge-v1.js'
    client.write_text(CLIENT, encoding='utf-8', newline='')
    index = (BASE / 'index.html').read_text(encoding='utf-8')
    anchor = '"js/lhs-artifact-quench-v1.js?v=20261010_quench_v1",'
    if index.count(anchor) != 1:
        raise RuntimeError('index anchor missing')
    index = index.replace(anchor, anchor + '\n\t\t"js/lhs-artifact-forge-v1.js?v=20261013_forge_v2",', 1)
    (OUT / 'index.html').write_text(index, encoding='utf-8', newline='')
    (OUT / 'client-manifest.json').write_text(json.dumps({
        'clientSha256': hashlib.sha256(client.read_bytes()).hexdigest(),
        'indexSha256': hashlib.sha256((OUT / 'index.html').read_bytes()).hexdigest(),
        'sourceIndexSha256': hashlib.sha256((BASE / 'index.html').read_bytes()).hexdigest(),
        'result': 'CANDIDATE_ONLY', 'productionWrites': 0,
    }, indent=2) + '\n', encoding='utf-8')
    print(client)

if __name__ == '__main__': main()

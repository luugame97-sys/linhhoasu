/* Compact Vietnamese labels for Yêu Vương drop-tier prerequisites. */
(function (root) {
  'use strict';
  var VERSION = '20261005_demon_boss_task_text_v2';
  var MAX_ATTEMPTS = 600;
  var RETRY_MS = 100;
  if (root.LhsDemonBossTaskTextV1 && root.LhsDemonBossTaskTextV1.version === VERSION) return;
  var api = root.LhsDemonBossTaskTextV1 = {
    version: VERSION,
    installed: false,
    complete: false,
    attempts: 0,
    count: 0,
    mappedIds: Object.create(null),
  };
  function manager() { return root.GlobalManager || root.GameGlobalYDXZ || root.W || root.Y || null; }
  function retry() {
    if (api.attempts < MAX_ATTEMPTS && root.setTimeout) root.setTimeout(install, RETRY_MS);
  }
  function install() {
    api.attempts += 1;
    var m = manager(), c = m && (m.Config || m.config), tasks = c && c.TaskConfig, language = c && c.LanguageConfig;
    if (!tasks || !language) {
      retry();
      return false;
    }
    var seen = [];
    Object.keys(tasks).forEach(function (key) {
      var row = tasks[key], id = Number(row && row.id != null ? row.id : key);
      if (!row || Number(row.type) !== 7 || Number(row.activeId) !== 39 || !Number.isFinite(id)) return;
      var target = Math.max(0, Math.floor(Number(row.taskValue1) || 0));
      if (target <= 0) return;
      var textId = 90000000 + id;
      var shortVi = 'Yêu Vương: mốc ' + target;
      var oldLanguage = language[textId] || language[String(textId)] || {};
      language[textId] = {
        // The deployed client currently resolves AppInfo.lang as `cn`.
        // Keep all commonly selected keys Vietnamese so a missing vi/vn
        // selector cannot expose the original Chinese fallback.
        cn: shortVi, vi: shortVi, vn: shortVi, tw: shortVi,
        en: oldLanguage.en || shortVi,
        jp: oldLanguage.jp || shortVi,
        kr: oldLanguage.kr || shortVi,
      };
      row.textId = textId;
      tasks[key] = row;
      var idKey = String(id);
      seen.push(idKey);
      if (!api.mappedIds[idKey]) {
        api.mappedIds[idKey] = true;
        api.count += 1;
      }
    });
    api.installed = seen.length > 0;
    // TaskConfig is populated incrementally. Keep rescanning after a partial
    // pass so late rows (including the final stage prerequisite) are patched.
    if (api.attempts < MAX_ATTEMPTS) {
      retry();
    } else {
      api.complete = true;
      if (root.console && root.console.info) {
        root.console.info('[LHS DemonBossTaskText] compact labels ready count=' + api.count);
      }
    }
    return api.installed;
  }
  install();
}(window));

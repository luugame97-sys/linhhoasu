/* Server-gated Linh điền level 41..100 config extension. */
(function (root) {
  'use strict';
  var VERSION = 'plant_level100_candidate_v1';
  if (root.LhsPlantLevel100V1 && root.LhsPlantLevel100V1.version === VERSION) return;
  var api = root.LhsPlantLevel100V1 = { version: VERSION, installed: false, applied: false, attempts: 0 };

  function manager() { return root.GlobalManager || root.GameGlobalYDXZ || root.W || null; }
  function extend(config) {
    var rows = config && config.PlantLevelConfig;
    if (!rows || typeof rows !== 'object') throw Error('PLANT_LEVEL_CONFIG_MISSING');
    var max = 0;
    Object.keys(rows).forEach(function (key) { max = Math.max(max, Number(key) || 0); });
    if (max >= 100) return;
    if (max !== 40 || !rows[39] || Number(rows[39].exp) !== 1250) throw Error('PLANT_LEVEL_BASE_DRIFT');
    var step = 150;
    for (var level = 40; level < 100; level++) {
      rows[level] = { level: level, exp: Number(rows[level - 1].exp) + step, pPlantFoodAdCount: 3 };
    }
    rows[100] = { level: 100, exp: 0, pPlantFoodAdCount: 3 };
    api.applied = true;
  }
  function activate(payload) {
    var meta = payload && payload.farmLevel100;
    if (!meta) return;
    if (meta.version !== VERSION || Number(meta.maxLevel) !== 100) throw Error('PLANT_LEVEL_VERSION_MISMATCH');
    extend(manager() && manager().Config);
    if (root.console && root.console.info) root.console.info('[LHS Plant] ' + VERSION + ' active maxLevel=100');
  }
  function install() {
    api.attempts++;
    var Player = root.PlayerInfoModel;
    if (!Player || !Player.prototype || typeof Player.prototype.onPlayerInfo !== 'function') {
      if (api.attempts < 600 && root.setTimeout) root.setTimeout(install, 100);
      return;
    }
    if (Player.prototype.__lhsPlantLevel100) return;
    var original = Player.prototype.onPlayerInfo;
    Player.prototype.onPlayerInfo = function (payload) {
      activate(payload);
      return original.apply(this, arguments);
    };
    Player.prototype.__lhsPlantLevel100 = true;
    api.installed = true;
  }
  install();
}(window));

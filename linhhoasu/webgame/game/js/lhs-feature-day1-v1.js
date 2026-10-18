/* Feature eligibility only. Server age, event clocks and ownership stay native. */
(function (root) {
  'use strict';
  var policy = {"version":"20261009_level_unlock_v2","excludedSystems":[315,322],"levelUnlockSystems":[209,216],"levelUnlockLevel":100,"dayGateIgnoredSystems":[219,220,222],"systemOpenDayOverrides":[231],"sentinelDay":9999,"rowPolicies":[{"table":"ElfFieldConfig","field":"openDay"},{"table":"ValhallaFieldConfig","field":"openDay"},{"table":"ValhallaConfig","field":"openDay","selector":"showType","value":3},{"table":"ValhallaConfig","field":"openDayTw","selector":"showTypeTw","value":3},{"table":"FashionConfig","field":"openDay","selector":"showType","value":3},{"table":"FashionConfig","field":"openDayTw","selector":"showTypeTw","value":3},{"table":"FashionColorConfig","field":"openDay","selector":"showType","value":3},{"table":"FashionColorConfig","field":"openDayTw","selector":"showTypeTw","value":3},{"table":"FashionChangeColorConfig","field":"openDay","selector":"showType","value":3},{"table":"FashionChangeColorConfig","field":"openDayTw","selector":"showTypeTw","value":3},{"table":"FashionBathConfig","field":"openDay","selector":"showType","value":3},{"table":"FashionBathConfig","field":"openDayTw","selector":"showTypeTw","value":3},{"table":"FashionEndDressConfig","field":"openDay","selector":"showType","value":3},{"table":"FashionEndDressConfig","field":"openDayTw","selector":"showTypeTw","value":3},{"table":"FashionDressConfig","field":"openDay","selector":"showType","value":3},{"table":"FashionDressConfig","field":"openDayTw","selector":"showTypeTw","value":3},{"table":"FashionDressLevelConfig","field":"openDay","selector":"showType","value":3},{"table":"FashionDressLevelConfig","field":"openDayTw","selector":"showTypeTw","value":3},{"table":"FashionBgConfig","field":"openDay","selector":"showType","value":3},{"table":"FashionBgConfig","field":"openDayTw","selector":"showTypeTw","value":3},{"table":"FashionBubbleConfig","field":"openDay","selector":"showType","value":3},{"table":"FashionBubbleConfig","field":"openDayTw","selector":"showTypeTw","value":3},{"table":"FishSceneConfig","field":"openDay","selector":"isActivity","value":1},{"table":"GuildBattleConfig","field":"serverDay","rootOnly":true}]};
  if (root.LhsFeatureDay1V1 && root.LhsFeatureDay1V1.version === policy.version) return;
  var api = root.LhsFeatureDay1V1 = { version: policy.version, policy: policy, installed: false, attempts: 0 };
  function ordinary(value) { return Number.isFinite(value) && value > 1 && value < policy.sentinelDay; }
  function apply(tables) {
    if (!tables || !tables.SystemConfig) return false;
    Object.keys(tables.SystemConfig).forEach(function (key) {
      var row = tables.SystemConfig[key], id = Number(row && row.id || key);
      if (!row) return;
      if (policy.levelUnlockSystems.indexOf(id) >= 0) {
        row.conditions = [{ type: 3, value: policy.levelUnlockLevel, cond: 4 }];
        return;
      }
      if (policy.excludedSystems.indexOf(id) >= 0) return;
      var conditions = Array.isArray(row.conditions) ? row.conditions : [];
      if (policy.dayGateIgnoredSystems.indexOf(id) >= 0) {
        row.conditions = conditions.filter(function (condition) {
          return !(condition.type === 5 && condition.cond === 4);
        });
        return;
      }
      if (conditions.some(function (c) { return c.type === 5 && Number(c.value) >= policy.sentinelDay; })) return;
      if (policy.systemOpenDayOverrides.indexOf(id) >= 0 && ordinary(Number(row.openDay))) row.openDay = 1;
      conditions.forEach(function (condition) {
        if (condition.type === 5 && condition.cond === 4 && ordinary(Number(condition.value))) condition.value = 1;
      });
      if (conditions.some(function (c) { return c.type === 5 && c.cond === 4 && Number(c.value) === 1; })
        && ordinary(Number(row.openDay))) row.openDay = 1;
    });
    function walk(node, rule) {
      if (!node || typeof node !== 'object') return;
      if ((!rule.selector || node[rule.selector] === rule.value) && ordinary(Number(node[rule.field]))) node[rule.field] = 1;
      if (!rule.rootOnly) Object.keys(node).forEach(function (key) { if (node[key] && typeof node[key] === 'object') walk(node[key], rule); });
    }
    policy.rowPolicies.forEach(function (rule) { walk(tables[rule.table], rule); });
    return true;
  }
  function install() {
    var manager = root.GlobalManager || root.GameGlobalYDXZ || root.W;
    api.attempts++;
    if (!manager || !manager.Config || !manager.Config.ElfFieldConfig || !manager.Config.ValhallaConfig
      || !manager.Config.FashionConfig || !apply(manager.Config)) {
      if (api.attempts < 1200) root.setTimeout(install, 100);
      return;
    }
    api.installed = true;
  }
  api.apply = apply;
  install();
}(window));

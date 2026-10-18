/* Extend the existing Yêu Vương encounter catalog without changing its RPCs. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LhsDemonBossDrop200DataV1 = factory();
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var VERSION = 'demon_boss_drop200_original_v1', MAX_STAGE = 172;
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function extend(tables) {
    if (tables.DemonBossDrop200ExtensionConfig) {
      if (tables.DemonBossDrop200ExtensionConfig.version !== VERSION) throw Error('DEMON_BOSS_EXTENSION_VERSION');
      return tables.DemonBossDrop200ExtensionConfig;
    }
    var bosses = tables.DemonBossConfig, monsters = tables.MonsterConfig;
    var lang = tables.LanguageConfig || {}, pendingBosses = {}, pendingMonsters = {}, names = {};
    if (!bosses || !bosses[48] || !monsters || !monsters[200045] || !monsters[200048]
      || !tables.RoleStageConfig || !tables.RoleStageConfig[48]) throw Error('DEMON_BOSS_EXTENSION_BASE_MISSING');
    var base = monsters[200045], last = monsters[200048];
    if (bosses[48].monsterId !== 200048 || bosses[48].roleStageId !== 48) throw Error('DEMON_BOSS_EXTENSION_BASE_DRIFT');
    Object.keys(base.monsterAttrs).forEach(function (key) {
      if (!Number.isSafeInteger(base.monsterAttrs[key]) || base.monsterAttrs[key] < 0
        || last.monsterAttrs[key] !== Math.floor(base.monsterAttrs[key] * 124 / 100)) {
        throw Error('DEMON_BOSS_EXTENSION_WEIGHT_DRIFT:' + key);
      }
    });
    for (var stage = 49; stage <= MAX_STAGE; stage++) {
      var monsterId = 920000 + stage, nameId = 39806000 + stage;
      if (bosses[stage] || monsters[monsterId] || lang[nameId]) throw Error('DEMON_BOSS_EXTENSION_COLLISION:' + stage);
      var displayName = 'Yêu Vương: mốc ' + stage;
      var boss = clone(bosses[48]);
      boss.stageId = stage; boss.roleStageId = 48; boss.monsterId = monsterId;
      boss.name = nameId; boss.displayName = displayName;
      var monster = clone(last); monster.id = monsterId;
      var multiplier = 100 + (stage - 45) * 8;
      Object.keys(base.monsterAttrs).forEach(function (key) {
        var value = Math.floor(base.monsterAttrs[key] * multiplier / 100);
        if (!Number.isSafeInteger(value) || value < 0) throw Error('DEMON_BOSS_EXTENSION_ATTR_OVERFLOW');
        monster.monsterAttrs[key] = value;
      });
      pendingBosses[stage] = boss; pendingMonsters[monsterId] = monster;
      names[nameId] = { cn: displayName, vi: displayName, vn: displayName, tw: displayName,
        en: displayName, jp: displayName, kr: displayName };
    }
    Object.assign(bosses, pendingBosses); Object.assign(monsters, pendingMonsters);
    Object.assign(lang, names); tables.LanguageConfig = lang;
    tables.DemonBossDrop200ExtensionConfig = { version: VERSION, baseStage: 48,
      maxStage: MAX_STAGE, requiredRoleStage: 48, languageRows: names };
    return tables.DemonBossDrop200ExtensionConfig;
  }
  function apply(tables) {
    var env = typeof process !== 'undefined' && process.env;
    return env && env.DROP_LEVEL_100_ENABLED === '1' && env.DROP_LEVEL_100_DISABLED !== '1'
      ? extend(tables) : { enabled: false };
  }
  return { VERSION: VERSION, MAX_STAGE: MAX_STAGE, extend: extend, apply: apply };
}));

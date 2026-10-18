/* Shared deterministic mainline extension. Server and browser use the same
 * formulas so stages beyond the authored catalog do not depend on a giant
 * mutable config blob. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LhsInfiniteMainlineV1 = factory();
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var VERSION = 'mainline_infinite_v1';
  var BASE_LEVEL = 1310;
  var BASE_CHAPTER = 23;
  var CHAPTER_SIZE = 100;
  var MONSTER_BASE = 100000000;
  var TASK_BASE = 990000;
  var MAX_SAFE = Number.MAX_SAFE_INTEGER || 9007199254740991;

  function int(value, fallback) {
    var n = Number(value);
    return Number.isFinite(n) ? Math.floor(n) : (fallback || 0);
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function isInfiniteLevel(level) {
    return int(level, 0) > BASE_LEVEL;
  }

  function chapterForLevel(level, chapters) {
    var target = Math.max(1, int(level, 1));
    var keys = chapters && typeof chapters === 'object' ? Object.keys(chapters) : [];
    for (var i = 0; i < keys.length; i += 1) {
      var row = chapters[keys[i]];
      if (row && Array.isArray(row.levelList) && row.levelList.indexOf(target) >= 0) {
        return Math.max(1, int(keys[i], 1));
      }
    }
    if (target <= BASE_LEVEL) return 1;
    return BASE_CHAPTER + Math.floor((target - BASE_LEVEL - 1) / CHAPTER_SIZE) + 1;
  }

  function monsterIdForLevel(level) {
    var target = Math.max(BASE_LEVEL + 1, int(level, BASE_LEVEL + 1));
    return MONSTER_BASE + target;
  }

  function progressForLevel(level) {
    return Math.max(1, int(level, BASE_LEVEL + 1) - BASE_LEVEL);
  }

  function scaleForLevel(level) {
    var progress = progressForLevel(level);
    var tier = Math.floor((progress - 1) / CHAPTER_SIZE);
    var within = (progress - 1) % CHAPTER_SIZE;
    // Slow, bounded growth keeps long-term fights finite while still making
    // every 100-stage block harder. The cap is a balance guard, not a level
    // cap; the generator remains valid beyond it.
    return 1 + Math.min(40, tier * 0.12 + within * 0.0012);
  }

  function monsterAttrsForLevel(level) {
    var scale = scaleForLevel(level);
    var base = {
      1: 12629534220,
      2: 350820395,
      3: 70164079,
      4: 192728,
      101: 127000,
      103: 254000,
      105: 254000,
      151: 169192,
      154: 129409,
      155: 238842,
      241: 53275,
      242: 53275,
    };
    var output = {};
    Object.keys(base).forEach(function (key) {
      output[key] = Math.max(1, Math.floor(base[key] * scale));
    });
    return output;
  }

  function rewardForLevel(level) {
    var progress = progressForLevel(level);
    var tier = Math.floor((progress - 1) / CHAPTER_SIZE);
    return [
      { id: 4, count: 40 + Math.min(160, tier * 2) },
      { id: 6, count: 10 + Math.min(90, Math.floor(tier / 2)) },
    ];
  }

  function levelRow(level) {
    var target = int(level, 0);
    if (target <= BASE_LEVEL || target > MAX_SAFE - MONSTER_BASE) return null;
    var monsterId = monsterIdForLevel(target);
    return {
      id: target,
      name: '∞-' + target,
      monsterId: monsterId,
      monsterShow: 9009,
      monsterName: 209009,
      fightSkill: [9009],
      monsterAttrs: monsterAttrsForLevel(target),
      reward: rewardForLevel(target),
      hangReward: [],
      infinite: true,
      version: VERSION,
    };
  }

  function chapterRow(chapterId) {
    var chapter = int(chapterId, 0);
    if (chapter <= BASE_CHAPTER) return null;
    var start = BASE_LEVEL + 1 + (chapter - BASE_CHAPTER - 1) * CHAPTER_SIZE;
    var levelList = [];
    for (var i = 0; i < CHAPTER_SIZE; i += 1) levelList.push(start + i);
    return {
      id: chapter,
      scene: '',
      levelList: levelList,
      reward: [{ id: 4, count: 500 }, { id: 6, count: 100 }],
      infinite: true,
      version: VERSION,
    };
  }

  function languageRow(text) {
    return { cn: text.cn, vi: text.vi, vn: text.vi, en: text.en, tw: text.cn, jp: text.en, kr: text.en };
  }

  function taskRow(chapter, template) {
    var id = TASK_BASE + chapter;
    var target = BASE_LEVEL + (chapter - BASE_CHAPTER) * CHAPTER_SIZE;
    var textId = 39804000 + chapter;
    var row = clone(template || {
      id: id, type: 1, textId: textId, nextId: id + 1, updateCycle: 0,
      activeId: 7, isGlobal: 1, taskValue1: target, taskValue2: 0,
      ifAd: '', reward: [{ id: 4, count: 20 }, { id: 6, count: 5 }],
      systemId: 0, guide: 1, guideValue: 102, guideValueATest: 10102,
    });
    row.id = id; row.textId = textId; row.nextId = id + 1; row.type = 1;
    row.activeId = 7; row.isGlobal = 1; row.taskValue1 = target; row.taskValue2 = 0;
    row.reward = [{ id: 4, count: 20 }, { id: 6, count: 5 }];
    return { row: row, language: languageRow({
      cn: '无限主线：通关第' + target + '关',
      vi: 'Nhiệm vụ vô hạn: vượt ải ' + target,
      en: 'Infinite mainline: clear stage ' + target,
    }) };
  }

  function resolveLevel(level, nativeLevels) {
    var target = int(level, 0);
    if (nativeLevels && nativeLevels[target]) return nativeLevels[target];
    return levelRow(target);
  }

  function resolveChapter(chapter, nativeChapters) {
    var id = int(chapter, 0);
    if (nativeChapters && nativeChapters[id]) return nativeChapters[id];
    return chapterRow(id);
  }

  function ensure(tables, targetLevel) {
    if (!tables || !tables.LevelConfig || !tables.ChapterConfig || !tables.MonsterConfig
        || !tables.TaskConfig || !tables.LanguageConfig) return false;
    var target = Math.max(BASE_LEVEL, int(targetLevel, BASE_LEVEL));
    var currentMax = BASE_LEVEL;
    Object.keys(tables.LevelConfig).forEach(function (key) { currentMax = Math.max(currentMax, int(key, BASE_LEVEL)); });
    // Never allocate an unbounded object from a client supplied value.
    target = Math.min(target, currentMax + 20000);
    for (var level = currentMax + 1; level <= target; level += 1) {
      var row = levelRow(level);
      if (!row) break;
      tables.LevelConfig[level] = clone(row);
      tables.MonsterConfig[row.monsterId] = {
        id: row.monsterId,
        monsterShow: row.monsterShow,
        monsterName: row.monsterName,
        monsterAttrs: clone(row.monsterAttrs),
        fightSkill: row.fightSkill.slice(),
      };
    }
    var maxChapter = chapterForLevel(target, tables.ChapterConfig);
    for (var chapter = BASE_CHAPTER + 1; chapter <= maxChapter; chapter += 1) {
      if (!tables.ChapterConfig[chapter]) tables.ChapterConfig[chapter] = chapterRow(chapter);
      var generatedTask = taskRow(chapter, tables.TaskConfig[10009] || tables.TaskConfig['10009']);
      if (!tables.TaskConfig[generatedTask.row.id]) tables.TaskConfig[generatedTask.row.id] = generatedTask.row;
      if (!tables.LanguageConfig[generatedTask.row.textId]) tables.LanguageConfig[generatedTask.row.textId] = generatedTask.language;
    }
    var firstTaskId = TASK_BASE + BASE_CHAPTER + 1;
    var terminalTask = tables.TaskConfig[10406] || tables.TaskConfig['10406'];
    if (terminalTask && (!terminalTask.nextId || int(terminalTask.nextId, 0) <= 0)) terminalTask.nextId = firstTaskId;
    return true;
  }

  return {
    VERSION: VERSION,
    BASE_LEVEL: BASE_LEVEL,
    BASE_CHAPTER: BASE_CHAPTER,
    CHAPTER_SIZE: CHAPTER_SIZE,
    MONSTER_BASE: MONSTER_BASE,
    TASK_BASE: TASK_BASE,
    isInfiniteLevel: isInfiniteLevel,
    chapterForLevel: chapterForLevel,
    monsterIdForLevel: monsterIdForLevel,
    monsterAttrsForLevel: monsterAttrsForLevel,
    resolveLevel: resolveLevel,
    resolveChapter: resolveChapter,
    levelRow: levelRow,
    chapterRow: chapterRow,
    ensure: ensure,
  };
}));

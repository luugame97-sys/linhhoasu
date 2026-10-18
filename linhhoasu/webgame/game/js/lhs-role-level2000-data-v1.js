/* Shared custom cultivation data. Same bytes are served to browser and server. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.LhsCultivationDataV1 = factory();
}(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';
    var VERSION = 'cultivation_2000_v2';
    var POLICY = {
        version: VERSION, blockSize: 2000, maxLevel: 2000, maxStage: 48,
        baseLevel: 1305, baseStage: 45, expPerLevel: 200000,
        systems: [
            { id: 'pham_nhan', name: 'Phàm Nhân Tu Tiên', minLevel: 1, maxLevel: 2000, unlocked: true },
            { id: 'tien_nghich', name: 'Tiên Nghịch', minLevel: 2001, maxLevel: 4000, unlocked: false },
            { id: 'hoan_my', name: 'Thế Giới Hoàn Mỹ', minLevel: 4001, maxLevel: 6000, unlocked: false },
            { id: 'dau_pha', name: 'Đấu Phá Thương Khung', minLevel: 6001, maxLevel: 8000, unlocked: false },
            { id: 'gia_thien', name: 'Già Thiên', minLevel: 8001, maxLevel: 10000, unlocked: false }
        ],
        realms: [
            { id: 46, name: 'Đạo Tổ sơ kỳ', levelMax: 1500 },
            { id: 47, name: 'Đạo Tổ trung kỳ', levelMax: 1750 },
            { id: 48, name: 'Đạo Tổ hậu kỳ', levelMax: 2000 }
        ]
    };
    function clone(v) { return JSON.parse(JSON.stringify(v)); }
    function languageRow(value) { return { cn: value, vi: value, vn: value, en: value, tw: value, jp: value, kr: value }; }
    function systemForLevel(level) {
        if (!Number.isSafeInteger(level) || level < 1) return null;
        return POLICY.systems.find(function (s) { return level >= s.minLevel && level <= s.maxLevel; }) || null;
    }
    function enabled() {
        return typeof process !== 'undefined' && process.env
            && process.env.ROLE_LEVEL_2000_ENABLED === '1' && process.env.ROLE_LEVEL_2000_DISABLED !== '1';
    }
    function extend(tables) {
        if (tables.RoleLevel2000ExtensionConfig) {
            if (tables.RoleLevel2000ExtensionConfig.version !== VERSION) throw Error('CULTIVATION_VERSION_CONFLICT');
            return tables.RoleLevel2000ExtensionConfig;
        }
        var levels = tables.RoleLevelConfig, stages = tables.RoleStageConfig, tasks = tables.TaskConfig;
        var monsters = tables.MonsterConfig, bosses = tables.DemonBossConfig;
        var lang = tables.LanguageConfig || {}, names = {}, newLevels = {}, newStages = {}, newTasks = {}, newBosses = {}, newMonsters = {};
        if (!levels || !levels[1305] || !stages || !stages[45] || !tasks || !monsters || !monsters[200045] || !bosses || !bosses[45]) throw Error('CULTIVATION_BASE_MISSING');
        if (stages[45].levelMax !== 1305 || stages[45].taskGroup.length !== 0 || !Number.isSafeInteger(levels[1305].exp)) throw Error('CULTIVATION_BASE_DRIFT');
        var templates = [tasks[40044], tasks[40144], tasks[40244]];
        if (templates.some(function (r, i) { return !r || r.type !== 4 || r.activeId !== [7, 13, 6][i]; })) throw Error('CULTIVATION_TASK_TEMPLATE');
        var majorPills = [111512,111513,111514,111516,111517], minorPills = [111502,111503,111504,111506,111507];
        majorPills.concat(minorPills).forEach(function (id) {
            var a = tables.AssetsConfig[id];
            if (!a || a.type !== 8 || a.subType !== 1) throw Error('CULTIVATION_PILL_MISSING:' + id);
        });
        [121511,121501].forEach(function (id) { if (!tables.AlchemyFormulaConfig[id]) throw Error('CULTIVATION_RECIPE_MISSING:' + id); });
        function newName(id, name) {
            if (lang[id] || names[id]) throw Error('CULTIVATION_LANGUAGE_COLLISION:' + id);
            names[id] = languageRow(name); return id;
        }
        function newTaskGroup(stage, cap) {
            var chapter = 604 + (stage - 45) * 20, bagels = 5000 + (stage - 45) * 500;
            if (!tables.LevelConfig[chapter]) throw Error('CULTIVATION_MAINLINE_MISSING:' + chapter);
            var values = [chapter, bagels, cap];
            var captions = ['Tiến độ ải chính đạt mốc ' + chapter, 'Tiêu hao ' + bagels + ' Baozi trong cảnh giới hiện tại', 'Tăng cấp nhân vật đến ' + cap];
            return templates.map(function (template, i) {
                var id = 980000 + stage * 10 + i;
                if (tasks[id] || newTasks[id]) throw Error('CULTIVATION_TASK_COLLISION:' + id);
                var row = clone(template); row.id = id; row.taskValue1 = values[i];
                row.textId = newName(39803000 + stage * 10 + i, captions[i]);
                newTasks[id] = row; return id;
            });
        }
        for (var level = 1306; level <= POLICY.maxLevel; level++) {
            if (levels[level]) throw Error('CULTIVATION_LEVEL_COLLISION:' + level);
            var exp = levels[1305].exp + (level - 1305) * POLICY.expPerLevel;
            if (!Number.isSafeInteger(exp) || exp <= 0) throw Error('CULTIVATION_EXP_INVALID');
            newLevels[level] = { lv: level, exp: exp };
        }
        // Only progression fields at the former terminal change. Keep its name,
        // HP/ATK/DEF, level cap and already-earned rewards untouched.
        newStages[45] = Object.assign({}, clone(stages[45]), {
            taskGroup: newTaskGroup(45, 1305), successRate: 2000, addSuccessRate: 1600,
            failDecreaseExp: 0, itemIds: majorPills, alchemyId: 121511
        });
        POLICY.realms.forEach(function (realm, index) {
            var id = realm.id, terminal = id === POLICY.maxStage, multiplier = 100 + (index + 1) * 8;
            if (stages[id] || bosses[id] || monsters[200000 + id]) throw Error('CULTIVATION_STAGE_COLLISION:' + id);
            var attr = {};
            Object.keys(stages[45].attr).forEach(function (k) { attr[k] = Math.floor(stages[45].attr[k] * multiplier / 100); });
            newStages[id] = Object.assign({}, clone(stages[45]), {
                id: id, name: newName(39802000 + id, realm.name), levelMax: realm.levelMax, attr: attr,
                taskGroup: terminal ? [] : newTaskGroup(id, realm.levelMax),
                successRate: terminal ? 0 : 2000, addSuccessRate: terminal ? 0 : 1600,
                failDecreaseExp: 0, itemIds: terminal ? [] : minorPills.slice(), alchemyId: terminal ? 121511 : 121501,
                rewards: [{ id: 21, count: 160 + index * 10 }, { id: 1, count: 1600 + index * 100 }],
                show: index === 0 ? 9 : 0
            });
            // Existing visuals/skills/consumables; no new asset dependency.
            newBosses[id] = Object.assign({}, clone(bosses[45]), { roleStageId: id, monsterId: 200000 + id });
            newMonsters[200000 + id] = Object.assign({}, clone(monsters[200045]), { id: 200000 + id });
            Object.keys(newMonsters[200000 + id].monsterAttrs).forEach(function (k) {
                newMonsters[200000 + id].monsterAttrs[k] = Math.floor(monsters[200045].monsterAttrs[k] * multiplier / 100);
            });
        });
        // Commit after validating every id/reference: failures leave tables intact.
        Object.assign(levels, newLevels); Object.assign(stages, newStages); Object.assign(tasks, newTasks);
        Object.assign(bosses, newBosses); Object.assign(monsters, newMonsters); Object.assign(lang, names);
        tables.LanguageConfig = lang;
        tables.CultivationSystemsConfig = clone(POLICY.systems);
        tables.RoleLevel2000ExtensionConfig = Object.assign(clone(POLICY), { languageRows: names });
        return tables.RoleLevel2000ExtensionConfig;
    }
    function apply(tables) { return enabled() ? extend(tables) : { enabled: false }; }
    return { VERSION: VERSION, POLICY: POLICY, MAX_LEVEL: POLICY.maxLevel, MAX_STAGE: POLICY.maxStage,
        enabled: enabled, extend: extend, apply: apply, systemForLevel: systemForLevel };
}));

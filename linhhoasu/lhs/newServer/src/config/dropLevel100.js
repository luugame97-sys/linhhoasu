'use strict';

// The 45->100 rollout is already live. This module keeps those rows
// compatible and continues both progressions through 200.
const VERSION = 'drop200_original_v1';
const TIER_VERSION = 'drop_tier200_original_v1';
const MAX_LEVEL = 200;
const MAX_TIER = 200;

function isEnabled() {
  if (process.env.DROP_LEVEL_200_DISABLED === '1') return false;
  if (process.env.DROP_LEVEL_100_DISABLED === '1') return false;
  const sid = Number(process.env.SERVER_ID || process.env.DEFAULT_SERVER_ID || 1001);
  return process.env.DROP_LEVEL_200_ENABLED === '1'
    || process.env.DROP_LEVEL_100_ENABLED === '1'
    // New server instances use the same shared config catalog. Do not make
    // each launch wait for a source-code allowlist update before receiving
    // the current drop extension.
    || Number.isSafeInteger(sid) && sid >= 1001;
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function extendTables(tables) {
  if (tables.DropLevelExtensionConfig && tables.DropLevelExtensionConfig.version === VERSION) {
    return tables.DropLevelExtensionConfig;
  }
  const box = tables.BoxConfig;
  const maps = tables.MapConfig;
  const scenes = tables.SceneConfig;
  const assets = tables.AssetsConfig;
  const quality = tables.QualityConfig;
  if (!box || !box[45] || !maps || !scenes || !assets || !quality || !quality[45]) {
    throw Error('DROP200_BASE_MISSING');
  }

  // Keep Q46-Q99 names. Q100-Q199 adds 25 families with four stages.
  const oldFamilies = ['Thiên Khải', 'Hồng Mông', 'Thái Sơ', 'Vô Cực', 'Càn Khôn', 'Tinh Hà',
    'Cửu Thiên', 'Vạn Cổ', 'Bất Diệt', 'Tạo Hóa', 'Hỗn Nguyên', 'Thiên Đạo',
    'Đạo Tổ', 'Đế Tôn', 'Chí Thánh', 'Siêu Thoát', 'Chung Cực', 'Vô Thượng'];
  const newFamilies = ['Thái Hư', 'Nguyên Sơ', 'Vĩnh Hằng', 'Tinh Không', 'Thần Vực',
    'Đại La', 'Huyền Hoàng', 'Vạn Tượng', 'Thiên Mệnh', 'Thiên Nguyên',
    'Đạo Hư', 'Đạo Cực', 'Cổ Thần', 'Thái Cổ', 'Chân Giới', 'Vô Gian',
    'Bản Nguyên', 'Khởi Nguyên', 'Siêu Duy', 'Tịch Diệt', 'Luân Hồi',
    'Chí Tôn', 'Vạn Đạo', 'Thiên Ngoại', 'Chư Thiên'];
  const oldStages = ['Huyền', 'Thánh', 'Tuyệt'];
  const newStages = ['Huyền', 'Thánh', 'Tuyệt', 'Đạo'];
  const slots = ['Kiếm', 'Quan', 'Bào', 'Ngoa', 'Đai', 'Uyển', 'Giới', 'Thủ', 'Khố', 'Bội', 'Quyển', 'Đao'];
  const profiles = [[5152, 3098, 986, 497, 195, 63, 8, 1], [5339, 3010, 922, 461, 200, 59, 8, 1], [5340, 2965, 944, 498, 186, 58, 8, 1]];
  const language = tables.LanguageConfig || (tables.LanguageConfig = {});
  const templates = tables.DropEquipTemplateConfig || (tables.DropEquipTemplateConfig = {});
  const names = {};
  const languages = ['cn', 'vi', 'vn', 'en', 'tw', 'jp', 'kr'];

  function text(id, name) {
    if (language[id]) return;
    const row = {};
    languages.forEach((key) => { row[key] = name; });
    language[id] = row;
  }

  for (let q = 46; q <= 99; q += 1) {
    const name = `${oldFamilies[Math.floor((q - 46) / 3)]} · ${oldStages[(q - 46) % 3]}`;
    const nameId = 39000000 + q;
    names[q] = nameId;
    text(nameId, `[${name}]`);
    if (!quality[q]) quality[q] = { quality: q, qualityBg: 43 + ((q - 46) % 3), starNum: 0 };
    templates[q] = templates[q] || {};
    for (let k = 1; k <= 13; k += 1) {
      const code = k === 13 ? 201 : 100 + k;
      const id = 200000000 + q * 1000 + code;
      const source = assets[k === 13 ? 75201 : 75100 + k];
      if (!source || source.type !== 3) throw Error(`DROP200_ASSET_SOURCE_MISSING:${k}`);
      if (!assets[id]) {
        const row = clone(source);
        row.id = id; row.quality = q; row.name = id;
        assets[id] = row;
      }
      text(id, `${name} ${k === 13 ? 'Quyền' : slots[k - 1]}`);
      templates[q][k] = id;
    }
  }

  for (let q = 100; q <= 199; q += 1) {
    const name = `${newFamilies[Math.floor((q - 100) / 4)]} · ${newStages[(q - 100) % 4]}`;
    const nameId = 39000000 + q;
    names[q] = nameId;
    text(nameId, `[${name}]`);
    if (quality[q]) throw Error(`DROP200_QUALITY_COLLISION:${q}`);
    quality[q] = { quality: q, qualityBg: 43 + ((q - 100) % 3), starNum: 0 };
    templates[q] = {};
    for (let k = 1; k <= 13; k += 1) {
      const code = k === 13 ? 201 : 100 + k;
      const id = 200000000 + q * 1000 + code;
      const source = assets[k === 13 ? 75201 : 75100 + k];
      if (!source || source.type !== 3 || assets[id]) throw Error(`DROP200_ASSET_COLLISION_OR_MISSING:${id}`);
      const row = clone(source);
      row.id = id; row.quality = q; row.name = id;
      assets[id] = row;
      text(id, `${name} ${k === 13 ? 'Quyền' : slots[k - 1]}`);
      templates[q][k] = id;
    }
  }

  box[45] = Object.assign({}, clone(box[45]), { levelUpCost: Array(5).fill(68000000), timeCost: 26136000 });
  for (let level = 46; level <= MAX_LEVEL; level += 1) {
    const mapId = 10000 + level;
    if (!maps[mapId]) {
      const sourceId = 10001 + ((level - 1) % 36);
      maps[mapId] = Object.assign({}, clone(maps[sourceId]), { id: mapId });
    }
    const map = maps[mapId];
    const scene = scenes[map && map.sceneId];
    if (!scene || !map.bornPoints || !map.bornPoints.length) throw Error(`DROP200_MAP_INVALID:${mapId}`);
    const weights = Array(199).fill(0);
    profiles[level % 3].forEach((weight, index) => { weights[level - 9 + index] = weight; });
    const cost = 68000000 + (level - 45) * 4000000;
    const time = 26136000 + (level - 45) * 1296000;
    box[level] = Object.assign({}, clone(box[45]), {
      id: level, mapId, equipQualityWeight: weights,
      levelUpCost: level < MAX_LEVEL ? Array(5).fill(cost) : [],
      timeCost: level < MAX_LEVEL ? time : 0,
      mapBossDropQuality: level - 1, mapBossShow: scene.mapBossShow,
    });
  }

  extendBoxTier200(tables);
  tables.DropLevelExtensionConfig = { version: VERSION, maxLevel: MAX_LEVEL, qualityNames: names };
  return tables.DropLevelExtensionConfig;
}

function extendBoxTier200(tables) {
  if (tables.DropTierExtensionConfig && tables.DropTierExtensionConfig.version === TIER_VERSION) return;
  const tiers = tables.BoxTierConfig;
  const tasks = tables.TaskConfig;
  if (!tiers || !tiers[10] || !tasks) throw Error('DROP_TIER200_BASE_MISSING');
  const base = tiers[10];
  const baseTasks = Array.isArray(base.task) ? base.task : [];
  if (baseTasks.length !== 3) throw Error('DROP_TIER200_BASE_TASK_INVALID');
  const taskText = [20070007, 20070107, 20070207];
  for (let tier = 11; tier <= MAX_TIER; tier += 1) {
    const ids = [970000 + tier, 971000 + tier, 972000 + tier];
    // Continue the original 11..100 slopes through 200, including the
    // Yêu Vương frontier. Required bosses are added by the boss overlay.
    const targets = [
      27 + Math.ceil((tier - 10) * 73 / 90),
      800 + Math.ceil((tier - 10) * 200 / 90),
      36 + Math.ceil((tier - 10) * 64 / 90),
    ];
    ids.forEach((id, index) => {
      const source = tasks[baseTasks[index]] || tasks[String(baseTasks[index])];
      if (!source) throw Error(`DROP_TIER200_TASK_SOURCE_MISSING:${baseTasks[index]}`);
      const row = tasks[id] ? clone(tasks[id]) : clone(source);
      row.id = id; row.textId = taskText[index]; row.taskValue1 = targets[index];
      tasks[id] = row;
    });
    const cost = 450 + (tier - 10) * 50;
    const time = 7200 + (tier - 10) * 1800;
    tiers[tier] = Object.assign({}, clone(base), {
      id: tier, tierUpCost: tier < MAX_TIER ? Array(5).fill(cost) : [],
      timeCost: tier < MAX_TIER ? time : 0, task: ids, count: tier,
    });
  }
  tables.DropTierExtensionConfig = { version: TIER_VERSION, maxTier: MAX_TIER, maxOpenCount: MAX_TIER };
}

function apply(tables) { return isEnabled() ? extendTables(tables) : { enabled: false }; }

module.exports = { VERSION, TIER_VERSION, MAX_LEVEL, MAX_TIER, isEnabled, apply, extendTables, extendBoxTier200 };

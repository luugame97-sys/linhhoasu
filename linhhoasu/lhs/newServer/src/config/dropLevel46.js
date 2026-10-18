'use strict';

// S1-only, reversible pilot. The normal binary remains the base for all nodes.
const PILOT_SERVER_ID = 1001;

function isEnabled() {
  return Number(process.env.SERVER_ID || 0) === PILOT_SERVER_ID
    && String(process.env.DROP_LEVEL_46_ENABLED || '') === '1'
    && String(process.env.DROP_LEVEL_100_ENABLED || '') !== '1';
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function apply(tables) {
  if (!isEnabled()) return { enabled: false, level: 45 };
  const box = tables && tables.BoxConfig;
  const map = tables && tables.MapConfig;
  const quality = tables && tables.QualityConfig;
  const assets = tables && tables.AssetsConfig;
  if (!box || !box[45] || !map || !map[10046] || !quality?.[45]) throw new Error('DROP46_BASE_CONFIG_MISSING');
  const q45 = Object.values(assets || {}).filter((row) => row && Number(row.type) === 3 && Number(row.quality) === 45);
  if (q45.length !== 13) throw new Error('DROP46_QUALITY45_CATALOG_INVALID');
  if (box[46] && Number(box[46].id) !== 46) throw new Error('DROP46_EXISTING_ROW_INVALID');

  const previous = clone(box[45]);
  const weights = Array(45).fill(0);
  // Levels 31..45 repeat three probability profiles. Level 46 repeats 43's
  // profile shifted by three qualities; the positive range becomes 38..45.
  [5339, 3010, 922, 461, 200, 59, 8, 1].forEach((value, index) => { weights[37 + index] = value; });
  if (weights.reduce((sum, value) => sum + value, 0) !== 10000) throw new Error('DROP46_WEIGHTS_INVALID');

  // The current row contains the price/time for its NEXT level. Row 46 is
  // terminal, so the 45->46 price belongs to row 45, not row 46.
  box[45] = { ...clone(previous), levelUpCost: Array(5).fill(68000000), timeCost: 26136000 };
  box[46] = {
    ...clone(previous),
    id: 46,
    mapId: 10046,
    levelUpCost: [],
    timeCost: 0,
    equipQualityWeight: weights,
    mapBossDropQuality: 45,
    mapBossShow: tables.SceneConfig[map[10046].sceneId].mapBossShow,
  };
  return { enabled: true, level: 46, mapId: 10046, sceneId: map[10046].sceneId, qualityFloor: 45 };
}

module.exports = { isEnabled, apply };

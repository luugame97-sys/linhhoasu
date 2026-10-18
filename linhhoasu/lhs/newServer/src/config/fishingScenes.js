'use strict';

// Candidate extension for the normal fishing grounds.  The native binary still
// remains the source of every fish/relic row; this module only adds three scene
// descriptors when the rollout flag is explicitly enabled.  Keeping the
// extension opt-in prevents a server/client config mismatch on old clients.
const VERSION = 'fishing_scenes_8_10_v1';
const ENABLE_ENV = 'FISHING_SCENES_8_10_ENABLED';

const SCENE_ROWS = Object.freeze({
  // Scene 8/9/10 reuse the high-tier fish and relic IDs already shipped by the
  // client.  New artwork can replace the presentation keys later without
  // changing player data or the catch tables.
  8: Object.freeze({
    id: 8,
    cond: 31,
    openDay: 1,
    isActivity: 0,
    name: 30030286,
    fishes: Object.freeze([
      5016, 5026, 5036, 5046, 5056,
      5018, 5028, 5038, 5048, 5058,
      5017, 5027, 5037, 5047, 5057,
    ]),
    relics: Object.freeze([5804, 5801, 5316, 5317, 5318, 5319]),
    picture: 'fishing_scene_7',
    frontBg: '',
    backBg: '',
    banner: 'ui_dydj_bm_banner7',
    miniBanner: 'dy_bm_handbook_7',
  }),
  9: Object.freeze({
    id: 9,
    cond: 34,
    openDay: 1,
    isActivity: 0,
    name: 30030286,
    fishes: Object.freeze([
      5066, 5076, 5086, 5096, 5106,
      5068, 5078, 5088, 5098, 5108,
      5067, 5077, 5087, 5097, 5107,
    ]),
    relics: Object.freeze([5803, 5802, 5320, 5321, 5322, 5323]),
    picture: 'fishing_scene_7',
    frontBg: '',
    backBg: '',
    banner: 'ui_dydj_bm_banner7',
    miniBanner: 'dy_bm_handbook_7',
  }),
  10: Object.freeze({
    id: 10,
    cond: 37,
    openDay: 1,
    isActivity: 0,
    name: 30030286,
    fishes: Object.freeze([
      5016, 5026, 5036, 5046, 5056,
      5018, 5028, 5038, 5048, 5058,
      5017, 5027, 5037, 5047, 5057,
      5066, 5076, 5086, 5096, 5106,
      5068, 5078, 5088, 5098, 5108,
      5067, 5077, 5087, 5097, 5107,
    ]),
    relics: Object.freeze([
      5804, 5801, 5316, 5317, 5318, 5319,
      5803, 5802, 5320, 5321, 5322, 5323,
    ]),
    picture: 'fishing_scene_7',
    frontBg: '',
    backBg: '',
    banner: 'ui_dydj_bm_banner7',
    miniBanner: 'dy_bm_handbook_7',
  }),
});

function enabled() {
  return String(process.env[ENABLE_ENV] || '') === '1'
    && String(process.env.FISHING_SCENES_8_10_DISABLED || '') !== '1';
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function own(map, id) {
  return !!(map && (map[id] || map[String(id)]));
}

function assertBase(tables) {
  const scenes = tables && tables.FishSceneConfig;
  const fish = tables && tables.FishConfig;
  if (!scenes || !fish || !scenes[1] || !scenes[7]) throw new Error('FISH_SCENES_BASE_MISSING');
  [1, 2, 3, 4, 5, 6, 7].forEach((id) => {
    const row = scenes[id] || scenes[String(id)];
    if (!row || Number(row.id) !== id || Number(row.isActivity) !== 0 || !Array.isArray(row.fishes)) {
      throw new Error(`FISH_SCENES_BASE_DRIFT:${id}`);
    }
  });
}

function validateRow(tables, row) {
  const fish = tables.FishConfig || {};
  const scene7 = tables.FishSceneConfig[7] || tables.FishSceneConfig['7'];
  if (!Number.isSafeInteger(row.id) || row.id < 8 || row.id > 10
    || !Number.isSafeInteger(row.cond) || row.cond <= Number(scene7.cond)) {
    throw new Error(`FISH_SCENES_ROW_INVALID:${row.id}`);
  }
  if (row.isActivity !== 0 || row.openDay !== 1 || !Array.isArray(row.fishes) || row.fishes.length < 15
    || !Array.isArray(row.relics) || row.relics.length < 6) {
    throw new Error(`FISH_SCENES_ROW_SHAPE_INVALID:${row.id}`);
  }
  for (const id of row.fishes) {
    const cfg = fish[id] || fish[String(id)];
    if (!cfg || Number(cfg.id) !== Number(id) || Number(cfg.type) < 1 || Number(cfg.type) > 10) {
      throw new Error(`FISH_SCENES_FISH_MISSING:${row.id}:${id}`);
    }
  }
  for (const id of row.relics) {
    if (!own(fish, id)) throw new Error(`FISH_SCENES_RELIC_MISSING:${row.id}:${id}`);
  }
}

function extend(tables) {
  assertBase(tables);
  const scenes = tables.FishSceneConfig;
  const existing = [8, 9, 10].map((id) => scenes[id] || scenes[String(id)]).filter(Boolean);
  if (existing.length > 0) {
    if (existing.length !== 3) throw new Error('FISH_SCENES_PARTIAL_EXISTING_ROWS');
    // A newer native binary may already carry these rows with translated
    // names or new presentation keys.  Validate the contract but preserve
    // those native values instead of rejecting harmless key/order drift.
    existing.forEach((row) => validateRow(tables, row));
    tables.FishingScenesExtensionConfig = {
      version: VERSION,
      ids: [8, 9, 10],
      enabled: true,
      reusedNativeAssets: true,
    };
    return tables.FishingScenesExtensionConfig;
  }

  const rows = {};
  [8, 9, 10].forEach((id) => {
    const row = clone(SCENE_ROWS[id]);
    validateRow(tables, row);
    rows[id] = row;
  });
  Object.assign(scenes, rows);
  tables.FishingScenesExtensionConfig = {
    version: VERSION,
    ids: [8, 9, 10],
    enabled: true,
    reusedNativeAssets: true,
  };
  return tables.FishingScenesExtensionConfig;
}

function apply(tables) {
  return enabled() ? extend(tables) : { enabled: false, version: VERSION, ids: [] };
}

module.exports = { VERSION, ENABLE_ENV, SCENE_ROWS, enabled, extend, apply };

'use strict';

const config = require('./ConfigService');

// Paired synthetic AssetsConfig.param 1071..1076 and item descriptions identify
// these levels; random_gem_XX is QUALITY, not level.
const GEM_PACK_LEVELS = Object.freeze({
  100081: 1, 100082: 2, 100083: 3, 100084: 4, 100085: 5, 100086: 6,
  100091: 1, 100092: 2, 100093: 3, 100094: 4, 100095: 5, 100096: 6,
});
function getGemPackLevel(itemId) {
  const level = GEM_PACK_LEVELS[itemId];
  const row = (config.get('AssetsConfig') || {})[itemId];
  if (!level || !row || row.quality !== level + 1
    || row.icon !== `random_gem_${String(level + 1).padStart(2, '0')}`) return 0;
  if (row.type === 99 && row.param !== 1070 + level) return 0;
  return level;
}
function getGemRewardIdsByLevel(level) {
  const assets = config.get('AssetsConfig') || {};
  return Object.values(config.get('GemLevelConfig') || {})
    .filter(row => row.level === Number(level) && [1, 2, 3, 4].includes(row.type)
      && assets[row.id]?.type === 18 && assets[row.id]?.quality === Number(level) + 1)
    .map(row => row.id).sort((a, b) => a - b);
}

// Fixed boxes verified against AssetsConfig icon/quality and GemLevelConfig.
// Unknown mixed-quality pools remain absent; explicit same-grade compatibility pools are defined below.
const FIXED_GEMS = Object.freeze({
  100080: { id: 25032, level: 4, type: 2 },
  100810: { id: 25051, level: 6, type: 1 },
  100811: { id: 25052, level: 6, type: 2 },
  100812: { id: 25053, level: 6, type: 3 },
  100813: { id: 25054, level: 6, type: 4 },
});

// 100802 is the native "random premium elemental fruit" PetSoul box.
// The production table has the display asset but no AssetsUseConfig row, so
// keep the pool explicit and verify it against the live material config before
// consuming anything.  Quality 6 maps to one of the five elemental materials
// 268..272 (score 400 each).
const PET_SOUL_RANDOM_BOXES = Object.freeze({
  100802: Object.freeze({
    icon: 'random_petsoul_02',
    quality: 6,
    materialIds: Object.freeze([268, 269, 270, 271, 272]),
  }),
});

function resolvePetSoulRandomBox(itemId, count) {
  const box = PET_SOUL_RANDOM_BOXES[itemId];
  if (!box || !Number.isSafeInteger(count) || count <= 0 || count > 10000) return null;
  const asset = (config.get('AssetsConfig') || {})[itemId];
  const materials = config.get('PetSoulUpgradeMaterialConfig') || {};
  if (!asset || asset.type !== 99 || asset.icon !== box.icon || asset.quality !== box.quality
    || asset.param !== itemId) return null;
  const ids = box.materialIds.filter((id) => {
    const row = materials[id] || materials[String(id)];
    const material = (config.get('AssetsConfig') || {})[id];
    return row && row.id === id && row.element === id - 267 && row.score === 400
      && material && material.id === id && material.type === 41 && material.quality === box.quality
      && material.subType === row.element && material.param === 400 && material.icon === `icon_${id}`;
  });
  if (ids.length !== box.materialIds.length) return null;
  const merged = new Map();
  for (let i = 0; i < count; i += 1) {
    const id = ids[Math.floor(Math.random() * ids.length)];
    merged.set(id, (merged.get(id) || 0) + 1);
  }
  return { rows: Array.from(merged.entries()).map(([id, rewardCount]) => ({ id, count: rewardCount })) };
}


// Compatibility convention: equal selection within the advertised, verified
// quality/level pool. This is not a recovered official CN drop distribution.
const VERIFIED_BOX_DEFINITIONS = Object.freeze([
  {
    "id": 100501,
    "kind": "orb",
    "type": 1,
    "icon": "random_orb_04",
    "quality": 4,
    "poolIds": [
      9101
    ]
  },
  {
    "id": 100502,
    "kind": "orb",
    "type": 1,
    "icon": "random_orb_06",
    "quality": 6,
    "poolIds": [
      9111,
      9112,
      9113,
      9121,
      9122,
      9123,
      9131,
      9132,
      9133,
      9134,
      9135,
      9136,
      9141,
      9142,
      9143,
      9151,
      9152,
      9153,
      9161,
      9162,
      9163,
      9164,
      9165,
      9166
    ]
  },
  {
    "id": 100503,
    "kind": "orb",
    "type": 1,
    "icon": "random_orb_07",
    "quality": 7,
    "poolIds": [
      9211,
      9212,
      9213,
      9221,
      9222,
      9223,
      9224,
      9225,
      9226,
      9231,
      9232,
      9233,
      9241,
      9242,
      9243,
      9244,
      9245,
      9246,
      9251,
      9252,
      9253
    ]
  },
  {
    "id": 100511,
    "kind": "orb",
    "type": 99,
    "icon": "random_orb_04",
    "quality": 4,
    "param": 1501,
    "poolIds": [
      9101
    ]
  },
  {
    "id": 100512,
    "kind": "orb",
    "type": 99,
    "icon": "random_orb_06",
    "quality": 6,
    "param": 1502,
    "poolIds": [
      9111,
      9112,
      9113,
      9121,
      9122,
      9123,
      9131,
      9132,
      9133,
      9134,
      9135,
      9136,
      9141,
      9142,
      9143,
      9151,
      9152,
      9153,
      9161,
      9162,
      9163,
      9164,
      9165,
      9166
    ]
  },
  {
    "id": 100513,
    "kind": "orb",
    "type": 99,
    "icon": "random_orb_07",
    "quality": 7,
    "param": 1503,
    "poolIds": [
      9211,
      9212,
      9213,
      9221,
      9222,
      9223,
      9224,
      9225,
      9226,
      9231,
      9232,
      9233,
      9241,
      9242,
      9243,
      9244,
      9245,
      9246,
      9251,
      9252,
      9253
    ]
  },
  {
    "id": 100701,
    "kind": "connect",
    "type": 1,
    "icon": "random_connect_01",
    "quality": 5,
    "level": 1,
    "poolIds": [
      200101,
      200102,
      200103,
      200104,
      200105,
      200106,
      200107,
      200108,
      200109,
      200110,
      200111,
      200112,
      200113,
      200114
    ]
  },
  {
    "id": 100721,
    "kind": "connect",
    "type": 99,
    "icon": "random_connect_01",
    "quality": 5,
    "param": 1201,
    "level": 1,
    "poolIds": [
      200101,
      200102,
      200103,
      200104,
      200105,
      200106,
      200107,
      200108,
      200109,
      200110,
      200111,
      200112,
      200113,
      200114
    ]
  },
  {
    "id": 100702,
    "kind": "connect",
    "type": 1,
    "icon": "random_connect_02",
    "quality": 5,
    "level": 2,
    "poolIds": [
      200201,
      200202,
      200203,
      200204,
      200205,
      200206,
      200207,
      200208,
      200209,
      200210,
      200211,
      200212,
      200213,
      200214
    ]
  },
  {
    "id": 100722,
    "kind": "connect",
    "type": 99,
    "icon": "random_connect_02",
    "quality": 5,
    "param": 1202,
    "level": 2,
    "poolIds": [
      200201,
      200202,
      200203,
      200204,
      200205,
      200206,
      200207,
      200208,
      200209,
      200210,
      200211,
      200212,
      200213,
      200214
    ]
  },
  {
    "id": 100703,
    "kind": "connect",
    "type": 1,
    "icon": "random_connect_03",
    "quality": 6,
    "level": 3,
    "poolIds": [
      200301,
      200302,
      200303,
      200304,
      200305,
      200306,
      200307,
      200308,
      200309,
      200310,
      200311,
      200312,
      200313,
      200314
    ]
  },
  {
    "id": 100723,
    "kind": "connect",
    "type": 99,
    "icon": "random_connect_03",
    "quality": 6,
    "param": 1203,
    "level": 3,
    "poolIds": [
      200301,
      200302,
      200303,
      200304,
      200305,
      200306,
      200307,
      200308,
      200309,
      200310,
      200311,
      200312,
      200313,
      200314
    ]
  },
  {
    "id": 100704,
    "kind": "connect",
    "type": 1,
    "icon": "random_connect_04",
    "quality": 6,
    "level": 4,
    "poolIds": [
      200401,
      200402,
      200403,
      200404,
      200405,
      200406,
      200407,
      200408,
      200409,
      200410,
      200411,
      200412,
      200413,
      200414
    ]
  },
  {
    "id": 100724,
    "kind": "connect",
    "type": 99,
    "icon": "random_connect_04",
    "quality": 6,
    "param": 1204,
    "level": 4,
    "poolIds": [
      200401,
      200402,
      200403,
      200404,
      200405,
      200406,
      200407,
      200408,
      200409,
      200410,
      200411,
      200412,
      200413,
      200414
    ]
  },
  {
    "id": 100705,
    "kind": "connect",
    "type": 1,
    "icon": "random_connect_05",
    "quality": 7,
    "level": 5,
    "poolIds": [
      200501,
      200502,
      200503,
      200504,
      200505,
      200506,
      200507,
      200508,
      200509,
      200510,
      200511,
      200512,
      200513,
      200514
    ]
  },
  {
    "id": 100725,
    "kind": "connect",
    "type": 99,
    "icon": "random_connect_05",
    "quality": 7,
    "param": 1205,
    "level": 5,
    "poolIds": [
      200501,
      200502,
      200503,
      200504,
      200505,
      200506,
      200507,
      200508,
      200509,
      200510,
      200511,
      200512,
      200513,
      200514
    ]
  },
  {
    "id": 100706,
    "kind": "connect",
    "type": 1,
    "icon": "random_connect_06",
    "quality": 7,
    "level": 6,
    "poolIds": [
      200601,
      200602,
      200603,
      200604,
      200605,
      200606,
      200607,
      200608,
      200609,
      200610,
      200611,
      200612,
      200613,
      200614
    ]
  },
  {
    "id": 100726,
    "kind": "connect",
    "type": 99,
    "icon": "random_connect_06",
    "quality": 7,
    "param": 1206,
    "level": 6,
    "poolIds": [
      200601,
      200602,
      200603,
      200604,
      200605,
      200606,
      200607,
      200608,
      200609,
      200610,
      200611,
      200612,
      200613,
      200614
    ]
  },
  {
    "id": 100707,
    "kind": "connect",
    "type": 1,
    "icon": "random_connect_07",
    "quality": 8,
    "level": 7,
    "poolIds": [
      200701,
      200702,
      200703,
      200704,
      200705,
      200706,
      200707,
      200708,
      200709,
      200710,
      200711,
      200712,
      200713,
      200714
    ]
  },
  {
    "id": 100727,
    "kind": "connect",
    "type": 99,
    "icon": "random_connect_07",
    "quality": 8,
    "param": 1207,
    "level": 7,
    "poolIds": [
      200701,
      200702,
      200703,
      200704,
      200705,
      200706,
      200707,
      200708,
      200709,
      200710,
      200711,
      200712,
      200713,
      200714
    ]
  },
  {
    "id": 100708,
    "kind": "connect",
    "type": 1,
    "icon": "random_connect_08",
    "quality": 8,
    "level": 8,
    "poolIds": [
      200801,
      200802,
      200803,
      200804,
      200805,
      200806,
      200807,
      200808,
      200809,
      200810,
      200811,
      200812,
      200813,
      200814
    ]
  },
  {
    "id": 100728,
    "kind": "connect",
    "type": 99,
    "icon": "random_connect_08",
    "quality": 8,
    "param": 1208,
    "level": 8,
    "poolIds": [
      200801,
      200802,
      200803,
      200804,
      200805,
      200806,
      200807,
      200808,
      200809,
      200810,
      200811,
      200812,
      200813,
      200814
    ]
  },
  {
    "id": 100709,
    "kind": "connect",
    "type": 1,
    "icon": "random_connect_09",
    "quality": 9,
    "level": 9,
    "poolIds": [
      200901,
      200902,
      200903,
      200904,
      200905,
      200906,
      200907,
      200908,
      200909,
      200910,
      200911,
      200912,
      200913,
      200914
    ]
  },
  {
    "id": 100729,
    "kind": "connect",
    "type": 99,
    "icon": "random_connect_09",
    "quality": 9,
    "param": 1209,
    "level": 9,
    "poolIds": [
      200901,
      200902,
      200903,
      200904,
      200905,
      200906,
      200907,
      200908,
      200909,
      200910,
      200911,
      200912,
      200913,
      200914
    ]
  },
  {
    "id": 100033,
    "kind": "elf",
    "type": 1,
    "icon": "random_elf_04",
    "quality": 4,
    "poolIds": [
      154101,
      154102,
      154201,
      154202,
      154301,
      154302,
      154401,
      154402,
      154501,
      154502
    ]
  },
  {
    "id": 100034,
    "kind": "elf",
    "type": 1,
    "icon": "random_elf_06",
    "quality": 6,
    "poolIds": [
      156101,
      156102,
      156201,
      156202,
      156301,
      156302,
      156401,
      156402,
      156501,
      156502
    ]
  },
  {
    "id": 100035,
    "kind": "elf",
    "type": 1,
    "icon": "random_elf_07",
    "quality": 7,
    "poolIds": [
      157101,
      157201,
      157301,
      157401,
      157501
    ]
  },
  {
    "id": 100023,
    "kind": "elfPiece",
    "type": 1,
    "icon": "random_elfPiece_04",
    "quality": 4,
    "poolIds": [
      164101,
      164102,
      164201,
      164202,
      164301,
      164302,
      164401,
      164402,
      164501,
      164502
    ]
  },
  {
    "id": 100024,
    "kind": "elfPiece",
    "type": 1,
    "icon": "random_elfPiece_06",
    "quality": 6,
    "poolIds": [
      166101,
      166102,
      166201,
      166202,
      166301,
      166302,
      166401,
      166402,
      166501,
      166502
    ]
  },
  {
    "id": 100025,
    "kind": "elfPiece",
    "type": 1,
    "icon": "random_elfPiece_07",
    "quality": 7,
    "poolIds": [
      167101,
      167201,
      167301,
      167401,
      167501
    ]
  },
  {
    "id": 100061,
    "kind": "artifactSoul",
    "type": 1,
    "icon": "random_artifactSoul_04",
    "quality": 4,
    "poolIds": [
      23501,
      23511,
      23521,
      23531,
      23541,
      23551
    ]
  },
  {
    "id": 100062,
    "kind": "artifactSoul",
    "type": 1,
    "icon": "random_artifactSoul_06",
    "quality": 6,
    "poolIds": [
      23502,
      23512,
      23522,
      23532,
      23542,
      23552
    ]
  },
  {
    "id": 100063,
    "kind": "artifactSoul",
    "type": 1,
    "icon": "random_artifactSoul_07",
    "quality": 7,
    "poolIds": [
      23503,
      23504,
      23513,
      23514,
      23523,
      23524,
      23533,
      23534,
      23543,
      23544,
      23553,
      23554,
      23561,
      23562,
      23563
    ]
  },
  {
    "id": 100071,
    "kind": "artifactSoul",
    "type": 99,
    "icon": "random_artifactSoul_04",
    "quality": 4,
    "param": 1061,
    "poolIds": [
      23501,
      23511,
      23521,
      23531,
      23541,
      23551
    ]
  },
  {
    "id": 100072,
    "kind": "artifactSoul",
    "type": 99,
    "icon": "random_artifactSoul_06",
    "quality": 6,
    "param": 1062,
    "poolIds": [
      23502,
      23512,
      23522,
      23532,
      23542,
      23552
    ]
  },
  {
    "id": 100073,
    "kind": "artifactSoul",
    "type": 99,
    "icon": "random_artifactSoul_07",
    "quality": 7,
    "param": 1063,
    "poolIds": [
      23503,
      23504,
      23513,
      23514,
      23523,
      23524,
      23533,
      23534,
      23543,
      23544,
      23553,
      23554,
      23561,
      23562,
      23563
    ]
  },
  {
    "id": 100171,
    "kind": "curios",
    "type": 1,
    "icon": "random_curios_shop1_03",
    "quality": 3,
    "materialType": 1,
    "poolIds": [
      131301,
      131302,
      131303,
      131304,
      131305,
      131306,
      131307,
      131308,
      131309,
      131310,
      131311,
      131312
    ]
  },
  {
    "id": 100172,
    "kind": "curios",
    "type": 1,
    "icon": "random_curios_shop1_04",
    "quality": 4,
    "materialType": 1,
    "poolIds": [
      131401,
      131402,
      131403,
      131404,
      131405,
      131406,
      131407,
      131408,
      131409,
      131410,
      131411,
      131412
    ]
  },
  {
    "id": 100173,
    "kind": "curios",
    "type": 1,
    "icon": "random_curios_shop1_06",
    "quality": 6,
    "materialType": 1,
    "poolIds": [
      131601,
      131602,
      131603,
      131604,
      131605,
      131606,
      131607,
      131608,
      131609,
      131610,
      131611,
      131612
    ]
  },
  {
    "id": 100181,
    "kind": "curios",
    "type": 99,
    "icon": "random_curios_shop1_03",
    "quality": 3,
    "param": 1101,
    "materialType": 1,
    "poolIds": [
      131301,
      131302,
      131303,
      131304,
      131305,
      131306,
      131307,
      131308,
      131309,
      131310,
      131311,
      131312
    ]
  },
  {
    "id": 100182,
    "kind": "curios",
    "type": 99,
    "icon": "random_curios_shop1_04",
    "quality": 4,
    "param": 1102,
    "materialType": 1,
    "poolIds": [
      131401,
      131402,
      131403,
      131404,
      131405,
      131406,
      131407,
      131408,
      131409,
      131410,
      131411,
      131412
    ]
  },
  {
    "id": 100183,
    "kind": "curios",
    "type": 99,
    "icon": "random_curios_shop1_06",
    "quality": 6,
    "param": 1103,
    "materialType": 1,
    "poolIds": [
      131601,
      131602,
      131603,
      131604,
      131605,
      131606,
      131607,
      131608,
      131609,
      131610,
      131611,
      131612
    ]
  },
  {
    "id": 100201,
    "kind": "curios",
    "type": 1,
    "icon": "random_curios_shop2_03",
    "quality": 3,
    "materialType": 2,
    "poolIds": [
      132301,
      132302,
      132303,
      132304,
      132305,
      132306,
      132307,
      132308,
      132309,
      132310,
      132311,
      132312,
      132313,
      132314,
      132315
    ]
  },
  {
    "id": 100202,
    "kind": "curios",
    "type": 1,
    "icon": "random_curios_shop2_04",
    "quality": 4,
    "materialType": 2,
    "poolIds": [
      132401,
      132402,
      132403,
      132404,
      132405,
      132406,
      132407,
      132408,
      132409,
      132410
    ]
  },
  {
    "id": 100203,
    "kind": "curios",
    "type": 1,
    "icon": "random_curios_shop2_06",
    "quality": 6,
    "materialType": 2,
    "poolIds": [
      132601,
      132602,
      132603,
      132604,
      132605,
      132606,
      132607,
      132608,
      132609,
      132610,
      132611,
      132612,
      132613,
      132614,
      132615
    ]
  },
  {
    "id": 100211,
    "kind": "curios",
    "type": 99,
    "icon": "random_curios_shop2_03",
    "quality": 3,
    "param": 1121,
    "materialType": 2,
    "poolIds": [
      132301,
      132302,
      132303,
      132304,
      132305,
      132306,
      132307,
      132308,
      132309,
      132310,
      132311,
      132312,
      132313,
      132314,
      132315
    ]
  },
  {
    "id": 100212,
    "kind": "curios",
    "type": 99,
    "icon": "random_curios_shop2_04",
    "quality": 4,
    "param": 1122,
    "materialType": 2,
    "poolIds": [
      132401,
      132402,
      132403,
      132404,
      132405,
      132406,
      132407,
      132408,
      132409,
      132410
    ]
  },
  {
    "id": 100213,
    "kind": "curios",
    "type": 99,
    "icon": "random_curios_shop2_06",
    "quality": 6,
    "param": 1123,
    "materialType": 2,
    "poolIds": [
      132601,
      132602,
      132603,
      132604,
      132605,
      132606,
      132607,
      132608,
      132609,
      132610,
      132611,
      132612,
      132613,
      132614,
      132615
    ]
  },
  {
    "id": 100231,
    "kind": "curios",
    "type": 1,
    "icon": "random_curios_03",
    "quality": 3,
    "poolIds": [
      131301,
      131302,
      131303,
      131304,
      131305,
      131306,
      131307,
      131308,
      131309,
      131310,
      131311,
      131312,
      132301,
      132302,
      132303,
      132304,
      132305,
      132306,
      132307,
      132308,
      132309,
      132310,
      132311,
      132312,
      132313,
      132314,
      132315,
      133301,
      133302,
      133303,
      133304,
      133305,
      133306,
      133307,
      133308,
      133309,
      133310,
      133311,
      133312,
      133313,
      133314,
      134301,
      134302,
      134303,
      134304,
      134305,
      134306,
      134307,
      134308,
      134309,
      134310,
      134311,
      134312,
      134313,
      134314
    ]
  },
  {
    "id": 100232,
    "kind": "curios",
    "type": 1,
    "icon": "random_curios_04",
    "quality": 4,
    "poolIds": [
      131401,
      131402,
      131403,
      131404,
      131405,
      131406,
      131407,
      131408,
      131409,
      131410,
      131411,
      131412,
      132401,
      132402,
      132403,
      132404,
      132405,
      132406,
      132407,
      132408,
      132409,
      132410,
      133401,
      133402,
      133403,
      133404,
      133405,
      133406,
      133407,
      133408,
      133409,
      133410,
      133411,
      133412,
      134401,
      134402,
      134403,
      134404,
      134405,
      134406,
      134407,
      134408,
      134409,
      134410,
      134411,
      134412
    ]
  },
  {
    "id": 100233,
    "kind": "curios",
    "type": 1,
    "icon": "random_curios_06",
    "quality": 6,
    "poolIds": [
      131601,
      131602,
      131603,
      131604,
      131605,
      131606,
      131607,
      131608,
      131609,
      131610,
      131611,
      131612,
      132601,
      132602,
      132603,
      132604,
      132605,
      132606,
      132607,
      132608,
      132609,
      132610,
      132611,
      132612,
      132613,
      132614,
      132615,
      133601,
      133602,
      133603,
      133604,
      133605,
      133606,
      133607,
      133608,
      133609,
      133610,
      133611,
      133612,
      133613,
      133614,
      133615,
      134601,
      134602,
      134603,
      134604,
      134605,
      134606,
      134607,
      134608,
      134609,
      134610,
      134611,
      134612,
      134613,
      134614,
      134615,
      134616
    ]
  },
  {
    "id": 100241,
    "kind": "curios",
    "type": 99,
    "icon": "random_curios_03",
    "quality": 3,
    "param": 1141,
    "poolIds": [
      131301,
      131302,
      131303,
      131304,
      131305,
      131306,
      131307,
      131308,
      131309,
      131310,
      131311,
      131312,
      132301,
      132302,
      132303,
      132304,
      132305,
      132306,
      132307,
      132308,
      132309,
      132310,
      132311,
      132312,
      132313,
      132314,
      132315,
      133301,
      133302,
      133303,
      133304,
      133305,
      133306,
      133307,
      133308,
      133309,
      133310,
      133311,
      133312,
      133313,
      133314,
      134301,
      134302,
      134303,
      134304,
      134305,
      134306,
      134307,
      134308,
      134309,
      134310,
      134311,
      134312,
      134313,
      134314
    ]
  },
  {
    "id": 100242,
    "kind": "curios",
    "type": 99,
    "icon": "random_curios_04",
    "quality": 4,
    "param": 1142,
    "poolIds": [
      131401,
      131402,
      131403,
      131404,
      131405,
      131406,
      131407,
      131408,
      131409,
      131410,
      131411,
      131412,
      132401,
      132402,
      132403,
      132404,
      132405,
      132406,
      132407,
      132408,
      132409,
      132410,
      133401,
      133402,
      133403,
      133404,
      133405,
      133406,
      133407,
      133408,
      133409,
      133410,
      133411,
      133412,
      134401,
      134402,
      134403,
      134404,
      134405,
      134406,
      134407,
      134408,
      134409,
      134410,
      134411,
      134412
    ]
  },
  {
    "id": 100243,
    "kind": "curios",
    "type": 99,
    "icon": "random_curios_06",
    "quality": 6,
    "param": 1143,
    "poolIds": [
      131601,
      131602,
      131603,
      131604,
      131605,
      131606,
      131607,
      131608,
      131609,
      131610,
      131611,
      131612,
      132601,
      132602,
      132603,
      132604,
      132605,
      132606,
      132607,
      132608,
      132609,
      132610,
      132611,
      132612,
      132613,
      132614,
      132615,
      133601,
      133602,
      133603,
      133604,
      133605,
      133606,
      133607,
      133608,
      133609,
      133610,
      133611,
      133612,
      133613,
      133614,
      133615,
      134601,
      134602,
      134603,
      134604,
      134605,
      134606,
      134607,
      134608,
      134609,
      134610,
      134611,
      134612,
      134613,
      134614,
      134615,
      134616
    ]
  },
  {
    "id": 100251,
    "kind": "curios",
    "type": 1,
    "icon": "random_curios_03",
    "quality": 3,
    "poolIds": [
      131301,
      131302,
      131303,
      131304,
      131305,
      131306,
      131307,
      131308,
      131309,
      131310,
      131311,
      131312,
      132301,
      132302,
      132303,
      132304,
      132305,
      132306,
      132307,
      132308,
      132309,
      132310,
      132311,
      132312,
      132313,
      132314,
      132315,
      133301,
      133302,
      133303,
      133304,
      133305,
      133306,
      133307,
      133308,
      133309,
      133310,
      133311,
      133312,
      133313,
      133314,
      134301,
      134302,
      134303,
      134304,
      134305,
      134306,
      134307,
      134308,
      134309,
      134310,
      134311,
      134312,
      134313,
      134314
    ]
  },
  {
    "id": 100252,
    "kind": "curios",
    "type": 1,
    "icon": "random_curios_04",
    "quality": 4,
    "poolIds": [
      131401,
      131402,
      131403,
      131404,
      131405,
      131406,
      131407,
      131408,
      131409,
      131410,
      131411,
      131412,
      132401,
      132402,
      132403,
      132404,
      132405,
      132406,
      132407,
      132408,
      132409,
      132410,
      133401,
      133402,
      133403,
      133404,
      133405,
      133406,
      133407,
      133408,
      133409,
      133410,
      133411,
      133412,
      134401,
      134402,
      134403,
      134404,
      134405,
      134406,
      134407,
      134408,
      134409,
      134410,
      134411,
      134412
    ]
  },
  {
    "id": 100253,
    "kind": "curios",
    "type": 1,
    "icon": "random_curios_06",
    "quality": 6,
    "poolIds": [
      131601,
      131602,
      131603,
      131604,
      131605,
      131606,
      131607,
      131608,
      131609,
      131610,
      131611,
      131612,
      132601,
      132602,
      132603,
      132604,
      132605,
      132606,
      132607,
      132608,
      132609,
      132610,
      132611,
      132612,
      132613,
      132614,
      132615,
      133601,
      133602,
      133603,
      133604,
      133605,
      133606,
      133607,
      133608,
      133609,
      133610,
      133611,
      133612,
      133613,
      133614,
      133615,
      134601,
      134602,
      134603,
      134604,
      134605,
      134606,
      134607,
      134608,
      134609,
      134610,
      134611,
      134612,
      134613,
      134614,
      134615,
      134616
    ]
  },
  {
    "id": 100261,
    "kind": "curios",
    "type": 99,
    "icon": "random_curios_03",
    "quality": 3,
    "param": 1171,
    "poolIds": [
      131301,
      131302,
      131303,
      131304,
      131305,
      131306,
      131307,
      131308,
      131309,
      131310,
      131311,
      131312,
      132301,
      132302,
      132303,
      132304,
      132305,
      132306,
      132307,
      132308,
      132309,
      132310,
      132311,
      132312,
      132313,
      132314,
      132315,
      133301,
      133302,
      133303,
      133304,
      133305,
      133306,
      133307,
      133308,
      133309,
      133310,
      133311,
      133312,
      133313,
      133314,
      134301,
      134302,
      134303,
      134304,
      134305,
      134306,
      134307,
      134308,
      134309,
      134310,
      134311,
      134312,
      134313,
      134314
    ]
  },
  {
    "id": 100262,
    "kind": "curios",
    "type": 99,
    "icon": "random_curios_04",
    "quality": 4,
    "param": 1172,
    "poolIds": [
      131401,
      131402,
      131403,
      131404,
      131405,
      131406,
      131407,
      131408,
      131409,
      131410,
      131411,
      131412,
      132401,
      132402,
      132403,
      132404,
      132405,
      132406,
      132407,
      132408,
      132409,
      132410,
      133401,
      133402,
      133403,
      133404,
      133405,
      133406,
      133407,
      133408,
      133409,
      133410,
      133411,
      133412,
      134401,
      134402,
      134403,
      134404,
      134405,
      134406,
      134407,
      134408,
      134409,
      134410,
      134411,
      134412
    ]
  },
  {
    "id": 100263,
    "kind": "curios",
    "type": 99,
    "icon": "random_curios_06",
    "quality": 6,
    "param": 1173,
    "poolIds": [
      131601,
      131602,
      131603,
      131604,
      131605,
      131606,
      131607,
      131608,
      131609,
      131610,
      131611,
      131612,
      132601,
      132602,
      132603,
      132604,
      132605,
      132606,
      132607,
      132608,
      132609,
      132610,
      132611,
      132612,
      132613,
      132614,
      132615,
      133601,
      133602,
      133603,
      133604,
      133605,
      133606,
      133607,
      133608,
      133609,
      133610,
      133611,
      133612,
      133613,
      133614,
      133615,
      134601,
      134602,
      134603,
      134604,
      134605,
      134606,
      134607,
      134608,
      134609,
      134610,
      134611,
      134612,
      134613,
      134614,
      134615,
      134616
    ]
  },
  {
    "id": 100174,
    "kind": "curios",
    "type": 1,
    "icon": "random_curios_07",
    "quality": 7,
    "poolIds": [
      130601,
      130602,
      130603,
      130604,
      130605,
      130606,
      130607,
      130608,
      130609,
      130610,
      130611,
      130612,
      130613,
      130614,
      130615,
      130616,
      130617,
      130618,
      130619,
      130660,
      130661,
      130662,
      130663,
      130664,
      130701,
      130702,
      130703,
      130704,
      130705,
      130706,
      130707,
      130708,
      130710,
      130711,
      130712,
      130713,
      130714,
      130715,
      130716,
      130717,
      130718,
      130719,
      130720,
      130721,
      130722,
      130723,
      130724,
      130725,
      130726,
      130727,
      130728,
      130729,
      130730,
      130731,
      130732,
      130733,
      130734,
      130735,
      130736,
      130737,
      130738,
      130739,
      130740,
      130741,
      130742,
      130743,
      130744,
      130745,
      130746,
      130747,
      130748,
      130749,
      130750,
      130751,
      130752,
      130753,
      130754,
      130755,
      130756,
      130757,
      130758,
      130759,
      130760,
      130761,
      130762,
      130763,
      130764,
      130765,
      130766,
      130767,
      130768,
      130769,
      130770,
      130771,
      130772,
      130773,
      130774,
      130775,
      130776,
      130777
    ]
  },
  {
    "id": 100184,
    "kind": "curios",
    "type": 99,
    "icon": "random_curios_07",
    "quality": 7,
    "param": 1104,
    "poolIds": [
      130601,
      130602,
      130603,
      130604,
      130605,
      130606,
      130607,
      130608,
      130609,
      130610,
      130611,
      130612,
      130613,
      130614,
      130615,
      130616,
      130617,
      130618,
      130619,
      130660,
      130661,
      130662,
      130663,
      130664,
      130701,
      130702,
      130703,
      130704,
      130705,
      130706,
      130707,
      130708,
      130710,
      130711,
      130712,
      130713,
      130714,
      130715,
      130716,
      130717,
      130718,
      130719,
      130720,
      130721,
      130722,
      130723,
      130724,
      130725,
      130726,
      130727,
      130728,
      130729,
      130730,
      130731,
      130732,
      130733,
      130734,
      130735,
      130736,
      130737,
      130738,
      130739,
      130740,
      130741,
      130742,
      130743,
      130744,
      130745,
      130746,
      130747,
      130748,
      130749,
      130750,
      130751,
      130752,
      130753,
      130754,
      130755,
      130756,
      130757,
      130758,
      130759,
      130760,
      130761,
      130762,
      130763,
      130764,
      130765,
      130766,
      130767,
      130768,
      130769,
      130770,
      130771,
      130772,
      130773,
      130774,
      130775,
      130776,
      130777
    ]
  },
  {
    "id": 406,
    "kind": "fixed",
    "type": 99,
    "icon": "icon_406",
    "quality": 5,
    "param": 406,
    "rewards": [
      {
        "id": 401,
        "count": 4
      },
      {
        "id": 402,
        "count": 4
      },
      {
        "id": 403,
        "count": 3
      }
    ],
    "targetAssets": [
      {
        "id": 401,
        "type": 1,
        "quality": 4,
        "icon": "icon_401"
      },
      {
        "id": 402,
        "type": 1,
        "quality": 4,
        "icon": "icon_402"
      },
      {
        "id": 403,
        "type": 1,
        "quality": 4,
        "icon": "icon_403"
      }
    ],
    "poolIds": [
      401,
      402,
      403
    ]
  },
  {
    "id": 408,
    "kind": "fixed",
    "type": 99,
    "icon": "icon_408",
    "quality": 6,
    "param": 408,
    "rewards": [
      {
        "id": 401,
        "count": 8
      },
      {
        "id": 402,
        "count": 8
      },
      {
        "id": 403,
        "count": 6
      },
      {
        "id": 404,
        "count": 2
      }
    ],
    "targetAssets": [
      {
        "id": 401,
        "type": 1,
        "quality": 4,
        "icon": "icon_401"
      },
      {
        "id": 402,
        "type": 1,
        "quality": 4,
        "icon": "icon_402"
      },
      {
        "id": 403,
        "type": 1,
        "quality": 4,
        "icon": "icon_403"
      },
      {
        "id": 404,
        "type": 1,
        "quality": 4,
        "icon": "icon_404"
      }
    ],
    "poolIds": [
      401,
      402,
      403,
      404
    ]
  },
  {
    "id": 432,
    "kind": "fixed",
    "type": 99,
    "icon": "icon_432",
    "quality": 5,
    "param": 432,
    "rewards": [
      {
        "id": 427,
        "count": 4
      },
      {
        "id": 428,
        "count": 4
      },
      {
        "id": 429,
        "count": 3
      }
    ],
    "targetAssets": [
      {
        "id": 427,
        "type": 1,
        "quality": 4,
        "icon": "icon_427"
      },
      {
        "id": 428,
        "type": 1,
        "quality": 4,
        "icon": "icon_428"
      },
      {
        "id": 429,
        "type": 1,
        "quality": 4,
        "icon": "icon_429"
      }
    ],
    "poolIds": [
      427,
      428,
      429
    ]
  },
  {
    "id": 434,
    "kind": "fixed",
    "type": 99,
    "icon": "icon_434",
    "quality": 6,
    "param": 434,
    "rewards": [
      {
        "id": 427,
        "count": 8
      },
      {
        "id": 428,
        "count": 8
      },
      {
        "id": 429,
        "count": 6
      },
      {
        "id": 430,
        "count": 2
      }
    ],
    "targetAssets": [
      {
        "id": 427,
        "type": 1,
        "quality": 4,
        "icon": "icon_427"
      },
      {
        "id": 428,
        "type": 1,
        "quality": 4,
        "icon": "icon_428"
      },
      {
        "id": 429,
        "type": 1,
        "quality": 4,
        "icon": "icon_429"
      },
      {
        "id": 430,
        "type": 1,
        "quality": 4,
        "icon": "icon_430"
      }
    ],
    "poolIds": [
      427,
      428,
      429,
      430
    ]
  },
  {
    "id": 444,
    "kind": "fixed",
    "type": 99,
    "icon": "icon_444",
    "quality": 5,
    "param": 435,
    "rewards": [
      {
        "id": 439,
        "count": 4
      },
      {
        "id": 440,
        "count": 4
      },
      {
        "id": 441,
        "count": 3
      }
    ],
    "targetAssets": [
      {
        "id": 439,
        "type": 1,
        "quality": 4,
        "icon": "icon_439"
      },
      {
        "id": 440,
        "type": 1,
        "quality": 4,
        "icon": "icon_440"
      },
      {
        "id": 441,
        "type": 1,
        "quality": 4,
        "icon": "icon_441"
      }
    ],
    "poolIds": [
      439,
      440,
      441
    ]
  },
  {
    "id": 446,
    "kind": "fixed",
    "type": 99,
    "icon": "icon_446",
    "quality": 6,
    "param": 437,
    "rewards": [
      {
        "id": 439,
        "count": 8
      },
      {
        "id": 440,
        "count": 8
      },
      {
        "id": 441,
        "count": 6
      },
      {
        "id": 442,
        "count": 2
      }
    ],
    "targetAssets": [
      {
        "id": 439,
        "type": 1,
        "quality": 4,
        "icon": "icon_439"
      },
      {
        "id": 440,
        "type": 1,
        "quality": 4,
        "icon": "icon_440"
      },
      {
        "id": 441,
        "type": 1,
        "quality": 4,
        "icon": "icon_441"
      },
      {
        "id": 442,
        "type": 1,
        "quality": 4,
        "icon": "icon_442"
      }
    ],
    "poolIds": [
      439,
      440,
      441,
      442
    ]
  }
].map(Object.freeze));
const VERIFIED_BOXES = new Map(VERIFIED_BOX_DEFINITIONS.map(row => [row.id, row]));
function isVerifiedBox(itemId) { return VERIFIED_BOXES.has(Number(itemId)); }
function getVerifiedBoxPool(itemId) {
  const def = VERIFIED_BOXES.get(Number(itemId));
  if (!def) return null;
  const assets = config.get('AssetsConfig') || {};
  const source = assets[def.id];
  if (!source || source.id !== def.id || source.type !== def.type || source.quality !== def.quality
    || source.icon !== def.icon || source.param !== def.param) return null;
  const sourceUse = (config.get('AssetsUseConfig') || {})[def.id];
  if (def.type === 1 && (!sourceUse || sourceUse.type !== 102)) return null;
  if(def.kind === 'fixed') {
    if(def.targetAssets.some(expected=>{const actual=assets[expected.id];return !actual||Object.keys(expected).some(key=>actual[key]!==expected[key]);})) return null;
    return def.poolIds.slice();
  }
  const tables = { orb:'OrbConfig', connect:'ValhallaFormationConnectItemConfig', elf:'ElfConfig', elfPiece:'ElfConfig', curios:'CuriosConfig' };
  let rows;
  if (def.kind === 'artifactSoul') {
    rows = Object.values(config.get('ArtifactConfig') || {}).filter(row => row.type === 2 && row.quality === def.quality
      && assets[row.id]?.type === 16 && assets[row.id]?.quality === def.quality);
  } else {
    rows = Object.values(config.get(tables[def.kind]) || {}).filter(row => {
      const asset = assets[row.id];
      if (!asset || asset.quality !== def.quality) return false;
      if (def.kind === 'connect') return row.level === def.level && asset.type === 38;
      if (def.kind === 'orb') return asset.type === 32;
      if (def.kind === 'curios') return row.quality === def.quality && (def.materialType === undefined || row.materialType === def.materialType) && asset.type === 24;
      return row.quality === def.quality && asset.type === 29;
    });
  }
  const ids = rows.map(row => def.kind === 'elfPiece' ? row.piece && row.piece.id : row.id);
  if (!ids.length || ids.some(id => !Number.isSafeInteger(id) || !assets[id]
    || assets[id].quality !== def.quality || (def.kind === 'elfPiece' && assets[id].type !== 1))) return null;
  const sorted = [...new Set(ids)].sort((a,b)=>a-b);
  if (sorted.length !== def.poolIds.length || sorted.some((id,index)=>id!==def.poolIds[index])) return null;
  return sorted;
}
function resolveVerifiedBox(itemId,count) {
  if (!Number.isSafeInteger(count) || count <= 0 || count > 10000) return null;
  const pool=getVerifiedBoxPool(itemId);
  if (!pool) return null;
  const def=VERIFIED_BOXES.get(Number(itemId));
  if(def.kind === 'fixed') return {rows:def.rewards.map(row=>({id:row.id,count:row.count*count}))};
  const merged=new Map();
  for(let i=0;i<count;i++) {
    const id=pool[Math.floor(Math.random()*pool.length)];
    merged.set(id,(merged.get(id)||0)+1);
  }
  return { rows:[...merged].map(([id,count])=>({id,count})) };
}


// Custom compatibility pools for the 63 type-102 boxes that had no server
// reward contract. These choices are intentionally equal-weight and use only
// IDs present in the current runtime catalog. They are not claimed CN weights.
const customItem = (id, count = 1, extra = {}) => ({ kind: 'item', id, count, ...extra });
const customPool = (kind, options = {}) => ({ kind, ...options });
const titleChoices = (titleId) => [
  customItem(titleId, 1),
  customItem(1, 10),
  customItem(2, 10),
  customItem(65, 5),
  customItem(55, 5),
];

const CUSTOM_BOX_DEFINITIONS = Object.freeze([
  { id: 412, icon: 'icon_412', quality: 5, mode: 'pick',
    choices: [
      customItem(2, 2000), customItem(1, 20), customItem(6, 2), customItem(62, 1),
      customPool('elfPiece', { qualities: [4] }),
      customPool('artifact', { type: 1, qualities: [4] }),
    ] },
  { id: 413, icon: 'icon_413', quality: 6, mode: 'pick',
    choices: [
      customItem(2, 10000), customItem(1, 100), customItem(6, 10),
      customPool('elfPiece', { qualities: [4, 6] }),
      customItem(81, 1), customPool('artifact', { type: 1, qualities: [6] }),
    ] },
  { id: 94301, icon: 'icon_bag1', quality: 5, mode: 'pick',
    choices: [customItem(119, 30), customItem(119, 60), customItem(119, 90)] },
  { id: 94401, icon: 'icon_box22', quality: 7, mode: 'pick',
    choices: [customItem(118, 1), customItem(6, 5), customItem(21, 10), customItem(62, 1), customItem(55, 10)] },
  { id: 94416, icon: 'icon_94416', quality: 6, mode: 'pick',
    choices: [
      customItem(1, 60), customItem(4, 40), customItem(6, 3), customItem(65, 12), customItem(55, 6),
      customItem(1, 120), customItem(4, 80), customItem(6, 6), customItem(65, 24), customItem(55, 12),
    ] },
  { id: 94418, icon: 'icon_94418', quality: 6, mode: 'pick',
    choices: [customItem(1, 588), customItem(1, 388), customItem(1, 288), customItem(1, 188), customItem(1, 128)] },
  { id: 94419, icon: 'icon_94419', quality: 6, mode: 'pick',
    choices: [customItem(65, 128), customItem(65, 88), customItem(65, 68), customItem(65, 48), customItem(65, 28)] },
  { id: 94420, icon: 'icon_94420', quality: 6, mode: 'pick',
    choices: [customItem(6, 30), customItem(6, 20), customItem(6, 15), customItem(6, 10), customItem(6, 5)] },
  { id: 94421, icon: 'icon_94421', quality: 6, mode: 'pick',
    choices: [customItem(4, 388), customItem(4, 288), customItem(4, 188), customItem(4, 128), customItem(4, 88)] },
  { id: 94422, icon: 'icon_94422', quality: 6, mode: 'pick',
    choices: [customItem(2, 88888), customItem(2, 58888), customItem(2, 28888), customItem(2, 18888), customItem(2, 8888)] },
  { id: 94515, icon: 'random_specSpiritRefine_17', quality: 7, mode: 'pick',
    choices: [customItem(469, 1), customItem(468, 1)] },
  { id: 94701, icon: 'icon_bag6', quality: 6, mode: 'pick', choices: titleChoices(11215) },
  { id: 94703, icon: 'icon_bag7', quality: 6, mode: 'pick', choices: titleChoices(11234) },
  { id: 94705, icon: 'icon_bag8', quality: 6, mode: 'pick', choices: titleChoices(11236) },
  { id: 94706, icon: 'icon_bag9', quality: 6, mode: 'pick', choices: titleChoices(11252) },
  { id: 94708, icon: 'icon_bag10', quality: 6, mode: 'pick', choices: titleChoices(11255) },
  { id: 94711, icon: 'icon_bag13', quality: 6, mode: 'pick', choices: titleChoices(11256) },
  { id: 94713, icon: 'icon_bag15', quality: 6, mode: 'pick', choices: titleChoices(11274) },
  { id: 94715, icon: 'icon_bag16', quality: 6, mode: 'pick', choices: titleChoices(11277) },
  { id: 94718, icon: 'icon_bag17', quality: 6, mode: 'pick', choices: titleChoices(11279) },
  { id: 94721, icon: 'icon_bag18', quality: 6, mode: 'pick', choices: titleChoices(11282) },
  { id: 94724, icon: 'icon_bag20', quality: 6, mode: 'pick', choices: titleChoices(11283) },
  { id: 94726, icon: 'icon_bag21', quality: 6, mode: 'pick', choices: titleChoices(11287) },
  { id: 94729, icon: 'icon_bag22', quality: 6, mode: 'pick', choices: titleChoices(11289) },
  { id: 94709, icon: 'icon_bag11', quality: 6, mode: 'pick',
    choices: [customItem(2, 200000), customItem(2, 100000), customItem(2, 60000), customItem(2, 40000), customItem(2, 20000)] },
  { id: 94719, icon: 'icon_94719', quality: 6, mode: 'pick',
    choices: [customItem(2, 20000), customItem(2, 18000), customItem(2, 15000), customItem(2, 12000), customItem(2, 10000)] },
  { id: 94725, icon: 'icon_94725', quality: 5, mode: 'pick',
    choices: [customItem(2, 50000), customItem(2, 20000), customItem(2, 10000), customItem(2, 8000), customItem(2, 5000)] },
  { id: 94801, icon: 'icon_box26', quality: 6, mode: 'pick',
    choices: [customItem(1, 15), customItem(4, 10), customItem(6, 2), customItem(62, 1), customItem(24, 1), customItem(25, 1), customItem(26, 1)] },
  { id: 94802, icon: 'icon_94802', quality: 6, mode: 'pick',
    choices: [
      customItem(205, 10), customItem(205, 20), customItem(206, 1), customItem(206, 2),
      customItem(199, 1), customPool('orb', { qualities: [6] }), customPool('orb', { qualities: [7] }),
    ] },
  { id: 94902, icon: 'random_curiosPiece_140700', quality: 7, mode: 'pick',
    choices: [customPool('curiosPiece', { ids: [140701, 140702, 140703, 140704] })] },
  { id: 94904, icon: 'random_curiosPiece_140705', quality: 7, mode: 'pick',
    choices: [customPool('curiosPiece', { ids: [140705, 140706, 140707, 140708] })] },
  { id: 94908, icon: 'random_curiosPiece_140718', quality: 7, mode: 'pick',
    choices: [customPool('curiosPiece', { ids: [140718, 140719, 140720, 140721] })] },
  { id: 94911, icon: 'random_curiosPiece_140726', quality: 7, mode: 'pick',
    choices: [customPool('curiosPiece', { ids: [140726, 140727, 140728, 140729] })] },
  { id: 94923, icon: 'random_curiosPiece_140730', quality: 7, mode: 'pick',
    choices: [customPool('curiosPiece', { ids: [140730, 140731, 140732, 140733] })] },
  { id: 94926, icon: 'random_curiosPiece_140738', quality: 7, mode: 'pick',
    choices: [customPool('curiosPiece', { ids: [140738, 140739, 140740, 140741] })] },
  { id: 94929, icon: 'random_curiosPiece_140742', quality: 7, mode: 'pick',
    choices: [customPool('curiosPiece', { ids: [140742, 140743, 140744, 140745] })] },
  { id: 94932, icon: 'random_curiosPiece_140750', quality: 7, mode: 'pick',
    choices: [customPool('curiosPiece', { ids: [140750, 140751, 140752, 140753] })] },
  { id: 94935, icon: 'random_curiosPiece_140758', quality: 7, mode: 'pick',
    choices: [customPool('curiosPiece', { ids: [140758, 140759, 140760, 140761] })] },
  { id: 94938, icon: 'random_curiosPiece_140766', quality: 7, mode: 'pick',
    choices: [customPool('curiosPiece', { ids: [140766, 140767, 140768, 140769] })] },
  { id: 94941, icon: 'random_curiosPiece_140770', quality: 7, mode: 'pick',
    choices: [customPool('curiosPiece', { ids: [140770, 140771, 140772, 140773] })] },
  { id: 100020, icon: 'random_elfPiece_01', quality: 5, mode: 'pick',
    choices: [customPool('elfPiece', { qualities: [4] })] },
  { id: 100021, icon: 'random_elfPiece_02', quality: 2, mode: 'pick',
    choices: [customPool('elfPiece', { qualities: [4] })] },
  { id: 100022, icon: 'random_elfPiece_03', quality: 3, mode: 'pick',
    choices: [customPool('elfPiece', { qualities: [4] })] },
  { id: 100026, icon: 'random_elfPiece_01', quality: 6, mode: 'pick',
    choices: [customPool('elfPiece', { qualities: [6] })] },
  { id: 100030, icon: 'random_elf_01', quality: 5, mode: 'pick',
    choices: [customPool('elf', { qualities: [4] })] },
  { id: 100031, icon: 'random_elf_02', quality: 2, mode: 'pick',
    choices: [customPool('elf', { qualities: [4] })] },
  { id: 100032, icon: 'random_elf_03', quality: 3, mode: 'pick',
    choices: [customPool('elf', { qualities: [4] })] },
  { id: 100036, icon: 'random_elf_01', quality: 6, mode: 'pick',
    choices: [customPool('elf', { qualities: [6] })] },
  { id: 100040, icon: 'random_artifact_01', quality: 5, mode: 'pick',
    choices: [customPool('artifact', { type: 1, qualities: [4] })] },
  { id: 100060, icon: 'random_artifactSoul_01', quality: 5, mode: 'pick',
    choices: [customPool('artifact', { type: 2, qualities: [4] })] },
  { id: 100139, icon: 'random_bloodlinePiece_01', quality: 5, mode: 'pick',
    choices: [customItem(100133, 1)] },
  { id: 100160, icon: 'random_curiosPiece_01', quality: 5, mode: 'pick',
    choices: [customPool('curiosPiece', { qualities: [4] })] },
  { id: 100170, icon: 'random_curios_shop1_01', quality: 5, mode: 'pick',
    choices: [customPool('curios', { materialTypes: [1], qualities: [4] })] },
  { id: 100185, icon: 'random_curiosPiece_shop1_01', quality: 5, mode: 'pick',
    choices: [customPool('curiosPiece', { materialTypes: [1], qualities: [4] })] },
  { id: 100190, icon: 'random_curiosPiece_shop2_01', quality: 5, mode: 'pick',
    choices: [customPool('curiosPiece', { materialTypes: [2], qualities: [4] })] },
  { id: 100200, icon: 'random_curios_shop2_01', quality: 5, mode: 'pick',
    choices: [customPool('curios', { materialTypes: [2], qualities: [4] })] },
  { id: 100230, icon: 'random_curios_01', quality: 5, mode: 'pick',
    choices: [customPool('curios', { qualities: [4] })] },
  { id: 100250, icon: 'random_curios_01', quality: 5, mode: 'pick',
    choices: [customPool('curios', { qualities: [4] })] },
  // Visible legacy wrappers with no AssetsUseConfig row. The CN catalog only
  // identifies their quality/pool; use equal-weight choices from the live
  // catalog so the item remains usable without inventing unavailable IDs.
  { id: 474, type: 99, param: 474, icon: 'random_bid_07', quality: 7, mode: 'pick',
    allowNoUse: true, choices: [customPool('bidItem', { qualities: [7] })] },
  { id: 475, type: 99, param: 475, icon: 'random_bid_06', quality: 6, mode: 'pick',
    allowNoUse: true, choices: [customPool('bidItem', { qualities: [6] })] },
  { id: 476, type: 99, param: 476, icon: 'random_bid_04', quality: 4, mode: 'pick',
    allowNoUse: true, choices: [customPool('bidItem', { qualities: [4] })] },
  { id: 477, type: 99, param: 477, icon: 'random_bid_03', quality: 3, mode: 'pick',
    allowNoUse: true, choices: [customPool('bidItem', { qualities: [3] })] },
  { id: 478, type: 99, param: 478, icon: 'random_bid_02', quality: 2, mode: 'pick',
    allowNoUse: true, choices: [customPool('bidItem', { qualities: [2] })] },
  { id: 479, type: 99, param: 479, icon: 'random_bid_01', quality: 1, mode: 'pick',
    allowNoUse: true, choices: [customPool('bidItem', { qualities: [1] })] },
  { id: 100050, type: 99, param: 1050, icon: 'random_artifact_01', quality: 5, mode: 'pick',
    allowNoUse: true, choices: [customPool('artifact', { type: 1, qualities: [4] })] },
  { id: 100070, type: 99, param: 1060, icon: 'random_artifactSoul_01', quality: 5, mode: 'pick',
    allowNoUse: true, choices: [customPool('artifact', { type: 2, qualities: [4] })] },
  { id: 100100, icon: 'random_valhallaPiece_01', quality: 3, mode: 'pick',
    allowNoUse: true, choices: [customPool('valhallaPiece')] },
  { id: 100161, icon: 'random_curiosPiece_03', quality: 3, mode: 'pick',
    allowNoUse: true, choices: [customPool('curiosPiece', { qualities: [3] })] },
  { id: 100162, icon: 'random_curiosPiece_04', quality: 4, mode: 'pick',
    allowNoUse: true, choices: [customPool('curiosPiece', { qualities: [4] })] },
  { id: 100163, icon: 'random_curiosPiece_06', quality: 6, mode: 'pick',
    allowNoUse: true, choices: [customPool('curiosPiece', { qualities: [6] })] },
  { id: 100164, icon: 'random_curiosPiece_07', quality: 7, mode: 'pick',
    allowNoUse: true, choices: [customPool('curiosPiece', { qualities: [7] })] },
  { id: 100180, type: 99, param: 1100, icon: 'random_curios_shop1_01', quality: 5, mode: 'pick',
    allowNoUse: true, choices: [customPool('curios', { materialTypes: [1], qualities: [4] })] },
  { id: 100186, icon: 'random_curiosPiece_shop1_03', quality: 3, mode: 'pick',
    allowNoUse: true, choices: [customPool('curiosPiece', { materialTypes: [1], qualities: [3] })] },
  { id: 100187, icon: 'random_curiosPiece_shop1_04', quality: 4, mode: 'pick',
    allowNoUse: true, choices: [customPool('curiosPiece', { materialTypes: [1], qualities: [4] })] },
  { id: 100188, icon: 'random_curiosPiece_shop1_06', quality: 6, mode: 'pick',
    allowNoUse: true, choices: [customPool('curiosPiece', { materialTypes: [1], qualities: [6] })] },
  { id: 100191, icon: 'random_curiosPiece_shop2_03', quality: 3, mode: 'pick',
    allowNoUse: true, choices: [customPool('curiosPiece', { materialTypes: [2], qualities: [3] })] },
  { id: 100192, icon: 'random_curiosPiece_shop2_04', quality: 4, mode: 'pick',
    allowNoUse: true, choices: [customPool('curiosPiece', { materialTypes: [2], qualities: [4] })] },
  { id: 100193, icon: 'random_curiosPiece_shop2_06', quality: 6, mode: 'pick',
    allowNoUse: true, choices: [customPool('curiosPiece', { materialTypes: [2], qualities: [6] })] },
  { id: 100210, type: 99, param: 1120, icon: 'random_curios_shop2_01', quality: 5, mode: 'pick',
    allowNoUse: true, choices: [customPool('curios', { materialTypes: [2], qualities: [4] })] },
  { id: 100240, type: 99, param: 1140, icon: 'random_curios_01', quality: 5, mode: 'pick',
    allowNoUse: true, choices: [customPool('curios', { qualities: [4] })] },
  { id: 100260, type: 99, param: 1170, icon: 'random_curios_01', quality: 5, mode: 'pick',
    allowNoUse: true, choices: [customPool('curios', { qualities: [4] })] },
  { id: 100651, type: 99, param: 1651, icon: 'random_homeland_02', quality: 4, mode: 'homeland',
    allowNoUse: true, duration: 1800 },
  { id: 100652, type: 99, param: 1652, icon: 'random_homeland_03', quality: 6, mode: 'homeland',
    allowNoUse: true, duration: 7200 },
  { id: 100653, type: 99, param: 1653, icon: 'random_homeland_04', quality: 7, mode: 'homeland',
    allowNoUse: true, duration: 28800 },
  { id: 100641, icon: 'random_homeland_02', quality: 4, mode: 'homeland', duration: 1800 },
  { id: 100642, icon: 'random_homeland_03', quality: 6, mode: 'homeland', duration: 7200 },
  { id: 100643, icon: 'random_homeland_04', quality: 7, mode: 'homeland', duration: 28800 },
  { id: 101000, icon: 'syt_bossKilledBox', quality: 7, mode: 'fixedPlusPick',
    fixed: [customItem(92, 20), customItem(94, 200)],
    choices: [customItem(100133, 2), customItem(100135, 1, { chance: 0.10 })] },
  { id: 101310, icon: 'icon_bag14', quality: 5, mode: 'pick',
    choices: [customItem(1, 10), customItem(1, 15), customItem(1, 20), customItem(2, 500), customItem(2, 2500), customItem(2, 5000), customItem(94709, 1)] },
].map((row) => Object.freeze(row)));

const CUSTOM_BOXES = new Map(CUSTOM_BOX_DEFINITIONS.map((row) => [row.id, row]));

function customConfigRow(tableName, id) {
  const table = config.get(tableName) || {};
  return table[id] || table[String(id)] || null;
}
function customRows(tableName) {
  return Object.values(config.get(tableName) || {}).filter((row) => row && typeof row === 'object');
}
function customSourceMatches(def) {
  const source = customConfigRow('AssetsConfig', def.id);
  const use = customConfigRow('AssetsUseConfig', def.id);
  const expectedType = def.type == null ? 1 : def.type;
  const expectedParam = def.param == null ? null : Number(def.param);
  const useMatches = use ? use.type === 102 : def.allowNoUse === true;
  return !!source && source.id === def.id && source.type === expectedType
    && source.icon === def.icon && source.quality === def.quality
    && (expectedParam == null || Number(source.param) === expectedParam)
    && useMatches;
}
function customAssetExists(id) {
  const asset = customConfigRow('AssetsConfig', id);
  return !!asset && Number(asset.id) === Number(id);
}
function customRewardExists(id) {
  if (customAssetExists(id)) return true;
  return ['FashionConfig', 'BloodlineConfig', 'SpiritConfig', 'ArtifactConfig']
    .some((tableName) => !!customConfigRow(tableName, id));
}
function customPoolIds(choice) {
  if (choice.kind === 'item') return customRewardExists(choice.id) ? [Number(choice.id)] : [];
  if (choice.kind === 'bidItem') {
    const qualities = Array.isArray(choice.qualities) ? choice.qualities.map(Number) : null;
    return customRows('BidKingItemConfig')
      .filter((row) => (!qualities || qualities.includes(Number(row.quality)))
        && customAssetExists(row.id))
      .map((row) => Number(row.id))
      .filter((id, index, list) => id > 0 && list.indexOf(id) === index);
  }
  if (choice.kind === 'valhallaPiece') {
    return customRows('AssetsConfig')
      .filter((row) => row.type === 1 && /^random_valhallaPiece_0[3-7]$/.test(String(row.icon))
        && customAssetExists(row.id))
      .map((row) => Number(row.id))
      .filter((id, index, list) => id > 0 && list.indexOf(id) === index);
  }
  if (choice.kind === 'curiosPiece' && Array.isArray(choice.ids)) {
    return choice.ids.filter((id) => customAssetExists(id));
  }
  const qualities = Array.isArray(choice.qualities) ? choice.qualities.map(Number) : null;
  const materialTypes = Array.isArray(choice.materialTypes) ? choice.materialTypes.map(Number) : null;
  if (choice.kind === 'elf' || choice.kind === 'elfPiece') {
    const rows = customRows('ElfConfig').filter((row) => {
      if (qualities && !qualities.includes(Number(row.quality))) return false;
      if (choice.kind === 'elfPiece' && (!row.piece || !customAssetExists(row.piece.id))) return false;
      return choice.kind === 'elf' ? customAssetExists(row.id) : true;
    });
    return rows.map((row) => choice.kind === 'elfPiece' ? Number(row.piece.id) : Number(row.id))
      .filter((id, index, list) => id > 0 && list.indexOf(id) === index);
  }
  if (choice.kind === 'artifact') {
    return customRows('ArtifactConfig')
      .filter((row) => (!qualities || qualities.includes(Number(row.quality)))
        && (choice.type == null || Number(row.type) === Number(choice.type))
        && customAssetExists(row.id))
      .map((row) => Number(row.id));
  }
  if (choice.kind === 'orb') {
    return customRows('OrbConfig')
      .filter((row) => {
        const asset = customConfigRow('AssetsConfig', row.id);
        return asset && (!qualities || qualities.includes(Number(asset.quality)));
      })
      .map((row) => Number(row.id));
  }
  if (choice.kind === 'curios' || choice.kind === 'curiosPiece') {
    return customRows('CuriosConfig')
      .filter((row) => (!qualities || qualities.includes(Number(row.quality)))
        && (!materialTypes || materialTypes.includes(Number(row.materialType)))
        && customAssetExists(choice.kind === 'curiosPiece' ? row.pieceID : row.id))
      .map((row) => Number(choice.kind === 'curiosPiece' ? row.pieceID : row.id))
      .filter((id, index, list) => id > 0 && list.indexOf(id) === index);
  }
  return [];
}
function customHomelandRow(player, duration) {
  const table = config.get('HomelandBuildngResourceConfig') || config.get('HomelandBuildingResourceConfig') || {};
  const groups = Object.values(table).filter((group) => group && typeof group === 'object'
    && Object.values(group).some((row) => row && row.id && row.material));
  if (!groups.length) return null;
  const group = groups[Math.floor(Math.random() * groups.length)];
  const buildingId = Number((group['1'] || Object.values(group)[0]).id);
  const level = Number(player?.homelandInfo?.buildingLv?.[buildingId]
    || player?.homelandInfo?.buildingLevel?.[buildingId] || 1);
  const row = group[String(level)] || group[level] || group['1'];
  if (!row || !row.material || !customAssetExists(row.material.id)) return null;
  const cycles = Math.max(1, Math.floor(Number(duration) / 300));
  return { id: Number(row.material.id), count: Math.max(1, Number(row.material.count) * cycles) };
}
function customChoiceRow(player, choice) {
  if (choice.chance != null && Math.random() >= Number(choice.chance)) return null;
  if (choice.kind === 'homeland') return customHomelandRow(player, choice.duration);
  const ids = customPoolIds(choice);
  if (!ids.length) return null;
  const id = ids[Math.floor(Math.random() * ids.length)];
  return { id, count: Math.max(1, Number(choice.count) || 1) };
}
function mergeCustomRow(merged, row) {
  if (!row || !Number.isSafeInteger(Number(row.id)) || Number(row.id) <= 0) return;
  const id = Number(row.id); const count = Math.max(0, Math.floor(Number(row.count) || 0));
  if (count > 0) merged.set(id, (merged.get(id) || 0) + count);
}
function resolveCustomBox(player, itemId, count) {
  if (!Number.isSafeInteger(count) || count <= 0 || count > 10000) return null;
  const def = CUSTOM_BOXES.get(Number(itemId));
  if (!def || !customSourceMatches(def)) return null;
  const merged = new Map();
  if (def.mode === 'fixedPlusPick') {
    for (const row of def.fixed || []) mergeCustomRow(merged, { id: row.id, count: row.count * count });
    for (let index = 0; index < count; index += 1) {
      for (const choice of def.choices || []) mergeCustomRow(merged, customChoiceRow(player, choice));
    }
  } else if (def.mode === 'homeland') {
    for (let index = 0; index < count; index += 1) mergeCustomRow(merged, customHomelandRow(player, def.duration));
  } else {
    for (let index = 0; index < count; index += 1) mergeCustomRow(merged, customChoiceRow(player, def.choices[Math.floor(Math.random() * def.choices.length)]));
  }
  const rows = Array.from(merged.entries()).map(([id, rewardCount]) => ({ id, count: rewardCount }));
  return rows.length > 0 ? { rows } : null;
}
function isCustomBox(itemId) { return CUSTOM_BOXES.has(Number(itemId)); }
function getCustomBoxPool(itemId) {
  const def = CUSTOM_BOXES.get(Number(itemId));
  if (!def || !customSourceMatches(def)) return null;
  if (def.mode === 'homeland') return [220, 221, 222, 223].filter(customAssetExists);
  return [...new Set((def.choices || []).flatMap(customPoolIds))];
}

// The CN catalog keeps 90021/90022 as type-101 selection items but ships an
// empty rewards array. Rebuild their choices from the currently valid quality-4
// ElfConfig rows; the item handler uses the same resolver for server validation.
const CUSTOM_SELECTION_DEFINITIONS = Object.freeze([
  { id: 90021, icon: 'select_elfPiece_02', quality: 2, fallbackQuality: 4 },
  { id: 90022, icon: 'select_elfPiece_03', quality: 3, fallbackQuality: 4 },
]);
function getCustomSelectionRewards(itemId) {
  const def = CUSTOM_SELECTION_DEFINITIONS.find((row) => row.id === Number(itemId));
  if (!def) return null;
  const source = customConfigRow('AssetsConfig', def.id);
  const use = customConfigRow('AssetsUseConfig', def.id);
  if (!source || source.id !== def.id || source.type !== 1 || source.icon !== def.icon
    || source.quality !== def.quality || !use || use.type !== 101) return null;
  const ids = customPoolIds({ kind: 'elfPiece', qualities: [def.fallbackQuality] });
  return ids.length ? ids.map((id) => ({ id, count: 1 })) : null;
}

function resolveRandomRewardRows(player, itemId, count = 1) {
  const customPlan = resolveCustomBox(player, itemId, count);
  if (customPlan) return customPlan;
  if (isVerifiedBox(itemId)) return resolveVerifiedBox(itemId, count);
  const petSoulPlan = resolvePetSoulRandomBox(itemId, count);
  if (petSoulPlan) return petSoulPlan;
  if (itemId === 100019 && Number.isSafeInteger(count) && count > 0) {
    const asset = (config.get('AssetsConfig') || {})[itemId];
    const pet = (config.get('PetConfig') || {})[85401];
    if (asset?.icon === 'icon_85401' && asset.quality === 5 && pet?.quality === 5 && pet.appearId === 85401) {
      return { rows: [{ id: 85401, count }] };
    }
    return null;
  }
  const fixed = FIXED_GEMS[itemId];
  if (!fixed || !Number.isSafeInteger(count) || count <= 0) return null;
  const assets = config.get('AssetsConfig') || {};
  const gems = config.get('GemLevelConfig') || {};
  const source = assets[itemId];
  const target = assets[fixed.id];
  const gem = gems[fixed.id];
  if (!source || !target || !gem || source.icon !== target.icon
    || source.quality !== target.quality || gem.level !== fixed.level || gem.type !== fixed.type) return null;
  return { rows: [{ id: fixed.id, count }] };
}

module.exports = {
  resolveRandomRewardRows, getGemPackLevel, getGemRewardIdsByLevel,
  isVerifiedBox, getVerifiedBoxPool, VERIFIED_BOX_DEFINITIONS,
  isCustomBox, getCustomBoxPool, CUSTOM_BOX_DEFINITIONS,
  getCustomSelectionRewards, CUSTOM_SELECTION_DEFINITIONS,
};





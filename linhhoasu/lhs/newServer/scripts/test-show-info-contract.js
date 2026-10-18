#!/usr/bin/env node

const assert = require('assert/strict');
const config = require('../src/services/ConfigService');
const {
  normalizeOutboundPayload,
  normalizeShowInfo,
} = require('../src/services/RoleAppearanceService');

function getRoleRow(row) {
  const roleCfg = config.get('RoleGenderConfig') || {};
  return roleCfg[String(row.kungfuId)] && roleCfg[String(row.kungfuId)][String(row.subJob)];
}

function assertShowRow(row, label) {
  assert.ok(row && typeof row === 'object' && !Array.isArray(row), `${label}: object required`);
  assert.ok(getRoleRow(row), `${label}: invalid role ${row.kungfuId}/${row.subJob}`);
  assert.ok(row.fashionMap && typeof row.fashionMap === 'object', `${label}: fashionMap required`);
  assert.ok(row.equipMap && typeof row.equipMap === 'object', `${label}: equipMap required`);
  assert.ok(Number.isInteger(row.avatar) && row.avatar >= 0, `${label}: avatar required`);
  assert.ok(Number.isInteger(row.avatarFrame), `${label}: avatarFrame required`);
  assert.ok(Number.isInteger(row.title), `${label}: title required`);
}

function run() {
  const stats = { normalizedRows: 0, roleFallbacks: 0 };
  const invalid = normalizeShowInfo({
    dbid: 'broken',
    name: 'Broken row',
    kungfuId: 7,
    subJob: 99,
    avatar: 11300,
  }, {}, stats);
  assertShowRow(invalid, 'direct invalid row');
  assert.notEqual(invalid.kungfuId, 7, 'invalid kungfu 7 must be replaced');
  assert.notEqual(invalid.avatar, 11300, 'missing avatar 11300 must be replaced');

  const payload = normalizeOutboundPayload({
    rankList: [
      { dbid: 'rank-1', name: 'Rank row', avatar: 11302, score: 100 },
    ],
    topMap: {
      1: { dbid: 'top-1', name: 'Top row', kungfuId: 7, subJob: 0 },
    },
    entitys: [
      {
        type: 1,
        showInfo: { dbid: 'fight-1', name: 'Fight row', kungfuId: 999, subJob: 4 },
      },
    ],
    nested: {
      mapPlayer: {
        dbid: 'map-1',
        name: 'Map row',
        kungfuId: 4,
        subJob: 0,
      },
    },
    items: [{ id: 11300, count: 1 }],
  }, stats);

  assertShowRow(payload.rankList[0], 'rankList');
  assertShowRow(payload.topMap[1], 'topMap');
  assertShowRow(payload.entitys[0].showInfo, 'fight showInfo');
  assertShowRow(payload.nested.mapPlayer, 'mapPlayer');
  assert.deepEqual(payload.items, [{ id: 11300, count: 1 }], 'item rows must not be modified');
  assert.ok(stats.normalizedRows >= 4, 'normalizer stats must record repaired rows');
  assert.ok(stats.roleFallbacks >= 2, 'role fallback stats must record invalid roles');

  console.log('show-info contract: PASS');
  console.log(JSON.stringify(stats));
}

run();

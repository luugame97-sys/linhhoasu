const assert = require('assert/strict');

const config = require('../../linhhoasu/lhs/newServer/src/services/ConfigService');
const mongo = require('../../linhhoasu/lhs/newServer/src/db/mongo');
const playerService = require('../../linhhoasu/lhs/newServer/src/services/PlayerService');
const basic = require('../../linhhoasu/lhs/newServer/src/handlers/basic');
const raid = require('../../linhhoasu/lhs/newServer/src/handlers/raid');
const { normalizeOutboundPayload } = require('../../linhhoasu/lhs/newServer/src/services/RoleAppearanceService');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function roleRow(show) {
  const map = config.get('RoleGenderConfig') || {};
  const group = map[String(show.kungfuId)] || {};
  return group[String(show.subJob)] || null;
}

function assertShow(show, label) {
  assert.ok(show && typeof show === 'object', `${label}: object`);
  assert.ok(roleRow(show), `${label}: valid role ${show.kungfuId}/${show.subJob}`);
  assert.ok(show.fashionMap && typeof show.fashionMap === 'object', `${label}: fashionMap`);
  assert.ok(show.equipMap && typeof show.equipMap === 'object', `${label}: equipMap`);
}

function inspect(value, label) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) return value.forEach((row, index) => inspect(row, `${label}[${index}]`));
  if (value.showInfo && typeof value.showInfo === 'object') assertShow(value.showInfo, `${label}.showInfo`);
  if (value.selfInfo && typeof value.selfInfo === 'object') assertShow(value.selfInfo.showInfo || value.selfInfo, `${label}.selfInfo`);
  for (const key of ['rankList', 'ranklist', 'topList', 'toplist', 'challengeList', 'challengelist']) {
    if (Array.isArray(value[key])) value[key].forEach((row, index) => { if (row && typeof row === 'object' && ('name' in row || 'dbid' in row)) assertShow(row, `${label}.${key}[${index}]`); });
  }
  if (value.entitys && Array.isArray(value.entitys)) value.entitys.forEach((row, index) => inspect(row, `${label}.entitys[${index}]`));
}

async function run() {
  await mongo.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lhs_s1001');
  const loaded = await playerService.loadPlayer(process.env.TEST_USER_ID || 'u_Wk_1001_5d3eaa_1787791748253');
  assert.ok(loaded, 'test player must exist');
  const session = { userId: '', player: clone(loaded), _mapEnterSeen: false, _mapId: 0, _mapLine: 0, _mapPos: null };
  const mapResult = basic.handleEnterMap({}, session, 101);
  inspect(normalizeOutboundPayload(mapResult), 'map');
  const levelId = Number(session.player.raidInfo && session.player.raidInfo.level) || 1;
  const raidResult = await raid.handleStartFight({ type: 1, levelId }, session, 102);
  inspect(normalizeOutboundPayload(raidResult), 'raid');
  const stats = {};
  const malformed = normalizeOutboundPayload({ entitys: [{ showInfo: { dbid: 'bad', name: 'bad', kungfuId: 7, subJob: 99 } }] }, stats);
  assertShow(malformed.entitys[0].showInfo, 'malformed fallback');
  assert.notEqual(malformed.entitys[0].showInfo.kungfuId, 7);
  console.log(JSON.stringify({ ok: true, levelId, stats, mapPackets: Array.isArray(mapResult) ? mapResult.length : 1, raidPackets: Array.isArray(raidResult) ? raidResult.length : 1 }));
  await mongo.disconnect();
}

run().catch((err) => { console.error(err.stack || err); process.exit(1); });

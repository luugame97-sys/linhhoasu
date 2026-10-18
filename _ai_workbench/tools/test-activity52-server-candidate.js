'use strict';

// RAM-only Activity52 candidate contract test.  It never opens a DB session,
// sends a network request, or writes a file.  The candidate handler is kept
// beside the production handler so its relative service imports are identical.
const assert = require('node:assert/strict');
const configService = require('../../linhhoasu/lhs/newServer/src/services/ConfigService');
const playerService = require('../../linhhoasu/lhs/newServer/src/services/PlayerService');
const activity = require('../../linhhoasu/lhs/newServer/src/handlers/activity.candidate');

configService.loadAllTables();
const baseGet = configService.get.bind(configService);
let arrangeOverride = null;
let activity52Override = null;
configService.get = (tableName) => {
  if (tableName === 'Activity52ArrangeConfig' && arrangeOverride !== null) return arrangeOverride;
  if (tableName === 'Activity52Config' && activity52Override !== null) return activity52Override;
  return baseGet(tableName);
};

const activityConfig = baseGet('ActivityConfig') || {};
const activity52Config = baseGet('Activity52Config') || {};
const arrangeConfig = baseGet('Activity52ArrangeConfig') || {};
const assetsConfig = baseGet('AssetsConfig') || {};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function freshPlayer(items = {}) {
  return {
    name: 'activity52-ram-test',
    userId: null,
    items: { ...items },
    currencies: { gold: 0, diamond: 0, silver: 0 },
    activityInfo: { datas: [], operateRecords: {} },
  };
}

function contractState(player, id = 52001) {
  const row = (player.activityInfo?.datas || []).find((entry) => Number(entry && entry.id) === id);
  const op = player.activityInfo?.operateRecords || {};
  return {
    exp: Number(player.exp || 0),
    items: {
      3: Number(player.items?.[3] || 0),
      228: Number(player.items?.[228] || 0),
      232: Number(player.items?.[232] || 0),
      233: Number(player.items?.[233] || 0),
    },
    row: row ? {
      record: Number(row.record || 0),
      score: Number(row.score || 0),
      records: { 1: Number(row.records?.[1] || 0), 2: Number(row.records?.[2] || 0) },
    } : null,
    op: Object.fromEntries(Object.entries(op).filter(([key]) => key.startsWith(`${id}:`))),
  };
}

async function operate(player, params) {
  return activity.handleActivityOperate(params, { player, userId: null }, 77);
}

function finalPacket(response) {
  return Array.isArray(response) ? response.find((packet) => packet && packet.tag === 1700) : response;
}

function resultOf(response) {
  return Number(finalPacket(response)?.data?.result);
}

function packets(response, tag) {
  return (Array.isArray(response) ? response : []).filter((packet) => packet && packet.tag === tag);
}

function flattenRows(value, out = []) {
  if (Array.isArray(value)) value.forEach((entry) => flattenRows(entry, out));
  else if (value && typeof value === 'object') {
    if (value.activityId != null || value.type != null) out.push(value);
    else Object.values(value).forEach((entry) => flattenRows(entry, out));
  }
  return out;
}

async function main() {
  assert.equal(Number(activityConfig[52001]?.activityType), 52, '52001 must be Activity52');
  assert.equal(activityConfig[52061], undefined, '52061 must not be provisioned by ActivityConfig');
  assert.equal(Number(activity52Config[52001]?.consume), 233);
  assert.equal(Number(activity52Config[52001]?.exchangeId), 232);
  assert.ok(assetsConfig[232] && assetsConfig[233], 'currency items must be configured');
  assert.equal(flattenRows(arrangeConfig[52001]).length, 7, '52001 must have seven arrangements');

  // Unknown and unscheduled IDs reject before ensureActivityInfo/upsert.
  for (const id of [52061, 999999]) {
    const player = freshPlayer({ 233: 3 });
    const before = clone(contractState(player, id));
    const response = await operate(player, { id, module: 1, index: 1 });
    assert.equal(resultOf(response), 1, `unknown id ${id} must reject`);
    assert.deepEqual(contractState(player, id), before, `unknown id ${id} must not mutate RAM state`);
  }

  // Activity52 module/config gates are fail-closed before any cost is taken.
  {
    const player = freshPlayer({ 233: 3 });
    const before = clone(contractState(player));
    assert.equal(resultOf(await operate(player, { id: 52001, module: 99, index: 1 })), 1);
    assert.deepEqual(contractState(player), before, 'unknown module must not mutate RAM state');
  }
  {
    const original = baseGet('Activity52Config');
    activity52Override = { ...original, 52001: { ...original[52001], consume: 0 } };
    const player = freshPlayer({ 233: 3 });
    const before = clone(contractState(player));
    assert.equal(resultOf(await operate(player, { id: 52001, module: 1, index: 1 })), 1);
    assert.deepEqual(contractState(player), before, 'invalid config must not consume');
    activity52Override = null;
  }

  // A zero-based client row defaults to the Cozy selection 4.
  const player = freshPlayer({ 233: 5 });
  const select = await operate(player, { id: 52001, module: 0, index: 0 });
  assert.equal(resultOf(select), 0);
  assert.equal(contractState(player).row.record, 4, 'default Fulu selection must remain 4');

  // Use one valid type-7 arrangement to make the selected-color bonus
  // deterministic: color 4 appears once, display=3, multi=2 => item 232 x6.
  arrangeOverride = {
    52001: {
      1: { 1: {
        activityId: 52001,
        prize: 5,
        type: 7,
        showRate: 10000,
        display: 3,
        rewards: [{ id: 228, count: 2, weight: 10000 }],
      } },
    },
  };
  const draw = await operate(player, { id: 52001, module: 1, index: 2 });
  assert.equal(resultOf(draw), 0, 'valid draw must succeed');
  assert.equal(packets(draw, 1775).length, 1, 'accepted draw must emit one 1775 packet');
  const drawPacket = packets(draw, 1775)[0].data;
  assert.deepEqual(drawPacket.colorCount, { 1: 2, 2: 1, 3: 1, 4: 1 });
  assert.equal(player.items[233], 3, 'draw must consume two item 233');
  assert.equal(player.items[228], 4, 'configured reward scales by multi');
  assert.equal(player.items[232], 6, 'exchange bonus = selectedColorCount * display * multi');
  assert.equal(contractState(player).row.records[1], 2);

  const insufficient = freshPlayer({ 233: 1 });
  const insufficientBefore = clone(contractState(insufficient));
  const insufficientResponse = await operate(insufficient, { id: 52001, module: 1, index: 2 });
  assert.equal(resultOf(insufficientResponse), 1);
  assert.equal(packets(insufficientResponse, 1775).length, 0);
  assert.equal(packets(insufficientResponse, 1701).length, 0);
  assert.deepEqual(contractState(insufficient), insufficientBefore, 'insufficient cost must not mutate');

  // Missing arrangement/empty reward rejects before item 233 is consumed and
  // does not emit the draw animation packet.
  for (const badArrange of [
    { 52001: {} },
    { 52001: { 1: { 1: { activityId: 52001, type: 7, showRate: 10000, display: 3, rewards: [] } } } },
  ]) {
    arrangeOverride = badArrange;
    const bad = freshPlayer({ 233: 3 });
    const before = clone(contractState(bad));
    const response = await operate(bad, { id: 52001, module: 1, index: 1 });
    assert.equal(resultOf(response), 1);
    assert.equal(packets(response, 1775).length, 0);
    assert.equal(packets(response, 1701).length, 0);
    assert.deepEqual(contractState(bad), before, 'bad arrangement must not consume or update records');
  }

  // triggerTimes is a hard claim cap: even a large draw count cannot claim
  // beyond the configured two reward claims.
  arrangeOverride = null;
  const capped = freshPlayer();
  capped.activityInfo.datas.push({ id: 52001, record: 4, score: 9999, records: { 1: 9999, 2: 2 } });
  const cappedBefore = clone(contractState(capped));
  assert.equal(resultOf(await operate(capped, { id: 52001, module: 2, index: 0 })), 1);
  assert.deepEqual(contractState(capped), cappedBefore);

  arrangeOverride = null;
  activity52Override = null;
  configService.get = baseGet;
  console.log('activity52 candidate RAM harness: PASS');
}

main().catch((error) => {
  console.error('activity52 candidate RAM harness: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});


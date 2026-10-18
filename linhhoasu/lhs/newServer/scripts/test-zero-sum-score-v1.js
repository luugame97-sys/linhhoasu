'use strict';

const assert = require('assert/strict');
const { applyAtomicScoreMutation } = require('../src/services/CompetitionScoreService');

const clone = value => JSON.parse(JSON.stringify(value));
const get = (row, path) => path.split('.').reduce((value, key) => value?.[key], row);
function matches(row, filter) {
  return Object.entries(filter || {}).every(([key, value]) => {
    if (key === '$and') return value.every(part => matches(row, part));
    if (key === '$or') return value.some(part => matches(row, part));
    const actual = get(row, key);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.entries(value).every(([op, expected]) => {
        if (op === '$exists') return (actual !== undefined) === expected;
        if (op === '$ne') return Array.isArray(actual) ? !actual.some(item => JSON.stringify(item) === JSON.stringify(expected)) : actual !== expected;
        if (op === '$not' && expected?.$elemMatch) return !((actual || []).some(item => Object.entries(expected.$elemMatch).every(([k, v]) => item?.[k] === v)));
        if (op === '$gte') return actual >= expected;
        if (op === '$lt') return actual < expected;
        return actual === expected;
      });
    }
    return actual === value;
  });
}
function model(rows, failUpdates = 0) {
  const byId = new Map(rows.map(row => [row.playerId || row._id, clone(row)]));
  const query = value => ({
    lean() { return this; },
    exec: async () => clone(value),
    then(resolve, reject) { return this.exec().then(resolve, reject); },
  });
  const api = {
    findOne(filter) { return query([...byId.values()].find(row => matches(row, filter)) || null); },
    findOneAndUpdate(filter, update) {
      if (failUpdates > 0) { failUpdates -= 1; throw new Error('INJECTED_SCORE_WRITE_DOWN'); }
      const row = [...byId.values()].find(candidate => matches(candidate, filter));
      if (!row) return query(null);
      Object.assign(row, clone(update.$set || {}));
      Object.entries(update.$push || {}).forEach(([field, value]) => {
        row[field] ||= [];
        row[field].push(...clone(value.$each || [value]));
        if (Number.isFinite(value.$slice)) row[field] = row[field].slice(Number(value.$slice));
      });
      return query(row);
    },
  };
  return { api, rows: byId, setFail(n) { failUpdates = n; } };
}

async function main() {
  const target = model([{ playerId: 'loser', arenaScore: 1109 }]);
  const win = await applyAtomicScoreMutation({ Model: target.api, query: { playerId: 'loser' },
    field: 'arenaScore', markerField: 'arenaScoreReceipts', receiptId: 'fight-a', delta: -11, defaultScore: 1000 });
  assert.equal(win.scoreBefore, 1109); assert.equal(win.scoreAfter, 1098); assert.equal(win.scoreChange, -11);
  const duplicate = await applyAtomicScoreMutation({ Model: target.api, query: { playerId: 'loser' },
    field: 'arenaScore', markerField: 'arenaScoreReceipts', receiptId: 'fight-a', delta: -11, defaultScore: 1000 });
  assert.equal(duplicate.status, 'duplicate'); assert.equal(duplicate.scoreAfter, 1098);

  const floor = model([{ playerId: 'floor', arenaScore: 5 }]);
  const floorResult = await applyAtomicScoreMutation({ Model: floor.api, query: { playerId: 'floor' },
    field: 'arenaScore', markerField: 'arenaScoreReceipts', receiptId: 'fight-floor', delta: -11, defaultScore: 1000 });
  assert.equal(floorResult.scoreAfter, 0); assert.equal(floorResult.scoreChange, -5);

  const concurrent = model([{ playerId: 'busy', arenaScore: 100 }]);
  const concurrentResult = await Promise.all([
    applyAtomicScoreMutation({ Model: concurrent.api, query: { playerId: 'busy' }, field: 'arenaScore', markerField: 'arenaScoreReceipts', receiptId: 'fight-b', delta: -11, defaultScore: 1000 }),
    applyAtomicScoreMutation({ Model: concurrent.api, query: { playerId: 'busy' }, field: 'arenaScore', markerField: 'arenaScoreReceipts', receiptId: 'fight-c', delta: -11, defaultScore: 1000 }),
  ]);
  assert.equal(concurrent.rows.get('busy').arenaScore, 78); assert.equal(concurrentResult.length, 2);

  const retry = model([{ playerId: 'retry', arenaScore: 1000 }]);
  retry.setFail(1);
  await assert.rejects(() => applyAtomicScoreMutation({ Model: retry.api, query: { playerId: 'retry' }, field: 'arenaScore', markerField: 'arenaScoreReceipts', receiptId: 'fight-retry', delta: 11, defaultScore: 1000 }), /INJECTED_SCORE_WRITE_DOWN/);
  const retried = await applyAtomicScoreMutation({ Model: retry.api, query: { playerId: 'retry' }, field: 'arenaScore', markerField: 'arenaScoreReceipts', receiptId: 'fight-retry', delta: 11, defaultScore: 1000 });
  assert.equal(retried.scoreAfter, 1011);
  await assert.rejects(() => applyAtomicScoreMutation({ Model: retry.api, query: { playerId: 'offline' }, field: 'arenaScore', markerField: 'arenaScoreReceipts', receiptId: 'fight-offline', delta: -11, defaultScore: 1000 }), /SCORE_TARGET_NOT_FOUND/);
  console.log(JSON.stringify({ result: 'PASS', checks: 11, productionWrites: 0, networkAttempts: 0 }, null, 2));
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });

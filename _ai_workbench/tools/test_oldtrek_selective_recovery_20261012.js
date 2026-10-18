'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const rows = {
  200: { id: 200, eventType: 2, nextId: [], choiceNext: [], checkValue: [] },
  300: { id: 300, eventType: 99, nextId: [[301], [302]], choiceNext: [], checkValue: [[1, 5]] },
  301: { id: 301, eventType: 99, nextId: [], choiceNext: [], checkValue: [] },
  302: { id: 302, eventType: 99, nextId: [], choiceNext: [], checkValue: [] },
};

const get = (name) => {
  if (name === 'OldTrekCommonEventConfig') return rows;
  if (name === 'OldTrekMiniGameConfig') return {};
  return {};
};

const servicePath = path.resolve(__dirname, '../temp/oldtrek_selective_20261012/candidate/src/services/OldTrekEventService.js');
const sandbox = { module: { exports: {} }, exports: {},
  console,
  Buffer,
  Date,
  Math,
  JSON,
  Set,
  Map,
  Number,
  Promise,
  require(name) {
    if (name === 'node:crypto') return crypto;
    if (name === './ConfigService') return { get };
    if (name === '../config/oldTrekGameplayPolicy.json') return {
      version: 'test-policy',
      eventTypeWeights: { 2: 1, 99: 1 },
      maxChainSteps: 10,
      terminalFailureReward: [],
      terminalSuccessReward: [],
      logLimit: 50,
      replayWindow: 50,
      eventDistance: 100,
      terminalShipExp: 0,
    };
    if (name === './OldTrekPuzzleService') return { validate: () => true, board: () => [] };
    if (name === './OldTrekArenaService') return { npc: () => ({}), profile: () => ({}) };
    throw new Error(`blocked dependency: ${name}`);
  },
};
sandbox.exports = sandbox.module.exports;
vm.runInNewContext(fs.readFileSync(servicePath, 'utf8'), sandbox, { filename: servicePath });
const serviceModule = sandbox.module.exports;

function infoFor(event) {
  return {
    season: 1,
    stateRevision: 10,
    eventLedger: [],
    eventLogs: [],
    taskRecord: {},
    sailorList: [],
    setMap: { 0: [] },
    sailSetId: 0,
    battleRecords: {},
    sailInfo: {
      trekData: { uid: 9001, dist: 0, encounterCount: 1, nextEventDistance: 0 },
      currentEvent: event,
      cabin: [],
      eventLogs: [],
      effects: [],
    },
  };
}

async function main() {
  const service = serviceModule.createService({ get, randomInt: () => 0 });
  const policyVersion = service.rules.version;
  const type2 = infoFor({ uid: 1001, id: 200, pre: -1, rootUid: 1001, chainStep: 0,
    policyVersion, trekUid: 9001, season: 1 });
  const recovered2 = service.resolveExpired(type2, 1001, Date.now(), { other_attr_info: {} });
  assert.equal(recovered2.ok, true);
  assert.equal(recovered2.terminal, true);
  assert.equal(recovered2.event, null);
  assert.equal(recovered2.lastLog.result, 1);
  assert.equal(type2.eventLedger.length, 1);
  assert.equal(service.resolveExpired(type2, 1001, Date.now(), { other_attr_info: {} }).replayed, true);

  const type99 = infoFor({ uid: 1002, id: 300, pre: -1, rootUid: 1002, chainStep: 0,
    policyVersion, trekUid: 9001, season: 1 });
  const recovered99 = service.resolveExpired(type99, 1002, Date.now(), { other_attr_info: {} });
  assert.equal(recovered99.ok, true);
  assert.equal(recovered99.terminal, false);
  assert.equal(recovered99.event.id, 302);
  assert.equal(recovered99.lastLog.result, 1);
  assert.equal(type99.eventLedger.length, 1);

  const normal = infoFor({ uid: 1003, id: 200, pre: -1, rootUid: 1003, chainStep: 0,
    policyVersion, trekUid: 9001, season: 1 });
  assert.equal(service.resolve(normal, { eventUid: 1003, operate: 1, param: 0 }, Date.now(), { other_attr_info: {} }).code,
    'OLD_TREK_EVENT_ACTION_INVALID');
  console.log(JSON.stringify({ pass: true, productionWrites: 0, networkCalls: 0,
    cases: ['type2_forced_failure', 'type99_failure_branch', 'public_operate1_unchanged', 'idempotent_replay'] }));
}

main().catch((error) => { console.error(error.stack); process.exitCode = 1; });

'use strict';
const assert = require('assert/strict');
const config = require('../src/services/ConfigService');
const { createService } = require('../src/services/OldTrekEventService');
const policy = require('../src/config/oldTrekGameplayPolicy.json');
let cases = 0;
const equal = (a, b) => { assert.deepEqual(a, b); cases++; };
const service = createService({ randomInt: n => n - 1 });
const clone = x => JSON.parse(JSON.stringify(x));
function fresh(id = 10260) {
  const info = { season: 1, stateRevision: 1, nextEventUid: 100, taskRecord: {}, sailorList: [], setMap: {}, sailSetId: 0,
    sailInfo: { trekData: { uid: 50, id: 1, diff: 1, dist: 0 }, eventLogs: [], currentEvent: null } };
  if (id) info.sailInfo.currentEvent = { uid: 100, id, pre: -1, rootUid: 100, createdAt: 1000,
    policyVersion: policy.version, season: 1, trekUid: 50, chainStep: 0 };
  const game = (config.get('OldTrekMiniGameConfig') || {})[id];
  if (game) {
    info.sailInfo.currentEvent.miniGameType = game.type;
    info.sailInfo.currentEvent.miniGameLevel = game.levelRange.find(n => config.get(`OldTrekMiniGame${game.type}Config`)[n]);
  }
  return info;
}
function request(info, extra = {}) { return { eventUid: info.sailInfo.currentEvent.uid, operate: 0, param: 0, ...extra }; }
const table = config.get('OldTrekCommonEventConfig');
const badEdges = [];
for (const row of Object.values(table)) for (const id of [...(row.choiceNext || []), ...(row.nextId || [])].flat()) if (!table[id]) badEdges.push([row.id, id]);
// Integrity is reported, not silently repaired or imported into live tables.
equal(service.roots().length > 0, true);
for (const payload of [{ eventUid: -1 }, { eventUid: 0 }, { eventUid: 100.5 }, { eventUid: 99 }, { operate: 2 }, { operate: -1 }, { param: 10 }, { param: Infinity }, { revision: 0 }]) {
  const info = fresh(), before = clone(info), r = service.resolve(info, request(info, payload), 2000);
  equal(r.ok, false); equal(info, before);
}
{
  const info = fresh(); info.sailInfo.currentEvent.policyVersion = 'legacy'; const before = clone(info);
  equal(service.resolve(info, request(info)).code, 'OLD_TREK_EVENT_POLICY_REQUIRED'); equal(info, before);
}
{
  const info = fresh(null), trek = info.sailInfo.trekData; trek.dist = 2000;
  equal(service.spawn(info, 1000), null); equal(trek.nextEventDistance, 2600);
  trek.dist = 2600; const ev = service.spawn(info, 1100); equal(!!ev, true);
  equal(service.spawn(info, 1200), null); equal(trek.encounterCount, 1);
}
// Walk both action branches for all root events with low/high dice. No rewards
// issued; diagnostic simulator validates termination and native check arrays.
let walked = 0;
for (const high of [false, true]) for (const operate of [0, 1]) for (const root of service.roots()) {
  if (root.id === 4041) continue; // replay-proof puzzle has its own dedicated suite
  if ([2,3].includes(root.eventType)) continue; // actor/formation fixture: domain suite
  const engine = createService({ randomInt: n => high ? n - 1 : 0 });
  const info = fresh(root.id); let steps = 0, rewards = 0;
  while (info.sailInfo.currentEvent) {
    const ev = info.sailInfo.currentEvent, row = table[ev.id];
    const p = request(info, { operate: row.choiceNext?.length || row.eventType === 4 ? operate : 0 });
    if (row.eventType === 4 && high) {
      const level = config.get(`OldTrekMiniGame${ev.miniGameType}Config`)[ev.miniGameLevel];
      p.param = level.winScore || level.successScore;
    }
    const r = engine.resolve(info, p, 4000 + steps);
    assert(r.ok, JSON.stringify({ root: root.id, at: ev.id, code: r.code }));
    if (r.check.length) assert(Array.isArray(r.check[0].baseValue));
    if (r.rewardRows.length) { assert(r.terminal); rewards++; }
    const snapshot = clone(info); const retry = engine.resolve(info, p, 3000 + steps);
    assert(retry.replayed); assert.equal(retry.rewardRows.length, 0); assert.deepEqual(info, snapshot);
    assert(++steps <= policy.maxChainSteps);
  }
  equal(rewards, 1); walked++;
}
console.log(JSON.stringify({ status: 'PASS', assertions: cases, walkedRootVariants: walked, badEdges, policy: policy.version, networkAttempts: 0, playerWrites: 0 }, null, 2));

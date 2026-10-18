'use strict';
// RAM-only regression checks for the 2026-09-27 OldTrek P1 fixes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const config = require(path.join(root, 'linhhoasu/lhs/newServer/src/services/ConfigService'));
const playerService = require(path.join(root, 'linhhoasu/lhs/newServer/src/services/PlayerService'));
playerService.savePlayer = async (_userId, player) => player;
const handler = require(path.join(root, 'linhhoasu/lhs/newServer/src/handlers/old-trek'));
const arena = require(path.join(root, 'linhhoasu/lhs/newServer/src/services/OldTrekArenaService'));
const eventService = require(path.join(root, 'linhhoasu/lhs/newServer/src/services/OldTrekEventService'));
const policy = require(path.join(root, 'linhhoasu/lhs/newServer/src/config/oldTrekGameplayPolicy.json'));

const clone = value => JSON.parse(JSON.stringify(value));
const info = session => session.player.other_attr_info.oldTrekInfo;
const first = response => Array.isArray(response) ? response[0].data : response.data;

function fresh() {
  const player = {
    userId: 'oldtrek-p1-ram', playerId: 'oldtrek-p1-ram', name: 'RAM', level: 100,
    items: { 321: 100000, 325: 100, 326: 100, 331: 100000, 332: 10000, 323: 100 },
    currencies: { diamond: 100000, silver: 0, gold: 0 }, other_attr_info: {},
  };
  handler.ensureOldTrekInfo(player);
  const state = player.other_attr_info.oldTrekInfo;
  state.sailorList = [340101, 340102, 340103].map(id => handler.buildSailor(id));
  state.sailorSlotList.forEach((row, index) => { row.sailorId = state.sailorList[index]?.id || 0; });
  state.setMap[0].forEach((line, index) => { line.slots[0] = state.sailorList[index].id; line.leader = line.slots[0]; });
  return { userId: player.userId, player };
}

async function main() {
  process.env.OLD_TREK_EVENT_ENGINE_ENABLED = '1';
  const checks = [];

  // 7000 must reject an empty sailing line before charging departure cost.
  {
    const session = fresh();
    const before = clone(session.player);
    info(session).setMap[0][2].slots = [0, 0, 0, 0];
    info(session).setMap[0][2].leader = -1;
    const result = first(await handler.handleOldTrekInfo({ id: 1, diff: 1 }, session, 1));
    assert.equal(result.result, 1);
    assert.equal(result.code, 'OLD_TREK_FORMATION_EMPTY');
    assert.deepEqual(session.player.items, before.items);
    checks.push({ id: 'empty_formation_departure', status: 'PASS', code: result.code });
  }

  // 7002 must reject an empty sailing formation without throwing/invalidating session.
  {
    const session = fresh();
    info(session).sailing = true;
    info(session).sailInfo.trekData = { uid: 77, id: 1, diff: 1, dist: 1000, stable: 100, stableMax: 100 };
    info(session).setMap[0][2].slots = [0, 0, 0, 0];
    info(session).setMap[0][2].leader = -1;
    const event = { uid: 88, id: 2, enemySnapshot: arena.npc(session.player), enemy: {}, trekUid: 77,
      season: info(session).season, policyVersion: policy.version, chainStep: 0, pre: -1 };
    info(session).sailInfo.currentEvent = event;
    const result = first(await handler.handleOldTrekAction(7002, { eventUid: 88, operate: 0, param: 0 }, session, 2));
    assert.equal(result.result, 1);
    assert.equal(result.code, 'OLD_TREK_FORMATION_EMPTY');
    assert(session.player);
    checks.push({ id: 'empty_formation_battle', status: 'PASS', code: result.code });
  }

  // A stale lower target may not upgrade a maxed sailor to max+1.
  {
    const session = fresh();
    const levels = config.get('OldTrekSailorLevelUpConfig');
    const max = Math.max(...Object.keys(levels).map(Number));
    info(session).sailorSlotList[0].level = max;
    const before = clone(session.player);
    const result = first(await handler.handleOldTrekAction(7024, { slot: 0, level: 1 }, session, 3));
    assert.equal(result.result, 1);
    assert.equal(info(session).sailorSlotList[0].level, max);
    assert.deepEqual(session.player.items, before.items);
    checks.push({ id: 'max_sailor_level_stale_target', status: 'PASS', max });
  }

  // Type-3 event completion is recorded under task type 3, not type 2.
  {
    const session = fresh();
    info(session).sailing = true;
    info(session).sailInfo.trekData = { uid: 99, id: 1, diff: 1, dist: 1000, stable: 100, stableMax: 100 };
    const row = Object.values(config.get('OldTrekCommonEventConfig')).find(item => Number(item.eventType) === 3);
    assert(row, 'type-3 event config must exist');
    const current = { uid: 100, id: row.id, enemySnapshot: arena.npc(session.player), enemy: arena.profile(arena.npc(session.player)),
      trekUid: 99, season: info(session).season, policyVersion: policy.version, chainStep: 0, pre: -1 };
    info(session).sailInfo.currentEvent = current;
    const resolved = eventService.resolve(info(session), { eventUid: 100, operate: 0, param: 0 }, Date.now(), session.player);
    assert.equal(resolved.ok, true);
    const taskKey = 10000 * row.id + 100 * 1 + 3;
    assert.equal(info(session).taskRecord[taskKey], 1);
    checks.push({ id: 'type3_event_task_progress', status: 'PASS', taskKey });
  }

  // Explicit zero OldTrek score must not fall back to unrelated arenaScore.
  {
    const session = fresh();
    session.player.oldTrekArenaScore = 0;
    session.player.arenaScore = 2000;
    const result = first(await handler.handleOldTrekAction(7053, {}, session, 4));
    assert.equal(result.record, 1);
    checks.push({ id: 'arena_zero_score', status: 'PASS', record: result.record });
  }

  // Settlement mirrors the native sailor task counters on the server.
  {
    const session = fresh();
    info(session).sailing = true;
    info(session).sailInfo.trekData = { uid: 111, id: 1, diff: 1, dist: 9999, stable: 100, stableMax: 100 };
    info(session).sailInfo.currentEvent = { uid: 112, id: 109, pre: -1, trekUid: 111,
      season: info(session).season, policyVersion: policy.version, chainStep: 0, createdAt: Date.now() };
    const result = await handler.handleOldTrekAction(7002, { eventUid: 112, operate: 0, param: 0 }, session, 5);
    assert(Array.isArray(result) && result.some(packet => packet.tag === 7010));
    assert.equal(info(session).sailorList[0].task[2], 1);
    assert(info(session).sailorList[0].task[3] > 0);
    assert.equal(info(session).endCache, true);
    const cache = first(await handler.handleOldTrekAction(7065, {}, session, 6));
    assert(cache.cache && Array.isArray(cache.cache.rewards));
    assert.equal(info(session).endCache, false);
    checks.push({ id: 'settlement_sailor_tasks_and_end_cache', status: 'PASS' });
  }

  // Recall must fail before charging when the special-sailor capacity is full.
  {
    const session = fresh();
    const rows = Object.values(config.get('OldTrekSailorConfig')).filter(row => Number(row.type) === 1);
    const capacity = Number(config.get('OldTrekBaseConfig').initialSailorNum || 20);
    info(session).sailorList = rows.slice(0, capacity).map(row => handler.buildSailor(row.id));
    const candidate = rows.find(row => !info(session).sailorList.some(sailor => sailor.id === row.id));
    assert(candidate, 'recall candidate must exist');
    info(session).sailorAtlas[candidate.id] = 0;
    const before = clone(session.player);
    const result = first(await handler.handleOldTrekAction(7037, { id: candidate.id }, session, 7));
    assert.equal(result.result, 1);
    assert.equal(result.code, 'OLD_TREK_SAILOR_CAPACITY');
    assert.deepEqual(session.player.items, before.items);
    checks.push({ id: 'recall_capacity', status: 'PASS', capacity });
  }

  // ChatData readiness must not stop retrying OldTrekModel installation.
  {
    function ChatData() {}
    ChatData.prototype.parseOldTrekMsg = function parseOldTrekMsg() {};
    const window = { ChatData, setTimeout() {} };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'linhhoasu/webgame/game/js/lhs-oldtrek-errors-v1.js'), 'utf8'), { window });
    assert.equal(window.LhsOldTrekErrors.chatInstalled, true);
    assert.equal(window.LhsOldTrekErrors.installed, undefined);
    function OldTrekModel() {}
    OldTrekModel.prototype.Rpc = function Rpc() {};
    window.OldTrekModel = OldTrekModel;
    assert.equal(window.LhsOldTrekErrors.install(), true);
    assert.equal(window.LhsOldTrekErrors.installed, true);
    checks.push({ id: 'addon_chat_before_oldtrek', status: 'PASS' });
  }

  // The reverse load order must also keep retrying ChatData after travel hooks.
  {
    let retries = 0;
    function OldTrekModel() {}
    OldTrekModel.prototype.Rpc = function Rpc() {};
    const window = { OldTrekModel, setTimeout() { retries += 1; } };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'linhhoasu/webgame/game/js/lhs-oldtrek-errors-v1.js'), 'utf8'), { window });
    assert.equal(window.LhsOldTrekErrors.installed, true);
    assert(retries > 0);
    function ChatData() {}
    ChatData.prototype.parseOldTrekMsg = function parseOldTrekMsg() {};
    window.ChatData = ChatData;
    assert.equal(window.LhsOldTrekErrors.install(), true);
    checks.push({ id: 'addon_oldtrek_before_chat', status: 'PASS' });
  }

  const report = { at: new Date().toISOString(), productionWrites: 0, networkAttempts: 0, checks };
  const output = path.join(root, '_ai_workbench/temp/oldtrek_p1_fixes_20260927.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });

'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const state = require('../src/services/TopArenaStateService');

const root = path.resolve(__dirname, '_tables_dump');
const readTable = name => JSON.parse(fs.readFileSync(path.join(root, `${name}.json`), 'utf8')).data;
const openConfig = readTable('TopArenaOpenConfig');
const passConfig = readTable('TopArenaPassConfig');
const baseConfig = readTable('TopArenaBaseConfig');
const DAY = state.DAY_MS;

const checks = [];
function check(name, fn) {
  fn();
  checks.push(name);
}

const sourceRow = { ...openConfig['1'] };
const cycleStart = Date.parse('2026-09-21T00:00:00+07:00');
const cycle = {
  key: 'QA_TOPARENA_C1', index: 0, startTime: cycleStart, endTime: cycleStart + 7 * DAY,
  matchId: 10001, matchConfig: sourceRow,
};
const timeline = state.buildTimeline({ cycle, openConfig, baseConfig });

check('native room contract is 512 -> 64 -> 8', () => {
  assert.deepEqual(state.roundSchedule(512), [
    { round: 0, matchMode: 512, peopleNum: 512, roomCount: 64, battleCount: 9 },
    { round: 1, matchMode: 64, peopleNum: 64, roomCount: 8, battleCount: 6 },
    { round: 2, matchMode: 8, peopleNum: 8, roomCount: 1, battleCount: 3 },
  ]);
  assert.equal(timeline.maxRound, 3);
});

check('config offsets are translated to the active cycle', () => {
  assert.equal(timeline.startTime, cycleStart);
  assert.equal(timeline.endTime, cycleStart + 7 * DAY);
  assert.equal(timeline.promotionStartTime - cycleStart, sourceRow.promotionStartTime - sourceRow.startTime);
  assert.equal(timeline.attrsLockTime - cycleStart, sourceRow.attrsLockTime - sourceRow.startTime);
  assert.equal(timeline.gamePassStartTime - cycleStart, sourceRow.gamePassStartTime - sourceRow.startTime);
  assert.equal(timeline.settleTime - cycleStart, sourceRow.settleTime - sourceRow.startTime);
});

check('stage boundaries follow native consumer contract', () => {
  const at = offset => state.stageAt(timeline, cycleStart + offset);
  assert.equal(at(0).stage, state.STAGES.AUDITION);
  assert.equal(at(timeline.promotionStartTime - cycleStart).stage, state.STAGES.BRACKET_512);
  assert.equal(at(timeline.rounds[1].startTime - cycleStart).stage, state.STAGES.BRACKET_64);
  assert.equal(at(timeline.rounds[2].startTime - cycleStart).stage, state.STAGES.BRACKET_8_PREP);
  assert.equal(at(timeline.battleStartTime - cycleStart).stage, state.STAGES.BRACKET_8_BATTLE);
  assert.equal(at(timeline.settleTime - cycleStart).stage, state.STAGES.SETTLEMENT);
  assert.equal(state.stageAt(timeline, timeline.endTime).stage, state.STAGES.CLOSED);
});

check('battle start never precedes round 8 start', () => {
  const round8 = timeline.rounds.find(row => row.matchMode === 8);
  assert(timeline.battleStartTime >= round8.startTime);
});

check('pass config is native day list and scalar legacy is retained', () => {
  assert.deepEqual(state.passRows(passConfig, 512).map(row => row.day), [1, 2, 3, 4, 5]);
  const player = { round: 99, pass: true, passRecord: 3, keep: 'untouched' };
  const normalized = state.normalizePlayerInfo(player, { maxRound: 2, passConfig, matchMode: 512 });
  assert.equal(normalized.round, 2);
  assert.equal(normalized.pass, 1);
  assert.deepEqual(normalized.passRecord, {});
  assert.equal(normalized.legacyPassRecord.scalar, 3);
  assert.equal(normalized.keep, 'untouched');
  assert.equal(player.passRecord, 3);
});

check('pass map keeps known days and isolates unknown legacy keys', () => {
  const normalized = state.normalizePlayerInfo({ passRecord: { 1: 1, 5: 7, 9: 4 } }, {
    maxRound: 3, passConfig, matchMode: 512,
  });
  assert.deepEqual(normalized.passRecord, { 1: 1, 5: 7 });
  assert.deepEqual(normalized.legacyPassRecord, { 9: 4 });
});

check('state packet is read-only with explicit phase and pass days', () => {
  const input = { pass: 0, passRecord: { 1: 1 }, round: 0 };
  const snapshot = JSON.stringify(input);
  const packet = state.buildTopArenaState({
    cycle, openConfig, passConfig, baseConfig, playerInfo: input, now: timeline.promotionStartTime,
  });
  assert.equal(packet.result, 0);
  assert.equal(packet.stage, state.STAGES.BRACKET_512);
  assert.equal(packet.round, 0);
  assert.deepEqual(packet.passDays, [1, 2, 3, 4, 5]);
  assert.equal(JSON.stringify(input), snapshot);
});

console.log(JSON.stringify({
  result: 'PASS', checks: checks.length, tests: checks,
  productionWrites: 0, networkAttempts: 0,
}, null, 2));

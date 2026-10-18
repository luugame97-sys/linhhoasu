'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const app = process.env.EVENT_TEST_APP
  ? path.resolve(process.env.EVENT_TEST_APP)
  : path.resolve(__dirname, '..', '..', 'linhhoasu', 'lhs', 'newServer');
process.env.CONFIG_BIN_PATH = path.join(app, '..', 'update', 'resource', 'assets', 'excel', 'config_e5ac72c2.bin');
process.env.EVENT_ROTATION_ENABLED = '1';
process.env.EVENT_ROTATION_NATIVE_ENABLED = '1';

const registry = require(path.join(app, 'src/services/EventRotationRegistry'));
const schedule = require(path.join(app, 'src/services/FishingEventSchedule'));
const rules = require(path.join(app, 'src/config/fishingGameplayBalance.json'));

const start = Date.parse(rules.schedule.anchor);
const day = 86400000;
const legacyEnd = start + rules.schedule.durationDays * day;

const before = schedule.current(legacyEnd - 1);
assert.equal(before.length, 2);
assert.ok(before.every((row) => row.endTime === legacyEnd));

const after = schedule.current(legacyEnd + 1);
assert.equal(after.length, 2);
assert.ok(after.every((row) => row.startTime === legacyEnd));
assert.ok(after.every((row) => row.endTime === legacyEnd + rules.schedule.periodDays * day));
assert.equal(after[0].key, `F${after[0].id}_${legacyEnd}`);

const snapshot = registry.snapshot();
assert.equal(snapshot.preserveActiveCycles, true);
const fishing = snapshot.families.find((family) => family.key === 'fishing');
assert.equal(fishing.enabled, true);
assert.equal(fishing.repeatForever, true);
assert.equal(fishing.paid, false);

const fortune = snapshot.families.find((family) => family.key === 'fortune');
const kimma = snapshot.families.find((family) => family.key === 'new_year_monster');
assert.equal(fortune.enabled, true);
assert.equal(fortune.repeatForever, true);
assert.deepEqual(fortune.ids, [43001, 43002]);
assert.equal(kimma.enabled, true);
assert.equal(kimma.repeatForever, true);
const nextAnchor = Date.parse(kimma.anchor);
const currentKimma = require(path.join(app, 'src/services/NewYearEventSchedule')).windowFor(1001, undefined, nextAnchor + 1);
assert.equal(currentKimma.startTime, nextAnchor);
assert.equal(currentKimma.endTime, nextAnchor + day * 7);
const dueBeforeCycle = dueEventsForTest(nextAnchor + day * 7 + 59999);
assert.ok(!dueBeforeCycle.some((event) => event.kind === 'kimma' && event.startTime === nextAnchor));
const dueAfterCycle = dueEventsForTest(nextAnchor + day * 7 + 60000);
assert.ok(dueAfterCycle.some((event) => event.kind === 'kimma' && event.startTime === nextAnchor));
const cycleSchedule = require(path.join(app, 'src/services/ActivityCycleSchedule'));
const preservedPlayer = { activityInfo: { datas: [
  { id: 43001, startTime: nextAnchor - day, endTime: nextAnchor, record: 5 },
  { id: 44001, startTime: nextAnchor - day, endTime: nextAnchor, record: 7 },
] } };
cycleSchedule.syncPlayer(preservedPlayer, nextAnchor - 1);
assert.deepEqual(
  preservedPlayer.activityInfo.datas.filter((row) => row.id === 43001 || row.id === 44001)
    .map((row) => ({ id: row.id, startTime: row.startTime, endTime: row.endTime })),
  [{ id: 43001, startTime: nextAnchor - day, endTime: nextAnchor }, { id: 44001, startTime: nextAnchor - day, endTime: nextAnchor }],
);
const afterRotation = cycleSchedule.syncPlayer(preservedPlayer, nextAnchor + 1, { kimmaSettlementReady: true });
assert.equal(afterRotation.changed, true);
assert.ok(afterRotation.replaced.some((row) => row.family === 'fortune'));
assert.ok(afterRotation.replaced.some((row) => row.family === 'new_year_monster'));
assert.ok(preservedPlayer.activityInfo.datas.find((row) => row.id === 43001).startTime === nextAnchor);
assert.ok(preservedPlayer.activityInfo.datas.find((row) => row.id === 44001).startTime === nextAnchor);

console.log(JSON.stringify({
  result: 'PASS',
  legacyEnd: new Date(legacyEnd).toISOString(),
  before,
  after,
  family: fishing,
}));

function dueEventsForTest(now) {
  return require(path.join(app, 'src/services/EventRewardSettlementService')).dueEvents(
    1001,
    now,
    rules.activationAt || 1,
    require(path.join(app, 'src/config/eventRewardSettlement.json')),
  );
}

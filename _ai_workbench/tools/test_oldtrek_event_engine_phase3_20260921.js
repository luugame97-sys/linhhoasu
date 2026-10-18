'use strict';

const assert = require('assert/strict');
const playerService = require('../../linhhoasu/lhs/newServer/src/services/PlayerService');
playerService.savePlayer = async (_userId, player) => player;
const oldTrek = require('../../linhhoasu/lhs/newServer/src/handlers/old-trek');

function session() {
  const player = {
    userId: 'oldtrek_event_ram', playerId: 'oldtrek_event_player', name: 'Event QA', level: 100,
    currencies: { gold: 0, silver: 0, diamond: 0 }, items: { 321: 1000 }, other_attr_info: {},
  };
  oldTrek.ensureOldTrekInfo(player);
  return { userId: player.userId, player };
}
function info(s) { return s.player.other_attr_info.oldTrekInfo; }
function mainResponse(value) { return Array.isArray(value) ? value[0] : value; }

(async () => {
  const s = session();
  const start = await oldTrek.handleOldTrekInfo({ id: 1, diff: 1 }, s, 1);
  assert.equal(start.data.result, 0);
  info(s).sailInfo.currentEvent = { uid: 70001, id: 101, eventType: 6, choiceNext: [[102], [103]], nextId: [[102], [103]] };
  const accelerated = mainResponse(await oldTrek.handleOldTrekAction(7001, { multi: 1 }, s, 2));
  assert.equal(accelerated.data.result, 1);
  assert.equal(accelerated.data.code, 'OLD_TREK_EVENT_PENDING');
  assert.equal(info(s).sailInfo.currentEvent.uid, 70001);

  const stale = mainResponse(await oldTrek.handleOldTrekAction(7002, { eventUid: 70002, operate: 0 }, s, 3));
  assert.equal(stale.data.result, 1);
  assert.equal(stale.data.code, 'OLD_TREK_EVENT_UID_INVALID');

  const done = mainResponse(await oldTrek.handleOldTrekAction(7002, { eventUid: 70001, operate: 0, param: 0 }, s, 4));
  assert.equal(done.data.result, 1);
  assert.equal(done.data.code, 'OLD_TREK_EVENT_POLICY_REQUIRED');
  assert.equal(info(s).sailInfo.eventLogs.length, 0);
  assert.equal(info(s).sailInfo.currentEvent.uid, 70001);

  console.log(JSON.stringify({ status: 'PASS', checks: 8, eventId: accelerated.data.event.id,
    eventType: accelerated.data.event.eventType, uid: accelerated.data.event.uid,
    rewardItems: 0, ledgerReady: false, engineDeferred: true }, null, 2));
})().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });

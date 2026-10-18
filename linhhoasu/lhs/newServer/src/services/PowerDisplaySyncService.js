'use strict';

const readModel = require('./ArenaReadModelService');
const battle = require('./BattleService');
const TAG = 6198;

// Display-only, opt-in stream. Never re-send tag 500: native clients interpret
// that packet as a full login and reinitialize UI, timers and module state.
function packet(session, msgUid = 0, force = false) {
  const player = session && session.player;
  if (!player || !session.userId) return null;
  const attrs = battle.calcPlayerPower(player);
  const power = readModel.displayPower(attrs);
  const powerScore = battle.calcPowerScore(attrs);
  if (!Number.isSafeInteger(power) || !Number.isFinite(powerScore)) {
    throw new Error('POWER_DISPLAY_INVALID');
  }
  const key = `${player.playerId}:${power}:${powerScore}`;
  if (!force && session._lastPowerDisplay === key) return null;
  session._lastPowerDisplay = key;
  session._powerDisplayRevision = (Number(session._powerDisplayRevision) || 0) + 1;
  return { tag: TAG, msgUid, data: {
    result: 0, version: 1, revision: session._powerDisplayRevision,
    playerId: String(player.playerId || ''), name: String(player.name || ''),
    serverId: Number(session.serverId || player.serverId || process.env.SERVER_ID || 1001),
    power, powerScore, powerUnit: 'native-weighted-point',
  } };
}

function handleQuery(_params, session, msgUid) {
  if (!session || !session.player || !session.userId) {
    return { tag: TAG, msgUid, data: { result: -1, code: 'POWER_SESSION_REQUIRED' } };
  }
  const response = packet(session, msgUid, true);
  // Only this connection opts in; legacy clients never receive an unknown tag.
  session._powerDisplayV1 = true;
  return response;
}

function successfulResponse(result, tag, msgUid) {
  const packets = Array.isArray(result) ? result : [result];
  const reply = packets.find(p => Number(p && p.tag) === Number(tag)
    && (Number(msgUid) <= 0 || Number(p && p.msgUid) === Number(msgUid)));
  return !!reply && (!reply.data || reply.data.result == null || Number(reply.data.result) === 0);
}

module.exports = { TAG, packet, handleQuery, successfulResponse };

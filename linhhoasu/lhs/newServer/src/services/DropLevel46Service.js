'use strict';

const config = require('./ConfigService');
const playerService = require('./PlayerService');
const mutation = require('./PlayerMutationService');
const { syncCurrencyItems } = require('./CurrencySync');
const { getBoxSkipUnitMs, getClientBoxEndTimeSec } = require('../utils/boxTiming');
const pilot = require('../config/dropLevel46');
const broadPilot = require('../config/dropLevel100');
const crypto = require('node:crypto');

function applies(session) {
  const broad = broadPilot.isEnabled();
  const scoped = pilot.isEnabled();
  return (broad || scoped) && (broad ? Number(session?.player?.serverId) === Number(process.env.SERVER_ID) : Number(session?.player?.serverId) === 1001)
    && Number(session?.player?.boxInfo?.level) >= 45;
}

// The online snapshot owns accepted, possibly not-yet-flushed rewards. Drain
// its writer first and draft that snapshot under the same per-role lock.
async function handle(tag, params, session, msgUid) {
  return mutation.run(session.userId, async () => {
    const original = session.player;
    if (!original || !applies(session)) throw new Error('DROP46_INVALID_SESSION');
    await playerService.drainPendingSaves(session.userId);
    session._drop46SessionId ||= crypto.randomUUID();
    const key = Number(msgUid) > 0 ? `${session._drop46SessionId}:${tag}:${msgUid}` : '';
    const draft = JSON.parse(JSON.stringify(original));
    const box = draft.boxInfo;
    const receipt = box.drop46Receipt || { version: 1, silverSpent: 0, skipsSpent: 0, history: [] };
    const replay = key && receipt.history.find(row => row.key === key);
    if (replay) return replay.response;
    const before = JSON.stringify(box);
    const now = Date.now();
    const current = Number(box.level);
    let result = 0, silver = 0, skips = 0;
    const broad = broadPilot.isEnabled();
    const maxLevel = broad ? broadPilot.MAX_LEVEL : 46;
    let row = config.get('BoxConfig')?.[current];
    if (!row || (current < maxLevel && row.levelUpCost?.length !== 5) || !config.get('BoxConfig')?.[maxLevel]) throw new Error('DROP46_CONFIG_INVALID');
    if (!Number.isInteger(current) || current > maxLevel || !Number.isInteger(Number(box.exp || 0))
      || Number(box.exp || 0) < 0 || Number(box.exp || 0) > 5) throw new Error('DROP46_STATE_INVALID');
    box.level = current;
    box.exp = Number(box.exp || 0);
    draft.currencies ||= { silver: 0, gold: 0, diamond: 0 };

    const settle = () => {
      if (box.level < maxLevel && Number(box.upgradeFinishTime) > 0 && box.upgradeFinishTime <= now) {
        box.level += 1; box.exp = 0; box.upgradeFinishTime = 0; box.upgradeStartTime = 0;
        receipt.completedAt = now;
      }
    };
    settle();
    row = config.get('BoxConfig')[box.level];
    syncCurrencyItems(draft);
    if (tag === 2100 && box.level >= maxLevel) result = current < maxLevel ? 0 : -2;
    if (tag === 2100 && current === box.level && box.level < maxLevel && !(Number(box.upgradeFinishTime) > 0)) {
      const step = Number(box.exp || 0);
      const need = step < 5 ? Number(row.levelUpCost[step]) : 0;
      if (need > Number(draft.items?.[2] || 0)) result = -1;
      else {
        if (need > 0) {
          draft.items[2] -= need; draft.currencies.silver = draft.items[2];
          silver = need; box.exp = step + 1;
        }
        if (Number(box.exp) === 5) {
          box.upgradeStartTime = now;
          box.upgradeFinishTime = now + Number(row.timeCost) * 1000;
          receipt.startedAt = now;
        }
      }
    }
    if (tag === 2101 && box.level < maxLevel && Number(box.upgradeFinishTime) > now) {
      const count = Number(params?.count || 0);
      if (!Number.isSafeInteger(count) || count < 0) result = -1;
      else if (count > 0) {
        const use = Math.min(count, Math.ceil((box.upgradeFinishTime - now) / getBoxSkipUnitMs()));
        if (use > Number(draft.items?.[6] || 0)) result = -1;
        else {
          draft.items[6] -= use; draft.currencies.gold = draft.items[6]; skips = use;
          box.upgradeFinishTime = Math.max(now, box.upgradeFinishTime - use * getBoxSkipUnitMs());
          settle();
        }
      }
    }
    const state = { result, level: box.level, exp: Number(box.exp || 0), upgradeFinishTime: getClientBoxEndTimeSec(box.upgradeFinishTime, now) };
    const response = [];
    if (silver || skips) {
      const id = silver ? 2 : 6, count = -(silver || skips);
      response.push({ tag: 1202, msgUid: 0, data: { items: [{ id, count }], changed: [{ id, count: draft.items[id] }] } });
    }
    if (tag !== 2100 && (current !== box.level || skips)) response.push({ tag: 2100, msgUid: 0, data: { ...state, result: 0 } });
    response.push({ tag, msgUid, data: state });
    if (JSON.stringify(box) === before && !silver && !skips) return response;

    receipt.silverSpent += silver; receipt.skipsSpent += skips;
    receipt.history.push({ key, tag, at: now, silver, skips, level: box.level, exp: box.exp, response });
    // Detailed receipts for the pilot upgrade are bounded; totals/completion
    // remain permanent. Normal duplicate packets are also cached by WSServer.
    if (receipt.history.length > 64) receipt.history.splice(0, receipt.history.length - 64);
    box.drop46Receipt = receipt;
    require('./MainTaskProgressService').refreshMainTaskProgress(draft);
    try {
      if (!await playerService.savePlayer(session.userId, draft, { returnSaved: false })) throw new Error('DROP46_SAVE_UNCONFIRMED');
    } catch (error) {
      require('./RuntimeBus').getWsServer()?.invalidatePlayerForMutation(session.userId);
      session.player = null;
      throw error;
    }
    Object.assign(original, draft);
    session._itemListCache = null;
    return response;
  });
}

module.exports = { applies, handle };

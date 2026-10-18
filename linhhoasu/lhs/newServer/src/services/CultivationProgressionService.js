'use strict';

// Scoped to former terminal stage45 and later. Legacy stages stay in upgrade.js.
const crypto = require('crypto');
const config = require('./ConfigService');
const mutation = require('./PlayerMutationService');
const policy = require('../config/roleLevel2000');
const { isDeepStrictEqual } = require('util');
const OWNED = ['level', 'exp', 'roleInfo', 'items', 'currencies', 'other_attr_info', 'taskInfo'];
const clone = v => JSON.parse(JSON.stringify(v));
const int = v => Math.max(0, Math.floor(Number(v) || 0));
const emptyReward = () => ({ items: [], equips: [], heros: [] });
function metadata() {
  const ext = config.get('RoleLevel2000ExtensionConfig');
  return ext?.version === policy.VERSION ? ext : null;
}
function handles(player) {
  return !!metadata() && Number(player?.roleInfo?.stage ?? player?.roleInfo?.stageId ?? 1) >= 45;
}
function answer(player, uid, code, win = false, rewards = emptyReward()) {
  const role = player?.roleInfo || {};
  return { tag: 3103, msgUid: uid, data: { result: win ? 0 : -1, code,
    stage: int(role.stage ?? role.stageId) || 1, stageFailedTime: int(role.stageFailedTime), rewardInfo: rewards } };
}
function validatePills(input, row, player) {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > row.itemIds.length) throw Error('CULTIVATION_PILLS_INVALID');
  const seen = new Set();
  return input.map(cost => {
    if (!cost || !Number.isSafeInteger(cost.id) || cost.count !== 1 || seen.has(cost.id)
        || !row.itemIds.includes(cost.id)) throw Error('CULTIVATION_PILLS_INVALID');
    seen.add(cost.id);
    const asset = config.get('AssetsConfig')[cost.id];
    if (asset?.type !== 8 || asset.subType !== 1 || !Number.isSafeInteger(asset.param) || asset.param < 0) throw Error('CULTIVATION_PILL_CONFIG');
    if (int(player.items?.[cost.id]) < 1) throw Error('CULTIVATION_PILL_NOT_ENOUGH');
    return { id: cost.id, count: 1 };
  });
}
async function stageUpgrade(params = {}, session = {}, msgUid) {
  return mutation.run(session.userId, async () => {
    const players = require('./PlayerService');
    if (!session.player || !session.userId) return answer(session.player, msgUid, 'CULTIVATION_NO_SESSION');
    await players.drainPendingSaves(session.userId);
    const original = session.player;
    if (!handles(original)) return answer(original, msgUid, 'CULTIVATION_NOT_AVAILABLE');
    const saved = await players.loadPlayer(session.userId);
    if (!saved || OWNED.some(key => !isDeepStrictEqual(saved[key], original[key]))) {
      return answer(original, msgUid, 'CULTIVATION_STATE_REFRESH_REQUIRED');
    }
    if (params.cultivationVersion !== policy.VERSION) return answer(original, msgUid, 'CULTIVATION_CLIENT_UPDATE_REQUIRED');
    const requestId = String(params.requestId || '');
    if (!/^[A-Za-z0-9:_-]{12,160}$/.test(requestId)) return answer(original, msgUid, 'CULTIVATION_REQUEST_REQUIRED');
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify([params.stage, params.items ?? []])).digest('hex');
    const prior = original.roleInfo?.cultivationReceipts?.find(r => r.id === requestId);
    if (prior) {
      if (prior.fingerprint !== fingerprint) return answer(original, msgUid, 'CULTIVATION_REQUEST_CONFLICT');
      // No RNG, grant, debit or save on a duplicate request.
      return [{ tag: 1202, msgUid: 0, data: { items: [], changed: require('./CurrencySync').buildClientItemList(original) } },
        { ...answer(original,msgUid,prior.response.code,prior.response.result === 0,clone(prior.response.rewardInfo)),
          data: { ...answer(original,msgUid,prior.response.code,prior.response.result === 0,clone(prior.response.rewardInfo)).data, recovered: true } }];
    }
    const stage = int(original.roleInfo.stage ?? original.roleInfo.stageId);
    const stages = config.get('RoleStageConfig'), row = stages[stage], next = stages[stage+1];
    if (!next || stage >= metadata().maxStage) return answer(original, msgUid, 'CULTIVATION_MAX_STAGE');
    if (!Number.isSafeInteger(params.stage) || params.stage !== stage+1) return answer(original, msgUid, 'CULTIVATION_STAGE_SEQUENCE');
    if (original.level !== row.levelMax || !config.get('RoleLevelConfig')[original.level]) return answer(original, msgUid, 'CULTIVATION_LEVEL_REQUIRED');
    const neededExp = config.get('RoleLevelConfig')[original.level].exp;
    if (!Number.isSafeInteger(original.exp) || original.exp < neededExp) return answer(original, msgUid, 'CULTIVATION_EXP_REQUIRED');
    const progress = {
      6: original.level, 7: int(original.raidInfo?.level),
      13: int(original.other_attr_info?.realmTaskProgress?.bagelConsume),
    };
    // Recompute from authoritative fields, not client task status or forged flags.
    if (row.taskGroup.length !== 3 || row.taskGroup.some(id => {
      const t = config.get('TaskConfig')[id];
      return !t || progress[t.activeId] === undefined || progress[t.activeId] < t.taskValue1;
    })) return answer(original, msgUid, 'CULTIVATION_TASK_REQUIRED');
    let costs;
    try { costs = validatePills(params.items, row, original); }
    catch (e) { return answer(original, msgUid, e.message); }
    const draft = clone(original); draft.items ||= {};
    costs.forEach(c => { draft.items[c.id] = int(draft.items[c.id]) - 1; if (!draft.items[c.id]) delete draft.items[c.id]; });
    const bonus = costs.reduce((sum,c) => sum + config.get('AssetsConfig')[c.id].param, 0);
    const rate = Math.min(10000, row.successRate + Math.min(10, int(draft.roleInfo.stageFailedTime)) * row.addSuccessRate + bonus);
    const win = Math.random() * 10000 < rate;
    let rewards = emptyReward();
    if (win) {
      draft.roleInfo.stage = stage+1; draft.roleInfo.stageId = stage+1; draft.roleInfo.stageFailedTime = 0;
      draft.other_attr_info ||= {}; draft.other_attr_info.realmTaskProgress ||= {};
      draft.other_attr_info.realmTaskProgress.bagelConsume = 0;
      const rewardKey = String(stage+1);
      draft.roleInfo.cultivationRewardedStages ||= {};
      if (!draft.roleInfo.cultivationRewardedStages[rewardKey]) {
        next.rewards.forEach(r => require('../handlers/raid').addRewardToPlayer(draft,r.id,r.count));
        draft.roleInfo.cultivationRewardedStages[rewardKey] = true;
        rewards = { items: clone(next.rewards), equips: [], heros: [] };
      }
      // EXP earned at the old stage cap is intentionally retained. Once the
      // new stage is committed, let normal level reconciliation consume it.
      require('../handlers/raid').checkLevelUp(draft);
    } else draft.roleInfo.stageFailedTime = Math.min(10, int(draft.roleInfo.stageFailedTime)+1);
    require('./RealmTaskProgressService').refreshRealmStageTasks(draft);
    const task = require('../handlers/task');
    const packets = [{ tag: 1202, msgUid: 0, data: {
      items: costs.map(c => ({ id: c.id, count: -c.count })),
      changed: require('./CurrencySync').buildClientItemList(draft),
    } }, ...task.buildActiveTaskUpdatePackets(draft,0,{ includeTaskTypes:[1,4,7,1073746825] }),
    answer(draft, msgUid, win ? 'CULTIVATION_UPGRADED' : 'CULTIVATION_ATTEMPT_FAILED',win,rewards)];
    draft.roleInfo.cultivationReceipts = (draft.roleInfo.cultivationReceipts || []).concat({ id: requestId, fingerprint,
      response: clone(packets[packets.length-1].data) }).slice(-12);
    try {
      const update = Object.fromEntries(OWNED.filter(k => draft[k] !== undefined).map(k => [k, draft[k]]));
      if (!await players.savePlayer(session.userId, update, { returnSaved: false, cultivationCAS: saved })) throw Error('SAVE_NOT_CONFIRMED');
    } catch (e) {
      require('./RuntimeBus').getWsServer()?.invalidatePlayerForMutation?.(session.userId);
      session.player = null;
      return answer(original,msgUid,'CULTIVATION_COMMIT_UNKNOWN');
    }
    OWNED.forEach(k => { if (draft[k] !== undefined) original[k] = draft[k]; });
    session.player = original; session._itemListCache = null;
    return packets;
  });
}
module.exports = { handles, metadata, stageUpgrade };

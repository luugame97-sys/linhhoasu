/** Alchemy RPCs: configured recipe costs and weighted pill output. */
const playerService = require('../services/PlayerService');
const mutation = require('../services/PlayerMutationService');
const { craft } = require('../services/AlchemyCraftService');
const { addAlchemyGenerateCount } = require('../services/MainTaskProgressService');
const config = require('../services/ConfigService');
const receipts = require('../services/FeatureReceiptService');
const runtime = require('../services/RuntimeBus');
function safe(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : fallback;
}
function dayKey() {
  return require('../services/GameDayService').key();
}
function ensureAlchemyInfo(player) {
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  player.alchemyInfo = object(player.alchemyInfo);
  player.items = object(player.items);
  const info = player.alchemyInfo, today = dayKey();
  if (info.dayKey != null && info.dayKey !== today) info.dayCount = 0;
  info.dayKey = today;
  info.dayCount = safe(info.dayCount);
  info.level = Math.max(1, safe(info.level ?? info.lv, 1));
  const levels = Object.keys(config.get('AlchemyRoleConfig') || {}).map(Number).filter(n => Number.isSafeInteger(n) && n > 0);
  const maximum = levels.length ? Math.max(...levels) : Infinity;
  if (info.level > maximum) {
    info.legacyLevel = Math.max(info.legacyLevel || 0, info.level);
    info.level = maximum;
  }
  info.lv = info.level;
  info.exp = Math.max(safe(info.exp), safe(player.items[41]));
  player.items[41] = info.exp;
  return info;
}
function rewardInfo(items = []) {
  return { items, equips: [], pets: [], bloodline: [], artifacts: [] };
}
function handle(params = {}, session = {}, msgUid, auto) {
  const tag = auto ? 2501 : 2500;
  return mutation.run(session.userId, async () => {
    const original = session.player;
    if (!original) return { tag, msgUid, data: { rejected: true, reason: 'not_logged_in', result: 0, count: 0, failed: 0, rewardInfo: rewardInfo() } };
    const dayPackets = await require('../services/FarmDayService').synchronize(session);
    await playerService.drainPendingSaves(session.userId);
    const prior = receipts.read(original, tag, params);
    if (prior) return [
      ...dayPackets,
      { tag: 1202, msgUid: 0, data: { items: [], changed: require('../services/CurrencySync').buildClientItemList(original) } },
      { tag: 2500, msgUid: 0, data: { level: original.alchemyInfo.level, exp: original.alchemyInfo.exp } },
      { tag, msgUid, data: { ...prior, dayCount: original.alchemyInfo.dayCount, level: original.alchemyInfo.level, lv: original.alchemyInfo.level, exp: original.alchemyInfo.exp } },
    ];
    const draft = JSON.parse(JSON.stringify(original));
    const info = ensureAlchemyInfo(draft);
    let result;
    try { result = craft(draft, params, auto); } catch (_err) { result = { rejected: 'invalid_config' }; }
    if (result.rejected) return [...dayPackets, { tag, msgUid, data: { rejected: true, reason: result.rejected, result: 0, count: 0, failed: 0, level: info.level, exp: info.exp, dayCount: info.dayCount, rewardInfo: rewardInfo() } }];
    if (!session.userId) throw new Error('ALCHEMY_SESSION_ID_REQUIRED');
    draft.taskInfo = JSON.parse(JSON.stringify(original.taskInfo || {}));
    draft.other_attr_info = JSON.parse(JSON.stringify(original.other_attr_info || {}));
    draft.roleInfo = JSON.parse(JSON.stringify(original.roleInfo || {}));
    const taskChanged = !!addAlchemyGenerateCount(draft, result.count);
    const response = { result: auto ? result.stopReason || 0 : result.failed, failed: result.failed, id: params.id,
      count: result.count, level: info.level, lv: info.lv, exp: info.exp, dayCount: info.dayCount, rewardInfo: rewardInfo(result.items) };
    receipts.record(draft, tag, params, response);
    // Save only owned fields; never replace the live player with an old snapshot.
    try {
      const saved = await playerService.savePlayer(session.userId, { exp: original.exp || 0, items: draft.items, currencies: draft.currencies, alchemyInfo: info, taskInfo: draft.taskInfo, other_attr_info: draft.other_attr_info }, { returnSaved: false });
      if (!saved) throw new Error('ALCHEMY_SAVE_NOT_CONFIRMED');
    } catch (error) {
      runtime.getWsServer()?.invalidatePlayerForMutation(session.userId);
      session.player = null;
      throw error;
    }
    original.items = draft.items;
    original.currencies = draft.currencies;
    original.alchemyInfo = info;
    original.taskInfo = draft.taskInfo;
    original.other_attr_info = draft.other_attr_info;
    const packets = [{ tag: 1202, msgUid: 0, data: { result: 0, items: result.delta, changed: [...result.changed, { id: 41, count: info.exp }] } }];
    session._itemListCache = null;
    packets.push({ tag: 2500, msgUid: 0, data: { level: info.level, exp: info.exp, dayCount: info.dayCount } });
    if (taskChanged) {
      const task = require('./task');
      if (typeof task.buildActiveTaskUpdatePackets === 'function') packets.push(...task.buildActiveTaskUpdatePackets(original, 0));
    }
    packets.push({ tag, msgUid, data: response });
    return [...dayPackets, ...packets];
  });
}
module.exports = {
  ensureAlchemyInfo,
  handleGenerate: (p, s, m) => handle(p, s, m, false),
  handleAutoGenerate: (p, s, m) => handle(p, s, m, true),
};

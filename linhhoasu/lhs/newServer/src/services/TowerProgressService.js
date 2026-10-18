'use strict';

const clone = value => JSON.parse(JSON.stringify(value));
const FIELDS = ['swordInfo', 'items', 'currencies', 'other_attr_info', 'taskInfo'];
const int = value => Number.isSafeInteger(Number(value)) ? Math.max(0, Number(value)) : 0;

function slotLimit(info, config) {
  const base = config.get('TowerBaseConfig') || {};
  const cap = Math.max(0, ...Object.keys(config.get('TowerConfig') || {}).map(Number));
  const level = Math.min(int(info.curlayer) + 1, cap);
  return (base.attrCond || []).slice(0, int(base.attrCount)).filter(n => level >= Number(n)).length;
}

function sweepTarget(maxlayer, config) {
  const cap = Math.max(0, ...Object.keys(config.get('TowerConfig') || {}).map(Number));
  const highest = Math.min(int(maxlayer), cap);
  return Math.max(0, 10 * (Math.floor((highest === cap ? highest - 1 : highest) / 10) - 2));
}

// The existing tower handler grants milestones when crossing their floor.
// curlayer is the daily high-water mark: no retrospective claims or backpay.
function milestoneRewards(floor, config) {
  return clone((config.get('TowerRewardConfig') || {})[floor]?.rewards || []);
}

function create({ config, players, mutation, reset, receipts, rank, invalidate, logger, clock = Date.now }) {
  async function run(tag, params, session, uid, work) {
    return mutation.run(session?.userId, async () => {
      const fail = (code, msg) => ({ tag, msgUid: uid, data: { result: -1, code, msg } });
      if (!session?.player || !session.userId) return fail('TOWER_LOGIN_REQUIRED', 'Vui lòng đăng nhập lại.');
      const original = session.player;
      await players.drainPendingSaves(session.userId);
      const fresh = await players.loadTowerPlayer(session.userId);
      if (!fresh || String(fresh.playerId) !== String(original.playerId)) return fail('TOWER_PLAYER_CHANGED', 'Vui lòng đăng nhập lại.');
      const expected = {};
      for (const key of FIELDS) if (Object.hasOwn(fresh, key)) expected[key] = clone(fresh[key]);
      const draft = clone(fresh);
      reset.prepare(draft, clock());
      const draftSession = { ...session, player: draft, _towerTransaction: true };
      if (tag === 3705) {
        if (!/^[0-9]{13}-[a-zA-Z0-9_-]{8,64}$/.test(String(params?.requestId || ''))) return fail('TOWER_REQUEST_REQUIRED', 'Vui lòng tải lại game.');
        const replay = receipts.read(draft, tag, params);
        if (replay) {
          session.player = fresh;
          return { tag, msgUid: uid, data: { ...replay, replay: true, updateInfo: reset.snapshot(draft, clock()) } };
        }
      }
      const response = await work(params, draftSession, uid);
      const packets = Array.isArray(response) ? response : [response];
      const reply = packets.find(p => p.tag === tag && p.msgUid === uid);
      if (!reply || reply.data?.result !== 0) return response;
      if (tag === 3705) receipts.record(draft, tag, params, reply.data);
      try {
        const saved = await players.savePlayer(session.userId, draft, {
          returnSaved: false, onlyFields: FIELDS, towerCAS: { fields: FIELDS, expected },
        });
        if (!saved) throw Error('TOWER_CAS_CONFLICT');
      } catch (error) {
        invalidate(session.userId);
        session.player = null;
        logger.warn('[Tower] save not confirmed: ' + error.message);
        return fail('TOWER_SAVE_UNCONFIRMED', 'Chưa xác nhận được kết quả. Vui lòng đăng nhập lại trước khi tiếp tục.');
      }
      session.player = draft;
      session.lastBattle = draftSession.lastBattle;
      session._itemListCache = null;
      try { await rank.updateScore('tower', draft.playerId, int(draft.swordInfo?.maxlayer)); }
      catch (error) { logger.warn('[Tower] rank update failed: ' + error.message); }
      return response;
    });
  }

  async function sweep(params, session, uid) {
    return run(3705, params, session, uid, async (_params, draftSession) => {
      const player = draftSession.player, info = player.swordInfo;
      const from = int(info.curlayer) + 1, target = sweepTarget(info.maxlayer, config);
      const rewards = new Map();
      if (target >= from && (int(info.skillCount) > 0 || info.skills?.length)) {
        return { tag: 3705, msgUid: uid, data: { result: -1, code: 'TOWER_SKILL_PENDING', msg: 'Hãy chọn hoặc bỏ qua kỹ năng đang chờ trước khi quét.' } };
      }
      for (let floor = from; floor <= target; floor++) {
        const row = (config.get('TowerConfig') || {})[floor];
        if (!row) throw Error('TOWER_CONFIG_GAP');
        for (const r of [...(row.rewards || []), ...milestoneRewards(floor, config)]) {
          if (!int(r.id) || !int(r.count)) throw Error('TOWER_REWARD_INVALID');
          rewards.set(r.id, (rewards.get(r.id) || 0) + int(r.count));
        }
      }
      const count = Math.max(0, target - from + 1);
      const rows = [...rewards].map(([id, count]) => ({ id, count }));
      const { rewardInfo, syncRewards } = require('../handlers/raid').grantRewardInfo(player, rows);
      if (count) {
        info.curlayer = target;
        info.dailyCount = int(info.dailyCount) + count;
        info.score = int(info.score) + (from + target) * count * 5;
      }
      const data = { result: 0, sweepFrom: from, sweepTo: count ? target : int(info.curlayer), sweepCount: count, rewardInfo, updateInfo: reset.snapshot(player, clock()) };
      const packets = syncRewards.length ? [{ tag: 1202, msgUid: 0, data: require('./RewardSync').buildRewardItemSync(player, syncRewards) }] : [];
      return [...packets, { tag: 3705, msgUid: uid, data }];
    });
  }
  return { run, sweep };
}

function get() {
  return create({ config: require('./ConfigService'), players: require('./PlayerService'), mutation: require('./PlayerMutationService'),
    reset: require('./TowerDailyResetService'), receipts: require('./FeatureReceiptService'), rank: require('./RankService'),
    invalidate: id => require('./RuntimeBus').getWsServer()?.invalidatePlayerForMutation(id), logger: require('../logger') });
}
module.exports = { slotLimit, sweepTarget, milestoneRewards, create, get };

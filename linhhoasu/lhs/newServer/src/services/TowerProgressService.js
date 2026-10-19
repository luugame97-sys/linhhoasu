'use strict';

const clone = value => JSON.parse(JSON.stringify(value));
const crypto = require('crypto');
const FIELDS = ['swordInfo', 'items', 'currencies', 'other_attr_info', 'taskInfo'];
const int = value => Number.isSafeInteger(Number(value)) ? Math.max(0, Number(value)) : 0;

function offerId(info = {}) {
  if (!int(info.skillCount) || !info.skills?.length) return '';
  return crypto.createHash('sha256').update(JSON.stringify([
    info.towerDay, int(info.towerRevision), int(info.curlayer), int(info.skillCount), info.skills, info.slotlist || [],
  ])).digest('hex').slice(0, 32);
}

// One offer for each block of addAttr floors, beginning at 1, 11, 21, ... .
function countSkillPicks(from, to, config) {
  const interval = int(config.get('TowerBaseConfig')?.addAttr) || 10;
  return Math.max(0, Math.ceil(int(to) / interval) - Math.ceil(int(from) / interval));
}

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

function recordMilestone(info, floor, config) {
  if (!milestoneRewards(floor, config).length) return;
  info.claimedMilestones = [...new Set([...(info.claimedMilestones || []), floor])].sort((a, b) => a - b);
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
      const resetOnly = clone(draft);
      const draftSession = { ...session, player: draft, _towerTransaction: true };
      const receipted = tag === 3705 || tag === 3700;
      let response, replay = null;
      if (receipted) {
        if (!/^[0-9]{13}-[a-zA-Z0-9_-]{8,64}$/.test(String(params?.requestId || ''))) {
          response = fail('TOWER_CLIENT_UPDATE_REQUIRED', 'Vui lòng tải lại game để cập nhật tính năng tháp.');
        } else {
          try { replay = receipts.read(draft, tag, params); }
          catch (error) { response = fail(error.message, 'Yêu cầu đã hết hạn. Vui lòng mở lại bảng kỹ năng.'); }
        }
      }
      if (replay) response = { tag, msgUid: uid, data: { ...replay, replay: true } };
      if (!response) response = await work(params, draftSession, uid);
      const packets = Array.isArray(response) ? response : [response];
      const reply = packets.find(p => p.tag === tag && p.msgUid === uid);
      if (!reply) return response;
      const success = reply.data?.result === 0;
      const committed = success ? draft : resetOnly;
      const changed = FIELDS.some(key => JSON.stringify(committed[key]) !== JSON.stringify(fresh[key]));
      if (changed) committed.swordInfo.towerRevision = int(fresh.swordInfo?.towerRevision) + 1;
      const snapshot = reset.snapshot(committed, clock());
      reply.data = { ...reply.data, updateInfo: snapshot };
      // Native skill callbacks read these fields from the top level as well.
      if (tag !== 2300 && tag !== 3705) reply.data = { ...reply.data, ...snapshot, result: reply.data.result, updateInfo: snapshot };
      if (receipted && success && !replay) receipts.record(committed, tag, params, reply.data);
      if (changed || (receipted && success && !replay)) {
        try {
          const saved = await players.savePlayer(session.userId, committed, {
            returnSaved: false, onlyFields: FIELDS, towerCAS: { fields: FIELDS, expected },
          });
          if (!saved) throw Error('TOWER_CAS_CONFLICT');
        } catch (error) {
          invalidate(session.userId);
          session.player = null;
          logger.warn('[Tower] save not confirmed: ' + error.message);
          return fail('TOWER_SAVE_UNCONFIRMED', 'Chưa xác nhận được kết quả. Vui lòng đăng nhập lại trước khi tiếp tục.');
        }
      }
      session.player = committed;
      if (success) session.lastBattle = draftSession.lastBattle;
      session._itemListCache = null;
      try { if (changed) await rank.updateScore('tower', committed.playerId, int(committed.swordInfo?.maxlayer)); }
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
        recordMilestone(info, floor, config);
      }
      const count = Math.max(0, target - from + 1);
      const rows = [...rewards].map(([id, count]) => ({ id, count }));
      const { rewardInfo, syncRewards } = require('../handlers/raid').grantRewardInfo(player, rows);
      if (count) {
        info.curlayer = target;
        info.dailyCount = int(info.dailyCount) + count;
        info.score = int(info.score) + (from + target) * count * 5;
        require('../handlers/tower').grantTowerSkillChoice(info, target, countSkillPicks(from - 1, target, config));
      }
      const data = { result: 0, sweepFrom: from, sweepTo: count ? target : int(info.curlayer), sweepCount: count, rewardInfo, updateInfo: reset.snapshot(player, clock()) };
      const packets = syncRewards.length ? [{ tag: 1202, msgUid: 0, data: require('./RewardSync').buildRewardItemSync(player, syncRewards) }] : [];
      return [...packets, { tag: 3705, msgUid: uid, data }];
    });
  }
  async function snapshot(session, uid) {
    return run(3704, {}, session, uid, async (_params, current) => {
      const tower = require('../handlers/tower');
      const info = tower.ensureTowerInfo(current.player);
      tower.applyTowerAutoChoices(info);
      return { tag: 3704, msgUid: uid, data: { result: 0 } };
    });
  }
  return { run, sweep, snapshot };
}

function get() {
  return create({ config: require('./ConfigService'), players: require('./PlayerService'), mutation: require('./PlayerMutationService'),
    reset: require('./TowerDailyResetService'), receipts: require('./FeatureReceiptService'), rank: require('./RankService'),
    invalidate: id => require('./RuntimeBus').getWsServer()?.invalidatePlayerForMutation(id), logger: require('../logger') });
}
module.exports = { slotLimit, sweepTarget, milestoneRewards, recordMilestone, offerId, countSkillPicks, create, get };

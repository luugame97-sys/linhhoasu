'use strict';
const crypto = require('crypto');
const gameDay = require('./GameDayService');
const DAY = 86400000, HOUR = 3600000;
const dayKey = (now = Date.now()) => String(gameDay.key(now));
function weekKey(now = Date.now()) {
  const d = new Date(now + 7 * HOUR);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const y = d.getUTCFullYear();
  return `${y}-W${String(Math.ceil(((d - Date.UTC(y, 0, 1)) / DAY + 1) / 7)).padStart(2, '0')}`;
}
function rewardsForRank(period, rank) {
  const config = require('./ConfigService');
  const rows = Object.values(config.get(period === 'week' ? 'ArenaWeeklyRankRewardConfig' : 'ArenaDayRankRewardConfig') || {});
  const row = rows.find((r) => rank >= Number(r.rankMin) && rank <= Number(r.rankMax));
  return (row && Array.isArray(row.rewards) ? row.rewards : []).map((r) => ({ id: Number(r.id), count: Number(r.count) }))
    .filter((r) => Number.isSafeInteger(r.id) && r.id > 0 && Number.isSafeInteger(r.count) && r.count > 0);
}
function dueCutoffs(activationAt, now) {
  const due = [];
  if (!Number.isFinite(activationAt) || activationAt <= 0 || now < activationAt) return due;
  let cutoff = gameDay.end(activationAt) - HOUR;
  if (cutoff < activationAt) cutoff += DAY;
  // Bounded enumeration; scheduler uses the durable completed checkpoint.
  for (; cutoff <= now && due.length < 32; cutoff += DAY) {
    due.push({ period: 'day', cutoffAt: cutoff });
    if (new Date(cutoff + 7 * HOUR).getUTCDay() === 0) due.push({ period: 'week', cutoffAt: cutoff });
  }
  return due;
}
function createService(deps = {}) {
  const Settlement = deps.Settlement || require('../db/models/ArenaSettlement');
  const Mail = deps.Mail || require('../db/models/Mail');
  const Player = deps.Player || require('../db/models/Player');
  const clock = deps.clock || Date.now;
  const serverId = Number(deps.serverId || process.env.SERVER_ID || process.env.DEFAULT_SERVER_ID || 1001);
  const activationAt = Number(deps.activationAt || process.env.ARENA_SETTLEMENT_ACTIVATION_AT || 0);
  const enabled = deps.enabled === undefined ? process.env.ARENA_SETTLEMENT_ENABLED === '1' : deps.enabled === true;
  const approved = deps.approved === undefined ? process.env.ARENA_SETTLEMENT_APPROVED === '1' : deps.approved === true;
  const leaseMs = Math.max(1000, Number(deps.leaseMs) || 60000);
  const rewardFor = deps.rewardsForRank || rewardsForRank;
  async function settleArenaPeriod(period, cutoffAt) {
    if (!enabled || !approved) return { skipped: true, reason: 'DISABLED' };
    if (!Number.isSafeInteger(serverId) || serverId < 1) throw new Error('ARENA_SETTLEMENT_SERVER_INVALID');
    if (!activationAt || cutoffAt < activationAt || cutoffAt > clock() ||
        !dueCutoffs(cutoffAt, cutoffAt).some((x) => x.period === period && x.cutoffAt === cutoffAt)) {
      throw new Error('ARENA_SETTLEMENT_CUTOFF_OUTSIDE_ACTIVATION');
    }
    const periodKey = period === 'week' ? weekKey(cutoffAt) : dayKey(cutoffAt);
    const id = `arena_${serverId}_${period}_${periodKey}`;
    let frozen = await Settlement.findById(id).lean();
    if (!frozen) {
      if (typeof deps.snapshotProvider !== 'function') throw new Error('ARENA_SETTLEMENT_SNAPSHOT_PROVIDER_REQUIRED');
      // No fallback to live Redis. Provider must own exact-cutoff historical correctness.
      const snapshot = await deps.snapshotProvider({ serverId, period, periodKey, cutoffAt });
      if (!snapshot || snapshot.cutoffAt !== cutoffAt || !Array.isArray(snapshot.rows) || snapshot.complete !== true) throw new Error('ARENA_SETTLEMENT_SNAPSHOT_NOT_FINAL');
      if (snapshot.rows.length > 10000) throw new Error('ARENA_SETTLEMENT_ROSTER_TOO_LARGE');
      const seen = new Set();
      const recipients = snapshot.rows.map((r, i) => {
        if (!r.playerId || !r.userId || r.rank !== i + 1 || !Number.isFinite(r.score) || seen.has(String(r.playerId))) throw new Error('ARENA_SETTLEMENT_INVALID_ROSTER');
        seen.add(String(r.playerId));
        const eventKey = `${id}_${r.playerId}`;
        return { playerId: String(r.playerId), userId: String(r.userId), name: String(r.name || ''), rank: r.rank, score: r.score, eventKey,
          mailId: crypto.createHash('sha256').update(eventKey).digest('hex').slice(0, 24), attachments: rewardFor(period, r.rank) };
      });
      const encoded = JSON.stringify(recipients);
      if (Buffer.byteLength(encoded) > 8 * 1024 * 1024) throw new Error('ARENA_SETTLEMENT_ROSTER_TOO_LARGE');
      try {
        await Settlement.create({ _id: id, serverId, period, periodKey, cutoffAt, activationAt,
          snapshotHash: crypto.createHash('sha256').update(encoded).digest('hex'), recipients, delivered: [], expired: [],
          state: 'pending', leaseUntil: 0, leaseOwner: '' });
      } catch (err) { if (err.code !== 11000) throw err; }
    }
    const owner = crypto.randomBytes(16).toString('hex');
    frozen = await Settlement.findOneAndUpdate({ _id: id, state: { $ne: 'done' }, leaseUntil: { $lte: clock() } },
      { $set: { leaseOwner: owner, leaseUntil: clock() + leaseMs, state: 'sending' }, $inc: { attempts: 1 } }, { new: true }).lean();
    if (!frozen) return { skipped: true, reason: 'DONE_OR_LEASED', id };
    try {
      for (const r of frozen.recipients) {
        if (frozen.delivered.includes(r.playerId) || (frozen.expired || []).includes(r.playerId)) continue;
        const held = await Settlement.updateOne({ _id: id, leaseOwner: owner, state: 'sending' }, { $set: { leaseUntil: clock() + leaseMs } });
        if (!held.matchedCount) throw new Error('ARENA_SETTLEMENT_LEASE_LOST');
        const expireAt = cutoffAt + 30 * DAY;
        // Never resurrect expired mails after TTL deletion on a very late retry.
        if (r.attachments.length && clock() < expireAt) {
          const claimed = await Player.findOne({ userId: r.userId, mailClaimLedger: r.mailId }).select({ _id: 1 }).lean();
          if (!claimed) {
          try {
            await Mail.create({ _id: r.mailId, userId: r.userId, eventKey: r.eventKey, targetServerId: serverId,
              title: period === 'week' ? 'Phần thưởng Võ Đạo Hội tuần' : 'Phần thưởng Võ Đạo Hội ngày',
              content: `Võ Đạo Hội server ${serverId}: hạng ${r.rank}.`, sender: 'Hệ thống', attachments: r.attachments, expireAt: new Date(expireAt) });
          } catch (err) {
            if (err.code !== 11000) throw err;
            const existing = await Mail.findById(r.mailId).lean();
            if (!existing || existing.userId !== r.userId || existing.eventKey !== r.eventKey) throw new Error('ARENA_SETTLEMENT_MAIL_COLLISION');
          }
          }
          if (Number(r.rank) <= 3 && deps.publicNotify) {
            try { await deps.publicNotify({ eventKey: id, playerId: r.playerId, userId: r.userId, name: r.name, serverId, rank: r.rank, score: r.score, event: period === 'week' ? 'Võ Đạo Hội tuần' : 'Võ Đạo Hội ngày' }); } catch (_) { /* notification cannot block delivery */ }
          }
        }
        const receiptField = r.attachments.length && clock() >= expireAt ? 'expired' : 'delivered';
        const receipt = await Settlement.updateOne({ _id: id, leaseOwner: owner }, { $addToSet: { [receiptField]: r.playerId } });
        if (!receipt.matchedCount) throw new Error('ARENA_SETTLEMENT_LEASE_LOST');
      }
      const done = await Settlement.updateOne({ _id: id, leaseOwner: owner }, { $set: { state: 'done', completedAt: clock(), leaseUntil: 0, leaseOwner: '', lastError: '' } });
      if (!done.matchedCount) throw new Error('ARENA_SETTLEMENT_LEASE_LOST');
      return { id, recipients: frozen.recipients.length, state: 'done' };
    } catch (err) {
      await Settlement.updateOne({ _id: id, leaseOwner: owner }, { $set: { state: 'pending', leaseUntil: 0, leaseOwner: '', lastError: String(err.message).slice(0, 300) } });
      throw err;
    }
  }
  async function tick() {
    if (!enabled || !approved || !activationAt) return [];
    // Cursor lives on the first day document and advances only contiguously.
    // Never infer it from max(completed cutoff): a later direct run could hide gaps.
    const first = dueCutoffs(activationAt, clock())[0];
    if (!first) return [];
    const cursorId = `arena_${serverId}_day_${dayKey(first.cutoffAt)}`;
    const checkpoint = await Settlement.findById(cursorId).lean();
    const start = checkpoint && checkpoint.cursorAt >= first.cutoffAt ? checkpoint.cursorAt + 1 : activationAt;
    const dues = dueCutoffs(start, clock());
    const results = [];
    for (const due of dues) {
      try {
        results.push(await settleArenaPeriod(due.period, due.cutoffAt));
        const key = due.period === 'week' ? weekKey(due.cutoffAt) : dayKey(due.cutoffAt);
        const verified = await Settlement.findById(`arena_${serverId}_${due.period}_${key}`).lean();
        if (!verified || verified.state !== 'done') break;
        if (due.period === 'day' && new Date(due.cutoffAt + 7 * HOUR).getUTCDay() === 0) continue;
        await Settlement.updateOne({ _id: cursorId }, { $max: { cursorAt: due.cutoffAt } });
      }
      catch (err) { results.push({ ...due, error: err.message }); break; }
    }
    return results;
  }
  function startArenaSettlementScheduler() {
    if (!enabled || !approved || !activationAt) return { enabled: false, stop() {} };
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try { for (const r of await tick()) if (r.error) (deps.logger || require('../logger')).error(`[ArenaSettlement] ${r.error}`); }
      finally { running = false; }
    };
    const safeRun = () => { void run().catch((e) => (deps.logger || require('../logger')).error(`[ArenaSettlement] ${e.message}`)); };
    const timer = setInterval(safeRun, 30000);
    if (timer.unref) timer.unref();
    safeRun();
    return { enabled: true, stop: () => clearInterval(timer), tick };
  }
  return { settleArenaPeriod, tick, startArenaSettlementScheduler };
}
module.exports = { dayKey, weekKey, dueCutoffs, rewardsForRank, createService,
  settleArenaPeriod: (...args) => createService().settleArenaPeriod(...args),
  startArenaSettlementScheduler: (options = {}) => createService(options).startArenaSettlementScheduler() };

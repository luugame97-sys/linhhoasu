'use strict';
const crypto = require('node:crypto');
const schedule = require('./OldTrekScheduleService');
const hash = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const DAY = 86400000;
function rewardFor(table, rank, arena) {
  const rows = Object.values(table || {}).filter(r => rank >= Number(arena ? r.rankRange : r.rankMin) && rank <= Number(arena ? r.endRange : r.rankMax));
  if (rows.length > 1) throw Error('OLD_TREK_RANK_OVERLAP');
  const rewards = rows.length ? rows[0][arena ? 'reward' : 'rewards'] : [];
  if (!Array.isArray(rewards) || rewards.some(r => !Number.isSafeInteger(r.id) || r.id < 1 || !Number.isSafeInteger(r.count) || r.count < 1)) throw Error('OLD_TREK_RANK_REWARD_INVALID');
  return rewards.map(r => ({ id: r.id, count: r.count }));
}
function rowsFor(players, season, arena) {
  const rows = [], seen = new Set();
  for (const p of players) {
    if (p.isBot || p.managedBot || /^lhs_real_bot_|^qa_/.test(p.userId || '') || !p.userId || seen.has(p.userId)) continue;
    const info = p.other_attr_info?.oldTrekInfo || {}, old = Number(info.season) === season ? info : info.seasonArchives?.[season];
    if (!old) continue;
    const score = Number(arena ? (old === info ? p.oldTrekArenaScore : old.arenaScore) : old.totalDistance) || 0;
    // Exclude untouched 1000-point arena entries; no login participation reward.
    if (score <= 0 || arena && score === 1000 && !(old.arenaPlayed || info.arenaBattleLogs?.length)) continue;
    seen.add(p.userId); rows.push({ userId: p.userId, playerId: String(p.playerId), score });
  }
  return rows.sort((a,b) => b.score-a.score || a.playerId.localeCompare(b.playerId)).map((r,i) => ({ ...r, rank: i+1 }));
}
function createService(options = {}) {
  const enabled = options.enabled === true, serverId = Number(options.serverId), activationAt = Number(options.activationAt), clock = options.clock || Date.now;
  const cfg = options.config || require('./ConfigService'), Player = options.Player || require('../db/models/Player'), Mail = options.Mail || require('../db/models/Mail'), Settlement = options.Settlement || require('../db/models/EventRewardSettlement');
  const logger = options.logger || require('../logger');
  let running = null;
  async function snapshot(season, arena) {
    if (options.readPlayers) return rowsFor(await options.readPlayers(), season, arena);
    const ids = await Player.find({ serverId, isBot: { $ne: true }, managedBot: { $ne: true } }).select({ userId: 1 }).lean();
    return require('./PlayerMutationService').runMany(ids.map(x => x.userId), async () => {
      for (const row of ids) await require('./PlayerService').drainPendingSaves(row.userId);
      const players = await Player.find({ serverId, isBot: { $ne: true }, managedBot: { $ne: true } }).select({
        userId: 1, playerId: 1, isBot: 1, managedBot: 1, oldTrekArenaScore: 1, 'other_attr_info.oldTrekInfo': 1,
      }).maxTimeMS(10000).lean();
      return rowsFor(players, season, arena);
    });
  }
  async function settle(season, endTime, arena) {
    if (!enabled) return { skipped: 'disabled' };
    if (!Number.isSafeInteger(activationAt) || activationAt <= 0 || endTime < activationAt || clock() < endTime + 60000) throw Error('OLD_TREK_CUTOFF_NOT_DUE');
    const id = `oldtrek-v1:${serverId}:${season}:${arena ? 'arena' : 'sail'}`;
    let frozen = await Settlement.findById(id).lean();
    if (frozen?.state === 'done') return { id, skipped: 'done' };
    if (!frozen) {
      const roster = await snapshot(season, arena), table = cfg.get(arena ? 'OldTrekArenaRankConfig' : 'OldTrekSailRankRewardConfig');
      if (!table || !Object.keys(table).length) throw Error('OLD_TREK_RANK_CONFIG_MISSING');
      const recipients = roster.map(row => {
        const attachments = rewardFor(table, row.rank, arena), eventKey = `${id}:${hash(row.playerId).slice(0,24)}`;
        return { ...row, attachments, eventKey, mailId: hash(eventKey).slice(0,24) };
      });
      if (Buffer.byteLength(JSON.stringify(recipients)) > 8*1024*1024) throw Error('OLD_TREK_ROSTER_TOO_LARGE');
      try { await Settlement.create({ _id: id, serverId, event: { kind: 'oldtrek', season, endTime, arena }, recipients, snapshotHash: hash(recipients), state: 'pending', delivered: [], expired: [] }); }
      catch (e) { if (e.code !== 11000) throw e; }
      frozen = await Settlement.findById(id).lean();
    }
    if (!frozen || frozen.serverId !== serverId || frozen.snapshotHash !== hash(frozen.recipients)) throw Error('OLD_TREK_SNAPSHOT_INVALID');
    for (const row of frozen.recipients) {
      if (frozen.delivered.includes(row.playerId) || frozen.expired.includes(row.playerId)) continue;
      const expired = clock() >= frozen.event.endTime + 30*DAY;
      if (!expired && row.attachments.length) {
        let mail = await Mail.findById(row.mailId).lean();
        if (!mail && !await Player.findOne({ userId: row.userId, serverId, mailClaimLedger: row.mailId }).select({ _id: 1 }).lean()) {
          const title = arena ? 'Hoang Cổ: thưởng Đấu trường' : 'Hoang Cổ: thưởng Hải trình';
          try { mail = await Mail.create({ _id: row.mailId, userId: row.userId, eventKey: row.eventKey, attachments: row.attachments, title,
            content: `Mùa ${season}, hạng ${row.rank}.`, text: `Mùa ${season}, hạng ${row.rank}.`, sender: '0', targetType: 'user', targetServerId: serverId,
            batchId: id, createdBy: 'oldtrek-v1', expireAt: new Date(frozen.event.endTime + 30*DAY) }); }
          catch (e) { if (e.code !== 11000) throw e; mail = await Mail.findById(row.mailId).lean(); if (!mail) throw e; }
        }
        if (mail && (String(mail.userId) !== row.userId || mail.eventKey !== row.eventKey || hash(mail.attachments) !== hash(row.attachments))) throw Error('OLD_TREK_MAIL_COLLISION');
        if (mail && options.pushMail) try { options.pushMail(row.userId, mail); } catch (_) { /* relog reads durable mail */ }
      }
      await Settlement.updateOne({ _id: id }, { $addToSet: { [expired ? 'expired' : 'delivered']: row.playerId } });
    }
    await Settlement.updateOne({ _id: id }, { $set: { state: 'done', completedAt: clock() } });
    return { id, state: 'done', recipients: frozen.recipients.length };
  }
  function tick() {
    if (!enabled) return Promise.resolve([]);
    if (running) return running;
    running = (async () => {
      const current = schedule.getSchedule(clock()), first = schedule.getSchedule(activationAt);
      const output = [];
      // Bounded historical enumeration from explicit activation; never pay
      // seasons earlier than the feature's first approved activation.
      for (let season = first.seasonNumber; season < current.seasonNumber && season < first.seasonNumber+400; season++) {
        const endTime = schedule.anchorTimeMs + season * schedule.cycleDurationMs;
        if (endTime < activationAt || clock() < endTime+60000) continue;
        output.push(await settle(season, endTime, false), await settle(season, endTime, true));
      }
      return output;
    })().finally(() => { running = null; });
    return running;
  }
  function start() {
    if (!enabled) return { stop: async () => {} };
    if (!Number.isSafeInteger(activationAt) || activationAt <= 0) throw Error('OLD_TREK_ACTIVATION_REQUIRED');
    const run = () => void tick().catch(e => logger.error('[OldTrekSettlement] ' + e.message));
    const timer = setInterval(run, 30000); timer.unref?.(); run();
    return { tick, stop: async () => { clearInterval(timer); if (running) await running; } };
  }
  return { snapshot, settle, tick, start };
}
module.exports = { createService, rowsFor, rewardFor };

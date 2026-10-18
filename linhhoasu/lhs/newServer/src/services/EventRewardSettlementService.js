'use strict';
const crypto = require('crypto');
const policy = require('../config/eventRewardSettlement.json');
const newYear = require('./NewYearEventSchedule');
const rotation = require('./EventRotationRegistry');
const DAY = 86400000;
const sha = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const textOrder = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function rewardFor(table, rank, event = null) {
  if (!table || !Object.keys(table).length) throw new Error('EVENT_RANK_CONFIG_MISSING');
  const matches = Object.values(table).filter(r => rank >= Number(r.rankMin) && rank <= Number(r.rankMax));
  if (matches.length > 1) throw new Error('EVENT_RANK_CONFIG_OVERLAP');
  if (!matches.length) return [];
  const rewards = matches[0].rewards;
  if (!Array.isArray(rewards) || !rewards.length || rewards.some(r =>
    !Number.isSafeInteger(r.id) || r.id <= 0 || !Number.isSafeInteger(r.count) || r.count <= 0)) {
    throw new Error('EVENT_RANK_REWARDS_INVALID');
  }
  const result = rewards.map(r => ({ id: r.id, count: r.count }));

  // Fail-safe protection for Fishing Contest 6006 (Đại hội câu cá):
  // Always guarantee 3-star Fashion Choice Box (item 99002) is present in rewards
  if (event && (Number(event.id) === 6006 || Number(event.contestId) === 6006)) {
    const hasFashionBox = result.some(r => Number(r.id) === 99002);
    if (!hasFashionBox) {
      let boxCount = 2;
      if (rank === 1) boxCount = 10;
      else if (rank === 2) boxCount = 7;
      else if (rank === 3) boxCount = 5;
      else if (rank <= 10) boxCount = 3;
      result.unshift({ id: 99002, count: boxCount });
    }
  }

  return result;
}

function dueEvents(serverId, now, activationAt, rules = policy, fishingRules = require('../config/fishingGameplayBalance.json').schedule) {
  if (!Number.isSafeInteger(activationAt) || activationAt <= 0) throw new Error('EVENT_ACTIVATION_REQUIRED');
  const out = [];
  const legacy = rules.newYearWindows[String(serverId)];
  if (legacy && legacy.endTime >= activationAt && legacy.endTime + rules.graceMs <= now) {
    for (const id of [44001, 44002, 44051, 44052]) out.push({ kind: 'kimma', id, ...legacy });
  }
  const kimmaFamily = rotation.getFamily('new_year_monster');
  if (kimmaFamily && rotation.isEnabled(kimmaFamily) && Number.isFinite(Date.parse(kimmaFamily.anchor))) {
    const anchor = Date.parse(kimmaFamily.anchor);
    const periodMs = Math.max(1, Number(kimmaFamily.periodDays) || 1) * DAY;
    const lastIndex = Math.floor((now - anchor - rules.graceMs) / periodMs);
    for (let index = 0; index <= lastIndex; index += 1) {
      const startTime = anchor + index * periodMs;
      const endTime = startTime + periodMs;
      if (endTime < activationAt || endTime + rules.graceMs > now) continue;
      const id = kimmaFamily.ids[index % kimmaFamily.ids.length];
      out.push({ kind: 'kimma', id, key: `${kimmaFamily.key}:${index}:${startTime}`, startTime, endTime, includeLegacyWindows: false });
    }
  }
  const start = Date.parse(fishingRules.anchor);
  const repeatForever = rotation.isRepeating('fishing');
  const legacyEnd = start + fishingRules.durationDays * DAY;
  const end = repeatForever ? Number.POSITIVE_INFINITY : legacyEnd;
  if (fishingRules.enabled && Number.isFinite(start) && fishingRules.periodDays > 0) {
    const periodMs = fishingRules.periodDays * DAY;
    const legacyPeriods = Math.ceil(fishingRules.durationDays / fishingRules.periodDays);
    const firstPeriod = now >= legacyEnd && repeatForever ? legacyPeriods : 0;
    const firstFrom = now >= legacyEnd && repeatForever ? legacyEnd : start;
    const firstEnd = now >= legacyEnd && repeatForever ? now + periodMs : legacyEnd;
    for (let from = firstFrom, period = firstPeriod; from < firstEnd && period < firstPeriod + 400; from += periodMs, period++) {
      const to = repeatForever && from >= legacyEnd ? from + periodMs : Math.min(legacyEnd, from + periodMs);
      if (to < activationAt || to + rules.graceMs > now) continue;
      const id = fishingRules.rotation[period % fishingRules.rotation.length];
      for (const eventId of [fishingRules.contestId, id]) out.push({ kind: 'fishing', id: eventId,
        key: 'F' + eventId + '_' + from, startTime: from, endTime: to });
    }
  }
  return out;
}

function collectRank(players, event, serverId) {
  const seenPlayers = new Set(), seenUsers = new Set(), result = [];
  for (const p of players) {
    if (Number(p.serverId) !== Number(serverId) || p.isBot === true || p.managedBot === true) continue;
    const playerId = String(p.playerId || ''), userId = String(p.userId || '');
    let row;
    if (event.kind === 'kimma') {
      const entries = (p.activityInfo?.datas || []).filter(r => Number(r.id) === event.id && newYear.belongs(r, event));
      if (entries.length > 1) throw new Error('EVENT_DUPLICATE_PLAYER_ROW');
      row = entries[0];
    } else {
      row = p.fishInfo?.eventStats?.[event.key];
      if (row && (Number(row.id) !== event.id || Number(row.start) !== event.startTime || Number(row.end) !== event.endTime)) {
        throw new Error('EVENT_FISH_WINDOW_MISMATCH');
      }
    }
    if (!row) continue;
    const score = Number(event.kind === 'kimma' ? row.record : row.score);
    if (!Number.isFinite(score) || score < 0) throw new Error('EVENT_SCORE_INVALID');
    if (!score) continue;
    if (!playerId || !userId || seenPlayers.has(playerId) || seenUsers.has(userId)) throw new Error('EVENT_IDENTITY_INVALID');
    seenPlayers.add(playerId); seenUsers.add(userId);
    // Previously-paid competitors remain in rank; only delivery is skipped.
    result.push({ playerId, userId, name: String(p.name || ''), score,
      legacyPaid: event.kind === 'fishing' && row.settled === true });
  }
  return result.sort((a, b) => b.score - a.score || textOrder(a.playerId, b.playerId))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

function settlementId(serverId, event) {
  return 'event_rank_v2_' + serverId + '_' + event.id + '_' + sha([event.kind, event.key, event.startTime, event.endTime]).slice(0, 24);
}

function createService(options = {}) {
  const Player = options.Player || require('../db/models/Player');
  const Mail = options.Mail || require('../db/models/Mail');
  const Settlement = options.Settlement || require('../db/models/EventRewardSettlement');
  const config = options.config || require('./ConfigService');
  const logger = options.logger || require('../logger');
  const clock = options.clock || Date.now;
  const serverId = Number(options.serverId || process.env.SERVER_ID);
  const activationAt = Number(options.activationAt || process.env.EVENT_SETTLEMENT_ACTIVATION_AT || policy.activationAt);
  const enabled = options.enabled === undefined ? process.env.EVENT_SETTLEMENT_ENABLED === '1' : options.enabled === true;
  const validateRewards = options.validateRewards || (r => require('./RewardGrantService').assertRewardRowsSupported(r));
  const rules = options.policy || policy;
  let running = null;

  function tableFor(event) {
    return config.get(event.kind === 'kimma' ? 'Activity44RankConfig' : event.id === 6006 ? 'Activity6RankConfig' : 'Activity33RankConfig')?.[event.id];
  }
  function filterFor(event) {
    const filter = { serverId, isBot: { $ne: true }, managedBot: { $ne: true } };
    if (event.kind === 'kimma') filter['activityInfo.datas.id'] = event.id;
    else filter['fishInfo.eventStats.' + event.key + '.score'] = { $gt: 0 };
    return filter;
  }
  async function snapshot(event) {
    const filter = filterFor(event);
    const capture = async () => {
      const players = options.readPlayers ? await options.readPlayers(event) : await Player.find(filter)
        .select({ userId: 1, playerId: 1, name: 1, serverId: 1, isBot: 1, managedBot: 1,
          ...(event.kind === 'kimma' ? { 'activityInfo.datas': 1 } : { ['fishInfo.eventStats.' + event.key]: 1 }) })
        .maxTimeMS(10000).lean();
      return collectRank(players, event, serverId);
    };
    if (options.readPlayers) return capture();
    // Lock/drain accepted pre-cutoff saves. No scheduler writes to Player.
    const ids = await Player.find({ serverId, isBot: { $ne: true }, managedBot: { $ne: true } })
      .select({ userId: 1 }).maxTimeMS(5000).lean();
    const users = ids.map(p => p.userId);
    return require('./PlayerMutationService').runMany(users, async () => {
      for (const uid of users) await require('./PlayerService').drainPendingSaves(uid);
      return capture();
    });
  }

  async function settle(event) {
    if (!enabled) return { skipped: 'disabled' };
    if (!Number.isSafeInteger(serverId) || serverId <= 0 || event.endTime < activationAt ||
        event.endTime + rules.graceMs > clock()) throw new Error('EVENT_CUTOFF_NOT_DUE');
    const id = settlementId(serverId, event);
    let frozen = await Settlement.findById(id).lean();
    if (frozen?.state === 'done') return { id, skipped: 'done' };
    const table = tableFor(event);
    // Minigame 33001/33002 has no ranking reward table by design.
    if (!table && event.kind === 'fishing' && config.get('Activity33Config')?.[event.id]?.type === 1) return { id, skipped: 'not-ranked' };
    if (!frozen) {
      if (!table || !Object.keys(table).length) throw new Error('EVENT_RANK_CONFIG_MISSING');
      const roster = await snapshot(event);
      const compensated = new Set();
      if (event.kind === 'kimma' && event.includeLegacyWindows && roster.length) {
        const mails = await Mail.find({ batchId: rules.legacyCompensationBatch, userId: { $in: roster.map(r => r.userId) } }).select({ userId: 1 }).lean();
        mails.forEach(m => compensated.add(String(m.userId)));
        const receipt = await Settlement.findById('kimma_compensation_receipt_' + serverId + '_20260913').lean();
        (receipt?.delivered || []).forEach(uid => compensated.add(uid));
      }
      const recipients = roster.map(r => {
        const attachments = rewardFor(table, r.rank, event); validateRewards(attachments);
        const eventKey = id + ':' + sha(r.playerId).slice(0, 24);
        return { ...r, attachments, eventKey, mailId: sha(eventKey).slice(0, 24),
          skip: r.legacyPaid ? 'legacy-direct-paid' : compensated.has(r.userId) ? 'compensated-top123' : attachments.length ? '' : 'outside-reward-range' };
      });
      if (Buffer.byteLength(JSON.stringify(recipients)) > 8 * 1024 * 1024) throw new Error('EVENT_SNAPSHOT_TOO_LARGE');
      try { await Settlement.create({ _id: id, serverId, event, snapshotHash: sha(recipients), recipients,
        delivered: [], expired: [], state: 'pending' }); }
      catch (e) { if (e.code !== 11000) throw e; }
      frozen = await Settlement.findById(id).lean();
    }
    if (!frozen || frozen.serverId !== serverId || frozen.snapshotHash !== sha(frozen.recipients)) throw new Error('EVENT_SNAPSHOT_INVALID');
    const done = new Set([...(frozen.delivered || []), ...(frozen.expired || [])]);
    let inserted = 0;
    for (const r of frozen.recipients) {
      if (done.has(r.playerId)) continue;
      const expireAt = frozen.event.endTime + 30 * DAY;
      if (!r.skip && clock() < expireAt) {
        validateRewards(r.attachments);
        let existing = await Mail.findById(r.mailId).lean();
        if (!existing) {
          const claimed = await Player.findOne({ serverId, userId: r.userId, mailClaimLedger: r.mailId }).select({ _id: 1 }).lean();
          if (!claimed) {
            const title = event.kind === 'kimma' ? 'Phần thưởng xếp hạng Kim Mã' : 'Phần thưởng xếp hạng thi câu cá';
            const content = title + ': hạng ' + r.rank + ', điểm ' + r.score + '.';
            try { existing = await Mail.create({ _id: r.mailId, userId: r.userId, eventKey: r.eventKey, title, content, text: content,
              sender: '0', attachments: r.attachments, targetType: 'user', targetServerId: serverId,
              batchId: id, createdBy: 'event-settlement-v2', expireAt: new Date(expireAt) }); inserted++; }
            catch (e) { if (e.code !== 11000) throw e; existing = await Mail.findById(r.mailId).lean(); if (!existing) throw e; }
          }
        }
        if (existing && (String(existing.userId) !== r.userId || existing.eventKey !== r.eventKey || sha(existing.attachments) !== sha(r.attachments))) throw new Error('EVENT_MAIL_COLLISION');
        if (existing && options.pushMail) try { options.pushMail(r.userId, existing); } catch (_) { /* relog reads durable mail */ }
        if (existing && Number(r.rank) <= 3 && options.publicNotify) {
          try { await options.publicNotify({ eventKey: id, playerId: r.playerId, userId: r.userId, name: r.name, serverId, rank: r.rank, score: r.score, event: event.kind === 'kimma' ? 'Kim Mã' : 'Đại hội câu cá' }); } catch (_) { /* notification cannot block reward delivery */ }
        }
      }
      const field = !r.skip && clock() >= expireAt ? 'expired' : 'delivered';
      await Settlement.updateOne({ _id: id }, { $addToSet: { [field]: r.playerId } });
    }
    await Settlement.updateOne({ _id: id }, { $set: { state: 'done', completedAt: clock(), lastError: '' } });
    return { id, state: 'done', recipients: frozen.recipients.length, inserted };
  }

  async function runTick() {
    const result = [];
    for (const e of dueEvents(serverId, clock(), activationAt, rules, options.fishingRules)) {
      try { result.push(await settle(e)); }
      catch (error) { logger.error('[EventSettlement] ' + e.id + ': ' + error.message); result.push({ id: e.id, error: error.message }); }
    }
    return result;
  }
  function tick() {
    if (!enabled) return Promise.resolve([{ skipped: 'disabled' }]);
    if (running) return running;
    running = runTick().finally(() => { running = null; }); return running;
  }
  function start() {
    if (!enabled) return { enabled: false, stop: async () => {} };
    const run = () => void tick().catch(e => logger.error('[EventSettlement] ' + e.message));
    const timer = setInterval(run, 30000); timer.unref?.(); run();
    logger.warn('[EventSettlement] enabled v2 server=' + serverId + ' activation=' + activationAt);
    return { enabled: true, tick, stop: async () => { clearInterval(timer); if (running) await running; } };
  }
  return { settle, snapshot, tick, start };
}
module.exports = { createService, collectRank, dueEvents, rewardFor, settlementId };

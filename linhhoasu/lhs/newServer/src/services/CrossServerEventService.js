'use strict';
const crypto = require('crypto');
const schedule = require('../config/crossServerEventSchedule.json');
const Entry = require('../db/models/CrossEventEntry');
const DAY = 86400000;
const EVENTS = Object.freeze(['crossRival', 'crossArena', 'topArena']);
function cycleAt(now = Date.now(), rules = schedule) {
  const anchor = Date.parse(rules.anchor);
  const period = Math.max(1, Number(rules.periodDays) || 7) * DAY;
  if (!rules.enabled || !Number.isFinite(anchor) || now < anchor) return null;
  const index = Math.floor((now - anchor) / period);
  const startTime = anchor + index * period;
  const endTime = startTime + period;
  const rotation = Array.isArray(rules.rotation) && rules.rotation.length ? rules.rotation : EVENTS;
  return { index, event: rotation[index % rotation.length], startTime, endTime, key: `C${index}_${startTime}` };
}
function getServerIds(rules = schedule) {
  const ids = new Set((Array.isArray(rules.serverIds) ? rules.serverIds : []).map(Number).filter(Number.isFinite));
  const pool = rules.serverPool || {};
  if (pool.autoInclude === true && pool.mode === 'page') {
    const pageId = Math.max(1, Number(pool.pageId) || 1);
    const min = Math.max(pageId * 1000 + 1, Number(pool.minServerId) || (pageId * 1000 + 1));
    const max = Math.min(pageId * 1000 + 999, Number(pool.maxServerId) || (pageId * 1000 + 999));
    for (let id = min; id <= max; id += 1) ids.add(id);
  }
  return [...ids].sort((a, b) => a - b);
}
function isServerAllowed(serverId) { return getServerIds().includes(Number(serverId)); }
// The featured rotation keeps its original C0 key. Independent seasons use a
// separate namespace and never exist before their explicit activation time.
function cycleFor(event, now = Date.now(), rules = schedule) {
  const track = rules.independent && rules.independent[event];
  if (!track) {
    const cycle = cycleAt(now, rules);
    return cycle && cycle.event === event ? cycle : null;
  }
  const anchor = Date.parse(track.anchor), activation = Date.parse(track.activationAt);
  const period = Math.max(1, Number(track.periodDays) || 7) * DAY;
  if (!rules.enabled || !Number.isFinite(anchor) || !Number.isFinite(activation)
      || now < Math.max(anchor, activation)) return null;
  const index = Math.floor((now - anchor) / period), weekStart = anchor + index * period;
  const startTime = Math.max(weekStart, activation), endTime = weekStart + period;
  return { index, event, startTime, endTime, key: `W_${event}_${index}_${startTime}` };
}
function nextCycle(event, now = Date.now(), rules = schedule) {
  const current = cycleFor(event, now, rules);
  if (current) return current;
  const track = rules.independent && rules.independent[event];
  if (track) return cycleFor(event, Math.max(now, Date.parse(track.anchor), Date.parse(track.activationAt)), rules);
  const anchor = Date.parse(rules.anchor);
  let at = Math.max(now, anchor);
  for (let i = 0; i <= rules.rotation.length; i++) {
    const cycle = cycleAt(at, rules);
    if (!cycle) return null;
    if (cycle.event === event) return cycle;
    at = cycle.endTime;
  }
  return null;
}
function previousCycle(cycle) {
  if (!cycle) return null;
  return schedule.independent?.[cycle.event] ? cycleFor(cycle.event, cycle.startTime - 1)
    : cycle.index > 0 ? cycleAt(cycle.startTime - 1) : null;
}
function isEventOpen(event, serverId, now = Date.now()) {
  const cycle = cycleFor(event, now);
  return !!(cycle && cycle.event === event && isServerAllowed(serverId));
}
function entryId(cycleKey, event, playerId) { return crypto.createHash('sha256').update(`${cycleKey}:${event}:${playerId}`).digest('hex').slice(0, 32); }
async function upsertScore({ event, serverId, playerId, userId, name, level, score, payload = {} }, now = Date.now()) {
  const cycle = cycleFor(event, now);
  if (!event || !cycle || cycle.event !== event || !isServerAllowed(serverId)) return { accepted: false, reason: 'CYCLE_CLOSED' };
  const safeScore = Math.max(0, Number(score) || 0);
  await Entry.updateOne({ _id: entryId(cycle.key, cycle.event, playerId) }, { $set: { cycleKey: cycle.key, event: cycle.event, serverId: Number(serverId), playerId: String(playerId), userId: String(userId), name: String(name || ''), level: Math.max(1, Number(level) || 1), score: safeScore, payload, updatedAt: now } }, { upsert: true }).exec();
  return { accepted: true, cycle, score: safeScore };
}
async function top(event, cycle = cycleFor(event), limit = 100) {
  if (!cycle || cycle.event !== event) return [];
  return Entry.find({ cycleKey: cycle.key, event, serverId: { $in: getServerIds() }, score: { $gte: 0 } }).sort({ score: -1, playerId: 1 }).limit(Math.max(1, Math.min(10000, Number(limit) || 100))).maxTimeMS(5000).lean().exec();
}
function settlementId(event, cycle) { return `cross_${event}_${cycle.key}`; }
module.exports = { schedule, EVENTS, cycleAt, cycleFor, nextCycle, previousCycle, getServerIds, isServerAllowed, isEventOpen, upsertScore, top, settlementId };

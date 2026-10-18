'use strict';
const policy = require('../config/eventRewardSettlement.json');
const IDS = [43001, 43002, 44001, 44002, 44051, 44052];
const rotation = require('./EventRotationRegistry');
const DAY = 86400000;

function dynamicWindow(serverId, now = Date.now()) {
  const family = rotation.getFamily('fortune');
  const monsterFamily = rotation.getFamily('new_year_monster');
  const active = family && rotation.isEnabled(family) ? family : monsterFamily && rotation.isEnabled(monsterFamily) ? monsterFamily : null;
  if (!active || !Number.isFinite(Date.parse(active.anchor)) || Math.max(1, Number(active.periodDays) || 0) <= 0) return null;
  const anchor = Date.parse(active.anchor);
  if (now < anchor) return null;
  const periodMs = Math.max(1, Number(active.periodDays) || 1) * DAY;
  const index = Math.floor((now - anchor) / periodMs);
  const startTime = anchor + index * periodMs;
  return {
    key: `kimma_cycle_${index}`,
    startTime,
    endTime: startTime + periodMs,
    includeLegacyWindows: false,
    cycleIndex: index,
    serverId: Number(serverId) || 0,
  };
}
function windowFor(serverId = process.env.SERVER_ID, rules = policy, now = Date.now()) {
  const w = rules.newYearWindows[String(serverId)];
  // Keep the configured legacy window untouched while it is still open. Once
  // it has ended, expose the shared recurring window used by both Kim-Ma
  // activity families. The recurring anchor is after the latest legacy end
  // plus the settlement grace period, so settlement runs before replacement.
  if (w && Number(w.startTime) <= now && now < Number(w.endTime)) return { ...w };
  return dynamicWindow(serverId, now) || (w ? { ...w } : null);
}
function seedWindow(id, serverId = process.env.SERVER_ID, now = Date.now()) {
  if (!IDS.includes(Number(id))) return null;
  // Recurring rows are created only by the settlement-gated scheduler.
  // Login normalization must not bypass that gate by seeding a fresh window.
  const w = policy.newYearWindows[String(serverId)];
  // No per-login rolling fallback or silent reopening of an unconfigured cycle.
  return w ? { startTime: w.startTime, endTime: w.endTime } : { startTime: 0, endTime: 0 };
}
function belongs(row, window) {
  const start = Number(row?.startTime), end = Number(row?.endTime);
  if (!window || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start) return false;
  return window.includeLegacyWindows
    ? start >= window.startTime && end <= window.endTime
    : start === window.startTime && end === window.endTime;
}
module.exports = { IDS, windowFor, seedWindow, belongs };

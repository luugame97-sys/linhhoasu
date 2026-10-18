'use strict';
const config = require('./ConfigService');

function inScope(id) {
  return id === 6006 || id === 6056 || !!config.get('Activity33Config')?.[id];
}

function rejection(player, id, now = Date.now()) {
  if (!inScope(id)) return null;
  const meta = config.get('ActivityConfig')?.[id];
  if (!meta) return 'FISH_EVENT_CONFIG_MISSING';
  const info = player.activityInfo || {};
  if ((info.disabledEntryIds || []).some(v => Number(v) === id)) return 'FISH_EVENT_DISABLED';
  const row = (info.datas || []).find(r => Number(r.id) === id);
  if (!row || !Number.isFinite(Number(row.startTime)) || !Number.isFinite(Number(row.endTime))
      || Number(row.startTime) <= 0 || Number(row.startTime) > now || Number(row.endTime) <= now) {
    return 'FISH_EVENT_NOT_ACTIVE';
  }
  if (id === 6006 || id === 6056) {
    if (Number(player.level || 0) < 55) return 'FISH_EVENT_LEVEL_REQUIRED';
  } else if (!(player.systemUnlockInfo?.unlockedSystem || []).includes(215)) {
    return 'FISH_EVENT_SYSTEM_LOCKED';
  }
  return null;
}

module.exports = { inScope, rejection };

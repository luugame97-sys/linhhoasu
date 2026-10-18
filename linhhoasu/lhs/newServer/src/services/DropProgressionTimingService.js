'use strict';

// Also exported for clients which already have their own table iteration.
function durationSeconds(kind, index, originalSeconds) {
  var level = Number(index), original = Number(originalSeconds);
  if (!Number.isInteger(level) || level < 1 || level > 200 || !Number.isFinite(original) || original < 0) throw Error('DROP_TIMING200_INPUT_INVALID');
  if (kind !== 'level' && kind !== 'tier') throw Error('DROP_TIMING200_KIND_INVALID');
  if (level === 200) return 0;
  if (level <= (kind === 'level' ? 4 : 10)) return original;
  var anchors = kind === 'level'
    ? [[5,3600],[10,7200],[25,14400],[50,21600],[100,43200],[150,64800],[199,86400]]
    : [[10,7200],[50,21600],[100,43200],[150,64800],[199,86400]];
  for (var i = 1; i < anchors.length; i++) {
    var left = anchors[i - 1], right = anchors[i];
    if (level <= right[0]) return Math.round((left[1] + (right[1] - left[1]) * (level - left[0]) / (right[0] - left[0])) / 60) * 60;
  }
  return 86400;
}

// Self-contained ES5 generator: embed this exact function in the native client.
function applyTables(tables) {
  var version = 'drop_timing200_v1';
  if (tables.DropProgressionTimingConfig && tables.DropProgressionTimingConfig.version === version) return tables.DropProgressionTimingConfig;
  var levelAnchors = [[5, 3600], [10, 7200], [25, 14400], [50, 21600], [100, 43200], [150, 64800], [199, 86400]];
  var tierAnchors = [[10, 7200], [50, 21600], [100, 43200], [150, 64800], [199, 86400]];
  function interpolate(level, anchors) {
    for (var i = 1; i < anchors.length; i++) {
      var right = anchors[i], left = anchors[i - 1];
      if (level <= right[0]) return Math.round((left[1] + (right[1] - left[1]) * (level - left[0]) / (right[0] - left[0])) / 60) * 60;
    }
    return 86400;
  }
  function apply(table, anchors, keepThrough) {
    if (!table || !table[200]) throw Error('DROP_TIMING200_TABLE_MISSING');
    Object.keys(table).forEach(function (key) {
      var level = Number(key), row = table[key];
      if (!Number.isInteger(level) || level < 1 || level > 200) return;
      if (!row || !Number.isFinite(Number(row.timeCost)) || Number(row.timeCost) < 0) throw Error('DROP_TIMING200_TIME_INVALID:' + key);
      // Preserve the pre-policy duration for one-time migration, including
      // after a table has been serialized and loaded without its marker.
      if (row.dropTimingVersion !== version) row.dropTimingOldTimeCost = Number(row.timeCost);
      row.timeCost = level === 200 ? 0 : (level <= keepThrough ? Number(row.timeCost) : interpolate(level, anchors));
      row.dropTimingVersion = version;
    });
  }
  apply(tables.BoxConfig, levelAnchors, 4);
  apply(tables.BoxTierConfig, tierAnchors, 10);
  tables.DropProgressionTimingConfig = { version: version, maxWaitSeconds: 86400, maxLevel: 200, maxTier: 200 };
  return tables.DropProgressionTimingConfig;
}

// Call before accepting any new upgrade timer, under the caller's player lock.
// The caller owns confirmed-save; this helper performs no I/O or settlement.
function migratePlayer(player, now = Date.now(), tables) {
  if (!player || !player.boxInfo || !Number.isSafeInteger(now) || now < 0) return false;
  const config = tables || require('./ConfigService');
  const get = (name) => typeof config.get === 'function' ? config.get(name) : config[name];
  const policy = get('DropProgressionTimingConfig');
  if (!policy || policy.version !== 'drop_timing200_v1') return false;
  const box = player.boxInfo;
  if (box.dropTimingVersion === policy.version) return false;
  function migrate(levelKey, finishKey, startKey, tableName) {
    const row = (get(tableName) || {})[Number(box[levelKey])];
    if (!row || row.dropTimingVersion !== policy.version) return;
    const finish = Number(box[finishKey]);
    // Expired timers remain intact so the normal handler settles one level.
    if (!Number.isSafeInteger(finish) || finish <= now) return;
    const newDuration = Number(row.timeCost) * 1000;
    if (!Number.isSafeInteger(newDuration) || newDuration <= 0) return;
    const oldDuration = Number(row.dropTimingOldTimeCost) * 1000;
    const remaining = finish - now;
    const newRemaining = Math.min(remaining, Math.ceil(
      Number.isSafeInteger(oldDuration) && oldDuration > 0
        ? newDuration * Math.min(1, remaining / oldDuration)
        : Math.min(remaining, newDuration)
    ));
    box[finishKey] = now + newRemaining;
    box[startKey] = Math.max(0, box[finishKey] - newDuration);
  }
  migrate('level', 'upgradeFinishTime', 'upgradeStartTime', 'BoxConfig');
  migrate('tier', 'tierUpTime', 'tierUpStartTime', 'BoxTierConfig');
  box.dropTimingVersion = policy.version;
  return true;
}

module.exports = { durationSeconds, applyTables, migratePlayer };

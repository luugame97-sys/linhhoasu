/** Opt-in auto equip/sell based on server combat power. No client-supplied scores. */
'use strict';
const config = require('./ConfigService');
const battle = require('./BattleService');
const integrity = require('./FishingIntegrityService');
const clone = integrity.clone;

function protectedFish(fish) {
  return !!fish.lock || !!fish.dead || (fish.skills || []).some(id => Number(id) > 0)
    || Object.values(fish.tempSkills || {}).some(id => Number(id) > 0);
}

function validFish(fish) {
  const cfg = (config.get('FishConfig') || {})[fish?.id];
  return !!cfg && cfg.type >= 1 && cfg.type <= 10 && cfg.type === fish.type
    && Number.isSafeInteger(fish.uid) && fish.uid > 0 && Array.isArray(fish.attrs) && fish.attrs.length > 0
    && fish.attrs.every(row => Number.isFinite(row.value) && row.value >= 0 && Number.isSafeInteger(row.type)
      && Number.isSafeInteger(row.level) && row.level >= 1);
}

function power(player) {
  const result = battle.calcPowerScore(battle.calcPlayerPower(player));
  if (!Number.isSafeInteger(result) || result < 0) throw new Error('FISH_AUTO_POWER_INVALID');
  return result;
}

function plan(player, uids) {
  const source = player.fishInfo;
  if (!Array.isArray(uids) || !uids.length || uids.length > 20
      || uids.some(uid => !Number.isSafeInteger(uid) || uid <= 0)
      || new Set(uids).size !== uids.length) return { error: 'FISH_AUTO_REQUEST_INVALID' };
  const pending = source.fishResult.fishInfos;
  if (pending.length !== uids.length || pending.some(row => !uids.includes(row.uid))
      || new Set(pending.map(row => row.uid)).size !== pending.length) return { error: 'FISH_AUTO_STALE' };
  const currentUids = Object.values(source.slots || {}).map(row => row.uid);
  if (pending.some(row => currentUids.includes(row.uid))) return { error: 'FISH_AUTO_DATA_CONFLICT' };
  const next = clone(player), info = next.fishInfo;
  const changedTypes = new Set(), equipped = [], sold = [], held = [], discarded = new Set();
  const heldIds = new Set();
  function hold(fish, reason) { if (!heldIds.has(fish.uid)) { held.push({ uid: fish.uid, reason }); heldIds.add(fish.uid); } }
  let workingPower = power(next);
  for (let type = 1; type <= 10; type++) {
    const old = info.slots[String(type)];
    const rows = pending.filter(row => row.type === type);
    if (!rows.length) continue;
    if (old && (!validFish(old) || protectedFish(old))) {
      for (const row of rows) hold(row, 'protected-slot');
      continue;
    }
    let best = old, bestPower = workingPower;
    const scores = new Map();
    for (const row of rows) {
      if (!validFish(row) || protectedFish(row)) { hold(row, 'protected-or-invalid'); continue; }
      const candidate = clone(next);
      candidate.fishInfo.slots[String(type)] = clone(row);
      const score = power(candidate);scores.set(row.uid, score);
      if (!best || score > bestPower) { best = row;bestPower = score; }
    }
    if (!best) continue;
    if (best !== old) {
      info.slots[String(type)] = clone(best);
      discarded.add(best.uid);
      equipped.push({ uid: best.uid, id: best.id, type, previousUid: old?.uid || 0, beforePower: workingPower, afterPower: bestPower });
      integrity.unlockPic(info, best);
      if (old) sold.push(clone(old));
      changedTypes.add(type);
      workingPower = bestPower;
    }
    for (const row of rows) {
      if (heldIds.has(row.uid) || row.uid === best.uid) continue;
      if (scores.get(row.uid) < bestPower) { sold.push(clone(row));discarded.add(row.uid); }
      else hold(row, 'equal-power');
    }
  }
  for (const row of pending) if (!validFish(row)) {
    const cfg=config.get('FishConfig')?.[row.id];
    if (cfg && [101,102,105,106,107,108,109].includes(cfg.type) && cfg.type===row.type && !protectedFish(row)) {
      sold.push(clone(row));discarded.add(row.uid);
    } else hold(row, 'unsupported-or-invalid');
  }
  // Validate all pending rows were accounted for. No implicit disposal of special fish.
  info.fishResult.fishInfos = info.fishResult.fishInfos.filter(row => !discarded.has(row.uid));
  for (const row of info.fishResult.fishInfos) if (!heldIds.has(row.uid)) hold(row, 'not-selected');
  // A repeated UID in an equipped slot is corrupt legacy state, not a sale opportunity.
  const remainingUids = new Set(Object.values(info.slots).map(row => row.uid));
  if (sold.some(row => remainingUids.has(row.uid)) || new Set(sold.map(row => row.uid)).size !== sold.length) {
    return { error: 'FISH_AUTO_DATA_CONFLICT' };
  }
  for (const row of sold) integrity.unlockPic(info, row);
  return { next, equipped, sold, held, changedTypes: [...changedTypes] };
}

module.exports = { plan, power, protectedFish, validFish };

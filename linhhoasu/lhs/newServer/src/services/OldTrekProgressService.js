'use strict';
const config = require('./ConfigService');
const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const arr = v => Array.isArray(v) ? v : [];
const table = name => obj(config.get(name));
const int = v => Number.isSafeInteger(Number(v));
function privilege(info, id) {
  let value = 0;
  for (const tech of arr(info.unlockTechs)) value += Number(obj(table('OldTrekTechSkillConfig')[tech]?.privilege)[id] || 0);
  for (const pass of arr(info.passRecords)) {
    const cfg = table('OldTrekPassShowConfig')[pass.id] || {};
    if (pass.buyRecord & 2) value += Number(obj(cfg.fundPrivilege)[id] || 0);
    if (pass.buyRecord & 4) value += Number(obj(cfg.advancedPrivilege)[id] || 0);
  }
  return value;
}
function mature(info, now = Date.now()) {
  const ready = arr(info.unlocking).filter(r => Number(r.finishTime) <= now && table('OldTrekTechSkillConfig')[r.id]);
  info.unlockTechs = [...new Set([...arr(info.unlockTechs), ...ready.map(r => r.id)])];
  info.unlocking = arr(info.unlocking).filter(r => !ready.includes(r));
  const day = new Date(now + 7 * 3600000).toISOString().slice(0, 10);
  if (info.dayKey !== day) { info.dayKey = day; info.dailyFreeRefresh = 0; info.pray = 0; info.prayDate = day; }
  // One bounded growth-offer window per owned special sailor, anchored to the
  // acquisition time, never extended by relog or by reading this structure.
  info.sailorPackages = arr(info.sailorPackages);
  for (const sailor of arr(info.sailorList)) {
    if (table('OldTrekSailorGiftConfig')[sailor.id] && !info.sailorPackages.some(r => r.id === sailor.id)) {
      info.sailorPackages.push({ id: sailor.id, expire: Number(sailor.recruitDate || now) + 7*86400000, freeClaim: 0 });
    }
  }
  return ready;
}
function shipExp(info, amount, player) {
  if (!Number.isSafeInteger(amount) || amount < 0) throw Error('OLD_TREK_EXP_INVALID');
  info.exp = Number(info.exp || 0) + amount;
  const levels = table('OldTrekSailLevelConfig');
  while (levels[info.lv + 1] && Number(levels[info.lv]?.exp) > 0 && info.exp >= levels[info.lv].exp) {
    info.exp -= levels[info.lv].exp; info.lv++;
    if (player) { player.items ||= {}; player.items[323] = Number(player.items[323] || 0) + Number(levels[info.lv].point || 0); }
  }
}
function morale(info) {
  let score = 0;
  for (const s of arr(info.sailorList)) {
    const row = table('OldTrekSailorConfig')[s.id];
    if (row) score += Number(row.moraleAttrs || 0) + Number(table('OldTrekSailorStarUpConfig')[row.quality]?.[s.star]?.moraleAttrsUp || 0);
  }
  return Math.max(0, ...Object.values(table('OldTrekSailorMoraleConfig')).filter(r => score >= r.score).map(r => r.level));
}
function validateLines(info, setId, lines, allowEmpty = true) {
  if (!int(setId) || setId < 0 || setId >= Number(table('OldTrekBaseConfig').sailorSetNum || 3)) return 'OLD_TREK_SET_INVALID';
  if (!Array.isArray(lines) || lines.length !== 3) return 'OLD_TREK_LINES_INVALID';
  const owned = new Set(arr(info.sailorList).map(r => r.id)), used = new Set(), ids = new Set();
  for (const line of lines) {
    if (!int(line.id) || line.id < 0 || line.id > 2 || ids.has(line.id) || !Array.isArray(line.slots) || line.slots.length !== 4) return 'OLD_TREK_LINES_INVALID';
    ids.add(line.id);
    let count = 0;
    const cap = Number(arr(table('OldTrekBaseConfig').initialQueue)[line.id] || 1) + privilege(info, line.id + 101);
    for (let i = 0; i < line.slots.length; i++) {
      const id = Number(line.slots[i]);
      if (!int(id) || id < 0) return 'OLD_TREK_SAILOR_INVALID';
      if (!id) continue;
      if (i >= cap || !owned.has(id) || used.has(id)) return 'OLD_TREK_SAILOR_SLOT_INVALID';
      count++; used.add(id);
    }
    if (!allowEmpty && !count) return 'OLD_TREK_FORMATION_EMPTY';
    if (line.leader > 0 && !line.slots.includes(Number(line.leader))) return 'OLD_TREK_LEADER_INVALID';
    if (line.skill > 0 && !Number(obj(info.moraleSkill)[line.skill])) return 'OLD_TREK_SKILL_LOCKED';
  }
  return null;
}
function validateAction(info, tag, p) {
  const lines = arr(obj(info.setMap)[p.set == null ? info.sailSetId : p.set]);
  if (info.sailing && [7011,7023,7027,7030,7036,7038].includes(tag)) return 'OLD_TREK_FORMATION_BUSY';
  if (info.sailing && [7022,7029,7034].includes(tag) && Number(p.set ?? info.sailSetId) === info.sailSetId) return 'OLD_TREK_FORMATION_BUSY';
  if (tag === 7010) {
    const row = table('OldTrekTechSkillConfig')[p.id];
    if (!row || row.levelLock > info.lv || arr(row.pre).some(id => !info.unlockTechs.includes(id)) || info.unlocking.length >= Number(table('OldTrekBaseConfig').unlockThread || 1)) return 'OLD_TREK_TECH_LOCKED';
  }
  if (tag === 7011 && (!table('OldTrekJobConfig')[p.job] || !Object.values(table('OldTrekTechSkillConfig')).some(r => r.jobId === Number(p.job) && info.unlockTechs.includes(r.id)) && Number(p.job) !== 0)) return 'OLD_TREK_JOB_LOCKED';
  // Owner-approved replacement for unavailable third-party ads: paid speedup
  // only until an authenticated ad receipt provider exists.
  if (tag === 7012 && (Number(p.ad) === 1 || !int(p.count) || p.count < 1 || p.count > 10000)) return 'OLD_TREK_SPEEDUP_INVALID';
  if ([7024,7030].includes(tag) && (!int(p.slot ?? p.slotId) || Number(p.slot ?? p.slotId) < 0 || Number(p.slot ?? p.slotId) >= info.sailorSlotList.length)) return 'OLD_TREK_SLOT_INVALID';
  if (tag === 7024) {
    const slotId = Number(p.slot ?? p.slotId);
    const slot = arr(info.sailorSlotList).find(row => Number(row.slot) === slotId);
    const currentLevel = Math.max(1, Number(slot?.level || 1));
    const requestedLevel = Number(p.level);
    const maxLevel = Math.max(1, Number(table('OldTrekSailLevelConfig')[info.lv]?.sailorMaxLevel || 300));
    const levels = table('OldTrekSailorLevelUpConfig');
    // The client sends the target level; never let a stale/lower value bypass
    // the current level or make the handler synthesize a level past the table.
    if (!slot || currentLevel >= maxLevel || requestedLevel !== currentLevel + 1
      || !levels[currentLevel] || !levels[requestedLevel]) return 'OLD_TREK_LEVEL_MAX';
  }
  if ([7023,7027].includes(tag) && Object.values(obj(info.setMap)).some(rows => arr(rows).some(row => arr(row.slots).includes(Number(p.id))))) return 'OLD_TREK_SAILOR_IN_FORMATION';
  if (tag === 7029 && !lines.find(r => r.id === Number(p.line))?.slots.includes(Number(p.id))) return 'OLD_TREK_LEADER_INVALID';
  if (tag === 7030 && !info.sailorList.some(r => r.id === Number(p.sailorId))) return 'OLD_TREK_SAILOR_NOT_OWNED';
  if (tag === 7033 && Number(table('OldTrekSailorMoraleSkillConfig')[p.skillId]?.[p.level]?.moraleLevel || Infinity) > morale(info)) return 'OLD_TREK_MORALE_REQUIRED';
  if (tag === 7034 && Number(p.skillId) > 0 && !Number(info.moraleSkill[p.skillId])) return 'OLD_TREK_SKILL_LOCKED';
  if (tag === 7036 && (!int(p.set) || p.set < 0 || p.set >= Number(table('OldTrekBaseConfig').sailorSetNum || 3))) return 'OLD_TREK_SET_INVALID';
  if (tag === 7037 && (info.sailorAtlas[p.id] == null || !table('OldTrekBaseConfig').recallCost?.[table('OldTrekSailorConfig')[p.id]?.quality])) return 'OLD_TREK_RECALL_LOCKED';
  if (tag === 7037 && !arr(info.sailorList).some(row => Number(row.id) === Number(p.id))) {
    const capacity = Math.max(0, Number(table('OldTrekBaseConfig').initialSailorNum || 20)) + privilege(info, 1);
    const ownedCount = arr(info.sailorList).filter(row => Number(table('OldTrekSailorConfig')[row.id]?.type || 0) !== 0).length;
    if (ownedCount >= capacity) return 'OLD_TREK_SAILOR_CAPACITY';
  }
  if (tag === 7038) return validateLines(info, Number(p.set), p.lineData);
  if ([7040,7041,7044].includes(tag) && !arr(info.dest).some(r => r.id === Number(p.id))) return 'OLD_TREK_DESTINATION_LOCKED';
  if (tag === 7043) {
    const row = table('OldTrekDestinationConfig')[p.id]?.[1];
    const locks = Object.values(table('OldTrekSeasonLockConfig')).sort((a,b)=>a.id-b.id);
    const lock = locks.filter(r=>r.id<=Number(info.totalSeason||1)).pop();
    if (!row || row.isSeal || lock && !arr(lock.unlockDestination).includes(Number(p.id))) return 'OLD_TREK_DESTINATION_LOCKED';
  }
  if (tag === 7022) {
    const ll = Array.isArray(p.line) ? p.line : [p.line], ss = Array.isArray(p.slot) ? p.slot : [p.slot], ii = Array.isArray(p.id) ? p.id : [p.id];
    if (!ll.length || ll.length > 12 || ll.length !== ss.length || ll.length !== ii.length) return 'OLD_TREK_SET_INVALID';
    for (let i = 0; i < ll.length; i++) if (!int(ll[i]) || ll[i] < 0 || ll[i] > 2 || !int(ss[i]) || ss[i] < -1 || ss[i] > 3 || !info.sailorList.some(r => r.id === Number(ii[i]))) return 'OLD_TREK_SAILOR_SLOT_INVALID';
  }
  return null;
}
module.exports = { mature, shipExp, privilege, morale, validateLines, validateAction };

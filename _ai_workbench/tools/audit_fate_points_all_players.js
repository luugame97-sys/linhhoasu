const path = require('path');
const mongoose = require(path.join(process.cwd(), 'node_modules/mongoose'));
const Player = require(path.join(process.cwd(), 'src/db/models/Player'));
const config = require(path.join(process.cwd(), 'src/services/ConfigService'));

function n(value) { const number = Number(value); return Number.isFinite(number) ? Math.floor(number) : 0; }
function basePoints(level) {
  let count = 0;
  const rows = config.get('FateLevelConfig') || {};
  Object.values(rows).forEach((row) => { if (n(row && row.playerLevel) <= level) count = Math.max(count, n(row && row.count)); });
  return count;
}
function usedPoints(player) {
  const skills = config.get('FateSkillConfig') || {};
  const plans = player && player.fateInfo && player.fateInfo.planInfoMap || {};
  const out = {};
  Object.keys(plans).forEach((planId) => {
    const ids = Array.isArray(plans[planId] && plans[planId].skills) ? plans[planId].skills : [];
    out[planId] = ids.reduce((sum, id) => sum + Math.max(0, n(skills[id] && skills[id].fatePointCost)), 0);
  });
  return out;
}
function privilegePoints(player) {
  const rows = player && player.other_attr_info && player.other_attr_info.curiosInfo && player.other_attr_info.curiosInfo.curiosData;
  if (!Array.isArray(rows)) return 0;
  return rows.some((row) => n(row && row.id) === 130611) ? 6 : 0;
}

(async () => {
  config.loadAllTables();
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lhs_s1001');
  const players = await Player.find({}).select({ userId: 1, playerId: 1, name: 1, level: 1, items: 1, fateInfo: 1, other_attr_info: 1 }).lean();
  const rows = players.map((player) => {
    const base = basePoints(Math.max(1, n(player.level)));
    const purchased = Math.max(0, n(player.items && player.items[99]));
    const privilege = privilegePoints(player);
    const used = usedPoints(player);
    const maxUsed = Math.max(0, ...Object.values(used));
    return { userId: String(player.userId || ''), playerId: String(player.playerId || ''), name: String(player.name || ''), level: n(player.level), base, purchased, privilege, currentTotal: base + privilege, correctedTotal: base + privilege + purchased, maxUsed, currentLeft: base + privilege - maxUsed, correctedLeft: base + privilege + purchased - maxUsed, usedByPlan: used };
  }).filter((row) => row.purchased > 0 || row.currentLeft < 0 || row.correctedLeft < 0);
  console.log(JSON.stringify({ result: 'ok', players: players.length, affected: rows.length, purchasedPlayers: rows.filter((row) => row.purchased > 0).length, currentNegative: rows.filter((row) => row.currentLeft < 0).length, correctedNegative: rows.filter((row) => row.correctedLeft < 0).length, rows }, null, 2));
  await mongoose.disconnect();
})().catch((error) => { console.error(error.stack || error.message || String(error)); process.exitCode = 1; });

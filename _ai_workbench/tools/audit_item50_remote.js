const path = require('path');
const mongoose = require(path.join(process.cwd(), 'node_modules/mongoose'));
const Mail = require(path.join(process.cwd(), 'src/db/models/Mail'));
const Player = require(path.join(process.cwd(), 'src/db/models/Player'));

function n(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : 0;
}
function attachments(value) {
  if (Array.isArray(value)) return value.map((row) => ({ id: n(row && row.id), count: n(row && row.count) })).filter((row) => row.id > 0 && row.count > 0);
  if (!value || typeof value !== 'object') return [];
  return Object.keys(value).map((id) => ({ id: n(id), count: n(value[id]) })).filter((row) => row.id > 0 && row.count > 0);
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lhs_s1001');
  const mails = await Mail.find({}).sort({ createdAt: 1 }).lean();
  const targetId = Math.max(1, n(process.env.AUDIT_ITEM_ID || 50));
  const itemMails = mails.filter((mail) => attachments(mail.attachments || mail.rewardData).some((row) => row.id === targetId));
  const userIds = Array.from(new Set(itemMails.map((mail) => String(mail.userId || '')).filter(Boolean)));
  const players = await Player.find({ userId: { $in: userIds } }).select({ userId: 1, name: 1, level: 1, items: 1, fateInfo: 1, other_attr_info: 1 }).lean();
  const playerMap = new Map(players.map((player) => [String(player.userId), player]));
  const rows = itemMails.map((mail) => {
    const player = playerMap.get(String(mail.userId || '')) || {};
    return { mailId: String(mail._id), userId: String(mail.userId || ''), title: mail.title || '', content: mail.content || mail.text || '', claimed: !!mail.claimed, read: !!mail.read, eventKey: mail.eventKey || '', batchId: mail.batchId || '', createdAt: mail.createdAt, attachments: attachments(mail.attachments || mail.rewardData), bagCount: n(player.items && player.items[targetId]), fateInfo: player.fateInfo || {}, fateInfoKeys: Object.keys(player.fateInfo || {}), otherAttrKeys: Object.keys(player.other_attr_info || {}) };
  });
  console.log(JSON.stringify({ result: 'ok', itemId: targetId, mailCount: rows.length, claimed: rows.filter((row) => row.claimed).length, unclaimed: rows.filter((row) => !row.claimed).length, players: players.length, rows }, null, 2));
  await mongoose.disconnect();
})().catch((error) => { console.error(error.stack || error.message || String(error)); process.exitCode = 1; });

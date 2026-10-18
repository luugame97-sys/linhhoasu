const path = require('path');
const mongoose = require(path.join(process.cwd(), 'node_modules/mongoose'));
const fromServer = (relative) => require(path.join(process.cwd(), relative));
const Mail = fromServer('src/db/models/Mail');
const Player = fromServer('src/db/models/Player');

const targetIds = new Set([
  25011, 25012, 25013, 25014, 25021, 25022, 25023, 25024, 25031, 25032, 25033, 25034,
  25041, 25042, 25043, 25044, 25051, 25052, 25053, 25054,
  90014, 90015, 90016, 90034, 90036, 90042, 90043, 90064, 90065, 100005, 100006, 100043,
]);

function n(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : 0;
}

function normalizeAttachments(value) {
  if (Array.isArray(value)) return value.map((row) => ({ id: n(row && row.id), count: n(row && row.count) })).filter((row) => row.id > 0 && row.count > 0);
  if (!value || typeof value !== 'object') return [];
  return Object.keys(value).map((id) => ({ id: n(id), count: n(value[id]) })).filter((row) => row.id > 0 && row.count > 0);
}

(async () => {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lhs_s1001';
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  const mails = await Mail.find({}).sort({ createdAt: 1 }).lean();
  const rows = [];
  const users = new Set();
  for (const mail of mails) {
    const attachments = normalizeAttachments(mail.attachments || mail.rewardData).filter((row) => targetIds.has(row.id));
    if (attachments.length === 0) continue;
    const userId = String(mail.userId || '');
    users.add(userId);
    rows.push({ mailId: String(mail._id || ''), userId, eventKey: mail.eventKey || '', batchId: mail.batchId || '', claimed: !!mail.claimed, read: !!mail.read, createdAt: mail.createdAt, attachments });
  }
  const players = await Player.find({ userId: { $in: Array.from(users) } }).select({ userId: 1, level: 1, items: 1, other_attr_info: 1, petInfo: 1, artifactInfo: 1, valhallaInfo: 1, bloodlineInfo: 1 }).lean();
  const playerMap = new Map(players.map((player) => [String(player.userId), player]));
  const summary = {};
  for (const row of rows) {
    for (const attachment of row.attachments) {
      const key = String(attachment.id);
      if (!summary[key]) summary[key] = { mails: 0, quantity: 0, claimed: 0, users: new Set() };
      summary[key].mails += 1;
      summary[key].quantity += attachment.count;
      if (row.claimed) summary[key].claimed += 1;
      summary[key].users.add(row.userId);
    }
  }
  const cleanSummary = Object.fromEntries(Object.entries(summary).map(([id, value]) => [id, { mails: value.mails, quantity: value.quantity, claimed: value.claimed, users: Array.from(value.users) }]));
  const playerRows = Array.from(playerMap.values()).map((player) => ({
    userId: String(player.userId),
    level: n(player.level),
    bag: player.items || {},
    gemCount: Array.isArray(player.other_attr_info && player.other_attr_info.gemInfo && player.other_attr_info.gemInfo.gems) ? player.other_attr_info.gemInfo.gems.length : 0,
    petCount: Array.isArray(player.petInfo && player.petInfo.pets) ? player.petInfo.pets.length : 0,
    artifactCount: Array.isArray(player.artifactInfo && player.artifactInfo.artifacts) ? player.artifactInfo.artifacts.length : 0,
    mails: rows.filter((row) => row.userId === String(player.userId)),
  }));
  console.log(JSON.stringify({ result: 'ok', mailCount: rows.length, users: users.size, summary: cleanSummary, players: playerRows }, null, 2));
  await mongoose.disconnect();
})().catch((error) => { console.error(error.stack || error.message || String(error)); process.exitCode = 1; });

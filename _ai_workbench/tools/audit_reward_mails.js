const path = require('path');
const mongoose = require(path.join(process.cwd(), 'node_modules/mongoose'));
const Mail = require(path.join(process.cwd(), 'src/db/models/Mail'));

function n(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : 0;
}

function normalize(value) {
  if (Array.isArray(value)) return value.map((row) => ({ id: n(row && row.id), count: n(row && row.count) })).filter((row) => row.id > 0 && row.count > 0);
  if (!value || typeof value !== 'object') return [];
  return Object.keys(value).map((id) => ({ id: n(id), count: n(value[id]) })).filter((row) => row.id > 0 && row.count > 0);
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lhs_s1001', { serverSelectionTimeoutMS: 5000 });
  const rows = await Mail.find({}).sort({ createdAt: 1 }).lean();
  const summary = {};
  const channel = {};
  const detail = rows.map((row) => {
    const title = String(row.title || '');
    const key = String(row.eventKey || '');
    const content = String(row.content || row.text || '');
    const kind = /giftcode/i.test(title + content) ? 'giftcode' : (/donate|recharge|mốc|Mốc/i.test(key + title + content) ? 'donate' : 'other');
    channel[kind] = channel[kind] || { mails: 0, claimed: 0, unclaimed: 0, itemCounts: {} };
    channel[kind].mails += 1;
    if (row.claimed) channel[kind].claimed += 1; else channel[kind].unclaimed += 1;
    const attachments = normalize(row.attachments || row.rewardData);
    attachments.forEach((item) => {
      channel[kind].itemCounts[item.id] = (channel[kind].itemCounts[item.id] || 0) + item.count;
      summary[item.id] = (summary[item.id] || 0) + item.count;
    });
    return { id: String(row._id), userId: String(row.userId || ''), title, eventKey: key, claimed: !!row.claimed, createdAt: row.createdAt, attachments };
  });
  console.log(JSON.stringify({ result: 'ok', count: rows.length, channel, itemCounts: summary, detail }, null, 2));
  await mongoose.disconnect();
})().catch((error) => { console.error(error.stack || error.message || String(error)); process.exitCode = 1; });

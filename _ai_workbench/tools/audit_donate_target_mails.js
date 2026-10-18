const path = require('path');
const mongoose = require(path.join(process.cwd(), 'node_modules/mongoose'));
const Mail = require(path.join(process.cwd(), 'src/db/models/Mail'));

(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lhs_s1001');
  const userIds = ['u_Wk_1001_ed9347_1788009359657', 'u_Wk_1001_7a948e_1788008560635', 'u_Wk_1001_4a38d3_1788073964732'];
  const rows = await Mail.find({ userId: { $in: userIds } }).sort({ userId: 1, createdAt: 1 }).lean();
  console.log(JSON.stringify(rows.map((row) => ({ id: String(row._id), userId: row.userId, title: row.title, content: row.content, eventKey: row.eventKey, batchId: row.batchId, claimed: !!row.claimed, createdAt: row.createdAt, attachments: row.attachments })), null, 2));
  await mongoose.disconnect();
})().catch((error) => { console.error(error.stack || error.message || String(error)); process.exitCode = 1; });

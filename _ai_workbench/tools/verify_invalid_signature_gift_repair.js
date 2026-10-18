const path = require('path');
const mongoose = require(path.join(process.cwd(), 'node_modules/mongoose'));
const Mail = require(path.join(process.cwd(), 'src/db/models/Mail'));

(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lhs_s1001');
  const rows = await Mail.find({ eventKey: /^webgm_gift_/ }).sort({ createdAt: 1 }).lean();
  console.log(JSON.stringify({
    result: 'ok',
    count: rows.length,
    rows: rows.map((row) => ({
      eventKey: row.eventKey,
      userId: row.userId,
      title: row.title,
      content: row.content,
      claimed: !!row.claimed,
      attachments: row.attachments,
      createdAt: row.createdAt,
    })),
  }, null, 2));
  await mongoose.disconnect();
})().catch((error) => { console.error(error.stack || error.message || String(error)); process.exitCode = 1; });

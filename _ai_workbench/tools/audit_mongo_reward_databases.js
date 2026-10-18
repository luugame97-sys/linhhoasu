const path = require('path');
const mongoose = require(path.join(process.cwd(), 'node_modules/mongoose'));

const ports = [27017, 27027];

(async () => {
  const results = [];
  for (const port of ports) {
    const conn = mongoose.createConnection(`mongodb://127.0.0.1:${port}/lhs_s1001`, { serverSelectionTimeoutMS: 2500 });
    try {
      await conn.asPromise();
      const db = conn.db;
      const [players, mails, accounts, recent, donateLike, giftLike] = await Promise.all([
        db.collection('players').countDocuments({}),
        db.collection('mails').countDocuments({}),
        db.collection('accounts').countDocuments({}),
        db.collection('mails').find({}).sort({ createdAt: -1 }).limit(10).project({ userId: 1, title: 1, content: 1, eventKey: 1, claimed: 1, attachments: 1, createdAt: 1 }).toArray(),
        db.collection('mails').find({ $or: [{ eventKey: /donate|recharge/i }, { title: /mốc|donate/i }, { content: /mốc|donate/i }] }).sort({ createdAt: -1 }).limit(200).project({ userId: 1, title: 1, content: 1, eventKey: 1, claimed: 1, attachments: 1, createdAt: 1 }).toArray(),
        db.collection('mails').find({ $or: [{ eventKey: /gift/i }, { title: /gift/i }, { content: /gift/i }] }).sort({ createdAt: -1 }).limit(20).project({ userId: 1, title: 1, content: 1, eventKey: 1, claimed: 1, attachments: 1, createdAt: 1 }).toArray(),
      ]);
      results.push({ port, connected: true, players, mails, accounts, recent, donateLike, giftLike });
    } catch (error) {
      results.push({ port, connected: false, error: error.message });
    } finally {
      await conn.close().catch(() => undefined);
    }
  }
  console.log(JSON.stringify({ result: 'ok', results }, null, 2));
})().catch((error) => { console.error(error.stack || error.message || String(error)); process.exitCode = 1; });

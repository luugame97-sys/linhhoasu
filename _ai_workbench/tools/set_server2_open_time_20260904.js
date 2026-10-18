const fs = require('fs');
const { MongoClient } = require('/linhhoasu/lhs/newServer/node_modules/mongodb');

const SERVER_ID = 1002;
const OPEN_TIME = 1788516000000; // 2026-09-04 17:00:00 Asia/Bangkok (UTC+7)
const URI = 'mongodb://127.0.0.1:27017/lhs_s1002';

async function main() {
  const backupFile = String(process.argv[2] || '').trim();
  if (!backupFile) throw new Error('BACKUP_FILE_REQUIRED');

  const client = new MongoClient(URI);
  await client.connect();
  try {
    const collection = client.db().collection('gameservers');
    const before = await collection.findOne({ serverId: SERVER_ID });
    if (!before) throw new Error('SERVER2_CONFIG_NOT_FOUND');
    if (before.running !== false || Number(before.status) !== 0) {
      throw new Error(`SERVER2_NOT_PRIVATE running=${before.running} status=${before.status}`);
    }

    fs.writeFileSync(backupFile, `${JSON.stringify(before, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });

    let changed = false;
    if (Number(before.openTime) !== OPEN_TIME) {
      const result = await collection.updateOne(
        {
          _id: before._id,
          serverId: SERVER_ID,
          running: false,
          status: 0,
          openTime: before.openTime,
        },
        { $set: { openTime: OPEN_TIME, updatedAt: new Date() } }
      );
      if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
        throw new Error(`CONCURRENT_UPDATE matched=${result.matchedCount} modified=${result.modifiedCount}`);
      }
      changed = true;
    }

    const after = await collection.findOne(
      { serverId: SERVER_ID },
      { projection: { _id: 0, serverId: 1, serverName: 1, running: 1, status: 1, openTime: 1, updatedAt: 1 } }
    );
    if (!after || after.running !== false || Number(after.status) !== 0 || Number(after.openTime) !== OPEN_TIME) {
      throw new Error('SERVER2_POSTCONDITION_FAILED');
    }

    console.log(`SERVER2_SCHEDULE_JSON=${JSON.stringify({ changed, before: {
      serverId: Number(before.serverId),
      serverName: String(before.serverName || ''),
      running: before.running,
      status: Number(before.status),
      openTime: Number(before.openTime) || 0,
    }, after })}`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});

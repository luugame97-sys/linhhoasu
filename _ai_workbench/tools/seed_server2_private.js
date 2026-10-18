const { MongoClient } = require('/linhhoasu/lhs/newServer/node_modules/mongodb');

const uri = 'mongodb://127.0.0.1:27017/lhs_s1002';
const client = new MongoClient(uri);

async function main() {
  await client.connect();
  const db = client.db();
  const row = {
    serverId: 1002,
    pageId: 1,
    pageName: 'MEGAME365',
    serverName: 'S2',
    isNew: false,
    isRecommend: false,
    status: 0,
    running: false,
    openTime: 1788516000000,
    rechargeArea: 1,
    updatedAt: new Date(),
  };
  await db.collection('gameservers').updateOne({ serverId: 1002 }, { $set: row }, { upsert: true });
  const rows = await db.collection('gameservers').find({}, { projection: { _id: 0 } }).sort({ serverId: 1 }).toArray();
  console.log(JSON.stringify({ database: db.databaseName, rows }));
  await client.close();
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});

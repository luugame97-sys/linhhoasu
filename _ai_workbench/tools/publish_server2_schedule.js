'use strict';

const { MongoClient } = require('/linhhoasu/lhs/newServer/node_modules/mongodb');

const OPEN_TIME = 1788516000000;
const client = new MongoClient('mongodb://127.0.0.1:27017/lhs_s1001');

async function main() {
  await client.connect();
  try {
    const collection = client.db().collection('gameservers');
    const before = await collection.findOne({ serverId: 1002 });
    if (!before) throw new Error('SERVER2_IDENTITY_CONFIG_NOT_FOUND');
    if (before.running !== false || Number(before.status) !== 0) {
      throw new Error(`SERVER2_NOT_PRIVATE running=${before.running} status=${before.status}`);
    }
    const result = await collection.updateOne(
      {
        _id: before._id,
        serverId: 1002,
        running: false,
        status: 0,
      },
      {
        $set: {
          pageId: 1,
          pageName: 'MEGAME365',
          serverName: 'S2',
          running: true,
          status: 1,
          isNew: true,
          isRecommend: false,
          openTime: OPEN_TIME,
          rechargeArea: Number(before.rechargeArea) || 1,
          updatedAt: new Date(),
        },
      }
    );
    if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
      throw new Error(`SERVER2_PUBLISH_CAS_FAILED matched=${result.matchedCount} modified=${result.modifiedCount}`);
    }
    const after = await collection.findOne(
      { serverId: 1002 },
      { projection: { _id: 0, serverId: 1, pageId: 1, pageName: 1, serverName: 1, running: 1, status: 1, isNew: 1, isRecommend: 1, openTime: 1, rechargeArea: 1 } }
    );
    if (!after || after.running !== true || Number(after.status) !== 1 || Number(after.openTime) !== OPEN_TIME) {
      throw new Error('SERVER2_PUBLISH_POSTCONDITION_FAILED');
    }
    console.log(`SERVER2_PUBLISH_JSON=${JSON.stringify({
      before: {
        serverId: Number(before.serverId),
        pageId: Number(before.pageId),
        pageName: String(before.pageName || ''),
        serverName: String(before.serverName || ''),
        running: before.running,
        status: Number(before.status),
        isNew: !!before.isNew,
        isRecommend: !!before.isRecommend,
        openTime: Number(before.openTime) || 0,
        rechargeArea: Number(before.rechargeArea) || 1,
      },
      after,
    })}`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});

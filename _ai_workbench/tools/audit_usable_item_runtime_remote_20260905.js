'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const { MongoClient } = require('/linhhoasu/lhs/newServer/node_modules/mongodb');

const ids = new Set(JSON.parse(fs.readFileSync(process.env.USABLE_ITEM_IDS_PATH, 'utf8')).map(Number));
const client = new MongoClient('mongodb://127.0.0.1:27017');

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function anonymous(dbName, value) {
  return crypto.createHash('sha256')
    .update(`lhs-usable-item-runtime-v1|${dbName}|${String(value || '')}`)
    .digest('hex').slice(0, 16);
}

function addCount(target, id, count, field = 'count') {
  const safeId = number(id);
  const safeCount = Math.max(0, number(count));
  if (!ids.has(safeId) || safeCount <= 0) return;
  target[String(safeId)] = target[String(safeId)] || { id: safeId, [field]: 0 };
  target[String(safeId)][field] = number(target[String(safeId)][field]) + safeCount;
}

function attachments(value) {
  if (Array.isArray(value)) return value.map((row) => ({ id: number(row && row.id), count: number(row && row.count) }));
  return Object.entries(object(value)).map(([id, count]) => ({ id: number(id), count: number(count) }));
}

async function main() {
  await client.connect();
  const databases = {};
  try {
    for (const dbName of ['lhs_s1001', 'lhs_s1002']) {
      const db = client.db(dbName);
      const playerIds = {};
      const humanIds = {};
      const subjects = [];
      const players = await db.collection('players').find({}, {
        projection: { userId: 1, playerId: 1, isBot: 1, level: 1, items: 1 },
      }).toArray();
      for (const player of players) {
        const owned = [];
        Object.entries(object(player.items)).forEach(([id, count]) => {
          if (!ids.has(number(id)) || number(count) <= 0) return;
          owned.push({ id: number(id), count: number(count) });
          addCount(playerIds, id, count);
          if (player.isBot !== true) addCount(humanIds, id, count);
        });
        if (owned.length > 0) {
          subjects.push({
            subject: anonymous(dbName, player.userId || player.playerId),
            isBot: player.isBot === true,
            level: number(player.level),
            items: owned.sort((left, right) => left.id - right.id),
          });
        }
      }

      const mailIds = {};
      const unclaimedMailIds = {};
      const mails = await db.collection('mails').find({}, {
        projection: { claimed: 1, attachments: 1, rewardData: 1 },
      }).toArray();
      for (const mail of mails) {
        attachments(mail.attachments || mail.rewardData).forEach((item) => {
          addCount(mailIds, item.id, item.count);
          if (!mail.claimed) addCount(unclaimedMailIds, item.id, item.count);
        });
      }

      const codeIds = {};
      const codeCount = await db.listCollections({ name: 'redemptioncodes' }, { nameOnly: true }).toArray();
      if (codeCount.length > 0) {
        const codes = await db.collection('redemptioncodes').find({}, {
          projection: { status: 1, rewards: 1 },
        }).toArray();
        codes.forEach((code) => {
          Object.entries(object(object(code.rewards).items)).forEach(([id, count]) => {
            if (code.status === 'active') addCount(codeIds, id, count);
          });
        });
      }

      databases[dbName] = {
        playerCount: players.length,
        humanCount: players.filter((player) => player.isBot !== true).length,
        affectedSubjects: subjects.length,
        affectedHumans: subjects.filter((player) => !player.isBot).length,
        playerItems: Object.values(playerIds).sort((left, right) => left.id - right.id),
        humanItems: Object.values(humanIds).sort((left, right) => left.id - right.id),
        mailItems: Object.values(mailIds).sort((left, right) => left.id - right.id),
        unclaimedMailItems: Object.values(unclaimedMailIds).sort((left, right) => left.id - right.id),
        activeCodeItems: Object.values(codeIds).sort((left, right) => left.id - right.id),
        subjects,
      };
    }
  } finally {
    await client.close();
  }
  console.log('USABLE_ITEM_RUNTIME=' + JSON.stringify({
    result: 'PASS', generatedAt: new Date().toISOString(), auditedIds: ids.size, databases,
  }));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});

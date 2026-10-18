/* Read-only diagnosis for accounts that cannot auto-create their first role. */
const mongo = require('/linhhoasu/lhs/newServer/src/db/mongo');
const Account = require('/linhhoasu/lhs/newServer/src/db/models/Account');
const Player = require('/linhhoasu/lhs/newServer/src/db/models/Player');

(async () => {
  await mongo.connect();
  const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const emptyAccounts = await Account.find({
    createdAt: { $gte: cutoff },
    $or: [{ roles: { $exists: false } }, { roles: { $size: 0 } }],
  }).sort({ createdAt: -1 }).limit(200).lean();
  const accountIds = emptyAccounts.map((row) => String(row.accountId || '')).filter(Boolean);
  const orphanPlayers = accountIds.length
    ? await Player.find({ accountId: { $in: accountIds } }, { accountId: 1, name: 1, userId: 1, roleId: 1, createdAt: 1 }).lean()
    : [];
  const commonNames = await Player.aggregate([
    { $group: { _id: '$name', count: { $sum: 1 }, latest: { $max: '$createdAt' } } },
    { $match: { count: { $gte: 2 } } },
    { $sort: { count: -1, latest: -1 } },
    { $limit: 30 },
  ]);
  const indexes = await Player.collection.indexes();
  const allNames = await Player.find({}, { name: 1, accountId: 1, createdAt: 1 }).lean();
  const nameSet = new Set(allNames.map((row) => String(row.name || '')));
  const exhaustedNameFamilies = [];
  for (const name of nameSet) {
    if (!name || /_\d+$/.test(name)) continue;
    const family = [name];
    for (let i = 2; i <= 10; i += 1) family.push(`${name}_${i}`);
    if (family.every((candidate) => nameSet.has(candidate))) exhaustedNameFamilies.push(family);
  }
  console.log(JSON.stringify({
    cutoff,
    emptyAccountCount: emptyAccounts.length,
    emptyAccounts: emptyAccounts.slice(0, 80).map((row) => ({
      accountId: row.accountId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      roleCount: Array.isArray(row.roles) ? row.roles.length : 0,
    })),
    orphanPlayerCount: orphanPlayers.length,
    orphanPlayers,
    commonNames,
    totalPlayerNames: allNames.length,
    exhaustedNameFamilies,
    playerUniqueIndexes: indexes.filter((idx) => idx.unique).map((idx) => ({ name: idx.name, key: idx.key })),
  }, null, 2));
})().finally(() => mongo.disconnect());

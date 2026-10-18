'use strict';

const mongo = require('/linhhoasu/lhs/newServer/src/db/mongo');
const Account = require('/linhhoasu/lhs/newServer/src/db/models/Account');

(async () => {
  await mongo.connect();
  await Account.createIndexes();
  const indexes = await Account.collection.indexes();
  const roleIndexes = indexes
    .filter((row) => Object.keys(row.key || {}).some((key) => key.startsWith('roles.')))
    .map((row) => ({ name: row.name, key: row.key }));
  console.log(JSON.stringify({ result: 'ok', roleIndexes }));
})()
  .finally(() => mongo.disconnect())
  .catch((error) => {
    console.error(error && error.message ? error.message : String(error));
    process.exitCode = 1;
  });

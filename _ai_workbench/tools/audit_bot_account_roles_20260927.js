'use strict';

const path = require('path');
const appRoot = process.env.LHS_APP_ROOT || path.resolve(__dirname, '../../linhhoasu/lhs/newServer');
const mongoose = require(path.join(appRoot, 'node_modules/mongoose'));
const Account = require(path.join(appRoot, 'src/db/models/Account'));

async function main() {
  await mongoose.connect('mongodb://localhost:27017/lhs_s1001', { serverSelectionTimeoutMS: 5000 });
  const rows = await Account.find({ 'roles.userId': /^lhs_real_bot_/ }, { roles: 1, _id: 0 }).lean();
  const counts = Object.fromEntries([1001, 1002, 1003, 1004].map((serverId) => [serverId, 0]));
  const examples = [];
  for (const account of rows) {
    for (const role of Array.isArray(account.roles) ? account.roles : []) {
      const serverId = Number(role.serverId) || 0;
      if (counts[serverId] !== undefined && /^lhs_real_bot_/.test(String(role.userId || ''))) {
        counts[serverId] += 1;
        if (examples.length < 12) examples.push({ serverId, userId: String(role.userId) });
      }
    }
  }
  console.log(JSON.stringify({ result: 'PASS', accountRows: rows.length, counts, examples }));
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(`AUDIT_ERROR:${error.message}`);
  process.exitCode = 1;
});

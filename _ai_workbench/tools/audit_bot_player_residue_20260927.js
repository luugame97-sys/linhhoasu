'use strict';

const path = require('path');
const appRoot = process.env.LHS_APP_ROOT || path.resolve(__dirname, '../../linhhoasu/lhs/newServer');
const mongoose = require(path.join(appRoot, 'node_modules/mongoose'));
const Player = require(path.join(appRoot, 'src/db/models/Player'));
const Account = require(path.join(appRoot, 'src/db/models/Account'));

async function main() {
  const rows = [];
  for (const serverId of [1001, 1002, 1003, 1004]) {
    await mongoose.connect(`mongodb://localhost:27017/lhs_s${serverId}`, { serverSelectionTimeoutMS: 5000 });
    const filter = { serverId };
    const roleFilter = { roles: { $elemMatch: { serverId, userId: /^lhs_real_bot_/ } } };
    rows.push({
      serverId,
      playerBot: await Player.countDocuments({ ...filter, isBot: true }),
      playerManaged: await Player.countDocuments({ ...filter, managedBot: true }),
      realBotPrefix: await Player.countDocuments({ ...filter, userId: /^lhs_real_bot_/ }),
      playerTotal: await Player.countDocuments(filter),
      accountBotRole: await Account.countDocuments(roleFilter),
    });
    await mongoose.disconnect();
  }
  console.log(JSON.stringify({ result: 'PASS', rows }));
}

main().catch((error) => {
  console.error(`AUDIT_ERROR:${error.message}`);
  process.exitCode = 1;
});

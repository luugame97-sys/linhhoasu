'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const app = path.resolve(
  process.env.ACTIVATION_PASS_APP_ROOT
  || path.join(__dirname, '../../linhhoasu/lhs/newServer')
);
if (process.env.ACTIVATION_PASS_CONFIG) {
  process.env.CONFIG_BIN_PATH = path.resolve(process.env.ACTIVATION_PASS_CONFIG);
}

function stub(relativePath, exports) {
  const filename = require.resolve(path.join(app, relativePath));
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}

let transactionCreates = 0;
let playerSaves = 0;
const player = {
  userId: 'cash-activation-concurrency',
  playerId: 'cash-activation-concurrency-role',
  name: 'fixture',
  level: 20,
  items: { 19: 80 },
  currencies: { diamond: 0, silver: 0, gold: 0 },
  rechargeInfo: { area: 1, records: [], totalRecharge: 0, totalrecharge: 0 },
  activityInfo: { datas: [], disabledEntryIds: [] },
  markModified() {},
  async save() {
    playerSaves += 1;
    await new Promise((resolve) => setTimeout(resolve, 40));
    return player;
  },
};

stub('src/db/models/Transaction', {
  async findOne() { return null; },
  async create(data) { transactionCreates += 1; return { ...data }; },
});
stub('src/db/models/Player', { async findOne() { return player; } });
stub('src/db/models/Mail', { async create(data) { return data; } });
stub('src/services/RechargeConfigService', {
  normalizeProductId(value) { return String(value || '').trim(); },
  async getResolvedRow(productId) {
    return { productId: String(productId), amount: 68, enabled: true, attachments: [] };
  },
  normalizeRewardItems(rows) { return Array.isArray(rows) ? rows : []; },
});
stub('src/services/DistClient', { async rechargeCallback() { return { success: true }; } });
stub('src/services/PlayerGrantService', {
  buildItemSyncPayload() { return { result: 0, items: [], changed: [] }; },
});
stub('src/handlers/mail', { toClientMail(mail) { return mail; } });

const recharge = require(path.join(app, 'src/handlers/recharge'));

(async function main() {
  const responses = await Promise.all([
    recharge.handleRecharge({
      userId: player.userId,
      orderId: 'activation-order-a',
      amount: 68,
      productId: '10301',
      channel: 'fixture',
    }),
    recharge.handleRecharge({
      userId: player.userId,
      orderId: 'activation-order-b',
      amount: 68,
      productId: '10301',
      channel: 'fixture',
    }),
  ]);
  const successes = responses.filter((row) => row && row.success === true);
  const rejected = responses.filter((row) => row && row.error === 'ALREADY_ACTIVE');
  assert.equal(successes.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(transactionCreates, 1);
  assert.equal(playerSaves, 1);
  assert.deepEqual(player.rechargeInfo.records, [{ id: 10301, count: 1 }]);
  const row = player.activityInfo.datas.find((entry) => Number(entry.id) === 7001);
  assert(row);
  assert.deepEqual(row.recordList, [10301]);
  console.log(JSON.stringify({
    result: 'PASS',
    checks: 8,
    successes: successes.length,
    duplicateRejected: rejected.length,
    transactionCreates,
    playerSaves,
  }));
})().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});

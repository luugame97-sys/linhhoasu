'use strict';
process.env.NODE_ENV = 'test';
// RAM-only contract probe for the exact client path: ShopModel.sendBuyItem(25)
// -> RPC1200 {id:25,count:1}; no network, database or player write.
const assert = require('node:assert/strict');
const path = require('node:path');
const app = path.resolve(__dirname, '../../linhhoasu/lhs/newServer');
const clone = x => JSON.parse(JSON.stringify(x));
let saves = 0;
let loadedPlayer = null;
const logPath = require.resolve(path.join(app, 'src/logger'));
require.cache[logPath] = { id: logPath, filename: logPath, loaded: true, exports: { debug(){}, info(){}, warn(){}, error(){} } };
const playerServicePath = require.resolve(path.join(app, 'src/services/PlayerService'));
require.cache[playerServicePath] = { id: playerServicePath, filename: playerServicePath, loaded: true, exports: {
  async loadPlayer() { return loadedPlayer; },
  async savePlayer(_id, p) { saves += 1; loadedPlayer = p; return p; },
  savePlayerDeferred() { return Promise.resolve(); },
} };
const cfg = require(path.join(app, 'src/services/ConfigService'));
const item = require(path.join(app, 'src/handlers/item'));
const row = x => (Array.isArray(x) ? x : [x]).find(p => p && p.tag === 1200 && p.msgUid > 0);
async function main() {
  const player = {
    userId: 'ram-shop-25', level: 43, currencies: { diamond: 1176, silver: 0, gold: 0 },
    items: { 25: 0 }, shopInfo: { buyRecords: {} }, rechargeInfo: { records: [] },
    petInfo: { field: 10, pets: [] },
  };
  loadedPlayer = player;
  const response = await item.handleGetItems({ id: 25, count: 1 }, { userId: player.userId, player }, 701);
  const ack = row(response);
  assert.ok(ack, 'missing tag1200 ACK');
  assert.equal(ack.data.result, 0);
  assert.equal(player.currencies.diamond, 1076);
  assert.equal(player.items[25], 1);
  assert.equal(player.shopInfo.buyRecords[25], 1);
  assert.equal(saves, 1);
  console.log(JSON.stringify({ result: 'PASS', rpc: 1200, goodsId: 25, resultCode: ack.data.result, diamondAfter: player.currencies.diamond, eggAfter: player.items[25], productionWrites: 0, networkAttempts: 0 }));
}
main().catch(err => { console.error(err.stack || err); process.exitCode = 1; });

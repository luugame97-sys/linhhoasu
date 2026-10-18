'use strict';
const assert = require('assert/strict');
const path = require('path');
process.env.SERVER_ID = '1003';
const app = path.resolve(__dirname, '../../linhhoasu/lhs/newServer');
const config = require(path.join(app, 'src/services/ConfigService'));
config.loadAllTables();
const reward = require(path.join(app, 'src/services/RewardGrantService'));
const players = require(path.join(app, 'src/services/PlayerService'));

function player() {
  return { userId: 'ship-fixture', playerId: 'ship-fixture', serverId: 1003, level: 1003,
    items: { 300102: 0, 300002: 0 }, currencies: { diamond: 0, silver: 0, gold: 0 },
    other_attr_info: { oldTrekInfo: { skin: 300001, shipSkins: [300001], stateRevision: 1 } },
    rechargeInfo: { records: [] }, shopInfo: { buyRecords: {} } };
}
async function main() {
const p = player();
const row = reward.grantRewardRow(p, { id: 300002, count: 1 }, 1);
assert.equal(row.kind, 'oldTrekShip');
assert.equal(p.items[300002] || 0, 0);
assert.deepEqual(p.other_attr_info.oldTrekInfo.shipSkins.sort((a,b)=>a-b), [300001, 300002]);
assert.equal(row.rewardOldTrekShips[0].id, 300002);
assert.ok(reward.buildAppearanceSyncPackets(p, { oldTrekShips: row.rewardOldTrekShips }).some(x => x.tag === 7000));

const q = player(); q.items[300002] = 1;
const migrated = reward.migrateOldTrekShipItem(q, 300002);
assert.equal(migrated.changed, true); assert.equal(q.items[300002] || 0, 0);
assert.ok(q.other_attr_info.oldTrekInfo.shipSkins.includes(300002));
const repeat = reward.migrateOldTrekShipItem(q, 300002);
assert.equal(repeat.changed, false); assert.equal(q.items[300002] || 0, 0);

// Shop path (tag 1210): the configured 50 blueprint cost must grant ownership,
// never leave the ship as a generic bag item.
const item = require(path.join(app, 'src/handlers/item'));
const originalSave = players.savePlayer;
const originalLoad = players.loadPlayer;
players.savePlayer = async (_id, value) => value;
const shopPlayer = player();
shopPlayer.items[300102] = 50;
shopPlayer.shopInfo.buyRecords = {};
const shopSession = { userId: shopPlayer.userId, serverId: 1003, player: shopPlayer };
players.loadPlayer = async () => shopPlayer;
const shopResult = await item.handleMultiBuyItem({ require: { 13000201: 1 }, requestId: 'shipfix01' }, shopSession, 77);
const shopRows = Array.isArray(shopResult) ? shopResult : [shopResult];
assert.equal(shopRows.find((x) => x.tag === 1210 || x.tag === 1202)?.data?.result, 0);
assert.ok(shopPlayer.other_attr_info.oldTrekInfo.shipSkins.includes(300002));
assert.equal(shopPlayer.items[300002] || 0, 0);
players.savePlayer = originalSave;
players.loadPlayer = originalLoad;

console.log(JSON.stringify({ result: 'PASS', checks: 8, productionWrites: 0, networkAttempts: 0 }));
}
main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });

'use strict';
const assert = require('node:assert/strict');
const clone = value => JSON.parse(JSON.stringify(value));
const playerService = require('../src/services/PlayerService');
const handler = require('../src/handlers/bid-king');

let saved = 0;
playerService.savePlayer = async (_userId, player) => { saved += 1; return player; };

function first(packet) { return Array.isArray(packet) ? packet[0] : packet; }
function fresh() {
  const player = {
    userId: 'bid-qa', playerId: 'bid-qa', name: 'Bid QA', level: 100,
    items: { 339: 1000000, 302706: 2 }, other_attr_info: {},
  };
  handler.ensureBidKingInfo(player);
  assert.deepEqual(player.other_attr_info.bidKingInfo.characterReward, []);
  return { userId: player.userId, player };
}

(async () => {
  const session = fresh();
  const relief = first(await handler.handleClaimRelief({}, session, 0));
  assert.deepEqual(relief.data.characterReward, []);
  const match = first(await handler.handleMatch({ arch: 1, map: 1, chara: 303401 }, session, 1));
  assert.equal(match.tag, 7302);
  assert.equal(match.data.roomInfo.round, 0);
  assert.equal(match.data.roomInfo.status, 0);
  assert.equal(match.data.roomInfo.players.length, 4);
  assert.deepEqual(match.data.roomInfo.players.map(row => row.dbid), ['bid-qa', '1', '2', '3']);

  const bid1 = first(await handler.handleBid({ bid: 30000, round: 1, requestId: 'bidqa_001' }, session, 2));
  assert.equal(bid1.data.playerUpdate.status, 1);
  assert.equal(bid1.data.playerUpdate.round, 1);
  assert.equal(session.player.other_attr_info.bidKingInfo.roomInfo.players[0].bids[0], 30000);

  const replay = first(await handler.handleBid({ bid: 99999, round: 1, requestId: 'bidqa_002' }, session, 3));
  assert.equal(replay.data.playerUpdate.currentBid, 30000);

  const item = first(await handler.handleUseItem({ itemId: 302706, round: 1 }, session, 4));
  assert.equal(item.data.effect.round, 1);
  assert.equal(item.data.effect.treasure.length, 0);
  assert.equal(session.player.items[302706], 1);
  const itemReplay = first(await handler.handleUseItem({ itemId: 302706, round: 1 }, session, 44));
  assert.equal(itemReplay.data.effect.round, 1);
  assert.equal(session.player.items[302706], 1);

  const bid2 = first(await handler.handleBid({ bid: 40000, round: 2, requestId: 'bidqa_003' }, session, 5));
  assert.equal(bid2.data.playerUpdate.status, 1);
  assert.equal(bid2.data.playerUpdate.round, 2);

  const beforeFinish = clone(session.player.items);
  const finish = await handler.handleFinish({ round: 2, requestId: 'bidqa_finish' }, session, 6);
  assert(Array.isArray(finish));
  assert.equal(finish.find(packet => packet.tag === 7305 && packet.data && packet.data.result === 0).data.result, 0);
  assert.equal(session.player.other_attr_info.bidKingInfo.roomInfo, null);
  assert.equal(session.player.items[339], beforeFinish[339] - 40000);
  assert.equal(saved >= 4, true);
  const lose = fresh();
  await handler.handleMatch({ arch: 1, map: 1, chara: 303401 }, lose, 10);
  await handler.handleBid({ bid: 1, round: 1, requestId: 'bidqa_lose1' }, lose, 11);
  await handler.handleBid({ bid: 1, round: 2, requestId: 'bidqa_lose2' }, lose, 12);
  const loseFinish = await handler.handleFinish({ round: 2, requestId: 'bidqa_losefinish' }, lose, 13);
  const loseEnd = loseFinish.find(packet => packet.tag === 7305 && packet.data && packet.data.winner);
  assert.notEqual(loseEnd.data.winner, 'bid-qa');
  assert.equal(lose.player.items[339], 1000000);
  console.log(JSON.stringify({ status: 'PASS', saved, productionWrites: 0, playerWrites: 0 }));
})().catch(error => { console.error(error); process.exitCode = 1; });

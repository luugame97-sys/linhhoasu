'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const APP = path.resolve(process.env.LHS_APP_ROOT || path.join(ROOT, 'linhhoasu/lhs/newServer'));
process.env.CONFIG_BIN_PATH = path.resolve(process.env.CONFIG_BIN_PATH
  || path.join(ROOT, 'linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin'));

const config = require(path.join(APP, 'src/services/ConfigService'));
const playerService = require(path.join(APP, 'src/services/PlayerService'));
const rewardGrant = require(path.join(APP, 'src/services/RewardGrantService'));
const fashion = require(path.join(APP, 'src/handlers/fashion'));

playerService.savePlayer = async (_userId, player) => player;

function basePlayer() {
  return {
    userId: 'dye-ui-fixture',
    playerId: 'dye-ui-fixture',
    level: 99,
    roleInfo: { kungfuId: 4, subJob: 0 },
    items: { 118: 40 },
    currencies: {},
    fashionInfo: {
      curFashion: {}, fashion: {}, fashionMap: {}, equipped: {},
      fashions: {}, activateFashion: [], fashionData: [],
      suits: {}, suitColors: {}, starUp: {}, dress: [], sets: [], setId: 0,
      emoji: {}, emojiGroups: [],
    },
  };
}

function active(info, ids) {
  const values = new Set((info.activateFashion || []).map(Number));
  return ids.every((id) => values.has(id));
}

async function main() {
  config.loadAllTables(process.env.CONFIG_BIN_PATH);
  const baseIds = [29031, 29032, 29033, 29039];
  const color2Ids = [80229031, 80229032, 80229033, 80229039];
  const player = basePlayer();
  baseIds.forEach((id) => rewardGrant.grantFashionToPlayer(player, id));

  // Snapshot represents FashionModel.activateFashion in the browser before RPC.
  const clientBefore = JSON.parse(JSON.stringify(player.fashionInfo));
  const result = await fashion.handleSuitColorUnlock(
    { id: 29030, color: 2, replace: 0 },
    { userId: player.userId, player },
    9101,
  );
  const packets = Array.isArray(result) ? result : [result];
  const tags = packets.map((packet) => packet.tag);
  const serverOwnedAfter = active(player.fashionInfo, color2Ids);
  const clientOwnedWithout1800 = active(clientBefore, color2Ids);
  const fashionPacket = packets.find((packet) => packet.tag === 1800);
  const clientAfter = JSON.parse(JSON.stringify(clientBefore));
  clientAfter.activateFashion = fashionPacket && fashionPacket.data
    ? fashionPacket.data.fashion.slice()
    : clientAfter.activateFashion;
  clientAfter.fashionData = fashionPacket && fashionPacket.data
    ? fashionPacket.data.data.slice()
    : clientAfter.fashionData;
  const clientOwnedAfter1800 = active(clientAfter, color2Ids);
  const relogOwned = active(JSON.parse(JSON.stringify(player.fashionInfo)), color2Ids);

  assert.equal(serverOwnedAfter, true);
  assert.equal(Number(player.items[118] || 0), 0);
  assert.equal(tags.includes(1803), true);
  assert.equal(tags.includes(1800), true);
  assert.equal(clientOwnedWithout1800, false);
  assert.equal(clientOwnedAfter1800, true);
  assert.equal(relogOwned, true);

  const retry = await fashion.handleSuitColorUnlock(
    { id: 29030, color: 2, replace: 0 },
    { userId: player.userId, player },
    9102,
  );
  const retryPackets = Array.isArray(retry) ? retry : [retry];
  const retryTags = retryPackets.map((packet) => packet.tag);
  assert.deepEqual(retryTags, [1800, 1803]);
  assert.equal(Number(player.items[118] || 0), 0);

  console.log(JSON.stringify({
    result: 'PASS',
    suitId: 29030,
    color: 2,
    name: 'Thương Minh Thám Nhược',
    baseIds,
    colorIds: color2Ids,
    cost: { id: 118, count: 40 },
    responseTags: tags,
    serverOwnedAfter,
    clientOwnedWithout1800,
    clientOwnedAfter1800,
    relogOwned,
    retryTags,
    secondCostCharged: false,
    fix: 'FASHION_1800_PUSH_AFTER_1803',
  }));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});

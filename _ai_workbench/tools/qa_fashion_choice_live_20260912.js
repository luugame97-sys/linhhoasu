'use strict';
const assert = require('node:assert/strict');
const config = require('/linhhoasu/lhs/newServer/src/services/ConfigService');
const players = require('/linhhoasu/lhs/newServer/src/services/PlayerService');
players.drainPendingSaves = async () => {};
players.savePlayer = async (_id, player) => player;
const item = require('/linhhoasu/lhs/newServer/src/handlers/item');
const boxes = require('/linhhoasu/lhs/newServer/src/services/FashionBoxService');
config.loadAllTables();
assert.equal(boxes.isCandidateBox(99001), true);
assert.equal(boxes.isCandidateBox(99002), true);
const cases = [
  { id: 99001, index: 0, expected: [28371, 28372, 28373, 28379] },
  { id: 99002, index: 17, expected: [28361, 28362, 28363, 28369] },
];
(async () => {
  for (const test of cases) {
    const player = {
      userId: `qa-choice-${test.id}`,
      playerId: `qa-choice-${test.id}`,
      level: 120,
      items: { [test.id]: 1 },
      currencies: { diamond: 0, silver: 0, gold: 0 },
      fashionInfo: { fashion: {}, curFashion: {}, fashionMap: {}, equipped: {}, fashions: {},
        activateFashion: [], fashionData: [], sets: [], setId: 0, suits: {}, dress: [] },
      other_attr_info: {},
    };
    const result = await item.handleUseItem({ itemId: test.id, count: 1, selects: { [test.index]: 1 } },
      { userId: player.userId, player }, 1);
    const packets = Array.isArray(result) ? result : [result];
    assert.equal(packets.find((packet) => packet.tag === 1300)?.data?.result, 0);
    assert.equal(player.items[test.id] || 0, 0);
    assert.deepEqual(player.fashionInfo.activateFashion.slice().sort((a, b) => a - b), test.expected);
  }
  console.log(JSON.stringify({ result: 'PASS', boxes: cases.map((test) => test.id), productionWrites: 0 }));
})().catch((error) => { console.error(error); process.exitCode = 1; });

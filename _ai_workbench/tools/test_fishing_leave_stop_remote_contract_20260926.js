'use strict';

// Remote production-runtime contract. It intentionally avoids local-only
// test dependencies (acorn/client bundle parsing) and never creates a player
// or writes a database record.
const path = require('path');
const assert = require('assert/strict');
const net = require('net');
const app = '/linhhoasu/lhs/newServer';

process.env.CONFIG_BIN_PATH = path.join(app, 'update/resource/assets/excel/config_e5ac72c2.bin');
process.env.LOG_DIR = '';
process.env.NODE_ENV = 'test';
net.Socket.prototype.connect = () => { throw Error('TEST_NETWORK_FORBIDDEN'); };

let saves = 0;
function stub(rel, exports) {
  const file = require.resolve(path.join(app, rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}
stub('src/logger', { info() {}, warn() {}, error() {}, debug() {} });
stub('src/services/PlayerService', {
  savePlayer: async (_id, player) => { saves += 1; return player; },
  wasRecentlySaved: () => false,
});
stub('src/db/models/Player', {
  find: () => ({
    sort() { return this; }, limit() { return this; }, select() { return this; },
    lean: async () => [],
  }),
});

const fish = require(path.join(app, 'src/handlers/fish'));
const { FishingRoomService } = require(path.join(app, 'src/services/FishingRoomService'));
const clone = value => JSON.parse(JSON.stringify(value));
const ack = (result, tag) => (Array.isArray(result) ? result : [result])
  .find(packet => packet && packet.tag === tag && packet.data && packet.data.result != null).data;

function session() {
  const player = {
    userId: 'leave-remote-contract', playerId: 'leave-remote-contract', name: 'fixture', serverId: 1001,
    level: 100, roleInfo: { kungfuId: 4, subJob: 0 }, taskInfo: {}, other_attr_info: {},
    items: { 65: 100 }, currencies: { gold: 0, diamond: 0, silver: 0 },
    fishInfo: { scene: 1, level: 28 }, systemUnlockInfo: { unlockedSystem: [215, 221, 223] },
    rechargeInfo: { monthCards: {} }, activityInfo: { datas: [] },
  };
  fish.ensureFishInfo(player);
  return { userId: player.userId, player, _fishRooms: new FishingRoomService(), _fishConnected: true };
}

async function main() {
  let tests = 0;
  {
    const s = session(), before = clone(s.player), beforeSaves = saves;
    const data = ack(await fish.handleFishCatch({ count: 1, requestId: 'remote_no_room', expectedRevision: 0 }, s, 1), 4000);
    assert.equal(data.reason, 'FISH_ROOM_REQUIRED');
    assert.deepEqual(s.player, before);
    assert.equal(saves, beforeSaves);
    tests += 1;
  }
  {
    const s = session();
    assert.equal(ack(await fish.handleFishEnterMap({ id: 1 }, s, 2), 4050).result, 0);
    s.player.fishInfo.fishResult.fishInfos = [{ id: 5011, uid: 7001, type: 1, quality: 2, attrs: [], skills: [] }];
    await fish.handleFishLeaveMap({}, s, 3);
    const before = clone(s.player), beforeSaves = saves;
    assert.equal(ack(await fish.handleFishCatch({ count: 1, requestId: 'remote_after_leave', expectedRevision: 0 }, s, 4), 4000).reason, 'FISH_ROOM_REQUIRED');
    assert.deepEqual(s.player, before);
    assert.equal(saves, beforeSaves);
    tests += 1;
  }
  {
    const s = session();
    s.player.fishInfo.fishResult.fishInfos = [{ id: 5011, uid: 7002, type: 1, quality: 2, attrs: [], skills: [] }];
    const before = clone(s.player), beforeSaves = saves;
    assert.equal(ack(await fish.handleFishDealMulti({ auto: 1, dealMap: { 1: [7002] } }, s, 5), 4008).reason, 'FISH_ROOM_REQUIRED');
    assert.equal(ack(await fish.handleFishDealMulti({ autoPower: true, autoPowerVersion: 1, uids: [7002] }, s, 6), 4008).reason, 'FISH_ROOM_REQUIRED');
    assert.deepEqual(s.player, before);
    assert.equal(saves, beforeSaves);
    tests += 1;
  }
  {
    const s = session();
    await fish.handleFishEnterMap({ id: 1 }, s, 7);
    s.player.fishInfo.fishResult.fishInfos = [{ id: 5011, uid: 7003, type: 1, quality: 2, attrs: [], skills: [] }];
    assert.equal(ack(await fish.handleFishCatch({ count: 1, requestId: 'remote_pending', expectedRevision: 0 }, s, 8), 4000).reason, 'FISH_PENDING');
    tests += 1;
  }
  console.log(JSON.stringify({ result: 'PASS', tests, productionWrites: 0, playerWrites: 0 }));
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });

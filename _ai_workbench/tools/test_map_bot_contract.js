const assert = require('node:assert/strict');
const path = require('node:path');

const serverRoot = process.env.MAP_BOT_APP_ROOT
  ? path.resolve(process.env.MAP_BOT_APP_ROOT)
  : path.resolve(__dirname, '..', '..', 'linhhoasu', 'lhs', 'newServer');
process.chdir(serverRoot);
const WebSocket = require(path.join(serverRoot, 'node_modules', 'ws'));

const configService = require(path.join(serverRoot, 'src', 'services', 'ConfigService'));
configService.loadAllTables();
const mapMonsters = require(path.join(serverRoot, 'src', 'services', 'MapMonsterService'));
const box = require(path.join(serverRoot, 'src', 'handlers', 'box'));
const basic = require(path.join(serverRoot, 'src', 'handlers', 'basic'));
const playerService = require(path.join(serverRoot, 'src', 'services', 'PlayerService'));
const runtimeBus = require(path.join(serverRoot, 'src', 'services', 'RuntimeBus'));
const router = require(path.join(serverRoot, 'src', 'router'));
const WSServer = require(path.join(serverRoot, 'src', 'net', 'WSServer'));

function player(userId, playerId) {
  return {
    userId,
    playerId,
    name: userId,
    level: 5,
    exp: 0,
    items: { 4: 5 },
    roleInfo: { kungfuId: 1, subJob: 0, stage: 1, stageId: 1 },
    raidInfo: { level: 1, chapter: 1 },
    taskInfo: { tasks: {}, tasksMap: {} },
    other_attr_info: { mainTaskProgress: {}, realmTaskProgress: {} },
  };
}

async function run() {
  const humanMapStats = WSServer.prototype.getHumanMapStats.call({
    clients: new Map([
      [1, { ws: { readyState: WebSocket.OPEN }, session: { player: {}, _mapId: 10024, _mapLine: 0 } }],
      [2, { ws: { readyState: WebSocket.OPEN }, session: { player: {}, _mapId: 10024, _mapLine: 0 } }],
      [3, { ws: { readyState: WebSocket.OPEN }, session: { player: {}, _mapId: 10024, _mapLine: 0, _isBot: true } }],
      [4, { ws: { readyState: WebSocket.CLOSED }, session: { player: {}, _mapId: 10025, _mapLine: 0 } }],
    ]),
  });
  assert.deepEqual(humanMapStats, {
    totalHumans: 2,
    maps: [{ mapId: 10024, line: 0, count: 2 }],
  });

  mapMonsters.clearClaims();
  const stats = mapMonsters.getStats();
  assert.equal(stats.mapsLoaded, 58);
  assert.equal(stats.mapsWithMonsters, 58);
  assert.equal(stats.originalSlots, 1233);
  assert.equal(stats.totalSlots, 2466);
  assert.equal(stats.densityMultiplier, 2);
  const slot = mapMonsters.getSlot(10001, 0);
  assert.ok(slot && slot.id > 0 && slot.x > 0 && slot.y > 0);

  const broadcasts = [];
  runtimeBus.setWsServer({
    broadcastMapExceptUser(...args) {
      broadcasts.push(args);
    },
    broadcastExceptUser(...args) {
      broadcasts.push(args);
    },
  });
  const originalSave = playerService.savePlayerDeferred;
  const originalRandom = Math.random;
  let saveCalls = 0;
  playerService.savePlayerDeferred = async (_userId, state) => state;
  playerService.savePlayerDeferred = async (_userId, state) => {
    saveCalls += 1;
    return state;
  };
  Math.random = () => 0;

  const first = { userId: 'map-bot-a', wsId: 11, serverId: 1001, _isBot: true, _mapId: 10001, _mapLine: 0, _mapPos: { x: slot.x, y: slot.y } };
  first.player = player(first.userId, 'map-player-a');
  first._mapSelfInfo = {
    id: first.player.playerId,
    playerId: first.player.playerId,
    x: slot.x,
    y: slot.y,
    name: first.player.name,
    level: first.player.level,
    showInfo: basic.buildMapShowInfo(first.player),
  };
  const mapAppearanceBroadcasts = [];
  first._broadcastMapExceptUser = (tag, data) => mapAppearanceBroadcasts.push([tag, data]);
  const second = { userId: 'map-bot-b', wsId: 12, serverId: 1001, _isBot: true, _mapId: 10001, _mapLine: 0, _mapPos: { x: slot.x, y: slot.y } };
  second.player = player(second.userId, 'map-player-b');

  try {
    const opened = await box.handleOpenBox({ index: slot.index, count: 1, speedUp: true, pos: { x: slot.x, y: slot.y } }, first, 101);
    assert.ok(Array.isArray(opened));
    assert.equal(opened[0].tag, 2000);
    assert.equal(opened[0].data.count, 1);
    assert.equal(first.player.items[4], 99999);
    assert.equal(opened[0].data.premiumQuality, 44);
    assert.ok(opened[0].data.items.some((row) => row.id === 175 && row.count === 1));
    const premiumEquipDrop = opened[0].data.items.find((row) => {
      const asset = configService.get('AssetsConfig')[row.id];
      return asset && Number(asset.type) === 3;
    });
    assert.ok(premiumEquipDrop);
    assert.equal(Number(configService.get('AssetsConfig')[premiumEquipDrop.id].quality), 44);
    assert.ok(Object.values(configService.get('BoxConfig')).some((row) => (
      row && Array.isArray(row.itemShow) && row.itemShow.map(Number).includes(175)
    )));
    assert.equal(first.pendingBoxClaim.index, slot.index);
    assert.equal(broadcasts.length, 1);
    assert.equal(broadcasts[0][0], first.userId);
    assert.equal(broadcasts[0][1], 10001);
    assert.equal(broadcasts[0][2], 0);
    assert.equal(broadcasts[0][3], 2150);
    assert.equal(broadcasts[0][4].speedUp, true);

    const busy = await box.handleOpenBox({ index: slot.index, count: 1, pos: { x: slot.x, y: slot.y } }, second, 102);
    assert.equal(busy.tag, 2000);
    assert.equal(busy.data.busy, 1);
    assert.equal(busy.data.count, 0);
    assert.equal(second.player.items[4], 100000);

    const tooFar = { userId: 'map-bot-far', wsId: 13, serverId: 1001, _isBot: true, _mapId: 10001, _mapLine: 0, _mapPos: { x: 1, y: 1 } };
    tooFar.player = player(tooFar.userId, 'map-player-far');
    const far = await box.handleOpenBox({ index: slot.index, count: 1 }, tooFar, 103);
    assert.equal(far.data.reason, 'too_far');
    assert.equal(tooFar.player.items[4], 5);

    const human = { userId: 'map-human', wsId: 14, serverId: 1001, _mapId: 10001, _mapLine: 0, _mapPos: { x: 1, y: 1 } };
    human.player = player(human.userId, 'map-player-human');
    const humanOpen = await box.handleOpenBox({ index: 1, count: 1 }, human, 104);
    assert.equal(humanOpen[0].tag, 2000);
    assert.equal(humanOpen[0].data.count, 1);
    assert.equal(humanOpen[0].data.premiumQuality, undefined);
    assert.equal(humanOpen[0].data.items.some((row) => row.id === 175), false);
    assert.ok(human.pendingBoxClaim);
    await box.handleBoxReward({}, human, 105);

    const expiry = mapMonsters.tryClaim({
      serverId: 1001,
      mapId: 10001,
      line: 0,
      index: 2,
      ownerId: 'expiry-owner',
    });
    assert.equal(expiry.ok, true);
    mapMonsters._claims.get(expiry.claim.key).expiresAt = Date.now() - 1;
    assert.equal(mapMonsters.complete(expiry.claim, { ownerId: 'expiry-owner' }), false);

    const claimed = await box.handleBoxReward({}, first, 106);
    const claimPacket = claimed[claimed.length - 1];
    assert.equal(claimPacket.tag, 2001);
    assert.ok(claimPacket.data.rewardInfo);
    assert.equal(claimPacket.data.rewardInfo.autoDelegate.equipped.length, 1);
    assert.deepEqual(mapAppearanceBroadcasts.map(([tag]) => tag), [1402, 1401]);
    assert.equal(first._mapSelfInfo.showInfo.equipMap['1'], premiumEquipDrop.id);
    assert.ok(first._mapSelfInfo.showInfo.power > 0);
    assert.equal(first.pendingBoxClaim, null);
    assert.equal(mapMonsters.getStats().activeCooldowns, 2);

    const invalid = await box.handleOpenBox({ index: 99999, count: 1 }, second, 107);
    assert.equal(invalid.tag, 2000);
    assert.equal(invalid.data.reason, 'invalid_target');
    assert.equal(second.player.items[4], 100000);

    const denied = router.route(2300, 108, { type: 1 }, {
      _isBot: true,
      userId: 'map-bot-contract',
      player: { playerId: 'map-bot-contract' },
    });
    assert.equal(denied.data.msg, 'bot action denied');
    assert.equal(saveCalls, 3);
  } finally {
    mapMonsters.clearClaims();
    Math.random = originalRandom;
    playerService.savePlayerDeferred = originalSave;
    runtimeBus.setWsServer(null);
  }

  console.log(JSON.stringify({
    result: 'ok',
    manifest: {
      maps: stats.mapsLoaded,
      mapsWithMonsters: stats.mapsWithMonsters,
      totalSlots: stats.totalSlots,
    },
    scopedBroadcast: broadcasts[0].slice(0, 4),
    premiumDrop: {
      quality: 44,
      equipId: first._mapSelfInfo.showInfo.equipMap['1'],
      showItemId: 175,
      appearanceTags: mapAppearanceBroadcasts.map(([tag]) => tag),
      power: first._mapSelfInfo.showInfo.power,
      saveCalls,
    },
    humanMapStats,
    target: slot,
  }));
}

run().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});

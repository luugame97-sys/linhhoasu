'use strict';

// Focused regression for the shipped fishing-leave addon and server guard.
// No network, account creation, database writes, or runtime deployment.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const net = require('net');
const root = path.resolve(__dirname, '../..');
const acorn = require(path.join(root, 'linhhoasu/lhs/newServer/node_modules/acorn'));
const app = path.join(root, 'linhhoasu/lhs/newServer');
const addonPath = path.join(root, 'linhhoasu/webgame/game/js/lhs-fishing-leave-stop-v1.js');
const addon = fs.readFileSync(addonPath, 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const tests = [];

function test(name, fn) {
  fn();
  tests.push(name);
}

function clientFixture() {
  const sent = [], timers = [], trace = [];
  const model = {
    isAutoFish: true,
    _catchRequestPending: true,
    _autoPowerPending: true,
    _autoPowerGeneration: 10,
    _fishRoomChanging: false,
    fishing: true,
    clickProtect: true,
    changeSceneCallBack() {},
    autoDealAllFish() { trace.push('autoDeal'); return true; },
    Rpc(tag, data, callback) { sent.push({ tag, data, callback }); },
    cs_fish_map_leave() {
      if (this._fishRoomChanging) return;
      const captured = manager.RaidMgr.mFishRaid;
      this.isAutoFish = false;
      this.Rpc(4051, {}, data => {
        if (data && data.result === 0 && manager.RaidMgr.mFishRaid === captured) {
          manager.RaidMgr.FishMapClear();
        }
      });
    }
  };
  const raid = {
    fishMainView: {},
    backExit() { this.fishMainView = null; trace.push('backExit'); }
  };
  const manager = {
    FishingModel: model,
    RaidMgr: {
      mFishRaid: raid,
      FishMapClear() { this.mFishRaid = null; trace.push('clearRaid'); }
    }
  };
  const context = {
    GlobalManager: manager,
    setTimeout: fn => { timers.push(fn); return timers.length; },
    console: { info() {}, warn() {} }
  };
  context.window = context;
  vm.runInNewContext(addon, context, { filename: addonPath });
  return { model, raid, manager, sent, timers, trace, api: context.LhsFishingLeaveStopV1 };
}

const currentBundle = fs.readFileSync(path.join(root, 'linhhoasu/webgame/game/js/main.min_drop100.js'), 'utf8');
function extractCurrent(marker) {
  const at = currentBundle.indexOf(marker);
  assert(at >= 0, `missing current bundle marker ${marker}`);
  let node = acorn.parseExpressionAt(currentBundle, currentBundle.indexOf('function', at), { ecmaVersion: 'latest' });
  if (node.type === 'SequenceExpression') node = node.expressions[0];
  assert.equal(node.type, 'FunctionExpression');
  return currentBundle.slice(node.start, node.end);
}

function currentClientFixture() {
  const sent = [], trace = [];
  const model = {
    isAutoFish: true,
    _autoPowerGeneration: 3,
    _catchRequestPending: true,
    _autoPowerPending: true,
    fishing: true,
    clickProtect: true,
    Rpc(tag, data, callback) { sent.push({ tag, data, callback }); }
  };
  const manager = {
    FishingModel: model,
    RaidMgr: {
      mFishRaid: null,
      FishMapClear() { this.mFishRaid = null; trace.push('clearRaid'); }
    }
  };
  const raid = {
    fishMainView: {},
    RemoveAllEntity() { trace.push('removeAllEntity'); }
  };
  const context = {
    GlobalManager: manager,
    Y: { RaidMgr: manager.RaidMgr, FishingModel: model },
    setTimeout() { return 1; },
    console: { info() {}, warn() {} }
  };
  context.window = context;
  model.cs_fish_map_leave = vm.runInNewContext(`(${extractCurrent('u.cs_fish_map_leave=function')})`, context);
  raid.backExit = vm.runInNewContext(`(${extractCurrent('r.backExit=function')})`, context);
  manager.RaidMgr.mFishRaid = raid;
  vm.runInNewContext(addon, context, { filename: addonPath });
  return { model, raid, manager, sent, trace, api: context.LhsFishingLeaveStopV1 };
}

test('back exit stops auto, invalidates old callbacks, sends leave once', () => {
  const f = clientFixture();
  f.raid.backExit();
  assert.equal(f.model.isAutoFish, false);
  assert.equal(f.model._catchRequestPending, false);
  assert.equal(f.model._autoPowerPending, false);
  assert.equal(f.model.fishing, false);
  assert.equal(f.model.clickProtect, false);
  assert.equal(f.model.changeSceneCallBack, null);
  assert(f.model._autoPowerGeneration > 10);
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].tag, 4051);
  assert.equal(f.model.autoDealAllFish(), false);
  assert(!f.trace.includes('autoDeal'));
  assert.equal(f.raid.fishMainView, null);
  f.raid.backExit();
  assert.equal(f.sent.length, 1);
});

test('normal leave cancels pending state and clears the captured raid on ACK', () => {
  const f = clientFixture();
  f.model.cs_fish_map_leave();
  assert.equal(f.sent.length, 1);
  f.sent[0].callback({ result: 0 });
  assert.equal(f.manager.RaidMgr.mFishRaid, null);
});

test('leave supersedes scene-change pending and stale ACK cannot clear new raid', () => {
  const f = clientFixture();
  f.model._fishRoomChanging = true;
  f.raid.backExit();
  assert.equal(f.model._fishRoomChanging, false);
  assert.equal(f.sent.length, 1);
  const replacement = { fishMainView: {} };
  f.manager.RaidMgr.mFishRaid = replacement;
  f.sent[0].callback({ result: 0 });
  assert.equal(f.manager.RaidMgr.mFishRaid, replacement);
});

test('addon is idempotent and does not install twice', () => {
  const f = clientFixture();
  assert.equal(f.api.installed, true);
  assert.deepEqual(Array.from(f.api.patched), [
    'FishingModel.cs_fish_map_leave',
    'FishingModel.autoDealAllFish',
    'RaidMgr.FishMapClear',
    'FishMapRaid.backExit'
  ]);
  assert.equal(f.timers.length, 1);
});

test('actual current bundle backExit is wired to the native 4051 leave path', () => {
  const f = currentClientFixture();
  f.raid.backExit();
  assert.equal(f.model.isAutoFish, false);
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].tag, 4051);
  assert(f.trace.includes('removeAllEntity'));
  f.sent[0].callback({ result: 0 });
  assert.equal(f.manager.RaidMgr.mFishRaid, null);
});

async function serverTests() {
  process.env.CONFIG_BIN_PATH = path.join(root, 'linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin');
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
    wasRecentlySaved: () => false
  });
  stub('src/db/models/Player', { find: () => ({ sort() { return this; }, limit() { return this; }, select() { return this; }, lean: async () => [] }) });
  const fish = require(path.join(app, 'src/handlers/fish'));
  const { FishingRoomService } = require(path.join(app, 'src/services/FishingRoomService'));
  const ack = (result, tag) => (Array.isArray(result) ? result : [result]).find(packet => packet && packet.tag === tag && packet.data.result != null).data;
  function session() {
    const player = {
      userId: 'leave-test', playerId: 'leave-test', name: 'fixture', serverId: 1001,
      level: 100, roleInfo: { kungfuId: 4, subJob: 0 }, taskInfo: {}, other_attr_info: {},
      items: { 65: 100 }, currencies: { gold: 0, diamond: 0, silver: 0 },
      fishInfo: { scene: 1, level: 28 }, systemUnlockInfo: { unlockedSystem: [215, 221, 223] },
      rechargeInfo: { monthCards: {} }, activityInfo: { datas: [] }
    };
    fish.ensureFishInfo(player);
    return { userId: player.userId, player, _fishRooms: new FishingRoomService(), _fishConnected: true };
  }
  async function check(name, fn) { await fn(); tests.push(name); }

  await check('catch without room rejected before spend or save', async () => {
    const s = session(), before = clone(s.player), n = saves;
    const data = ack(await fish.handleFishCatch({ count: 1, requestId: 'leave_no_room_1', expectedRevision: 0 }, s, 1), 4000);
    assert.equal(data.reason, 'FISH_ROOM_REQUIRED');
    assert.deepEqual(s.player, before);
    assert.equal(saves, n);
  });
  await check('enter then leave preserves pending fish and rejects later catch', async () => {
    const s = session();
    assert.equal(ack(await fish.handleFishEnterMap({ id: 1 }, s, 2), 4050).result, 0);
    s.player.fishInfo.fishResult.fishInfos = [{ id: 5011, uid: 9999, type: 1, quality: 2, attrs: [], skills: [] }];
    const pending = clone(s.player.fishInfo.fishResult.fishInfos);
    assert.equal(ack(await fish.handleFishLeaveMap({}, s, 3), 4051).result, 0);
    assert(!s._fishRooms.members.has(s));
    assert.deepEqual(s.player.fishInfo.fishResult.fishInfos.map(f => f.uid), pending.map(f => f.uid));
    const before = clone(s.player), n = saves;
    const data = ack(await fish.handleFishCatch({ count: 1, requestId: 'leave_after_1', expectedRevision: 0 }, s, 4), 4000);
    assert.equal(data.reason, 'FISH_ROOM_REQUIRED');
    assert.deepEqual(s.player, before);
    assert.equal(saves, n);
  });
  await check('stale room id does not substitute for actual membership', async () => {
    const s = session(); s._fishRoomId = 1; s._fishRoomMapId = 1;
    assert.equal(ack(await fish.handleFishCatch({ count: 1 }, s, 5), 4000).reason, 'FISH_ROOM_REQUIRED');
  });
  await check('stale auto-deal and auto-power are rejected after room leave', async () => {
    const s = session();
    await fish.handleFishEnterMap({ id: 1 }, s, 8);
    s.player.fishInfo.fishResult.fishInfos = [{ id: 5011, uid: 7001, type: 1, quality: 2, attrs: [], skills: [] }];
    await fish.handleFishLeaveMap({}, s, 9);
    const before = clone(s.player), n = saves;
    const deal = await fish.handleFishDealMulti({ auto: 1, dealMap: { 1: [7001] } }, s, 10);
    const dealData = ack(deal, 4008);
    assert.equal(dealData.reason, 'FISH_ROOM_REQUIRED');
    const power = await fish.handleFishDealMulti({ autoPower: true, autoPowerVersion: 1, uids: [7001] }, s, 11);
    const powerData = ack(power, 4008);
    assert.equal(powerData.reason, 'FISH_ROOM_REQUIRED');
    assert.deepEqual(s.player, before);
    assert.equal(saves, n);
  });
  await check('real membership reaches existing pending-fish validation', async () => {
    const s = session(); await fish.handleFishEnterMap({ id: 1 }, s, 6);
    s.player.fishInfo.fishResult.fishInfos = [{ id: 5011, uid: 9999, type: 1, quality: 2, attrs: [], skills: [] }];
    const data = ack(await fish.handleFishCatch({ count: 1, requestId: 'leave_member_1', expectedRevision: 0 }, s, 7), 4000);
    assert.equal(data.reason, 'FISH_PENDING');
  });
}

serverTests().then(() => {
  console.log(JSON.stringify({ result: 'PASS', tests: tests.length, names: tests, productionWrites: 0 }));
}).catch(error => { console.error(error.stack); process.exitCode = 1; });

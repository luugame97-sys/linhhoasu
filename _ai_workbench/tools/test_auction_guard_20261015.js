'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const task = path.resolve(__dirname, '../temp/auction_20261015');
const candidate = path.join(task, 'candidate');
let checks = 0, fakeSaves = 0;
function check(name, fn) { fn(); checks++; console.log('PASS', name); }
function loadHandler(source, baseline = false) {
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require(name) {
    if (baseline && name === '../services/PlayerService') return { savePlayer: async () => { fakeSaves++; } };
    throw new Error('Forbidden dependency: ' + name);
  } });
  return module.exports;
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

(async () => {
  const old = loadHandler(fs.readFileSync(path.join(task, 'baseline/src/handlers/auction.js'), 'utf8'), true);
  const badSession = { userId: 'RAM_ONLY', player: { playerId: 'RAM_ONLY', items: {}, currencies: { gold: 0 } } };
  const original = await old.handleAuctionRecycleItem({ id: 999999, count: 100, price: 100000 }, badSession, 1);
  check('baseline exploit reproduced in RAM: nonexistent inventory grants gold', () => {
    assert.equal(original.data.result, 0); assert.equal(badSession.player.currencies.gold, 1000000); assert.equal(fakeSaves, 1);
  });
  const h = loadHandler(fs.readFileSync(path.join(candidate, 'src/handlers/auction.js'), 'utf8'));
  const rows = [
    ['handleAuctionOnShelf', 5101], ['handleAuctionOffer', 5102], ['handleAuctionOffShelf', 5103],
    ['handleAuctionRecordReward', 5110], ['handleAuctionRecycleItem', 5111], ['handleAuctionRecordRewardAll', 5113],
  ];
  const player = freeze({ playerId: 'RAM_ONLY', items: { 1: 1000, 113: 2 }, currencies: { gold: 900, diamond: 1000 },
    artifactInfo: { artifactData: [{ id: 100, uid: 300009 }] }, auctionInfo: {
      auctions: [{ id: 1, playerId: 'OTHER', item: { id: 100, count: 1 }, price: 10 }],
      records: [{ uid: 1, type: 2, receive: 0, price: 100, item: { id: 100, count: 1 } }], deals: [],
    } });
  const before = JSON.stringify(player), session = freeze({ player, userId: 'RAM_ONLY' });
  const payloads = [null, {}, { id: 1, uid: 1, count: 300009, price: 100000 },
    { id: 999999, count: Number.MAX_SAFE_INTEGER, price: Infinity },
    { id: -1, count: -1, price: NaN }, { enabled: true, state: 'open', force: true, price: '0' }];
  for (const [name, tag] of rows) {
    for (const params of payloads) {
      const result = await h[name](params, session, 77);
      assert.equal(result.tag, tag); assert.equal(result.msgUid, 77);
      assert.notEqual(result.data.result, 0); assert.equal(result.data.code, 'AUCTION_MAINTENANCE');
      assert.equal(result.data.rewardInfo, undefined);
    }
    check(name + ': valid/malicious input refused with no mutation', () => assert.equal(JSON.stringify(player), before));
    const noAuth = await h[name]({}, null, 88); assert.equal(noAuth.data.result, -1);
  }
  await Promise.all(Array.from({ length: 100 }, () => Promise.all(rows.map(([name]) => h[name](payloads[2], session, 99)))));
  check('600 concurrent/replayed requests cannot mutate or grant', () => assert.equal(JSON.stringify(player), before));
  const enter = await h.handleAuctionEnter({}, session, 20);
  check('read-only enter retains historical records and maintenance status', () => {
    assert.deepEqual(clone(enter.data.records), clone(player.auctionInfo.records));
    assert.equal(enter.data.auctionStatus.state, 'maintenance'); assert.equal(JSON.stringify(player), before);
  });
  const newPlayer = freeze({ playerId: 'NEW_RAM_ONLY' });
  await h.handleAuctionEnter({}, { player: newPlayer }, 21);
  check('enter does not initialize or save new player state', () => assert.equal(newPlayer.auctionInfo, undefined));
  check('login/GM exports retain original state and counters', () => {
    const p = { auctionInfo: { records: [{ uid: 7 }], auctions: [], deals: [], nextRecordUid: 8, nextAuctionUid: 9, custom: true } };
    const before = clone(p); h.ensureAuctionInfo(p); assert.deepEqual(p, before);
    assert.equal(h.buildAuctionPayload(p.auctionInfo).auctionStatus.code, 'AUCTION_MAINTENANCE');
  });

  const tips = [], calls = []; let callbacks = 0;
  class Label { constructor(text) { this.text = text; } }
  class Group { constructor(children) { this.children = children; this.numChildren = children.length; } getChildAt(i) { return this.children[i]; } }
  class BaseSystem { Rpc(...args) { calls.push({ owner: this, args }); return 'RPC_HANDLE'; } }
  class SystemPanel { updateItemList(value) { this.nativeCalled = value; return 'NATIVE_RESULT'; } }
  class RecordPanel { updateUi() { this.receiveBtn.visible = true; } }
  const auction = new BaseSystem();
  const browser = { BaseSystem, AuctionSystemBiddingPanel: SystemPanel, AuctionRecordPanel: RecordPanel,
    GlobalManager: { AuctionModel: auction }, UserTips: { ins: () => ({ showTips: text => tips.push(text) }) }, eui: { Label } };
  const addon = fs.readFileSync(path.join(candidate, 'web/js/lhs-auction-status-v1.js'), 'utf8');
  vm.runInNewContext(addon, { window: browser });
  check('addon installs once without timers/network/dependencies', () => { assert.equal(browser.LhsAuctionStatusV1.installed, true); });
  const wrapped = BaseSystem.prototype.Rpc;
  browser.LhsAuctionStatusV1.install(); vm.runInNewContext(addon, { window: browser });
  check('reinstall does not stack wrappers', () => assert.equal(BaseSystem.prototype.Rpc, wrapped));
  const ordinary = () => {};
  auction.Rpc(999, { id: 1 }, ordinary);
  check('unrelated RPC preserves exact callback and request', () => assert.equal(calls.pop().args[2], ordinary));
  const result = auction.Rpc(5100, null, reply => { callbacks++; auction._auctionInfo = reply; });
  calls.pop().args[2](enter.data);
  check('enter callback executes once and shows server maintenance', () => {
    assert.equal(result, 'RPC_HANDLE'); assert.equal(callbacks, 1); assert.equal(tips.pop(), enter.data.auctionStatus.message);
  });
  const panel = new SystemPanel(), text = new Label('Vật phẩm lên kệ lúc 12:00'), image = { visible: true };
  panel.nullGr = new Group([image, new Group([text])]);
  check('empty view shows maintenance while preserving image/native result', () => {
    assert.equal(panel.updateItemList(true), 'NATIVE_RESULT'); assert.equal(text.text, 'Đấu giá đang bảo trì'); assert.equal(image.visible, true);
  });
  const record = new RecordPanel(); record.receiveBtn = { visible: true }; record.nullGr = new Group([]); record.updateUi();
  check('claim button disabled during maintenance', () => assert.equal(record.receiveBtn.visible, false));
  let success = false, closed = false;
  auction.Rpc(5102, {}, reply => { success = reply.result === 0; closed = true; });
  calls.pop().args[2]((await h.handleAuctionOffer({}, session, 9)).data);
  check('refusal reaches native cleanup but never success', () => { assert.equal(success, false); assert.equal(closed, true); assert.equal(tips.pop(), enter.data.auctionStatus.message); });
  let claimAllCallbacks = 0;
  const deniedAll = (await h.handleAuctionRecordRewardAll({}, session, 10)).data;
  auction.Rpc(5113, null, () => { claimAllCallbacks++; });
  calls.pop().args[2](deniedAll);
  check('legacy claim-all has empty uids; updated client suppresses its unguarded reward callback', () => {
    assert.deepEqual(clone(deniedAll.uids), []); assert.equal(claimAllCallbacks, 0);
  });
  auction._auctionInfo = { auctionStatus: { state: 'ready' } };
  panel.updateItemList(false); record.updateUi();
  check('ready server restores native labels/claim controls', () => { assert.equal(text.text, 'Vật phẩm lên kệ lúc 12:00'); assert.equal(record.receiveBtn.visible, true); });
  const index = fs.readFileSync(path.join(candidate, 'web/index.html'), 'utf8');
  const entry = 'js/lhs-auction-status-v1.js?v=20261015_auction_guard_v1';
  check('one addon loaded after main and existing maintenance wrapper', () => {
    assert.equal(index.split(entry).length, 2); assert(index.indexOf(entry) > index.indexOf('js/main.min_drop200.js'));
    assert(index.indexOf(entry) > index.indexOf('js/lhs-event-maintenance-v1.js'));
  });
  console.log(JSON.stringify({ checks, productionWrites: 0, networkAttempts: 0, baselineFakeSaves: fakeSaves }));
})().catch(error => { console.error(error); process.exitCode = 1; });

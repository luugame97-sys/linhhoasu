'use strict';
const assert = require('node:assert/strict');
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = process.env.ALCHEMY_SOURCE_ROOT || path.resolve(__dirname, '..');
const runtime = process.env.ALCHEMY_RUNTIME_ROOT || app;
const config = require(path.join(runtime, 'src/services/ConfigService'));
const craftSource = fs.readFileSync(path.join(app, 'src/services/AlchemyCraftService.js'), 'utf8');
function load(source, dependencies) {
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require: id => {
    if (!(id in dependencies)) throw Error('UNEXPECTED_DEPENDENCY:' + id);
    return dependencies[id];
  }, Date, Math, console });
  return module.exports;
}
const craft = load(craftSource, { './ConfigService': config, './ItemPillService': require(path.join(app,'src/services/ItemPillService')) }).craft;
const newDependencies = {
  '../services/FarmDayService': { synchronize: async () => [] },
  '../services/GameDayService': require(path.join(app,'src/services/GameDayService')),
  '../services/ConfigService': config,
  '../services/FeatureReceiptService': require(path.join(app,'src/services/FeatureReceiptService')),
  '../services/RuntimeBus': { getWsServer: () => null },
};
let passed = 0;
function test(name, work) { work(); passed++; console.log('PASS ' + name); }
function player(id = 120101) { return { items: { [id]: 1, 2001: 100, 2101: 10, 34: 500, 41: 0 }, currencies: { silver: 5000 }, roleInfo: { stage: 1 }, alchemyInfo: { level: 1, lv: 1, exp: 0, dayCount: 0 } }; }
test('normal cost, actual pill, reusable formula', () => {
  const p = player(), r = craft(p, { id: 120101, count: 2 }, false, () => 0);
  assert.equal(r.count, 2); assert.equal(p.items[120101], 1); assert.equal(p.items[110102], 2);
  assert.equal(p.items[2001], 96); assert.equal(p.currencies.silver, 4950); assert.equal(p.items[41], 20);
});
test('invalid ids and counts do not mutate', () => {
  for (const params of [{ id: 110102, count: 1 }, { id: 999, count: 1 }, { id: 120101, count: -1 }, { id: 120101, count: 1.5 }, { id: 120101, count: Infinity }]) {
    const p = player(), before = JSON.stringify(p); assert.ok(craft(p, params, false).rejected); assert.equal(JSON.stringify(p), before);
  }
});
test('ownership stage and materials', () => {
  for (const change of [p => delete p.items[120101], p => p.currencies.silver = 0, p => p.items[2001] = 0]) {
    const p = player(); change(p); const before = JSON.stringify(p); assert.ok(craft(p, { id: 120101, count: 1 }, false).rejected); assert.equal(JSON.stringify(p), before);
  }
  const p = player(120201); assert.equal(craft(p, { id: 120201, count: 1 }, false).rejected, 'stage_locked');
});
test('auto exchanges missing herb only, never free silver', () => {
  const p = player(120131); p.items[2101] = 0;
  const r = craft(p, { id: 120131, count: 2, exchange: 1 }, true, () => 0);
  assert.equal(r.count, 2); assert.equal(p.items[34], 400); assert.equal(p.currencies.silver, 4950); assert.equal(p.items[110131], 2);
});
test('auto uses owned herbs before exchange', () => {
  const p = player(120131); craft(p, { id: 120131, count: 2, exchange: 1 }, true, () => 0);
  assert.equal(p.items[34], 500); assert.equal(p.items[2101], 8);
});
test('auto without resources and invalid exchange', () => {
  const p = player(120131); p.items[2101] = 0; p.items[34] = 0;
  assert.ok(craft(p, { id: 120131, count: 1, exchange: 1 }, true).rejected);
  assert.ok(craft(p, { id: 120131, count: 1, exchange: 3 }, true).rejected);
});
test('daily cap and partial auto count', () => {
  const p = player(120131); p.alchemyInfo.dayCount = config.get('AlchemyBaseConfig').alchemyDailyCount - 1;
  assert.equal(craft(p, { id: 120131, count: 3 }, true, () => 0).count, 1);
  assert.ok(craft(p, { id: 120131, count: 1 }, true).rejected);
});
test('failure consumes materials, no reward', () => {
  const p = player(120131), r = craft(p, { id: 120131, count: 1 }, true, () => .99999);
  assert.equal(r.failed, 1); assert.equal(r.items.length, 0); assert.equal(p.items[2101], 9);
});
test('pill cap stops before extra exchange', () => {
  const p = player(120131); p.items[110131] = 19; p.items[2101] = 0;
  assert.equal(craft(p, { id: 120131, count: 10, exchange: 1 }, true, () => 0).count, 1);
  assert.equal(p.items[34], 450);
});
test('configured level threshold', () => {
  const p = player(); craft(p, { id: 120101, count: 5 }, false, () => 0);
  assert.equal(p.alchemyInfo.level, 2); assert.equal(p.alchemyInfo.exp, 0); assert.equal(p.items[41], 0);
});
async function main() {
  let saves = 0, fail = false;
  const service = { drainPendingSaves: async () => {}, savePlayer: async (id, data) => { saves++; if (fail) throw Error('fixture-save'); return data; } };
  const handler = load(fs.readFileSync(path.join(app, 'src/handlers/alchemy.js'), 'utf8'), {
    ...newDependencies,
    '../services/PlayerService': service, '../services/PlayerMutationService': require(path.join(runtime, 'src/services/PlayerMutationService')),
    '../services/AlchemyCraftService': { craft }, '../services/MainTaskProgressService': { addAlchemyGenerateCount: () => false },
  });
  const s = { userId: 'fixture', player: player() };
  const before = JSON.stringify(s.player);
  await handler.handleGenerate({ id: 999, count: 1 }, s, 1);
  assert.equal(saves, 0); assert.equal(JSON.stringify(s.player), before); passed++;
  fail = true;
  await assert.rejects(handler.handleGenerate({ id: 120101, count: 1 }, s, 2));
  assert.equal(s.player, null); s.player = JSON.parse(before); passed++;
  fail = false;
  const responses = await Promise.all(Array.from({ length: 8 }, (_, i) => handler.handleGenerate({ id: 120101, count: 1 }, s, i + 10)));
  assert.equal(s.player.alchemyInfo.dayCount, 8); assert.equal(s.player.items[2001], 84);
  assert.equal(responses.flat().filter(x => x.tag === 1202).length, 8); passed++;
  const relog = JSON.parse(JSON.stringify(s.player)); handler.ensureAlchemyInfo(relog);
  assert.equal(relog.alchemyInfo.exp, s.player.alchemyInfo.exp); passed++;
  const mainSource = fs.readFileSync(process.env.ALCHEMY_MAIN || path.resolve(app, '../../webgame/game/js/main.min_a6195824.js'), 'utf8');
  const proto = { setDayCount(n) { this._dayCount = n; } };
  const events = [], tips = [];
  const ctx = { C: proto, Y: { Config: { AlchemyBaseConfig: config.get('AlchemyBaseConfig') }, MessageCenter: { dispatch: e => events.push(e) } }, E: {}, S: { ins: () => ({ showTipsByLangId() {} }) } };
  for (const name of ['sendGenerate', 'sendAutoGenerate']) {
    const start = mainSource.indexOf('C.' + name + '=function');
    const end = mainSource.indexOf('},C.', start) + 1;
    assert.ok(start > 0 && end > start); vm.runInNewContext(mainSource.slice(start, end), ctx);
  }
  function AlchemyModel() {}
  AlchemyModel.prototype = proto;
  const root = { AlchemyModel, UserTips: { ins: () => ({ showTips: x => tips.push(x) }) } };
  const patch = fs.readFileSync(process.env.ALCHEMY_PATCH || path.resolve(app, '../../webgame/game/js/lhs-alchemy-v1.js'), 'utf8');
  vm.runInNewContext(patch, { window: root });
  const model = new AlchemyModel(); model._dayCount = 0;
  let callbackCount = 0;
  model.Rpc = (tag, data, callback) => callback({ rejected: true, dayCount: 0, count: 0 });
  model.sendGenerate(120101, 2, () => callbackCount++);
  assert.equal(callbackCount, 0); assert.equal(model._dayCount, 0); assert.equal(tips.length, 1); passed++;
  model.Rpc = (tag, data, callback) => callback({ count: 1, failed: 0, dayCount: 1 });
  model.sendAutoGenerate(120131, 4, 1, () => callbackCount++);
  assert.equal(callbackCount, 1); assert.equal(model._dayCount, 1); passed++;
  const wrapped = proto.sendGenerate; vm.runInNewContext(patch, { window: root }); assert.equal(proto.sendGenerate, wrapped); passed++;
  let savedFields;
  const realTasks = require(path.join(runtime, 'src/services/MainTaskProgressService'));
  const integrated = load(fs.readFileSync(path.join(app, 'src/handlers/alchemy.js'), 'utf8'), {
    ...newDependencies,
    '../services/PlayerService': { drainPendingSaves: async () => {}, savePlayer: async (id, data) => { savedFields = JSON.parse(JSON.stringify(data)); return data; } },
    '../services/PlayerMutationService': require(path.join(runtime, 'src/services/PlayerMutationService')),
    '../services/AlchemyCraftService': { craft }, '../services/MainTaskProgressService': realTasks,
    './task': { buildActiveTaskUpdatePackets: () => [] },
  });
  const realSession = { userId: 'fixture-real-task', player: player() };
  const integratedPackets = await integrated.handleGenerate({ id: 120101, count: 1 }, realSession, 101);
  assert.equal(savedFields.other_attr_info.mainTaskProgress.alchemyGenerateCount, 1);
  assert.equal(savedFields.alchemyInfo.dayCount, 1);
  assert.equal(realSession.player.items[120101], 1); passed++;
  const packets = require(path.join(runtime, 'src/protocol/PacketManager'));
  const codec = require(path.join(runtime, 'src/protocol/Codec'));
  for (const packet of integratedPackets) {
    // BinJson uses instanceof Array; convert VM fixture arrays into the codec realm.
    const wire = packets.packSingle(packet.tag, JSON.parse(JSON.stringify(packet.data)), packet.msgUid);
    const decoded = codec.Unpack(wire.buffer.slice(wire.byteOffset, wire.byteOffset + wire.length))[0];
    assert.equal(JSON.stringify(decoded.data), JSON.stringify(packet.data));
  }
  passed++;
  console.log(JSON.stringify({ result: 'PASS', tests: passed, productionWrites: 0 }));
}
main().catch(e => { console.error(e); process.exitCode = 1; });

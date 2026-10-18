'use strict';
// Actual handlers, config and native item callback. Persistence is in memory;
// crop timers are advanced by the fixture. Never connects to a real account.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const app = process.env.FEATURE_APP || path.resolve(__dirname, '..');
const runtime = process.env.FEATURE_RUNTIME || app;
const fromApp = p => require(path.join(app, 'src', p));
const clone = x => JSON.parse(JSON.stringify(x));
let networkAttempts = 0;
const deny = () => { networkAttempts++; throw Error('TEST_NETWORK_DENIED'); };
require('net').Socket.prototype.connect = deny;
for (const module of ['http', 'https']) { require(module).request = deny; require(module).get = deny; }
global.fetch = deny;
function stub(file, exports) {
  const id = path.join(app, 'src', file);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
stub('logger.js', { info() {}, warn() {}, error() {}, debug() {} });
const db = new Map(), sessions = new Map(), broadcasts = [];
const players = {
  async savePlayer(id, value) { db.set(id, { ...db.get(id), ...clone(value) }); return value; },
  async savePlayerDeferred(id, value) { return this.savePlayer(id, value); },
  async drainPendingSaves() {}, wasRecentlySaved() { return false; },
};
stub('services/PlayerService.js', players);
stub('services/RuntimeBus.js', { getWsServer: () => ({
  clients: new Map(),
  getPlayerForMutation: id => sessions.get(id)?.player,
  invalidatePlayerForMutation(id) { sessions.get(id).player = null; },
  broadcastMapExceptUser(...args) { broadcasts.push(clone(args)); },
}) });
const config = fromApp('services/ConfigService'), tables = config.loadAllTables();
const drops = fromApp('services/AlchemyMaterialDropService');
const maps = fromApp('services/MapMonsterService');
const box = fromApp('handlers/box'), item = fromApp('handlers/item');
const farm = fromApp('handlers/farm'), alchemy = fromApp('handlers/alchemy');
const equip = fromApp('services/EquipService');
const packet = fromApp('protocol/PacketManager'), codec = fromApp('protocol/Codec');
const context = { kind: 'normal', valid: true, mapId: 10001 };
const rows = r => Array.isArray(r) ? r : [r];
const ack = (r, tag) => (rows(r).find(p => p.tag === tag && p.msgUid > 0) || rows(r).find(p => p.tag === tag))?.data;
const material = id => id >= 2001 && id <= 2015 || id >= 2201 && id <= 2215;
const rawMaterials = () => Object.values(tables.AlchemyFormulaConfig).flatMap(f => f.consumes).map(r => r.id);
let sequence = 0, passed = 0;
function fresh(stage = 1) {
  const userId = 'material_fixture_' + (++sequence);
  const alchemyLevel = Math.min(60, Math.max(1, (Math.ceil(stage / 3) - 1) * 4 + 1));
  const player = { userId, playerId: userId, name: 'fixture', level: 30, exp: 0,
    roleInfo: { stage, kungfuId: 4 }, items: { 4: 100, 29: 1000 },
    currencies: { silver: 0, diamond: 0, gold: 0 },
    boxInfo: { tier: 10, tierExp: 0, tierUpTime: 0, level: 1, exp: 0 },
    farmInfo: { lv: 25, exp: 0, blockInfo: [], buildLv: { 1: 1, 2: 1, 3: 1 } },
    alchemyInfo: { level: alchemyLevel, lv: alchemyLevel, exp: 0, dayCount: 0 }, other_attr_info: {}, taskInfo: {},
    systemUnlockInfo: { unlockedSystem: [303, 304] }, shopInfo: { buyRecords: {} },
    rechargeInfo: { records: [], monthCards: {} } };
  farm.ensureFarmInfo(player); alchemy.ensureAlchemyInfo(player);
  fromApp('services/FarmDayService').prepare(player);
  const session = { userId, player, wsId: sequence, serverId: 1001, _mapId: 10001, _mapLine: sequence };
  sessions.set(userId, session); db.set(userId, clone(player));
  return session;
}
async function fixedRng(value, work) {
  const previous = Math.random; Math.random = () => value;
  try { return await work(); } finally { Math.random = previous; }
}
const tests = [];
function test(name, work) { tests.push({ name, work }); }

test('all 148 formulas / 46 raw ingredients have a renewable source', () => {
  assert.equal(Object.keys(tables.AlchemyFormulaConfig).length, 148);
  const ids = [...new Set(rawMaterials())]; assert.equal(ids.length, 46);
  assert.equal(ids.filter(material).length, 30);
  for (const id of ids) {
    if (id === 2) continue; // equipment sale tested below
    if (material(id)) {
      assert.ok(drops.validate()[id % 100]); continue;
    }
    assert.ok(id >= 2101 && id <= 2115, 'UNSUPPORTED_RAW_MATERIAL:' + id);
    const shop = Object.values(tables.ShopConfig).find(s => s.tab === 6 && !s.payId && !s.limit
      && !s.conditions?.length && s.rewards?.length === 1 && s.rewards[0].id === id
      && s.rewards[0].count === 1 && s.cost?.length === 1 && s.cost[0].id === 34);
    assert.ok(shop, 'HERB_SOURCE_MISSING:' + id);
  }
});
test('tier follows realm boundaries and ignores character/equipment level', () => {
  for (let stage = 1; stage <= 45; stage++) {
    const p = { roleInfo: { stage }, level: 1305, boxInfo: { level: 58 } };
    assert.equal(drops.currentTier(p), Math.ceil(stage / 3));
    p.level = 1; p.boxInfo.level = 1;
    assert.equal(drops.currentTier(p), Math.ceil(stage / 3));
  }
  assert.equal(drops.currentTier({ roleInfo: { stage: 0 } }), 0);
  assert.equal(drops.currentTier({ roleInfo: { stage: 1.5 } }), 0);
});
test('all configured normal maps retain the source without inventing invalid tiers', () => {
  const normal = Object.values(tables.MapConfig).filter(m => m.type === 1);
  const expectedMaps = tables.DropLevelExtensionConfig && tables.DropLevelExtensionConfig.version === 'drop100_v1' ? 108 : 58;
  assert.equal(normal.length, expectedMaps);
  for (const map of normal) assert.deepEqual(drops.roll({ roleInfo: { stage: 13 } }, 2,
    { ...context, mapId: map.id }, () => 0), [{ id: 2005, count: 2 }, { id: 2205, count: 2 }]);
});
test('only the current tier drops; earlier tiers are not randomized', () => {
  for (let tier = 1; tier <= 15; tier++) {
    const player = { roleInfo: { stage: tier * 3 - 2 } };
    assert.deepEqual(drops.roll(player, 1, context, () => 0),
      [{ id: 2000 + tier, count: 1 }, { id: 2200 + tier, count: 1 }]);
    const coreOnly = drops.roll(player, 1, context, () => 0.1);
    assert.deepEqual(coreOnly, [{ id: 2000 + tier, count: 1 }]);
  }
});
test('invalid/unclaimed maps, non-normal actions and bots never roll', () => {
  const p = fresh().player;
  for (const bad of [{}, { ...context, valid: false }, { ...context, mapId: 999 },
    { ...context, isBot: true }, { ...context, kind: 'boss' }]) {
    assert.deepEqual(drops.roll(p, 10, bad, () => { throw Error('RNG_MUST_NOT_RUN'); }), []);
  }
  for (const count of [0, -1, 1.5, Infinity]) assert.throws(() => drops.roll(p, count, context));
  assert.throws(() => drops.roll(p, 1, context, () => 1));
});
test('exact probability boundaries and quantity per paid attempt', () => {
  const p = fresh().player;
  assert.deepEqual(drops.roll(p, 10, context, () => 0), [{ id: 2001, count: 10 }, { id: 2201, count: 10 }]);
  assert.deepEqual(drops.roll(p, 10, context, () => 0.2), []);
  assert.deepEqual(drops.roll(p, 10, context, () => 0.05), [{ id: 2001, count: 10 }]);
});
let economy;
test('100k seeded-roll economy matches 20% / 5% and current tier only', () => {
  let state = 123456789;
  const rng = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const result = drops.roll({ roleInfo: { stage: 43 } }, 100000, context, rng);
  const total = base => result.filter(r => r.id > base && r.id <= base + 15).reduce((sum, r) => sum + r.count, 0);
  const core = total(2000), blood = total(2200);
  assert.ok(Math.abs(core - 20000) < 700); assert.ok(Math.abs(blood - 5000) < 400);
  assert.equal(result.length, 2);
  assert.equal(result.find(r => r.id === 2015).count, core);
  assert.equal(result.find(r => r.id === 2215).count, blood);
  economy = { paidAttempts: 100000, innerCores: core, bloodEssences: blood };
});
test('manual and auto native 2000 -> 2001 grant only after claim', async () => {
  for (const speedUp of [false, true]) {
    const s = fresh(13); s._itemListCache = { stale: true };
    const open = ack(await fixedRng(0, () => box.handleOpenBox({ index: 0, count: 5, speedUp, tier: 15, materialId: 2015 }, s, 1)), 2000);
    assert.equal(open.count, 5); assert.equal(s.player.items[4], 95);
    assert.equal(s.player.items[2005], undefined);
    assert.deepEqual(open.items.filter(r => material(r.id)), [{ id: 2005, count: 5 }, { id: 2205, count: 5 }]);
    assert.deepEqual(broadcasts.at(-1).at(-1).items, open.items);
    const r = await box.handleBoxReward({ items: [{ id: 2015, count: 999 }] }, s, 2);
    assert.equal(s.player.items[2005], 5); assert.equal(s.player.items[2205], 5);
    assert.equal(s.player.items[2015], undefined); assert.equal(s._itemListCache, null);
    assert.equal(ack(r, 1202).changed.find(x => x.id === 2005).count, 5);
    assert.equal(ack(r, 2001).rewardInfo.equips.length, 5);
    assert.equal(db.get(s.userId).items[2005], 5);
    for (const p of rows(r)) {
      const b = packet.packSingle(p.tag, p.data, p.msgUid);
      assert.deepEqual(codec.Unpack(b.buffer.slice(b.byteOffset, b.byteOffset + b.length))[0].data, p.data);
    }
  }
});
test('open replay never spends/rerolls; claim replay never grants twice', async () => {
  const s = fresh(4);
  const open = ack(await fixedRng(0, () => box.handleOpenBox({ index: 0, count: 3 }, s, 1)), 2000);
  s.player.roleInfo.stage = 43;
  const retry = ack(await fixedRng(.999, () => box.handleOpenBox({ index: 0, count: 99 }, s, 2)), 2000);
  assert.deepEqual(retry.items, open.items); assert.equal(s.player.items[4], 97);
  const other = ack(await box.handleOpenBox({ index: 1, count: 1 }, s, 3), 2000);
  assert.equal(other.reason, 'pending_reward');
  await box.handleBoxReward({}, s, 4);
  const before = clone(s.player.items);
  await box.handleBoxReward({ count: 999, items: open.items }, s, 5);
  assert.deepEqual(s.player.items, before);
  s.player = clone(db.get(s.userId)); await box.handleBoxReward({}, s, 6);
  assert.equal(s.player.items[2002], 3); assert.equal(s.player.items[2015], undefined);
});
test('two players cannot farm the same claimed monster', async () => {
  const a = fresh(), b = fresh(); b._mapLine = a._mapLine;
  const result = await fixedRng(0, () => Promise.all([box.handleOpenBox({ index: 0, count: 1 }, a, 1), box.handleOpenBox({ index: 0, count: 1 }, b, 2)]));
  assert.equal(result.filter(r => ack(r, 2000).count === 1).length, 1);
  await box.handleBoxReward({}, a, 3); await box.handleBoxReward({}, b, 4);
  assert.equal((a.player.items[2001] || 0) + (b.player.items[2001] || 0), 1);
  assert.equal(a.player.items[4] + b.player.items[4], 199);
});
test('expired/released claim cannot pay material rewards', async () => {
  for (const release of [false, true]) {
    const s = fresh(); await fixedRng(0, () => box.handleOpenBox({ index: 0, count: 1 }, s, 1));
    if (release) box.releasePendingBoxClaim(s);
    else maps._claims.get(s.pendingBoxClaim.key).expiresAt = Date.now() - 1;
    await box.handleBoxReward({}, s, 2);
    assert.equal(s.player.items[2001], undefined); assert.equal(s.player.items[2201], undefined);
  }
});
test('actual bun count caps multi-open rewards; invalid target costs nothing', async () => {
  const s = fresh(); s.player.items[4] = 2;
  assert.equal(ack(await box.handleOpenBox({ index: 99999, count: 10 }, s, 1), 2000).reason, 'invalid_target');
  assert.equal(s.player.items[4], 2);
  await fixedRng(0, () => box.handleOpenBox({ index: 0, count: 10 }, s, 2));
  await box.handleBoxReward({}, s, 3); assert.equal(s.player.items[2001], 2);
  assert.equal(ack(await box.handleOpenBox({ index: 1, count: 10 }, s, 4), 2000).count, 0);
});
test('bots retain premium equipment without new material inflation', async () => {
  const s = fresh(); s._isBot = true; const slot = maps.getSlot(10001, 0); s._mapPos = { x: slot.x, y: slot.y };
  const open = ack(await fixedRng(0, () => box.handleOpenBox({ index: 0, count: 1 }, s, 1)), 2000);
  assert.ok(open.premiumQuality > 0); assert.deepEqual(open.items.filter(r => material(r.id)), []);
  box.releasePendingBoxClaim(s);
});
test('native inventory callback shows material count once, even with stale cache/replayed push', async () => {
  const mainPath = process.env.FEATURE_MAIN || path.resolve(runtime, '../../webgame/game/js/main.min_a6195824.js');
  const main = fs.readFileSync(mainPath, 'utf8');
  const acorn = require(process.env.FEATURE_ACORN || path.join(runtime, 'node_modules/acorn'));
  function source(name) {
    const at = main.indexOf('m.' + name + '=function'); assert.ok(at >= 0);
    let expr = acorn.parseExpressionAt(main, at + ('m.' + name + '=').length, { ecmaVersion: 2022 });
    if (expr.type === 'SequenceExpression') expr = expr.expressions[0];
    return main.slice(expr.start, expr.end);
  }
  const model = { _itemMap: { 2001: 7 }, _timeRecords: {}, _composeIdDict: {}, getItemType: id => tables.AssetsConfig[id]?.type, isFreeze: false };
  const ctx = vm.createContext({ m: model, Y: { Config: tables, ItemModel: model, CuriosModel: { taskCheck() {} }, MessageCenter: { dispatch() {} } },
    E: new Proxy({}, { get: (_, key) => String(key) }), A: { ins: () => ({ dispatch() {} }) } });
  for (const name of ['onItemChange', 'SetItemCount', 'GetItemCount']) vm.runInContext('m.' + name + '=' + source(name), ctx);
  const s = fresh(); s.player.items[2001] = 10;
  await fixedRng(0, () => box.handleOpenBox({ index: 0, count: 2 }, s, 1));
  const sync = ack(await box.handleBoxReward({}, s, 2), 1202);
  model.onItemChange(sync); assert.equal(model.GetItemCount(2001), 12);
  model.onItemChange(sync); assert.equal(model.GetItemCount(2001), 12);
});

const sourceInventory = new Map();
test('15 tiers: acquire cores/blood from real monster handlers and silver from equipment sale', async () => {
  for (let tier = 1; tier <= 15; tier++) {
    const s = fresh(tier * 3 - 2);
    // Equipment quality RNG does not affect the material rate contract here.
    await fixedRng(0, () => box.handleOpenBox({ index: 0, count: 10 }, s, 1));
    const r = await box.handleBoxReward({}, s, 2);
    const equips = ack(r, 2001).rewardInfo.equips;
    const sale = equip.saleOpenEquips(s.player, equips.map(e => e.uid));
    assert.equal(sale.uids.length, 10); assert.ok(s.player.currencies.silver > 0);
    assert.equal(s.player.items[2000 + tier], 10); assert.equal(s.player.items[2200 + tier], 10);
    sourceInventory.set(tier, clone(s.player));
  }
});
test('15 herbs: sow -> mature -> harvest Linh thuc -> shop -> persisted bag', async () => {
  const s = fresh(43);
  for (let tier = 1; tier <= 15; tier++) {
    const id = 2100 + tier, shopId = 6000002 + tier;
    const cost = tables.ShopConfig[shopId].cost[0].count;
    while ((s.player.items[34] || 0) < cost) {
      assert.equal(ack(await farm.handlePlantInfo({ seed: 29, index: 0 }, s, 1), 2400).result, 0);
      const plot = s.player.farmInfo.blockInfo.find(b => b.index === 0);
      plot.finishTime = Date.now() - 1; // elapsed crop time, not an inventory grant
      assert.equal(ack(await farm.handlePlantHarvest({ index: 0 }, s, 2), 2401).result, 0);
    }
    const before = s.player.items[34];
    const shopResult = await item.handleMultiBuyItem({ require: { [shopId]: 1 } }, s, 3);
    assert.equal(ack(shopResult, 1202).result, 0, JSON.stringify(shopResult));
    assert.equal(s.player.items[id], 1); assert.equal(s.player.items[34] || 0, before - cost);
    assert.equal(db.get(s.userId).items[id], 1);
    sourceInventory.get(tier).items[id] = db.get(s.userId).items[id]; // reuse actually acquired fixture stock
  }
});
test('148 formulas consume source-acquired inventory and persist actual pills after relog', async () => {
  for (const recipe of Object.values(tables.AlchemyFormulaConfig)) {
    const raw = recipe.consumes.find(r => r.id !== 2).id;
    const tier = raw % 100;
    const s = fresh(recipe.stageId), stock = sourceInventory.get(tier);
    Object.assign(s.player.items, clone(stock.items));
    s.player.currencies = clone(stock.currencies);
    s.player.items[recipe.id] = 1; // recipe ownership is a prerequisite, not a raw ingredient
    assert.ok(s.player.currencies.silver >= recipe.consumes.find(r => r.id === 2).count, 'SALE_SILVER_NOT_ENOUGH:' + recipe.id);
    const auto = tables.AssetsConfig[recipe.id].subType === 3;
    const r = await fixedRng(0, () => (auto ? alchemy.handleAutoGenerate : alchemy.handleGenerate)({ id: recipe.id, count: 1, exchange: 0 }, s, 5));
    const result = rows(r).find(p => p.tag === (auto ? 2501 : 2500) && p.msgUid === 5).data;
    assert.equal(result.rejected, undefined, 'CRAFT_REJECTED:' + recipe.id + ':' + result.reason);
    assert.equal(result.count, 1); assert.equal(result.failed, 0);
    const pill = result.rewardInfo.items[0]; assert.equal(tables.AssetsConfig[pill.id].type, 8);
    const restored = clone(db.get(s.userId));
    assert.equal(restored.items[pill.id], 1); assert.equal(restored.items[recipe.id], 1);
    for (const cost of recipe.consumes.filter(c => c.id !== 2)) assert.equal(restored.items[cost.id], stock.items[cost.id] - cost.count);
  }
});

(async () => {
  for (const { name, work } of tests) {
    maps.clearClaims();
    try { await work(); passed++; } catch (error) { throw new Error(name, { cause: error }); }
  }
  assert.equal(networkAttempts, 0);
  console.log(JSON.stringify({ result: 'PASS', count: passed, formulas: 148, rawIngredients: 46,
  monsterMaterials: 30, herbs: 15, maps: Object.values(tables.MapConfig).filter(m => m.type === 1).length, economy, productionWrites: 0, networkAttempts }));
})().catch(error => { console.error(error); process.exitCode = 1; });

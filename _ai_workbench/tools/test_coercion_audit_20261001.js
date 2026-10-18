'use strict';
// Production-matching sources run in isolated VMs. No network or DB imports.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const app = path.join(root, 'linhhoasu/lhs/newServer');
const outDir = path.join(root, '_ai_workbench/temp/coercion_audit_20261001');
const live = JSON.parse(fs.readFileSync(path.join(outDir, 'live.json'), 'utf8'));
const file = rel => path.join(root, rel);
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));
const sourceFiles = {
  soul: file('_ai_workbench/temp/pet_soul_candidate_20260923/pet-soul.js'),
  pet: path.join(app, 'src/handlers/pet.js'),
  upgrade: path.join(app, 'src/handlers/upgrade.js'),
  client: file('linhhoasu/webgame/game/js/main.min_drop100.js'),
  config: file('linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin'),
};
assert.equal(sha(sourceFiles.soul), live.sources['src/handlers/pet-soul.js']);
assert.equal(sha(sourceFiles.pet), live.sources['src/handlers/pet.js']);
assert.equal(sha(sourceFiles.upgrade), live.sources['src/handlers/upgrade.js']);
assert.equal(sha(sourceFiles.client), '1ae070b19d593ca120eeaf86856d0bc85b0b9ed71d5847e65be7139c966e0e9a');
assert.ok(live.rows.every(row => row.configHash === sha(sourceFiles.config)));
const C = require(path.join(app, 'src/services/ConfigService'));
const tables = C.decodeTables(fs.readFileSync(sourceFiles.config));
const clientTables = C.decodeTables(fs.readFileSync(file('linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin')));
for (const name of ['PetBaseConfig', 'PetConfig', 'PetSoulConfig', 'PetSoulUpgradeConfig', 'CoercionConfig', 'SystemConfig']) assert.deepEqual(tables[name], clientTables[name]);
const clientSource = fs.readFileSync(sourceFiles.client, 'utf8');
let saves = 0;
function serverSandbox(sourceFile) {
  const ctx = { module: { exports: {} }, Math, Date, console, process: { env: {} }, require(name) {
    if (name === '../services/ConfigService') return { get: key => tables[key] };
    if (name === '../services/PlayerService') return { savePlayer: async () => { saves++; } };
    if (name === './raid') return { addRewardToPlayer: () => { throw Error('REWARD_OUT_OF_SCOPE'); } };
    if (name === '../logger') return { info() {}, warn() {}, error() {} };
    if (name === '../services/MainTaskProgressService') return { addPetComposeCount() {}, addPetWashCount() {}, refreshMainTaskProgress() {} };
    if (name === '../config/petSoulRewards') return require(path.join(app, 'src/config/petSoulRewards.js'));
    throw Error('FORBIDDEN_DEPENDENCY:' + name);
  } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(sourceFile, 'utf8'), ctx, { filename: sourceFile });
  return ctx;
}
const soulServer = serverSandbox(sourceFiles.soul), petServer = serverSandbox(sourceFiles.pet);
function clientMethod(name, ctx) {
  const anchor = 'a.' + name + '=function';
  const start = clientSource.indexOf(anchor), end = clientSource.indexOf('},a.', start);
  assert.ok(start >= 0 && end > start, name);
  return vm.runInContext('(' + clientSource.slice(start + ('a.' + name + '=').length, end + 1) + ')', ctx);
}
const packet = (result, tag) => (Array.isArray(result) ? result : [result]).find(p => p.tag === tag);
function session() {
  const s = { userId: 'ISOLATED_COERCION_AUDIT', player: { level: 135, items: {}, currencies: {},
    petInfo: { pets: [{ uid: 100001, id: 810101, level: 210, slot: 0, passiveSkills: [], lockSkills: [] }] },
    systemUnlockInfo: { unlockedSystem: [206, 231] }, other_attr_info: {} } };
  soulServer.module.exports.ensurePetSoulInfo(s.player);
  return s;
}
function attachClient(s) {
  const events = [], pending = [], model = { _info: copy(s.player.other_attr_info.petSoulInfo) };
  const Y = { Config: clientTables, PetSoulModel: model, ItemModel: { checkItemEnough: (id, n) => (s.player.items[id] || 0) >= n } };
  const ctx = vm.createContext({ Y, A: { ins: () => ({ dispatch: (...args) => events.push(args) }) },
    E: { PET_SOUL_STAR_UPDATE: 'PET_SOUL_STAR_UPDATE', ATTR_CHANGE: 'ATTR_CHANGE' },
    S: { ins: () => ({ showTipsByLangId() {} }) } });
  for (const name of ['getPetSouls', 'getPetSoulData', 'getPetSoulMaxStar', 'getUpgradeConfig', 'getCoercionValue', 'getCoercionStage', 'getStartUpItemsScore', 'updatePetSoul', 'cs_pet_soul_star_up']) model[name] = clientMethod(name, ctx);
  const cap = clientMethod('getPetLevelMax', ctx);
  model.Rpc = (tag, params, cb) => { assert.equal(tag, 6901); pending.push(soulServer.module.exports.handlePetSoulStarUp(params, s, 17).then(result => {
    const p = packet(result, tag); assert.equal(p.data.result, 0); cb(p.data); return result;
  })); };
  return { model, cap, pending, events };
}
const records = [];
async function test(name, run) {
  try { records.push({ name, status: 'PASS', observed: await run() }); }
  catch (e) { records.push({ name, status: 'FAIL', error: e.message }); }
}
function namedFunction(source, name) {
  const start = source.indexOf('function ' + name + '('), end = source.indexOf('\n}', start);
  assert.ok(start >= 0 && end > start, name);
  const isAsync = source.slice(start - 6, start) === 'async ';
  return source.slice(isAsync ? start - 6 : start, end + 2);
}
(async () => {
  await test('default_state_has_420_points_and_210_cap', async () => {
    const s = session(), c = attachClient(s);
    assert.equal(c.model.getCoercionValue(), 420); assert.equal(c.model.getCoercionStage(), 5);
    assert.equal(c.cap(10, true), 210); assert.equal(petServer.getPetLevelMax(s.player, { id: 810101 }), 210);
    return { souls: s.player.other_attr_info.petSoulInfo.petSouls.map(r => ({ id: r.id, star: r.star })), value: 420, stage: 5, cap: 210 };
  });
  await test('actual_client_server_two_star_ups_cross_210_to_220', async () => {
    const s = session(), c = attachClient(s); s.player.items[263] = 1000;
    const id = 210101, snapshots = [];
    for (let i = 0; i < 2; i++) {
      const cfg = tables.PetSoulUpgradeConfig[3][i];
      let n = 1; while (c.model.getStartUpItemsScore(id, { 263: n }) < cfg.require) n++;
      const before = s.player.items[263];
      assert.equal(c.model.cs_pet_soul_star_up(id, { 263: n }), true);
      const packets = await c.pending[c.pending.length - 1];
      assert.equal(s.player.items[263], before - n); assert.ok(packet(packets, 1202));
      assert.equal(c.model.getPetSoulData(id).star, i + 1);
      assert.equal(c.cap(10, true), petServer.getPetLevelMax(s.player, { id: 810101 }));
      snapshots.push({ star: i + 1, uyAp: c.model.getCoercionValue(), cap: c.cap(10, true), material263Used: n });
    }
    assert.equal(c.model.getCoercionValue(), 500); assert.equal(c.cap(10, true), 220);
    s.player.items[36] = 1000000;
    const up = await petServer.module.exports.handlePetUpgrade({ uid: 100001, lv: 1 }, s, 18);
    assert.equal(packet(up, 3304).data.result, 0); assert.equal(packet(up, 3304).data.data.level, 211);
    return { snapshots, petAfterUpgrade: 211, events: c.events };
  });
  await test('all_legal_soul_star_transitions_maintain_client_server_cap', async () => {
    const s = session(); s.player.other_attr_info.petSoulInfo.petSouls = [];
    for (const cfg of Object.values(tables.PetSoulConfig)) soulServer.module.exports.grantPetSoulToPlayer(s.player, cfg.id);
    s.player.items[273] = 10000000;
    const c = attachClient(s); let tested = 0;
    for (const cfg of Object.values(tables.PetSoulConfig)) {
      const max = c.model.getPetSoulMaxStar(cfg.id);
      for (let star = 0; star < max; star++) {
        const requireScore = tables.PetSoulUpgradeConfig[cfg.quality][star].require;
        const n = Math.ceil(requireScore / tables.PetSoulUpgradeMaterialConfig[273].score);
        assert.equal(c.model.cs_pet_soul_star_up(cfg.id, { 273: n }), true);
        await c.pending[c.pending.length - 1];
        assert.equal(c.cap(10, true), petServer.getPetLevelMax(s.player, { id: 810101 })); tested++;
      }
    }
    assert.equal(c.model.getCoercionValue(), 35125); assert.equal(c.cap(10, true), 1000);
    s.player.petInfo.pets[0].level = 999; s.player.items[36] = 1000000;
    const good = await petServer.module.exports.handlePetUpgrade({ uid: 100001, lv: 1 }, s, 18);
    assert.equal(packet(good, 3304).data.result, 0); assert.equal(packet(good, 3304).data.data.level, 1000);
    const before = copy(s.player.items), stop = await petServer.module.exports.handlePetUpgrade({ uid: 100001, lv: 1 }, s, 19);
    assert.ok(packet(stop, 3304).data.result < 0); assert.deepEqual(s.player.items, before);
    return { starTransitions: tested, maxUyAp: 35125, maxCap: 1000, upgrade999to1000: true, level1001RejectedWithoutCost: true };
  });
  await test('insufficient_and_invalid_materials_do_not_charge_or_upgrade', async () => {
    const cases = [{ items: { 263: 1 }, inventory: { 263: 100 } }, { items: { 263: 100 }, inventory: {} }, { items: { 36: 1000 }, inventory: { 36: 1000 } }];
    const results = [];
    for (const row of cases) {
      const s = session(); s.player.items = copy(row.inventory);
      const before = copy(s.player.other_attr_info.petSoulInfo.petSouls), priorSaves = saves;
      const r = packet(await soulServer.module.exports.handlePetSoulStarUp({ id: 210101, items: row.items }, s, 20), 6901);
      assert.ok(r.data.result < 0); assert.deepEqual(s.player.items, row.inventory);
      assert.deepEqual(copy(s.player.other_attr_info.petSoulInfo.petSouls), before); assert.equal(saves, priorSaves);
      results.push(r.data.result);
    }
    return { rejectionCodes: results };
  });
  await test('actual_unlock_predicate_requires_level135_and_day43', async () => {
    const src = fs.readFileSync(sourceFiles.upgrade, 'utf8');
    const ctx = vm.createContext({ config: { get: n => tables[n] }, process: { env: {} },
      toSafeInt: (v, d = 0) => Number.isFinite(Number(v)) ? Math.floor(Number(v)) : d });
    for (const name of ['normalizeIdList', 'getIgnoreDayGateSystemIds', 'getSystemConditions', 'compareConditionProgress', 'isSystemConditionMet']) vm.runInContext(namedFunction(src, name), ctx);
    const result = [];
    for (const [level, day, expected] of [[134, 43, false], [135, 42, false], [135, 43, true], [200, 33, false]]) {
      const pass = [];
      for (const cond of tables.SystemConfig[231].conditions) pass.push(await ctx.isSystemConditionMet({ level }, cond, new Set([206]), 0, { serverRunDay: day, systemId: 231 }));
      assert.equal(pass.every(Boolean), expected); result.push({ level, day, canOpen: expected });
    }
    return result;
  });
  await test('every_stage_boundary_and_non_break_quality', async () => {
    const s = session(), c = attachClient(s), changes = [];
    const rows = Object.values(tables.CoercionConfig).sort((a, b) => a.stage - b.stage);
    for (let i = 0; i < rows.length; i++) {
      c.model.getCoercionValue = () => rows[i].coercion;
      assert.equal(c.model.getCoercionStage(), rows[i].stage);
      assert.equal(c.cap(10, true), 200 + rows[i].limitLevelUp);
      assert.equal(c.cap(6, true), 200);
      if (i > 0) { c.model.getCoercionValue = () => rows[i].coercion - 1; assert.equal(c.model.getCoercionStage(), rows[i - 1].stage); }
      if ([3, 5, 6, 49, 50].includes(rows[i].stage)) changes.push({ stage: rows[i].stage, uyAp: rows[i].coercion, cap: 200 + rows[i].limitLevelUp });
    }
    return { stageBoundaries: rows.length, changes };
  });
  await test('pet_detail_refresh_gap_after_soul_star_event_reproduced', async () => {
    const s = session(), c = attachClient(s);
    const events = Object.fromEntries(['PET_DATA_UPDATE', 'EQUIP_FASHION_CHANGE', 'PET_SOUL_SET', 'PET_EQUIP_RED_UPDATE', 'PET_SOUL_STAR_UPDATE', 'PET_SOUL_DATA_UPDATE'].map(n => [n, n]));
    const subscriptions = new Map();
    const ctx = vm.createContext({ E: events, B: { ConvertLanguageToText: () => '' }, egret: { TouchEvent: { TOUCH_BEGIN: 'touchBegin' } } });
    const detailStart = clientSource.indexOf('(a=HIt.prototype)');
    const openStart = clientSource.indexOf('a.OnOpen=function', detailStart);
    const openEnd = clientSource.indexOf('},a.update=function', openStart);
    const onOpen = vm.runInContext('(' + clientSource.slice(openStart + 'a.OnOpen='.length, openEnd + 1) + ')', ctx);
    const control = () => ({ addClickEvent() {}, addLongTouchEvent() {}, addEventListener() {} });
    const view = { commonWin: { OnAdded() {} }, observe(event, fn) { subscriptions.set(event, fn); },
      update() { this.displayedCap = c.cap(10, true); }, updatePetSoulRed() {}, AddClick() {},
      showCheckBox: { ...control(), labelDisplay: {} }, currencyItem: {} };
    for (const name of ['resetBtn', 'upgradeBtn', 'washBtn', 'helpBtn', 'petSoulHelpBtn', 'lockBtn', 'shareBtn']) view[name] = control();
    onOpen.call(view, 100001);
    const before = view.displayedCap;
    s.player.items[263] = 100;
    for (const count of [23, 37]) {
      c.model.cs_pet_soul_star_up(210101, { 263: count }); await c.pending[c.pending.length - 1];
    }
    for (const [event] of c.events) { const cb = subscriptions.get(event); if (cb) cb.call(view); }
    const stale = view.displayedCap;
    view.update();
    assert.equal(before, 210); assert.equal(c.cap(10, true), 220); assert.equal(stale, 210); assert.equal(view.displayedCap, 220);
    return { finding: 'Missing PetDetailView subscription to PET_SOUL_STAR_UPDATE/PET_SOUL_DATA_UPDATE',
      before, displayedUntilRefresh: stale, actualCap: c.cap(10, true), afterReopenRefresh: view.displayedCap,
      scope: 'Existing open detail view; simulated event bus, not a browser E2E observation.' };
  });
  const result = { at: new Date().toISOString(), productionWrites: 0, networkCalls: 0, databaseImports: 0, stubbedSaveCalls: saves,
    verification: 'Production-matching sources and config in local RAM fixtures; no live player upgrade or browser E2E.',
    sourceHashes: Object.fromEntries(Object.entries(sourceFiles).map(([name, file]) => [name, sha(file)])),
    passed: records.filter(r => r.status === 'PASS').length, total: records.length, records };
  fs.writeFileSync(path.join(outDir, 'fixture.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  if (result.passed !== result.total) process.exitCode = 1;
})();

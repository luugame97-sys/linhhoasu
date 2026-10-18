'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const Module = require('module');
process.env.NODE_ENV = 'test';
const app = process.env.APP_ROOT || path.resolve(__dirname, '../../linhhoasu/lhs/newServer');
const candidate = process.env.QUENCH_CANDIDATE;
if (candidate && process.platform === 'win32') {
  const oldTrekPath = path.join(app, 'src/services/OldTrekSnapshotService.js');
  if (!fs.existsSync(oldTrekPath)) {
    const resolve = Module._resolveFilename;
    Module._resolveFilename = function (request, parent, ...args) {
      if (request === './OldTrekSnapshotService' && parent?.filename === path.join(app, 'src/services/PlayerService.js')) return oldTrekPath;
      return resolve.call(this, request, parent, ...args);
    };
    require.cache[oldTrekPath] = { id: oldTrekPath, filename: oldTrekPath, loaded: true, exports: { rememberConfirmed() {}, transfer() {} } };
  }
}
function loadSource(rel, name) {
  const filename = path.join(app, 'src', rel);
  if (!candidate) return require(filename);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  require.cache[filename] = mod;
  mod._compile(fs.readFileSync(path.join(candidate, name), 'utf8'), filename);
  return mod.exports;
}
const config = require(path.join(app, 'src/services/ConfigService'));
const Player = require(path.join(app, 'src/db/models/Player'));
const players = loadSource('services/PlayerService.js', 'PlayerService.js');
const saveReal = players.savePlayer;
const artifact = loadSource('handlers/artifact.js', 'artifact.js');
const battle = loadSource('services/BattleService.js', 'BattleService.js');
const receipts = require(path.join(app, 'src/services/FeatureReceiptService'));
config.loadAllTables();
const clone = x => JSON.parse(JSON.stringify(x));
let db, writes = 0, mode = 'ok', filters = [];
players.drainPendingSaves = async () => {};
players.loadPlayer = async () => clone(db);
Player.collection.updateOne = async (filter, update) => {
  filters.push(clone(filter));
  if (mode === 'throw') throw new Error('injected save failure');
  if (mode === 'conflict') return { matchedCount: 0 };
  const match = (filter.$and || []).every(row => Object.entries(row).every(([key, cond]) => {
    if (cond.$exists === false) return !Object.prototype.hasOwnProperty.call(db, key);
    return JSON.stringify(db[key]) === JSON.stringify(cond.$eq);
  }));
  if (!match) return { matchedCount: 0 };
  Object.assign(db, clone(update.$set));
  writes++;
  if (mode === 'uncertain') throw new Error('injected post-commit failure');
  return { matchedCount: 1 };
};
let sequence = 0;
function fresh(changes = {}) {
  const player = { userId: 'ram-quench-test', level: 300,
    currencies: { diamond: 0, silver: 0, gold: 0 },
    items: { 191: 100, 192: 100, 193: 100, 194: 5, 195: 5, 196: 5, 197: 5, 198: 5 },
    artifactInfo: { artifacts: [{ uid: 1, id: 23103, count: 0, lock: 0,
      attr: { type: 54, level: 30, value: 4000 }, extraAttrs: [],
      skillGroup: 23009, skillLv: 1, quenchLv: 0, eSkillGroup: 0, element: 1,
    }], equipMap: { 1: 1 } }, ...changes };
  return player;
}
function start(player = fresh()) { db = clone(player); mode = 'ok'; return { userId: player.userId, player }; }
function row(session) { return session.player.artifactInfo.artifacts[0]; }
function ack(out, tag) { return (Array.isArray(out) ? out : [out]).find(p => p.tag === tag).data; }
function request(params) { return { ...params, requestId: Date.now() + '-quench_test_' + (++sequence) }; }
async function quench(session, p = { uid: 1, element: 0 }) { return artifact.handleArtifactQuench(request(p), session, ++sequence); }
const checks = [];
async function test(name, fn) { await fn(); checks.push(name); }
async function run() {
  await test('quality, level and forge guards preserve economy', async () => {
    for (const change of [{ id: 23101 }, { attr: { type: 54, level: 29, value: 4000 } }, { skillGroup: 0 }]) {
      const p = fresh(); Object.assign(p.artifactInfo.artifacts[0], change); const s = start(p);
      const before = JSON.stringify(s.player.items), w = writes;
      const result = ack(await quench(s), 3505);
      assert.equal(result.result, -1, `guard ${JSON.stringify(change)}: ${JSON.stringify(result)}`); assert.equal(JSON.stringify(s.player.items), before); assert.equal(writes, w);
    }
  });
  await test('invalid element never consumes or persists', async () => {
    for (const value of [99, -1, 1.5, 'bad']) {
      const s = start(), before = JSON.stringify(db), w = writes;
      assert.equal(ack(await quench(s, { uid: 1, element: value }), 3505).result, -1);
      assert.equal(JSON.stringify(db), before); assert.equal(s.player.items[191], 100); assert.equal(writes, w);
    }
  });
  await test('old client and missing support stone reject without spending', async () => {
    const s = start(); const before = JSON.stringify(db);
    assert.equal(ack(await artifact.handleArtifactQuench({ uid: 1, element: 0 }, s, 10), 3505).code, 'ARTIFACT_CLIENT_RELOAD_REQUIRED');
    assert.equal(JSON.stringify(db), before);
    db.items[194] = 0;
    assert.equal(ack(await quench(s, { uid: 1, element: 1 }), 3505).result, -1); assert.equal(db.items[193], 100);
  });
  await test('first quench, delta costs and valid client skill shape', async () => {
    const s = start(); const out = await quench(s, { uid: 1, element: 2 });
    assert.equal(ack(out, 3505).result, 0); assert.equal(row(s).quenchLv, 1);
    assert.equal(row(s).eSkillGroup, 2320201); assert.equal(row(s).element, 2);
    assert.equal(s.player.items[191], 95); assert.equal(s.player.items[193], 95); assert.equal(s.player.items[195], 4);
    assert.deepEqual(out.find(p => p.tag === 1202).data.items.map(x => [x.id, x.count]), [[191, -5], [193, -5], [195, -1]]);
    const filter = filters[filters.length - 1]; assert.ok(filter.$and.some(x => x.artifactInfo)); assert.ok(filter.$and.some(x => x.items));
  });
  await test('substitution uses exact material amounts', async () => {
    const p = fresh(); p.items = { 191: 3, 192: 10, 193: 5 }; const s = start(p);
    assert.equal(ack(await quench(s), 3505).result, 0); assert.equal(s.player.items[191], 0); assert.equal(s.player.items[192], 0); assert.equal(s.player.items[193], 0);
  });
  await test('receipt replay on reconnect spends exactly once', async () => {
    const s = start(), p = request({ uid: 1, element: 0 });
    assert.equal(ack(await artifact.handleArtifactQuench(p, s, 40), 3505).result, 0);
    const before = JSON.stringify(db), w = writes, reconnect = { userId: s.userId, player: clone(db) };
    const out = await artifact.handleArtifactQuench(p, reconnect, 41); assert.equal(ack(out, 3505).replayed, true);
    assert.equal(JSON.stringify(db), before); assert.equal(writes, w); assert.ok(!Array.isArray(out));
  });
  await test('conflict and save error do not acknowledge or debit', async () => {
    for (const fail of ['conflict', 'throw']) {
      const s = start(), before = JSON.stringify(db); mode = fail;
      assert.equal(ack(await quench(s), 3505).result, -1); assert.equal(JSON.stringify(db), before); assert.equal(s.player.items[191], 100); assert.equal(row(s).quenchLv, 0);
    }
  });
  await test('uncertain committed write resolves through receipt', async () => {
    const s = start(); mode = 'uncertain'; const out = await quench(s); assert.equal(ack(out, 3505).result, 0); assert.equal(ack(out, 3505).replayed, true); assert.equal(db.items[191], 95);
  });
  await test('unquenched refresh is rejected without consumption', async () => {
    const s = start(), w = writes; const out = await artifact.handleArtifactQuenchRefresh(request({ uid: 1, element: 1 }), s, 50);
    assert.equal(ack(out, 3506).result, -1); assert.equal(s.player.items[193], 100); assert.equal(writes, w);
  });
  await test('refresh cache includes skill group and confirm replays', async () => {
    const s = start(); await quench(s, { uid: 1, element: 1 });
    const r = request({ uid: 1, element: 2 });
    const out = await artifact.handleArtifactQuenchRefresh(r, s, 60); assert.equal(ack(out, 3506).result, 0);
    const cache = ack(out, 3506).refreshCache; assert.ok(config.get('ArtifactElementSkillConfig')[cache.eSkillGroup][row(s).quenchLv]);
    assert.equal(s.player.items[193], 90);
    const p = request({ uid: 1 }); assert.equal(ack(await artifact.handleArtifactQuenchRefreshConfirm(p, s, 61), 3507).result, 0);
    assert.equal(row(s).element, 2); assert.equal(row(s).eSkillGroup, 2320201); assert.equal(row(s).refreshCache, null);
    assert.equal(ack(await artifact.handleArtifactQuenchRefreshConfirm(p, s, 62), 3507).replayed, true);
  });
  await test('invalid, absent, future, stale and mismatched refresh cache reject', async () => {
    for (const override of [null, { ts: Date.now() - 600001 }, { ts: Date.now() + 10000 }, { quenchLv: 2 }, { element: 99 }, { eSkillGroup: 0 }]) {
      const p = fresh(); Object.assign(p.artifactInfo.artifacts[0], { quenchLv: 1, element: 1, eSkillGroup: 2320101,
        refreshCache: override === null ? null : { ts: Date.now(), quenchLv: 1, element: 2, eSkillGroup: 2320201, ...override } });
      const s = start(p), before = JSON.stringify(db);
      assert.equal(ack(await artifact.handleArtifactQuenchRefreshConfirm(request({ uid: 1 }), s, 70), 3507).result, -1);
      assert.equal(JSON.stringify(db), before); assert.equal(row(s).element, 1);
    }
  });
  await test('next quench retains element and respects per-tier level', async () => {
    const s = start(); await quench(s, { uid: 1, element: 2 });
    assert.equal(ack(await quench(s), 3505).result, -1); db.artifactInfo.artifacts[0].attr.level = 40;
    assert.equal(ack(await quench(s), 3505).result, 0); assert.equal(row(s).quenchLv, 2); assert.equal(row(s).element, 2); assert.equal(row(s).eSkillGroup, 2320201);
  });
  await test('simultaneous replay costs once and receipt parameters conflict', async () => {
    const s = start(), p = request({ uid: 1, element: 1 }); const w = writes;
    const out = await Promise.all([artifact.handleArtifactQuench(p, s, 80), artifact.handleArtifactQuench(p, s, 81)]);
    assert.ok(out.every(x => ack(x, 3505).result === 0)); assert.equal(writes, w + 1); assert.equal(db.items[191], 95);
    assert.equal(ack(await artifact.handleArtifactQuench({ ...p, element: 2 }, s, 82), 3505).result, -1);
  });
  await test('combat quench tier, levels, matching bonus and passive attributes', async () => {
    for (const type of [1, 2]) for (const level of [1, 2, 3]) for (const element of [1, 2, 3, 4, 5]) {
      const p = fresh(); const a = p.artifactInfo.artifacts[0]; a.id = type === 1 ? 23103 : 23503;
      assert.equal(config.get('ArtifactConfig')[a.id].type, type);
      a.quenchLv = level; a.attr.level = 30 + (level - 1) * 10 + 3; a.element = element; a.eSkillGroup = (type === 1 ? 232 : 233) * 10000 + element * 100 + 1;
      const attrs = battle.calcPlayerPower(p), cfg = config.get('ArtifactQuenchConfig')[level];
      const id = type === 1 ? 255 : 256;
      assert.equal(attrs[id], cfg[type === 1 ? 'attrs1' : 'attrs2'][id] + cfg[type === 1 ? 'addAttrs1' : 'addAttrs2'][id] * 3);
      assert.equal(attrs[51], 1000); assert.equal(attrs[(type === 1 ? 160 : 170) + element], level * 1200);
      a.element = element % 5 + 1; assert.equal(battle.calcPlayerPower(p)[51] || 0, 0);
    }
  });
  await test('CAS is optional and restricts artifact fields', async () => {
    db = fresh(); filters = []; await saveReal(db.userId, { level: db.level, items: db.items }, { returnSaved: false, onlyFields: ['items'] });
    assert.equal(filters[0].$and, undefined);
    await assert.rejects(() => saveReal(db.userId, db, { returnSaved: false, onlyFields: ['items'], artifactCAS: { fields: ['name'], expected: {} } }), /ARTIFACT_CAS_FIELDS_INVALID/);
  });
  console.log(JSON.stringify({ result: 'PASS', checks: checks.length, names: checks, simulatedWrites: writes, productionPlayerWrites: 0, app, candidate: candidate || 'installed' }));
}
run().catch(e => { console.error(e.stack); process.exitCode = 1; });

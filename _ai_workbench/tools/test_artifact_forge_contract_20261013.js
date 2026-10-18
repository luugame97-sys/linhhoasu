'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const Module = require('module');
process.env.NODE_ENV = 'test';
const app = process.env.APP_ROOT || path.resolve(__dirname, '../../linhhoasu/lhs/newServer');
const candidate = process.env.FORGE_CANDIDATE;
function loadCandidate(rel, name) {
  if (!candidate) return require(path.join(app, 'src', rel));
  const filename = path.join(app, 'src', rel);
  const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  require.cache[filename] = mod; mod._compile(fs.readFileSync(path.join(candidate, name), 'utf8'), filename); return mod.exports;
}
const config = require(path.join(app, 'src/services/ConfigService'));
const players = require(path.join(app, 'src/services/PlayerService'));
const artifact = loadCandidate('handlers/artifact.js', 'artifact.js');
config.loadAllTables();
const clone = value => JSON.parse(JSON.stringify(value));
const epoch = 'a'.repeat(32);
let db, mode = 'ok', writes = 0, seq = 0;
players.drainPendingSaves = async () => {};
players.loadPlayer = async () => clone(db);
players.savePlayer = async (_uid, draft, opts = {}) => {
  if (mode === 'conflict') return false;
  const fields = opts.onlyFields || Object.keys(draft);
  const expected = opts.artifactCAS && opts.artifactCAS.expected || {};
  for (const key of fields) if (key in expected && JSON.stringify(db[key]) !== JSON.stringify(expected[key])) return false;
  fields.forEach(key => { db[key] = clone(draft[key]); }); writes += 1;
  if (mode === 'uncertain') throw new Error('injected post-commit failure');
  return true;
};
function fresh(overrides = {}) {
  return { userId: 'ram-forge-test', level: 300,
    items: { 54: 20 }, currencies: { diamond: 0, silver: 0, gold: 0 },
    artifactInfo: { artifacts: [{ uid: 1, id: 23103, count: 0, lock: 0,
      attr: { type: 54, level: 20, value: 4000 }, extraAttrs: [], skillGroup: 23009, skillLv: 1,
      quenchLv: 0, eSkillGroup: 0, element: 0 }], equipMap: { 1: 1 } },
    other_attr_info: { featureReceipts: { rows: [], retiredBefore: 0,
      epochs: [{ id: epoch, issuedAt: Date.now(), expiresAt: Date.now() + 86400000, maxSequence: 0 }] } },
    ...overrides };
}
function start(player = fresh()) { db = clone(player); mode = 'ok'; writes = 0; return { userId: db.userId, player: clone(db) }; }
function request(uid = 1, id) { return { uid, type: 1, count: 0, requestId: id || `v3_${epoch}_${++seq}` }; }
function data(reply) { return (Array.isArray(reply) ? reply : [reply]).find(x => x.tag === 3501).data; }
const checks = [];
async function check(name, fn) { await fn(); checks.push(name); }
async function run() {
  await check('valid forge consumes exactly configured cost', async () => {
    const s = start(), before = db.items[54], out = data(await artifact.handleArtifactForge(request(), s, 1));
    assert.equal(out.result, 0); assert.equal(out.artifact.count, 1); assert.equal(db.items[54], before - 1); assert.equal(writes, 1);
  });
  for (const id of [23102, 23103]) {
    await check('first forge with no skill is accepted for ' + id, async () => {
      const p = fresh(); Object.assign(p.artifactInfo.artifacts[0], { id, skillGroup: 0 });
      const out = data(await artifact.handleArtifactForge(request(), start(p), 2));
      assert.equal(out.result, 0); assert.equal(out.artifact.count, 1); assert.ok(out.artifact.skillGroup > 0);
      assert.equal(db.items[54], id === 23102 ? 20 : 19); assert.equal(writes, 1);
    });
  }
  for (const [name, change] of [['quality4', { id: 23101 }], ['level19', { attr: { type: 54, level: 19, value: 1 } }], ['expired', { forgeTime: Date.now() - 1 }], ['maxCount', { count: 7 }], ['unmappedAttr', { attr: { type: 99999, level: 20, value: 1 } }]]) {
    await check(name + ' rejects without debit', async () => { const p = fresh(); Object.assign(p.artifactInfo.artifacts[0], change); const s = start(p), before = JSON.stringify(db); const out = data(await artifact.handleArtifactForge(request(), s, 2)); assert.equal(out.result, -1); assert.equal(JSON.stringify(db), before); assert.equal(writes, 0); });
  }
  await check('missing material rejects without debit', async () => { const p = fresh({ items: { 54: 0 } }); const out = data(await artifact.handleArtifactForge(request(), start(p), 3)); assert.equal(out.result, -1); assert.equal(out.code, 'ARTIFACT_MATERIALS_NOT_ENOUGH'); assert.equal(writes, 0); });
  await check('old client without receipt is rejected', async () => { const out = data(await artifact.handleArtifactForge({ uid: 1 }, start(), 4)); assert.equal(out.result, -1); assert.equal(out.code, 'ARTIFACT_CLIENT_RELOAD_REQUIRED'); });
  await check('same request replay is idempotent', async () => { const s = start(), p = request(1, `v3_${epoch}_30`); const first = data(await artifact.handleArtifactForge(p, s, 5)); const before = JSON.stringify(db), replay = data(await artifact.handleArtifactForge(p, { userId: s.userId, player: clone(db) }, 6)); assert.equal(first.result, 0); assert.equal(replay.replayed, true); assert.equal(JSON.stringify(db), before); assert.equal(writes, 1); });
  await check('different requests serialize and each apply', async () => { const s = start(); const [a, b] = await Promise.all([artifact.handleArtifactForge(request(1, `v3_${epoch}_40`), s, 7), artifact.handleArtifactForge(request(1, `v3_${epoch}_41`), s, 8)]); assert.equal(data(a).result, 0); assert.equal(data(b).result, 0); assert.equal(db.artifactInfo.artifacts[0].count, 2); assert.equal(db.items[54], 17); assert.equal(writes, 2); });
  await check('CAS conflict does not acknowledge', async () => { const s = start(); mode = 'conflict'; const out = data(await artifact.handleArtifactForge(request(), s, 9)); assert.equal(out.result, -1); assert.ok(['ARTIFACT_SAVE_UNCONFIRMED', 'ARTIFACT_SAVE_CONFLICT'].includes(out.code)); assert.equal(db.items[54], 20); });
  await check('uncertain commit resolves through receipt', async () => { const s = start(); mode = 'uncertain'; const out = data(await artifact.handleArtifactForge(request(), s, 10)); assert.equal(out.result, 0); assert.equal(out.replayed, true); assert.equal(db.items[54], 19); });
  console.log(JSON.stringify({ result: 'PASS', checks, productionWrites: 0, playerWrites: 0, networkAttempts: 0 }));
}
run().catch(error => { console.error(error.stack || error); process.exitCode = 1; });

'use strict';
// Isolated throwaway account; real accounts are never used or updated.
const APP = process.env.QA_APP_ROOT || '/linhhoasu/lhs/newServer';
const assert = require('assert/strict'), crypto = require('crypto'), http = require('http');
const { MongoClient } = require(APP + '/node_modules/mongodb');
const bcrypt = require(APP + '/node_modules/bcrypt'), WS = require(APP + '/node_modules/ws');
const Redis = require(APP + '/node_modules/ioredis');
const { Pack, Unpack } = require(APP + '/src/protocol/Codec');
const { packRequest, unpackResponse } = require(APP + '/src/protocol/ReqCodec');
const cfg = require(APP + '/ecosystem.config.js').apps.find(p => p.name === 'lhs-s1001').env;
const redis = new Redis(cfg.REDIS_URL, { keyPrefix: cfg.AUTH_REDIS_PREFIX, maxRetriesPerRequest: 1 });
const db = new MongoClient('mongodb://127.0.0.1:27017');
const id = 'qa_s4release_' + crypto.randomBytes(8).toString('hex');
const password = crypto.randomBytes(20).toString('hex'), tokens = new Set();
const wait = ms => new Promise(r => setTimeout(r, ms));
const servers = [1001, 1002, 1003];
function sdk(sid) {
  return new Promise((resolve, reject) => {
    const body = packRequest(2820, { uid: id, token: password, ...(sid ? { serverId: sid } : {}) });
    const req = http.request({ host: '127.0.0.1', port: 81, path: '/gameMsg.do', method: 'POST',
      headers: { Host: '103.116.105.154:81', 'Content-Type': 'application/octet-stream', 'Content-Length': body.length } }, res => {
      const a = []; res.on('data', d => a.push(d)); res.on('end', () => {
        try { const data = unpackResponse(Buffer.concat(a)); if (data.userToken) tokens.add(data.userToken); resolve(data); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject); req.setTimeout(18000, () => req.destroy(Error('SDK_TIMEOUT'))); req.end(body);
  });
}
function login(auth, sid) {
  return new Promise((resolve, reject) => {
    const ws = new WS('ws://127.0.0.1:81/' + (sid === 1001 ? 'ws' : 'ws-s' + (sid - 1000)));
    let ack = false, player = false, done = false;
    const timer = setTimeout(() => { ws.terminate(); finish(Error('WS_TIMEOUT')); }, 20000);
    function finish(error) { if (done) return; done = true; clearTimeout(timer); ws.close(); error ? reject(error) : resolve(); }
    ws.on('error', finish);
    ws.on('open', () => ws.send(Pack(1, { userid: auth.userId, userToken: auth.userToken, platformuid: auth.uid, serverid: sid }, 91004)));
    ws.on('message', raw => { try {
      const b = Buffer.from(raw), v = Unpack(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
      for (const p of Array.isArray(v) ? v : [v]) {
        if (p.tag === 1) { if (p.data.result !== 0) return finish(Error('LOGIN_REJECTED:' + (p.data.code || p.data.result))); ack = true; }
        if (p.tag === 500) player = true;
      }
      if (ack && player) finish();
    } catch (e) { finish(e); } });
  });
}
(async () => {
  await db.connect(); const accounts = db.db('lhs_s1001').collection('accounts'); let created = false;
  const evidence = { nativeProtocol: true, realPlayerWrites: 0, checks: [] };
  try {
    assert.equal(await accounts.countDocuments({ accountId: id }), 0);
    await accounts.insertOne({ accountId: id, passwordHash: await bcrypt.hash(password, 10), status: 1, authVersion: 1, roles: [], activeRoleByServer: {}, createdAt: new Date() }); created = true;
    const initial = await sdk(); assert.equal(initial.ret, 0); assert.equal(initial.newServerData.serverId, 1004);
    for (const sid of servers) {
      await login(initial, sid); await wait(800);
      const refreshed = await sdk(); assert.equal(refreshed.ret, 0); assert.equal(Number(refreshed.defaultServerData.serverId), sid);
      await login(refreshed, sid); await wait(700);
      const explicit = await sdk(sid); assert.equal(explicit.ret, 0); await login(explicit, sid); await wait(700);
      const a = await accounts.findOne({ accountId: id });
      const roles = a.roles.filter(r => Number(r.serverId) === sid); assert.equal(roles.length, 1, 'DUPLICATE_ROLE');
      for (const r of a.roles) {
        const p = await db.db('lhs_s' + r.serverId).collection('players').findOne({ userId: r.userId });
        assert(p && p.accountId === id && Number(p.serverId) === Number(r.serverId), 'CROSS_DB_ROLE_MISMATCH');
      }
      evidence.checks.push({ sid, sdk: true, wsTag1And500: true, refresh: true, relog: true, explicitRouting: true, isolatedRole: true });
      console.log('LOGIN_QA_PROGRESS=' + JSON.stringify(evidence.checks.at(-1)));
    }
    const latest = await sdk(); await login(latest, 1001); await wait(800);
    assert.equal(Number((await sdk()).defaultServerData.serverId), 1001);
    assert.equal(await accounts.countDocuments({ accountId: id, 'roles.serverId': 1004 }), 0);
    const accountsSnapshot = await accounts.findOne({ accountId: id });
    evidence.s4PreOpenEmpty = (await db.db('lhs_s1004').collection('players').countDocuments({})) === 0;
    assert(evidence.s4PreOpenEmpty);
    evidence.roleCount = accountsSnapshot.roles.length; assert.equal(evidence.roleCount, 3);
    evidence.result = 'PASS'; console.log('MULTISERVER_LOGIN_QA=' + JSON.stringify(evidence));
  } finally {
    if (created) {
      await wait(2500);
      const a = await accounts.findOne({ accountId: id });
      for (const sid of servers) {
        // Only test-owned exact IDs; do not touch any unrelated player/key.
        const owned = await db.db('lhs_s' + sid).collection('players').find({ accountId: id }, { projection: { playerId: 1 } }).toArray();
        const scoped = new Redis(cfg.REDIS_URL, { keyPrefix: 's' + sid + ':', maxRetriesPerRequest: 1 });
        try {
          for (const p of owned) for (const rank of ['arena', 'tower', 'crossArena', 'crossRival', 'topArena']) {
            await scoped.zrem('rank:' + rank, p.playerId);
          }
        } finally { await scoped.quit(); }
        await db.db('lhs_s' + sid).collection('players').deleteMany({ accountId: id });
        assert.equal(await db.db('lhs_s' + sid).collection('players').countDocuments({ accountId: id }), 0);
      }
      for (const token of tokens) await redis.del('auth:session:' + token);
      await redis.del('auth:account:' + id);
      await accounts.deleteOne({ accountId: id });
      assert.equal(await accounts.countDocuments({ accountId: id }), 0);
      console.log('QA_ACCOUNT_PLAYER_CLEANUP=0');
    }
    await redis.quit(); await db.close();
  }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });

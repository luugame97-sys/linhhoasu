const assert = require('assert');
const fs = require('fs');
const WebSocket = require('/linhhoasu/lhs/newServer/node_modules/ws');
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/lhs_s1001';
process.env.REDIS_HOST = '127.0.0.1';
process.env.REDIS_PORT = '6379';
process.env.REDIS_PREFIX = 's1001:';
const { packRequest, unpackResponse } = require('/linhhoasu/lhs/newServer/src/protocol/ReqCodec');
const { Pack, Unpack } = require('/linhhoasu/lhs/newServer/src/protocol/Codec');
const mongo = require('/linhhoasu/lhs/newServer/src/db/mongo');
const redis = require('/linhhoasu/lhs/newServer/src/db/redis');
const Account = require('/linhhoasu/lhs/newServer/src/db/models/Account');
const authSession = require('/linhhoasu/lhs/newServer/src/services/AuthSessionService');

function callGameMsg(cmd, params) {
  return fetch('http://127.0.0.1:8080/gameMsg.do', {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: packRequest(cmd, params),
  }).then(async (response) => ({ http: response.status, body: unpackResponse(Buffer.from(await response.arrayBuffer())) }));
}

function wsLogin(payload) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:9200', { headers: { Origin: 'http://127.0.0.1' }, handshakeTimeout: 5000 });
    const timer = setTimeout(() => { try { ws.terminate(); } catch (_err) {} reject(new Error('WS_TEST_TIMEOUT')); }, 10000);
    let loginPacket = null;
    let closeCode = 0;
    ws.on('open', () => ws.send(Buffer.from(Pack(1, payload, 991))));
    ws.on('message', (raw) => {
      const decoded = Unpack(Buffer.isBuffer(raw) ? raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) : raw);
      const messages = Array.isArray(decoded) ? decoded : [decoded];
      const found = messages.find((row) => row && Number(row.tag) === 1 && Number(row.msgUid) === 991);
      if (found) {
        loginPacket = found;
        if (Number(found.data && found.data.result) === 0) ws.close(1000, 'contract done');
      }
    });
    ws.on('close', (code) => {
      closeCode = code;
      clearTimeout(timer);
      resolve({ loginPacket, closeCode });
    });
    ws.on('error', reject);
  });
}

(async () => {
  const qaPassword = fs.readFileSync(0, 'utf8').replace(/[\r\n]+$/, '');
  if (!qaPassword) throw new Error('QA_PASSWORD_REQUIRED_ON_STDIN');
  await mongo.connect();
  redis.connect();

  const targetBefore = await Account.findOne({ accountId: 'dinhan' }).lean();
  const wrong = `wrong_${Date.now()}_X9`;
  const wrongRecent = await callGameMsg(3074, { pageId: -1, uid: 'dinhan', token: wrong });
  const wrongLogin = await callGameMsg(2820, { uid: 'dinhan', token: wrong, serverId: 1001 });
  const targetAfter = await Account.findOne({ accountId: 'dinhan' }).lean();
  assert.strictEqual(Number(wrongRecent.body.ret), -1);
  assert.deepStrictEqual(wrongRecent.body.servers, []);
  assert.strictEqual(Number(wrongLogin.body.ret), -1);
  assert.ok(!wrongLogin.body.userToken);
  assert.strictEqual(Number(targetAfter.lastLoginTime || 0), Number(targetBefore.lastLoginTime || 0));

  const deniedWs = await wsLogin({ platformuid: 'dinhan', userid: 'u_Wk_1001_c091e8_1788148084232', serverId: 1001 });
  assert(deniedWs.loginPacket && Number(deniedWs.loginPacket.data.result) === -1);
  assert.strictEqual(deniedWs.closeCode, 1008);

  const okLogin = await callGameMsg(2820, { uid: 'vanduc97', token: qaPassword, serverId: 1001 });
  assert.strictEqual(Number(okLogin.body.ret), 0);
  assert.ok(okLogin.body.userToken && okLogin.body.userId);
  const okRecent = await callGameMsg(3074, { pageId: -1, userToken: okLogin.body.userToken });
  assert.strictEqual(Number(okRecent.body.ret), 0);
  assert(Array.isArray(okRecent.body.servers) && okRecent.body.servers.length > 0);
  const crossIdentityWs = await wsLogin({
    platformuid: 'dinhan',
    userid: 'u_Wk_1001_c091e8_1788148084232',
    userToken: okLogin.body.userToken,
    serverId: 1001,
  });
  assert(crossIdentityWs.loginPacket && Number(crossIdentityWs.loginPacket.data.result) === -1);
  assert.strictEqual(crossIdentityWs.closeCode, 1008);
  const crossServerWs = await wsLogin({
    platformuid: 'vanduc97',
    userid: okLogin.body.userId,
    userToken: okLogin.body.userToken,
    serverId: 1002,
  });
  assert(crossServerWs.loginPacket && Number(crossServerWs.loginPacket.data.result) === -1);
  assert.strictEqual(crossServerWs.closeCode, 1008);
  const okWs = await wsLogin({
    platformuid: 'vanduc97',
    userid: okLogin.body.userId,
    userId: okLogin.body.userId,
    userToken: okLogin.body.userToken,
    serverId: 1001,
    serverid: 1001,
  });
  assert(okWs.loginPacket && Number(okWs.loginPacket.data.result) === 0);
  await authSession.remove(okLogin.body.userToken);

  console.log(JSON.stringify({
    result: 'PASS', wrongPasswordDenied: true, wrongPasswordMetadataUnchanged: true,
    tokenlessWsDenied: true, tokenlessWsCloseCode: deniedWs.closeCode,
    crossIdentityTokenDenied: true, crossServerTokenDenied: true,
    correctPasswordLogin: true, sessionServerList: true, tokenWsLogin: true,
  }));
  await redis.disconnect();
  await mongo.disconnect();
})().catch(async (err) => {
  console.error(err && err.stack ? err.stack : err);
  try { await redis.disconnect(); } catch (_err) {}
  try { await mongo.disconnect(); } catch (_err) {}
  process.exit(1);
});

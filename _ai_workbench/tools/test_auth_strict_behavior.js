const assert = require('assert');
const path = require('path');

const root = process.argv[2] ? path.resolve(process.argv[2]) : '';
if (!root) throw new Error('Usage: node test_auth_strict_behavior.js <staged-newServer-root>');

process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lhs_s1001';
process.env.SDK_AUTH_PASSWORD_STRICT = '1';
process.env.ALLOW_AUTO_REGISTER = '0';
process.env.USER_CLIENT_VALIDATION_ENABLED = '1';

const mongo = require(path.join(root, 'src/db/mongo'));
const serverList = require(path.join(root, 'src/handlers/serverList'));
const accountService = require(path.join(root, 'src/services/AccountService'));
const accountHandler = require(path.join(root, 'src/handlers/account'));

(async () => {
  await mongo.connect();
  const fakeReq = { headers: { host: '127.0.0.1:81' }, protocol: 'http', socket: { localPort: 8080 } };
  const wrongPassword = `wrong_${Date.now()}_NoMatch9`;

  const recent = await serverList.handleGetServerDetail({ pageId: -1, uid: 'dinhan', token: wrongPassword }, fakeReq);
  assert.strictEqual(Number(recent.ret), -1);
  assert.strictEqual(recent.code, 'AUTH_FAILED');
  assert.deepStrictEqual(recent.servers, []);

  const login = await serverList.handleSDKAuth({ uid: 'dinhan', token: wrongPassword, serverId: 1001 }, fakeReq);
  assert.strictEqual(Number(login.ret), -1);
  assert.strictEqual(login.code, 'AUTH_FAILED');
  assert.ok(!login.userToken);

  await assert.rejects(
    accountService.createRole('dinhan', { password: wrongPassword, serverId: 1001, name: 'NoCreate' }),
    /AUTH_FAILED/
  );
  await assert.rejects(
    accountService.setActiveRole('dinhan', { password: wrongPassword, serverId: 1001 }),
    /AUTH_FAILED/
  );
  await assert.rejects(
    accountService.deleteRole('dinhan', { password: wrongPassword, serverId: 1001 }),
    /AUTH_FAILED/
  );
  await assert.rejects(
    accountHandler.handleLogin({ platformuid: 'dinhan', userid: 'u_fake', serverId: 1001 }, {}, 1),
    /AUTH_SESSION_REQUIRED/
  );

  console.log(JSON.stringify({ result: 'PASS', wrongPasswordDenied: 5, wsTokenRequired: true }));
  await mongo.disconnect();
})().catch(async (err) => {
  console.error(err && err.stack ? err.stack : err);
  try { await mongo.disconnect(); } catch (_err) {}
  process.exit(1);
});

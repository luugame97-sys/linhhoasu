const assert = require('assert');
const path = require('path');
const root = process.argv[2] ? path.resolve(process.argv[2]) : '';
if (!root) throw new Error('Usage: node test_auth_session_revoke.js <staged-newServer-root>');
process.env.REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
process.env.REDIS_PREFIX = process.env.REDIS_PREFIX || 's1001:';
const redis = require(path.join(root, 'src/db/redis'));
const auth = require(path.join(root, 'src/services/AuthSessionService'));

(async () => {
  redis.connect();
  const accountId = `codex_auth_contract_${Date.now()}`;
  const created = await auth.create({ accountId, userId: 'u_contract', roleId: 'r_contract', serverId: 1001, authVersion: 7 }, 60);
  const loaded = await auth.get(created.token);
  assert(loaded && loaded.accountId === accountId);
  assert.strictEqual(loaded.authVersion, 7);
  const removed = await auth.revokeAccount(accountId);
  assert.strictEqual(removed, 1);
  assert.strictEqual(await auth.get(created.token), null);
  await redis.disconnect();
  console.log(JSON.stringify({ result: 'PASS', accountRevoke: true, leakedToken: false }));
})().catch(async (err) => {
  console.error(err && err.stack ? err.stack : err);
  try { await redis.disconnect(); } catch (_err) {}
  process.exit(1);
});

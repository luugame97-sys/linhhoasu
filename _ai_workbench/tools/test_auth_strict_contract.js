const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = process.argv[2];
if (!root) throw new Error('Usage: node test_auth_strict_contract.js <staged-newServer-root>');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const serverList = read('src/handlers/serverList.js');
const serverList1 = read('src/handlers/serverList1.js');
const account = read('src/handlers/account.js');
const accountService = read('src/services/AccountService.js');
const authSession = read('src/services/AuthSessionService.js');
const wsServer = read('src/net/WSServer.js');
const accountModel = read('src/db/models/Account.js');
const ecosystem = read('ecosystem.config.js');

for (const source of [serverList, serverList1]) {
  assert(source.includes("code: 'AUTH_FAILED'"), 'BinJson auth must return AUTH_FAILED');
  assert(source.includes("readTextParam(params, ['userToken', 'authToken'])"), 'recent server lookup must accept verified session token');
  assert(!source.includes("String(process.env.SDK_AUTH_PASSWORD_STRICT || '0') !== '1'"), 'password fallback must be removed');
  assert(!source.includes('SDK token may rotate frequently'), 'SDK uid fallback must be removed');
  assert(source.includes('authVersion: Math.max(1'), 'issued token must carry authVersion');
}

assert(!accountService.includes('If the account exists, allow role creation anyway'), 'create-role bypass must be removed');
assert(!accountService.includes('if (!account) account = await findAccount(accountIdInput);'), 'role management bypass must be removed');
assert(account.includes("if (!token) throw new Error('AUTH_SESSION_REQUIRED')"), 'human WS must require token');
assert(account.includes("throw new Error('AUTH_SESSION_MISMATCH')"), 'WS identity binding must be enforced');
assert(account.includes('Number(authSession.authVersion) !== currentAuthVersion'), 'WS must validate authVersion');
assert(wsServer.includes("ws.close(1008, 'authentication failed')"), 'failed WS auth must close socket');
assert(authSession.includes('const DEFAULT_TTL_SEC') && authSession.includes('|| 3600'), 'auth TTL must default to one hour');
assert(authSession.includes('async function revokeAccount'), 'account session revoke must exist');
assert(accountModel.includes('authVersion: { type: Number, default: 1 }'), 'account authVersion field missing');
for (const marker of [
  "USER_CLIENT_VALIDATION_ENABLED: '1'",
  "SDK_AUTH_PASSWORD_STRICT: '1'",
  "ALLOW_AUTO_REGISTER: '0'",
  'AUTH_SESSION_TTL_SEC: 3600',
]) assert(ecosystem.includes(marker), `missing ecosystem marker ${marker}`);

console.log(JSON.stringify({ result: 'PASS', checks: 18 }));

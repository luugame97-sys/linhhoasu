#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const Module = require('module');

// The repository's Windows node_modules may not contain the CentOS native
// bcrypt binary. For this in-memory contract only, substitute bcryptjs; no
// password or production authentication is exercised.
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'bcrypt') return require('bcryptjs');
  return originalLoad.call(this, request, parent, isMain);
};

const appRoot = process.env.TIMED_BAN_APP_ROOT
  ? path.resolve(process.env.TIMED_BAN_APP_ROOT)
  : path.resolve(__dirname, '..', 'temp', 'timed_ban_candidate_20260901', 'game');
const HTTPServer = require(path.join(appRoot, 'src', 'net', 'HTTPServer.js'));
const accountBanService = require(path.join(appRoot, 'src', 'services', 'AccountBanService.js'));
const authSessionService = require(path.join(appRoot, 'src', 'services', 'AuthSessionService.js'));

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

(async () => {
  const account = {
    accountId: 'qa-http-ban',
    status: 1,
    authVersion: 2,
    roles: [{ roleId: 'role', userId: 'qa-http-role', serverId: 1001, name: 'QA HTTP' }],
    banHistory: [],
    async save() { this.saved = (this.saved || 0) + 1; return this; },
  };
  const server = Object.create(HTTPServer.prototype);
  server._internalResolveAccountForBan = async () => ({ account, userId: 'qa-http-role', error: '' });
  let revokeCalls = 0;
  const originalRevoke = authSessionService.revokeAccount;
  authSessionService.revokeAccount = async () => { revokeCalls += 1; return 2; };
  let kicked = 0;
  server.wsServer = { kickAccount() { kicked += 1; return 1; } };
  let checks = 0;
  const check = (condition, message) => { assert(condition, message); checks += 1; };
  try {
    const previewRes = response();
    await server._internalAccountBan({ body: {
      accountId: account.accountId,
      durationDays: 100,
      reason: 'Lợi dụng lỗi bánh bao',
      code: 'FORTUNE_BAOZI_EXPLOIT',
      dryRun: true,
    } }, previewRes);
    check(previewRes.statusCode === 200 && previewRes.body.success && previewRes.body.dryRun, 'ban preview failed');
    check(previewRes.body.ban.remainingDays === 100, 'ban preview duration wrong');
    check(account.status === 1 && !account.banUntil, 'ban preview mutated account');

    const commitRes = response();
    await server._internalAccountBan({ body: {
      accountId: account.accountId,
      durationDays: 100,
      reason: 'Lợi dụng lỗi bánh bao',
      code: 'FORTUNE_BAOZI_EXPLOIT',
      meta: { exploitCount: 12, exploitBaozi: 120 },
      dryRun: false,
      confirm: true,
    } }, commitRes);
    check(commitRes.statusCode === 200 && commitRes.body.success && commitRes.body.ban.banned, 'ban commit failed');
    check(account.status === 0 && account.authVersion === 3, 'ban commit status/version wrong');
    check(account.banUntil instanceof Date && account.banUntil.getTime() > Date.now(), 'ban commit expiry missing');
    check(commitRes.body.ban.message.indexOf('100 ngày') >= 0 && commitRes.body.ban.message.indexOf('Lợi dụng lỗi bánh bao') >= 0, 'ban message missing duration/reason');
    check(revokeCalls === 1 && kicked === 1, 'ban commit did not revoke/kick');

    const statusRes = response();
    await server._internalAccountBanStatus({ body: { accountId: account.accountId } }, statusRes);
    check(statusRes.statusCode === 200 && statusRes.body.ban.banned, 'status endpoint lost active ban');

    const unbanPreviewRes = response();
    await server._internalAccountUnban({ body: { accountId: account.accountId, dryRun: true } }, unbanPreviewRes);
    check(unbanPreviewRes.statusCode === 200 && unbanPreviewRes.body.dryRun && account.status === 0, 'unban preview mutated or failed');

    const unbanRes = response();
    await server._internalAccountUnban({ body: { accountId: account.accountId, reason: 'QA hoàn tất', dryRun: false, confirm: true } }, unbanRes);
    check(unbanRes.statusCode === 200 && !unbanRes.body.ban.banned && account.status === 1, 'unban commit failed');
    check(revokeCalls === 2, 'unban did not revoke old tokens');
    check(account.banHistory.length === 2, 'ban/unban history incomplete');
  } finally {
    authSessionService.revokeAccount = originalRevoke;
  }
  console.log(JSON.stringify({ result: 'PASS', checks, network: false, productionMutation: false, scope: 'in-memory HTTPServer timed-ban endpoints' }, null, 2));
})().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});

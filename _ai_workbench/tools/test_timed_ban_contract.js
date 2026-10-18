#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');

const appRoot = process.env.TIMED_BAN_APP_ROOT
  ? path.resolve(process.env.TIMED_BAN_APP_ROOT)
  : path.resolve(__dirname, '..', 'temp', 'timed_ban_candidate_20260901', 'game');
const ban = require(path.join(appRoot, 'src', 'services', 'AccountBanService'));

const NOW = Date.UTC(2026, 8, 1, 5, 0, 0);
function account(extra = {}) {
  return {
    accountId: 'qa-ban-contract',
    status: 1,
    authVersion: 7,
    roles: [{ userId: 'qa-role', roleId: 'qa-role-id', serverId: 1001, name: 'QA' }],
    banHistory: [],
    saveCalls: 0,
    async save() { this.saveCalls += 1; return this; },
    ...extra,
  };
}

(async () => {
  let checks = 0;
  const check = (condition, message) => { assert(condition, message); checks += 1; };

  const target = account();
  const validation = ban.validateBanInput({ durationSeconds: 8640000, reason: 'Lợi dụng lỗi bánh bao', code: 'FORTUNE_BAOZI_EXPLOIT', by: 'qa' });
  check(validation.ok, '100-day ban validation failed');
  const applied = await ban.applyAccountBan(target, { durationSeconds: 8640000, reason: 'Lợi dụng lỗi bánh bao', code: 'FORTUNE_BAOZI_EXPLOIT', by: 'qa', meta: { exploitCount: 12, exploitBaozi: 120 } }, { now: NOW });
  check(target.status === 0, 'ban did not set status=0');
  check(target.authVersion === 8, 'ban did not bump authVersion');
  check(target.banUntil.getTime() === NOW + 8640000 * 1000, 'banUntil is not durationSeconds');
  check(applied.remainingSeconds === 8640000, 'remainingSeconds is not durationSeconds');
  check(applied.message.indexOf('100 ngày') >= 0, 'ban message lacks duration');
  check(applied.message.indexOf('Lợi dụng lỗi bánh bao') >= 0, 'ban message lacks reason');
  check(applied.message.indexOf('12') >= 0 && applied.message.indexOf('120') >= 0, 'ban message lacks exploit meta');
  check(target.banHistory.length === 1 && target.banHistory[0].action === 'ban', 'ban history missing');
  check(target.saveCalls === 1, 'ban did not save once');

  const active = ban.inspectBanState(target, NOW + 1);
  check(active.banned && !active.permanent, 'active timed ban not detected');
  const expired = account({ status: 0, banUntil: new Date(NOW - 1), banReason: 'hết hạn', banCode: 'TEST', bannedAt: new Date(NOW - ban.DAY_MS), bannedBy: 'qa', banHistory: [] });
  const resolved = await ban.resolveAccountBanState(expired, { now: NOW, autoUnban: true });
  check(!resolved.banned && expired.status === 1, 'expired ban did not auto-unban');
  check(expired.banUntil === null && expired.banReason === '', 'expired ban fields not cleared');
  check(expired.banHistory.length === 1 && expired.banHistory[0].action === 'auto_unban', 'auto-unban history missing');
  check(expired.saveCalls === 1, 'auto-unban did not save once');

  const permanent = account();
  const permanentView = await ban.applyAccountBan(permanent, { permanent: true, reason: 'Lỗi nghiêm trọng', code: 'PERMANENT_ABUSE' }, { now: NOW });
  check(permanentView.permanent && permanentView.unlockTime === '', 'permanent ban has unlock time');
  check(permanentView.message.indexOf('vĩnh viễn') >= 0, 'permanent message wrong');

  const unbanned = await ban.unbanAccount(target, { reason: 'QA mở khóa', by: 'qa' }, { now: NOW + 1 });
  check(target.status === 1 && target.banUntil === null, 'unban did not clear status/expiry');
  check(unbanned.banned === false, 'unban view still banned');
  check(target.banHistory.length === 2 && target.banHistory[0].action === 'ban' && target.banHistory[1].action === 'unban', 'unban history missing');
  check(target.saveCalls === 2, 'unban save count wrong');

  console.log(JSON.stringify({ result: 'PASS', checks, network: false, mutation: false, scope: 'in-memory AccountBanService' }, null, 2));
})().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});

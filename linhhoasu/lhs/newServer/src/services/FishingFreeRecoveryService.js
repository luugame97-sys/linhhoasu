'use strict';

// Incident-only, HMAC-protected operator workflow. No caller-supplied amount or duration.
const fs = require('fs');
const path = require('path');
const plan = require('../config/fishingFreeRecovery20260906.json');
const Player = require('../db/models/Player');
const Account = require('../db/models/Account');
const playerService = require('./PlayerService');
const mutation = require('./PlayerMutationService');
const banService = require('./AccountBanService');
const auth = require('./AuthSessionService');
const MARKER = 'fishingFree20260906';
const BACKUP = '/linhhoasu/_ai_workbench/backups/fishing_free_recovery_20260906';
const clone = value => JSON.parse(JSON.stringify(value));
const integer = value => Number.isSafeInteger(value) && value >= 0;

function targetFor(accountId) {
  const target = plan.rows.find(r => r.accountId === accountId);
  if (!target) throw Error('RECOVERY_TARGET_NOT_ALLOWED');
  if (accountId === 'vanduc97' && target.penaltySeconds !== 0) throw Error('ADMIN_EXCLUSION_INVALID');
  return target;
}
function ownServer(target) {
  if (Number(process.env.SERVER_ID || process.env.DEFAULT_SERVER_ID) !== target.serverId) throw Error('RECOVERY_WRONG_SERVER');
}
function receipt(player) { return player?.moderation?.[MARKER]; }
function verifyReceipt(value, target) {
  if (!value || value.incident !== plan.incident || value.evidenceSha256 !== plan.evidenceSha256
      || value.amount !== target.amount || value.accountId !== target.accountId) throw Error('RECOVERY_RECEIPT_MISMATCH');
}
function verifyPlayer(player, target) {
  if (!player || player.userId !== target.userId || player.playerId !== target.playerId || player.accountId !== target.accountId
      || Number(player.serverId) !== target.serverId || player.isBot === true) throw Error('RECOVERY_PLAYER_MISMATCH');
  const shop = Number(player.shopInfo?.buyRecords?.[11001400]);
  const counts = (player.rechargeInfo?.records || []).filter(r => Number(r.id) === 11001400).map(r => Number(r.count));
  if (!integer(shop) || counts.length !== 1 || counts[0] !== shop || shop < target.recordedClaims) throw Error('RECOVERY_EVIDENCE_DRIFT');
}
async function findAccount(target) {
  const account = await Account.findOne({ accountId: target.accountId }).lean();
  if (!account || !(account.roles || []).some(r => r.userId === target.userId && Number(r.serverId) === target.serverId)) throw Error('RECOVERY_ACCOUNT_MAPPING_MISMATCH');
  return account;
}
function historyReceipt(account) {
  return (account.banHistory || []).find(r => r.code === plan.code && r.meta?.evidenceId === plan.incident);
}
function localSessions(ws, target) {
  return [...(ws?.clients?.values() || []), ...(ws?._closingPlayers?.values() || [])]
    .filter(r => r.session?.userId === target.userId);
}
function syncRecovery(ws, target, saved) {
  for (const { session } of localSessions(ws, target)) {
    if (!session.player) continue;
    session.player.items ||= {};
    session.player.items[4] = saved.items[4];
    session.player.moderation ||= {};
    session.player.moderation[MARKER] = clone(receipt(saved));
    session._responseCache?.clear();
    session._itemListCache = null;
  }
}
async function recover(target, ws) {
  ownServer(target);
  return mutation.run(target.userId, async () => {
    await playerService.drainPendingSaves(target.userId);
    await findAccount(target);
    const db = await Player.findOne({ userId: target.userId }).lean();
    verifyPlayer(db, target);
    const live = ws?.getPlayerForMutation?.(target.userId);
    if (receipt(db)) {
      verifyReceipt(receipt(db), target);
      if (live && !receipt(live)) { ws.invalidatePlayerForMutation(target.userId); throw Error('RECOVERY_RELOGIN_REQUIRED'); }
      return { ...receipt(db), replayed: true };
    }
    const current = live || db;
    verifyPlayer(current, target);
    if (receipt(current)) throw Error('RECOVERY_UNCOMMITTED_STATE');
    const before = Number(current.items?.[4]);
    if (!integer(before) || before < target.amount) throw Error('RECOVERY_INSUFFICIENT_BAOZI');
    const next = clone(current);
    const result = { incident: plan.incident, evidenceSha256: plan.evidenceSha256, accountId: target.accountId,
      userId: target.userId, playerId: target.playerId, serverId: target.serverId, amount: target.amount,
      before, after: before - target.amount, appliedAt: new Date().toISOString(), penaltySeconds: target.penaltySeconds };
    fs.mkdirSync(BACKUP, { recursive: true, mode: 0o700 });
    const backupFile = path.join(BACKUP, target.accountId + '-recovery-before.json');
    if (!fs.existsSync(backupFile)) fs.writeFileSync(backupFile, JSON.stringify({ target, playerBefore: current }, null, 2), { flag: 'wx', mode: 0o600 });
    next.items[4] = result.after;
    next.moderation ||= {};
    next.moderation[MARKER] = result;
    try {
      const saved = await playerService.savePlayer(target.userId, next, { returnSaved: false });
      if (!saved) throw Error('RECOVERY_SAVE_NOT_CONFIRMED');
      const readback = await Player.findOne({ userId: target.userId }).lean();
      verifyReceipt(receipt(readback), target);
      if (Number(readback.items?.[4]) !== result.after) throw Error('RECOVERY_READBACK_MISMATCH');
      syncRecovery(ws, target, next);
    } catch (error) {
      ws?.invalidatePlayerForMutation?.(target.userId);
      throw error;
    }
    ws?.pushToUser?.(target.userId, 1202, { result: 0, items: [{ id: 4, count: -target.amount }], changed: [{ id: 4, count: result.after }] });
    return result;
  });
}
function reason(target) {
  return 'Nhận vượt giới hạn gói miễn phí Đại hội câu cá; đã thu hồi ' + target.amount.toLocaleString('vi-VN') + ' Bánh Bao. Khóa toàn tài khoản game và web';
}
async function applyBan(target) {
  if (!target.penaltySeconds || plan.excludeBans.includes(target.accountId)) throw Error('ACCOUNT_EXEMPT_FROM_BAN');
  ownServer(target);
  return mutation.run('fishing-discipline:' + target.accountId, async () => {
    verifyReceipt(receipt(await Player.findOne({ userId: target.userId }).lean()), target);
    const account = await findAccount(target);
    const old = historyReceipt(account);
    if (old) return { replayed: true, until: new Date(old.until).getTime(), penaltySeconds: target.penaltySeconds, reason: old.reason };
    if (banService.inspectBanState(account).banned) throw Error('UNRELATED_ACTIVE_ACCOUNT_BAN');
    const now = Date.now(), until = now + target.penaltySeconds * 1000;
    const meta = banService.normalizeMeta({ source: 'fishing-remediation', eventId: 6006, shopId: 11001400,
      exploitCount: target.recordedClaims - 1, exploitBaozi: target.amount, evidenceId: plan.incident });
    const entry = { action: 'ban', at: new Date(now), until: new Date(until), reason: reason(target), by: 'owner-approved', code: plan.code, meta };
    const file = path.join(BACKUP, target.accountId + '-account-before.json');
    const { passwordHash, ...safe } = account;
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(safe, null, 2), { flag: 'wx', mode: 0o600 });
    const write = await Account.collection.updateOne({ _id: account._id, status: account.status,
      authVersion: account.authVersion ?? { $exists: false },
      banHistory: { $not: { $elemMatch: { code: plan.code, 'meta.evidenceId': plan.incident } } } }, {
      $set: { status: 0, banUntil: new Date(until), banReason: entry.reason, banCode: plan.code,
        bannedAt: new Date(now), bannedBy: 'owner-approved', banMeta: meta, updatedAt: new Date(now),
        authVersion: Math.max(1, Number(account.authVersion) || 1) + 1 },
      $push: { banHistory: { $each: [entry], $slice: -100 } },
    });
    if (write.matchedCount !== 1) throw Error('BAN_STATE_CHANGED_RECHECK');
    const after = await findAccount(target);
    if (new Date(after.banUntil).getTime() !== until || !historyReceipt(after)) throw Error('BAN_NOT_CONFIRMED');
    return { until, penaltySeconds: target.penaltySeconds, reason: entry.reason, replayed: false };
  });
}
async function enforce(target, ws) {
  if (!target.penaltySeconds || plan.excludeBans.includes(target.accountId)) throw Error('ACCOUNT_EXEMPT_FROM_BAN');
  const account = await findAccount(target), history = historyReceipt(account);
  if (!history) throw Error('BAN_NOT_APPLIED');
  const state = banService.inspectBanState(account);
  if (!state.banned) return { active: false, expired: true, kicked: 0, revoked: 0 };
  if (state.code !== plan.code || state.meta.evidenceId !== plan.incident) throw Error('BAN_CHANGED');
  const revoked = await auth.revokeAccount(target.accountId);
  const kicked = ws?.kickAccount?.(target.accountId, account.roles.map(r => r.userId), banService.formatBanMessage(state)) || 0;
  return { active: true, until: state.until, kicked, revoked, message: banService.formatBanMessage(state) };
}
async function notify(target, ws) {
  ownServer(target);
  verifyReceipt(receipt(await Player.findOne({ userId: target.userId }).lean()), target);
  const account = await findAccount(target), history = historyReceipt(account);
  if (target.penaltySeconds && !history) throw Error('BAN_NOT_APPLIED');
  const content = 'Đã thu hồi ' + target.amount.toLocaleString('vi-VN') + ' Bánh Bao nhận vượt giới hạn gói miễn phí Đại hội câu cá ngày 06/09/2026. '
    + (target.penaltySeconds ? 'Tài khoản game và web bị khóa ' + target.penaltySeconds / 60 + ' phút. Mở khóa: '
      + new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'medium', hour12: false }).format(new Date(history.until)) + ' (GMT+7).'
      : 'Tài khoản được miễn khóa theo quyết định của quản trị viên.')
    + ' Mã đối soát: ' + plan.incident + '. Không thu thêm lần nữa khi tải lại.';
  const Mail = require('../db/models/Mail');
  const mail = await Mail.findOneAndUpdate({ userId: target.userId, eventKey: plan.incident }, { $setOnInsert: {
    userId: target.userId, eventKey: plan.incident, title: 'Thông báo thu hồi Bánh Bao', content, text: content,
    sender: '0', attachments: [], targetType: 'user', targetServerId: target.serverId,
    batchId: plan.incident, createdBy: 'owner-approved', expireAt: new Date(Date.now() + 30 * 86400000),
  } }, { upsert: true, new: true }).lean();
  ws?.pushToUser?.(target.userId, 1102, { result: 0, mailData: require('../handlers/mail').toClientMail(mail) });
  return { noticeId: String(mail._id), eventKey: plan.incident, attachments: 0 };
}
async function status(target, ws) {
  const account = await findAccount(target), history = historyReceipt(account);
  const result = { accountId: target.accountId, serverId: Number(process.env.SERVER_ID || process.env.DEFAULT_SERVER_ID),
    ban: banService.buildBanView(account), appliedBan: history ? { until: new Date(history.until).getTime(), code: history.code } : null,
    exemption: plan.excludeBans.includes(target.accountId), onlineSessions: [...(ws?.clients?.values() || [])].filter(r => r.session?.accountId === target.accountId || account.roles.some(role => role.userId === r.session?.userId)).length };
  if (Number(process.env.SERVER_ID || process.env.DEFAULT_SERVER_ID) === target.serverId) {
    const p = await Player.findOne({ userId: target.userId }).lean();
    verifyPlayer(p, target);
    result.recovery = receipt(p) || null; result.currentBaozi = Number(p.items?.[4] || 0);
    result.sufficient = result.currentBaozi >= target.amount;
  }
  return result;
}
async function dispatch(body, ws) {
  const target = targetFor(String(body.accountId || '').toLowerCase());
  if (body.action === 'status') return { success: true, ...await status(target, ws) };
  if (body.confirm !== true || body.incident !== plan.incident || body.evidenceSha256 !== plan.evidenceSha256) throw Error('RECOVERY_CONFIRM_REQUIRED');
  const actions = { recover, ban: applyBan, enforce, notify };
  if (!Object.hasOwn(actions, body.action)) throw Error('RECOVERY_ACTION_NOT_ALLOWED');
  return { success: true, action: body.action, accountId: target.accountId, result: await actions[body.action](target, ws) };
}
module.exports = { dispatch, targetFor, verifyPlayer, verifyReceipt, MARKER };

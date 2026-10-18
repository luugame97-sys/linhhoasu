'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_HISTORY = 100;
const DEFAULT_REASON = 'Vi phạm quy định trò chơi';
const DEFAULT_CODE = 'ACCOUNT_DISCIPLINE';

function toSafeInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : fallback;
}

function normalizeText(value, maxLength = 240) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength);
}

function toMs(value) {
  if (value == null || value === '') return 0;
  if (value instanceof Date) return value.getTime();
  const direct = Number(value);
  if (Number.isFinite(direct) && direct > 0) return Math.floor(direct);
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeMeta(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    source: normalizeText(source.source || 'admin', 40),
    eventId: Math.max(0, toSafeInt(source.eventId, 0)),
    shopId: Math.max(0, toSafeInt(source.shopId, 0)),
    exploitCount: Math.max(0, toSafeInt(source.exploitCount, 0)),
    exploitBaozi: Math.max(0, toSafeInt(source.exploitBaozi, 0)),
    evidenceId: normalizeText(source.evidenceId, 120),
  };
}

function appendHistory(account, entry) {
  const history = Array.isArray(account.banHistory) ? account.banHistory.slice(-MAX_HISTORY + 1) : [];
  history.push({
    action: normalizeText(entry.action, 32),
    at: new Date(toMs(entry.at) || Date.now()),
    by: normalizeText(entry.by || 'system', 64),
    reason: normalizeText(entry.reason || '', 240),
    until: toMs(entry.until) > 0 ? new Date(toMs(entry.until)) : null,
    code: normalizeText(entry.code || '', 64),
    meta: normalizeMeta(entry.meta),
  });
  account.banHistory = history;
  if (typeof account.markModified === 'function') account.markModified('banHistory');
}

function inspectBanState(account, now = Date.now()) {
  if (!account) return { banned: false, expired: false, permanent: false, until: 0 };
  const status = toSafeInt(account.status, 1);
  const until = toMs(account.banUntil);
  const hasActiveFlag = status <= 0;
  const expired = hasActiveFlag && until > 0 && until <= now;
  const banned = hasActiveFlag && !expired;
  return {
    banned,
    expired,
    permanent: banned && until <= 0,
    until: banned ? until : 0,
    remainingMs: banned && until > 0 ? Math.max(0, until - now) : 0,
    remainingSeconds: banned && until > 0 ? Math.max(1, Math.ceil((until - now) / 1000)) : 0,
    remainingDays: banned && until > 0 ? Math.max(1, Math.ceil((until - now) / DAY_MS)) : 0,
    reason: normalizeText(account.banReason || DEFAULT_REASON, 240),
    code: normalizeText(account.banCode || (until > 0 ? 'ACCOUNT_TEMP_BANNED' : 'ACCOUNT_BANNED'), 64),
    bannedAt: toMs(account.bannedAt),
    bannedBy: normalizeText(account.bannedBy || '', 64),
    meta: normalizeMeta(account.banMeta),
  };
}

function formatUnlockTime(timestamp) {
  if (toMs(timestamp) <= 0) return '';
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(new Date(toMs(timestamp)));
  } catch (_error) {
    return new Date(toMs(timestamp)).toISOString();
  }
}

function formatBanMessage(state = {}) {
  if (!state.banned) return '';
  const seconds = Math.max(1, toSafeInt(state.remainingSeconds, Math.ceil((Number(state.remainingMs) || 0) / 1000) || 1));
  let duration = 'vĩnh viễn';
  if (!state.permanent) {
    if (seconds % 86400 === 0) duration = `${seconds / 86400} ngày`;
    else if (seconds % 3600 === 0) duration = `${seconds / 3600} giờ`;
    else if (seconds % 60 === 0) duration = `${seconds / 60} phút`;
    else duration = `${seconds} giây`;
  }
  let message = `Tài khoản đã bị khóa ${duration}. Lý do: ${normalizeText(state.reason || DEFAULT_REASON, 240)}.`;
  if (!state.permanent && state.until > 0) {
    message += ` Thời gian mở khóa: ${formatUnlockTime(state.until)} (GMT+7).`;
  }
  const meta = normalizeMeta(state.meta);
  if (meta.exploitCount > 0) message += ` Số lần vi phạm: ${meta.exploitCount.toLocaleString('vi-VN')}.`;
  if (meta.exploitBaozi > 0) message += ` Bánh bao nhận sai: ${meta.exploitBaozi.toLocaleString('vi-VN')}.`;
  message += ' Nếu cần khiếu nại, vui lòng liên hệ quản trị viên.';
  return message;
}

async function resolveAccountBanState(account, options = {}) {
  const now = Number(options.now) || Date.now();
  let state = inspectBanState(account, now);
  if (!state.expired || options.autoUnban === false || !account) return state;
  appendHistory(account, {
    action: 'auto_unban', at: now, by: 'system', reason: 'Hết thời hạn khóa',
    until: account.banUntil, code: account.banCode, meta: account.banMeta,
  });
  account.status = 1;
  account.banUntil = null;
  account.banReason = '';
  account.banCode = '';
  account.bannedAt = null;
  account.bannedBy = '';
  account.banMeta = {};
  if (typeof account.markModified === 'function') account.markModified('banMeta');
  await account.save();
  state = inspectBanState(account, now);
  return { ...state, autoUnbanned: true };
}

function buildBanView(account, stateInput = null, now = Date.now()) {
  const state = stateInput || inspectBanState(account, now);
  return {
    banned: state.banned === true,
    permanent: state.permanent === true,
    until: Number(state.until) || 0,
    untilIso: Number(state.until) > 0 ? new Date(Number(state.until)).toISOString() : '',
    unlockTime: Number(state.until) > 0 ? formatUnlockTime(state.until) : '',
    remainingDays: Math.max(0, toSafeInt(state.remainingDays, 0)),
    remainingSeconds: Math.max(0, toSafeInt(state.remainingSeconds, Math.ceil((Number(state.remainingMs) || 0) / 1000))),
    reason: normalizeText(state.reason || '', 240),
    code: normalizeText(state.code || '', 64),
    bannedAt: Math.max(0, Number(state.bannedAt) || 0),
    bannedBy: normalizeText(state.bannedBy || '', 64),
    meta: normalizeMeta(state.meta),
    message: state.banned ? formatBanMessage(state) : '',
    history: Array.isArray(account && account.banHistory)
      ? account.banHistory.slice(-20).reverse().map((row) => ({
        action: normalizeText(row && row.action, 32),
        at: toMs(row && row.at),
        by: normalizeText(row && row.by, 64),
        reason: normalizeText(row && row.reason, 240),
        until: toMs(row && row.until),
        code: normalizeText(row && row.code, 64),
        meta: normalizeMeta(row && row.meta),
      }))
      : [],
  };
}

function validateBanInput(input = {}, options = {}) {
  const reason = normalizeText(input.reason, 240);
  const code = normalizeText(input.code || DEFAULT_CODE, 64).toUpperCase();
  const permanent = input.permanent === true;
  const durationSeconds = Math.max(0, toSafeInt(input.durationSeconds, 0));
  const durationDays = Math.max(0, toSafeInt(input.durationDays, 0));
  const durationMinutes = Math.max(0, toSafeInt(input.durationMinutes, 0));
  if (reason.length < 5 && options.allowEmptyReason !== true) return { ok: false, error: 'BAN_REASON_REQUIRED' };
  if (!/^[A-Z0-9_:-]{3,64}$/.test(code)) return { ok: false, error: 'BAN_CODE_INVALID' };
  const totalSeconds = durationSeconds > 0 ? durationSeconds : ((durationDays * 86400) + (durationMinutes * 60));
  if (!permanent && totalSeconds <= 0) return { ok: false, error: 'BAN_DURATION_REQUIRED' };
  if (totalSeconds > 315360000) return { ok: false, error: 'BAN_DURATION_INVALID' };
  return { ok: true, reason, code, permanent, durationSeconds: totalSeconds, meta: normalizeMeta(input.meta), by: normalizeText(input.by || 'admin', 64) };
}

async function applyAccountBan(account, input = {}, options = {}) {
  if (!account) throw Object.assign(new Error('ACCOUNT_NOT_FOUND'), { code: 'ACCOUNT_NOT_FOUND' });
  const validation = validateBanInput(input);
  if (!validation.ok) throw Object.assign(new Error(validation.error), { code: validation.error });
  const now = Number(options.now) || Date.now();
  const durationMs = validation.permanent
    ? 0
    : (validation.durationSeconds * 1000);
  const until = durationMs > 0 ? now + durationMs : 0;
  const previous = inspectBanState(account, now);
  appendHistory(account, {
    action: previous.banned ? 'extend_ban' : 'ban', at: now, by: validation.by,
    reason: validation.reason, until, code: validation.code, meta: validation.meta,
  });
  account.status = 0;
  account.banUntil = until > 0 ? new Date(until) : null;
  account.banReason = validation.reason;
  account.banCode = validation.code;
  account.bannedAt = new Date(now);
  account.bannedBy = validation.by;
  account.banMeta = validation.meta;
  account.authVersion = Math.max(1, toSafeInt(account.authVersion, 1)) + 1;
  if (typeof account.markModified === 'function') account.markModified('banMeta');
  await account.save();
  return buildBanView(account, inspectBanState(account, now), now);
}

async function unbanAccount(account, input = {}, options = {}) {
  if (!account) throw Object.assign(new Error('ACCOUNT_NOT_FOUND'), { code: 'ACCOUNT_NOT_FOUND' });
  const now = Number(options.now) || Date.now();
  const previous = inspectBanState(account, now);
  const reason = normalizeText(input.reason || 'Quản trị viên mở khóa tài khoản', 240);
  const by = normalizeText(input.by || 'admin', 64);
  appendHistory(account, {
    action: 'unban', at: now, by, reason,
    until: previous.until, code: previous.code, meta: previous.meta,
  });
  account.status = 1;
  account.banUntil = null;
  account.banReason = '';
  account.banCode = '';
  account.bannedAt = null;
  account.bannedBy = '';
  account.banMeta = {};
  if (typeof account.markModified === 'function') account.markModified('banMeta');
  await account.save();
  return buildBanView(account, inspectBanState(account, now), now);
}

module.exports = {
  DAY_MS,
  normalizeMeta,
  inspectBanState,
  resolveAccountBanState,
  formatBanMessage,
  buildBanView,
  validateBanInput,
  applyAccountBan,
  unbanAccount,
};

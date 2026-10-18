const Account = require('../db/models/Account');
const Player = require('../db/models/Player');

const MAX_PLAYER_NAME_LENGTH = 24;
const BLOCKED_SPECIALS = new Set(Array.from('<>/\\`\"\''));

function normalizePlayerName(value) {
  return String(value || '')
    .normalize('NFC')
    .replace(/\s+/gu, ' ')
    .trim();
}

function getNameLength(value) {
  return Array.from(String(value || '')).length;
}

function validatePlayerName(value) {
  const name = normalizePlayerName(value);
  const length = getNameLength(name);
  if (length < 1) return { ok: false, code: 'NAME_EMPTY', name, length };
  if (length > MAX_PLAYER_NAME_LENGTH) {
    return { ok: false, code: 'NAME_TOO_LONG', name, length };
  }
  let hasLetterOrNumber = false;
  for (const char of Array.from(name)) {
    if (/^[\p{L}\p{M}\p{N}]$/u.test(char)) {
      hasLetterOrNumber = true;
      continue;
    }
    if (char === ' ') continue;
    if (/^[\p{P}\p{S}]$/u.test(char) && !BLOCKED_SPECIALS.has(char)) continue;
    return { ok: false, code: 'NAME_CHAR_INVALID', name, length };
  }
  if (!hasLetterOrNumber) return { ok: false, code: 'NAME_CONTENT_INVALID', name, length };
  return { ok: true, code: 'OK', name, length };
}

async function isNameTaken(name, excludeUserId = '') {
  const filter = { name };
  if (excludeUserId) filter.userId = { $ne: String(excludeUserId) };
  return !!(await Player.exists(filter));
}

async function syncAccountRoleName(userId, name) {
  const safeUserId = String(userId || '').trim();
  if (!safeUserId) return false;
  const result = await Account.updateOne(
    { 'roles.userId': safeUserId },
    { $set: { 'roles.$[target].name': name } },
    { arrayFilters: [{ 'target.userId': safeUserId }] }
  );
  return !!(result && result.matchedCount > 0);
}

module.exports = {
  MAX_PLAYER_NAME_LENGTH,
  normalizePlayerName,
  getNameLength,
  validatePlayerName,
  isNameTaken,
  syncAccountRoleName,
};

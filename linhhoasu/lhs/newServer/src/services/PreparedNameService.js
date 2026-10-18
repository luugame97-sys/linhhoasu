/**
 * PreparedNameService
 *
 * Loads the curated Vietnamese character-name list. Lines beginning with '#'
 * are section labels, not names. The service keeps player-facing names within
 * the same 24-character limit used by AccountService.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const logger = require('../logger');

const MAX_NAME_LENGTH = 24;
const DEFAULT_PATH = path.join(__dirname, '..', 'data', 'name.txt');

let cache = null;
let cachePath = '';

function normalizeName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function resolveNamePath() {
  const configured = String(process.env.PREPARED_NAME_PATH || '').trim();
  if (configured) return configured;
  return DEFAULT_PATH;
}

function loadNames() {
  const filePath = resolveNamePath();
  if (cache && cachePath === filePath) return cache;

  const stats = {
    path: filePath,
    rawLines: 0,
    names: 0,
    duplicates: 0,
    tooLong: 0,
  };
  const names = [];
  const seen = new Set();

  try {
    const lines = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
    stats.rawLines = lines.length;
    for (const line of lines) {
      const name = normalizeName(line);
      if (!name || name.startsWith('#')) continue;
      if (Array.from(name).length > MAX_NAME_LENGTH) {
        stats.tooLong += 1;
        continue;
      }
      const key = name.toLocaleLowerCase('vi-VN');
      if (seen.has(key)) {
        stats.duplicates += 1;
        continue;
      }
      seen.add(key);
      names.push(name);
    }
  } catch (err) {
    logger.warn(`[PreparedNames] load failed path=${filePath}: ${err.message}`);
  }

  stats.names = names.length;
  cachePath = filePath;
  cache = { names, stats };
  logger.info(
    `[PreparedNames] loaded names=${stats.names} duplicates=${stats.duplicates} `
    + `tooLong=${stats.tooLong} path=${filePath}`
  );
  return cache;
}

function getNames() {
  return loadNames().names.slice();
}

function getStats() {
  return { ...loadNames().stats };
}

function getNameByIndex(index = 0) {
  const names = loadNames().names;
  if (names.length <= 0) return '';
  const safeIndex = Math.abs(Number(index) || 0) % names.length;
  return names[safeIndex];
}

function seedIndex(seed, length) {
  if (length <= 0) return 0;
  const digest = crypto.createHash('sha256').update(String(seed || ''), 'utf8').digest();
  return digest.readUInt32BE(0) % length;
}

function getNameForSeed(seed, attempt = 0) {
  const names = loadNames().names;
  if (names.length <= 0) return '';
  // 97 is coprime with the current curated pool size, giving deterministic
  // non-repeating candidates across collision retries.
  const start = seedIndex(seed, names.length);
  const offset = Math.max(0, Math.floor(Number(attempt) || 0));
  return names[(start + (offset * 97)) % names.length];
}

function isDefaultGeneratedName(value, context = {}) {
  const name = normalizeName(value);
  if (!name) return true;
  const lower = name.toLocaleLowerCase('vi-VN');
  const accountId = normalizeName(context.accountId).toLocaleLowerCase('vi-VN');
  if (accountId && lower === accountId) return true;
  return /^(?:gc_+|wk_|player_|guest_|role_|u_wk_|r_wk_)/i.test(name);
}

function resolveNewPlayerName(requestedName, context = {}, attempt = 0) {
  if (!isDefaultGeneratedName(requestedName, context)) {
    return normalizeName(requestedName).slice(0, MAX_NAME_LENGTH);
  }
  const seed = context.seed
    || `${context.accountId || ''}:${context.serverId || ''}:${context.userId || ''}`;
  return getNameForSeed(seed, attempt);
}

function buildManagedBotName(requestedName, attempt = 0) {
  const source = normalizeName(requestedName) || 'Hành giả';
  const safeAttempt = Math.max(0, Number(attempt) || 0);
  if (safeAttempt <= 0) return source.slice(0, MAX_NAME_LENGTH);
  const suffix = `·${safeAttempt + 1}`;
  return `${source.slice(0, Math.max(1, MAX_NAME_LENGTH - suffix.length))}${suffix}`;
}

function reload() {
  cache = null;
  cachePath = '';
  return loadNames();
}

module.exports = {
  MAX_NAME_LENGTH,
  getNames,
  getStats,
  getNameByIndex,
  getNameForSeed,
  buildManagedBotName,
  isDefaultGeneratedName,
  resolveNewPlayerName,
  reload,
  _debug: {
    normalizeName,
    resolveNamePath,
  },
};

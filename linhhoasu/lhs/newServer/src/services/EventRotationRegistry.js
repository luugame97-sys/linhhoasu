'use strict';

const policy = require('../config/eventRotation.json');

function ensureObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : fallback;
}

function getFamilies() {
  return ensureArray(policy.families).map((family) => ({
    ...ensureObject(family),
    key: String(family.key || ''),
    ids: ensureArray(family.ids).map((id) => safeInt(id)).filter((id) => id > 0),
  })).filter((family) => family.key && family.ids.length > 0);
}

function getFamily(key) {
  const requested = String(key || '');
  return getFamilies().find((family) => family.key === requested) || null;
}

function isEnabled(family) {
  if (!family) return false;
  if (family.enabled === true) return true;
  if (family.enabled === false) return false;
  const envKey = String(family.enabledByEnv || '');
  return envKey ? String(process.env[envKey] || '') === '1' : false;
}

function isRepeating(key) {
  const family = typeof key === 'string' ? getFamily(key) : key;
  return !!family && family.repeatForever === true && isEnabled(family);
}

function snapshot() {
  return {
    version: String(policy.version || ''),
    timezone: String(policy.timezone || 'Asia/Ho_Chi_Minh'),
    preserveActiveCycles: policy.preserveActiveCycles !== false,
    families: getFamilies().map((family) => ({
      key: family.key,
      kind: family.kind || '',
      activityType: safeInt(family.activityType, 0),
      ids: family.ids.slice(),
      anchor: String(family.anchor || ''),
      periodDays: Math.max(0, safeInt(family.periodDays, 0)),
      enabled: isEnabled(family),
      repeatForever: family.repeatForever === true,
      persistent: family.persistent === true,
      paid: family.paid === true,
      requiresNativeQa: family.requiresNativeQa === true,
    })),
  };
}

module.exports = {
  getFamilies,
  getFamily,
  isEnabled,
  isRepeating,
  snapshot,
  policy,
};

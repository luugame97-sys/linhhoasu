/** Deterministic visual/player profile for managed real bots. */

const crypto = require('crypto');
const configService = require('./ConfigService');

function toSafeInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : fallback;
}

function ensureObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function getBotOrdinal(userId) {
  const value = String(userId || '');
  const managedIdMatch = value.match(/lhs_real_bot_(\d+)/i);
  if (managedIdMatch) return Math.max(0, toSafeInt(managedIdMatch[1], 1) - 1);
  const trailingMatch = value.match(/(\d+)$/);
  if (trailingMatch) return Math.max(0, toSafeInt(trailingMatch[1], 1) - 1);
  const digest = crypto.createHash('sha256').update(value, 'utf8').digest();
  return digest.readUInt32BE(0);
}

function getProfiles() {
  return Object.values(ensureObject(configService.get('RobotAppearanceConfig')))
    .filter((row) => row && typeof row === 'object' && toSafeInt(row.robotHead, 0) > 0)
    .sort((left, right) => toSafeInt(left.id, 0) - toSafeInt(right.id, 0));
}

function buildProfileFashionMap(profile = {}) {
  const fashionCfg = ensureObject(configService.get('FashionConfig'));
  const fashionMap = {};
  (Array.isArray(profile.robotShow) ? profile.robotShow : []).forEach((rawId) => {
    const id = Math.max(0, toSafeInt(rawId, 0));
    const row = ensureObject(fashionCfg[id] || fashionCfg[String(id)]);
    const type = Math.max(0, toSafeInt(row.type, 0));
    if (id > 0 && type > 0) fashionMap[String(type)] = id;
  });
  return fashionMap;
}

function applyManagedBotProfile(player = {}, userId = '') {
  if (!player || typeof player !== 'object') return { changed: false, profile: null };
  const profiles = getProfiles();
  if (profiles.length <= 0) return { changed: false, profile: null };
  const ordinal = getBotOrdinal(userId || player.userId);
  const profile = profiles[ordinal % profiles.length];
  const profileId = Math.max(1, toSafeInt(profile.id, 1));
  const avatar = Math.max(1, toSafeInt(profile.robotHead, 1));
  const kungfuId = Math.max(1, toSafeInt(profile.job, 4));
  const subJob = Math.max(0, toSafeInt(profile.subJob, 0));
  const fashionMap = buildProfileFashionMap(profile);
  let changed = false;

  player.roleInfo = ensureObject(player.roleInfo);
  const roleGenderCfg = ensureObject(configService.get('RoleGenderConfig'));
  const kungfuRows = ensureObject(roleGenderCfg[kungfuId] || roleGenderCfg[String(kungfuId)]);
  const genderRow = ensureObject(kungfuRows[subJob] || kungfuRows[String(subJob)] || kungfuRows[0] || kungfuRows['0']);
  const gender = Math.max(0, toSafeInt(genderRow.gender, 0));
  const roleUpdates = { kungfuId, subJob, gender, avatar };
  Object.keys(roleUpdates).forEach((key) => {
    if (toSafeInt(player.roleInfo[key], -1) !== roleUpdates[key]) {
      player.roleInfo[key] = roleUpdates[key];
      changed = true;
    }
  });
  if (toSafeInt(player.avatar, -1) !== avatar) {
    player.avatar = avatar;
    changed = true;
  }
  if (toSafeInt(player.botAppearanceProfileId, -1) !== profileId) {
    player.botAppearanceProfileId = profileId;
    changed = true;
  }

  player.fashionInfo = ensureObject(player.fashionInfo);
  const fashionInfo = player.fashionInfo;
  ['curFashion', 'fashion', 'fashionMap'].forEach((key) => {
    const current = ensureObject(fashionInfo[key]);
    const next = { ...current, ...fashionMap };
    if (JSON.stringify(current) !== JSON.stringify(next)) {
      fashionInfo[key] = next;
      changed = true;
    }
  });
  const owned = ensureObject(fashionInfo.fashions);
  const activated = new Set(Array.isArray(fashionInfo.activateFashion) ? fashionInfo.activateFashion.map(Number) : []);
  Object.values(fashionMap).forEach((id) => {
    if (toSafeInt(owned[id], 0) <= 0) {
      owned[String(id)] = 1;
      changed = true;
    }
    if (!activated.has(id)) {
      activated.add(id);
      changed = true;
    }
  });
  fashionInfo.fashions = owned;
  fashionInfo.activateFashion = Array.from(activated).filter((id) => id > 0).sort((a, b) => a - b);

  return {
    changed,
    profile: {
      id: profileId,
      ordinal,
      avatar,
      kungfuId,
      subJob,
      gender,
      fashionMap,
    },
  };
}

module.exports = {
  applyManagedBotProfile,
  buildProfileFashionMap,
  getBotOrdinal,
  getProfiles,
};

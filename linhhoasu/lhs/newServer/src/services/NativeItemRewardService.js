'use strict';

const config = require('./ConfigService');
const KINDS = Object.freeze({ elf: 'ElfConfig', curios: 'CuriosConfig', orb: 'OrbConfig', connect: 'ValhallaFormationConnectItemConfig' });

function getKind(id) {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  for (const [kind, table] of Object.entries(KINDS)) {
    if ((config.get(table) || {})[id]) return kind;
  }
  return null;
}

function grant(player, id, count) {
  const kind = getKind(id);
  if (!kind || !Number.isSafeInteger(count) || count <= 0) throw new Error('INVALID_NATIVE_REWARD');
  const cfg = (config.get(KINDS[kind]) || {})[id];
  const displayItems = [];
  const bagItems = [];
  if (kind === 'elf') {
    const elf = require('../handlers/elf');
    const info = elf.ensureElfInfo(player);
    const owned = info.elfData.some(row => row.id === id);
    const duplicateCount = count - (owned ? 0 : 1);
    // ElfConfig.piece is the full-body conversion also displayed by the native client.
    if (duplicateCount > 0 && (!cfg.piece || !Number.isSafeInteger(cfg.piece.count) || cfg.piece.count <= 0
      || !(config.get('AssetsConfig') || {})[cfg.piece.id])) throw new Error('ELF_DUPLICATE_CONFIG_MISSING');
    if (!owned) {
      elf.upsertElfData(info, elf.createDefaultElfData(id));
      displayItems.push({ id, count: 1 });
    }
    if (duplicateCount > 0) bagItems.push({ id: cfg.piece.id, count: cfg.piece.count * duplicateCount });
  } else if (kind === 'curios') {
    const curios = require('../handlers/curios');
    const info = curios.ensureCuriosInfo(player);
    const owned = info.curiosData.some(row => row.id === id);
    if (!owned) curios.upsertCuriosInfoRow(info, id);
    const duplicates = count - (owned ? 0 : 1);
    // No authoritative duplicate conversion exists in this catalog. Preserve
    // every surplus copy, never discard it or invent a currency/piece payout.
    if (duplicates > 0) {
      info.unconvertedRewardCopies = info.unconvertedRewardCopies && typeof info.unconvertedRewardCopies === 'object'
        ? info.unconvertedRewardCopies : {};
      info.unconvertedRewardCopies[id] = Math.max(0, Number(info.unconvertedRewardCopies[id]) || 0) + duplicates;
    }
    displayItems.push({ id, count });
  } else if (kind === 'orb') {
    const artifact = require('../handlers/artifact');
    const info = artifact.ensureArtifactInfo(player);
    const orb = artifact.upsertOrbData(info, id);
    orb.subCount = Math.max(0, Number(orb.subCount) || 0) + count;
    artifact.syncOrbDataFromMap(info);
    displayItems.push({ id, count });
  } else {
    const formation = require('../handlers/valhalla-formation');
    const info = formation.ensureValhallaFormationInfo(player);
    formation.upsertConnect(info, id, count);
    displayItems.push({ id, count });
  }
  for (const row of bagItems) {
    player.items = player.items || {};
    player.items[row.id] = Math.max(0, Number(player.items[row.id]) || 0) + row.count;
  }
  return { displayItems: [...displayItems, ...bagItems], bagItems };
}

function buildSyncPackets(player, rewardInfo = {}) {
  const roots = [rewardInfo, ...Object.values(rewardInfo.extraReward || {})].filter(Boolean);
  const ids = [...new Set(roots.flatMap(row => [...(row.items || []), ...(row.elves || [])]).map(row => Number(row.id)))];
  const packets = [];
  const elfIds = ids.filter(id => getKind(id) === 'elf');
  if (elfIds.length) {
    const elf = require('../handlers/elf');
    packets.push({ tag: 6001, msgUid: 0, data: { elfData: elf.ensureElfInfo(player).elfData.filter(row => elfIds.includes(row.id)) } });
  }
  const curiosIds = ids.filter(id => getKind(id) === 'curios');
  if (curiosIds.length) {
    const curios = require('../handlers/curios');
    // A full, documented init refresh also recalculates passive privileges.
    packets.push({ tag: 5200, msgUid: 0, data: curios.buildCuriosPayload(curios.ensureCuriosInfo(player)) });
  }
  const orbIds = ids.filter(id => getKind(id) === 'orb');
  if (orbIds.length) {
    const artifact = require('../handlers/artifact');
    const info = artifact.ensureArtifactInfo(player);
    artifact.syncOrbDataFromMap(info);
    for (const id of orbIds) packets.push({ tag: 6401, msgUid: 0, data: { data: info.orbInfo.orbDataMap[id] } });
  }
  const connectIds = ids.filter(id => getKind(id) === 'connect');
  if (connectIds.length) {
    const formation = require('../handlers/valhalla-formation');
    packets.push({ tag: 6801, msgUid: 0, data: { connects: formation.buildConnectUpdateRows(formation.ensureValhallaFormationInfo(player), connectIds) } });
  }
  return packets;
}

module.exports = { getKind, grant, buildSyncPackets };

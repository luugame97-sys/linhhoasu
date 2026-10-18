'use strict';

const config = require('./ConfigService');
const chatBus = require('./ChatBus');

// TaskConfig.isGlobal is a client guide flag, not a public-broadcast flag.
// Only the persistent achievement-like task groups are eligible here; routine
// main/daily/progression tasks must never flood the system channel.
const PUBLIC_ACHIEVEMENT_TYPES = new Set([9, 14, 18]);
const SENSITIVE_TAGS = new Set([1750, 10000]);

function clean(value, max = 64) {
  return String(value == null ? '' : value)
    .replace(/[<>\u0000-\u001f\u007f\r\n]/g, '')
    .trim().slice(0, max);
}

function serverLabel(value) {
  const raw = clean(value, 24);
  if (/^S\d+$/i.test(raw)) return raw.toUpperCase();
  const id = Number(value);
  if (Number.isSafeInteger(id) && id >= 1000 && id < 2000) return `S${id - 1000}`;
  return raw && !/^S-\d+$/i.test(raw) ? raw : '';
}

function playerLabel(player = {}) {
  const name = clean(player.name || 'Người chơi', 32) || 'Người chơi';
  const server = serverLabel(
    player.serverName
      || (player.serverId != null ? `S${Number(player.serverId) - 1000}` : '')
      || process.env.SERVER_NAME
      || `S${process.env.SERVER_ID || ''}`,
  );
  return server ? `${name} (${server})` : name;
}

function isSensitivePlayer(player = {}) {
  const values = [
    player.isAdmin, player.isGM, player.gm, player.admin,
    player.role, player.accountRole, player.userType,
  ];
  return values.some((value) => value === true || /^(admin|administrator|gm|superadmin)$/i.test(String(value || '').trim()));
}

async function emit(eventKey, content) {
  const text = clean(content, 220);
  if (!text || !eventKey) return { skipped: 'invalid' };
  if (!(await chatBus.claim(eventKey))) return { skipped: 'duplicate' };
  const chat = require('../handlers/chat');
  const entry = await chat.pushSystemBroadcast(text, { source: 'public-achievement', msgType: 14 });
  return entry ? { sent: true } : { skipped: 'bus' };
}

async function announceTaskClaims(player, taskIds = []) {
  const table = config.get('TaskConfig') || {};
  const results = [];
  for (const id of taskIds) {
    const row = table[id] || table[String(id)];
    if (!isPublicTask(row)) continue;
    results.push(await emit(`achievement:task:${player.playerId || player.userId}:${id}`, `${playerLabel(player)} hoàn thành thành tựu #${Number(id)}.`));
  }
  return results;
}

function isPublicTask(row = {}) {
  if (!row || typeof row !== 'object') return false;
  const type = Number(row.type) || 0;
  if (!PUBLIC_ACHIEVEMENT_TYPES.has(type) || Number(row.updateCycle || 0) !== 0) return false;
  return Number(row.publicNotice ?? row.announce ?? row.isGlobal) === 1;
}

async function announceFirstClear(player, chapterId) {
  const id = Number(chapterId) || 0;
  if (id <= 0) return { skipped: 'invalid' };
  const server = Number(player.serverId || process.env.SERVER_ID) || 0;
  // One public first-clear announcement per chapter and server. A repeated
  // claim by another player is still a valid personal reward, but is not a
  // new public milestone.
  return emit(`first-clear:chapter:${server}:${id}`, `${playerLabel(player)} đã vượt ải lần đầu: chương ${id}.`);
}

async function announceRank(payload = {}) {
  const rank = Number(payload.rank) || 0;
  if (rank < 1 || rank > 3) return { skipped: 'rank-range' };
  const event = clean(payload.event || 'xếp hạng', 48);
  const score = Number.isFinite(Number(payload.score)) ? ` với ${Number(payload.score)} điểm` : '';
  return emit(`rank:${payload.eventKey || event}:${payload.playerId || payload.userId}:${rank}`, `${playerLabel(payload)} đạt hạng ${rank} ${event}${score}.`);
}

function collectRewardRows(result) {
  const packets = Array.isArray(result) ? result : [result];
  const rows = [];
  for (const packet of packets) {
    const data = packet && packet.data ? packet.data : packet;
    const info = data && data.rewardInfo;
    if (!info || typeof info !== 'object') continue;
    for (const key of ['items', 'gems', 'pets', 'petSouls', 'artifacts', 'valhalla', 'bloodline', 'fashion', 'formations', 'spirits']) {
      for (const row of Array.isArray(info[key]) ? info[key] : []) rows.push({ id: Number(row && row.id), count: Number(row && row.count) || 1, key });
    }
  }
  return rows.filter(row => Number.isSafeInteger(row.id) && row.id > 0);
}

function isRare(row) {
  const assets = config.get('AssetsConfig') || {};
  const asset = assets[row.id] || assets[String(row.id)] || {};
  if (asset.ifShow === 0 || asset.publicNotice === 0 || asset.isPublic === 0) return false;
  const gem = (config.get('GemLevelConfig') || {})[row.id] || (config.get('GemLevelConfig') || {})[String(row.id)] || {};
  return Number(asset.quality) >= 8 || Number(gem.level) >= 10 || ['pets', 'petSouls', 'artifacts', 'valhalla', 'bloodline', 'fashion', 'formations', 'spirits'].includes(row.key) && Number(asset.quality) >= 6;
}

async function observeResult(player, result, tag, msgUid, context = {}) {
  if (context.isBot || isSensitivePlayer(player) || SENSITIVE_TAGS.has(Number(tag))) return [];
  const packets = Array.isArray(result) ? result : [result];
  for (const packet of packets) {
    const data = packet && packet.data ? packet.data : packet;
    if (!data || Number(data.result) !== 0) continue;
    if (Number(tag) === 1000 && Array.isArray(data.ids)) {
      await announceTaskClaims(player, data.ids);
    }
    if (Number(tag) === 2303 && Number(data.chapterId) > 0) {
      await announceFirstClear(player, data.chapterId);
    }
  }
  const rows = collectRewardRows(result).filter(isRare).slice(0, 3);
  const out = [];
  for (const row of rows) {
    out.push(await emit(`rare:${player.playerId || player.userId}:${tag}:${msgUid}:${row.id}:${row.count}`, `${playerLabel(player)} nhận vật phẩm hiếm #${row.id} x${row.count}.`));
  }
  return out;
}

module.exports = { announceTaskClaims, announceFirstClear, announceRank, observeResult, isPublicTask, isRare };

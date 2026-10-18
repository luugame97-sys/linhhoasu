'use strict';
const config = require('./ConfigService');
// Explicit item -> EmojiGroupConfig mapping, validated against the group and
// all ten EmojiConfig rows. These are permanent unlocks, not random drops.
const PACKS = Object.freeze({
  94702: { group: 5, key: 'gongzi' }, 94704: { group: 6, key: 'snake' },
  94707: { group: 7, key: 'fahai' }, 94712: { group: 8, key: 'bajie' },
  94716: { group: 9, key: 'xuediao' }, 94720: { group: 10, key: 'xiaoma' },
  94722: { group: 11, key: 'laolao' }, 94727: { group: 12, key: 'jiuyouque' },
});
function plan(player, id, count) {
  const pack = PACKS[id];
  if (!pack) return null;
  const asset = (config.get('AssetsConfig') || {})[id];
  const group = (config.get('EmojiGroupConfig') || {})[pack.group];
  const rows = Object.values(config.get('EmojiConfig') || {}).filter(row => row.group === pack.group);
  if (asset?.icon !== `icon_emoji_${pack.key}` || group?.icon !== `emoji_tab_${pack.key}` || rows.length !== 10) {
    return { ok: false, code: 'EMOJI_PACK_CONFIG_MISSING' };
  }
  if (count !== 1) return { ok: false, code: 'EMOJI_PACK_SINGLE_USE_ONLY' };
  const info = player.fashionInfo || {};
  const ids = new Set(Array.isArray(info.emoji?.['2']) ? info.emoji['2'] : []);
  // The baseline normalizer treats legacy array entries as permanently owned groups.
  if (Array.isArray(info.emoji) && info.emoji.includes(pack.group)) rows.forEach(row => ids.add(row.id));
  const missingIds = rows.map(row => row.id).filter(value => !ids.has(value)).sort((a, b) => a - b);
  if (!missingIds.length) return { ok: false, code: 'EMOJI_PACK_ALREADY_OWNED' };
  return { ok: true, group: pack.group, missingIds };
}
function grant(player, value) {
  if (!value?.ok) throw new Error('INVALID_EMOJI_PACK_PLAN');
  const info = require('../handlers/fashion').ensureFashionInfo(player);
  info.emoji['2'] = [...new Set([...(info.emoji['2'] || []), ...value.missingIds])].sort((a, b) => a - b);
  if (!info.emojiGroups.includes(value.group)) info.emojiGroups.push(value.group);
  return value.missingIds.map(id => ({ tag: 1802, msgUid: 0, data: { type: 2, id } }));
}
module.exports = { plan, grant };

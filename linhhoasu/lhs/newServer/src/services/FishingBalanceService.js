/** Owner-authorized custom balance. Values/odds live in one versioned JSON file. */
'use strict';
const crypto = require('crypto');
const config = require('./ConfigService');
const rules = require('../config/fishingBalance.json');
const clone = value => JSON.parse(JSON.stringify(value));
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
const sum = (info, type) => (info.rodAttrs || []).reduce((n, row) => n + (row.type === type && integer(row.value) ? row.value : 0), 0);

function pick(rows, draw = total => crypto.randomInt(total)) {
  const total = rows.reduce((n, row) => n + row.weight, 0);
  if (!integer(total, 1, 1e8)) throw new Error('FISH_BALANCE_INVALID_WEIGHT');
  let roll = draw(total);
  if (!integer(roll, 0, total - 1)) throw new Error('FISH_BALANCE_INVALID_RANDOM');
  for (const row of rows) { if (roll < row.weight) return row; roll -= row.weight; }
  throw new Error('FISH_BALANCE_PICK_FAILED');
}

function validate() {
  const fail = () => { throw new Error('FISH_BALANCE_CONFIG_INVALID'); };
  if (!rules.version || !integer(rules.receiptLimit, 1, 128) || !integer(rules.wash.historyLimit, 1, 30)) fail();
  const cost = rules.wash.cost, actual = config.get('FishBaseConfig')?.washCost;
  if (!actual || actual.id !== cost.id || actual.count !== cost.count) fail();
  if (!integer(rules.boxes.maxPerRequest, 1, 100) || rules.boxes.drawsPerBox !== 1) fail();
  if (!rules.wash.uniqueTypes || !rules.wash.excludeOppositeSpecies || rules.boxes.pity !== false
      || !integer(rules.wash.energySaveCapBps, 0, 5000) || !integer(rules.wash.baitSaveCapBps, 0, 5000)
      || !integer(rules.wash.minSpeciesWeight, 1, 10000)
      || !integer(rules.wash.maxSpeciesWeight, 10000, 50000)) fail();
  const qualities = rules.wash.qualityRolls, attrs = rules.wash.attributes;
  if (qualities.reduce((n, row) => n + row.weight, 0) !== 10000 || attrs.length < 6) fail();
  if (new Set(attrs.map(row => row.type)).size !== attrs.length) fail();
  for (const row of qualities) {
    if (![2, 3, 4, 6, 7].includes(row.quality) || !integer(row.weight, 1, 10000)) fail();
    for (const key of ['small', 'species']) if (!Array.isArray(row[key]) || row[key].length !== 2
      || !integer(row[key][0], 1, 5000) || !integer(row[key][1], row[key][0], 5000)) fail();
  }
  for (const row of attrs) {
    if (!config.get('FishWashAttrDescConfig')?.[row.type]?.isWash || !integer(row.weight, 1, 10000)) fail();
    if (!['small', 'species'].includes(row.range)) fail();
    if (![9, 101, 104].includes(row.type) && !(row.type >= 201 && row.type <= 210) && !(row.type >= 301 && row.type <= 310)) fail();
    if (row.type >= 201 && (row.range !== 'species' || row.species !== row.type % 100)) fail();
    if (row.type < 201 && row.range !== 'small') fail();
  }
  for (const [id, rows] of Object.entries(rules.boxes.pools)) {
    const shown = config.get('FishSoulPrivilegeConfig')?.[id]?.privRewardShow;
    if (!shown || rows.length !== shown.length || new Set(rows.map(r => r.id)).size !== rows.length
        || rows.reduce((n, r) => n + r.weight, 0) !== 10000) fail();
    for (const row of rows) if (!integer(row.weight, 1, 10000) || !integer(row.count, 1, 100000)
        || !config.get('AssetsConfig')?.[row.id] || !shown.some(r => r.id === row.id && r.count === row.count)) fail();
  }
  return rules;
}

function rollWash(level, draw) {
  validate();
  const counts = config.get('FishLevelConfig')?.[level]?.washCount;
  if (!Array.isArray(counts) || !counts.length || counts.some(r => !integer(r.count, 1, 6) || !integer(r.weight, 1, 10000))) {
    throw new Error('FISH_WASH_LEVEL_INVALID');
  }
  const count = pick(counts, draw).count, output = [];
  let pool = rules.wash.attributes.slice();
  for (let i = 0; i < count; i++) {
    const row = pick(pool, draw), quality = pick(rules.wash.qualityRolls, draw), range = quality[row.range];
    const value = range[0] + (draw ? draw(range[1] - range[0] + 1) : crypto.randomInt(range[1] - range[0] + 1));
    output.push({ type: row.type, value, level: quality.quality });
    pool = pool.filter(other => other.type !== row.type && (!row.species || other.species !== row.species));
  }
  return output;
}

function rollBoxes(itemId, count, draw) {
  validate();
  const pool = rules.boxes.pools[itemId];
  if (!pool || !integer(count, 1, rules.boxes.maxPerRequest)) throw new Error('FISH_BOX_INVALID');
  const map = new Map();
  for (let i = 0; i < count; i++) { const r = pick(pool, draw); map.set(r.id, (map.get(r.id) || 0) + r.count); }
  return [...map].map(([id, amount]) => ({ id, count: amount }));
}

function skipCost(info, kind, draw = total => crypto.randomInt(total), player = null) {
  const type = kind === 'energy' ? 9 : 104;
  const cap = kind === 'energy' ? rules.wash.energySaveCapBps : rules.wash.baitSaveCapBps;
  const raftBonus = kind === 'bait' ? require('./FishingGearService').raftMastery(info, player) : 0;
  const chance = Math.min(cap, sum(info, type) + raftBonus);
  return chance > 0 && draw(10000) < chance;
}

function speciesWeight(info, type) {
  return Math.min(rules.wash.maxSpeciesWeight, Math.max(rules.wash.minSpeciesWeight,
    10000 + sum(info, 200 + type) - sum(info, 300 + type)));
}

function request(info, params, operation, fingerprint) {
  const revision = Number(info.balanceRevision || 0);
  const key = params?.requestId;
  if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(key)
      || !integer(params?.expectedRevision)) return { error: 'FISH_CLIENT_UPDATE_REQUIRED', revision };
  const receipt = (info.balanceReceipts || []).find(r => r.key === key);
  if (receipt) return receipt.operation === operation && receipt.fingerprint === fingerprint
    ? { receipt, revision } : { error: 'FISH_REQUEST_CONFLICT', revision };
  if (params.expectedRevision !== revision) return { error: 'FISH_BALANCE_STALE', revision };
  return { key, revision, operation, fingerprint };
}

function record(info, req, data) {
  info.balanceRevision = req.revision + 1;
  const response = { ...data, balanceRevision: info.balanceRevision, balanceVersion: rules.version };
  info.balanceReceipts = [...(info.balanceReceipts || []), { key: req.key, operation: req.operation,
    fingerprint: req.fingerprint, time: Date.now(), response: clone(response) }].slice(-rules.receiptLimit);
  return response;
}

function archiveWash(info, reason) {
  info.rodWashHistory = [...(info.rodWashHistory || []), { reason, time: Date.now(),
    attrs: clone(info.rodAttrs || []), pending: clone(info.rodTempAttrs || []) }].slice(-rules.wash.historyLimit);
}

function syncCounts(player, ids) {
  const currencies = { 1: 'diamond', 2: 'silver', 6: 'gold' };
  return { tag: 1202, msgUid: 0, data: { result: 0, items: [], changed: [...new Set(ids)].map(id => ({
    id, count: Number(currencies[id] ? player.currencies?.[currencies[id]] || 0 : player.items?.[id] || 0),
  })) } };
}

module.exports = { rules, validate, pick, rollWash, rollBoxes, skipCost, speciesWeight, request, record, archiveWash, syncCounts };

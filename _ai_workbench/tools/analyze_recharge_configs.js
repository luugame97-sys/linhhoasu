/*
 * Read-only comparison of the exact server/client config binaries used by
 * production.  It intentionally writes no source/config and emits a compact
 * JSON report suitable for a later audit.  Usage:
 *   node analyze_recharge_configs.js <server-bin> <client-bin> <output-json>
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const [serverBin, clientBin, outputJson] = process.argv.slice(2);
if (!serverBin || !clientBin || !outputJson) {
  console.error('usage: node analyze_recharge_configs.js <server-bin> <client-bin> <output-json>');
  process.exit(2);
}

const ConfigService = require(path.resolve(__dirname, '../../linhhoasu/lhs/newServer/src/services/ConfigService'));

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((out, key) => {
      out[key] = stable(value[key]);
      return out;
    }, {});
  }
  return value;
}

function jsonHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function load(file) {
  const tables = ConfigService.reload(path.resolve(file));
  return { tables, meta: { path: path.resolve(file), size: fs.statSync(file).size, sha256: sha256File(file), tableCount: Object.keys(tables).length } };
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function obj(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function rows(table) { return Object.values(obj(table)).filter((x) => x && typeof x === 'object' && !Array.isArray(x)); }
function row(table, id) { return obj(table)[id] || obj(table)[String(id)] || null; }
function arr(value) { return Array.isArray(value) ? value : []; }
function payIdOf(shop) { return num(shop && (shop.payId ?? shop.payid ?? shop.rechargeId), 0); }
function rewardCount(value) { return arr(value).filter((x) => num(x && x.id, 0) > 0 && num(x && x.count, 0) > 0).length; }

function extractA9(tables) {
  const typeRows = rows(tables.Activity9TypeConfig);
  const ids = [];
  for (const r of typeRows) {
    const id = num(r.id, 0);
    const payId = num(r.payId ?? r.payid ?? r.rechargeId ?? r.productId, 0);
    if (payId > 0) ids.push({ activityTypeId: id, payId, name: num(r.name, 0), activityId: num(r.activityId ?? r.activity, 0) });
  }
  return ids;
}

function summarizeConfig(bundle) {
  const t = bundle.tables;
  const pay = obj(t.PayConfig);
  const shop = obj(t.ShopConfig);
  const privilege = obj(t.PrivilegeConfig);
  const a9 = extractA9(t);
  const a9PayIds = new Set(a9.map((x) => x.payId));
  const privilegeIds = new Set(Object.keys(privilege).map((x) => num(x, 0)).filter((x) => x > 0));
  const shopRows = rows(shop);
  const linked = new Map();
  for (const s of shopRows) {
    const p = payIdOf(s);
    if (p > 0) {
      if (!linked.has(p)) linked.set(p, []);
      linked.get(p).push(s);
    }
  }

  const packages = Object.keys(pay).map((key) => {
    const id = num(key, 0);
    const p = pay[key] || {};
    const links = linked.get(id) || [];
    const direct = row(shop, id);
    // Mirrors RechargeBenefitService.resolveRechargeProduct: a privilege row
    // linked by payId wins, then direct ShopConfig row, then first linked row.
    const linkedPrivilege = links.find((s) => privilegeIds.has(num(s.id, 0)));
    const selected = linkedPrivilege || direct || links[0] || null;
    const baseRewards = arr(selected && selected.rewards).length > 0 ? arr(selected.rewards) : arr(p.rewards);
    const extra = arr(selected && selected.extraRewards);
    const first = arr(selected && selected.firstRewards);
    const subsequent = arr(selected && selected.subsequentRewards);
    const hasAnyReward = baseRewards.length + extra.length + first.length + subsequent.length > 0;
    const selectedId = num(selected && selected.id, 0);
    return {
      payId: id,
      nameId: num(p.name, 0),
      priceR: num(p.priceR, 0),
      priceD: num(p.priceD, 0),
      priceNT: num(p.priceNT, 0),
      linkedShopCount: links.length,
      linkedShopIds: links.map((s) => num(s.id, 0)).filter((x) => x > 0),
      selectedShopId: selectedId,
      selectedShopType: num(selected && selected.type, 0),
      selectedShopLimit: num(selected && selected.limit, 0),
      selectedShopLimitType: num(selected && selected.limitType, 0),
      selectedShopIsDouble: num(selected && selected.isDouble, 0),
      selectedShopDuration: num(selected && selected.duration, 0),
      isPrivilege: selectedId > 0 && privilegeIds.has(selectedId),
      isActivity9: a9PayIds.has(id),
      rewards: baseRewards,
      extraRewards: extra,
      firstRewards: first,
      subsequentRewards: subsequent,
      rewardCounts: {
        base: rewardCount(baseRewards),
        extra: rewardCount(extra),
        first: rewardCount(first),
        subsequent: rewardCount(subsequent),
      },
      hasAnyReward,
      serverHandlerOutcome: a9PayIds.has(id) ? 'activity9_activation_only' : (selectedId > 0 && privilegeIds.has(selectedId) ? 'record_plus_month_card' : (baseRewards.length > 0 ? 'base_rewards_only' : 'fallback_diamond_60')),
    };
  }).filter((x) => x.payId > 0);

  const shopPayIds = new Set([...linked.keys()]);
  const allTables = Object.keys(t).sort();
  const tableHashes = Object.fromEntries(allTables.map((name) => [name, jsonHash(t[name])]));
  const suspicious = packages.filter((p) =>
    p.rewardCounts.extra > 0 || p.rewardCounts.first > 0 || p.rewardCounts.subsequent > 0 ||
    (!p.isActivity9 && !p.isPrivilege && !p.hasAnyReward) ||
    p.linkedShopCount > 1 || p.selectedShopLimit > 0 || p.selectedShopIsDouble > 0
  );
  return {
    meta: bundle.meta,
    tableHashes,
    counts: {
      payConfig: packages.length,
      shopConfig: shopRows.length,
      shopRowsWithPayId: shopRows.filter((s) => payIdOf(s) > 0).length,
      linkedPayIds: shopPayIds.size,
      payWithoutLinkedShop: packages.filter((p) => p.linkedShopCount === 0).length,
      activity9PayIds: a9PayIds.size,
      privilegeConfigIds: privilegeIds.size,
    },
    activity9Types: a9,
    packages,
    suspicious,
  };
}

const server = load(serverBin);
const serverSummary = summarizeConfig(server);
const client = load(clientBin);
const clientSummary = summarizeConfig(client);
const tableNames = Array.from(new Set([...Object.keys(serverSummary.tableHashes), ...Object.keys(clientSummary.tableHashes)])).sort();
const tableDiffs = tableNames.filter((name) => serverSummary.tableHashes[name] !== clientSummary.tableHashes[name]);
const serverById = new Map(serverSummary.packages.map((x) => [x.payId, x]));
const clientById = new Map(clientSummary.packages.map((x) => [x.payId, x]));
const packageDiffs = [];
for (const id of new Set([...serverById.keys(), ...clientById.keys()])) {
  const s = serverById.get(id) || null;
  const c = clientById.get(id) || null;
  if (JSON.stringify(stable(s)) !== JSON.stringify(stable(c))) packageDiffs.push({ payId: id, server: s, client: c });
}

const result = {
  generatedAt: new Date().toISOString(),
  server: serverSummary,
  client: clientSummary,
  comparison: {
    tableDiffCount: tableDiffs.length,
    tableDiffs,
    packageDiffCount: packageDiffs.length,
    packageDiffs,
  },
};
fs.mkdirSync(path.dirname(path.resolve(outputJson)), { recursive: true });
fs.writeFileSync(path.resolve(outputJson), JSON.stringify(result, null, 2), 'utf8');
console.log(JSON.stringify({
  output: path.resolve(outputJson),
  server: serverSummary.counts,
  client: clientSummary.counts,
  tableDiffCount: tableDiffs.length,
  packageDiffCount: packageDiffs.length,
  suspiciousServer: serverSummary.suspicious.length,
  suspiciousClient: clientSummary.suspicious.length,
}, null, 2));

'use strict';

// Read-only audit: locate every game config row that grants Baozi item ID 4
// and report its configured in-game cost/reward ratio.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
process.env.CONFIG_BIN_PATH = path.join(
  root,
  'linhhoasu',
  'webgame',
  'game',
  'update',
  'resource',
  'assets',
  'excel',
  'config_e5ac72c2.bin'
);

const Config = require(path.join(root, 'linhhoasu', 'lhs', 'newServer', 'src', 'services', 'ConfigService'));
const tables = Config.loadAllTables();
const BAOZI_ID = 4;
const DIAMOND_ID = 1;

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function rows(value, prefix = '') {
  if (Array.isArray(value)) return value.map((row, index) => ({ key: prefix || String(index), row }));
  if (!isObject(value)) return [];
  const out = [];
  for (const [key, row] of Object.entries(value)) {
    if (isObject(row) && ('id' in row || 'shopId' in row || 'itemId' in row || 'rewards' in row || 'cost' in row)) {
      out.push({ key: prefix ? `${prefix}.${key}` : key, row });
    } else if (isObject(row)) {
      out.push(...rows(row, prefix ? `${prefix}.${key}` : key));
    }
  }
  return out;
}

function entries(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row) => isObject(row))
    .map((row) => ({
      id: Number(row.id ?? row.itemId ?? row.item_id ?? 0),
      count: Number(row.count ?? row.amount ?? row.num ?? 0),
      give: Number(row.give ?? 0),
    }));
}

function baoziCount(row) {
  return ['rewards', 'reward', 'items', 'goods']
    .flatMap((field) => entries(row[field]))
    .filter((item) => item.id === BAOZI_ID)
    .reduce((sum, item) => sum + Math.max(0, item.count), 0);
}

function configuredCosts(row) {
  const candidates = [];
  for (const field of ['cost', 'costAgain', 'price', 'consume', 'need']) {
    const list = entries(row[field]);
    if (list.length) candidates.push({ field, items: list });
  }
  return candidates;
}

const findings = [];
for (const [tableName, table] of Object.entries(tables)) {
  if (!/Shop|Item|Goods|Activity/i.test(tableName)) continue;
  for (const { key, row } of rows(table)) {
    const count = baoziCount(row);
    if (count <= 0) continue;
    const costs = configuredCosts(row);
    const diamondCosts = costs.flatMap((group) => group.items.map((item) => ({ ...item, field: group.field }))).filter((item) => item.id === DIAMOND_ID && item.count > 0);
    findings.push({
      table: tableName,
      key,
      id: Number(row.id ?? row.shopId ?? 0),
      type: Number(row.type ?? 0),
      payId: Number(row.payId ?? 0),
      baoziCount: count,
      costs,
      diamondCosts,
      diamondPerBaozi: diamondCosts.map((item) => ({ field: item.field, value: item.count / count })),
      limit: Number(row.limit ?? 0),
      limitType: Number(row.limitType ?? 0),
    });
  }
}

const shopRows = findings.filter((row) => row.table === 'ShopConfig');
const pricedByDiamond = findings.filter((row) => row.diamondCosts.length > 0);
const output = {
  readOnly: true,
  configPath: process.env.CONFIG_BIN_PATH,
  tableCount: Object.keys(tables).length,
  item: { id: BAOZI_ID, name: 'Bánh bao/Baozi' },
  currency: { id: DIAMOND_ID, name: 'Nguyên bảo' },
  summary: {
    allRowsGrantingBaozi: findings.length,
    shopConfigRowsGrantingBaozi: shopRows.length,
    rowsWithDirectDiamondCost: pricedByDiamond.length,
  },
  shopConfigRows: shopRows,
  directDiamondPriceRows: pricedByDiamond,
  allFindings: findings,
};

const outPath = path.join(root, '_ai_workbench', 'temp', 'baozi_ingame_price_audit_20260901.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
console.log(`OUT=${outPath}`);

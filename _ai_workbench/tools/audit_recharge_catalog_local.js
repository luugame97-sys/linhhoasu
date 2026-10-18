#!/usr/bin/env node
/*
 * Read-only decoder/comparator for Linh Họa Sư payment-related config.
 * It reads two config_e5ac72c2.bin files (server and served client), compares
 * semantic table rows, and emits a bounded-but-complete JSON audit artifact.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { BinJsonUtil, ByteArray } = require('../../linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');

function parseBin(file) {
  const buffer = fs.readFileSync(file);
  const ba = new ByteArray(buffer);
  const tables = {};
  const errors = [];
  while (ba.position < ba.length) {
    const at = ba.position;
    try {
      const nameLen = ba.readByte();
      const name = ba.readUTFBytes(nameLen);
      const dataLen = ba.readUnsignedInt();
      if (dataLen < 0 || ba.position + dataLen > ba.length) throw new Error(`invalid dataLen=${dataLen}`);
      const raw = buffer.slice(ba.position, ba.position + dataLen);
      ba.position += dataLen;
      try {
        const dec = zlib.inflateSync(raw);
        // Match the project's ConfigService decoder exactly.
        tables[name] = BinJsonUtil.readFullJson(new ByteArray(dec.buffer));
      } catch (error) {
        errors.push({ table: name, offset: at, phase: 'inflate/decode', error: String(error.message || error) });
      }
    } catch (error) {
      errors.push({ offset: at, phase: 'header', error: String(error.message || error) });
      break;
    }
  }
  return { tables, errors, bytes: buffer.length, sha256: sha256(buffer) };
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function semanticHash(value) {
  return sha256(Buffer.from(JSON.stringify(stable(value))));
}

function asRows(table) {
  if (!table || typeof table !== 'object') return [];
  if (Array.isArray(table)) return table.map((value, index) => ({ key: String(index), value }));
  return Object.keys(table).sort((a, b) => {
    const na = Number(a); const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.localeCompare(b);
  }).map((key) => ({ key, value: table[key] }));
}

function walk(value, visit, pathParts = []) {
  visit(value, pathParts);
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) value.forEach((child, index) => walk(child, visit, pathParts.concat(String(index))));
  else Object.keys(value).forEach((key) => walk(value[key], visit, pathParts.concat(key)));
}

function relevantTable(name) {
  return /^(PayConfig|ShopConfig|RechargeConfig|PrivilegeConfig|Activity(?:Config|\d+.*Config)|OldTrekPassShowConfig|HorseRaceBaseConfig|ShopGiftConfig|ActivityShopConfig|SystemConfig)$/i.test(name)
    || /(pay|recharge|charge|privilege|month|card|gift|package|shop)/i.test(name);
}

function rowHasPaymentKey(value) {
  let found = false;
  walk(value, (node) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    if (Object.keys(node).some((key) => /^(payid?|advancedPayid|rechargeId|rechargeID|productId|priceR|priceD|priceNT|diamondGain|monthCard|duration|validDay|days|firstBonus)$/i.test(key))) found = true;
  });
  return found;
}

function collectPaymentRows(tables) {
  const result = [];
  for (const [table, value] of Object.entries(tables)) {
    for (const row of asRows(value)) {
      if (!rowHasPaymentKey(row.value)) continue;
      result.push({ table, key: row.key, value: row.value });
    }
  }
  return result;
}

function idValue(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && String(Math.trunc(n)) === String(value).trim() ? Math.trunc(n) : String(value);
}

function extractRowsByKeys(tables, pattern) {
  const result = [];
  for (const [table, value] of Object.entries(tables)) {
    for (const row of asRows(value)) {
      const hits = [];
      walk(row.value, (node, p) => {
        if (!node || typeof node !== 'object' || Array.isArray(node)) return;
        for (const [key, child] of Object.entries(node)) {
          if (pattern.test(key)) hits.push({ path: p.concat(key).join('.'), value: child });
        }
      });
      if (hits.length) result.push({ table, key: row.key, value: row.value, hits });
    }
  }
  return result;
}

function compareTables(serverTables, clientTables) {
  const names = [...new Set([...Object.keys(serverTables), ...Object.keys(clientTables)])].sort();
  const differences = [];
  for (const name of names) {
    const a = serverTables[name]; const b = clientTables[name];
    if (semanticHash(a) === semanticHash(b)) continue;
    if (!relevantTable(name)) continue;
    differences.push({
      table: name,
      serverHash: semanticHash(a),
      clientHash: semanticHash(b),
      serverRows: asRows(a).length,
      clientRows: asRows(b).length,
      serverOnlyKeys: asRows(a).map((r) => r.key).filter((key) => !Object.prototype.hasOwnProperty.call(b || {}, key)).slice(0, 500),
      clientOnlyKeys: asRows(b).map((r) => r.key).filter((key) => !Object.prototype.hasOwnProperty.call(a || {}, key)).slice(0, 500),
    });
  }
  return differences;
}

function main() {
  const args = process.argv.slice(2);
  const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
  const serverPath = get('--server');
  const clientPath = get('--client');
  const outDir = get('--out') || path.resolve('_ai_workbench/temp/recharge_catalog_audit');
  if (!serverPath || !clientPath) {
    console.error('usage: audit_recharge_catalog_local.js --server SERVER_BIN --client CLIENT_BIN --out OUT_DIR');
    process.exit(2);
  }
  const server = parseBin(serverPath);
  const client = parseBin(clientPath);
  const paymentRowsServer = collectPaymentRows(server.tables);
  const paymentRowsClient = collectPaymentRows(client.tables);
  const report = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    inputs: {
      server: { path: serverPath, bytes: server.bytes, sha256: server.sha256, tableCount: Object.keys(server.tables).length, decodeErrors: server.errors },
      client: { path: clientPath, bytes: client.bytes, sha256: client.sha256, tableCount: Object.keys(client.tables).length, decodeErrors: client.errors },
    },
    tableComparison: {
      totalTables: [...new Set([...Object.keys(server.tables), ...Object.keys(client.tables)])].length,
      relevantDifferences: compareTables(server.tables, client.tables),
    },
    paymentRows: { server: paymentRowsServer, client: paymentRowsClient },
    rechargeIdRows: {
      server: extractRowsByKeys(server.tables, /^(payid?|advancedPayid|rechargeId|rechargeID|productId)$/i),
      client: extractRowsByKeys(client.tables, /^(payid?|advancedPayid|rechargeId|rechargeID|productId)$/i),
    },
    rewardRows: {
      server: extractRowsByKeys(server.tables, /^(rewards?|pRewards|eRewards|firstRewards|subsequentRewards|attachments)$/i),
      client: extractRowsByKeys(client.tables, /^(rewards?|pRewards|eRewards|firstRewards|subsequentRewards|attachments)$/i),
    },
  };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'recharge_catalog_audit.json'), JSON.stringify(report, null, 2));
  // Separate full tables allow exact row-level follow-up without re-decoding.
  fs.writeFileSync(path.join(outDir, 'server_payment_tables.json'), JSON.stringify(Object.fromEntries(Object.entries(server.tables).filter(([name]) => relevantTable(name))), null, 2));
  fs.writeFileSync(path.join(outDir, 'client_payment_tables.json'), JSON.stringify(Object.fromEntries(Object.entries(client.tables).filter(([name]) => relevantTable(name))), null, 2));
  console.log(JSON.stringify({
    result: 'PASS',
    outDir,
    server: report.inputs.server,
    client: report.inputs.client,
    relevantDifferenceCount: report.tableComparison.relevantDifferences.length,
    paymentRowCounts: { server: paymentRowsServer.length, client: paymentRowsClient.length },
    rechargeIdRowCounts: { server: report.rechargeIdRows.server.length, client: report.rechargeIdRows.client.length },
    rewardRowCounts: { server: report.rewardRows.server.length, client: report.rewardRows.client.length },
  }, null, 2));
}

main();

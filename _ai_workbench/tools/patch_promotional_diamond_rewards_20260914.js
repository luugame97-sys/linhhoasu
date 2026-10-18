#!/usr/bin/env node
'use strict';

// Scoped binary config patch. Only reward rows with item id=1 in the 12
// paid Star-Palace/Kim-Ma package shops are multiplied by 1000. Prices,
// attached items, limits, and every other config table remain byte/semantic
// stable apart from the targeted reward counts.

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { BinJsonUtil, ByteArray } = require('../../linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');

const inputPath = path.resolve(process.argv[2] || '');
const outputPath = path.resolve(process.argv[3] || '');
if (!inputPath || !outputPath) {
  console.error('Usage: node patch_promotional_diamond_rewards_20260914.js <input.bin> <output.bin>');
  process.exit(2);
}

const TARGET_SHOP_IDS = [
  11007001, 11007002, 11007003, 11007004, 11007005, 11007006,
  11018001, 11018002, 11018003, 11018004, 11018005, 11018006,
];
const MULTIPLIER = 1000;

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function toArrayBuffer(buffer) { return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength); }

function decodeTables(buffer) {
  const tables = [];
  let offset = 0;
  while (offset < buffer.length) {
    const at = offset;
    const nameLength = buffer.readUInt8(offset); offset += 1;
    if (nameLength <= 0 || offset + nameLength + 4 > buffer.length) throw new Error(`BAD_HEADER:${at}`);
    const name = buffer.toString('utf8', offset, offset + nameLength); offset += nameLength;
    const dataLength = buffer.readUInt32BE(offset); offset += 4;
    if (dataLength <= 0 || offset + dataLength > buffer.length) throw new Error(`BAD_LENGTH:${name}`);
    const compressed = buffer.subarray(offset, offset + dataLength); offset += dataLength;
    const inflated = zlib.inflateSync(compressed);
    tables.push({ name, raw: buffer.subarray(at, offset), value: BinJsonUtil.readFullJson(new ByteArray(toArrayBuffer(inflated))) });
  }
  assert.strictEqual(offset, buffer.length, 'BINARY_TRAILING_BYTES');
  return tables;
}

function encodeValue(value) {
  const output = new ByteArray(undefined, 1024 * 1024);
  BinJsonUtil.json2bin(value, output);
  return Buffer.from(output.buffer);
}

function encodeTables(tables) {
  const chunks = [];
  for (const table of tables) {
    if (table.name !== 'ShopConfig') { chunks.push(table.raw); continue; }
    const name = Buffer.from(table.name, 'utf8');
    const compressed = zlib.deflateSync(encodeValue(table.value), { level: 6 });
    const header = Buffer.allocUnsafe(1 + name.length + 4);
    header.writeUInt8(name.length, 0);
    name.copy(header, 1);
    header.writeUInt32BE(compressed.length, 1 + name.length);
    chunks.push(header, compressed);
  }
  return Buffer.concat(chunks);
}

function rows(value) { return Array.isArray(value) ? value : []; }

const input = fs.readFileSync(inputPath);
const originalTables = decodeTables(input);
const shopTable = originalTables.find((table) => table.name === 'ShopConfig');
if (!shopTable) throw new Error('SHOP_CONFIG_MISSING');
const originalShop = clone(shopTable.value);
const before = {};
const changed = [];
for (const id of TARGET_SHOP_IDS) {
  const key = String(id);
  const row = shopTable.value[id] || shopTable.value[key];
  if (!row || Number(row.id) !== id || Number(row.payId) !== id) throw new Error(`TARGET_SHOP_INVALID:${id}`);
  before[id] = clone(row);
  const rewardRows = rows(row.rewards);
  const diamond = rewardRows.find((reward) => Number(reward && reward.id) === 1);
  if (!diamond || !Number.isSafeInteger(Number(diamond.count)) || Number(diamond.count) <= 0) throw new Error(`TARGET_DIAMOND_REWARD_MISSING:${id}`);
  diamond.count *= MULTIPLIER;
  changed.push({ shopId: id, beforeDiamond: before[id].rewards.find((reward) => Number(reward.id) === 1).count, afterDiamond: diamond.count });
}

const output = encodeTables(originalTables);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output);
const decoded = decodeTables(output);
assert.strictEqual(decoded.length, originalTables.length, 'TABLE_COUNT_CHANGED');
const outShop = decoded.find((table) => table.name === 'ShopConfig');
for (const table of originalTables) {
  if (table.name === 'ShopConfig') continue;
  const next = decoded.find((candidate) => candidate.name === table.name);
  assert.deepStrictEqual(next.value, table.value, `UNEXPECTED_TABLE_CHANGE:${table.name}`);
}
for (const id of TARGET_SHOP_IDS) {
  const expected = clone(before[id]);
  expected.rewards = rows(expected.rewards).map((reward) => Number(reward.id) === 1
    ? { ...reward, count: Number(reward.count) * MULTIPLIER }
    : reward);
  assert.deepStrictEqual(outShop.value[String(id)] || outShop.value[id], expected, `TARGET_ROW_MISMATCH:${id}`);
}
for (const [id, row] of Object.entries(originalShop)) {
  if (!TARGET_SHOP_IDS.includes(Number(id))) assert.deepStrictEqual(outShop.value[id], row, `UNRELATED_SHOP_CHANGED:${id}`);
}

console.log(JSON.stringify({
  result: 'PASS',
  inputPath,
  outputPath,
  inputBytes: input.length,
  outputBytes: output.length,
  tables: decoded.length,
  multiplier: MULTIPLIER,
  changed,
  inputSha256: sha(input),
  outputSha256: sha(output),
}, null, 2));

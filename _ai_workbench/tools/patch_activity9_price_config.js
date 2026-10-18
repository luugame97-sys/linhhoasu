#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const protocol = require('../../linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');
const BinJsonUtil = protocol.BinJsonUtil;
const ByteArray = protocol.ByteArray;

const inputArg = process.argv[2];
const outputArg = process.argv[3];
if (!inputArg || !outputArg) {
  console.error('Usage: node patch_activity9_price_config.js <input.bin> <output.bin>');
  process.exit(2);
}

const inputPath = path.resolve(inputArg);
const outputPath = path.resolve(outputArg);
const TARGET_IDS = ['10501', '10502'];
const TARGET_PRICE_R = 68;

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function decodeTables(buffer) {
  const tables = [];
  let offset = 0;
  while (offset < buffer.length) {
    const nameLength = buffer.readUInt8(offset);
    offset += 1;
    const name = buffer.toString('utf8', offset, offset + nameLength);
    offset += nameLength;
    const dataLength = buffer.readUInt32BE(offset);
    offset += 4;
    const compressed = buffer.subarray(offset, offset + dataLength);
    offset += dataLength;
    const inflated = zlib.inflateSync(compressed);
    const value = BinJsonUtil.readFullJson(new ByteArray(toArrayBuffer(inflated)));
    tables.push({ name: name, value: value });
  }
  if (offset !== buffer.length) {
    throw new Error('outer bundle trailing bytes: ' + (buffer.length - offset));
  }
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
    const name = Buffer.from(table.name, 'utf8');
    if (name.length > 255) throw new Error('table name too long: ' + table.name);
    const compressed = zlib.deflateSync(encodeValue(table.value), { level: 6 });
    const header = Buffer.allocUnsafe(1 + name.length + 4);
    header.writeUInt8(name.length, 0);
    name.copy(header, 1);
    header.writeUInt32BE(compressed.length, 1 + name.length);
    chunks.push(header, compressed);
  }
  return Buffer.concat(chunks);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const inputBuffer = fs.readFileSync(inputPath);
const originalTables = decodeTables(inputBuffer);
const originalByName = new Map(originalTables.map(function (row) {
  return [row.name, clone(row.value)];
}));
const payConfig = originalTables.find(function (row) {
  return row.name === 'PayConfig';
});
if (!payConfig) throw new Error('PayConfig table not found');

const before = {};
for (const id of TARGET_IDS) {
  const row = payConfig.value[id];
  if (!row || Number(row.id) !== Number(id)) throw new Error('PayConfig ' + id + ' not found');
  before[id] = clone(row);
  row.priceR = TARGET_PRICE_R;
}

const outputBuffer = encodeTables(originalTables);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, outputBuffer);

const decodedOutput = decodeTables(outputBuffer);
assert.strictEqual(decodedOutput.length, originalTables.length, 'table count changed');
const outputByName = new Map(decodedOutput.map(function (row) {
  return [row.name, row.value];
}));

for (const pair of originalByName.entries()) {
  const name = pair[0];
  const originalValue = pair[1];
  const nextValue = outputByName.get(name);
  if (name !== 'PayConfig') {
    assert.deepStrictEqual(nextValue, originalValue, name + ' changed unexpectedly');
    continue;
  }
  const expected = clone(originalValue);
  for (const id of TARGET_IDS) expected[id].priceR = TARGET_PRICE_R;
  assert.deepStrictEqual(nextValue, expected, 'PayConfig changed outside Activity 9 prices');
}

const afterPay = outputByName.get('PayConfig');
console.log(JSON.stringify({
  result: 'ok',
  inputPath: inputPath,
  outputPath: outputPath,
  inputBytes: inputBuffer.length,
  outputBytes: outputBuffer.length,
  tables: decodedOutput.length,
  before: before,
  after: Object.fromEntries(TARGET_IDS.map(function (id) {
    return [id, afterPay[id]];
  })),
}, null, 2));


'use strict';

/*
 * Candidate-only binary patcher.  It rewrites PlantLevelConfig in a copied
 * config binary and preserves every unrelated table's original bytes.  The
 * caller must provide a distinct output path; this script refuses in-place
 * writes so a production asset cannot be overwritten accidentally.
 */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { BinJsonUtil, ByteArray } = require('../../linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');
const { extendRows, VERSION } = require('./generate_plant_level100_candidate');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function decodeTables(buffer) {
  const tables = [];
  let offset = 0;
  while (offset < buffer.length) {
    const at = offset;
    const nameLength = buffer.readUInt8(offset);
    offset += 1;
    if (nameLength <= 0 || offset + nameLength + 4 > buffer.length) throw new Error(`BAD_HEADER:${at}`);
    const name = buffer.toString('utf8', offset, offset + nameLength);
    offset += nameLength;
    const dataLength = buffer.readUInt32BE(offset);
    offset += 4;
    if (dataLength <= 0 || offset + dataLength > buffer.length) throw new Error(`BAD_LENGTH:${name}`);
    const compressed = buffer.subarray(offset, offset + dataLength);
    offset += dataLength;
    const inflated = zlib.inflateSync(compressed);
    tables.push({
      name,
      raw: buffer.subarray(at, offset),
      value: BinJsonUtil.readFullJson(new ByteArray(toArrayBuffer(inflated))),
    });
  }
  if (offset !== buffer.length) throw new Error('BINARY_TRAILING_BYTES');
  return tables;
}

function encodeValue(value) {
  const output = new ByteArray(undefined, 1024 * 1024);
  BinJsonUtil.json2bin(value, output);
  return Buffer.from(output.buffer);
}

function encodeTargetTable(name, value) {
  const nameBytes = Buffer.from(name, 'utf8');
  const compressed = zlib.deflateSync(encodeValue(value), { level: 6 });
  const header = Buffer.allocUnsafe(1 + nameBytes.length + 4);
  header.writeUInt8(nameBytes.length, 0);
  nameBytes.copy(header, 1);
  header.writeUInt32BE(compressed.length, 1 + nameBytes.length);
  return Buffer.concat([header, compressed]);
}

function encodeTables(tables, targetName, targetValue) {
  return Buffer.concat(tables.map((table) => table.name === targetName
    ? encodeTargetTable(table.name, targetValue)
    : table.raw));
}

function patchBinary(inputPath, outputPath) {
  const input = path.resolve(inputPath);
  const output = path.resolve(outputPath);
  if (input === output) throw new Error('IN_PLACE_WRITE_REFUSED');
  const originalBuffer = fs.readFileSync(input);
  const tables = decodeTables(originalBuffer);
  const target = tables.find((table) => table.name === 'PlantLevelConfig');
  if (!target) throw new Error('PLANT_LEVEL_CONFIG_MISSING');
  const before = clone(target.value);
  const extended = extendRows(target.value);
  const outputBuffer = encodeTables(tables, target.name, extended.data);

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, outputBuffer);

  // Round-trip and semantic guard: all non-target tables must remain exactly
  // equal, while rows 1..100 must match the generated candidate.
  const decoded = decodeTables(outputBuffer);
  assert.equal(decoded.length, tables.length, 'TABLE_COUNT_CHANGED');
  const beforeByName = new Map(tables.map((table) => [table.name, table.value]));
  const afterByName = new Map(decoded.map((table) => [table.name, table.value]));
  for (const [name, value] of beforeByName) {
    if (name === 'PlantLevelConfig') continue;
    assert.deepEqual(afterByName.get(name), value, `UNRELATED_TABLE_CHANGED:${name}`);
  }
  assert.deepEqual(afterByName.get('PlantLevelConfig'), extended.data, 'PLANT_LEVEL_ROWS_MISMATCH');
  assert.deepEqual(before['39'], target.value['39'], 'BASE_SNAPSHOT_INVALID');
  return {
    result: 'PASS',
    version: VERSION,
    input,
    output,
    inputBytes: originalBuffer.length,
    outputBytes: outputBuffer.length,
    inputSha256: sha256(originalBuffer),
    outputSha256: sha256(outputBuffer),
    tables: tables.length,
    inferredStep: extended.inferredStep,
    level40Exp: extended.data['40'].exp,
    level41Exp: extended.data['41'].exp,
    level99Exp: extended.data['99'].exp,
    level100Exp: extended.data['100'].exp,
    productionWrites: 0,
  };
}

function main(argv = process.argv.slice(2)) {
  if (argv.length < 2) {
    throw new Error('USAGE: node patch_plant_level100_binary_candidate.js <input.bin> <output.bin>');
  }
  process.stdout.write(`${JSON.stringify(patchBinary(argv[0], argv[1]), null, 2)}\n`);
}

if (require.main === module) main();

module.exports = { decodeTables, encodeTables, patchBinary };

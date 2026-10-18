'use strict';

// Narrow local candidate patch: raise the existing break-limit pet cap to 1000.
// This script does not deploy, restart PM2, or touch player data.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const { BinJsonUtil, ByteArray } = require(path.join(root, 'linhhoasu/lhs/newServer/src/protocol/BinJsonUtil'));

const files = [
  'linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin',
  'linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin',
  'linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin',
  'linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin',
].map((rel) => path.join(root, rel));

function decodeTables(buffer) {
  const tables = [];
  let offset = 0;
  while (offset < buffer.length) {
    const start = offset;
    const nameLength = buffer.readUInt8(offset); offset += 1;
    assert.ok(nameLength > 0 && offset + nameLength + 4 <= buffer.length, 'BAD_HEADER');
    const name = buffer.toString('utf8', offset, offset + nameLength); offset += nameLength;
    const dataLength = buffer.readUInt32BE(offset); offset += 4;
    assert.ok(dataLength > 0 && offset + dataLength <= buffer.length, `BAD_LENGTH:${name}`);
    const compressed = buffer.subarray(offset, offset + dataLength); offset += dataLength;
    const inflated = zlib.inflateSync(compressed);
    const value = BinJsonUtil.readFullJson(new ByteArray(inflated));
    tables.push({ name, value, raw: buffer.subarray(start, offset) });
  }
  assert.equal(offset, buffer.length, 'BINARY_TRAILING_BYTES');
  return tables;
}

function encodeValue(value) {
  const output = new ByteArray(undefined, 1024 * 1024);
  BinJsonUtil.json2bin(value, output);
  return Buffer.from(output.buffer);
}

function makeChunk(name, value) {
  const nameBuf = Buffer.from(name, 'utf8');
  const compressed = zlib.deflateSync(encodeValue(value), { level: 6 });
  const header = Buffer.allocUnsafe(1 + nameBuf.length + 4);
  header.writeUInt8(nameBuf.length, 0);
  nameBuf.copy(header, 1);
  header.writeUInt32BE(compressed.length, 1 + nameBuf.length);
  return Buffer.concat([header, compressed]);
}

function patchConfig(filePath) {
  const before = fs.readFileSync(filePath);
  const tables = decodeTables(before);
  const petBase = tables.find((row) => row.name === 'PetBaseConfig');
  const coercion = tables.find((row) => row.name === 'CoercionConfig');
  assert.ok(petBase && coercion, `PET_TABLES_MISSING:${filePath}`);
  const breakQualities = Array.isArray(petBase.value.breakLimitPetQuality)
    ? petBase.value.breakLimitPetQuality.map(Number)
    : [];
  assert.ok(breakQualities.includes(7) && breakQualities.includes(9), `BREAK_LIMIT_SCOPE_MISSING:${filePath}`);
  const stage50 = coercion.value[50] || coercion.value['50'];
  assert.ok(stage50 && Number(stage50.coercion) === 35000, `COERCION_STAGE50_MISSING:${filePath}`);
  const oldLimit = Number(stage50.limitLevelUp);
  assert.ok(oldLimit === 200 || oldLimit === 800, `UNEXPECTED_OLD_CAP:${filePath}`);
  stage50.limitLevelUp = 800;

  const output = Buffer.concat(tables.map((row) => row.name === 'CoercionConfig'
    ? makeChunk(row.name, coercion.value)
    : row.raw));
  const roundtrip = decodeTables(output);
  const checked = roundtrip.find((row) => row.name === 'CoercionConfig');
  assert.equal(Number((checked.value[50] || checked.value['50']).limitLevelUp), 800);
  fs.writeFileSync(filePath, output);
  return {
    path: path.relative(root, filePath).replaceAll(path.sep, '/'),
    beforeBytes: before.length,
    afterBytes: output.length,
    beforeSha256: crypto.createHash('sha256').update(before).digest('hex'),
    afterSha256: crypto.createHash('sha256').update(output).digest('hex'),
    oldLimit,
    breakQualities,
    hasQuality10: breakQualities.includes(10),
    stage50: { coercion: Number(stage50.coercion), limitLevelUp: Number(stage50.limitLevelUp) },
  };
}

function updateDump() {
  const filePath = path.join(root, 'linhhoasu/lhs/newServer/scripts/_tables_dump/CoercionConfig.json');
  const dump = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.ok([200, 800].includes(Number(dump.data['50'].limitLevelUp)), 'UNEXPECTED_DUMP_CAP');
  dump.data['50'].limitLevelUp = 800;
  fs.writeFileSync(filePath, `${JSON.stringify(dump, null, 2)}\n`, 'utf8');
  return { path: path.relative(root, filePath).replaceAll(path.sep, '/'), limitLevelUp: dump.data['50'].limitLevelUp };
}

const results = files.map(patchConfig);
const dump = updateDump();
console.log(JSON.stringify({ result: 'PET_CAP1000_CANDIDATE_PATCHED', results, dump }, null, 2));

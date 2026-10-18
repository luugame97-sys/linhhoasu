'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const assert = require('assert');
const { BinJsonUtil, ByteArray } = require('../../linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');

const ROOT = path.resolve(__dirname, '../..');
const BINARIES = [
  'linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin',
  'linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin',
  'linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin',
  'linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin',
].map((p) => path.join(ROOT, p));

function decodeTables(buffer) {
  const tables = [];
  let offset = 0;
  while (offset < buffer.length) {
    const start = offset;
    const nameLength = buffer.readUInt8(offset); offset += 1;
    const name = buffer.toString('utf8', offset, offset + nameLength); offset += nameLength;
    const dataLength = buffer.readUInt32BE(offset); offset += 4;
    const compressed = buffer.subarray(offset, offset + dataLength); offset += dataLength;
    const inflated = zlib.inflateSync(compressed);
    const value = BinJsonUtil.readFullJson(new ByteArray(inflated.buffer.slice(inflated.byteOffset, inflated.byteOffset + inflated.byteLength)));
    tables.push({ name, raw: buffer.subarray(start, offset), value });
  }
  assert.strictEqual(offset, buffer.length, 'BINARY_TRAILING_BYTES');
  return tables;
}

function encodeValue(value) {
  const out = new ByteArray(undefined, 1024 * 1024);
  BinJsonUtil.json2bin(value, out);
  return Buffer.from(out.buffer);
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

function transformTable(tableName, source) {
  assert.ok(source && typeof source === 'object', `${tableName}_MISSING`);
  const out = {};
  for (const [key, row] of Object.entries(source)) {
    assert.ok(Array.isArray(row.rewards), `${tableName}_${key}_REWARDS_MISSING`);
    const rewards = row.rewards.map((reward) => {
      const id = Number(reward.id);
      const count = Number(reward.count);
      if (tableName === 'ArenaDayRankRewardConfig') {
        if (id === 7) return { id: 1001, count: count * 100 };
        if (id === 1) return { id, count: count * 10 };
        if (id === 90077) return { id: 100097, count: count * 10 };
      } else {
        if (id === 8) return { id: 1001, count: count * 300 };
        if (id === 1) return { id, count: count * 10 };
        if (id === 90077) return { id: 100097, count: count * 3 };
      }
      return { id, count };
    });
    out[key] = { ...row, rewards };
  }
  return out;
}

function verify(day, week) {
  const d = day[1].rewards;
  const w = week[1].rewards;
  assert.deepStrictEqual(d, [
    { id: 1001, count: 5000 }, { id: 1, count: 2000000 }, { id: 100097, count: 100 },
  ]);
  assert.deepStrictEqual(w, [
    { id: 11201, count: 1 }, { id: 1001, count: 15000 }, { id: 1, count: 20000000 }, { id: 100097, count: 60 },
  ]);
  for (const row of Object.values(day)) {
    assert.ok(row.rewards.every((r) => ![7, 90077].includes(r.id)));
    assert.ok(row.rewards.some((r) => r.id === 1001));
  }
  for (const row of Object.values(week)) {
    assert.ok(row.rewards.every((r) => ![8, 90077].includes(r.id)));
    assert.ok(row.rewards.some((r) => r.id === 1001));
  }
}

function patchBinary(filePath) {
  const tables = decodeTables(fs.readFileSync(filePath));
  let day; let week;
  const chunks = tables.map((table) => {
    if (table.name === 'ArenaDayRankRewardConfig') {
      day = transformTable(table.name, table.value);
      return makeChunk(table.name, day);
    }
    if (table.name === 'ArenaWeeklyRankRewardConfig') {
      week = transformTable(table.name, table.value);
      return makeChunk(table.name, week);
    }
    return table.raw;
  });
  assert.ok(day && week, `${filePath}: target tables missing`);
  verify(day, week);
  fs.writeFileSync(filePath, Buffer.concat(chunks));
  const check = decodeTables(fs.readFileSync(filePath));
  verify(
    check.find((t) => t.name === 'ArenaDayRankRewardConfig').value,
    check.find((t) => t.name === 'ArenaWeeklyRankRewardConfig').value,
  );
  console.log(`patched ${filePath}`);
  return { day, week };
}

const first = patchBinary(BINARIES[0]);
for (const filePath of BINARIES.slice(1)) patchBinary(filePath);

for (const [fileName, data] of [
  ['ArenaDayRankRewardConfig.json', first.day],
  ['ArenaWeeklyRankRewardConfig.json', first.week],
]) {
  const filePath = path.join(ROOT, 'linhhoasu/lhs/newServer/scripts/_tables_dump', fileName);
  const dump = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  dump.data = data;
  fs.writeFileSync(filePath, `${JSON.stringify(dump, null, 2)}\n`, 'utf8');
}
console.log('ARENA_REWARD_PATCH_20261014_PASS');

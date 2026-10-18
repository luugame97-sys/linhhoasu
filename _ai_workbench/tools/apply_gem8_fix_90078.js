'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const assert = require('assert');
const { BinJsonUtil, ByteArray } = require('../../linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');

// Bảng Quà Ngày TopCombat mới (Hồn ngọc cấp 8 tự chọn: id 90078)
const newTopCombatDayRewards = {
  "1": {
    "id": 1, "rankMin": 1, "rankMax": 1, "rankShow": "1",
    "rewards": [
      { "id": 89, "count": 100 },
      { "id": 1, "count": 400000 },
      { "id": 90078, "count": 10 }
    ]
  },
  "2": {
    "id": 2, "rankMin": 2, "rankMax": 2, "rankShow": "2",
    "rewards": [
      { "id": 89, "count": 90 },
      { "id": 1, "count": 360000 },
      { "id": 90078, "count": 8 }
    ]
  },
  "3": {
    "id": 3, "rankMin": 3, "rankMax": 3, "rankShow": "3",
    "rewards": [
      { "id": 89, "count": 80 },
      { "id": 1, "count": 320000 },
      { "id": 90078, "count": 5 }
    ]
  },
  "4": {
    "id": 4, "rankMin": 4, "rankMax": 4, "rankShow": "4",
    "rewards": [
      { "id": 89, "count": 70 },
      { "id": 1, "count": 280000 },
      { "id": 90078, "count": 3 }
    ]
  },
  "5": {
    "id": 5, "rankMin": 5, "rankMax": 5, "rankShow": "5",
    "rewards": [
      { "id": 89, "count": 60 },
      { "id": 1, "count": 50000 },
      { "id": 90078, "count": 3 }
    ]
  },
  "6": {
    "id": 6, "rankMin": 6, "rankMax": 10, "rankShow": "6-10",
    "rewards": [
      { "id": 89, "count": 50 },
      { "id": 1, "count": 50000 },
      { "id": 90078, "count": 3 }
    ]
  },
  "7": {
    "id": 7, "rankMin": 11, "rankMax": 20, "rankShow": "11-20",
    "rewards": [
      { "id": 89, "count": 40 },
      { "id": 1, "count": 50000 },
      { "id": 90078, "count": 2 }
    ]
  },
  "8": {
    "id": 8, "rankMin": 21, "rankMax": 50, "rankShow": "21-50",
    "rewards": [
      { "id": 89, "count": 30 },
      { "id": 1, "count": 50000 },
      { "id": 90078, "count": 2 }
    ]
  },
  "9": {
    "id": 9, "rankMin": 51, "rankMax": 500, "rankShow": "51-500",
    "rewards": [
      { "id": 89, "count": 20 },
      { "id": 1, "count": 10000 },
      { "id": 90078, "count": 2 }
    ]
  },
  "10": {
    "id": 10, "rankMin": 501, "rankMax": 9999, "rankShow": "501+",
    "rewards": [
      { "id": 89, "count": 10 },
      { "id": 1, "count": 10000 },
      { "id": 90078, "count": 2 }
    ]
  }
};

// Bảng Quà Tuần TopCombat mới (Hồn ngọc cấp 8 tự chọn: id 90078)
const newTopCombatWeeklyRewards = {
  "1": {
    "id": 1, "rankMin": 1, "rankMax": 1, "rankShow": "1",
    "rewards": [
      { "id": 11221, "count": 1 },
      { "id": 89, "count": 1000 },
      { "id": 1, "count": 2000000 },
      { "id": 90078, "count": 20 }
    ]
  },
  "2": {
    "id": 2, "rankMin": 2, "rankMax": 2, "rankShow": "2",
    "rewards": [
      { "id": 11222, "count": 1 },
      { "id": 89, "count": 900 },
      { "id": 1, "count": 1500000 },
      { "id": 90078, "count": 16 }
    ]
  },
  "3": {
    "id": 3, "rankMin": 3, "rankMax": 3, "rankShow": "3",
    "rewards": [
      { "id": 11223, "count": 1 },
      { "id": 89, "count": 800 },
      { "id": 1, "count": 1000000 },
      { "id": 90078, "count": 10 }
    ]
  },
  "4": {
    "id": 4, "rankMin": 4, "rankMax": 4, "rankShow": "4",
    "rewards": [
      { "id": 89, "count": 700 },
      { "id": 1, "count": 800000 },
      { "id": 90078, "count": 6 }
    ]
  },
  "5": {
    "id": 5, "rankMin": 5, "rankMax": 5, "rankShow": "5",
    "rewards": [
      { "id": 89, "count": 600 },
      { "id": 1, "count": 600000 },
      { "id": 90078, "count": 6 }
    ]
  },
  "6": {
    "id": 6, "rankMin": 6, "rankMax": 10, "rankShow": "6-10",
    "rewards": [
      { "id": 89, "count": 500 },
      { "id": 1, "count": 400000 },
      { "id": 90078, "count": 6 }
    ]
  },
  "7": {
    "id": 7, "rankMin": 11, "rankMax": 20, "rankShow": "11-20",
    "rewards": [
      { "id": 89, "count": 400 },
      { "id": 1, "count": 300000 },
      { "id": 90078, "count": 4 }
    ]
  },
  "8": {
    "id": 8, "rankMin": 21, "rankMax": 50, "rankShow": "21-50",
    "rewards": [
      { "id": 89, "count": 300 },
      { "id": 1, "count": 200000 },
      { "id": 90078, "count": 4 }
    ]
  },
  "9": {
    "id": 9, "rankMin": 51, "rankMax": 500, "rankShow": "51-500",
    "rewards": [
      { "id": 89, "count": 200 },
      { "id": 1, "count": 100000 },
      { "id": 90078, "count": 4 }
    ]
  },
  "10": {
    "id": 10, "rankMin": 501, "rankMax": 9999, "rankShow": "501+",
    "rewards": [
      { "id": 89, "count": 100 },
      { "id": 1, "count": 60000 },
      { "id": 90078, "count": 4 }
    ]
  }
};

// Bảng Quà Ngày CrossArena mới (id 90078)
const newCrossArenaDayRewards = {
  "1": { "id": 1, "rankMin": 1, "rankMax": 1, "rankShow": "1", "rewards": [{ "id": 89, "count": 100 }, { "id": 1, "count": 400000 }, { "id": 90078, "count": 10 }] },
  "2": { "id": 2, "rankMin": 2, "rankMax": 2, "rankShow": "2", "rewards": [{ "id": 89, "count": 90 }, { "id": 1, "count": 360000 }, { "id": 90078, "count": 8 }] },
  "3": { "id": 3, "rankMin": 3, "rankMax": 3, "rankShow": "3", "rewards": [{ "id": 89, "count": 80 }, { "id": 1, "count": 320000 }, { "id": 90078, "count": 5 }] },
  "4": { "id": 4, "rankMin": 4, "rankMax": 4, "rankShow": "4", "rewards": [{ "id": 89, "count": 70 }, { "id": 1, "count": 280000 }, { "id": 90078, "count": 3 }] },
  "5": { "id": 5, "rankMin": 5, "rankMax": 5, "rankShow": "5", "rewards": [{ "id": 89, "count": 60 }, { "id": 1, "count": 50000 }, { "id": 90078, "count": 3 }] },
  "6": { "id": 6, "rankMin": 6, "rankMax": 10, "rankShow": "6-10", "rewards": [{ "id": 89, "count": 50 }, { "id": 1, "count": 50000 }, { "id": 90078, "count": 3 }] },
  "7": { "id": 7, "rankMin": 11, "rankMax": 20, "rankShow": "11-20", "rewards": [{ "id": 89, "count": 40 }, { "id": 1, "count": 50000 }, { "id": 90078, "count": 2 }] },
  "8": { "id": 8, "rankMin": 21, "rankMax": 50, "rankShow": "21-50", "rewards": [{ "id": 89, "count": 30 }, { "id": 1, "count": 50000 }, { "id": 90078, "count": 2 }] },
  "9": { "id": 9, "rankMin": 51, "rankMax": 500, "rankShow": "51-500", "rewards": [{ "id": 89, "count": 20 }, { "id": 1, "count": 10000 }, { "id": 90078, "count": 2 }] },
  "10": { "id": 10, "rankMin": 501, "rankMax": 9999, "rankShow": "501+", "rewards": [{ "id": 89, "count": 10 }, { "id": 1, "count": 10000 }, { "id": 90078, "count": 2 }] }
};

// Bảng Quà Tuần CrossArena mới (id 90078)
const newCrossArenaWeeklyRewards = {
  "1": { "id": 1, "rankMin": 1, "rankMax": 1, "rankShow": "1", "rewards": [{ "id": 11221, "count": 1 }, { "id": 89, "count": 1000 }, { "id": 1, "count": 2000000 }, { "id": 90078, "count": 20 }] },
  "2": { "id": 2, "rankMin": 2, "rankMax": 2, "rankShow": "2", "rewards": [{ "id": 11222, "count": 1 }, { "id": 89, "count": 900 }, { "id": 1, "count": 1500000 }, { "id": 90078, "count": 16 }] },
  "3": { "id": 3, "rankMin": 3, "rankMax": 3, "rankShow": "3", "rewards": [{ "id": 11223, "count": 1 }, { "id": 89, "count": 800 }, { "id": 1, "count": 1000000 }, { "id": 90078, "count": 10 }] },
  "4": { "id": 4, "rankMin": 4, "rankMax": 4, "rankShow": "4", "rewards": [{ "id": 89, "count": 700 }, { "id": 1, "count": 800000 }, { "id": 90078, "count": 6 }] },
  "5": { "id": 5, "rankMin": 5, "rankMax": 5, "rankShow": "5", "rewards": [{ "id": 89, "count": 600 }, { "id": 1, "count": 600000 }, { "id": 90078, "count": 6 }] },
  "6": { "id": 6, "rankMin": 6, "rankMax": 10, "rankShow": "6-10", "rewards": [{ "id": 89, "count": 500 }, { "id": 1, "count": 400000 }, { "id": 90078, "count": 6 }] },
  "7": { "id": 7, "rankMin": 11, "rankMax": 20, "rankShow": "11-20", "rewards": [{ "id": 89, "count": 400 }, { "id": 1, "count": 300000 }, { "id": 90078, "count": 4 }] },
  "8": { "id": 8, "rankMin": 21, "rankMax": 50, "rankShow": "21-50", "rewards": [{ "id": 89, "count": 300 }, { "id": 1, "count": 200000 }, { "id": 90078, "count": 4 }] },
  "9": { "id": 9, "rankMin": 51, "rankMax": 500, "rankShow": "51-500", "rewards": [{ "id": 89, "count": 200 }, { "id": 1, "count": 100000 }, { "id": 90078, "count": 4 }] },
  "10": { "id": 10, "rankMin": 501, "rankMax": 9999, "rankShow": "501+", "rewards": [{ "id": 89, "count": 100 }, { "id": 1, "count": 60000 }, { "id": 90078, "count": 4 }] }
};

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
    const value = BinJsonUtil.readFullJson(new ByteArray(inflated.buffer.slice(inflated.byteOffset, inflated.byteOffset + inflated.byteLength)));
    tables.push({ name, raw: buffer.subarray(at, offset), value });
  }
  assert.strictEqual(offset, buffer.length, 'BINARY_TRAILING_BYTES');
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

function patchBinaryFile(filePath) {
  console.log(`Patching binary file: ${filePath}`);
  const input = fs.readFileSync(filePath);
  const tables = decodeTables(input);
  const chunks = [];

  let topDay = false, topWeek = false;
  let crossDay = false, crossWeek = false;

  for (const table of tables) {
    if (table.name === 'TopCombatDayRankRewardConfig') {
      topDay = true;
      chunks.push(makeChunk(table.name, newTopCombatDayRewards));
    } else if (table.name === 'TopCombatWeeklyRankRewardConfig') {
      topWeek = true;
      chunks.push(makeChunk(table.name, newTopCombatWeeklyRewards));
    } else if (table.name === 'CrossArenaDayRankRewardConfig') {
      crossDay = true;
      chunks.push(makeChunk(table.name, newCrossArenaDayRewards));
    } else if (table.name === 'CrossArenaWeeklyRankRewardConfig') {
      crossWeek = true;
      chunks.push(makeChunk(table.name, newCrossArenaWeeklyRewards));
    } else {
      chunks.push(table.raw);
    }
  }

  assert.ok(topDay, 'TopCombatDayRankRewardConfig not found');
  assert.ok(topWeek, 'TopCombatWeeklyRankRewardConfig not found');

  const patchedBuffer = Buffer.concat(chunks);
  fs.writeFileSync(filePath, patchedBuffer);
  console.log(`  -> Successfully wrote ${patchedBuffer.length} bytes to ${filePath}`);

  // Verify roundtrip
  const verifyTables = decodeTables(patchedBuffer);
  assert.strictEqual(verifyTables.length, tables.length, 'TABLE_COUNT_MISMATCH');
  const td = verifyTables.find(t => t.name === 'TopCombatDayRankRewardConfig');
  assert.strictEqual(td.value[1].rewards.find(r => r.id === 90078).count, 10);
  assert.strictEqual(td.value[1].rewards.some(r => r.id === 90077), false);
  console.log('  -> Roundtrip verification with item 90078 PASSED!');
}

function updateJsonDumps() {
  const dumps = [
    { file: 'TopCombatDayRankRewardConfig.json', data: newTopCombatDayRewards },
    { file: 'TopCombatWeeklyRankRewardConfig.json', data: newTopCombatWeeklyRewards },
    { file: 'CrossArenaDayRankRewardConfig.json', data: newCrossArenaDayRewards },
    { file: 'CrossArenaWeeklyRankRewardConfig.json', data: newCrossArenaWeeklyRewards },
  ];

  for (const d of dumps) {
    const p = path.resolve('linhhoasu/lhs/newServer/scripts/_tables_dump', d.file);
    if (fs.existsSync(p)) {
      const json = JSON.parse(fs.readFileSync(p, 'utf8'));
      json.data = d.data;
      fs.writeFileSync(p, JSON.stringify(json, null, 2), 'utf8');
      console.log(`Updated dump: ${p}`);
    }
  }
}

function main() {
  const filesToPatch = [
    path.resolve('linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin'),
    path.resolve('linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin'),
    path.resolve('linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin'),
    path.resolve('linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin'),
  ];

  for (const f of filesToPatch) {
    patchBinaryFile(f);
  }

  updateJsonDumps();
  console.log('\n>>> APPLIED ITEM 90078 (HỒN NGỌC CẤP 8 TỰ CHỌN) SUCCESSFULLY! <<<');
}

main();

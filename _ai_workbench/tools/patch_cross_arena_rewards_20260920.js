'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const assert = require('assert');
const { BinJsonUtil, ByteArray } = require('../../linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');


// Bảng Quà Ngày mới (CrossArenaDayRankRewardConfig)
const newDayRewards = {
  "1": {
    "id": 1, "rankMin": 1, "rankMax": 1, "rankShow": "1",
    "rewards": [
      { "id": 89, "count": 100 },
      { "id": 1, "count": 400000 },
      { "id": 90077, "count": 10 }
    ]
  },
  "2": {
    "id": 2, "rankMin": 2, "rankMax": 2, "rankShow": "2",
    "rewards": [
      { "id": 89, "count": 90 },
      { "id": 1, "count": 360000 },
      { "id": 90077, "count": 8 }
    ]
  },
  "3": {
    "id": 3, "rankMin": 3, "rankMax": 3, "rankShow": "3",
    "rewards": [
      { "id": 89, "count": 80 },
      { "id": 1, "count": 320000 },
      { "id": 90077, "count": 5 }
    ]
  },
  "4": {
    "id": 4, "rankMin": 4, "rankMax": 4, "rankShow": "4",
    "rewards": [
      { "id": 89, "count": 70 },
      { "id": 1, "count": 280000 },
      { "id": 90077, "count": 3 }
    ]
  },
  "5": {
    "id": 5, "rankMin": 5, "rankMax": 5, "rankShow": "5",
    "rewards": [
      { "id": 89, "count": 60 },
      { "id": 1, "count": 50000 },
      { "id": 90077, "count": 3 }
    ]
  },
  "6": {
    "id": 6, "rankMin": 6, "rankMax": 10, "rankShow": "6-10",
    "rewards": [
      { "id": 89, "count": 50 },
      { "id": 1, "count": 50000 },
      { "id": 90077, "count": 3 }
    ]
  },
  "7": {
    "id": 7, "rankMin": 11, "rankMax": 20, "rankShow": "11-20",
    "rewards": [
      { "id": 89, "count": 40 },
      { "id": 1, "count": 50000 },
      { "id": 90077, "count": 2 }
    ]
  },
  "8": {
    "id": 8, "rankMin": 21, "rankMax": 50, "rankShow": "21-50",
    "rewards": [
      { "id": 89, "count": 30 },
      { "id": 1, "count": 50000 },
      { "id": 90077, "count": 2 }
    ]
  },
  "9": {
    "id": 9, "rankMin": 51, "rankMax": 500, "rankShow": "51-500",
    "rewards": [
      { "id": 89, "count": 20 },
      { "id": 1, "count": 10000 },
      { "id": 90077, "count": 2 }
    ]
  },
  "10": {
    "id": 10, "rankMin": 501, "rankMax": 9999, "rankShow": "501+",
    "rewards": [
      { "id": 89, "count": 10 },
      { "id": 1, "count": 10000 },
      { "id": 90077, "count": 2 }
    ]
  }
};

// Bảng Quà Tuần mới (CrossArenaWeeklyRankRewardConfig)
const newWeeklyRewards = {
  "1": {
    "id": 1, "rankMin": 1, "rankMax": 1, "rankShow": "1",
    "rewards": [
      { "id": 11221, "count": 1 },
      { "id": 89, "count": 1000 },
      { "id": 1, "count": 2000000 },
      { "id": 90077, "count": 20 }
    ]
  },
  "2": {
    "id": 2, "rankMin": 2, "rankMax": 2, "rankShow": "2",
    "rewards": [
      { "id": 11222, "count": 1 },
      { "id": 89, "count": 900 },
      { "id": 1, "count": 1500000 },
      { "id": 90077, "count": 16 }
    ]
  },
  "3": {
    "id": 3, "rankMin": 3, "rankMax": 3, "rankShow": "3",
    "rewards": [
      { "id": 11223, "count": 1 },
      { "id": 89, "count": 800 },
      { "id": 1, "count": 1000000 },
      { "id": 90077, "count": 10 }
    ]
  },
  "4": {
    "id": 4, "rankMin": 4, "rankMax": 4, "rankShow": "4",
    "rewards": [
      { "id": 89, "count": 700 },
      { "id": 1, "count": 800000 },
      { "id": 90077, "count": 6 }
    ]
  },
  "5": {
    "id": 5, "rankMin": 5, "rankMax": 5, "rankShow": "5",
    "rewards": [
      { "id": 89, "count": 600 },
      { "id": 1, "count": 600000 },
      { "id": 90077, "count": 6 }
    ]
  },
  "6": {
    "id": 6, "rankMin": 6, "rankMax": 10, "rankShow": "6-10",
    "rewards": [
      { "id": 89, "count": 500 },
      { "id": 1, "count": 400000 },
      { "id": 90077, "count": 6 }
    ]
  },
  "7": {
    "id": 7, "rankMin": 11, "rankMax": 20, "rankShow": "11-20",
    "rewards": [
      { "id": 89, "count": 400 },
      { "id": 1, "count": 300000 },
      { "id": 90077, "count": 4 }
    ]
  },
  "8": {
    "id": 8, "rankMin": 21, "rankMax": 50, "rankShow": "21-50",
    "rewards": [
      { "id": 89, "count": 300 },
      { "id": 1, "count": 200000 },
      { "id": 90077, "count": 4 }
    ]
  },
  "9": {
    "id": 9, "rankMin": 51, "rankMax": 500, "rankShow": "51-500",
    "rewards": [
      { "id": 89, "count": 200 },
      { "id": 1, "count": 100000 },
      { "id": 90077, "count": 4 }
    ]
  },
  "10": {
    "id": 10, "rankMin": 501, "rankMax": 9999, "rankShow": "501+",
    "rewards": [
      { "id": 89, "count": 100 },
      { "id": 1, "count": 60000 },
      { "id": 90077, "count": 4 }
    ]
  }
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

function patchBinaryFile(filePath) {
  console.log(`Patching binary file: ${filePath}`);
  const input = fs.readFileSync(filePath);
  const tables = decodeTables(input);
  const chunks = [];

  let dayFound = false;
  let weeklyFound = false;

  for (const table of tables) {
    if (table.name === 'CrossArenaDayRankRewardConfig') {
      dayFound = true;
      const nameBuf = Buffer.from(table.name, 'utf8');
      const compressed = zlib.deflateSync(encodeValue(newDayRewards), { level: 6 });
      const header = Buffer.allocUnsafe(1 + nameBuf.length + 4);
      header.writeUInt8(nameBuf.length, 0);
      nameBuf.copy(header, 1);
      header.writeUInt32BE(compressed.length, 1 + nameBuf.length);
      chunks.push(header, compressed);
    } else if (table.name === 'CrossArenaWeeklyRankRewardConfig') {
      weeklyFound = true;
      const nameBuf = Buffer.from(table.name, 'utf8');
      const compressed = zlib.deflateSync(encodeValue(newWeeklyRewards), { level: 6 });
      const header = Buffer.allocUnsafe(1 + nameBuf.length + 4);
      header.writeUInt8(nameBuf.length, 0);
      nameBuf.copy(header, 1);
      header.writeUInt32BE(compressed.length, 1 + nameBuf.length);
      chunks.push(header, compressed);
    } else {
      chunks.push(table.raw);
    }
  }

  assert.ok(dayFound, 'CrossArenaDayRankRewardConfig not found in bin');
  assert.ok(weeklyFound, 'CrossArenaWeeklyRankRewardConfig not found in bin');

  const patchedBuffer = Buffer.concat(chunks);
  fs.writeFileSync(filePath, patchedBuffer);
  console.log(`  -> Successfully wrote ${patchedBuffer.length} bytes to ${filePath}`);

  // Verify roundtrip
  const verifyTables = decodeTables(patchedBuffer);
  assert.strictEqual(verifyTables.length, tables.length, 'TABLE_COUNT_MISMATCH');
  const dayDecoded = verifyTables.find(t => t.name === 'CrossArenaDayRankRewardConfig');
  assert.deepStrictEqual(dayDecoded.value, newDayRewards, 'DAY_REWARD_VERIFY_FAILED');
  const weeklyDecoded = verifyTables.find(t => t.name === 'CrossArenaWeeklyRankRewardConfig');
  assert.deepStrictEqual(weeklyDecoded.value, newWeeklyRewards, 'WEEKLY_REWARD_VERIFY_FAILED');
  console.log('  -> Roundtrip verification PASSED!');
}

function updateJsonDumps() {
  const dayDumpPath = path.resolve('linhhoasu/lhs/newServer/scripts/_tables_dump/CrossArenaDayRankRewardConfig.json');
  if (fs.existsSync(dayDumpPath)) {
    const dayData = JSON.parse(fs.readFileSync(dayDumpPath, 'utf8'));
    dayData.data = newDayRewards;
    fs.writeFileSync(dayDumpPath, JSON.stringify(dayData, null, 2), 'utf8');
    console.log(`Updated dump JSON: ${dayDumpPath}`);
  }

  const weeklyDumpPath = path.resolve('linhhoasu/lhs/newServer/scripts/_tables_dump/CrossArenaWeeklyRankRewardConfig.json');
  if (fs.existsSync(weeklyDumpPath)) {
    const weeklyData = JSON.parse(fs.readFileSync(weeklyDumpPath, 'utf8'));
    weeklyData.data = newWeeklyRewards;
    fs.writeFileSync(weeklyDumpPath, JSON.stringify(weeklyData, null, 2), 'utf8');
    console.log(`Updated dump JSON: ${weeklyDumpPath}`);
  }
}

function main() {
  const serverBin = path.resolve('linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin');
  const clientBin = path.resolve('linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin');

  patchBinaryFile(serverBin);
  patchBinaryFile(clientBin);
  updateJsonDumps();

  console.log('\n>>> PATCHING COMPLETED SUCCESSFULLY! <<<');
}

main();

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const assert = require('assert');
const { BinJsonUtil, ByteArray } = require('../../linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');

// Bảng Quà Ngày Võ Đạo Hội mới (ArenaDayRankRewardConfig)
const newArenaDayRewards = {
  "1": {
    "id": 1, "rankMin": 1, "rankMax": 1, "rankShow": "1",
    "rewards": [
      { "id": 7, "count": 50 },
      { "id": 1, "count": 200000 },
      { "id": 90077, "count": 10 }
    ]
  },
  "2": {
    "id": 2, "rankMin": 2, "rankMax": 2, "rankShow": "2",
    "rewards": [
      { "id": 7, "count": 40 },
      { "id": 1, "count": 160000 },
      { "id": 90077, "count": 8 }
    ]
  },
  "3": {
    "id": 3, "rankMin": 3, "rankMax": 3, "rankShow": "3",
    "rewards": [
      { "id": 7, "count": 30 },
      { "id": 1, "count": 120000 },
      { "id": 90077, "count": 5 }
    ]
  },
  "4": {
    "id": 4, "rankMin": 4, "rankMax": 4, "rankShow": "4",
    "rewards": [
      { "id": 7, "count": 20 },
      { "id": 1, "count": 80000 },
      { "id": 90077, "count": 3 }
    ]
  },
  "5": {
    "id": 5, "rankMin": 5, "rankMax": 5, "rankShow": "5",
    "rewards": [
      { "id": 7, "count": 16 },
      { "id": 1, "count": 50000 },
      { "id": 90077, "count": 3 }
    ]
  },
  "6": {
    "id": 6, "rankMin": 6, "rankMax": 10, "rankShow": "6-10",
    "rewards": [
      { "id": 7, "count": 10 },
      { "id": 1, "count": 50000 },
      { "id": 90077, "count": 3 }
    ]
  },
  "7": {
    "id": 7, "rankMin": 11, "rankMax": 20, "rankShow": "11-20",
    "rewards": [
      { "id": 7, "count": 6 },
      { "id": 1, "count": 50000 },
      { "id": 90077, "count": 2 }
    ]
  },
  "8": {
    "id": 8, "rankMin": 21, "rankMax": 50, "rankShow": "21-50",
    "rewards": [
      { "id": 7, "count": 4 },
      { "id": 1, "count": 50000 },
      { "id": 90077, "count": 2 }
    ]
  },
  "9": {
    "id": 9, "rankMin": 51, "rankMax": 500, "rankShow": "51-500",
    "rewards": [
      { "id": 7, "count": 2 },
      { "id": 1, "count": 10000 },
      { "id": 90077, "count": 2 }
    ]
  },
  "10": {
    "id": 10, "rankMin": 501, "rankMax": 9999, "rankShow": "501+",
    "rewards": [
      { "id": 7, "count": 1 },
      { "id": 1, "count": 10000 },
      { "id": 90077, "count": 2 }
    ]
  }
};

// Bảng Quà Tuần Võ Đạo Hội mới (ArenaWeeklyRankRewardConfig)
const newArenaWeeklyRewards = {
  "1": {
    "id": 1, "rankMin": 1, "rankMax": 1, "rankShow": "1",
    "rewards": [
      { "id": 11201, "count": 1 },
      { "id": 8, "count": 50 },
      { "id": 1, "count": 2000000 },
      { "id": 90077, "count": 20 }
    ]
  },
  "2": {
    "id": 2, "rankMin": 2, "rankMax": 2, "rankShow": "2",
    "rewards": [
      { "id": 8, "count": 40 },
      { "id": 1, "count": 1500000 },
      { "id": 90077, "count": 16 }
    ]
  },
  "3": {
    "id": 3, "rankMin": 3, "rankMax": 3, "rankShow": "3",
    "rewards": [
      { "id": 8, "count": 30 },
      { "id": 1, "count": 1000000 },
      { "id": 90077, "count": 10 }
    ]
  },
  "4": {
    "id": 4, "rankMin": 4, "rankMax": 4, "rankShow": "4",
    "rewards": [
      { "id": 8, "count": 25 },
      { "id": 1, "count": 800000 },
      { "id": 90077, "count": 6 }
    ]
  },
  "5": {
    "id": 5, "rankMin": 5, "rankMax": 5, "rankShow": "5",
    "rewards": [
      { "id": 8, "count": 25 },
      { "id": 1, "count": 600000 },
      { "id": 90077, "count": 6 }
    ]
  },
  "6": {
    "id": 6, "rankMin": 6, "rankMax": 10, "rankShow": "6-10",
    "rewards": [
      { "id": 8, "count": 20 },
      { "id": 1, "count": 400000 },
      { "id": 90077, "count": 6 }
    ]
  },
  "7": {
    "id": 7, "rankMin": 11, "rankMax": 20, "rankShow": "11-20",
    "rewards": [
      { "id": 8, "count": 20 },
      { "id": 1, "count": 300000 },
      { "id": 90077, "count": 4 }
    ]
  },
  "8": {
    "id": 8, "rankMin": 21, "rankMax": 50, "rankShow": "21-50",
    "rewards": [
      { "id": 8, "count": 18 },
      { "id": 1, "count": 200000 },
      { "id": 90077, "count": 4 }
    ]
  },
  "9": {
    "id": 9, "rankMin": 51, "rankMax": 500, "rankShow": "51-500",
    "rewards": [
      { "id": 8, "count": 15 },
      { "id": 1, "count": 100000 },
      { "id": 90077, "count": 4 }
    ]
  },
  "10": {
    "id": 10, "rankMin": 501, "rankMax": 9999, "rankShow": "501+",
    "rewards": [
      { "id": 8, "count": 10 },
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

  let dayFound = false, weekFound = false;

  for (const table of tables) {
    if (table.name === 'ArenaDayRankRewardConfig') {
      dayFound = true;
      chunks.push(makeChunk(table.name, newArenaDayRewards));
    } else if (table.name === 'ArenaWeeklyRankRewardConfig') {
      weekFound = true;
      chunks.push(makeChunk(table.name, newArenaWeeklyRewards));
    } else {
      chunks.push(table.raw);
    }
  }

  assert.ok(dayFound, 'ArenaDayRankRewardConfig not found in ' + filePath);
  assert.ok(weekFound, 'ArenaWeeklyRankRewardConfig not found in ' + filePath);

  const patchedBuffer = Buffer.concat(chunks);
  fs.writeFileSync(filePath, patchedBuffer);
  console.log(`  -> Successfully wrote ${patchedBuffer.length} bytes to ${filePath}`);

  // Verify roundtrip
  const verifyTables = decodeTables(patchedBuffer);
  assert.strictEqual(verifyTables.length, tables.length, 'TABLE_COUNT_MISMATCH');
  const d = verifyTables.find(t => t.name === 'ArenaDayRankRewardConfig');
  assert.strictEqual(d.value[1].rewards.find(r => r.id === 1).count, 200000);
  assert.strictEqual(d.value[1].rewards.find(r => r.id === 90077).count, 10);
  const w = verifyTables.find(t => t.name === 'ArenaWeeklyRankRewardConfig');
  assert.strictEqual(w.value[1].rewards.find(r => r.id === 1).count, 2000000);
  assert.strictEqual(w.value[1].rewards.find(r => r.id === 90077).count, 20);
  console.log('  -> Roundtrip verification PASSED!');
}

function updateJsonDumps() {
  const dumps = [
    { file: 'ArenaDayRankRewardConfig.json', data: newArenaDayRewards },
    { file: 'ArenaWeeklyRankRewardConfig.json', data: newArenaWeeklyRewards },
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
  console.log('\n>>> PATCHED ARENA REWARDS (VÕ ĐẠO HỘI) SUCCESSFULLY! <<<');
}

main();

'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { BinJsonUtil, ByteArray } = require('../../linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');

console.log('>>> BẮT ĐẦU VÁ PHẦN THƯỞNG 8 HOẠT ĐỘNG MINIGAME <<<');

const BIN_FILES = [
  path.resolve('linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin'),
  path.resolve('linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin'),
  path.resolve('linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin'),
  path.resolve('linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin'),
];

const BASE_TABLES = [
  'RebornSimBaseConfig',
  'SoldierDefenseBaseConfig',
  'RelationshipNetBaseConfig',
  'RotateKnifeBaseConfig',
  'SurviveBaseConfig',
  'HeroRoadBaseConfig',
  'ExorciseBaseConfig',
  'ShootDefenseBaseConfig'
];

const CHAPTER_TABLES = [
  'RebornSimChapterConfig',
  'SoldierDefenseChapterConfig',
  'RelationshipNetChapterConfig',
  'RotateKnifeLevelConfig',
  'SurviveRepeatRewardConfig',
  'HeroRoadLevelConfig',
  'ExorciseChapterConfig',
  'ShootDefenseChapterConfig'
];

// 1. Backup binaries
const backupDir = path.resolve('_ai_workbench/backups/minigame_rewards_local_pre_' + Date.now());
fs.mkdirSync(backupDir, { recursive: true });
for (const b of BIN_FILES) {
    if (fs.existsSync(b)) {
        const dest = path.join(backupDir, path.basename(b) + '_' + path.basename(path.dirname(path.dirname(path.dirname(path.dirname(b))))));
        fs.copyFileSync(b, dest);
    }
}
console.log('  Đã tạo backup tại:', backupDir);

function patchTableData(tableName, data) {
    if (BASE_TABLES.includes(tableName)) {
        // Daily rewards: 50 Bánh bao (id: 4)
        data.dailyRewards = [{ id: 4, count: 50 }];
        return true;
    }
    if (CHAPTER_TABLES.includes(tableName)) {
        // Clear rewards: 1000 Nguyên bảo (id: 1) cho toàn bộ các ải
        for (const key of Object.keys(data)) {
            const row = data[key];
            if (row && typeof row === 'object') {
                row.rewards = [{ id: 1, count: 1000 }];
            }
        }
        return true;
    }
    return false;
}

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
    console.log(`  Đang xử lý tệp binary: ${filePath}`);
    const input = fs.readFileSync(filePath);
    const tables = decodeTables(input);
    const chunks = [];
    let patchedCount = 0;

    for (const table of tables) {
        if (BASE_TABLES.includes(table.name) || CHAPTER_TABLES.includes(table.name)) {
            patchTableData(table.name, table.value);
            chunks.push(makeChunk(table.name, table.value));
            patchedCount++;
        } else {
            chunks.push(table.raw);
        }
    }

    assert.strictEqual(tables.length, chunks.length, 'TABLES_COUNT_MISMATCH');
    assert.strictEqual(patchedCount, BASE_TABLES.length + CHAPTER_TABLES.length, 'PATCHED_COUNT_MISMATCH');

    const finalBuf = Buffer.concat(chunks);
    fs.writeFileSync(filePath, finalBuf);
    console.log(`    [PASS] Đã vá chuẩn xác ${patchedCount} bảng (${tables.length} tổng bảng) trong: ${filePath}`);
}

for (const f of BIN_FILES) {
    if (fs.existsSync(f)) {
        patchBinaryFile(f);
    }
}

// 2. Update JSON dumps in scripts/_tables_dump/
const dumpDir = path.resolve('linhhoasu/lhs/newServer/scripts/_tables_dump');
if (fs.existsSync(dumpDir)) {
    for (const tName of [...BASE_TABLES, ...CHAPTER_TABLES]) {
        const jsonPath = path.join(dumpDir, tName + '.json');
        if (fs.existsSync(jsonPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
                patchTableData(tName, data);
                fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');
                console.log('  [PASS] Đã cập nhật JSON dump:', tName + '.json');
            } catch (err) {
                console.warn('  [WARN] Không thể cập nhật dump:', jsonPath, err.message);
            }
        }
    }
}

// 3. Update invest-game.js mapping for Game 4 base
const investGamePath = path.resolve('linhhoasu/lhs/newServer/src/handlers/invest-game.js');
let investGameCode = fs.readFileSync(investGamePath, 'utf8');
const oldLine16 = "4: { chapter: 'RotateKnifeLevelConfig', base: 'RelationshipNetBaseConfig', chapterIdKey: 'id', passKey: '' },";
const newLine16 = "4: { chapter: 'RotateKnifeLevelConfig', base: 'RotateKnifeBaseConfig', chapterIdKey: 'id', passKey: '' },";
if (investGameCode.includes(oldLine16)) {
    investGameCode = investGameCode.replace(oldLine16, newLine16);
    fs.writeFileSync(investGamePath, investGameCode, 'utf8');
    console.log('  [PASS] Đã cập nhật GAME_CFG[4].base -> RotateKnifeBaseConfig trong invest-game.js');
}

// 4. Update index.html translationVersion
const htmlPath = path.resolve('linhhoasu/webgame/game/index.html');
let htmlContent = fs.readFileSync(htmlPath, 'utf8');
const oldVer = "var translationVersion = '20260920_full_8_subgames_v1';";
const newVer = "var translationVersion = '20260920_minigame_rewards_v2';";
if (htmlContent.includes(oldVer)) {
    htmlContent = htmlContent.replace(oldVer, newVer);
    fs.writeFileSync(htmlPath, htmlContent, 'utf8');
    console.log('  [PASS] Đã nâng translationVersion lên 20260920_minigame_rewards_v2 trong index.html');
}

console.log('>>> VÁ PHẦN THƯỞNG MINIGAME HOÀN TẤT THÀNH CÔNG! <<<');

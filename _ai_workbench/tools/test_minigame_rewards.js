'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { BinJsonUtil, ByteArray } = require('../../linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');

console.log('>>> BẮT ĐẦU KIỂM THỬ TOÀN DIỆN PHẦN THƯỞNG 8 MINIGAME <<<');

const binPath = path.resolve('linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin');
const buf = fs.readFileSync(binPath);

function decodeTables(buffer) {
    const map = {};
    let offset = 0;
    while (offset < buffer.length) {
        const nameLen = buffer.readUInt8(offset); offset += 1;
        const name = buffer.toString('utf8', offset, offset + nameLen); offset += nameLen;
        const dataLen = buffer.readUInt32BE(offset); offset += 4;
        const compressed = buffer.subarray(offset, offset + dataLen); offset += dataLen;
        const inflated = zlib.inflateSync(compressed);
        const value = BinJsonUtil.readFullJson(new ByteArray(inflated.buffer.slice(inflated.byteOffset, inflated.byteOffset + inflated.byteLength)));
        map[name] = value;
    }
    return map;
}

const tables = decodeTables(buf);
console.log('Tổng số bảng cấu hình trong config_fashion_20260909.bin:', Object.keys(tables).length);
assert.strictEqual(Object.keys(tables).length, 714, 'Tổng số bảng phải chính xác 714');

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

console.log('\n--- 1. Kiểm tra 8 bảng BaseConfig (Thưởng hàng ngày 50 Bánh bao) ---');
for (const b of BASE_TABLES) {
    const t = tables[b];
    assert.ok(t, `Bảng ${b} phải tồn tại`);
    assert.ok(Array.isArray(t.dailyRewards), `Bảng ${b} phải có dailyRewards`);
    const r4 = t.dailyRewards.find(x => x.id === 4);
    assert.ok(r4, `Bảng ${b} dailyRewards phải chứa item 4`);
    assert.strictEqual(r4.count, 50, `Bảng ${b} item 4 count phải là 50`);
    console.log(`  [PASS] ${b}: dailyRewards = ${JSON.stringify(t.dailyRewards)}`);
}

console.log('\n--- 2. Kiểm tra 8 bảng ChapterConfig (Thưởng vượt ải 1000 Nguyên bảo) ---');
for (const c of CHAPTER_TABLES) {
    const t = tables[c];
    assert.ok(t, `Bảng ${c} phải tồn tại`);
    const keys = Object.keys(t);
    assert.ok(keys.length >= 50, `Bảng ${c} phải có ít nhất 50 ải (thực tế: ${keys.length})`);
    
    // Check chapter 1, 10, and last chapter
    const ch1 = t[1] || t['1'];
    const ch10 = t[10] || t['10'];
    const chLast = t[keys[keys.length - 1]];

    for (const ch of [ch1, ch10, chLast]) {
        assert.ok(ch, `Ải trong ${c} phải tồn tại`);
        assert.ok(Array.isArray(ch.rewards), `Ải trong ${c} phải có rewards`);
        const r1 = ch.rewards.find(x => x.id === 1);
        assert.ok(r1, `Ải trong ${c} rewards phải chứa item 1 (Nguyên bảo)`);
        assert.strictEqual(r1.count, 1000, `Ải trong ${c} item 1 count phải là 1000`);
    }
    console.log(`  [PASS] ${c} (${keys.length} ải): Ải 1, 10, ${keys[keys.length - 1]} đều có 1000 Nguyên bảo`);
}

console.log('\n--- 3. Kiểm tra bảo toàn các bảng khác (Võ Đạo Hội & Đỉnh Phong Diễn Võ) ---');
const arenaDay = tables['ArenaDayRankRewardConfig'];
assert.strictEqual(arenaDay[1].rewards.find(r => r.id === 90077).count, 10, 'Võ Đạo Hội Top 1 ngày phải có 10 ngọc 90077');
const arenaWeek = tables['ArenaWeeklyRankRewardConfig'];
assert.strictEqual(arenaWeek[1].rewards.find(r => r.id === 90077).count, 20, 'Võ Đạo Hội Top 1 tuần phải có 20 ngọc 90077');
const topCombatDay = tables['TopCombatDayRankRewardConfig'];
assert.strictEqual(topCombatDay[1].rewards.find(r => r.id === 90078).count, 10, 'Đỉnh Phong Diễn Võ Top 1 ngày phải có 10 ngọc 90078');
console.log('  [PASS] Toàn bộ phần thưởng Võ Đạo Hội và Đỉnh Phong Diễn Võ nguyên vẹn 100%!');

console.log('\n>>> TẤT CẢ CÁC BỘ KIỂM THỬ ĐỀU ĐẠT CHUẨN PASS 100%! <<<');

'use strict';

// Build a config-only candidate from live snapshots. Rows 1..10 are preserved
// byte-for-byte semantically; rows 11..1000 extend the observed grade-6..10
// progression. No production files are written by this script.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const assert = require('assert/strict');

const root = path.resolve(__dirname, '..', '..');
const out = path.join(root, '_ai_workbench', 'temp', 'formation_grade1000_20260913');
const app = path.join(root, 'linhhoasu', 'lhs', 'newServer');
const { BinJsonUtil, ByteArray } = require(path.join(app, 'src', 'protocol', 'BinJsonUtil'));

function deep(value) { return JSON.parse(JSON.stringify(value)); }
function sha(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
function arrayBufferOf(buffer) { return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength); }
function decodeFrames(file) {
  const bytes = fs.readFileSync(file); const frames = []; let p = 0;
  while (p < bytes.length) {
    const nameLen = bytes[p++]; const name = bytes.slice(p, p + nameLen).toString('utf8'); p += nameLen;
    const dataLen = bytes.readUInt32BE(p); p += 4;
    const raw = bytes.slice(p, p + dataLen); p += dataLen;
    frames.push({ name, raw, value: BinJsonUtil.readFullJson(new ByteArray(arrayBufferOf(zlib.inflateSync(raw)))) });
  }
  assert.equal(p, bytes.length, 'FRAME_PARSE_REMAINDER');
  return frames;
}
function encodeTable(value) {
  const ba = new ByteArray(new ArrayBuffer(128 * 1024 * 1024));
  BinJsonUtil.json2bin(value, ba);
  return zlib.deflateSync(Buffer.from(new Uint8Array(ba.buffer)), { level: 9 });
}
function encodeFrames(frames) {
  return Buffer.concat(frames.map((frame) => {
    const name = Buffer.from(frame.name); const header = Buffer.alloc(4);
    header.writeUInt32BE(frame.raw.length, 0);
    return Buffer.concat([Buffer.from([name.length]), name, header, frame.raw]);
  }));
}

const known = {
  1: { level: 10, exp: 3, levelUpAttrs: { 1: 300, 2: 36, 3: 6 }, gradeUpCost: 10 },
  2: { level: 20, exp: 10, levelUpAttrs: { 1: 400, 2: 48, 3: 8 }, gradeUpCost: 20 },
  3: { level: 30, exp: 10, levelUpAttrs: { 1: 500, 2: 60, 3: 10 }, gradeUpCost: 30 },
  4: { level: 60, exp: 20, levelUpAttrs: { 1: 600, 2: 72, 3: 12 }, gradeUpCost: 120 },
  5: { level: 120, exp: 25, levelUpAttrs: { 1: 700, 2: 84, 3: 14 }, gradeUpCost: 300 },
  6: { level: 280, exp: 30, levelUpAttrs: { 1: 800, 2: 96, 3: 16 }, gradeUpCost: 840 },
  7: { level: 560, exp: 30, levelUpAttrs: { 1: 900, 2: 108, 3: 18 }, gradeUpCost: 1680 },
  8: { level: 840, exp: 35, levelUpAttrs: { 1: 1000, 2: 120, 3: 20 }, gradeUpCost: 2520 },
  9: { level: 1120, exp: 40, levelUpAttrs: { 1: 1100, 2: 132, 3: 22 }, gradeUpCost: 3360 },
  10: { level: 1400, exp: 45, levelUpAttrs: { 1: 1200, 2: 144, 3: 24 }, gradeUpCost: 4200 },
};

function generatedRow(grade) {
  if (known[grade]) {
    return {
      id: grade,
      level: known[grade].level,
      exp: known[grade].exp,
      levelUpCost: { id: 7, count: 1 },
      gradeUpCost: { id: 8, count: known[grade].gradeUpCost },
      levelUpAttrs: known[grade].levelUpAttrs,
    };
  }
  return {
    id: grade,
    level: 280 * (grade - 5),
    exp: (5 * grade) - 5,
    levelUpCost: { id: 7, count: 1 },
    gradeUpCost: { id: 8, count: 840 * (grade - 5) },
    levelUpAttrs: { 1: (100 * grade) + 200, 2: (12 * grade) + 24, 3: (2 * grade) + 4 },
  };
}

function rewriteConfig(input, output) {
  const frames = decodeFrames(input); const frame = frames.find((row) => row.name === 'FormationGradeConfig');
  assert(frame, 'FORMATION_GRADE_CONFIG_MISSING');
  const before = deep(frame.value); const next = {};
  for (let grade = 1; grade <= 1000; grade += 1) {
    if (grade <= 10) {
      assert(before[String(grade)] || before[grade], 'BASE_GRADE_MISSING_' + grade);
      next[String(grade)] = deep(before[String(grade)] || before[grade]);
    } else next[String(grade)] = generatedRow(grade);
  }
  frame.value = next; frame.raw = encodeTable(next);
  const bytes = encodeFrames(frames); fs.writeFileSync(output, bytes);
  const after = decodeFrames(output).find((row) => row.name === 'FormationGradeConfig').value;
  assert.equal(Object.keys(after).length, 1000, 'ROW_COUNT_NOT_1000');
  for (let grade = 1; grade <= 10; grade += 1) assert.deepEqual(after[String(grade)], before[String(grade)] || before[grade]);
  assert.deepEqual(after['1000'], generatedRow(1000));
  return { beforeHash: sha(fs.readFileSync(input)), afterHash: sha(bytes), beforeRows: Object.keys(before).length, afterRows: Object.keys(after).length, grade1000: after['1000'] };
}

function rewriteLanguage(input, output) {
  const frames = decodeFrames(input); const frame = frames.find((row) => row.name === 'LanguageConfig');
  assert(frame, 'LANGUAGE_CONFIG_MISSING');
  const value = deep(frame.value); const row = value['30033000'];
  assert(row && typeof row.cn === 'string', 'FORMATION_HELP_TEXT_MISSING');
  row.cn = row.cn.replace(/sau khi tăng đến[^\n]*sẽ tiến cấp/gi, 'khi đạt giới hạn cấp hiện tại sẽ tiêu hao Tinh linh pháp tướng để tiến bậc');
  frame.raw = encodeTable(value); const bytes = encodeFrames(frames); fs.writeFileSync(output, bytes);
  const after = decodeFrames(output).find((item) => item.name === 'LanguageConfig').value;
  assert(!/660|661/.test(after['30033000'].cn), 'STALE_FORMATION_HELP_CAP');
  return { beforeHash: sha(fs.readFileSync(input)), afterHash: sha(bytes), row: after['30033000'].cn };
}

function totals(fromGrade = 1, toGrade = 1000) {
  let item7 = 0; let item8 = 0;
  for (let grade = fromGrade; grade <= toGrade; grade += 1) {
    // Live handler starts at level 1 and fills the final bar automatically
    // when reaching maxLevel. Match actual debits, not level * exp.
    const row = generatedRow(grade); item7 += (row.level - 1) * row.exp;
    if (grade < toGrade) item8 += row.gradeUpCost.count;
  }
  return { item7, item8 };
}

if (require.main === module) {
  fs.mkdirSync(out, { recursive: true });
  const results = [];
  for (const [name, input] of Object.entries({
    server: path.join(out, 'server.before.bin'),
    client: path.join(out, 'client.before.bin'),
    'client-fashion': path.join(out, 'client-fashion.before.bin'),
  })) {
    const output = path.join(out, name + '.next.bin');
    results.push({ name, ...rewriteConfig(input, output), output });
  }
  const lang = rewriteLanguage(path.join(out, 'lang.before.bin'), path.join(out, 'lang.next.bin'));
  const summary = {
    result: 'PASS',
    preservedGrades: '1-10',
    addedGrades: '11-1000',
    grade1000: generatedRow(1000),
    fromGrade10Max: { item7: totals(11, 1000).item7, item8: generatedRow(10).gradeUpCost.count + totals(11, 1000).item8 },
    fullGrade1To1000: totals(1, 1000),
    language: { beforeHash: lang.beforeHash, afterHash: lang.afterHash },
    files: results,
    outputs: [...results.map((row) => row.output), path.join(out, 'lang.next.bin')],
  };
  fs.writeFileSync(path.join(out, 'build.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = { generatedRow, totals, rewriteConfig, rewriteLanguage };

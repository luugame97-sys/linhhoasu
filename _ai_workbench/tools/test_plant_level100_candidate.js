'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { generateCandidate, VERSION, MAX_LEVEL } = require('./generate_plant_level100_candidate');

const inputPath = path.resolve(__dirname, '../../linhhoasu/lhs/newServer/scripts/_tables_dump/PlantLevelConfig.json');
const evidenceDir = path.resolve(__dirname, '../temp/plant_level100_candidate_20260923');
const candidatePath = path.join(evidenceDir, 'PlantLevelConfig.extended.json');
const reportPath = path.join(evidenceDir, 'verification.json');

function test(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
  } catch (error) {
    results.push({ name, pass: false, error: error.stack || String(error) });
  }
}

function loadCandidate() {
  const candidate = generateCandidate(inputPath);
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`, 'utf8');
  return candidate;
}

// Mirrors farm.js addFarmExpAndLevel without loading runtime services.  This
// is intentionally a pure fixture so no player or production state is touched.
function advance(rows, state, addExp) {
  const startLevel = state.level;
  let level = state.level;
  let exp = state.exp + Math.max(0, Math.floor(Number(addExp) || 0));
  while (rows[String(level)] && rows[String(level)].exp > 0 && exp >= rows[String(level)].exp) {
    exp -= rows[String(level)].exp;
    level += 1;
  }
  const levelUpCount = Math.max(0, level - startLevel);
  return { level, exp, levelUpCount, rewardItem33: levelUpCount };
}

const candidate = loadCandidate();
const rows = candidate.data;
const results = [];

test('candidate metadata and exact 1..100 row domain', () => {
  assert.equal(candidate.extension.version, VERSION);
  assert.equal(candidate._rows, MAX_LEVEL);
  assert.deepEqual(Object.keys(rows).map(Number), Array.from({ length: MAX_LEVEL }, (_, i) => i + 1));
  for (let level = 1; level <= MAX_LEVEL; level += 1) {
    assert.equal(rows[String(level)].level, level);
    assert.equal(Number.isSafeInteger(rows[String(level)].exp), true);
    assert.equal(rows[String(level)].pPlantFoodAdCount, 3);
  }
});

test('rows 1..39 preserve verified source thresholds', () => {
  const source = JSON.parse(fs.readFileSync(inputPath, 'utf8')).data;
  for (let level = 1; level <= 39; level += 1) {
    assert.deepEqual(rows[String(level)], source[String(level)] || source[level]);
  }
});

test('40->41 uses the last verified +150 step', () => {
  assert.equal(candidate.extension.inferredStep, 150);
  assert.equal(rows['40'].exp, 1400);
  assert.equal(rows['41'].exp, 1550);
});

test('extension thresholds are monotonic through 99 and terminal 100 is zero', () => {
  for (let level = 2; level < MAX_LEVEL; level += 1) {
    assert.ok(rows[String(level)].exp >= rows[String(level - 1)].exp);
  }
  for (let level = 40; level < 99; level += 1) {
    assert.equal(rows[String(level + 1)].exp - rows[String(level)].exp, 150);
  }
  assert.equal(rows['99'].exp, 10250);
  assert.equal(rows['100'].exp, 0);
});

test('39->40 boundary consumes cost and grants one level-up reward', () => {
  assert.deepEqual(advance(rows, { level: 39, exp: 1249 }, 1), {
    level: 40, exp: 0, levelUpCount: 1, rewardItem33: 1,
  });
});

test('40->41 boundary consumes newly activated row 40 cost', () => {
  assert.deepEqual(advance(rows, { level: 40, exp: 1399 }, 1), {
    level: 41, exp: 0, levelUpCount: 1, rewardItem33: 1,
  });
});

test('99->100 boundary reaches terminal and grants one reward', () => {
  assert.deepEqual(advance(rows, { level: 99, exp: 10249 }, 1), {
    level: 100, exp: 0, levelUpCount: 1, rewardItem33: 1,
  });
});

test('level 100 is terminal and retains extra EXP', () => {
  assert.deepEqual(advance(rows, { level: 100, exp: 0 }, 5000), {
    level: 100, exp: 5000, levelUpCount: 0, rewardItem33: 0,
  });
});

test('large EXP crossing 40..100 counts every transition once', () => {
  let required = 0;
  for (let level = 40; level < 100; level += 1) required += rows[String(level)].exp;
  const state = advance(rows, { level: 40, exp: 0 }, required);
  assert.deepEqual(state, {
    level: 100, exp: 0, levelUpCount: 60, rewardItem33: 60,
  });
});

const report = {
  result: results.every((row) => row.pass) ? 'PASS' : 'FAIL',
  version: VERSION,
  node: process.version,
  productionWrites: 0,
  candidatePath,
  tests: results,
};
fs.mkdirSync(evidenceDir, { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.result !== 'PASS') process.exitCode = 1;

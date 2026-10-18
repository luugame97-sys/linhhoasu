'use strict';

/*
 * Candidate-only Linh điền level extension.
 *
 * This file deliberately lives outside the runtime source tree.  The current
 * binary has PlantLevelConfig rows 1..40 and row 40 is terminal (exp: 0).
 * There is no official 41..100 table in the checked-in assets, so this script
 * makes the continuation policy explicit and reproducible instead of silently
 * changing production config.
 *
 * Policy (plant_level100_candidate_v1):
 *   - preserve rows 1..39 byte-for-byte (apart from normal JSON formatting);
 *   - infer the last verified positive step (row 39 - row 38 = 150);
 *   - use that step for the missing 40 -> 41 threshold and rows 41..99;
 *   - keep row 100 terminal with exp: 0;
 *   - keep pPlantFoodAdCount at the existing value (3) for generated rows.
 */

const fs = require('node:fs');
const path = require('node:path');

const VERSION = 'plant_level100_candidate_v1';
const MAX_LEVEL = 100;
const BASE_MAX_LEVEL = 40;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function asInt(value, field) {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error(`PLANT_LEVEL_BAD_${field}`);
  return n;
}

function readBaseRows(inputPath) {
  const raw = readJson(inputPath);
  const rows = raw && raw.data && typeof raw.data === 'object' ? raw.data : raw;
  validateBaseRows(rows);
  return { raw, rows };
}

function validateBaseRows(rows) {
  if (!rows || Array.isArray(rows)) throw new Error('PLANT_LEVEL_BASE_NOT_OBJECT');

  for (let level = 1; level <= BASE_MAX_LEVEL; level += 1) {
    const row = rows[level] || rows[String(level)];
    if (!row || asInt(row.level, 'LEVEL') !== level) {
      throw new Error(`PLANT_LEVEL_BASE_MISSING:${level}`);
    }
    asInt(row.exp, 'EXP');
  }
  const baseKeys = Object.keys(rows).map(Number).filter(Number.isFinite);
  if (baseKeys.some((level) => level < 1 || level > BASE_MAX_LEVEL)) {
    throw new Error('PLANT_LEVEL_BASE_HAS_UNEXPECTED_LEVEL');
  }
}

function extendRows(baseRows) {
  validateBaseRows(baseRows);
  const data = {};
  for (let level = 1; level <= BASE_MAX_LEVEL; level += 1) {
    data[String(level)] = clone(baseRows[level] || baseRows[String(level)]);
  }

  // Row 40 is terminal in the source table.  Use the last two positive rows
  // to infer the first extension threshold, without guessing from row 40=0.
  const previous = asInt(data['38'].exp, 'EXP');
  const last = asInt(data['39'].exp, 'EXP');
  const step = last - previous;
  if (previous <= 0 || last <= 0 || step <= 0) throw new Error('PLANT_LEVEL_LAST_STEP_INVALID');

  const foodAdCount = asInt(data['39'].pPlantFoodAdCount, 'FOOD_AD_COUNT');
  if (foodAdCount < 0) throw new Error('PLANT_LEVEL_FOOD_AD_COUNT_INVALID');

  let nextExp = last + step;
  data['40'] = { ...data['40'], level: 40, exp: nextExp };
  for (let level = 41; level < MAX_LEVEL; level += 1) {
    nextExp += step;
    data[String(level)] = {
      level,
      exp: nextExp,
      pPlantFoodAdCount: foodAdCount,
    };
  }
  data[String(MAX_LEVEL)] = {
    level: MAX_LEVEL,
    exp: 0,
    pPlantFoodAdCount: foodAdCount,
  };

  return {
    data,
    inferredStep: step,
  };
}

function generateCandidate(inputPath) {
  const { raw, rows: baseRows } = readBaseRows(inputPath);
  const extended = extendRows(baseRows);
  const data = extended.data;
  return {
    _table: 'PlantLevelConfig',
    _rows: MAX_LEVEL,
    _type: 'object',
    _firstKeys: 'level,exp,pPlantFoodAdCount',
    data,
    extension: {
      version: VERSION,
      baseMaxLevel: BASE_MAX_LEVEL,
      maxLevel: MAX_LEVEL,
      inferredStep: extended.inferredStep,
      terminalLevel: MAX_LEVEL,
      source: path.resolve(inputPath),
      sourceRows: raw && raw._rows != null ? raw._rows : BASE_MAX_LEVEL,
      policy: 'preserve_1_39_then_continue_last_positive_delta_150_until_99;100_terminal',
    },
  };
}

function main(argv = process.argv.slice(2)) {
  const defaultInput = path.resolve(__dirname, '../../linhhoasu/lhs/newServer/scripts/_tables_dump/PlantLevelConfig.json');
  const defaultOutput = path.resolve(__dirname, '../temp/plant_level100_candidate_20260923/PlantLevelConfig.extended.json');
  const inputPath = path.resolve(argv[0] || defaultInput);
  const outputPath = path.resolve(argv[1] || defaultOutput);
  const candidate = generateCandidate(inputPath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(candidate, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    output: outputPath,
    version: VERSION,
    maxLevel: MAX_LEVEL,
    inferredStep: candidate.extension.inferredStep,
    level40Exp: candidate.data['40'].exp,
    level41Exp: candidate.data['41'].exp,
    level99Exp: candidate.data['99'].exp,
    level100Exp: candidate.data['100'].exp,
  }, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {
  VERSION,
  MAX_LEVEL,
  BASE_MAX_LEVEL,
  extendRows,
  generateCandidate,
};

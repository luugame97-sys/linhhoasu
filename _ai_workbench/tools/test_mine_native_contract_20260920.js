'use strict';
const assert = require('node:assert/strict');
const validator = require('../temp/mine_fix_20260920/candidate/server/src/services/MineExitValidationService');

const blocks = {
  1: { shape: [[1], [1]], picTimeRes: ['x'] },
};
const base = {
  rocketheight: 12,
  boomCenter: [-2, -2],
  boomShape: Array.from({ length: 5 }, () => [1, 1, 1, 1, 1]),
};

const level = {
  meter: 6,
  playerMeter: 3,
  playerCol: 3,
  finish: false,
  blocks: [{ uid: 1, id: 1, status: 0, meter: 5, col: 3 }],
};
const nativePath = [
  { meter: 3, col: 3 },
  { meter: 3, col: 4 },
  { meter: 4, col: 4 },
  { meter: 5, col: 4 },
];
const valid = validator.validateDig(level, { deep: 1 }, blocks,
  { meter: 5, col: 3 }, nativePath, 55, base);
assert.equal(valid.valid, true);
assert.equal(valid.targetUid, 1);
assert.deepEqual(valid.affectedUids, [1]);

const forged = validator.validateDig(level, { deep: 1 }, blocks,
  { meter: 5, col: 3 }, [{ meter: 3, col: 3 }, { meter: 5, col: 3 }], 55, base);
assert.equal(forged.valid, false);
assert.equal(forged.code, 'MINE_DIG_PATH_BLOCKED');

const type3 = validator.validateDig(level, { deep: 1 }, blocks,
  { meter: 5, col: 3 }, [{ meter: 3, col: 3 }], 55, base);
assert.equal(type3.valid, true);

const bombLevel = {
  meter: 6,
  playerMeter: 3,
  playerCol: 3,
  finish: false,
  blocks: [
    { uid: 1, id: 1, status: 0, meter: 5, col: 3 },
    { uid: 2, id: 1, status: 0, meter: 5, col: 4 },
  ],
};
const bomb = validator.validateDig(bombLevel, { deep: 1 }, blocks,
  { meter: 5, col: 3 }, [], 58, base);
assert.equal(bomb.valid, true);
assert.deepEqual(bomb.affectedUids, [1, 2]);

const rocketLevel = {
  meter: 30,
  playerMeter: 30,
  playerCol: 3,
  finish: false,
  blocks: [{ uid: 1, id: 1, status: 1, meter: 20, col: 3 }],
};
const rocket = validator.validateDig(rocketLevel, { deep: 1 }, blocks,
  { meter: 20, col: 3 }, [], 59, base);
assert.equal(rocket.valid, true);

console.log(JSON.stringify({ result: 'PASS', checks: 7, productionWrites: 0 }));

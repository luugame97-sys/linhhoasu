'use strict';
const assert = require('node:assert/strict');
const config = require('../src/services/ConfigService');
const battle = require('../src/services/BattleService');
const attrs = config.get('AttrConfig');
function power(value) { return Object.entries(value).reduce((n, [k, v]) => n + Number(v) * Number(attrs[k]?.power || 0), 0); }
function base() { return { level: 1, roleInfo: { stage: 1 }, swordInfo: { equippedUid: 0, data: [], swordBond: [] } }; }
const quality = Object.keys(config.get('SwordLevelConfig')).map(Number).sort((a, b) => a - b)[0];
const asset = Object.values(config.get('AssetsConfig')).find(row => Number(row.quality) === quality && config.get('SwordLevelConfig')[quality]);
assert(asset, 'mount asset fixture missing');
const level = Math.min(2, Object.keys(config.get('SwordLevelConfig')[quality]).map(Number).sort((a, b) => a - b).pop());
const star = Math.min(1, Object.keys(config.get('SwordStarLevelConfig')[quality]).map(Number).sort((a, b) => a - b).pop());
const mount = { uid: 77, id: asset.id, level, star, skills: [], attrs: { 1: 999999999, 2: 999999999 } };
const p = base(); p.swordInfo = { equippedUid: 77, data: [mount], swordBond: [] };
const actual = battle.calcPlayerPower(p);
const noMount = battle.calcPlayerPower(base());
const levelRow = config.get('SwordLevelConfig')[quality][level] || config.get('SwordLevelConfig')[String(quality)][String(level)];
const starRow = config.get('SwordStarLevelConfig')[quality][star] || config.get('SwordStarLevelConfig')[String(quality)][String(star)];
const hpRate = Number(levelRow.attrs[51] || 0) + Number(starRow.attrs[51] || 0);
assert.equal(actual[1], noMount[1] + Math.floor(noMount[1] * hpRate / 10000));
assert(actual[1] < 1000000, 'legacy cached mount attrs leaked into HP');
const invalid = base(); invalid.swordInfo = { equippedUid: 999, data: [mount], swordBond: [] };
assert.deepEqual(battle.calcPlayerPower(invalid), battle.calcPlayerPower(base()), 'invalid selected UID must not equip first row');
console.log(JSON.stringify({ result: 'PASS', quality, level, star, mountDeltaHp: actual[1] - noMount[1], productionWrites: 0 }));

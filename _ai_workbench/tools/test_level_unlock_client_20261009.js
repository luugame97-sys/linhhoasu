'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(
  process.env.LEVEL_UNLOCK_CLIENT_CANDIDATE
    || path.resolve(__dirname, '../temp/day_gate_sync_20261009/candidate/lhs-feature-day1-v1.js'),
  'utf8',
);

const tables = {
  SystemConfig: {
    209: { id: 209, conditions: [{ type: 2, value: 90021, cond: 4 }] },
    216: { id: 216, conditions: [{ type: 2, value: 90003, cond: 4 }] },
    219: { id: 219, conditions: [{ type: 3, value: 95, cond: 4 }, { type: 5, value: 15, cond: 4 }] },
    220: { id: 220, conditions: [{ type: 3, value: 110, cond: 4 }, { type: 5, value: 29, cond: 4 }] },
    222: { id: 222, conditions: [{ type: 3, value: 130, cond: 4 }, { type: 5, value: 36, cond: 4 }] },
    315: { id: 315, conditions: [{ type: 3, value: 9999, cond: 4 }] },
  },
  ElfFieldConfig: {},
  ValhallaFieldConfig: {},
  ValhallaConfig: {},
  FashionConfig: {},
  FashionColorConfig: {},
  FashionChangeColorConfig: {},
  FashionBathConfig: {},
  FashionEndDressConfig: {},
  FashionDressConfig: {},
  FashionDressLevelConfig: {},
  FashionBgConfig: {},
  FashionBubbleConfig: {},
  FishSceneConfig: {},
  GuildBattleConfig: {},
};

const window = {
  GlobalManager: { Config: tables },
  setTimeout,
  clearTimeout,
  console: { info() {}, error() {} },
};
vm.runInNewContext(source, { window, setTimeout, clearTimeout, console }, { filename: 'lhs-feature-day1-v1.js' });

assert.equal(JSON.stringify(tables.SystemConfig[209].conditions), JSON.stringify([{ type: 3, value: 100, cond: 4 }]));
assert.equal(JSON.stringify(tables.SystemConfig[216].conditions), JSON.stringify([{ type: 3, value: 100, cond: 4 }]));
assert.equal(JSON.stringify(tables.SystemConfig[219].conditions), JSON.stringify([{ type: 3, value: 95, cond: 4 }]));
assert.equal(JSON.stringify(tables.SystemConfig[220].conditions), JSON.stringify([{ type: 3, value: 110, cond: 4 }]));
assert.equal(JSON.stringify(tables.SystemConfig[222].conditions), JSON.stringify([{ type: 3, value: 130, cond: 4 }]));
assert.equal(JSON.stringify(tables.SystemConfig[315].conditions), JSON.stringify([{ type: 3, value: 9999, cond: 4 }]));
assert.equal(window.LhsFeatureDay1V1.policy.version, '20261009_level_unlock_v2');
assert.equal(JSON.stringify(window.LhsFeatureDay1V1.policy.dayGateIgnoredSystems), JSON.stringify([219, 220, 222]));

console.log(JSON.stringify({
  result: 'PASS',
  systems: [209, 216, 219, 220, 222],
  level: 100,
  preserved315: true,
  productionWrites: 0,
  networkAttempts: 0,
}));


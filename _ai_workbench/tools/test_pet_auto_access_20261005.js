'use strict';
const assert = require('assert');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const app = process.env.FEATURE_APP || path.join(root, 'linhhoasu/lhs/newServer');
const config = require(path.join(app, 'src/services/ConfigService'));
const policy = require(path.join(app, 'src/config/petAutoAccess'));
const clone = data => JSON.parse(JSON.stringify(data));
const actual = config.get('SystemConfig');
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }
check('effective automatic compose uses pet board conditions and day zero', () => {
  assert.deepStrictEqual(actual[229].conditions, actual[206].conditions);
  assert.strictEqual(actual[229].openDay, 0);
});
const tables = { SystemConfig: clone(actual) };
// Preflight old day57 gate. Keep all unrelated current fields as the fixture.
tables.SystemConfig[229].openDay = 57;
// Synthetic different condition proves the overlay actually copies the board
// condition. This value is not asserted to be the historical live condition.
tables.SystemConfig[229].conditions = [{ type: 2, value: 10001, cond: 4 }];
const before = clone(tables);
policy.apply(tables);
check('only automatic compose condition/day change', () => {
  const expected = clone(before);
  expected.SystemConfig[229].conditions = clone(before.SystemConfig[206].conditions || []);
  expected.SystemConfig[229].openDay = before.SystemConfig[206].openDay || 0;
  assert.deepStrictEqual(tables, expected);
});
check('board remains a requirement and conditions are independently cloned', () => {
  assert(tables.SystemConfig[229].conditions.length > 0);
  assert.notStrictEqual(tables.SystemConfig[229].conditions, tables.SystemConfig[206].conditions);
  tables.SystemConfig[229].conditions[0].value = -1;
  assert.deepStrictEqual(tables.SystemConfig[206], before.SystemConfig[206]);
});
check('policy is idempotent and missing board fails before mutation', () => {
  policy.apply(tables); const stable = clone(tables); policy.apply(tables);
  assert.deepStrictEqual(tables, stable);
  const missing = clone(before); delete missing.SystemConfig[206]; const initial = clone(missing);
  assert.throws(() => policy.apply(missing), /PET_AUTO_ACCESS_CONFIG_MISSING/);
  assert.deepStrictEqual(missing, initial);
});
console.log(JSON.stringify({ checks, mode: 'RAM_ONLY', playerWrites: 0, purchasesSent: 0 }));

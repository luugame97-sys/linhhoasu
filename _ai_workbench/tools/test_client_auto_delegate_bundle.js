'use strict';

const assert = require('assert');
const fs = require('fs');

const filePath = process.argv[2];
if (!filePath) throw new Error('usage: test_client_auto_delegate_bundle.js <main.js>');
const source = fs.readFileSync(filePath, 'utf8');

function count(marker) {
  return source.split(marker).length - 1;
}

const markers = {
  autoFlow: 'autoDelegateEquip=function',
  safeEquipRequest: 'autoDelegate:!0',
  safeSaleRequest: 'autoDelegate:!!(U9.isOpen&&U9.autoConfig.autoDelegate)',
  label: 'Tự mặc đồ mạnh, bán đồ yếu',
  protectedStop: '[LHS] AutoDelegate protected equips',
};

Object.entries(markers).forEach(([name, marker]) => {
  assert.strictEqual(count(marker), 1, `${name} marker must occur exactly once`);
});

assert.ok(
  source.includes('c>u&&(!p||c>YV.calPower(p))'),
  'client must select only a strict power upgrade',
);
assert.ok(!source.includes('this.autoDelegateBox'), 'auto delegate must use the visible native power checkbox');
assert.ok(
  source.includes('else o.push(e);g()'),
  'failed auto-equip must fall back to manual review',
);
assert.ok(
  source.includes('0<o.length?n.openHeroReplaceView(t,o):t.changeState(2)'),
  'protected/manual items must still stop delegation for review',
);

console.log(JSON.stringify({ result: 'ok', bytes: Buffer.byteLength(source), markers }));

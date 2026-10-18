'use strict';

/** Read-only production-catalog gate for the P0 recharge candidate. */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { BinJsonUtil, ByteArray } = require('../../linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function decode(file) {
  const buffer = fs.readFileSync(file);
  const input = new ByteArray(buffer);
  const tables = {};
  while (input.position < input.length) {
    const nameLength = input.readUnsignedByte();
    const tableName = input.readUTFBytes(nameLength);
    const dataLength = input.readUnsignedInt();
    assert(dataLength >= 0 && input.position + dataLength <= input.length, `invalid table length: ${tableName}`);
    const raw = buffer.subarray(input.position, input.position + dataLength);
    input.position += dataLength;
    tables[tableName] = BinJsonUtil.readFullJson(new ByteArray(zlib.inflateSync(raw)));
  }
  return tables;
}

function row(table, id) {
  return table && (table[id] || table[String(id)]);
}

function validRewards(value) {
  return Array.isArray(value)
    && value.length > 0
    && value.every((item) => Number(item && item.id) > 0 && Number(item && item.count) > 0);
}

function main() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const index = args.indexOf(flag);
    return index >= 0 ? path.resolve(args[index + 1]) : '';
  };
  const configPath = get('--config');
  const itemPath = get('--item');
  const commercePath = get('--commerce');
  assert(configPath && itemPath && commercePath, 'missing --config/--item/--commerce');
  const tables = decode(configPath);
  assert.strictEqual(Object.keys(tables).length, 714, 'table count drifted');
  const pay = tables.PayConfig || {};
  const shop = tables.ShopConfig || {};
  const paidRows = Object.values(shop).filter((value) => Number(value && value.payId) > 0);
  assert.strictEqual(Object.keys(pay).length, 694, 'PayConfig count drifted');
  assert.strictEqual(paidRows.length, 614, 'pay-linked ShopConfig count drifted');

  const monthIds = [11000001, 11000002, 11000007, 11000009, 11000012];
  for (const id of monthIds) {
    assert(validRewards(row(shop, id) && row(shop, id).extraRewards), `month daily rewards missing: ${id}`);
  }
  assert(row(shop, 11000008), 'legacy card 11000008 disappeared unexpectedly');

  const chainExpected = { 50001: 10, 50010: 14 };
  for (const [id, expectedCount] of Object.entries(chainExpected)) {
    const steps = Object.values(row(tables.ShopGiftConfig, id) || {});
    assert.strictEqual(steps.length, expectedCount, `chain step count drifted: ${id}`);
    assert.deepStrictEqual(
      steps.map((step) => Number(step.index)).sort((a, b) => a - b),
      Array.from({ length: expectedCount }, (_unused, index) => index + 1),
      `chain indices drifted: ${id}`
    );
    assert(steps.every((step) => [1, 2, 3].includes(Number(step.type))), `chain type invalid: ${id}`);
    assert(steps.every((step) => validRewards(step.rewards)), `chain rewards invalid: ${id}`);
  }

  const itemSource = fs.readFileSync(itemPath, 'utf8');
  const commerceSource = fs.readFileSync(commercePath, 'utf8');
  assert.strictEqual((itemSource.match(/PAID_USE_RECHARGE_PATH/g) || []).length, 1, 'paid-route guard marker mismatch');
  for (const marker of [
    'KNOWN_MONTH_CARD_IDS',
    'getGmt8DayKey',
    'chainCompleted',
    'SHOP_GIFT_TYPE_AD',
    'SHOP_GIFT_TYPE_FREE',
  ]) {
    assert(commerceSource.includes(marker), `commerce marker missing: ${marker}`);
  }

  console.log(JSON.stringify({
    result: 'ok',
    readOnly: true,
    tables: Object.keys(tables).length,
    payConfigRows: Object.keys(pay).length,
    paidShopRows: paidRows.length,
    monthIds,
    chainSteps: chainExpected,
    hashes: {
      config: sha256(configPath),
      item: sha256(itemPath),
      commerce: sha256(commercePath),
    },
  }));
}

main();

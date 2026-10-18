#!/usr/bin/env node
/* Read-only scanner for the Fortune/Lucky package config and protocol clues. */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { BinJsonUtil, ByteArray } = require('../../linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');

function parse(file) {
  const buffer = fs.readFileSync(file);
  const input = new ByteArray(buffer);
  const tables = {};
  while (input.position < input.length) {
    const nameLen = input.readByte();
    const name = input.readUTFBytes(nameLen);
    const dataLen = input.readUnsignedInt();
    const raw = buffer.slice(input.position, input.position + dataLen);
    input.position += dataLen;
    try {
      const inflated = zlib.inflateSync(raw);
      tables[name] = BinJsonUtil.readFullJson(new ByteArray(inflated.buffer));
    } catch (_) {}
  }
  return tables;
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function containsReward(value, id, count) {
  if (Array.isArray(value)) {
    return value.some((row) => isObject(row) && safeNumber(row.id) === id && safeNumber(row.count) === count);
  }
  return false;
}

function summarize(value) {
  if (!isObject(value)) return value;
  const keep = {};
  const keys = [
    'id', 'index', 'type', 'subType', 'activityId', 'activityType', 'group', 'groupId',
    'shopId', 'payId', 'name', 'title', 'desc', 'price', 'priceR', 'limit', 'limitType',
    'dayLimit', 'dailyLimit', 'buyLimit', 'count', 'free', 'isFree', 'tag', 'protocol',
    'rewards', 'reward', 'items', 'goods', 'gift', 'trigger', 'duration',
  ];
  keys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(value, key)) keep[key] = value[key];
  });
  return keep;
}

function rowEntries(table) {
  if (Array.isArray(table)) return table.map((value, index) => [String(index), value]);
  if (isObject(table)) return Object.entries(table);
  return [];
}

function scan(tables) {
  const matches = [];
  const candidateTables = [];
  for (const [tableName, table] of Object.entries(tables)) {
    if (/luck|fortune|qiyun|yunshi|activity60|gift|pack|shop/i.test(tableName)) {
      candidateTables.push({ table: tableName, rows: rowEntries(table).length });
    }
    for (const [key, row] of rowEntries(table)) {
      if (!isObject(row)) continue;
      const arrays = Object.entries(row).filter(([, value]) => Array.isArray(value));
      const rewardFields = arrays.filter(([, value]) => containsReward(value, 4, 10)).map(([name]) => name);
      const hasPrice30or68 = [row.price, row.priceR, row.rmb, row.money].some((value) => [30, 68].includes(safeNumber(value)));
      const text = JSON.stringify(row);
      const hasBaozi10 = rewardFields.length > 0 || /(?:"id":4[^\]}]{0,80}"count":10|"count":10[^\]}]{0,80}"id":4)/.test(text);
      const hasDailyOne = [row.limit, row.dayLimit, row.dailyLimit, row.buyLimit, row.count].some((value) => safeNumber(value) === 1);
      if (hasBaozi10 || (hasPrice30or68 && hasDailyOne)) {
        matches.push({
          table: tableName,
          key,
          rewardFields,
          hasPrice30or68,
          hasDailyOne,
          row: summarize(row),
          fullRow: row,
        });
      }
    }
  }
  return { candidateTables: candidateTables.sort((a, b) => a.table.localeCompare(b.table)), matches };
}

const [configFile, languageFile, outputFile] = process.argv.slice(2);
if (!configFile || !languageFile || !outputFile) {
  console.error('usage: scan_fortune_package_config.js CONFIG_BIN LANG_BIN OUTPUT_JSON');
  process.exit(2);
}
const configTables = parse(path.resolve(configFile));
const languageTables = parse(path.resolve(languageFile));
const referencesToFortuneShop = [];
for (const [table, value] of Object.entries(configTables)) {
  for (const [key, row] of rowEntries(value)) {
    const serialized = JSON.stringify(row);
    if (serialized.includes('11018000') || serialized.includes('11018001') || serialized.includes('221018000')) {
      referencesToFortuneShop.push({ table, key, row });
    }
  }
}
const languageHits = [];
for (const [table, value] of Object.entries(languageTables)) {
  for (const [key, row] of rowEntries(value)) {
    const text = typeof row === 'string' ? row : JSON.stringify(row);
    if (/vận (?:may|thế)|气运|运势|幸运|miễn phí|每日限购|限购.*1/i.test(text)) {
      languageHits.push({ table, key, value: row });
    }
  }
}
const result = {
  generatedAt: new Date().toISOString(),
  readOnly: true,
  configFile: path.resolve(configFile),
  languageFile: path.resolve(languageFile),
  configTableCount: Object.keys(configTables).length,
  languageTableCount: Object.keys(languageTables).length,
  ...scan(configTables),
  languageHits,
  referencesToFortuneShop,
  exactFortuneRows: {
    shop: Object.fromEntries([11018000, 11018001, 11018002, 11018003, 11018004, 11018005, 11018006]
      .map((id) => [String(id), (configTables.ShopConfig || {})[id] || null])),
    pay: Object.fromEntries([11018000, 11018001, 11018002, 11018003, 11018004, 11018005, 11018006]
      .map((id) => [String(id), (configTables.PayConfig || {})[id] || null])),
  },
};
fs.mkdirSync(path.dirname(path.resolve(outputFile)), { recursive: true });
fs.writeFileSync(path.resolve(outputFile), JSON.stringify(result, null, 2));
console.log(JSON.stringify({
  output: path.resolve(outputFile),
  configTableCount: result.configTableCount,
  candidateTableCount: result.candidateTables.length,
  matchCount: result.matches.length,
  languageHitCount: result.languageHits.length,
}, null, 2));

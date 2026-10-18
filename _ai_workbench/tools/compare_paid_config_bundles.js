'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const root = path.resolve(__dirname, '../temp/paid_package_server_prod_20260901_093824/linhhoasu');
const protocol = require(path.resolve(__dirname, '../../linhhoasu/lhs/newServer/src/protocol/BinJsonUtil'));
const { BinJsonUtil, ByteArray } = protocol;
function decode(file) {
  const buffer = fs.readFileSync(file); const out = {}; let offset = 0;
  while (offset < buffer.length) {
    const n = buffer.readUInt8(offset++); const name = buffer.toString('utf8', offset, offset + n); offset += n;
    const len = buffer.readUInt32BE(offset); offset += 4; const raw = buffer.subarray(offset, offset + len); offset += len;
    const inflated = zlib.inflateSync(raw); const ab = inflated.buffer.slice(inflated.byteOffset, inflated.byteOffset + inflated.byteLength);
    out[name] = BinJsonUtil.readFullJson(new ByteArray(ab));
  }
  return out;
}
function hash(v) { return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex'); }
const serverFile = path.join(root, 'lhs/update/resource/assets/excel/config_e5ac72c2.bin');
const clientFile = path.join(root, 'webgame/game/update/resource/assets/excel/config_e5ac72c2.bin');
const server = decode(serverFile), client = decode(clientFile);
const names = [...new Set([...Object.keys(server), ...Object.keys(client)])].sort();
const allDiff = names.filter((n) => hash(server[n]) !== hash(client[n]));
const paidPattern = /pay|shop|gift|privilege|recharge|activity/i;
const paidDiff = allDiff.filter((n) => paidPattern.test(n));
const result = { serverTables: Object.keys(server).length, clientTables: Object.keys(client).length, allDiff, paidDiff,
  hashes: Object.fromEntries(paidDiff.map((n) => [n, { server: hash(server[n]), client: hash(client[n]) }])) };
const outPath = path.resolve(__dirname, '../temp/paid_config_server_client_diff.json');
fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ outPath, serverTables: result.serverTables, clientTables: result.clientTables, allDiff, paidDiff }, null, 2));

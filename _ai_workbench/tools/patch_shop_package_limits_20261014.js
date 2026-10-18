'use strict';

// Patch only the paid daily package limit fields in an exact binary baseline.
// This is intentionally separate from the server overlay: the native client
// reads ShopConfig from the binary and would otherwise continue to show 1/day.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { BinJsonUtil, ByteArray } = require('../../linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');

const TARGET_IDS = Object.freeze([4000002, 4000003, 4000004, 4000005, 4000006]);
const FILES = [
  'linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin',
  'linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin',
  'linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin',
  'linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin',
];

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

function decodeChunks(buf) {
  const chunks = [];
  let offset = 0;
  while (offset < buf.length) {
    const start = offset;
    if (offset + 1 > buf.length) throw new Error('BIN_TRUNCATED_NAME');
    const nameLen = buf[offset++];
    if (offset + nameLen + 4 > buf.length) throw new Error('BIN_TRUNCATED_HEADER');
    const name = buf.toString('utf8', offset, offset + nameLen);
    offset += nameLen;
    const compressedLen = buf.readUInt32BE(offset);
    offset += 4;
    if (offset + compressedLen > buf.length) throw new Error(`BIN_TRUNCATED_CHUNK:${name}`);
    const compressed = buf.subarray(offset, offset + compressedLen);
    offset += compressedLen;
    const inflated = zlib.inflateSync(compressed);
    const value = BinJsonUtil.readFullJson(new ByteArray(inflated.buffer.slice(inflated.byteOffset, inflated.byteOffset + inflated.byteLength)));
    chunks.push({ name, start, end: offset, raw: buf.subarray(start, offset), value });
  }
  if (offset !== buf.length) throw new Error('BIN_TRAILING_BYTES');
  return chunks;
}

function encodeChunk(name, value) {
  const nameBuf = Buffer.from(name, 'utf8');
  if (nameBuf.length > 255) throw new Error(`BIN_NAME_TOO_LONG:${name}`);
  const out = new ByteArray(undefined, 1024 * 1024);
  BinJsonUtil.json2bin(value, out);
  const compressed = zlib.deflateSync(Buffer.from(out.buffer), { level: 6 });
  const header = Buffer.alloc(1 + nameBuf.length + 4);
  header.writeUInt8(nameBuf.length, 0);
  nameBuf.copy(header, 1);
  header.writeUInt32BE(compressed.length, 1 + nameBuf.length);
  return Buffer.concat([header, compressed]);
}

function patchBuffer(before) {
  const chunks = decodeChunks(before);
  const shop = chunks.find((chunk) => chunk.name === 'ShopConfig');
  if (!shop || !shop.value || typeof shop.value !== 'object') throw new Error('SHOP_CONFIG_MISSING');
  const next = { ...shop.value };
  for (const id of TARGET_IDS) {
    const key = String(id);
    const row = next[key] || next[id];
    if (!row || Number(row.id) !== id || Number(row.payId) !== id || Number(row.tab) !== 4) {
      throw new Error(`SHOP_ROW_INVALID:${id}`);
    }
    next[key] = { ...row, limit: 0, limitType: 0 };
  }
  const after = Buffer.concat(chunks.map((chunk) => (
    chunk === shop ? encodeChunk(chunk.name, next) : chunk.raw
  )));
  const check = decodeChunks(after).find((chunk) => chunk.name === 'ShopConfig');
  for (const id of TARGET_IDS) {
    const row = check.value[String(id)];
    if (!row || row.limit !== 0 || row.limitType !== 0) throw new Error(`SHOP_PATCH_VERIFY:${id}`);
  }
  return { after, beforeChunks: chunks, afterChunks: decodeChunks(after) };
}

function main() {
  const root = path.resolve(__dirname, '../..');
  const outDir = path.join(root, '_ai_workbench/temp/shop_package_limits_20261014/local_candidates');
  fs.mkdirSync(outDir, { recursive: true });
  const manifest = { targetIds: TARGET_IDS, files: [], productionWrites: 0 };
  for (const rel of FILES) {
    const abs = path.join(root, rel);
    const before = fs.readFileSync(abs);
    const { after, beforeChunks, afterChunks } = patchBuffer(before);
    const beforeMap = new Map(beforeChunks.map((c) => [c.name, sha256(c.raw)]));
    const afterMap = new Map(afterChunks.map((c) => [c.name, sha256(c.raw)]));
    for (const [name, hash] of beforeMap) {
      if (name !== 'ShopConfig' && afterMap.get(name) !== hash) throw new Error(`UNRELATED_CHUNK_CHANGED:${rel}:${name}`);
    }
    const target = path.join(outDir, rel.replace(/[\\/]/g, '__'));
    fs.writeFileSync(target, after, { flag: 'w' });
    manifest.files.push({ rel, candidate: target, beforeHash: sha256(before), afterHash: sha256(after), beforeBytes: before.length, afterBytes: after.length });
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest, null, 2));
}

if (require.main === module) main();
module.exports = { TARGET_IDS, FILES, decodeChunks, encodeChunk, patchBuffer };

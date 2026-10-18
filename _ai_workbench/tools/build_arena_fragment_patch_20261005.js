'use strict';

// Local-only candidate builder. It patches ArenaBaseConfig.arenaReward item 7
// from 2 -> 20 in the four normal arena score brackets. No source/live file is
// modified; patched copies and a hash/diff receipt are written under _ai_workbench/temp.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const assert = require('assert');
const { BinJsonUtil, ByteArray } = require('../../linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');

const root = path.resolve(__dirname, '..', '..');
const outRoot = path.join(root, '_ai_workbench', 'temp', 'arena_fragment_ticket_20261005', 'candidate');
const targets = [
  'linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin',
  'linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin',
  'linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin',
  'linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin',
];

function sha(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

function decode(buf) {
  const rows = [];
  let off = 0;
  while (off < buf.length) {
    const start = off;
    const n = buf.readUInt8(off); off += 1;
    assert(n > 0 && off + n + 4 <= buf.length, 'BAD_TABLE_HEADER');
    const name = buf.toString('utf8', off, off + n); off += n;
    const len = buf.readUInt32BE(off); off += 4;
    assert(len > 0 && off + len <= buf.length, `BAD_TABLE_LENGTH:${name}`);
    const compressed = buf.subarray(off, off + len); off += len;
    const inflated = zlib.inflateSync(compressed);
    const value = BinJsonUtil.readFullJson(new ByteArray(inflated.buffer.slice(inflated.byteOffset, inflated.byteOffset + inflated.byteLength)));
    rows.push({ name, value, raw: buf.subarray(start, off) });
  }
  assert.strictEqual(off, buf.length, 'BINARY_TRAILING_BYTES');
  return rows;
}

function encode(value) {
  const out = new ByteArray(undefined, 1024 * 1024);
  BinJsonUtil.json2bin(value, out);
  return Buffer.from(out.buffer);
}

function chunk(name, value) {
  const nb = Buffer.from(name, 'utf8');
  const compressed = zlib.deflateSync(encode(value), { level: 6 });
  const header = Buffer.allocUnsafe(1 + nb.length + 4);
  header.writeUInt8(nb.length, 0);
  nb.copy(header, 1);
  header.writeUInt32BE(compressed.length, 1 + nb.length);
  return Buffer.concat([header, compressed]);
}

function patchValue(value) {
  assert(value && Array.isArray(value.arenaReward), 'ArenaBaseConfig.arenaReward missing');
  assert.strictEqual(value.arenaReward.length, 4, 'unexpected arenaReward bracket count');
  const before = value.arenaReward.map((section) => {
    const item = section.find((r) => Number(r.id) === 7);
    assert(item, 'item 7 missing from arenaReward section');
    assert.strictEqual(Number(item.count), 2, 'refusing to overwrite non-2 item7 value');
    return Number(item.count);
  });
  value.arenaReward.forEach((section) => { section.find((r) => Number(r.id) === 7).count = 20; });
  return before;
}

function main() {
  fs.mkdirSync(outRoot, { recursive: true });
  const receipt = { generatedAt: new Date().toISOString(), scope: 'ArenaBaseConfig.arenaReward[item7] 2->20', files: [] };
  for (const rel of targets) {
    const source = path.join(root, rel);
    const original = fs.readFileSync(source);
    const tables = decode(original);
    const arena = tables.find((t) => t.name === 'ArenaBaseConfig');
    assert(arena, `ArenaBaseConfig missing: ${rel}`);
    const before = patchValue(arena.value);
    const output = Buffer.concat(tables.map((t) => t.name === 'ArenaBaseConfig' ? chunk(t.name, t.value) : t.raw));
    const decodedOutput = decode(output);
    assert.strictEqual(decodedOutput.length, tables.length, 'TABLE_COUNT_CHANGED');
    assert.deepStrictEqual(decodedOutput.map((t) => t.name), tables.map((t) => t.name), 'TABLE_ORDER_CHANGED');
    // Every non-target chunk is copied byte-for-byte; only ArenaBaseConfig is re-encoded.
    tables.forEach((t, i) => {
      if (t.name !== 'ArenaBaseConfig') assert.strictEqual(decodedOutput[i].raw.equals(t.raw), true, `UNEXPECTED_TABLE_CHANGE:${t.name}`);
    });
    const verify = decodedOutput.find((t) => t.name === 'ArenaBaseConfig');
    assert.deepStrictEqual(verify.value.arenaReward.map((s) => s.find((r) => Number(r.id) === 7).count), [20, 20, 20, 20]);
    // Preserve the full relative target path so the four deployment targets
    // cannot collide (some source bins intentionally share a basename/hash).
    const out = path.join(outRoot, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, output);
    receipt.files.push({ source: rel, candidate: path.relative(root, out).replaceAll('\\', '/'), sourceSha256: sha(original), candidateSha256: sha(output), sourceBytes: original.length, candidateBytes: output.length, item7Before: before, item7After: [20, 20, 20, 20], tableCount: tables.length, changedTables: ['ArenaBaseConfig'], nonTargetChunksByteIdentical: true });
  }
  fs.writeFileSync(path.join(outRoot, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt, null, 2));
}

main();

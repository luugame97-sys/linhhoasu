'use strict';

// Build a candidate from exact remote preimages. Local checkout binaries may
// be on a different release, so this tool never reads or overwrites them.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const assert = require('assert');
const { BinJsonUtil, ByteArray } = require('../../linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');

const root = path.resolve(__dirname, '..', '..');
const work = path.join(root, '_ai_workbench', 'temp', 'arena_fragment_ticket_20261005', 'remote_candidate');
const files = [
  ['lhs_e5.bin', 'lhs/update/resource/assets/excel/config_e5ac72c2.bin'],
  ['lhs_fashion.bin', 'lhs/update/resource/assets/excel/config_fashion_20260909.bin'],
  ['web_e5.bin', 'webgame/game/update/resource/assets/excel/config_e5ac72c2.bin'],
  ['web_fashion.bin', 'webgame/game/update/resource/assets/excel/config_fashion_20260909.bin'],
];

function sha(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function decode(buf) {
  const rows = []; let off = 0;
  while (off < buf.length) {
    const start = off; const n = buf.readUInt8(off); off += 1;
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
  const out = new ByteArray(undefined, 1024 * 1024); BinJsonUtil.json2bin(value, out); return Buffer.from(out.buffer);
}
function chunk(name, value) {
  const nb = Buffer.from(name, 'utf8'); const compressed = zlib.deflateSync(encode(value), { level: 6 });
  const header = Buffer.allocUnsafe(1 + nb.length + 4); header.writeUInt8(nb.length, 0); nb.copy(header, 1); header.writeUInt32BE(compressed.length, 1 + nb.length);
  return Buffer.concat([header, compressed]);
}
function patch(buf) {
  const tables = decode(buf); const arena = tables.find((t) => t.name === 'ArenaBaseConfig'); assert(arena, 'ArenaBaseConfig missing');
  assert(Array.isArray(arena.value.arenaReward) && arena.value.arenaReward.length === 4, 'arenaReward shape changed');
  const before = arena.value.arenaReward.map((section) => {
    const row = section.find((r) => Number(r.id) === 7); assert(row, 'item 7 missing'); assert.strictEqual(Number(row.count), 2, 'refusing non-2 preimage'); return Number(row.count);
  });
  arena.value.arenaReward.forEach((section) => { section.find((r) => Number(r.id) === 7).count = 20; });
  const output = Buffer.concat(tables.map((t) => t.name === 'ArenaBaseConfig' ? chunk(t.name, arena.value) : t.raw));
  const verify = decode(output).find((t) => t.name === 'ArenaBaseConfig');
  assert.deepStrictEqual(verify.value.arenaReward.map((s) => s.find((r) => Number(r.id) === 7).count), [20, 20, 20, 20]);
  return { output, before, tables: tables.length };
}
function main() {
  fs.mkdirSync(work, { recursive: true }); const receipt = { generatedAt: new Date().toISOString(), scope: 'ArenaBaseConfig.arenaReward[item7] 2->20', files: [] };
  for (const [name, rel] of files) {
    const input = fs.readFileSync(path.join(work, 'remote_before', name)); const result = patch(input); const out = path.join(work, name); fs.writeFileSync(out, result.output);
    receipt.files.push({ name, remote: '/' + rel, sourceSha256: sha(input), candidateSha256: sha(result.output), sourceBytes: input.length, candidateBytes: result.output.length, item7Before: result.before, item7After: [20, 20, 20, 20], tableCount: result.tables });
  }
  fs.writeFileSync(path.join(work, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n'); console.log(JSON.stringify(receipt, null, 2));
}
main();

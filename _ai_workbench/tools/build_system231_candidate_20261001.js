'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, '_ai_workbench/temp/system231_20261001');
const baseline = JSON.parse(fs.readFileSync(path.join(out, 'baseline.json'), 'utf8'));
const files = Object.fromEntries(Object.keys(baseline.files).map(rel => [rel, path.join(out, 'baseline', rel)]));
const { BinJsonUtil, ByteArray } = require(path.join(root, 'linhhoasu/lhs/newServer/src/protocol/BinJsonUtil'));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function decode(buffer) {
  const rows = []; let offset = 0;
  while (offset < buffer.length) {
    const start = offset; const n = buffer.readUInt8(offset); offset += 1;
    assert.ok(n > 0 && offset + n + 4 <= buffer.length, 'BAD_HEADER');
    const name = buffer.toString('utf8', offset, offset + n); offset += n;
    const size = buffer.readUInt32BE(offset); offset += 4;
    assert.ok(size > 0 && offset + size <= buffer.length, 'BAD_LENGTH:' + name);
    const compressed = buffer.subarray(offset, offset + size); offset += size;
    rows.push({ name, value: BinJsonUtil.readFullJson(new ByteArray(zlib.inflateSync(compressed))), raw: buffer.subarray(start, offset) });
  }
  assert.equal(offset, buffer.length, 'TRAILING_BYTES'); return rows;
}
function encodeValue(value) {
  const { BinJsonUtil, ByteArray } = require(path.join(root, 'linhhoasu/lhs/newServer/src/protocol/BinJsonUtil'));
  const output = new ByteArray(undefined, 1024 * 1024); BinJsonUtil.json2bin(value, output); return Buffer.from(output.buffer);
}
function encodeChunk(name, value) {
  const n = Buffer.from(name, 'utf8'); const compressed = zlib.deflateSync(encodeValue(value), { level: 6 });
  const header = Buffer.allocUnsafe(1 + n.length + 4); header.writeUInt8(n.length, 0); n.copy(header, 1); header.writeUInt32BE(compressed.length, 1 + n.length);
  return Buffer.concat([header, compressed]);
}
function conditions(row) { return Array.isArray(row && row.conditions) ? row.conditions : []; }
function makeCandidate(rel, source) {
  if (rel === 'index.html') {
    const text = source.toString('utf8');
    assert.equal((text.match(/20260930_pet_cap1000_v1/g) || []).length, 1, 'INDEX_VERSION_ANCHOR');
    assert.equal(text.includes('pet_vusa_lian_20260930'), false, 'INDEX_MUST_BE_ROLLED_BACK');
    const anchor = "parsed.searchParams.set('v', translationVersion);";
    assert.equal(text.split(anchor).length - 1, 1, 'SCOPED_CACHE_ANCHOR');
    const replacement = "parsed.searchParams.set('v', /(?:config_e5ac72c2|config_fashion_20260909)\\.bin$/i.test(parsed.pathname) ? '20261001_system231_v1' : translationVersion);";
    return Buffer.from(text.replace(anchor, replacement), 'utf8');
  }
  const rows = decode(source), system = rows.find(r => r.name === 'SystemConfig');
  assert.ok(system, 'SYSTEM_CONFIG_MISSING:' + rel);
  const row = system.value[231] || system.value['231']; assert.ok(row, 'SYSTEM_231_MISSING:' + rel);
  const before = conditions(row); assert.deepEqual(before, [
    { type: 7, value: 206, cond: 4 }, { type: 3, value: 135, cond: 4 }, { type: 5, value: 43, cond: 4 },
  ], 'SYSTEM_231_CONDITIONS_DRIFT:' + rel);
  row.conditions = before.filter(c => Number(c.type) !== 5);
  assert.deepEqual(row.conditions, [{ type: 7, value: 206, cond: 4 }, { type: 3, value: 135, cond: 4 }]);
  return Buffer.concat(rows.map(item => item.name === 'SystemConfig' ? encodeChunk(item.name, system.value) : item.raw));
}
assert.ok(!fs.existsSync(path.join(out, 'deployment.json')), 'DEPLOYMENT_ALREADY_STARTED');
fs.mkdirSync(path.join(out, 'candidate'), { recursive: true });
const report = { result: 'PASS', at: new Date().toISOString(), configVersion: '20261001_system231_v1', files: {}, changes: { systemId: 231, removed: { type: 5, value: 43, cond: 4 }, kept: [{ type: 7, value: 206, cond: 4 }, { type: 3, value: 135, cond: 4 }] } };
for (const [rel, sourcePath] of Object.entries(files)) {
  const before = fs.readFileSync(sourcePath);
  assert.equal(sha(before), baseline.files[rel].sha256, 'BASELINE_HASH:' + rel);
  const candidate = makeCandidate(rel, before), target = path.join(out, 'candidate', rel);
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, candidate);
  report.files[rel] = { source: sourcePath, beforeSha256: sha(before), sha256: sha(candidate), beforeBytes: before.length, candidateBytes: candidate.length, changed: sha(before) !== sha(candidate) };
}
assert.equal(Object.values(report.files).filter(x => x.changed).length, 5);
fs.writeFileSync(path.join(out, 'build.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));

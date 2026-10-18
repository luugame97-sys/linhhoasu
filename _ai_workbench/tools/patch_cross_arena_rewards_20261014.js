'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { BinJsonUtil, ByteArray } = require('../../linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');

const FILES = [
  'linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin',
  'linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin',
  'linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin',
  'linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin',
];
const DAY_GEM = [10, 8, 5, 3, 3, 3, 2, 2, 2, 2];
const WEEK_GEM = [30, 24, 15, 9, 9, 9, 6, 6, 6, 6];
const DAY_TOKEN = [7500, 6000, 4500, 3000, 2400, 1500, 900, 600, 300, 150];
const WEEK_TOKEN = [22500, 18000, 13500, 11250, 11250, 9000, 9000, 8100, 6750, 4500];

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

function decodeChunks(buf) {
  const chunks = [];
  let offset = 0;
  while (offset < buf.length) {
    const start = offset;
    const nameLen = buf[offset++];
    const name = buf.toString('utf8', offset, offset + nameLen);
    offset += nameLen;
    const compressedLen = buf.readUInt32BE(offset);
    offset += 4;
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
  const out = new ByteArray(undefined, 1024 * 1024);
  BinJsonUtil.json2bin(value, out);
  const compressed = zlib.deflateSync(Buffer.from(out.buffer), { level: 6 });
  const header = Buffer.alloc(1 + nameBuf.length + 4);
  header.writeUInt8(nameBuf.length, 0);
  nameBuf.copy(header, 1);
  header.writeUInt32BE(compressed.length, 1 + nameBuf.length);
  return Buffer.concat([header, compressed]);
}

function patchRankTable(table, gemCounts, tokenCounts) {
  return Object.fromEntries(Object.entries(table).map(([key, row]) => {
    const index = Number(key) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= 10) throw new Error(`RANK_ID_INVALID:${key}`);
    const rewards = (Array.isArray(row.rewards) ? row.rewards : []).map((reward) => {
      if (Number(reward.id) === 90078) return { id: 100098, count: gemCounts[index] };
      if (Number(reward.id) === 1) return { id: 1, count: Number(reward.count) * 10 };
      return { ...reward };
    });
    if (rewards.some((reward) => Number(reward.id) === 1001)) throw new Error(`DUPLICATE_TOKEN:${key}`);
    rewards.push({ id: 1001, count: tokenCounts[index] });
    return [key, { ...row, rewards }];
  }));
}

function patchBuffer(before) {
  const chunks = decodeChunks(before);
  let day = null;
  let week = null;
  const after = Buffer.concat(chunks.map((chunk) => {
    if (chunk.name === 'CrossArenaDayRankRewardConfig') {
      day = patchRankTable(chunk.value, DAY_GEM, DAY_TOKEN);
      return encodeChunk(chunk.name, day);
    }
    if (chunk.name === 'CrossArenaWeeklyRankRewardConfig') {
      week = patchRankTable(chunk.value, WEEK_GEM, WEEK_TOKEN);
      return encodeChunk(chunk.name, week);
    }
    return chunk.raw;
  }));
  if (!day || !week) throw new Error('CROSS_ARENA_REWARD_TABLE_MISSING');
  const verify = decodeChunks(after);
  const checkDay = verify.find((chunk) => chunk.name === 'CrossArenaDayRankRewardConfig').value;
  const checkWeek = verify.find((chunk) => chunk.name === 'CrossArenaWeeklyRankRewardConfig').value;
  for (const [table, gemCounts, tokenCounts] of [[checkDay, DAY_GEM, DAY_TOKEN], [checkWeek, WEEK_GEM, WEEK_TOKEN]]) {
    for (let i = 1; i <= 10; i += 1) {
      const rewards = table[String(i)].rewards;
      if (rewards.find((r) => r.id === 90078) || rewards.find((r) => r.id === 100098)?.count !== gemCounts[i - 1]
        || rewards.find((r) => r.id === 1001)?.count !== tokenCounts[i - 1]) throw new Error(`REWARD_VERIFY:${i}`);
    }
  }
  return { after, beforeChunks: chunks, afterChunks: verify };
}

function main() {
  const root = path.resolve(__dirname, '../..');
  const outDir = path.join(root, '_ai_workbench/temp/cross_arena_rewards_20261014/local_candidates');
  fs.mkdirSync(outDir, { recursive: true });
  const manifest = { files: [], productionWrites: 0 };
  for (const rel of FILES) {
    const abs = path.join(root, rel);
    const before = fs.readFileSync(abs);
    const { after, beforeChunks, afterChunks } = patchBuffer(before);
    const beforeMap = new Map(beforeChunks.map((chunk) => [chunk.name, sha256(chunk.raw)]));
    const afterMap = new Map(afterChunks.map((chunk) => [chunk.name, sha256(chunk.raw)]));
    for (const [name, hash] of beforeMap) {
      if (!name.startsWith('CrossArena') && afterMap.get(name) !== hash) throw new Error(`UNRELATED_CHUNK_CHANGED:${rel}:${name}`);
    }
    const candidate = path.join(outDir, rel.replace(/[\\/]/g, '__'));
    fs.writeFileSync(candidate, after);
    manifest.files.push({ rel, candidate, beforeHash: sha256(before), afterHash: sha256(after), beforeBytes: before.length, afterBytes: after.length });
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest, null, 2));
}

if (require.main === module) main();
module.exports = { FILES, patchBuffer, decodeChunks };

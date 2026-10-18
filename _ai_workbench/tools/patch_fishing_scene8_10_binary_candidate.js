'use strict';

/*
 * Candidate-only patcher for the normal fishing grounds.
 *
 * FishSceneConfig is the only table changed here.  Rows 8..10 are derived
 * from the last three normal grounds (5..7), so all fish/relic/resource keys
 * stay valid with the current client assets.  The patcher never writes the
 * supplied input path and preserves every unrelated table byte-for-byte.
 *
 * This is deliberately a candidate tool.  It does not update the two local
 * runtime binaries or deploy to a server.  Use the output files after the
 * server/client contract and UI have been reviewed.
 */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { BinJsonUtil, ByteArray } = require('../../linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');

const VERSION = 'fishing_scene8_10_candidate_v1';
const TARGET_TABLE = 'FishSceneConfig';
const NORMAL_SCENE_IDS = [1, 2, 3, 4, 5, 6, 7];
const CANDIDATE_SCENES = [
  // Keep the level-only progression monotonic.  openDay is retained as the
  // historical metadata progression (it is not used by the current gate).
  { id: 8, source: 5, cond: 31, openDay: 99 },
  { id: 9, source: 6, cond: 34, openDay: 127 },
  { id: 10, source: 7, cond: 37, openDay: 155 },
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function decodeTables(buffer) {
  const tables = [];
  let offset = 0;
  while (offset < buffer.length) {
    const at = offset;
    const nameLength = buffer.readUInt8(offset);
    offset += 1;
    if (nameLength <= 0 || offset + nameLength + 4 > buffer.length) throw new Error(`BAD_HEADER:${at}`);
    const name = buffer.toString('utf8', offset, offset + nameLength);
    offset += nameLength;
    const dataLength = buffer.readUInt32BE(offset);
    offset += 4;
    if (dataLength <= 0 || offset + dataLength > buffer.length) throw new Error(`BAD_LENGTH:${name}`);
    const compressed = buffer.subarray(offset, offset + dataLength);
    offset += dataLength;
    const inflated = zlib.inflateSync(compressed);
    tables.push({
      name,
      raw: buffer.subarray(at, offset),
      value: BinJsonUtil.readFullJson(new ByteArray(toArrayBuffer(inflated))),
    });
  }
  if (offset !== buffer.length) throw new Error('BINARY_TRAILING_BYTES');
  return tables;
}

function encodeValue(value) {
  const output = new ByteArray(undefined, 1024 * 1024);
  BinJsonUtil.json2bin(value, output);
  return Buffer.from(output.buffer);
}

function encodeTargetTable(name, value) {
  const nameBytes = Buffer.from(name, 'utf8');
  const compressed = zlib.deflateSync(encodeValue(value), { level: 6 });
  const header = Buffer.allocUnsafe(1 + nameBytes.length + 4);
  header.writeUInt8(nameBytes.length, 0);
  nameBytes.copy(header, 1);
  header.writeUInt32BE(compressed.length, 1 + nameBytes.length);
  return Buffer.concat([header, compressed]);
}

function encodeTables(tables, targetName, targetValue) {
  return Buffer.concat(tables.map((table) => table.name === targetName
    ? encodeTargetTable(table.name, targetValue)
    : table.raw));
}

function numberKey(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) ? String(n) : String(value);
}

function sceneRow(sceneTable, id) {
  return sceneTable[id] || sceneTable[numberKey(id)];
}

function patchFishSceneTable(sceneTable) {
  const before = clone(sceneTable);
  const normalIds = new Set(NORMAL_SCENE_IDS.map(String));
  for (const id of NORMAL_SCENE_IDS) {
    const row = sceneRow(sceneTable, id);
    if (!row || Number(row.id) !== id || Number(row.isActivity) !== 0) {
      throw new Error(`NORMAL_SCENE_INVALID:${id}`);
    }
    if (!Array.isArray(row.fishes) || row.fishes.length === 0) throw new Error(`NORMAL_SCENE_FISHES_MISSING:${id}`);
    if (!Array.isArray(row.relics) || row.relics.length === 0) throw new Error(`NORMAL_SCENE_RELICS_MISSING:${id}`);
  }
  for (const spec of CANDIDATE_SCENES) {
    const source = sceneRow(sceneTable, spec.source);
    const key = String(spec.id);
    if (sceneRow(sceneTable, spec.id)) throw new Error(`SCENE_ALREADY_EXISTS:${spec.id}`);
    const row = clone(source);
    row.id = spec.id;
    row.cond = spec.cond;
    row.openDay = spec.openDay;
    // Keep source name/banner/thumbnail/background keys so no new assets or
    // language entries are required for this candidate.
    sceneTable[key] = row;
  }
  const ids = Object.values(sceneTable).map((row) => Number(row && row.id)).filter(Number.isSafeInteger);
  assert.equal(new Set(ids).size, ids.length, 'FISH_SCENE_DUPLICATE_ID');
  for (const spec of CANDIDATE_SCENES) {
    const row = sceneRow(sceneTable, spec.id);
    assert.equal(row.id, spec.id, `SCENE_ID_MISMATCH:${spec.id}`);
    assert.equal(row.cond, spec.cond, `SCENE_COND_MISMATCH:${spec.id}`);
    assert.equal(row.openDay, spec.openDay, `SCENE_OPEN_DAY_MISMATCH:${spec.id}`);
    assert.equal(row.isActivity, 0, `SCENE_ACTIVITY_MISMATCH:${spec.id}`);
    assert.deepEqual(row.fishes, sceneRow(before, spec.source).fishes, `SCENE_FISHES_NOT_REUSED:${spec.id}`);
    assert.deepEqual(row.relics, sceneRow(before, spec.source).relics, `SCENE_RELICS_NOT_REUSED:${spec.id}`);
  }
  return { before, after: sceneTable };
}

function patchBinary(inputPath, outputPath) {
  const input = path.resolve(inputPath);
  const output = path.resolve(outputPath);
  if (input === output) throw new Error('IN_PLACE_WRITE_REFUSED');
  const originalBuffer = fs.readFileSync(input);
  const tables = decodeTables(originalBuffer);
  const target = tables.find((table) => table.name === TARGET_TABLE);
  if (!target) throw new Error('FISH_SCENE_CONFIG_MISSING');
  const sourceTable = clone(target.value);
  const { after } = patchFishSceneTable(clone(target.value));
  const outputBuffer = encodeTables(tables, TARGET_TABLE, after);

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, outputBuffer);

  // Round-trip guards: unrelated values remain equal and only the three new
  // scene rows are added to FishSceneConfig.
  const decoded = decodeTables(outputBuffer);
  assert.equal(decoded.length, tables.length, 'TABLE_COUNT_CHANGED');
  const beforeByName = new Map(tables.map((table) => [table.name, table.value]));
  const afterByName = new Map(decoded.map((table) => [table.name, table.value]));
  for (const [name, value] of beforeByName) {
    if (name === TARGET_TABLE) continue;
    assert.deepEqual(afterByName.get(name), value, `UNRELATED_TABLE_CHANGED:${name}`);
  }
  const decodedScenes = afterByName.get(TARGET_TABLE);
  assert.deepEqual(Object.keys(decodedScenes).filter((key) => !Object.hasOwn(sourceTable, key)), ['8', '9', '10'], 'SCENE_KEY_DELTA_INVALID');
  for (const spec of CANDIDATE_SCENES) {
    assert.deepEqual(decodedScenes[String(spec.id)], after[String(spec.id)], `SCENE_ROUNDTRIP_MISMATCH:${spec.id}`);
  }
  return {
    result: 'PASS',
    version: VERSION,
    targetTable: TARGET_TABLE,
    input,
    output,
    inputBytes: originalBuffer.length,
    outputBytes: outputBuffer.length,
    inputSha256: sha256(originalBuffer),
    outputSha256: sha256(outputBuffer),
    tables: tables.length,
    scenes: CANDIDATE_SCENES.map((spec) => ({
      id: spec.id,
      cond: spec.cond,
      openDay: spec.openDay,
      source: spec.source,
      fishCount: after[String(spec.id)].fishes.length,
      relicCount: after[String(spec.id)].relics.length,
      picture: after[String(spec.id)].picture,
      banner: after[String(spec.id)].banner,
      miniBanner: after[String(spec.id)].miniBanner,
    })),
    productionWrites: 0,
  };
}

function defaultInputs() {
  const root = path.resolve(__dirname, '..', '..');
  return [
    path.join(root, 'linhhoasu', 'lhs', 'update', 'resource', 'assets', 'excel', 'config_e5ac72c2.bin'),
    path.join(root, 'linhhoasu', 'webgame', 'game', 'update', 'resource', 'assets', 'excel', 'config_e5ac72c2.bin'),
    path.join(root, 'linhhoasu', 'lhs', 'update', 'resource', 'assets', 'excel', 'config_fashion_20260909.bin'),
    path.join(root, 'linhhoasu', 'webgame', 'game', 'update', 'resource', 'assets', 'excel', 'config_fashion_20260909.bin'),
  ];
}

function main(argv = process.argv.slice(2)) {
  if (argv.length === 0) {
    throw new Error('USAGE: node patch_fishing_scene8_10_binary_candidate.js <input.bin> <output.bin>');
  }
  if (argv.length !== 2) throw new Error('USAGE: node patch_fishing_scene8_10_binary_candidate.js <input.bin> <output.bin>');
  process.stdout.write(`${JSON.stringify(patchBinary(argv[0], argv[1]), null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {
  VERSION,
  CANDIDATE_SCENES,
  decodeTables,
  encodeTables,
  patchFishSceneTable,
  patchBinary,
  defaultInputs,
};

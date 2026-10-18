'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { patchBinary, decodeTables } = require('./patch_plant_level100_binary_candidate');

const root = path.resolve(__dirname, '..', '..');
const outputDir = path.resolve(__dirname, '../temp/plant_level100_candidate_20260923');
const inputs = [
  {
    name: 'server',
    input: path.join(root, 'linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin'),
    output: path.join(outputDir, 'config_server_candidate.bin'),
  },
  {
    name: 'client',
    input: path.join(root, 'linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin'),
    output: path.join(outputDir, 'config_client_candidate.bin'),
  },
];

const results = inputs.map((item) => ({ name: item.name, ...patchBinary(item.input, item.output) }));
assert.equal(results[0].inputSha256, results[1].inputSha256, 'BASE_SERVER_CLIENT_DRIFT');
assert.equal(results[0].outputSha256, results[1].outputSha256, 'CANDIDATE_SERVER_CLIENT_DRIFT');
assert.equal(results[0].level40Exp, 1400);
assert.equal(results[0].level41Exp, 1550);
assert.equal(results[0].level99Exp, 10250);
assert.equal(results[0].level100Exp, 0);
for (const item of inputs) {
  const tables = decodeTables(fs.readFileSync(item.output));
  const row = tables.find((table) => table.name === 'PlantLevelConfig');
  assert.ok(row, `${item.name}:PLANT_LEVEL_CONFIG_MISSING`);
  assert.equal(Object.keys(row.value).length, 100);
  assert.equal(row.value['40'].exp, 1400);
  assert.equal(row.value['100'].exp, 0);
}

const report = {
  result: 'PASS',
  productionWrites: 0,
  serverClientCandidateParity: true,
  results,
};
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'binary_verification.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);


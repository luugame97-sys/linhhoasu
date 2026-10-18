'use strict';

// Read application source, run isolated contracts, and emit evidence only in
// _ai_workbench. This runner does not connect, install, deploy, or restart.
const cp = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const workbench = path.resolve(__dirname, '..');
const app = path.resolve(__dirname, '../../linhhoasu/lhs/newServer');
const baseline = path.join(workbench, 'backups/cash_session_durability_20260905_203224/recharge.js');
const candidate = path.join(workbench, 'temp/cash_session_candidate_20260905/src/handlers/recharge.js');
const config = path.join(workbench, 'temp/delegate_first_task_20260905/server.next.bin');
const runId = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const evidenceDir = path.join(workbench, 'temp', `cash_session_checkpoint_${runId}`);
const logsDir = path.join(workbench, 'logs', `cash_session_checkpoint_${runId}`);
for (const filename of [baseline, candidate, config]) {
  if (!fs.existsSync(filename)) throw new Error(`Required local fixture missing: ${filename}`);
}
fs.mkdirSync(evidenceDir, { recursive: true });
fs.mkdirSync(logsDir, { recursive: true });
const sha = (filename) => crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const env = {
  ...process.env, NODE_ENV: 'test', LOG_DIR: '', NODE_OPTIONS: '',
  LHS_APP_ROOT: app, APP_ROOT: app, ACTIVATION_PASS_APP_ROOT: app,
  LHS_CONFIG_PATH: config, CONFIG_BIN_PATH: config, ACTIVATION_PASS_CONFIG: config,
  LHS_LANG_PATH: path.join(workbench, 'temp/reward_release_20260905/lang.bin'),
  CASH_BASELINE_SOURCE: '', CASH_CANDIDATE_SOURCE: candidate,
};
const preload = path.join(__dirname, 'preload_cash_checkpoint_20260905.js');
const jobs = [
  { name: 'baseline_reproducer', script: 'test_cash_session_durability_20260905.js', baseline: true },
  { name: 'cash_session_durability', script: 'test_cash_session_durability_20260905.js' },
  { name: 'production_writer_gate', script: 'test_cash_session_durability_20260905.js', args: ['--writer-gates'], gate: true },
  { name: 'cash_receipt_recovery', script: 'test_reward_cash_recovery_20260905.js' },
  { name: 'cash_existing_contract', script: 'test_cash_recharge_checkpoint4.js' },
  { name: 'token_existing_contract', script: 'test_token_recharge_checkpoint3.js' },
  { name: 'activation_pass', script: 'test_activation_pass_fix_20260904.js' },
  { name: 'activation_cash_concurrency', script: 'test_activation_pass_cash_concurrency_20260904.js' },
  { name: 'native_reward_families', script: 'test_reward_release_20260905.js' },
  { name: 'appearance', script: 'test_appearance_fix_20260905.js' },
  { name: 'gem_family', script: 'test_gem_family_corrected_20260905.js' },
  { name: 'fixed_items', script: 'test_fixed_items_20260905.js' },
  { name: 'core_contract', source: 'scripts/test-core-gameplay-contract.js' },
  { name: 'top_combat_contract', source: 'scripts/test-top-combat-contract.js' },
];

const results = [];
for (const job of jobs) {
  const target = job.source ? path.join(app, job.source) : path.join(__dirname, job.script);
  const output = cp.spawnSync(process.execPath, ['-r', preload, target, ...(job.args || [])], {
    cwd: app, env: { ...env, CASH_BASELINE_SOURCE: job.baseline ? baseline : '' },
    encoding: 'utf8', timeout: 45000, maxBuffer: 16 * 1024 * 1024,
  });
  const stdout = output.stdout || '';
  const stderr = output.stderr || '';
  fs.writeFileSync(path.join(logsDir, `${job.name}.log`), `${stdout}\n${stderr}`, 'utf8');
  let payload = null;
  try { payload = JSON.parse(stdout); } catch (_error) { /* Some older tests print a text summary. */ }
  const row = {
    name: job.name, exitCode: output.status, error: output.error?.message || '',
    baseline: job.baseline === true, productionGate: job.gate === true,
    source: target, testSha256: sha(target), payload,
    lastLine: stdout.trim().split('\n').slice(-1)[0],
    log: path.join(logsDir, `${job.name}.log`),
  };
  results.push(row);
  console.log(JSON.stringify({ name: row.name, exitCode: row.exitCode, error: row.error, lastLine: row.lastLine }));
}
const baselineResult = results.find((row) => row.baseline);
const checkpointPass = results.filter((row) => !row.baseline && !row.productionGate)
  .every((row) => row.exitCode === 0);
const baselineReproduced = baselineResult.exitCode === 1 && baselineResult.payload?.failed > 0;
const productionGatePassed = results.filter((row) => row.productionGate)
  .every((row) => row.exitCode === 0);
const evidence = {
  createdAt: new Date().toISOString(), checkpoint: 'cash_session_durability_20260905',
  checkpointPass, baselineReproduced, productionGatePassed, productionStatus: 'HOLD', deployed: false,
  sourceRoot: app, baseline, baselineSha256: sha(baseline),
  candidate, handlerSha256: sha(candidate),
  workspaceHandlerSha256: sha(path.join(app, 'src/handlers/recharge.js')),
  workspaceHandlerRestored: sha(path.join(app, 'src/handlers/recharge.js')) === sha(baseline),
  config, configSha256: sha(config), network: 'socket connections blocked',
  database: 'in-memory fixtures only', nativeUi: false, upstreamPayment: false,
  results,
};
const evidencePath = path.join(evidenceDir, 'verification.json');
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ checkpointPass, baselineReproduced, productionGatePassed, productionStatus: 'HOLD', evidencePath }));
// A green narrow checkpoint must never hide a failed production writer gate.
if (!checkpointPass || !baselineReproduced || !productionGatePassed) process.exitCode = 1;

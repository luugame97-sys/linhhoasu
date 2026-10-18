'use strict';
// Final local checks and generated release metadata. Never writes production/source.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');
const assert = require('assert/strict');
const wb = path.resolve(__dirname, '..');
const root = path.join(wb, 'temp/fishing_full_candidate_20260906');
const localApp = path.resolve(wb, '../linhhoasu/lhs/newServer');
const localGame = path.resolve(wb, '../linhhoasu/webgame/game');
const remoteApp = '/linhhoasu/lhs/newServer';
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const write = (name, value) => fs.writeFileSync(path.join(root, name), JSON.stringify(value, null, 2) + '\n');
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
const normalize = data => data.toString('utf8').replace(/\r\n/g, '\n');
const stage = read('stage-full.json');
const deploy = read('deploy-full.json');
const verify = read('verify-full.json');
const prepared = read('deploy-prepared.json');
const guardStage = read('stage-payload-guard.json');
const guardDeploy = read('deploy-payload-guard.json');
assert.equal(deploy.result, 'DEPLOYED');
assert.equal(verify.result, 'VERIFIED');
assert.equal(guardDeploy.result, 'DEPLOYED');
assert.deepEqual(verify.pm2, guardDeploy.afterPm2);
const specs = stage.changedFiles.map(file => ({
  file,
  local: path.join(localApp, file),
  candidate: path.join(root, 'app', file),
  remote: remoteApp + '/' + file,
  expected: prepared.serverHashes[file],
  category: 'server-source',
  new: prepared.baseline[remoteApp + '/' + file] == null,
}));
specs.push(
  { file: 'js/main.min_a6195824.js', local: path.join(localGame, 'js/main.min_a6195824.js'), candidate: path.join(root, 'main.fixed.js'), remote: '/linhhoasu/webgame/game/js/main.min_a6195824.js', expected: prepared.mainHash, category: 'native-client', new: false },
  { file: 'index.html', local: path.join(localGame, 'index.html'), candidate: path.join(root, 'index.fixed.html'), remote: '/linhhoasu/webgame/game/index.html', expected: prepared.indexHash, category: 'client-cache-version', new: false },
);
const files = specs.map(spec => {
  const a = fs.readFileSync(spec.local), b = fs.readFileSync(spec.candidate);
  assert.equal(digest(b), spec.expected, 'CANDIDATE_DRIFT_' + spec.file);
  assert(normalize(a) === normalize(b), 'LOCAL_SOURCE_DRIFT_' + spec.file);
  if (spec.file.endsWith('.js')) {
    const check = cp.spawnSync(process.execPath, ['--check', spec.local], { encoding: 'utf8', timeout: 30000, windowsHide: true });
    assert.equal(check.status, 0, 'SYNTAX_FAIL_' + spec.file + ': ' + (check.stderr || '').slice(-1500));
  }
  return { file: spec.file, category: spec.category, new: spec.new, localPath: spec.local, productionPath: spec.remote,
    productionSha256: digest(b), localSha256: digest(a), byteEqual: a.equals(b), normalizedEqual: true };
});
const core = cp.spawnSync(process.execPath, ['scripts/test-core-gameplay-contract.js'], {
  cwd: localApp, encoding: 'utf8', timeout: 55000, windowsHide: true,
  env: { ...process.env, NODE_ENV: 'test', CONFIG_BIN_PATH: path.join(root, 'server.bin'), LOG_DIR: '' },
});
write('local-core-check.json', { exitCode: core.status, stdout: core.stdout, stderr: core.stderr, infrastructureStubbed: true });
assert.equal(core.status, 0, 'LOCAL_CORE_CONTRACT_FAILED');
const localChecks = { result: 'PASS', checkedAt: new Date().toISOString(), files: files.length,
  byteEqual: files.filter(f => f.byteEqual).length, normalizedEqual: files.length,
  differences: files.filter(f => !f.byteEqual), syntaxJsFiles: specs.filter(f => f.file.endsWith('.js')).length,
  coreContract: 'PASS', coreEvidence: 'local-core-check.json', productionWrites: 0 };
write('local-final-checks.json', localChecks);
const backup = path.join(wb, 'backups/fishing_full_release_reports_20260906');
for (const name of ['checkpoint.json', 'changed-files.json']) {
  const target = path.join(backup, name);
  if (!fs.existsSync(target)) fs.copyFileSync(path.join(root, name), target);
}
write('changed-files.json', { deployed: true, release: '20260906_fishing_full_v1', files });
const rules = read('app/src/config/fishingGameplayBalance.json');
const end = new Date(Date.parse(rules.schedule.anchor) + rules.schedule.durationDays * 86400000).toISOString();
write('checkpoint.json', {
  status: 'deployed_with_documented_limits', productionDeployed: true, eventsOpened: true,
  release: '20260906_fishing_full_v1', deployedAt: deploy.finishedAt, lastUpdatedAt: guardDeploy.finishedAt, verifiedAt: verify.time,
  sourceBaseline: '../fishing_events_audit_20260906T093353Z', productionBackup: deploy.backup,
  balance: { version: rules.version, ownerApproved: true, officialCnRng: false },
  schedule: { ...rules.schedule, endExclusive: end, nonFishingType6HasPriority: true, offlineSettlement: 'next_login_or_heartbeat_after_end_plus_60s' },
  tests: { originalStagingGroups: Object.values(stage.tests).reduce((n, t) => n + t.count, 0),
    addedPayloadGuardGroups: guardStage.tests.guard.count, combinedDistinctGroups: Object.values(stage.tests).reduce((n, t) => n + t.count, 0) + guardStage.tests.guard.count,
    payloadGuardRerun: { guard: guardStage.tests.guard.count, gameplay_events: guardStage.tests.gameplay_events.count, coreContract: guardStage.coreContract.result, tables: guardStage.coreContract.tables },
    suites: Object.fromEntries(Object.entries(stage.tests).map(([k, v]) => [k, { count: v.count, result: v.result }])),
    legacyAdapterSuites: ['gear_fix', 'balance'], adapterDoesNotValidateNewRng: true,
    realMongoIntegration: stage.mongoIntegration.result, liveQa: guardDeploy.liveQa,
    localSourceChecks: localChecks, nativeViewportEmulation: [ '360x640', '390x844', '768x1024' ] },
  implemented: ['normal_and_soul_rng', 'advanced_bait_and_rod_raft_passives', 'relic_and_event_drops',
    'gold_bonus_native_claim', 'minigame_tickets_and_rewards', 'shared_bottle_outbox', 'real_player_rank_and_once_settlement',
    'ten_type33_rotation_and_contest', 'homeland_skins_190051_190052', 'four_player_native_actor_layout'],
  held: [{ ids: [190053,190054,190055], reason: 'missing_native_map_config_and_assets' }],
  limits: ['not_physical_device_acceptance', 'not_all_costumes_or_animation_frames', 'not_live_tested_all_ten_periods',
    'no_new_paid_checkout_e2e', 'rod_package_day_gates_43_57_preserved', 'offline_rank_reward_not_immediate_mail'],
  compensation: false, historicalPlayerReset: false, pausedInputFreezeTouched: false,
  report: '../../reports/fishing_full_release_20260906.md', html: '../../reports/fishing_full_release_20260906.html',
});
const reportDir = path.join(wb, 'reports');
const reportMd = fs.readFileSync(path.join(reportDir, 'fishing_full_release_20260906.md'), 'utf8');
const reportHtml = fs.readFileSync(path.join(reportDir, 'fishing_full_release_20260906.html'), 'utf8');
const reportChecks = [];
for (const name of ['fishing_full_release_20260906', 'session_report']) {
  const md = fs.readFileSync(path.join(reportDir, name + '.md'), 'utf8');
  const html = fs.readFileSync(path.join(reportDir, name + '.html'), 'utf8');
  const headings = [...md.matchAll(/^#{1,6} (.+)$/gm)].map(m => m[1].trim());
  const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  assert(headings.every(h => html.includes(escape(h))), 'REPORT_HEADING_MISSING_' + name);
  assert(html.includes('<meta charset="utf-8">') && html.endsWith('</html>'), 'REPORT_HTML_INCOMPLETE_' + name);
  reportChecks.push({ name, headings: headings.length, htmlComplete: true });
}
assert(!/[\uFFFD]|Ti\u00e1\u00ba|Vi\u00e1\u00bb|\u00c6\u00b0|\u00c4\u2018/.test(reportMd + reportHtml), 'NEW_REPORT_ENCODING_CORRUPTION');
const links = [...reportMd.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(m => m[1]);
assert(links.every(link => fs.existsSync(path.resolve(reportDir, link))), 'REPORT_LINK_MISSING');
const oldSession = normalize(fs.readFileSync(path.join(backup, 'session_report.md')));
const newSession = normalize(fs.readFileSync(path.join(reportDir, 'session_report.md')));
assert(newSession.endsWith(oldSession.replace(/^# Session Report\n\n/, '')), 'SESSION_HISTORY_CHANGED');
write('reports-final-checks.json', { result: 'PASS', reports: reportChecks, releaseLinks: links.length, previousSessionHistoryPreserved: true, newReportUtf8: true });
console.log(JSON.stringify(localChecks));

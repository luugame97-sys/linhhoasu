'use strict';
// Apply the Hư Thiên Bảo Điện fixes (quick challenge, speed-clear tier reward, bonus
// attrs in tower battles, rank sync) to the server source in place, by anchors.
//
// The live raid.js / tower.js / BattleService.js carry other deployed fixes (daily
// reset, stale-floor guard, ...) that this repository copy may not have, so this
// script edits the live files instead of replacing them. All-or-nothing: if a
// required anchor is missing or ambiguous nothing is written.
//
//   node scripts/apply-tower-progress-20261018.js            # dry run (default)
//   node scripts/apply-tower-progress-20261018.js --stage    # patch a sibling copy of src and run the contract test there
//   node scripts/apply-tower-progress-20261018.js --apply    # backup, patch live files in place, node --check
//   node scripts/apply-tower-progress-20261018.js --rollback <backupDir>
//   --root <newServerDir>  (default: the parent of this scripts folder)
//
// Copy src/services/TowerProgressService.js next to the other services first.
// After --apply, restart the game processes (pm2 lhs-s<number>) one at a time.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const RELEASE = 'tower_progress_20261018';
const TEST = 'scripts/test-tower-progress-contract.js';

const HUNKS = [
  {
    id: 'battle.signature',
    file: 'src/services/BattleService.js',
    mode: 'replace',
    anchor: 'function calcPlayerPower(player) {\n',
    text: 'function calcPlayerPower(player, options = {}) {\n',
    marker: 'function calcPlayerPower(player, options = {}) {',
  },
  {
    id: 'battle.extraAttrs',
    file: 'src/services/BattleService.js',
    mode: 'before',
    anchor: '  applyPercentLinkedAttrs(base);\n',
    text: [
      '  // Mode-only bonuses (Hư Thiên Bảo Điện picks) join before percent links so 51-54',
      '  // scale base HP/ATK/DEF/SPD like every other source.',
      '  if (options && options.extraAttrs) addAttrs(base, options.extraAttrs);',
      '',
    ].join('\n'),
    marker: 'if (options && options.extraAttrs) addAttrs(base, options.extraAttrs);',
  },
  {
    id: 'tower.require',
    file: 'src/handlers/tower.js',
    mode: 'before',
    anchor: "const { addRewardToPlayer } = require('./raid');\n",
    text: "const towerProgress = require('../services/TowerProgressService');\n",
    marker: "require('../services/TowerProgressService')",
  },
  {
    id: 'tower.addTowerSkillChoices',
    file: 'src/handlers/tower.js',
    mode: 'before',
    anchor: 'function buildTowerInfoPayload(info, extra = {}) {\n',
    text: [
      '// Add pending bonus picks (one per 10 floors, many after a quick challenge).',
      '// Keeps the offer already on screen; a new offer is rolled only when none is shown.',
      'function addTowerSkillChoices(info, count, floor = 1) {',
      "  if (!info || typeof info !== 'object') return info;",
      '  const picks = Math.max(0, toSafeInt(count, 0));',
      '  if (picks <= 0) return info;',
      '  info.slotlist = normalizeTowerSlotlist(info.slotlist);',
      '  info.skills = normalizeTowerOptionalSkills(info.skills, info.slotlist);',
      '  info.skillCount = Math.max(0, toSafeInt(info.skillCount, 0)) + picks;',
      '  if (info.skills.length <= 0) {',
      '    const equipped = info.slotlist.map((slot) => normalizeTowerSkillId(slot)).filter((id) => id > 0);',
      '    info.skills = buildTowerSkillChoices(floor, equipped);',
      '  }',
      '  if (info.skills.length <= 0) info.skillCount = 0;',
      '  return info;',
      '}',
      '',
      '',
    ].join('\n'),
    marker: 'function addTowerSkillChoices(',
    conflicts: ['function addTowerSkillChoices('],
  },
  {
    id: 'tower.slotUnlock',
    file: 'src/handlers/tower.js',
    mode: 'replace',
    anchor: '    const limit = getTowerSlotLimit();\n    const targetIndex',
    text: [
      '    // Slots open by TowerBaseConfig.attrCond like the client lock icons.',
      '    const limit = Math.min(getTowerSlotLimit(), towerProgress.getUnlockedSlotCount(swordInfo));',
      '    const targetIndex',
    ].join('\n'),
    marker: 'towerProgress.getUnlockedSlotCount(swordInfo)',
  },
  {
    id: 'tower.pickRepeat',
    file: 'src/handlers/tower.js',
    mode: 'before',
    anchor: '    const oldSlot = swordInfo.slotlist[targetIndex] || null;\n',
    text: [
      '    // A double tap on confirm resends the same {select, replace}; after the first pick it would',
      '    // overwrite that slot with an offer the player never saw and spend a second pick.',
      '    const lastPick = session && session.towerLastPick;',
      '    if (lastPick && lastPick.index === targetIndex && Date.now() - lastPick.at < 1500) {',
      '      return {',
      '        tag: 3700,',
      '        msgUid,',
      "        data: buildTowerInfoPayload(swordInfo, { result: -1, msg: 'tower_pick_repeat' }),",
      '      };',
      '    }',
      '',
    ].join('\n'),
    marker: "msg: 'tower_pick_repeat'",
  },
  {
    id: 'tower.reoffer',
    file: 'src/handlers/tower.js',
    mode: 'replace',
    anchor: [
      '    swordInfo.skills.splice(selectIndex, 1);',
      '    swordInfo.skillCount = Math.max(0, toSafeInt(swordInfo.skillCount, 0) - 1);',
      '    if (swordInfo.skillCount <= 0) swordInfo.skills = [];',
      '',
    ].join('\n'),
    text: [
      '    if (session) session.towerLastPick = { index: targetIndex, at: Date.now() };',
      '    swordInfo.skillCount = Math.max(0, toSafeInt(swordInfo.skillCount, 0) - 1);',
      '    swordInfo.skills = [];',
      '    if (swordInfo.skillCount > 0) {',
      '      // Every remaining pick gets a fresh offer; the client keeps the panel open while skills is non-empty.',
      '      const equipped = normalizeTowerSlotlist(swordInfo.slotlist).map((slot) => slot.id);',
      '      swordInfo.skills = buildTowerSkillChoices(Math.max(1, swordInfo.curlayer), equipped);',
      '      if (swordInfo.skills.length <= 0) swordInfo.skillCount = 0;',
      '    }',
      '',
    ].join('\n'),
    marker: 'Every remaining pick gets a fresh offer',
  },
  {
    id: 'tower.export',
    file: 'src/handlers/tower.js',
    mode: 'after',
    anchor: '  grantTowerSkillChoice,\n',
    text: '  addTowerSkillChoices,\n',
    marker: '  addTowerSkillChoices,\n',
  },
  {
    id: 'raid.require',
    file: 'src/handlers/raid.js',
    mode: 'after',
    anchor: "const arenaReadModel = require('../services/ArenaReadModelService');\n",
    text: "const towerProgress = require('../services/TowerProgressService');\n",
    marker: "require('../services/TowerProgressService')",
  },
  {
    id: 'raid.sweepHandler',
    file: 'src/handlers/raid.js',
    mode: 'before',
    anchor: '// ========== reward helpers ==========\n',
    text: [
      'function buildTowerUpdateInfo(towerInfo) {',
      '  return {',
      '    maxlayer: towerInfo.maxlayer,',
      '    curlayer: towerInfo.curlayer,',
      '    skills: towerInfo.skills,',
      '    skillCount: towerInfo.skillCount,',
      '    slotlist: towerInfo.slotlist,',
      '  };',
      '}',
      '',
      '// Type-9 reply without a battle: the client applies updateInfo and opens the reward',
      '// popup only for a non-empty list, so an empty list just resyncs its buttons.',
      'function buildTowerNoopReply(towerInfo, msgUid, extra = {}) {',
      '  return {',
      '    tag: 2300,',
      '    msgUid,',
      '    data: { result: 0, id: towerInfo.curlayer, rewards: [], updateInfo: buildTowerUpdateInfo(towerInfo), ...extra },',
      '  };',
      '}',
      '',
      '// Quick challenge (ClimbingTowerModel.onFighting(3) sends index 0): no battle, jump to',
      '// the sweep floor and pay its speed-clear tier. The client applies a type-9 reply',
      '// without fightResult as updateInfo + reward popup (RaidInfoModel case 9).',
      'async function handleTowerSweep(player, towerInfo, plan, session, msgUid) {',
      '  // eslint-disable-next-line global-require',
      "  const tower = require('./tower');",
      '  towerInfo.curlayer = plan.target;',
      '  towerInfo.score = Math.max(0, toSafeInt(towerInfo.score, 0)) + plan.score;',
      '  towerInfo.dailyCount = Math.max(0, toSafeInt(towerInfo.dailyCount, 0)) + plan.floors;',
      '  tower.addTowerSkillChoices(towerInfo, plan.picks, plan.target);',
      '',
      '  const { rewardInfo, syncRewards } = grantRewardInfo(player, plan.rewards);',
      '  const taskChanged = !!addTempleChallengeCount(player, 1);',
      '  session.lastBattle = null;',
      '  if (session.userId) await playerService.savePlayer(session.userId, player, { returnSaved: false });',
      '  logger.info(`[Tower] sweep user=${session.userId} ${plan.from}->${plan.target} picks=${plan.picks}`);',
      '',
      '  const packets = [];',
      '  if (syncRewards.length > 0) {',
      '    packets.push({ tag: 1202, msgUid: 0, data: buildRewardItemSync(player, syncRewards) });',
      '  }',
      '  if (taskChanged) packets.push(...buildTaskSyncPackets(player));',
      '  packets.push({',
      '    tag: 2300,',
      '    msgUid,',
      '    data: {',
      '      result: 0,',
      '      id: plan.target,',
      '      sweep: 1,',
      '      rewards: plan.rewards.map((reward) => ({ ...reward })),',
      '      rewardInfo,',
      '      updateInfo: buildTowerUpdateInfo(towerInfo),',
      '    },',
      '  });',
      '  return packets;',
      '}',
      '',
      '',
    ].join('\n'),
    marker: 'async function handleTowerSweep(',
    conflicts: ['function buildTowerUpdateInfo(', 'function buildTowerNoopReply(', 'function handleTowerSweep('],
  },
  {
    id: 'raid.sweepIntercept',
    file: 'src/handlers/raid.js',
    mode: 'after',
    anchor: '  const towerInfo = tower.ensureTowerInfo(player);\n',
    text: [
      '  // While curlayer is below the sweep floor the native client only offers quick challenge',
      '  // (getCurTowerState 3), so any type-9 request is the sweep; index 0 with nothing left is a resync.',
      '  const sweepPlan = towerProgress.buildSweepPlan(towerInfo);',
      '  if (sweepPlan) return handleTowerSweep(player, towerInfo, sweepPlan, session, msgUid);',
      '  if (towerProgress.isSweepRequest(params)) return buildTowerNoopReply(towerInfo, msgUid);',
      '',
    ].join('\n'),
    marker: 'const sweepPlan = towerProgress.buildSweepPlan(towerInfo);',
  },
  {
    id: 'raid.invalidLayer',
    file: 'src/handlers/raid.js',
    mode: 'replace',
    optional: true,
    anchor: "  if (!row) return { tag: 2300, msgUid, data: { result: -1, msg: 'invalid tower layer' } };\n",
    text: "  if (!row) return buildTowerNoopReply(towerInfo, msgUid, { result: -1, msg: 'invalid tower layer' });\n",
    marker: "buildTowerNoopReply(towerInfo, msgUid, { result: -1, msg: 'invalid tower layer' })",
  },
  {
    id: 'raid.battleAttrs',
    file: 'src/handlers/raid.js',
    mode: 'replace',
    anchor: [
      '  const playerAttrs = battle.calcPlayerPower(player);',
      '  const monsterAttrs = battle.getMonsterAttrs(monsterId);',
      '  const simulatedResult = battle.simulateBattle(playerAttrs, monsterAttrs, { enforcePlayerMonsterMinDamage: true, player });',
      '  const result = buildPveProgressFightResult(playerAttrs, monsterAttrs, simulatedResult, 9);',
      '',
    ].join('\n'),
    text: [
      '  const playerAttrs = battle.calcPlayerPower(player, { extraAttrs: towerProgress.getTowerBattleAttrs(towerInfo) });',
      '  const monsterAttrs = battle.getMonsterAttrs(monsterId);',
      '  const simulatedResult = battle.simulateBattle(playerAttrs, monsterAttrs, { enforcePlayerMonsterMinDamage: true, player });',
      '  const result = buildPveProgressFightResult(playerAttrs, monsterAttrs, simulatedResult, 9);',
      '',
    ].join('\n'),
    marker: 'extraAttrs: towerProgress.getTowerBattleAttrs(towerInfo)',
  },
  {
    id: 'raid.beforeWin',
    file: 'src/handlers/raid.js',
    mode: 'replace',
    anchor: [
      '  const rewards = [];',
      '  if (result.win) {',
      '    towerInfo.curlayer = Math.max(towerInfo.curlayer, floor);',
      '',
    ].join('\n'),
    text: [
      '  const rewards = [];',
      '  const curlayerBefore = towerInfo.curlayer;',
      '  const maxlayerBefore = towerInfo.maxlayer;',
      '  if (result.win) {',
      '    towerInfo.curlayer = Math.max(towerInfo.curlayer, floor);',
      '',
    ].join('\n'),
    marker: 'const curlayerBefore = towerInfo.curlayer;',
  },
  {
    id: 'raid.picks',
    file: 'src/handlers/raid.js',
    mode: 'replace',
    anchor: [
      "    if (typeof tower.grantTowerSkillChoice === 'function') {",
      '      tower.grantTowerSkillChoice(towerInfo, floor);',
      '    }',
      '',
    ].join('\n'),
    text: [
      '    // One bonus pick per 10 new floors (1, 11, 21, ...), not one per win.',
      '    tower.addTowerSkillChoices(towerInfo, towerProgress.countSkillPicks(curlayerBefore, towerInfo.curlayer), floor);',
      '',
    ].join('\n'),
    marker: 'towerProgress.countSkillPicks(curlayerBefore, towerInfo.curlayer)',
  },
  {
    id: 'raid.rank',
    file: 'src/handlers/raid.js',
    mode: 'after',
    anchor: [
      '  const taskChanged = result.win ? !!addTempleChallengeCount(player, 1) : false;',
      '  session.lastBattle = null;',
      '  if (session.userId) await playerService.savePlayer(session.userId, player, { returnSaved: false });',
      '',
    ].join('\n'),
    text: '  if (towerInfo.maxlayer > maxlayerBefore) await towerProgress.syncTowerRank(player);\n',
    marker: 'towerProgress.syncTowerRank(player)',
  },
];

// raid.js depends on tower.js and BattleService.js, so it is restored first.
const RESTORE_ORDER = ['src/handlers/raid.js', 'src/handlers/tower.js', 'src/services/BattleService.js'];

function parseArgs(argv) {
  const out = { apply: false, stage: false, rollback: '', root: path.resolve(__dirname, '..') };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--apply') out.apply = true;
    else if (argv[i] === '--stage') out.stage = true;
    else if (argv[i] === '--rollback') out.rollback = argv[++i] || '';
    else if (argv[i] === '--root') out.root = path.resolve(argv[++i] || '.');
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  return out;
}

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const count = (hay, needle) => hay.split(needle).length - 1;
const crlf = (s) => s.replace(/\n/g, '\r\n');

function readText(abs, rel) {
  const bytes = fs.readFileSync(abs);
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error(`NON_UTF8 ${rel}: not valid UTF-8, patch by hand`);
  return { bytes, text };
}

// Patch in memory. Each hunk is matched with LF first, then CRLF, and inserted in the same style.
function plan(root) {
  const files = {};
  const report = [];
  for (const hunk of HUNKS) {
    const abs = path.join(root, hunk.file);
    if (!files[hunk.file]) {
      if (!fs.existsSync(abs)) throw new Error(`missing ${hunk.file}`);
      const { bytes, text } = readText(abs, hunk.file);
      files[hunk.file] = { abs, bytes, original: text, next: text };
    }
    const entry = files[hunk.file];
    if (entry.next.includes(hunk.marker) || entry.next.includes(crlf(hunk.marker))) {
      report.push([hunk.id, 'ALREADY', hunk]);
      continue;
    }
    const clash = (hunk.conflicts || []).find((needle) => entry.next.includes(needle));
    if (clash) { report.push([hunk.id, `CONFLICT ${clash}`, hunk]); continue; }
    let anchor = hunk.anchor;
    let text = hunk.text;
    let hits = count(entry.next, anchor);
    if (hits === 0 && count(entry.next, crlf(anchor)) > 0) {
      anchor = crlf(anchor);
      text = crlf(text);
      hits = count(entry.next, anchor);
    }
    if (hits !== 1) {
      const state = hits === 0 ? 'MISSING' : `AMBIGUOUS x${hits}`;
      report.push([hunk.id, hunk.optional ? `SKIP (optional, ${state})` : state, hunk]);
      continue;
    }
    const at = entry.next.indexOf(anchor);
    const before = entry.next.slice(0, at);
    const after = entry.next.slice(at + anchor.length);
    if (hunk.mode === 'replace') entry.next = before + text + after;
    else if (hunk.mode === 'before') entry.next = before + text + anchor + after;
    else entry.next = before + anchor + text + after;
    report.push([hunk.id, 'OK', hunk]);
  }
  return { files, report };
}

function checkSyntax(abs) {
  execFileSync(process.execPath, ['--check', abs], { stdio: 'pipe' });
}

// node --check needs a .js name; the copy sits next to the original so module type matches.
function checkPatchedSyntax(changed) {
  for (const [, f] of changed) {
    const tmp = `${f.abs}.${RELEASE}.check.js`;
    try {
      fs.writeFileSync(tmp, f.next);
      checkSyntax(tmp);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }
}

function rollback(root, dir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const rels = Object.keys(manifest.files)
    .sort((a, b) => (RESTORE_ORDER.indexOf(a) + 1 || 99) - (RESTORE_ORDER.indexOf(b) + 1 || 99));
  const state = rels.map((rel) => {
    const current = sha(fs.readFileSync(path.join(root, rel)));
    const meta = manifest.files[rel];
    return { rel, patched: current === meta.after, original: current === meta.before };
  });
  if (state.every((s) => s.original)) { console.log('already rolled back, nothing to do.'); return; }
  const drift = state.filter((s) => !s.patched && !s.original);
  const mixed = state.filter((s) => s.original);
  if (drift.length > 0 || mixed.length > 0) {
    drift.forEach((s) => console.error(`ROLLBACK_DRIFT ${s.rel}: changed after the patch`));
    mixed.forEach((s) => console.error(`ALREADY_ORIGINAL ${s.rel}`));
    throw new Error('nothing restored; restore these files by hand from the backup folder');
  }
  for (const rel of rels) {
    const original = fs.readFileSync(path.join(dir, rel));
    if (sha(original) !== manifest.files[rel].before) throw new Error(`BACKUP_CORRUPT ${rel}`);
  }
  for (const rel of rels) {
    fs.writeFileSync(path.join(root, rel), fs.readFileSync(path.join(dir, rel)));
    console.log(`restored ${rel}`);
  }
  console.log('rollback done; TowerProgressService.js is left in place, unused. Restart the game processes.');
}

function copyTree(from, to) {
  fs.cpSync(from, to, { recursive: true, dereference: false });
}

function stage(root, changed) {
  const dir = `${root}_stage_${RELEASE}`;
  if (fs.existsSync(dir)) throw new Error(`stage folder exists, remove it first: ${dir}`);
  fs.mkdirSync(dir);
  copyTree(path.join(root, 'src'), path.join(dir, 'src'));
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.copyFileSync(path.join(root, TEST), path.join(dir, TEST));
  fs.copyFileSync(path.join(root, 'package.json'), path.join(dir, 'package.json'));
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
  for (const [rel, f] of changed) fs.writeFileSync(path.join(dir, rel), f.next);
  console.log(`\nstaged patched copy: ${dir}`);
  try {
    const out = execFileSync(process.execPath, [TEST], { cwd: dir, stdio: 'pipe', encoding: 'utf8' });
    console.log(out.trim());
    console.log('contract test PASSED on the patched live code. Next: --apply');
  } catch (err) {
    console.error((err.stdout || '') + (err.stderr || ''));
    console.error('contract test FAILED on the patched live code; live files untouched.');
    process.exitCode = 4;
  }
  console.log(`remove the stage folder when done: rm -r ${dir}`);
}

function apply(root, changed) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '_');
  const backup = path.resolve(root, '../../_ai_workbench/backups', `${RELEASE}_${stamp}`);
  const manifest = { release: RELEASE, at: new Date().toISOString(), root, files: {} };
  for (const [rel, f] of changed) {
    const dest = path.join(backup, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, f.bytes);
    manifest.files[rel] = { before: sha(f.bytes), after: sha(Buffer.from(f.next, 'utf8')) };
  }
  fs.writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // Write in place so owner, mode and symlinks stay as they are.
  const written = [];
  try {
    for (const rel of RESTORE_ORDER.slice().reverse()) {
      const f = changed.find(([name]) => name === rel);
      if (!f) continue;
      fs.writeFileSync(f[1].abs, f[1].next);
      written.push(f);
    }
  } catch (err) {
    for (const [, f] of written) fs.writeFileSync(f.abs, f.bytes);
    console.error(`apply failed, originals restored: ${err.message}`);
    process.exit(3);
  }
  console.log(`\napplied to ${written.length} file(s). backup: ${backup}`);
  console.log(`rollback: node ${path.relative(root, __filename)} --rollback ${backup}`);
  console.log('next: restart the game processes (pm2 lhs-s<number>) one at a time and check /ready.');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = args.root;
  if (args.rollback) { rollback(root, path.resolve(args.rollback)); return; }

  const service = path.join(root, 'src/services/TowerProgressService.js');
  if (!fs.existsSync(service)) throw new Error('copy src/services/TowerProgressService.js first');
  checkSyntax(service);

  const { files, report } = plan(root);
  report.forEach(([id, state]) => console.log(`${state.padEnd(24)} ${id}`));
  const bad = report.filter(([, state]) => !['OK', 'ALREADY'].includes(state) && !state.startsWith('SKIP'));
  if (bad.length > 0) {
    console.error(`\n${bad.length} required hunk(s) cannot be placed: nothing written. Merge them by hand.`);
    process.exit(2);
  }
  const partial = report.some(([, s]) => s === 'ALREADY') && report.some(([, s]) => s === 'OK');
  if (partial) console.warn('\nwarning: some hunks are already present; check the file was not half-merged by hand.');
  const changed = Object.entries(files).filter(([, f]) => f.next !== f.original);
  if (changed.length === 0) { console.log('\nalready applied, nothing to do.'); return; }
  checkPatchedSyntax(changed);

  if (args.stage) { stage(root, changed); return; }
  if (!args.apply) {
    console.log(`\ndry run: ${changed.length} file(s) would change, syntax OK. Next: --stage, then --apply.`);
    return;
  }
  apply(root, changed);
}

try {
  main();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

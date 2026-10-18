'use strict';
// Read-only: config/source inspection only. No player load, RPC or persistence.
const fs = require('fs'), cp = require('child_process'), crypto = require('crypto');
const procs = JSON.parse(cp.execSync('pm2 jlist', { encoding: 'utf8' })).filter(p => /^lhs-s100[1-5]$/.test(p.name));
const pm = procs.find(p => p.name === 'lhs-s1001');
if (!pm || pm.pm2_env.pm_cwd !== '/linhhoasu/lhs/newServer') throw Error('RUNTIME_SCOPE_MISMATCH');
const keys = ['SERVER_ID', 'CONFIG_BIN_PATH', 'DROP_LEVEL_100_ENABLED', 'DROP_LEVEL_100_DISABLED', 'DROP_LEVEL_46_ENABLED', 'BOX_UPGRADE_MAX_WAIT_MS', 'BOX_UPGRADE_SPEEDUP_MAX_WAIT_MS', 'BOX_UPGRADE_SKIP_UNIT_MS', 'FASHION_CONTENT_OVERLAY_PATH', 'FASHION_CHOICE_OVERLAY_PATH', 'FASHION_CHOICE_STARS_OVERLAY_PATH'];
const pick = p => Object.fromEntries(keys.map(k => [k, p.pm2_env[k] ?? p.pm2_env.env?.[k] ?? null]));
for (const [k, v] of Object.entries(pick(pm))) if (v !== null) process.env[k] = String(v);
const lp = require.resolve('./src/logger');
require.cache[lp] = { id: lp, filename: lp, loaded: true, exports: { info() {}, warn() {}, error() {}, debug() {} } };
const c = require('./src/services/ConfigService'), tables = c.loadAllTables();
const languagePath = '/linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin';
const language = c.decodeTables(fs.readFileSync(languagePath)).LanguageConfig;
const text = id => language[id]?.cn ?? null;
const tiers = tables.BoxTierConfig, tasks = tables.TaskConfig, bosses = tables.DemonBossConfig || {};
const finiteMax = t => Math.max(0, ...Object.keys(t || {}).map(Number).filter(Number.isFinite));
const maxBoss = finiteMax(bosses);
const rows = Object.values(tiers).sort((a,b) => a.id-b.id).map(t => {
  const cond = (t.task || []).map(id => {
    const r = tasks[id]; if (!r) throw Error('TASK_MISSING:' + id);
    return { id, activeId: r.activeId, target: r.taskValue1, type: r.type, textId: r.textId, text: text(r.textId), reward: r.reward };
  });
  const boss = cond.find(x => x.activeId === 39)?.target;
  const duration = Math.max(0, Number(t.timeCost)) * 1000;
  const caps = [false, true].map(fast => {
    const val = Number(process.env[fast ? 'BOX_UPGRADE_SPEEDUP_MAX_WAIT_MS' : 'BOX_UPGRADE_MAX_WAIT_MS']);
    return Math.min(duration, Number.isFinite(val) && val > 0 ? Math.floor(val) : Number.MAX_SAFE_INTEGER) / 1000;
  });
  return { from: t.id, to: tiers[t.id+1] ? t.id+1 : null, tasks: cond,
    boxLevel: cond.find(x => x.activeId === 9)?.target, playerLevel: cond.find(x => x.activeId === 6)?.target,
    bossStage: boss, bossConfigured: !!bosses[boss], bossRow: bosses[boss] || null,
    costs: t.tierUpCost || [], totalCost: (t.tierUpCost || []).reduce((a,b) => a+b, 0), seconds: t.timeCost,
    effectiveSecondsNormal: caps[0], effectiveSecondsFast: caps[1], count: t.count };
});
const files = ['src/config/dropLevel100.js', 'src/handlers/compat.js', 'src/handlers/playerPayload.js', 'src/handlers/account.js', 'src/handlers/box.js', 'src/utils/boxTiming.js', 'src/services/ConfigService.js'];
const hashes = Object.fromEntries(files.map(f => [f, crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
const web = '/linhhoasu/webgame/game/';
for (const f of ['index.html', 'js/lhs-box-tier100-v1.js', 'js/main.min_drop100.js']) hashes[web+f] = crypto.createHash('sha256').update(fs.readFileSync(web+f)).digest('hex');
const source = fs.readFileSync(web+'js/main.min_drop100.js', 'utf8');
const panelAt = source.indexOf('a.updateUI=function(){var t=Y.BoxLayerModel.getBoxInfo(),e=Y.Config.BoxTierConfig[t.tier]');
const addon = fs.readFileSync(web+'js/lhs-box-tier100-v1.js','utf8');
const assets = tables.AssetsConfig;
const out = { at: new Date().toISOString(), readOnly: true, directPlayerWrites: 0,
  representativeNode: pm.name, pm2: procs.map(p => ({ name: p.name, cwd: p.pm2_env.pm_cwd, status: p.pm2_env.status, configEnvironment: pick(p) })),
  sourceHashes: hashes, tierCount: rows.length, maxLevel: finiteMax(tables.RoleLevelConfig), maxBoxLevel: finiteMax(tables.BoxConfig),
  maxBossStage: maxBoss, lastBoss: bosses[maxBoss], boxTier10: tiers[10], nextTierExists: !!tiers[11],
  timing: { skipUnitMs: require('./src/utils/boxTiming').getBoxSkipUnitMs() },
  items: [1, 4, 6].map(id => ({ id, name: text(assets[id]?.name), desc: text(assets[id]?.desc) })),
  addonVersion: addon.match(/var VERSION = '([^']+)'/)?.[1],
  panelSnippet: panelAt >= 0 ? source.slice(panelAt, panelAt+1750) : null,
  boxTierTasks10: rows.find(r => r.from === 10)?.tasks,
  bossBeyondConfigFromTier: rows.find(r => r.to !== null && !r.bossConfigured)?.from,
  rows };
console.log(JSON.stringify(out));

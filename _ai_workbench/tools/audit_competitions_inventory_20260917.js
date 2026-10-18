'use strict';
// No handler invocation, model initialization, server startup, or DB mutation.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const root = process.cwd();
const dotenv = require('dotenv');
const common = dotenv.parse(fs.readFileSync(path.join(root, '.env')));
const processes = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8', timeout: 10000 }));
const nodes = processes.filter(p => /^lhs-s100[1-4]$/.test(p.name));
const effective = p => ({ ...common, ...p.pm2_env });
Object.assign(process.env, Object.fromEntries(Object.entries(effective(nodes[0])).filter(([k,v]) => typeof v === 'string')));
const logPath = require.resolve('./src/logger');
require.cache[logPath] = { id: logPath, filename: logPath, loaded: true, exports: { info(){}, warn(){}, error(){}, debug(){} } };
const config = require('./src/services/ConfigService');
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const files = ['src/handlers/arena.js','src/handlers/raid.js','src/handlers/index.js','src/net/WSServer.js',
 'src/services/BattleService.js','src/services/PlayerService.js','src/services/PlayerMutationService.js',
 'src/services/RankService.js','src/services/ArenaReadModelService.js','src/services/ArenaSettlementService.js',
 'src/services/RoleAppearanceService.js','src/services/HomelandSkinUnlockService.js',
 'src/services/ConfigService.js','src/handlers/upgrade.js','src/app.js','src/router.js',
 'src/services/CrossServerEventService.js','src/services/CrossEventSettlementService.js','src/config/crossServerEventSchedule.json',
 'src/db/models/CrossEventEntry.js','src/db/models/CrossEventSettlement.js',
 'src/db/models/ArenaSettlement.js','src/db/models/ArenaFightLog.js','src/db/models/Player.js'];
const envKeys = ['SERVER_ID','HTTP_PORT','REDIS_PREFIX','ARENA_SETTLEMENT_ENABLED','ARENA_SETTLEMENT_APPROVED',
 'ARENA_SETTLEMENT_ACTIVATION_AT','DISABLED_SYSTEM_IDS','FORCE_UNLOCK_SYSTEM_IDS','CONFIG_BIN_PATH','CROSS_EVENT_ENABLED'];
const result = { at: new Date().toISOString(), productionWrites: 0, processes: nodes.map(p => ({name:p.name,pid:p.pid,
 status:p.pm2_env.status,restarts:p.pm2_env.restart_time,startedAt:p.pm2_env.pm_uptime,cwd:p.pm2_env.pm_cwd,
 env:Object.fromEntries(envKeys.map(k=>[k,effective(p)[k]??null]))})), hashes:{}, config:{}, db:[] };
for (const rel of files) result.hashes[rel] = hash(path.join(root,rel));
result.serverSourcesChangedAfterStart=nodes.map(p=>({name:p.name,files:files.filter(rel=>fs.statSync(path.join(root,rel)).mtimeMs>p.pm2_env.pm_uptime)}));
for (const rel of ['index.html','js/lhs-arena-v1.js','js/lhs-socket-send-v3.js','js/main.min_drop100.js'])
 result.hashes['client/'+rel] = hash('/linhhoasu/webgame/game/'+rel);
const names = ['ArenaBaseConfig','CrossArenaBaseConfig','CrossArenaOpenConfig','TopCombatConfig','TopCombatFirstRewardConfig','TopCombatMatchRangeConfig',
 'TopCombatDayRankRewardConfig','TopCombatWeeklyRankRewardConfig','ArenaDayRankRewardConfig','ArenaWeeklyRankRewardConfig'];
for (const name of names) {
 const t=config.get(name)||{}; result.config[name]={count:Object.keys(t).length,rows:Object.entries(t).slice(0,6)};
}
const lang = config.decodeTables(fs.readFileSync('/linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin')).LanguageConfig,
 systems=config.get('SystemConfig')||{};
result.system315=systems[315];
result.languageNames=Object.entries(lang).filter(([k,v])=>/武道会|巅峰演武|võ đạo|đỉnh phong diễn võ/i.test(JSON.stringify(v))).slice(0,12);
const consts=config.get('ConstConfig')||{};
result.ticketConstants=Object.fromEntries(Object.entries(consts).filter(([k])=>/arena|topcombat/i.test(k)));
result.systemNames=Object.values(systems).map(r=>({...r,label:lang[r.name]?.cn})).filter(r=>/võ đạo|diễn võ|thiên hạ đệ nhất/i.test(r.label||''));
result.crossSchedule=JSON.parse(fs.readFileSync('./src/config/crossServerEventSchedule.json','utf8'));
const MongoClient=require('mongoose').mongo.MongoClient;
(async()=>{
 const mongo = new MongoClient('mongodb://127.0.0.1:27017', {serverSelectionTimeoutMS:5000});
 await mongo.connect();
 try {
  for (const p of nodes) {
   const serverId=Number(effective(p).SERVER_ID), db=mongo.db('lhs_s'+serverId);
   const settlements=await db.collection('arenasettlements').aggregate([
    {$sort:{cutoffAt:-1}},{$limit:8},{$project:{_id:1,period:1,periodKey:1,cutoffAt:1,state:1,attempts:1,lastError:1,completedAt:1,
      recipients:{$size:{$ifNull:['$recipients',[]]}},delivered:{$size:{$ifNull:['$delivered',[]]}},expired:{$size:{$ifNull:['$expired',[]]}}}}
   ],{maxTimeMS:5000}).toArray();
   const arenaMailCount=await db.collection('mails').countDocuments({eventKey:{$regex:'^arena_'+serverId+'_'}},{maxTimeMS:5000});
   const topPlayers=await db.collection('players').aggregate([
    {$match:{'topCombatInfo.rank':{$exists:true}}},{$project:{_id:0,rank:'$topCombatInfo.rank',maxRank:'$topCombatInfo.maxRank',
     claims:{$size:{$ifNull:['$topCombatInfo.records',[]]}},logs:{$size:{$ifNull:['$topCombatInfo.loglist',[]]}}}},
    {$group:{_id:'$rank',players:{$sum:1},claims:{$sum:'$claims'},logs:{$sum:'$logs'}}},{$sort:{_id:1}},{$limit:15}
   ],{maxTimeMS:5000}).toArray();
   const counts={players:await db.collection('players').countDocuments({}, {maxTimeMS:5000}),
    arenaLogs24h:await db.collection('arenafightlogs').countDocuments({createdAt:{$gte:new Date(Date.now()-86400000)}},{maxTimeMS:5000}),
    topCombat:await db.collection('players').countDocuments({'topCombatInfo.rank':{$exists:true}},{maxTimeMS:5000}),
    crossArena:await db.collection('players').countDocuments({'crossArenaInfo':{$exists:true}},{maxTimeMS:5000})};
   const crossStates=await db.collection('players').aggregate([
    {$match:{'crossArenaInfo':{$exists:true}}},{$group:{_id:null,rows:{$sum:1},minScore:{$min:'$crossArenaInfo.score'},
     maxScore:{$max:'$crossArenaInfo.score'},totalCount:{$sum:'$crossArenaInfo.dailyCount'},logCount:{$sum:{$size:{$ifNull:['$crossArenaInfo.loglist',[]]}}}}}
   ],{maxTimeMS:5000}).toArray();
   result.db.push({serverId,counts,settlements,arenaMailCount,topPlayers,crossStates});
  }
  const identity=mongo.db('lhs_s1001');
  result.crossEntries=await identity.collection('crossevententries').aggregate([
   {$group:{_id:{cycleKey:'$cycleKey',event:'$event'},rows:{$sum:1},servers:{$addToSet:'$serverId'},maxScore:{$max:'$score'}}},{$limit:12}
  ],{maxTimeMS:5000}).toArray();
  result.crossSettlements=await identity.collection('crosseventsettlements').aggregate([
   {$sort:{cutoffAt:-1}},{$limit:6},{$project:{_id:1,event:1,cycleKey:1,cutoffAt:1,state:1,recipients:{$size:{$ifNull:['$recipients',[]]}},
    delivered:{$size:{$ifNull:['$delivered',[]]}}}}
  ],{maxTimeMS:5000}).toArray();
 } finally { await mongo.close(); }
 for (const p of nodes) {
  const log=p.pm2_env.pm_err_log_path;
  if(!log||!fs.existsSync(log))continue;
  const fd=fs.openSync(log,'r');
  try { const size=fs.fstatSync(fd).size, b=Buffer.alloc(Math.min(size,131072));fs.readSync(fd,b,0,b.length,size-b.length);
   const lines=b.toString('utf8').split('\n').filter(s=>/ArenaSettlement|TopCombat|top.combat|\[Arena\]/i.test(s));
  (result.errorLogMatches??=[]).push({name:p.name,tailBytes:b.length,matches:lines.slice(-8).map(s=>s.slice(0,500))});
  } finally { fs.closeSync(fd); }
 }
 result.ready=nodes.map(p=>({name:p.name,code:execFileSync('curl',['--silent','--show-error','--max-time','5','--output','/dev/null','--write-out','%{http_code}',
  'http://127.0.0.1:'+effective(p).HTTP_PORT+'/ready'],{encoding:'utf8',timeout:6000}).trim()}));
 result.publicArenaAddonHash=crypto.createHash('sha256').update(execFileSync('curl',['--fail','--silent','--show-error','--max-time','10',
  'http://127.0.0.1:81/js/lhs-arena-v1.js'],{timeout:12000})).digest('hex');
 console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.name+': '+e.message);process.exitCode=1;});

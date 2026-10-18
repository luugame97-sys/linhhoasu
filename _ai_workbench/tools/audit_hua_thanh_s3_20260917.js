'use strict';
// Read-only: raw Mongo find and bounded log tails; no game models/handlers/startup.
const fs = require('fs'), crypto = require('crypto'), { execFileSync } = require('child_process');
const app = process.cwd();
const processes = JSON.parse(execFileSync('pm2', ['jlist'], { encoding:'utf8', timeout:10000 }));
const target = processes.find(p => p.name === 'lhs-s1003');
if (!target || target.pm2_env.pm_cwd !== '/linhhoasu/lhs/newServer') throw Error('S3_RUNTIME_MISMATCH');
const common = require('dotenv').parse(fs.readFileSync(app+'/.env'));
const effective = { ...common, ...target.pm2_env };
Object.assign(process.env, Object.fromEntries(Object.entries(effective).filter(([,v])=>typeof v==='string')));
const logger = require.resolve('./src/logger');
require.cache[logger] = { id:logger, filename:logger, loaded:true, exports:{ info(){},warn(){},error(){},debug(){} } };
const config = require('./src/services/ConfigService');
const tables = config.loadAllTables();
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const envKeys = ['SERVER_ID','HTTP_PORT','WS_PORT','REDIS_PREFIX','CONFIG_BIN_PATH','DISABLED_SYSTEM_IDS','FORCE_UNLOCK_SYSTEM_IDS'];
const state = p => ({name:p.name,pid:p.pid,cwd:p.pm2_env.pm_cwd,status:p.pm2_env.status,restarts:p.pm2_env.restart_time,startedAt:p.pm2_env.pm_uptime});
const out = {at:new Date().toISOString(),productionWrites:0,processes:processes.filter(p=>/^lhs-/.test(p.name)).map(state),
 env:Object.fromEntries(envKeys.map(k=>[k,effective[k]??null])),hashes:{},players:[],config:{},logs:[]};
for (const rel of ['src/handlers/task.js','src/handlers/role.js','src/handlers/upgrade.js','src/handlers/playerPayload.js',
 'src/services/MainTaskProgressService.js','src/services/RealmTaskProgressService.js','src/services/SystemUnlockService.js','src/net/WSServer.js']) {
 if(fs.existsSync(app+'/'+rel)) out.hashes[rel]=sha(fs.readFileSync(app+'/'+rel));
}
const {MongoClient}=require('mongodb');
(async()=>{const mongo = new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:5000});await mongo.connect();
try {
 const db=mongo.db('lhs_s1003');
 const projection={name:1,playerId:1,userId:1,level:1,exp:1,createTime:1,createdAt:1,updatedAt:1,taskInfo:1,'roleInfo.realmInfo':1,
 'roleInfo.stage':1,'roleInfo.stageId':1,'roleInfo.stageFailedTime':1,
 systemUnlockInfo:1,'other_attr_info.mainTaskProgress':1,'other_attr_info.guide':1,raidInfo:1};
 let players=await db.collection('players').find({name:'Hứa Thanh'},{projection}).maxTimeMS(5000).limit(6).toArray();
 if(!players.length) players=await db.collection('players').find({name:{$regex:'Hứa.?Thanh|Hua.?Thanh',$options:'i'}},{projection}).maxTimeMS(5000).limit(6).toArray();
 out.players=players;
 out.gameServer=await mongo.db('lhs_s1001').collection('gameservers').find({$or:[{serverId:1003},{id:1003}]},{projection:{serverId:1,id:1,name:1,openTime:1,state:1}}).maxTimeMS(5000).toArray();
 const lang=config.decodeTables(fs.readFileSync('/linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin')).LanguageConfig||{};
 const pickLang=r=>({...r,label:lang[r.textId]?.cn||lang[r.name]?.cn||null});
 for(const name of ['TaskConfig','SystemConfig','RoleLevelConfig','RoleStageConfig','SpecialTaskConfig']){
  const table=tables[name]||{};
  out.config[name]={count:Object.keys(table).length,hash:sha(JSON.stringify(table)),sample:Object.values(table).slice(0,2).map(pickLang)};
 }
 out.config.systemRows=Object.values(tables.SystemConfig||{}).filter(r=>[209,216,219,220,222,223,224,311,313].includes(Number(r.id))).map(pickLang);
 out.config.taskStateRows=Object.values(tables.TaskConfig||{}).filter(r=>[10302,40018,40118,40218,90001,90002,90003,90019,90020,90021].includes(Number(r.id))).map(pickLang);
 out.config.realmRows=[18,19].map(id=>pickLang(tables.RoleStageConfig[id]));
 out.config.level225=tables.RoleLevelConfig[225];
 out.config.specialTaskRows=Object.values(tables.SpecialTaskConfig||{}).filter(r=>[90001,90002,90003,90019,90020,90021].includes(Number(r.id)));
 out.config.tableNames=Object.keys(tables).filter(k=>/realm|unlock|role.*stage/i.test(k));
 const needles=players.flatMap(p=>[String(p._id),String(p.playerId),p.userId,p.name]);
 for(const log of [target.pm2_env.pm_out_log_path,target.pm2_env.pm_err_log_path]){
  if(!log||!fs.existsSync(log))continue;
  const stat=fs.statSync(log),size=Math.min(stat.size,8*1024*1024),buf=Buffer.alloc(size),fd=fs.openSync(log,'r');
  try{fs.readSync(fd,buf,0,size,stat.size-size);}finally{fs.closeSync(fd);}
  const lines=buf.toString('utf8').split('\n');
  out.logs.push({path:log,bytes:stat.size,tailBytes:size,playerLines:lines.filter(l=>needles.some(n=>n&&l.includes(n))).slice(-30).map(l=>l.slice(0,700)),
   relevantErrors:lines.filter(l=>/Upgrade3103|task.*fail|realm.*fail/i.test(l)).slice(-15).map(l=>l.slice(0,700)),lastLines:lines.slice(-3)});
 }
 if(AUDIT_MODE==='detail') {
  out.players=players.map(p=>({...p,taskInfo:{main:p.taskInfo.tasks['10302'],realmTasks:[40018,40118,40218].map(id=>p.taskInfo.tasks[id]),
   sideTasks:Object.values(p.taskInfo.tasks).filter(t=>t.type===9),type9Map:p.taskInfo.tasksMap?.['9']||[],totalTasks:Object.keys(p.taskInfo.tasks).length},
   systemUnlockInfo:{unlockedSystem:p.systemUnlockInfo.unlockedSystem}}));
  const sample=await db.collection('players').find({level:{$gte:75},userId:{$not:/^lhs_real_bot_/}},
   {projection:{_id:0,level:1,'systemUnlockInfo.unlockedSystem':1,'taskInfo.tasksMap.9':1}}).maxTimeMS(5000).limit(120).toArray();
  out.sideTaskPopulation={examined:sample.length,withType9:sample.filter(p=>p.taskInfo?.tasksMap?.['9']?.length).length,
   with209:sample.filter(p=>p.systemUnlockInfo?.unlockedSystem?.includes(209)).length,with216:sample.filter(p=>p.systemUnlockInfo?.unlockedSystem?.includes(216)).length};
 }
}finally{await mongo.close();}
const after=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8',timeout:10000})).filter(p=>/^lhs-/.test(p.name)).map(state);
out.processesUnchanged=JSON.stringify(out.processes)===JSON.stringify(after);
console.log(JSON.stringify(out));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

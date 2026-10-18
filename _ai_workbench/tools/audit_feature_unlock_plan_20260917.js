'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{execFileSync}=require('child_process');
const app=process.cwd(),game='/linhhoasu/webgame/game';
const all=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8',timeout:10000}));
const nodes=all.filter(p=>/^lhs-s100[1-4]$/.test(p.name));
if(nodes.length!==4||nodes.some(p=>p.pm2_env.pm_cwd!=='/linhhoasu/lhs/newServer'))throw Error('RUNTIME_MISMATCH');
const common=require('dotenv').parse(fs.readFileSync(app+'/.env'));
Object.assign(process.env,common,Object.fromEntries(Object.entries(nodes[0].pm2_env).filter(([,v])=>typeof v==='string')));
const logger=require.resolve('./src/logger');require.cache[logger]={id:logger,filename:logger,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const config=require('./src/services/ConfigService'),tables=config.loadAllTables();
const lang=config.decodeTables(fs.readFileSync(game+'/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin')).LanguageConfig;
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const state=p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time,startedAt:p.pm2_env.pm_uptime});
const safeKeys=['SERVER_ID','HTTP_PORT','CONFIG_BIN_PATH','DISABLED_SYSTEM_IDS','FORCE_UNLOCK_SYSTEM_IDS','SERVER_OPEN_TIME',
 'CURIOS_RESOURCE_POLICY','VALHALLA_RESOURCE_POLICY','BLOODLINE_RESOURCE_POLICY','ELF_RESOURCE_POLICY','MINE_RESOURCE_POLICY','SERVER_OPEN_DAY','SERVER_RUN_DAY'];
const out={at:new Date().toISOString(),productionWrites:0,processes:nodes.map(p=>({...state(p),
 env:Object.fromEntries(safeKeys.map(k=>[k,p.pm2_env[k]??common[k]??null]))})),sources:[],systemDayGates:[],conditionTables:[],dayFields:[],population:[],client:{}};
for(const rel of ['src/handlers/index.js','src/router.js','src/handlers/upgrade.js','src/handlers/playerPayload.js','src/handlers/task.js',
 'src/handlers/compat.js','src/handlers/official-compat.js','src/handlers/stubs.js','src/handlers/mine.js','src/handlers/valhalla.js',
 'src/handlers/bloodline.js','src/handlers/curios.js','src/handlers/elf.js','src/handlers/account.js','src/handlers/old-trek.js','src/handlers/reborn.js',
 'src/services/MainTaskProgressService.js','src/services/PlayerMigrationService.js','src/services/BattleService.js','src/services/CrossArenaService.js']){
 const p=app+'/'+rel;if(!fs.existsSync(p))continue;const data=fs.readFileSync(p),mtime=fs.statSync(p).mtimeMs;
 out.sources.push({path:rel,sha256:sha(data),changedAfterStart:nodes.filter(n=>mtime>n.pm2_env.pm_uptime).map(n=>n.name)});
}
out.systemDayGates=Object.values(tables.SystemConfig).filter(r=>(r.conditions||[]).some(c=>c.type===5||c.type===6)).map(r=>({...r,label:lang[r.name]?.cn||null}));
out.systems=Object.values(tables.SystemConfig).map(r=>({...r,label:lang[r.name]?.cn||null}));
out.specialTasks=Object.values(tables.SpecialTaskConfig||{}).map(r=>({...r,task:tables.TaskConfig[r.id],label:lang[tables.TaskConfig[r.id]?.textId]?.cn}));
// Inventory every condition5/6 under a condition-labelled field, plus explicit opening-day fields.
for(const [tableName,table] of Object.entries(tables)){
 const conditions=[],fields=new Map();
 function visit(value,keys=[],rowId=null){
  if(!value||typeof value!=='object')return;
  if(keys.some(k=>/condition/i.test(k))&&[5,6].includes(value.type)&&value.cond!=null&&value.value!=null)
   conditions.push({row:rowId,path:keys.join('.'),...value});
  for(const [key,item] of Object.entries(value)){
   if((/open.*day|day.*open|server.*day|day.*server|reg.*day|canGetDay|replaceDays/i.test(key)
       || (key==='showParam'&&value.showType===3))&&typeof item!=='object'){
    const field=keys.filter(k=>!/^\d+$/.test(k)).concat(key).join('.');
    if(!fields.has(field))fields.set(field,[]);fields.get(field).push({row:rowId,value:item});
   }
   if(item&&typeof item==='object')visit(item,keys.concat(key),rowId??value.id??key);
  }
 }
 visit(table,[],null);
 if(conditions.length)out.conditionTables.push({name:tableName,count:conditions.length,rows:conditions});
 for(const [field,rows] of fields){const values=[...new Set(rows.map(r=>r.value))];out.dayFields.push({name:tableName,field,count:rows.length,
  nontrivial:rows.filter(r=>Number(r.value)>1).length,values:values.length<=22?values:{min:Math.min(...values.map(Number)),max:Math.max(...values.map(Number)),count:values.length},samples:rows.slice(0,4)});}
}
for(const rel of ['index.html','js/main.min_drop100.js','js/lhs-fashion-day1-v1.js','js/lhs-fashion-content-v1.js']){
 const data=fs.readFileSync(game+'/'+rel);out.client[rel]={sha256:sha(data),bytes:data.length};
}
const main=fs.readFileSync(game+'/js/main.min_drop100.js','utf8');
out.client.dayOccurrences={};
for(const word of ['serverOpenDay','serverRunDay','.openDay','openServerDay']){
 const hits=[];let at=-1;while((at=main.indexOf(word,at+1))>=0)hits.push({offset:at,context:main.slice(Math.max(0,at-110),at+160)});
 out.client.dayOccurrences[word]=hits;
}
out.configHashes=Object.fromEntries(['SystemConfig','TaskConfig','SpecialTaskConfig','RoleStageConfig','RoleLevelConfig'].map(k=>[k,sha(JSON.stringify(tables[k]))]));
const {MongoClient}=require('mongodb');
(async()=>{
if(PLAN_MODE!=='scope'){
const mongo=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:5000});await mongo.connect();
try{
 const servers=await mongo.db('lhs_s1001').collection('gameservers').find({serverId:{$in:[1001,1002,1003,1004]}},
  {projection:{_id:0,serverId:1,openTime:1}}).maxTimeMS(5000).toArray();
 for(const server of servers){
  const players=mongo.db('lhs_s'+server.serverId).collection('players');
  const projection={level:1,userId:1,unlock:{$ifNull:['$systemUnlockInfo.unlockedSystem',[]]},
   sideTasks:{$cond:[{$isArray:'$taskInfo.tasksMap.9'},{$size:'$taskInfo.tasksMap.9'},0]},
   task90002:{$cond:[{$ifNull:['$taskInfo.tasks.90002',false]},1,0]},task90020:{$cond:[{$ifNull:['$taskInfo.tasks.90020',false]},1,0]}};
  const group={_id:null,rows:{$sum:1},level75:{$sum:{$cond:[{$gte:['$level',75]},1,0]}},withType9:{$sum:{$cond:[{$gt:['$sideTasks',0]},1,0]}},root90002:{$sum:'$task90002'},root90020:{$sum:'$task90020'}};
  for(const id of [209,216,219,220,222,311,313])group['unlocked'+id]={$sum:{$cond:[{$in:[id,'$unlock']},1,0]}};
  for(const [id,lv] of [[219,95],[220,110],[222,130]])group['meetsLevelButLocked'+id]={$sum:{$cond:[{$and:[{$gte:['$level',lv]},{$not:[{$in:[id,'$unlock']}]}]},1,0]}};
  const agg=await players.aggregate([{$match:{userId:{$not:/^lhs_real_bot_/}}},{$project:projection},{$group:group}],{maxTimeMS:5000}).toArray();
  out.population.push({...server,serverRunDay:Math.max(1,Math.ceil((Date.now()-server.openTime)/86400000)),nonBot:agg[0]||null});
 }
}finally{await mongo.close();}}
const after=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8',timeout:10000}));
out.processesUnchanged=JSON.stringify(all.filter(p=>/^lhs-/.test(p.name)).map(state))===JSON.stringify(after.filter(p=>/^lhs-/.test(p.name)).map(state));
console.log(JSON.stringify(out));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

'use strict';
// Evaluate installed pure functions in a VM with no DB/network/file-write capability.
const fs=require('fs'),vm=require('vm'),crypto=require('crypto'),{execFileSync}=require('child_process');
const app=process.cwd(),game='/linhhoasu/webgame/game';
const before=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8',timeout:10000})).find(p=>p.name==='lhs-s1003');
if(before?.pm2_env.pm_cwd!=='/linhhoasu/lhs/newServer')throw Error('S3_RUNTIME_MISMATCH');
Object.assign(process.env,require('dotenv').parse(fs.readFileSync(app+'/.env')),
 Object.fromEntries(Object.entries(before.pm2_env).filter(([,v])=>typeof v==='string')));
const log=require.resolve('./src/logger');require.cache[log]={id:log,filename:log,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const config=require('./src/services/ConfigService'),tables=config.loadAllTables();
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const clone=x=>JSON.parse(JSON.stringify(x));
function fn(source,name){
 const m=source.match(new RegExp('^(?:async )?function '+name+'\\([^]*?^\\}','m'));
 if(!m)throw Error('FUNCTION_NOT_FOUND:'+name);return m[0];
}
const payloadSource=fs.readFileSync(app+'/src/handlers/playerPayload.js','utf8');
let unsupportedCalls=0;
const payloadContext={module:{exports:{}},process:{env:{}},console:{log(){},warn(){},error(){}},require(name){
 if(name==='../services/ConfigService')return config;
 if(name==='../services/TaskPerfService')return {nowNs:()=>0n,recordTaskNormalizeNs(){}};
 if(name==='../services/ActivationPassService')return {ensureActivationPassState(){}};
 // Unrelated fishing event rows are outside this projected player snapshot.
 if(name==='../services/FishingEventSchedule')return {taskRows:()=>[]};
 return new Proxy({}, {get(){return ()=>{unsupportedCalls++;throw Error('DISALLOWED_DEPENDENCY:'+name);};}});
}};
vm.runInNewContext(payloadSource,payloadContext,{timeout:10000,filename:'installed-playerPayload.js'});
const normalize=payloadContext.module.exports.normalizeTaskInfo;
const source=fs.readFileSync(app+'/src/handlers/upgrade.js','utf8');
const sourceNames=['toSafeInt','compareConditionProgress','getCurrentMainTaskId','getSystemConditions','isSystemConditionMet','getStageBreakthroughState'];
const ctx={config,normalizeTaskInfoSafe:normalize,refreshRealmStageTasks(){},exports:{}};
vm.runInNewContext(sourceNames.map(n=>fn(source,n)).join('\n')+'\nexports.api={isSystemConditionMet,getCurrentMainTaskId,getStageBreakthroughState};',ctx,{timeout:10000});
const api=ctx.exports.api,day=Math.max(1,Math.ceil((Date.now()-OPEN_TIME)/86400000));
const result={at:new Date().toISOString(),productionWrites:0,dbConnections:0,vmNetworkAccess:false,
 serverRunDay:day,hashes:{upgrade:sha(source),playerPayload:sha(payloadSource)},predicateCases:[],sideTaskCases:[],native:{}};
const native=fs.readFileSync(game+'/js/main.min_drop100.js','utf8');
const nativeStart=native.indexOf('calcSingleConditionType=function')+'calcSingleConditionType='.length;
const nativeEnd=native.indexOf('},pOt.getSystemUnlockTip=',nativeStart)+1;
if(nativeStart<30||nativeEnd<nativeStart)throw Error('NATIVE_CONDITION_NOT_FOUND');
let nativePlayer;
const nativeCondition=vm.runInNewContext('('+native.slice(nativeStart,nativeEnd)+')',{
 Y:{Config:tables,TaskModel:{getMainTask:()=>nativePlayer.taskInfo.tasks[10302],getTaskDataById:id=>nativePlayer.taskInfo.tasks[id]}}
},{timeout:10000});
(async()=>{
 for(const addExp of [0,2680]){
  const p=clone(SNAPSHOT);p.exp+=addExp;
  const state=api.getStageBreakthroughState(p,p.roleInfo,tables.RoleStageConfig);
  result.predicateCases.push({exp:p.exp,stage:state.currentStage,requiredExp:state.requiredExp,tasksComplete:state.tasksComplete,
   levelComplete:state.levelComplete,expComplete:state.expComplete});
 }
 const normalizedPlayer=clone(SNAPSHOT);
 normalizedPlayer.taskInfo=normalize(normalizedPlayer.taskInfo,normalizedPlayer.roleInfo,normalizedPlayer);
 result.normalizedSideTasks=Object.values(normalizedPlayer.taskInfo.tasks).filter(t=>t.type===9).length;
 for(const [systemId,sideTask] of [[209,90021],[216,90003]])for(const status of [null,10,30]){
  const p=clone(SNAPSHOT);
  // Include the guide aliases so this isolates server condition2 from the separate side-task filter.
  p.systemUnlockInfo.unlockedSystem.push(114,123,10114,10123);
  if(status!==null){const t={id:sideTask,type:9,status,progress:status===30?1:0,target:1};p.taskInfo.tasks[sideTask]=t;p.taskInfo.tasksMap['9']=[t];}
  const normalized=normalize(clone(p.taskInfo),p.roleInfo,p);
  const pass=await api.isSystemConditionMet(p,tables.SystemConfig[systemId].conditions[0],new Set(p.systemUnlockInfo.unlockedSystem),0,{serverRunDay:day});
  nativePlayer=p;
  const nativePass=nativeCondition(2,sideTask,4,0);
  result.sideTaskCases.push({systemId,sideTask,status,sideTaskRetained:!!normalized.tasks[sideTask],mainTask:api.getCurrentMainTaskId(p),serverPass:pass,
   nativePass});
 }
 result.dayGates=[];
 for(const id of [219,220,222]){let pass=true;for(const c of tables.SystemConfig[id].conditions)pass=pass&&await api.isSystemConditionMet(SNAPSHOT,c,new Set(),0,{serverRunDay:day});
  result.dayGates.push({id,conditions:tables.SystemConfig[id].conditions,pass});}
 result.native.sha256=sha(native);result.native.indexReferencesDrop100=fs.readFileSync(game+'/index.html','utf8').includes('main.min_drop100.js');
 for(const [key,size] of [['calcSingleConditionType=function',3100],['getSubTask=function',1100],['getFirstSpecialTaskConfigWithSubTask=function',1300],['30031209',1000],['MainLockIconRule',100],['this.addIconRule(this.lockBtn1,Trt)',200]]){
  const i=native.indexOf(key);result.native[key]={offset:i,snippet:i<0?null:native.slice(Math.max(0,i-100),i+size)};
 }
 const lockAt=native.lastIndexOf('"MainLockIconRule"');result.native.lockRuleContext=native.slice(Math.max(0,lockAt-900),lockAt+100);
 const lang=config.decodeTables(fs.readFileSync(game+'/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin')).LanguageConfig;
 result.language={expTip:lang[30031209],wuhunTip:lang[99400001],hongNhan:Object.entries(lang).filter(([,r])=>/hồng nhan/i.test(r.cn||'')).slice(0,15)};
 result.unsupportedCalls=unsupportedCalls;
 const after=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8',timeout:10000})).find(p=>p.name==='lhs-s1003');
 result.processUnchanged=before.pid===after.pid&&before.pm2_env.restart_time===after.pm2_env.restart_time;
 const health=await fetch('http://127.0.0.1:8084/ready',{signal:AbortSignal.timeout(5000)});result.readiness=health.status;
 console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

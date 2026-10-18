'use strict';
const assert=require('assert/strict'),path=require('path');
const ROOT=path.resolve(__dirname,'../..'),APP=process.env.LHS_APP_ROOT||path.join(ROOT,'linhhoasu/lhs/newServer');
process.env.CONFIG_BIN_PATH=process.env.LHS_CONFIG_PATH||path.join(ROOT,'_ai_workbench/temp/delegate_first_task_20260905/server.next.bin');
const config=require(path.join(APP,'src/services/ConfigService')),ps=require(path.join(APP,'src/services/PlayerService'));
require(path.join(APP,'src/services/ServerConfigService')).findServerConfig=async()=>({openTime:Date.now()});
const task=require(path.join(APP,'src/handlers/task')),upgrade=require(path.join(APP,'src/handlers/upgrade'));
const tables=config.loadAllTables();assert.deepEqual(tables.SystemConfig[107].conditions,[{type:2,value:10002,cond:4}]);
assert.equal(tables.TaskConfig[10001].nextId,10002);
function make(status){return{userId:'delegate-gate-fixture',level:1,exp:0,roleInfo:{kungfuId:1,stage:1},items:{4:100},currencies:{},boxInfo:{level:1},systemUnlockInfo:{unlockedSystem:[],settings:{autoEquipUpgrade:false}},taskInfo:{tasks:{10001:{id:10001,type:1,status,progress:status===20?1:0,target:1}},tasksMap:{1:[{id:10001,type:1,status,progress:status===20?1:0,target:1}]}},other_attr_info:{},rechargeInfo:{},activityInfo:{datas:[]},raidInfo:{}};}
function reply(r,id){return(Array.isArray(r)?r:[r]).find(x=>x.tag===1000&&x.msgUid===id);}
let checks=0;ps.savePlayerDeferred=async(_u,p)=>p;
(async()=>{
 for(const method of ['handleClaimTaskReward','handleClaimTaskRewardCompat']){
  ps.savePlayer=async(_u,p)=>p;
  const before=make(10);await upgrade.refreshSystemUnlockInfo(before);assert(!before.systemUnlockInfo.unlockedSystem.includes(107));
  const reject=await task[method]({id:10001,ids:[10001]},{userId:before.userId,player:before},1);assert.notEqual(reply(reject,1).data.result,0);assert.equal(before.items[4],100);checks+=3;
  const p=make(20),s={userId:p.userId,player:p};await upgrade.refreshSystemUnlockInfo(p);assert(!p.systemUnlockInfo.unlockedSystem.includes(107));checks++;
  let saved=false;ps.savePlayer=async(_u,p)=>{assert(p.systemUnlockInfo.unlockedSystem.includes(107));saved=true;return p;};
  const result=await task[method]({id:10001,ids:[10001]},s,2);assert.equal(reply(result,2).data.result,0);assert(saved);assert.equal(p.items[4],105);assert.equal(p.taskInfo.tasks[10001].status,30);assert(p.systemUnlockInfo.unlockedSystem.includes(107));assert.equal(p.systemUnlockInfo.settings.autoEquipUpgrade,false);checks+=6;
  const restored=JSON.parse(JSON.stringify(p));await upgrade.refreshSystemUnlockInfo(restored);assert(restored.systemUnlockInfo.unlockedSystem.includes(107));checks++;
  const again=await task[method]({id:10001,ids:[10001]},s,3);assert.notEqual(reply(again,3).data.result,0);assert.equal(p.items[4],105);checks+=2;
  const fail=make(20),session={userId:fail.userId,player:fail};ps.savePlayer=async()=>{throw new Error('SAVE_FAILURE');};
  await assert.rejects(()=>task[method]({id:10001,ids:[10001]},session,4),/SAVE_FAILURE/);assert.equal(session.player,null);checks+=2;
 }
 console.log(JSON.stringify({result:'PASS',checks,firstTask:10001,unlockAfterClaim:10002,system:107,settingsPreserved:true,dbWrites:0}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

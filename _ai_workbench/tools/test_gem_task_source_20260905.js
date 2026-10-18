'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const app=process.env.LHS_APP_ROOT||path.resolve(__dirname,'../../linhhoasu/lhs/newServer');
process.env.CONFIG_BIN_PATH=process.env.LHS_CONFIG_PATH||path.resolve(__dirname,'../../linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin');
const c=require(path.join(app,'src/services/ConfigService')),ps=require(path.join(app,'src/services/PlayerService'));
ps.savePlayerDeferred=async(_u,p)=>p;
const task=require(path.join(app,'src/handlers/task')),cfg=c.loadAllTables();
const original=cfg.TaskConfig[10083];let saves=0;
ps.savePlayer=async(_u,p)=>{saves++;return p;};
function player(){return{userId:'task-gem-test',playerId:'task-gem-test',level:99,exp:0,roleInfo:{kungfuId:4,stage:999},items:{},currencies:{},other_attr_info:{gemInfo:{gems:[]}},taskInfo:{tasks:{10083:{id:10083,type:1,status:20,progress:5,target:5}},tasksMap:{}},rechargeInfo:{},activityInfo:{datas:[]}};}
(async()=>{let tested=0;
try{
 for(let level=1;level<=6;level++)for(const method of ['handleClaimTaskReward','handleClaimTaskRewardCompat']){
  cfg.TaskConfig[10083]={...original,nextId:0,reward:[{id:100090+level,count:3}]};
  const p=player(),s={userId:p.userId,player:p};
  const output=await task[method]({id:10083,ids:[10083]},s,10+tested);
  const response=output.find(r=>r.tag===1000&&r.msgUid===10+tested);
  assert.equal(response.data.result,0);assert.equal(response.data.rewardInfo.gems.length,3);
  assert(response.data.rewardInfo.gems.every(g=>cfg.GemLevelConfig[g.id].level===level));
  assert.equal(p.items[100090+level],undefined);assert(!output.some(r=>r.tag===1202&&r.data.items.some(x=>x.id===100090+level)));
  assert(output.some(r=>r.tag===3900));assert.equal(output.filter(r=>r.tag===3901).length,3);
  const beforeRetry=JSON.stringify(p.other_attr_info.gemInfo.gems);
  const retry=await task[method]({id:10083,ids:[10083]},s,90+tested);assert.notEqual(retry.data.result,0);
  assert.equal(JSON.stringify(p.other_attr_info.gemInfo.gems),beforeRetry);tested++;
 }
 cfg.TaskConfig[10083]={...original,nextId:0};
 ps.savePlayer=async()=>{throw new Error('SAVE_FAILURE');};const p=player(),s={userId:p.userId,player:p};
 await assert.rejects(()=>task.handleClaimTaskRewardCompat({ids:[10083]},s,777),/SAVE_FAILURE/);assert.equal(s.player,null);
 console.log(JSON.stringify({result:'PASS',task:10083,levels:6,entrypoints:2,cases:tested,saves,retryNoDuplicate:true,saveFailureNoSuccess:true,databaseWrites:0}));
}finally{cfg.TaskConfig[10083]=original;}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

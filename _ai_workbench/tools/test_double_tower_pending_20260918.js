'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const APP=process.env.FEATURE_APP||'/linhhoasu/lhs/newServer';
const playerService=require(APP+'/src/services/PlayerService');
const arena=require(APP+'/src/handlers/arena');
const originalSave=playerService.savePlayer;
const p={userId:'qa-dt',playerId:'qa-dt',name:'QA DT',level:100,items:{},currencies:{silver:0},
 roleInfo:{stage:10,stageId:10},systemUnlockInfo:{unlockedSystem:[313]},
 taskInfo:{tasks:{},tasksMap:{}},other_attr_info:{valhallaInfo:{valhalla:[]}},doubleTowerInfo:null};
const session={userId:'qa-dt',player:p};let saves=0;
playerService.savePlayer=async(_id,player)=>{saves++;return player;};
(async()=>{try{
 const noStart=await arena.handleDoubleTowerBattleFinish({type:0},session,1);
 assert.equal(noStart.data.code,'DOUBLE_TOWER_BATTLE_NOT_STARTED');
 const started=await arena.handleDoubleTowerBattle({index:1},session,2);
 assert.equal(started.data.result,0);assert.equal(p.doubleTowerInfo.pendingBattle.mode,'normal');
 const first=await arena.handleDoubleTowerBattleFinish({type:0,duration:10},session,3);
 assert.equal(first.data.result,0);assert.equal(p.doubleTowerInfo.pendingBattle,null);
 const replay=await arena.handleDoubleTowerBattleFinish({type:0,duration:10},session,4);
 assert.equal(replay.data.result,0);assert.equal(replay.data.recovered,true);
 assert.equal(saves,2);console.log(JSON.stringify({result:'PASS',checks:6,productionWrites:0,scope:'candidate handler with mocked persistence'}));
}finally{playerService.savePlayer=originalSave;}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

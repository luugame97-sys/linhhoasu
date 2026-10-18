'use strict';
// RAM-only real raid handlers. Combat engine/persistence are deterministic doubles.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const app=process.env.DROP200_APP||path.resolve('linhhoasu/lhs/newServer');
const map=JSON.parse(process.env.DROP200_CANDIDATE_MAP||'{}');
process.env.ROLE_LEVEL_2000_ENABLED='1';process.env.DROP_LEVEL_100_ENABLED='1';
const cfg=require(path.join(app,'src/services/ConfigService'));
const tables=cfg.loadAllTables();
require(path.join(app,'src/config/demonBossDrop200')).extend(tables);
let win=true,saves=0;
const noop=()=>false;
const fallback=new Proxy({}, {get:()=>noop});
const progress=new Proxy({updateDungeonBossMaxMapId:(p,n)=>{p.frontier=Math.max(p.frontier||0,n);}}, {get:(o,k)=>o[k]||noop});
const mocks={
 '../services/ConfigService':{get:k=>tables[k]},
 '../services/BattleService':new Proxy({calcPlayerPower:()=>({'1':100,'2':1,'3':1}),getMonsterAttrs:id=>tables.MonsterConfig[id].monsterAttrs,simulateBattle:()=>({win,playerHPLeft:win?100:0,monsterHPLeft:win?0:100,rounds:[],powerScore:1})},{get:(o,k)=>o[k]||noop}),
 '../services/PlayerService':{savePlayer:async()=>{saves++;}},
 '../logger':{info:noop,warn:noop,error:noop},
 '../services/GameDayService':{key:()=>20261007},
 '../services/MainTaskProgressService':progress,
 '../services/RoleAppearanceService':new Proxy({getBattlePets:()=>[],getPlayerFashionMap:()=>({}),applyPrimaryBattlePetParts:x=>x},{get:(o,k)=>o[k]||noop}),
 '../services/RewardSync':{buildRewardItemSync:()=>({changed:[]})},
 './task':{buildActiveTaskUpdatePackets:()=>[]}
};
const raidPath=path.join(app,'src/handlers/raid.js'),src=fs.readFileSync(map[raidPath]||raidPath,'utf8'),mod={exports:{}};
vm.runInNewContext(src,{module:mod,exports:mod.exports,require:n=>mocks[n]||fallback,process,console,setTimeout,clearTimeout,Buffer},{filename:'raid.js'});
const h=mod.exports;
const packet=(r,tag)=>(Array.isArray(r)?r:[r]).find(x=>x.tag===tag);
function session(stage){return {userId:'RAM_ONLY',player:{level:2000,exp:0,roleInfo:{stage:48},items:{4:1000},currencies:{diamond:1000000},raidInfo:{level:1,demonBossInfo:{stage,cleanOutTime:0}}}};}
(async()=>{
 const s=session(48);win=false;
 await h.handleStartFight({type:4,levelId:172},s,1);
 assert.equal(s.lastBattle.levelId,49,'cannot skip sequential boss');
 const denied=await h.handleClaimFightReward({type:4},s,2);assert.equal(packet(denied,2301).data.result,-1);assert.equal(s.player.raidInfo.demonBossInfo.stage,48);assert.equal(s.player.items[30]||0,0);
 win=true;
 for(let stage=49;stage<=172;stage++){
  const before=s.player.items[4];const b=await h.handleStartFight({type:4},s,stage*2);
  assert.equal(packet(b,2300).data.id,stage);assert.equal(s.lastBattle.level.monsterId,tables.DemonBossConfig[stage].monsterId);
  const r=await h.handleClaimFightReward({type:4},s,stage*2+1);
  assert.equal(packet(r,2301).data.id,stage);assert.equal(s.player.raidInfo.demonBossInfo.stage,stage);assert.equal(s.player.frontier,stage);
  assert.equal(s.player.items[4],before-1+tables.DemonBossConfig[stage].rewards.find(x=>x.id===4).count);
  const snap=JSON.stringify(s.player.items);const retry=await h.handleClaimFightReward({type:4},s,999);assert.equal(packet(retry,2301).data.result,-1);assert.equal(JSON.stringify(s.player.items),snap);
 }
 assert.equal(packet(await h.handleStartFight({type:4},s,1000),2300).data.result,-1,'terminal');
 const locked=session(48);assert.equal(packet(await h.handleSkipBattle({stage:49},locked,1001),2304).data.result,-1);
 const r=await h.handleSkipBattle({stage:172},s,1002);assert.equal(packet(r,2304).data.stage,172);assert.equal(s.player.raidInfo.demonBossInfo.stage,172);
 await Promise.resolve();console.log(JSON.stringify({pass:true,stages:124,defeatRejected:true,duplicateClaimRejected:true,terminalRejected:true,sweepExact172:true,saves}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

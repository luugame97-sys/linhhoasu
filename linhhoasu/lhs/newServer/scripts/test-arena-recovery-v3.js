'use strict';
const assert=require('assert/strict'),path=require('path');
const {memoryModel,clone}=require('./test-competitions-v3');
const app=process.env.COMPETITION_APP||path.resolve(__dirname,'..');
const arena=require(app+'/src/handlers/arena'),battle=require(app+'/src/services/BattleService'),config=require(app+'/src/services/ConfigService');
const players=require(app+'/src/services/PlayerService'),rank=require(app+'/src/services/RankService'),redis=require(app+'/src/db/redis');
const Account=require(app+'/src/db/models/Account'),Player=require(app+'/src/db/models/Player'),Log=require(app+'/src/db/models/ArenaFightLog');
const appearance=require(app+'/src/services/RoleAppearanceService'),runtime=require(app+'/src/services/RuntimeBus');
const db=memoryModel(),logs=memoryModel(),receipts=new Map();let accountRows=[],saveMode='',seq=0,forcedWin=true;
const query=rows=>({select(){return this;},limit(){return this;},maxTimeMS(){return this;},lean:async()=>clone(rows)});
Account.find=()=>query(accountRows);
for(const k of ['find','findOne','findOneAndUpdate','updateOne'])Player[k]=db[k];
Log.find=logs.find;Log.findOne=logs.findOne;Log.updateOne=logs.updateOne;
Log.create=async r=>logs.create({_id:r.fightId,...clone(r),createdAt:new Date().toISOString()});
players.drainPendingSaves=async()=>{};
players.savePlayer=async(id,p)=>{if(saveMode==='before')throw Error('SAVE_BEFORE');db.rows.set(p._id,clone(p));if(saveMode==='after')throw Error('SAVE_AFTER');return p;};
runtime.getWsServer=()=>null;
redis.getClient=()=>({set:async(k,v,...a)=>{if(a.includes('NX')&&receipts.has(k))return null;receipts.set(k,v);return'OK';},get:async k=>receipts.get(k),del:async k=>receipts.delete(k)});
rank.getRank=async()=>1;rank.updateScore=async()=>{};rank.getTopN=async()=>[];
const simulate=battle.simulateBattle;battle.simulateBattle=(a,b,o)=>({...simulate(a,b,o),win:forcedWin});
function session(sid){const n=++seq,p={_id:n.toString(16).padStart(24,'0'),userId:'qa_arena_'+n,playerId:'qa_arena_'+n,name:'Arena QA '+n,
 serverId:sid,level:120,roleInfo:{kungfuId:4,subJob:0,stage:1},boxInfo:{level:1},equipInfo:{curIndex:0,equipSetMap:{0:{}}},
 fashionInfo:{},petInfo:{pets:[]},items:{10:30},currencies:{diamond:1000,silver:10000,gold:0},arenaScore:1000};db.rows.set(p._id,clone(p));return{userId:p.userId,serverId:sid,player:p};}
const ack=(v,tag)=>(Array.isArray(v)?v:[v]).find(x=>x.tag===tag)?.data;
const request=(s,target)=>({type:2,requestId:'arena_v3_test_'+(++seq),enemyid:target.dbid,challengeVersion:target.challengeVersion});
const tests=[];const check=(name,fn)=>{fn();tests.push(name);};
async function main(){
 for(const sid of [1001,1002,1003,1004]) {
  accountRows=[];const s=session(sid),info=ack(await arena.handleArenaInfo({},s,1),2600),robot=info.challengelist[0];
  const req=request(s,robot),before=s.player.items[10],first=ack(await arena.handleArenaFight2300(req,s,2),2300);
  check('S'+sid+' first fight uses native actors',()=>{assert.equal(first.result,0);assert.equal(s.player.items[10],before-1);assert.equal(first.fightResult.entitys.length,2);assert(first.fightResult.events.length);});
  const previous=clone(s.player),again=ack(await arena.handleArenaFight2300(req,s,3),2300);
  check('S'+sid+' complete ledger replay no debit',()=>{assert.equal(again.result,0);assert.equal(again.recovered,true);assert.equal(again.fightResult.entitys.length,2);assert(again.fightResult.events.length);assert.deepEqual(s.player.items,previous.items);assert.deepEqual(s.player.currencies,previous.currencies);assert.equal(again.rank,1);});
  // Delete presentation actors to exercise receipts created by the old release.
  s.player.arenaReceiptLedger.at(-1).fightResult={type:2,win:1,entitys:[],events:[]};
  const legacy=ack(await arena.handleArenaFight2300(req,s,4),2300);
  check('S'+sid+' legacy receipt repaired without simulation',()=>{assert.equal(legacy.result,0);assert.equal(legacy.fightResult.entitys.length,2);assert(legacy.fightResult.events.length);assert.equal(s.player.items[10],before-1);});
 }
 const attacker=session(1001),opponent=session(1001);opponent.player.homelandInfo={lv:1,buildingLv:Object.fromEntries(Object.keys(config.get('HomelandBuildingConfig')||{}).map(k=>[k,10]))};
 for(const id of Object.keys(config.get('HomelandSkinConfig')||{}))opponent.player.items[id]=1;
 appearance.ensureRoleAppearance(opponent.player);db.rows.set(opponent.player._id,clone(opponent.player));
 accountRows=[{roles:[{userId:opponent.userId,serverId:1001,lastLoginTime:Date.now()}]}];
 let random=Math.random,info;try{Math.random=()=>0.999999;info=ack(await arena.handleArenaInfo({},attacker,10),2600);}finally{Math.random=random;}
 const enemy=info.challengelist.find(r=>r.playerId===opponent.player.playerId),full=battle.calcPlayerPower(clone(opponent.player));
 check('actual query projection includes homeland skin bonus',()=>{assert(enemy);assert.deepEqual(enemy.robotAttrs,full);assert.equal(enemy.power,require(app+'/src/services/ArenaReadModelService').displayPower(full));assert.equal(enemy.powerScore,battle.calcPowerScore(full));});
 forcedWin=false;let req=request(attacker,enemy);const loss=ack(await arena.handleArenaFight2300(req,attacker,11),2300);
 check('loss records real target and transfers equal defender score',()=>{assert.equal(loss.result,0);assert(loss.scorechange<0);assert.equal(loss.targetScorechange,-loss.scorechange);assert.equal(loss.targetScorePending,false);assert.equal(db.rows.get(opponent.player._id).arenaScore,1000-loss.scorechange);});forcedWin=true;
 // The logged target is intentionally absent from the current five opponents.
 attacker._arenaChallengeSnapshot.rows=attacker._arenaChallengeSnapshot.rows.filter(r=>r.dbid!==enemy.dbid);
 const log=attacker.player.arenaLoglist.find(r=>r.score<0);
 const revenge=ack(await arena.handleArenaFight2300({type:3,enemyid:String(log.uid),requestId:'arena_revenge_outside_001'},attacker,12),2300);
 check('revenge resolves opponent outside challenge list',()=>{assert.equal(revenge.result,0,JSON.stringify(revenge));assert.equal(revenge.fightResult.entitys[1].dbid,enemy.dbid);});
 const used=ack(await arena.handleArenaFight2300({type:3,enemyid:String(log.uid),requestId:'arena_revenge_outside_002'},attacker,13),2300);
 check('revenge cannot be used twice',()=>assert.equal(used.code,'ARENA_REVENGE_ALREADY_USED'));
 accountRows=[];const crashed=session(1002);info=ack(await arena.handleArenaInfo({},crashed,20),2600);req=request(crashed,info.challengelist[0]);
 const initial=crashed.player.items[10],pid=crashed.player._id;saveMode='after';const lostAck=ack(await arena.handleArenaFight2300(req,crashed,21),2300);saveMode='';
 check('unknown Mongo commit invalidates Arena session',()=>{assert.equal(lostAck.code,'ARENA_SAVE_FAILED');assert.equal(crashed.player,null);});
 crashed.player=clone(db.rows.get(pid));const recovered=ack(await arena.handleArenaFight2300(req,crashed,22),2300);
 check('Arena reconnect after commit returns original outcome',()=>{assert.equal(recovered.result,0);assert.equal(recovered.recovered,true);assert.equal(crashed.player.items[10],initial-1);assert.equal(recovered.fightResult.entitys.length,2);});
 console.log(JSON.stringify({result:'PASS',checks:tests.length,tests,networkAttempts:0,productionWrites:0},null,2));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});

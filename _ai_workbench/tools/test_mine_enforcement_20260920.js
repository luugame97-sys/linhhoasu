'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const app=path.resolve(__dirname,'../temp/mine_fix_20260920/candidate/server');
const cache=new Map();
const configData={
 MineBlockConfig:{1:{shape:[[1],[1]],picTimeRes:['x']},2:{shape:[[1],[1]],picTimeRes:['x']}},
 MineLevelConfig:{1:{0:{deep:1,rewards:[]}}},
 MineBaseConfig:{triggerNum:20,autoPowerCost:3,autoRowNum:4,rocketheight:12,boomCenter:[-2,-2],boomShape:Array.from({length:5},()=>[1,1,1,1,1]),boxRewards:[]},MineEventConfig:{},
};
const mocks={
 ConfigService:{get:key=>configData[key]||{}},
 FeatureMutationService:{wrap:fn=>fn,save:async(session,player)=>{session.player=player;return player;}},
 SideTaskProgressService:{recordProgress:()=>false},
 PlayerService:{savePlayer:async(_id,p)=>p},
 BattleService:{calcPlayerPower:()=>({}),generateOpponentAttrs:()=>({}),simulateBattle:()=>({win:true})},
 raid:{addRewardToPlayer(){}},
};
function load(rel){const file=path.resolve(app,rel);if(cache.has(file))return cache.get(file).exports;const mod={exports:{}};cache.set(file,mod);const req=name=>{const key=path.basename(name);if(mocks[key])return mocks[key];if(name.startsWith('node:'))return require(name);if(key==='logger')return {info(){},warn(){},error(){},debug(){}};return load(path.relative(app,path.resolve(path.dirname(file),name+'.js')))};vm.runInThisContext(`(function(require,module,exports){${fs.readFileSync(file,'utf8')}\n})`,{filename:file})(req,mod,mod.exports);return mod.exports;}
function session(){return {userId:'mine-enforcement',player:{userId:'mine-enforcement',level:100,items:{55:3,6:100},currencies:{diamond:100,silver:100,gold:100},mineInfo:{cycle:1,levelId:0,meter:8,currentLevel:{levelId:0,meter:8,playerMeter:5,playerCol:3,finish:false,blocks:[{uid:1,id:1,status:0,meter:5,col:4},{uid:2,id:1,status:1,meter:6,col:3},{uid:3,id:1,status:0,meter:7,col:5}],events:[]}}}};}
(async()=>{const mine=load('src/handlers/mine.js');let s=session(),beforeItems=JSON.stringify(s.player.items),beforeStatuses=s.player.mineInfo.currentLevel.blocks.map(x=>x.status);let r=await mine.handleMineDigBlock({itemId:6,meter:5,col:4,path:[{meter:5,col:3},{meter:5,col:4}]},s,1);assert.equal(r.data.result,1);assert.equal(JSON.stringify(s.player.items),beforeItems);assert.deepEqual(s.player.mineInfo.currentLevel.blocks.map(x=>x.status),beforeStatuses);
r=await mine.handleMineDigBlock({itemId:55,meter:5,col:4,path:[{meter:5,col:3},{meter:5,col:6}]},s,2);assert.equal(r.data.result,1);assert.equal(s.player.items[55],3);
r=await mine.handleMineDigBlock({itemId:55,meter:5,col:4,path:[{meter:5,col:3},{meter:4,col:3},{meter:4,col:4},{meter:4,col:5}]},s,3);assert(Array.isArray(r));assert.equal(s.player.items[55],2);assert.equal(s.player.mineInfo.currentLevel.blocks.filter(b=>b.meter===4&&b.col===3).length,0);
r=await mine.handleMineLevelFinish({path:[{meter:5,col:3}]},s,4);assert.equal(r.data.result,1);assert.equal(s.player.mineInfo.currentLevel.finish,false);
const bomb={userId:'bomb',player:{userId:'bomb',items:{58:1,55:1},currencies:{diamond:0,silver:0,gold:0},mineInfo:{cycle:1,levelId:0,meter:6,currentLevel:{levelId:0,meter:6,playerMeter:3,playerCol:3,finish:false,blocks:[{uid:1,id:1,status:0,meter:5,col:3},{uid:2,id:1,status:0,meter:5,col:4}],events:[]}}}};
r=await mine.handleMineDigBlock({itemId:58,meter:5,col:3,path:[]},bomb,5);assert(Array.isArray(r));assert.deepEqual(bomb.player.mineInfo.currentLevel.blocks.slice(0,2).map(x=>x.status),[1,1]);assert.equal(bomb.player.items[58]||0,0);
r=await mine.handleMineDigBlock({itemId:55,meter:5,col:3,path:[{meter:3,col:3}]},bomb,6);assert.equal(r.data.result,1);assert.equal(bomb.player.items[55],1);
const auto=session();auto.player.items={55:5};auto.player.mineInfo.currentLevel={levelId:0,meter:6,playerMeter:3,playerCol:3,finish:false,blocks:[{uid:1,id:1,status:0,meter:5,col:3}],events:[]};
r=await mine.handleMineDigBlock({itemId:-1,meter:5,col:3,path:[{meter:3,col:3},{meter:3,col:4},{meter:4,col:4},{meter:5,col:4}]},auto,7);assert(Array.isArray(r));assert.equal(auto.player.items[55],2);
const rocket=session();rocket.player.items={59:1};rocket.player.mineInfo.currentLevel={levelId:0,meter:10,playerMeter:10,playerCol:3,finish:false,blocks:[{uid:1,id:1,status:1,meter:20,col:3}],events:[]};
r=await mine.handleMineDigBlock({itemId:59,meter:20,col:3,path:[]},rocket,8);assert(Array.isArray(r));assert.equal(rocket.player.items[59]||0,0);
assert.equal(mine.ensureMineInfo({mineInfo:{cycle:0}}).cycle,0);
console.log(JSON.stringify({result:'PASS',checks:10,productionWrites:0}));})().catch(e=>{console.error(e.stack);process.exitCode=1});

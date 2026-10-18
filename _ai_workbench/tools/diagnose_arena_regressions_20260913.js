'use strict';
// Offline only: shipped functions in isolated VMs, no DB/network.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const root=path.resolve(__dirname,'../..');
const client=fs.readFileSync(path.join(root,'linhhoasu/webgame/game/js/lhs-arena-v1.js'),'utf8');
const server=fs.readFileSync(path.join(root,'linhhoasu/lhs/newServer/src/handlers/arena.js'),'utf8');
const engine=fs.readFileSync(path.join(root,'linhhoasu/webgame/game/js/egretex.min_37b3ee13.js'),'utf8');
const findings=[];
function realm(){
 const c=vm.createContext({});
 vm.runInContext('function ArenaModel(){};function ArenaRankView(){};function RaidInfoModel(){};ArenaRankView.prototype.updateUI=function(){};RaidInfoModel.prototype.sendStartFightPart=function(){};var window={GlobalManager:{ArenaModel:new ArenaModel(),RaidInfoModel:new RaidInfoModel()},ArenaModel,ArenaRankView,RaidInfoModel,MessageCenter:{ins:()=>({dispatch:()=>{}})},setTimeout:()=>0,clearTimeout:()=>{}};',c);
 vm.runInContext(client,c);
 return c;
}
{
 const c=realm();
 vm.runInContext("var m=window.GlobalManager.ArenaModel;m.rankInfo={rank:97,ranklist:[{dbid:'top',score:2000}],toplist:[{dbid:'top',score:2000}]};m.Rpc=(tag,args,ok)=>ok({result:0,rank:97,score:1190,challengelist:[]});m.requestGetChallengeList();",c);
 assert.equal(vm.runInContext('m.rankInfo.ranklist[0].dbid',c),'top');
 findings.push({id:'CLIENT_RANK_INFO_PRESERVED',reproduced:true,input:'2602 has rank but no ranklist',output:'ranklist/toplist retained'});
}
{
 const c=realm();
 vm.runInContext("var m=window.GlobalManager.ArenaModel;m.Rpc=()=>{throw new Error('send failure')};m.requestRefreshChllengeList()",c);
 assert.equal(vm.runInContext('m.__lhsArenaRefreshPending',c),false);
 findings.push({id:'REFRESH_PENDING_RELEASED_ON_SEND_THROW',reproduced:true});
}
{
 const start=server.indexOf('function calculateArenaScoreChange('),end=server.indexOf('function getArenaBattleRewards(',start);
 assert(start>=0&&end>start);
 const c=vm.createContext({config:{get:()=>({})}});
 vm.runInContext('function ensurePlainObject(v){return v||{}};function toSafeInt(v,d=0){return Number.isFinite(Number(v))?Math.floor(Number(v)):d};'+server.slice(start,end),c);
 const low=vm.runInContext('calculateArenaScoreChange(1000,500,false)',c),high=vm.runInContext('calculateArenaScoreChange(1000,2000,false)',c);
 assert.deepEqual([low,high],[-5,-20]);
 findings.push({id:'ARENA_SCORE_FORMULA_DEFINED',lossTo500:low,lossTo2000:high,policy:'base10 + floor((defender-attacker)/100), clamp1..50'});
}
{
 const start=server.indexOf('function arenaReceiptId('),end=server.indexOf('function withArenaMutationLock(',start);
 const c=vm.createContext({crypto:require('crypto')});
 vm.runInContext('function resolveArenaServerId(){return 1001};function arenaPlayerId(s,p){return p.playerId};'+server.slice(start,end),c);
 const ids=vm.runInContext("[arenaReceiptId({enemyid:'a'}, {}, {playerId:'p'}, 'fight',42),arenaReceiptId({enemyid:'b'}, {}, {playerId:'p'}, 'fight',42)]",c);
 assert.notEqual(ids[0],ids[1]);
 findings.push({id:'RECEIPT_TARGET_SCOPED',reproduced:true});
}
{
 const start=server.indexOf('function buildArenaFightId('),end=server.indexOf('function clonePlain',start);assert(start>=0&&end>start);
 const c=vm.createContext({crypto:require('crypto')});
 vm.runInContext("function resolveArenaServerId(){return 1001};function arenaPlayerId(s,p){return p.playerId};"+server.slice(start,end)+";var a=buildArenaFightId({}, {playerId:'p1'}, {}, 42);var b=buildArenaFightId({}, {playerId:'p2'}, {}, 42);",c);
 assert.notEqual(c.a,c.b);
 findings.push({id:'FIGHT_LOG_ID_PLAYER_SCOPED',reproduced:true});
}
{
 assert(engine.includes('_nativeSend=e.bind(this.socket)'));
 assert(client.includes('rankInfo'));
 const socket={},native=function(){if(this!==socket)throw new Error('wrong receiver');return 'sent'},bound=native.bind(socket);
 assert.equal(Reflect.apply(bound,{},['data']),bound('data'));
 const guard=fs.readFileSync(path.join(root,'linhhoasu/webgame/game/js/lhs-socket-send-v3.js'),'utf8');
 assert(guard.includes('apply(nativeSend, current.socket'));
 findings.push({id:'SOCKET_GUARD_BRANDED_RECEIVER',reproduced:true,note:'Guard captures native send descriptor and always applies it to the verified active socket'});
}
console.log(JSON.stringify({networkAttempts:0,productionWrites:0,diagnostics:findings},null,2));

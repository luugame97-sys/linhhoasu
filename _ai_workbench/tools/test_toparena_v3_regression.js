'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const APP=process.env.TOPARENA_APP||path.resolve(__dirname,'../../linhhoasu/lhs/newServer');
const evidence=process.env.TOPARENA_EVIDENCE||path.resolve(__dirname,'../temp/events_audit_20261003/live.json');
let networkAttempts=0;const deny=()=>{networkAttempts++;throw Error('NETWORK_DENIED');};
require('net').Socket.prototype.connect=deny;require('tls').connect=deny;global.fetch=deny;
const live=JSON.parse(fs.readFileSync(evidence,'utf8')).configs;
const R=require(APP+'/src/services/TopArenaRules'),{createService}=require(APP+'/src/services/TopArenaService');
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x)),results=[];let seq=0;
const check=(name,fn)=>{fn();results.push(name);};
const ack=(value,tag)=>(Array.isArray(value)?value:[value]).find(p=>p.tag===tag&&p.msgUid!==0)?.data;
function fixture(){
 const start=Date.parse('2026-10-04T00:00:00+07:00');
 let now=start+3600000,saveFault='',finishFault=false,mailFault=false,casFault=false;
 const cycleAt=at=>{if(at<start)return null;const index=Math.floor((at-start)/(7*R.DAY));return {index,event:'topArena',startTime:start+index*7*R.DAY,endTime:start+(index+1)*7*R.DAY,key:'W_topArena_'+index+'_qa'};};
 const data=new Map(),livePlayers=new Map(),seasons=new Map(),actions=new Map(),replays=new Map(),mails=new Map();
 const repo={
   get:async id=>clone(seasons.get(id)||null),create:async s=>{if(!seasons.has(s._id))seasons.set(s._id,clone(s));return clone(seasons.get(s._id));},
   cas:async(b,a)=>{if(casFault){casFault=false;return false;}if(seasons.get(b._id)?.revision!==b.revision)return false;a.revision=b.revision+1;seasons.set(a._id,clone(a));return true;},
   action:async id=>clone(actions.get(id)||null),putAction:async a=>{if(!actions.has(a._id))actions.set(a._id,clone(a));return clone(actions.get(a._id));},
   complete:async(id,response)=>{if(finishFault){finishFault=false;throw Error('FINISH_FAILED');}actions.get(id).status='done';actions.get(id).response=clone(response);},
   failAction:async(id,code)=>Object.assign(actions.get(id),{status:'failed',error:code}),
   getReplay:async id=>clone(replays.get(id)||null),replay:async(id,r)=>{if(!replays.has(id))replays.set(id,clone({_id:id,...r}));return clone(replays.get(id));},
   logs:async(cycle,actor,kind)=>clone([...actions.values()].filter(a=>a.cycle===cycle&&a.actor===actor&&a.kind===kind&&a.status==='done')),
   profile:async(sid,uid)=>clone(data.get(uid)),economyReceipt:async(sid,uid,id)=>!!data.get(uid)?.topArenaV3?.receipts?.includes(id),
   lockProfile:async(cycle,actor,detail)=>({cycle,actor,detail}),lockedProfile:async()=>({detail:{}}),
   seasons:async()=>clone([...seasons.values()].filter(s=>!s.settled)),
   settleMail:async(r,k,a)=>{if(!mails.has(k))mails.set(k,clone({r,k,a}));if(mailFault){mailFault=false;throw Error('AFTER_MAIL_INSERT');}},
 };
 const config={get:n=>live[n]||{}};
 const runtime={getWsServer:()=>({getPlayerForMutation:id=>livePlayers.get(id),invalidatePlayerForMutation:id=>livePlayers.delete(id)})};
 const players={drainPendingSaves:async()=>{},loadPlayer:async id=>clone(data.get(id)),savePlayer:async(id,p,options)=>{
   if(saveFault==='before'){saveFault='';throw Error('BEFORE_SAVE');}
   const old=data.get(id);for(const [k,v] of Object.entries(options.topArenaCAS))assert.deepEqual(old[k],v);
   for(const k of options.onlyFields)old[k]=clone(p[k]);data.set(id,old);
   if(saveFault==='after'){saveFault='';throw Error('AFTER_SAVE');}return p;
 }};
 const view=(p,sid)=>({show:{dbid:String(p._id),playerId:p.playerId,name:p.name,serverId:sid,level:p.level,kungfuId:4,subJob:0,avatar:11300,avatarFrame:-1,power:1e15},attrs:{1:100000,2:p.attack||1000,3:500,4:100},parts:{},partValues:{}});
 const services={};function service(sid){return services[sid]||(services[sid]=createService({repo,config,cross:{cycleFor:(e,t=now)=>cycleAt(t),isServerAllowed:id=>id>=1001&&id<=1007},
   players,runtime,clock:()=>now,serverId:sid,getServer:async id=>({serverId:id,openTime:start-30*R.DAY,running:true}),view,power:()=>1000,detail:p=>({name:p.name}),
   battle:(a,b)=>({type:2,win:a.attrs[2]>=b.attrs[2]?1:0,events:[{typ:0}],entitys:[{showInfo:a.show},{showInfo:b.show}],atkAttr:a.attrs,defAttr:b.attrs}),logger:{warn(){}}}));}
 function player(sid=1001){const n=++seq,p={_id:n.toString(16).padStart(24,'0'),userId:'qa_top_'+n,playerId:'p_qa_'+n,name:'QA'+n,serverId:sid,level:120,attack:1e8,
   items:{180:100,181:10000,182:0,1:10000},currencies:{diamond:10000,silver:0,gold:0},rechargeInfo:{},roleInfo:{kungfuId:4,subJob:0}};
   data.set(p.userId,clone(p));livePlayers.set(p.userId,p);return {userId:p.userId,serverId:sid,player:p};}
 async function call(s,tag,args={}){return ack(await service(s.serverId).dispatch(tag,args,s,++seq),tag);}
 async function enter(s){return call(s,6200);}
 function request(s,tag,extra={}){const season=seasons.get(cycleAt(now).key),e=season?.players[String(s.player._id)];return {requestId:'qa_request_'+(++seq),cycleKey:cycleAt(now).key,challengeVersion:e?.challengeVersion||'',...extra};}
 function reconnect(s){s.player=clone(data.get(s.userId));livePlayers.set(s.userId,s.player);}
 function edit(s,fn){fn(s.player);data.set(s.userId,clone(s.player));livePlayers.set(s.userId,s.player);}
 return {start,cycleAt,data,seasons,actions,replays,mails,repo,service,player,call,enter,request,reconnect,edit,now:v=>{now=v;},time:()=>now,
   faults:o=>{if(o.save)saveFault=o.save;if(o.finish)finishFault=true;if(o.mail)mailFault=true;if(o.cas)casFault=true;}};
}
(async()=>{
 let f=fixture(),s=f.player(),info=await f.enter(s),t=R.timeline(f.cycleAt(f.time()),live);
 check('native info rank999 and five targets',()=>{assert.equal(info.result,0);assert.equal(info.challengeInfo.rank,999);assert.equal(info.challengeInfo.challengeList.length,5);});
 const getFight=()=>{const e=f.seasons.get(f.cycleAt(f.time()).key).players[s.player._id],p=e.challenge[0];return f.request(s,2350,{type:51,index:p.rank,enemyid:p.id});};
 let req=getFight(),before=s.player.items[180],result=await f.call(s,2350,req);
 check('fight uses configured ticket and win reward',()=>{assert.equal(result.result,0,JSON.stringify(result));assert.equal(s.player.items[180],before-1);assert.equal(s.player.items[182],100);});
 result=await f.call(s,2350,req);
 check('same request pays once',()=>{assert.equal(result.result,0);assert.equal(s.player.items[180],before-1);});
 result=await f.call(s,2350,{...req,index:1});check('receipt payload conflict rejected',()=>assert.equal(result.code,'TOP_ARENA_REQUEST_CONFLICT'));
 result=await f.call(s,2350,{...getFight(),enemyid:'fake'});check('target ID and rank must agree',()=>assert.equal(result.code,'TOP_ARENA_TARGET_INVALID'));
 req=getFight();f.edit(s,p=>p.items[180]=0);result=await f.call(s,2350,req);
 check('no ticket rejects without grant',()=>{assert.equal(result.code,'TOP_ARENA_NOT_ENOUGH');assert.equal(s.player.items[182],100);});
 f.edit(s,p=>p.items[180]=100);f.faults({cas:true});result=await f.call(s,2350,getFight());check('season CAS failure never debits',()=>assert.equal(s.player.items[180],100));
 req=getFight();f.faults({save:'after'});result=await f.call(s,2350,req);
 check('ambiguous saved debit invalidates session',()=>{assert.equal(result.code,'TOP_ARENA_COMMIT_UNKNOWN');assert.equal(s.player,null);assert.equal(f.data.get(s.userId).items[180],99);});
 f.reconnect(s);result=await f.call(s,2350,req);
 check('reconnect reconciles committed debit once',()=>{assert.equal(result.result,0);assert.equal(f.data.get(s.userId).items[180],99);});
 req=getFight();f.faults({save:'before'});await f.call(s,2350,req);f.reconnect(s);result=await f.call(s,2350,req);
 check('pre-save failure retries prepared outcome',()=>{assert.equal(result.result,0);assert.equal(f.data.get(s.userId).items[180],98);});
 req=getFight();f.faults({finish:true});result=await f.call(s,2350,req);f.reconnect(s);result=await f.call(s,2350,req);
 check('receipt completion fault preserves applied effects',()=>{assert.equal(result.result,0);assert.equal(s.player.items[180],97);});
 result=await f.call(s,6201,f.request(s,6201));check('refresh charges configured10',()=>{assert.equal(result.result,0);assert.equal(s.player.currencies.diamond,9990);});
 result=await f.call(s,6201,f.request(s,6201));check('refresh cooldown rejects',()=>assert.equal(result.code,'TOP_ARENA_REFRESH_COOLDOWN'));
 result=await f.call(s,6202,f.request(s,6202,{count:5}));check('sweep debits5',()=>{assert.equal(result.result,0);assert.equal(s.player.items[180],92);});
 f.now(t.gamePassStartTime+1000);result=await f.call(s,6220,f.request(s,6220));check('free pass exact day1',()=>{assert.equal(result.result,0);assert.equal(result.passRecord[1],1);assert.deepEqual(result.rewardInfo.items,live.TopArenaPassConfig[512][1].rewards);});
 result=await f.call(s,6220,f.request(s,6220));check('pass cannot repeat with new request',()=>assert.equal(result.code,'TOP_ARENA_PASS_ALREADY_CLAIMED'));
 f.edit(s,p=>p.rechargeInfo.topArenaPasses={[f.cycleAt(f.time()).key]:true});result=await f.call(s,6220,f.request(s,6220));check('premium adds only extra',()=>{assert.equal(result.passRecord[1],3);assert.deepEqual(result.rewardInfo.items,live.TopArenaPassConfig[512][1].eRewards);});
 result=await f.call(s,6213,f.request(s,6213,{count:100,round:0,roomId:1,playerId:s.player._id}));check('guess outside phase rejected',()=>assert.equal(result.code,'TOP_ARENA_GUESS_CLOSED'));
 for(let i=0;i<8;i++){const other=f.player(i%2?1001:1002);await f.enter(other);}
 // Qualification fixture: nine users reached the real top512 before cutoff.
 Object.values(f.seasons.get(f.cycleAt(f.time()).key).players).forEach((p,i)=>p.rank=i+1);
 f.now(t.auditionEndTime);await f.enter(s);let state=f.seasons.get(f.cycleAt(f.time()).key);
 check('cutoff freezes9 entrants into64 rooms',()=>{assert.equal(state.frozen,true);assert.equal(state.rooms.length,64);assert.equal(state.rooms.reduce((n,r)=>n+r.slots.filter(Boolean).length,0),9);});
 result=await f.call(s,2350,getFight());check('late fight rejected',()=>assert.equal(result.code,'TOP_ARENA_AUDITION_CLOSED'));
 f.now(t.rounds[0].guessStart);await f.enter(s);state=f.seasons.get(state._id);const room=state.rooms.find(r=>r.slots.includes(s.player._id));
 req=f.request(s,6213,{round:0,roomId:room.roomId,playerId:s.player._id,count:100});result=await f.call(s,6213,req);
 check('guess debit181 and support map',()=>{assert.equal(result.result,0,JSON.stringify(result));assert.equal(s.player.items[181],9900);assert.equal(result.guessInfo.playerGuess[s.player._id],100);});
 await f.call(s,6213,req);check('guess retry once',()=>assert.equal(s.player.items[181],9900));
 result=await f.call(s,6213,f.request(s,6213,{round:0,roomId:room.roomId,playerId:'fake',count:100}));check('guess target validation',()=>assert.equal(result.code,'TOP_ARENA_TARGET_INVALID'));
 result=await f.call(s,6213,f.request(s,6213,{round:0,roomId:room.roomId,playerId:s.player._id,count:999999999}));check('bet cap',()=>assert.equal(result.code,'TOP_ARENA_INVALID_ARGUMENT'));
 f.now(t.rounds[0].guessEnd);result=await f.call(s,6213,f.request(s,6213,{round:0,roomId:room.roomId,playerId:s.player._id,count:100}));check('bet cutoff',()=>assert.equal(result.code,'TOP_ARENA_GUESS_CLOSED'));
 f.now(t.rounds[0].times[2]+1000);await f.service(1001).tick();state=f.seasons.get(state._id);
 check('512 to64 no invented players',()=>{assert.equal(state.rooms.filter(r=>r.round===1).length,8);assert.equal(Object.keys(state.players).length,9);});
 f.now(t.rounds[1].times[2]+1000);await f.service(1001).tick();state=f.seasons.get(state._id);check('64 to8',()=>assert.equal(state.rooms.filter(r=>r.round===2).length,1));
 f.now(t.settleTime+1000);f.faults({mail:true});await assert.rejects(()=>f.service(1001).tick());await f.service(1001).tick();await f.service(1002).tick();state=f.seasons.get(state._id);
 check('bracket completes',()=>assert.ok(state.rooms.every(r=>r.step===3)));
 check('cross-server mail retry once',()=>{assert.equal(state.settled,true);assert.equal(state.delivered.length,state.payouts.length);assert.equal(f.mails.size,state.payouts.length);});
 check('all reward categories frozen',()=>{for(const name of ['BXH 1','BXH 2','BXH 3','Dự đoán'])assert.ok(state.payouts.some(x=>x.title.includes(name)),name);});
 const count=f.mails.size;await f.service(1001).tick();check('settlement repeated safe',()=>assert.equal(f.mails.size,count));
 const replay=[...f.replays.keys()][0];assert.ok((await f.service(1001).playback(replay)).fightResult);results.push('stored fight replay');
 result=await f.call(s,6216,f.request(s,6216));check('worship reward once',()=>assert.equal(result.result,0));result=await f.call(s,6216,f.request(s,6216));check('worship duplicate rejected',()=>assert.equal(result.code,'TOP_ARENA_ALREADY_CLAIMED'));
 f.now(f.cycleAt(f.time()).endTime+1000);result=await f.enter(s);check('new season rank reset and archive retained',()=>{assert.equal(result.challengeInfo.rank,999);assert.deepEqual(result.playerInfo.passRecord,{});assert.equal(f.seasons.size,2);});
 const old=f.seasons.values().next().value;old.settled=false;f.seasons.delete(f.cycleAt(f.time()).key);result=await f.enter(s);check('unpaid previous season blocks',()=>assert.equal(result.code,'TOP_ARENA_SETTLEMENT_PENDING'));
 check('network blocked',()=>assert.equal(networkAttempts,0));
 console.log(JSON.stringify({result:'PASS',checks:results.length,tests:results,productionWrites:0,networkAttempts},null,2));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

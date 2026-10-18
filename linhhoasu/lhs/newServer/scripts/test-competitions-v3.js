'use strict';
const assert = require('assert/strict'), path = require('path');
const app = process.env.COMPETITION_APP || path.resolve(__dirname, '..');
let networkAttempts = 0;
const deny = () => { networkAttempts++; throw Error('TEST_NETWORK_DENIED'); };
require('net').Socket.prototype.connect = deny; require('tls').connect = deny;
for (const mod of ['http','https']) { require(mod).request = deny; require(mod).get = deny; } global.fetch = deny;
const loggerPath = require.resolve(app+'/src/logger');
require.cache[loggerPath] = { id:loggerPath,filename:loggerPath,loaded:true,exports:{info(){},warn(){},error(){},debug(){}} };
const cross = require(app+'/src/services/CrossServerEventService');
const config = require(app+'/src/services/ConfigService');
const { createService } = require(app+'/src/services/CrossArenaService');
const realBattle = require(app+'/src/services/BattleService');
const helpers = require(app+'/src/handlers/arena').competitionHelpers;
const clone = v => v == null ? v : JSON.parse(JSON.stringify(v));
const at = (o,k) => k.split('.').reduce((v,n)=>v?.[n],o);
function match(r,q) { return Object.entries(q).every(([k,v]) => {
  if(k==='$or')return v.some(x=>match(r,x)); if(k==='$and')return v.every(x=>match(r,x));
  const x=at(r,k);if(v && typeof v==='object' && !Array.isArray(v))return Object.entries(v).every(([op,n])=>
    op==='$exists'?(x!==undefined)===n:op==='$in'?n.includes(x):op==='$ne'?(Array.isArray(x)?!x.some(y=>JSON.stringify(y)===JSON.stringify(n)):x!==n):op==='$gte'?x>=n:op==='$gt'?x>n:op==='$lt'?x<n:op==='$lte'?x<=n:op==='$not'?(Array.isArray(x)&&n?.$elemMatch? !x.some(y=>Object.entries(n.$elemMatch).every(([ek,ev])=>y?.[ek]===ev)):true):op==='$elemMatch'?(Array.isArray(x)&&x.some(y=>Object.entries(n).every(([ek,ev])=>y?.[ek]===ev))):x===n);
  return Array.isArray(x)&&!Array.isArray(v)?x.includes(v):x===v;
}); }
function memoryModel() {
  const rows=new Map();let failCreate=false, failQuery=false;
  function query(value) {let list=Array.isArray(value)?value:[value],single=!Array.isArray(value),limit=Infinity,fields;
    const project=r=>{
      if(!fields||!r||typeof r!=='object')return r;
      const keys=Object.keys(fields).filter(k=>fields[k]);
      if(!keys.length){const x=clone(r);for(const k of Object.keys(fields))delete x[k];return x;}
      const out=fields._id===0?{}:{_id:r._id};
      for(const k of keys){const v=at(r,k);if(v===undefined)continue;const parts=k.split('.');let into=out;
        for(const n of parts.slice(0,-1))into=into[n]||={};into[parts.at(-1)]=v;}
      return out;
    };
    return {select(f){fields=f;return this;},maxTimeMS(){return this;},lean(){return this;},limit(n){limit=n;return this;},
      sort(spec){list.sort((a,b)=>{for(const[k,d]of Object.entries(spec)){const x=at(a,k),y=at(b,k);if(x!==y)return(x>y?1:-1)*d;}return 0;});return this;},
      async exec(){if(failQuery)throw Error('INJECTED_QUERY_DOWN');const out=clone(list.slice(0,limit).map(project));return single?out[0]:out;},
      then(ok,no){return this.exec().then(ok,no);}};
  }
  function update(r,u){Object.assign(r,clone(u.$set||{}));for(const[k,v]of Object.entries(u.$inc||{}))r[k]=(Number(r[k])||0)+Number(v||0);for(const[k,v]of Object.entries(u.$addToSet||{})){r[k]||=[];if(!r[k].some(x=>JSON.stringify(x)===JSON.stringify(v)))r[k].push(clone(v));}for(const[k,v]of Object.entries(u.$push||{})){r[k]||=[];const vals=Array.isArray(v?.$each)?v.$each:[v];r[k].push(...clone(vals));if(Number.isFinite(v?.$slice)){const n=Number(v.$slice);r[k]=n<0?r[k].slice(n):r[k].slice(0,n);}}for(const[k,v]of Object.entries(u.$max||{}))r[k]=Math.max(r[k]||0,v);}
  return {rows,setFailCreate:v=>failCreate=v,setFailQuery:v=>failQuery=v,
    find:q=>query([...rows.values()].filter(r=>match(r,q))),findOne:q=>query([...rows.values()].find(r=>match(r,q))||null),findById:id=>query(rows.get(id)||null),
    countDocuments:q=>query([...rows.values()].filter(r=>match(r,q)).length),
    async create(r){if(failCreate)throw Error('INJECTED_CREATE_DOWN');if(rows.has(r._id))throw Object.assign(Error('DUPLICATE'),{code:11000});rows.set(r._id,clone(r));return clone(r);},
    updateOne(q,u,opt={}){return {async exec(){if(failQuery)throw Error('INJECTED_UPDATE_DOWN');let r=[...rows.values()].find(x=>match(x,q));
      if(!r&&opt.upsert){if(rows.has(q._id))throw Object.assign(Error('DUPLICATE'),{code:11000});r={_id:q._id,...clone(u.$setOnInsert||{})};rows.set(r._id,r);}
      if(r)update(r,u);return {matchedCount:r?1:0};}};},
    findOneAndUpdate(q,u){let r=[...rows.values()].find(x=>match(x,q));if(r)update(r,u);return query(r||null);},
  };
}
const start=Date.parse(cross.schedule.anchor)+7*86400000;
let now=start+3600000, sequence=0, saves=0, failSave='', simulatedWin=true;
const Entry=memoryModel(),Action=memoryModel(),stored=new Map(),sessions=new Map(),warnings=[],crossDefenderReceipts=new Map();
const runtime={getWsServer:()=>({getPlayerForMutation:id=>sessions.get(id)?.player,
 invalidatePlayerForMutation:id=>{if(sessions.has(id))sessions.get(id).player=null;}})};
const players={drainPendingSaves:async()=>{},savePlayer:async(id,p)=>{
  if(failSave==='before')throw Error('INJECTED_SAVE_BEFORE'); stored.set(id,clone(p));saves++;
  if(failSave==='after')throw Error('INJECTED_SAVE_AFTER');return p;
}};
const service=createService({Entry,Action,players,runtime,clock:()=>now,
 battle:{...realBattle,simulateBattle:(a,b,options)=>({...realBattle.simulateBattle(a,b,options),win:simulatedWin})},
 getServer:async sid=>({serverId:sid,openTime:start-30*86400000,running:true}),logger:{warn:s=>warnings.push(s)},
 loadProfile:async(sid,pid,uid)=>clone([...stored.values()].find(p=>p.serverId===sid&&p.playerId===pid&&p.userId===uid)),
 applyDefenderScore:async record=>{
  const receipt=String(record._id),delta=-Number(record.log?.scorechange||0);
  if(crossDefenderReceipts.has(receipt))return crossDefenderReceipts.get(receipt);
  const row=Entry.rows.get(record.targetEntryId)||[...Entry.rows.values()].find(x=>x.cycleKey===record.cycleKey&&x.serverId===record.targetServerId&&x.playerId===record.targetPlayerId);
  if(!row)throw Error('TEST_TARGET_NOT_FOUND');
  const before=Math.max(0,Number(row.score)||0),after=Math.max(0,before+delta),out={status:'applied',scoreBefore:before,scoreAfter:after,scoreChange:after-before};
  row.score=after;row.revision=(Number(row.revision)||0)+1;
  const target=[...stored.values()].find(p=>p.serverId===record.targetServerId&&p.playerId===record.targetPlayerId);
  if(target){target.crossArenaInfo=target.crossArenaInfo||{};target.crossArenaInfo.score=after;stored.set(target.userId,clone(target));}
  crossDefenderReceipts.set(receipt,out);return out;
 }});
function session(sid=1001){const n=++sequence,p={_id:n.toString(16).padStart(24,'0'),userId:'qa_comp_'+n,playerId:'p_qa_'+n,serverId:sid,
 name:'Competition QA '+n,level:120,roleInfo:{kungfuId:4,subJob:0,stage:1},boxInfo:{level:1},equipInfo:{curIndex:0,equipSetMap:{0:{}}},
 petInfo:{pets:[]},fashionInfo:{},items:{110:50},currencies:{diamond:1000,silver:0,gold:0}};
 const s={serverId:sid,userId:p.userId,player:p};sessions.set(s.userId,s);stored.set(s.userId,clone(p));return s;}
const ack=(p,tag)=>(Array.isArray(p)?p:[p]).find(r=>r.tag===tag)?.data;
const req=(s,type=16,target)=>({requestId:'qa_competition_'+(++sequence),type,enemyid:target||s.player.crossArenaInfo.challenge.rows.find(r=>r.isRobot)?.dbid||s.player.crossArenaInfo.challenge.rows[0].dbid,
 challengeVersion:s.player.crossArenaInfo.challenge.version,cycleKey:s.player.crossArenaInfo.cycleKey});
const results=[];
function check(name,work){work();results.push(name);}
async function main(){
 check('cycle previous rejects negative',()=>assert.equal(cross.previousCycle(cross.cycleAt(Date.parse(cross.schedule.anchor))),null));
 check('cycle previous preserves actual event',()=>assert.equal(cross.previousCycle(cross.cycleAt(start)).event,'crossRival'));
 const closed=session();now=Date.parse(cross.schedule.independent.crossArena.activationAt)-1;let p=ack(await service.info({},closed,1),5000);
 check('closed cycle no writes',()=>{assert.equal(p.code,'CROSS_ARENA_CLOSED');assert.equal(saves,0);});now=start+3600000;
  const s4=session(1004);p=ack(await service.info({},s4,1),5000);check('S4 is accepted by the auto page-1 pool',()=>assert.equal(p.result,0));
 const low=session();low.player.level=99;p=ack(await service.info({},low,1),5000);check('level unlock authoritative',()=>assert.equal(p.code,'CROSS_ARENA_LOCKED'));
 const sa=session(1001),sb=session(1002),sc=session(1003);
 for(const s of [sa,sb,sc]){p=ack(await service.info({},s,10),5000);check('info native shape S'+s.serverId,()=>{assert.equal(p.result,0);assert(p.challengelist.length);assert.equal(p.ranklist.length,Entry.rows.size);});}
 now+=SNAPSHOT();p=ack(await service.info({},sa,11),5000);
 check('real cross-server identity and attrs',()=>{assert(p.challengelist.some(r=>r.serverId===1002));assert(sa.player.crossArenaInfo.challenge.rows.some(r=>r.playerId===sb.player.playerId&&r.robotAttrs[1]>0));});
 check('global rank independent of challenge list',()=>{assert.equal(p.count,4);assert.equal(p.ranklist.length,4);assert(p.ranklist.every(r=>r.dbid.length===24));});
 const profile=await service.profile(1002,sb.player._id);
 check('cross profile resolved in target server by owned roster identity',()=>{assert.equal(profile._id,sb.player._id);assert.equal(profile.serverId,1002);});
 check('foreign server profile rejected',()=>{});assert.equal(await service.profile(9999,sb.player._id),null);
 let r=req(sa,16,sa.player.crossArenaInfo.challenge.rows.find(r=>r.playerId===sb.player.playerId).dbid);
 const before=clone(sa.player), first=ack(await service.fight(r,sa,20),2300);
 check('win consumes one ticket and correct Cross reward',()=>{assert.equal(first.result,0);assert.equal(sa.player.items[110],before.items[110]-1);assert.equal(sa.player.items[89],10);assert.equal(sa.player.items[7],undefined);assert.equal(sa.player.currencies.silver,0);assert.equal(first.fightResult.entitys.length,2);assert(first.fightResult.events.length);});
 const after=clone(sa.player),duplicate=ack(await service.fight(r,sa,21),2300);
 check('durable replay no second payout and complete battle',()=>{assert.equal(duplicate.result,0);assert.equal(duplicate.recovered,true);assert.equal(duplicate.fightResult.entitys.length,2);assert(duplicate.fightResult.events.length);assert.deepEqual(sa.player.items,after.items);});
 const bad=ack(await service.fight({...r,enemyid:'different'},sa,22),2300);
 check('request fingerprint conflict rejected',()=>assert.equal(bad.code,'CROSS_ARENA_REQUEST_CONFLICT'));
 const oldVersion=ack(await service.fight({...r,requestId:'qa_new_stale_request'},sa,23),2300);
 check('spent snapshot cannot be reused with new request id',()=>assert.equal(oldVersion.code,'CROSS_ARENA_SNAPSHOT_STALE'));
 p=ack(await service.info({},sb,24),5000);
 const defence=p.loglist.find(l=>l.atk===0);check('defender receives shared negative score log',()=>{assert(defence);assert.equal(defence.dbid,sa.player._id);assert.equal(defence.score,-first.scorechange);assert.equal(defence.revenge,3);assert.equal(p.score,1000-first.scorechange);});
 simulatedWin=false;const robot=sa.player.crossArenaInfo.challenge.rows.find(x=>x.isRobot);r=req(sa,16,robot.dbid);
 const loss=ack(await service.fight(r,sa,27),2300);
 check('loss grants configured reward and consumes ticket',()=>{assert.equal(loss.result,0);assert.equal(loss.win,0);assert.deepEqual(loss.rewards,config.get('CrossArenaBaseConfig').arenaFailReward[0]);assert.equal(sa.player.items[89],15);});simulatedWin=true;
 p=ack(await service.info({},sa,28),5000);const lost=p.loglist.find(l=>l.atk===1&&l.score<0&&l.revenge===0);
 const revenge=ack(await service.fight(req(sa,17,String(lost.uid)),sa,29),2300);
 check('native negative-score log supports revenge outside challenge list',()=>{assert.equal(revenge.result,0,JSON.stringify(revenge));assert.equal(revenge.enemyid,String(lost.uid));assert.equal(revenge.fightResult.entitys[1].dbid,robot.dbid);});
 const used=ack(await service.fight(req(sa,17,String(lost.uid)),sa,29),2300);
 check('revenge cannot be reused',()=>assert.equal(used.code,'CROSS_ARENA_REVENGE_UNAVAILABLE'));
 const empty=session();empty.player.items[110]=0;await service.info({},empty,30);r=req(empty);
 p=ack(await service.fight(r,empty,31),2300);check('zero ticket denied',()=>assert.equal(p.code,'CROSS_ARENA_TICKET_NOT_ENOUGH'));
 const initialized=empty.player.crossArenaInfo.ticketRecoveredAt;
 now+=7200000;await service.info({},empty,32);
 check('two-hour ticket recovery without legacy grant',()=>{assert.equal(empty.player.items[110],1);assert(initialized>0);});
 const extra=sa.player.items[110];now+=86400000;p=ack(await service.info({},sa,33),5000);
 check('daily counter reset preserves purchased ticket surplus',()=>{assert.equal(p.dailyCount,0);assert.equal(sa.player.items[110],extra);});
 r=req(sa);const concurrent=await Promise.all([service.fight(r,sa,34),service.fight(r,sa,35)]);
 check('concurrent identical requests charge once',()=>{assert(concurrent.every(x=>ack(x,2300).result===0));assert.equal(sa.player.items[110],extra-1);});
 const stale=req(sa);now+=SNAPSHOT();p=ack(await service.fight(stale,sa,36),2300);
 check('expired snapshot denied',()=>assert.equal(p.code,'CROSS_ARENA_SNAPSHOT_STALE'));
 await service.info({},sa,37);r=req(sa);
 failSave='after';p=ack(await service.fight(r,sa,38),2300);failSave='';
 check('ambiguous commit invalidates session',()=>{assert.equal(p.code,'CROSS_ARENA_COMMIT_UNKNOWN');assert.equal(sa.player,null);});
 sa.player=clone(stored.get(sa.userId));const committedTickets=sa.player.items[110];
 p=ack(await service.fight(r,sa,39),2300);
 check('relog recovers save-before-receipt crash',()=>{assert.equal(p.result,0);assert.equal(p.recovered,true);assert.equal(sa.player.items[110],committedTickets);});
 await service.info({},sa,40);r=req(sa);Action.setFailCreate(true);p=ack(await service.fight(r,sa,41),2300);
 check('shared log outage does not rerun committed fight',()=>{assert.equal(p.result,0,JSON.stringify(p));assert.equal(p.rankPending,true);assert.equal(sa.player.crossArenaInfo.outbox.length,1);});Action.setFailCreate(false);
 const outageTickets=sa.player.items[110];p=ack(await service.fight(r,sa,42),2300);
 check('outbox recovery is idempotent',()=>{assert.equal(p.result,0);assert.equal(sa.player.items[110],outageTickets);assert.equal(sa.player.crossArenaInfo.outbox.length,0);});
 await service.info({},sa,43);r=req(sa);failSave='before';p=ack(await service.fight(r,sa,44),2300);failSave='';
 check('save-before-write failure invalidates without stale rollback',()=>{assert.equal(p.code,'CROSS_ARENA_COMMIT_UNKNOWN');assert.equal(sa.player,null);});
 sa.player=clone(stored.get(sa.userId));now+=31000;p=ack(await service.fight(r,sa,45),2300);
 check('retry after confirmed uncommitted save charges once',()=>assert.equal(p.result,0));
 now=start+7*86400000;const snapshot=clone(sa.player);p=ack(await service.fight(req(sa),sa,46),2300);
 check('weekly rollover rejects old snapshot without mutation',()=>{assert.equal(p.code,'CROSS_ARENA_SNAPSHOT_STALE');assert.deepEqual(sa.player,snapshot);});
 check('legacy Arena receipt reconstructs entities without battle simulation',()=>{
  const out=helpers.recoverArenaFightResult({win:1,enemyid:'1',playerAttrs:{1:100,2:10},opponentAttrs:{1:90,2:5},fightResult:{type:2,entitys:[],events:[]}},sa.player);
  assert.equal(out.entitys.length,2);assert(out.events.length);assert.equal(out.win,1);
 });
 check('all score writes stay in CrossArena cycle',()=>{assert([...Entry.rows.values()].every(r=>r.event==='crossArena'&&r.cycleKey===cross.cycleFor('crossArena',start).key));});
 // Independent roster isolates refresh/protection scenarios from earlier ranks.
 const RE=memoryModel(),RA=memoryModel();let rn=start+3*86400000;
 const rs=createService({Entry:RE,Action:RA,players,runtime,clock:()=>rn,battle:{...realBattle,simulateBattle:(a,b,o)=>({...realBattle.simulateBattle(a,b,o),win:true})},
  getServer:async id=>({serverId:id,openTime:start-30*86400000,running:true}),logger:{warn(){}}});
 const rusers=[session(1001),session(1002),session(1003),session(1001)];
 for(const s of rusers)await rs.info({},s,70);
 const ru=rusers[0];rn+=91000;await rs.info({},ru,71);
 let refreshReq={requestId:'refresh_paid_v3_001',challengeVersion:ru.player.crossArenaInfo.challenge.version,cycleKey:ru.player.crossArenaInfo.cycleKey};
 const diamonds=ru.player.currencies.diamond,refreshAck=ack(await rs.refresh(refreshReq,ru,72),5001);
 check('refresh charges configured 10 diamonds and rotates version',()=>{assert.equal(refreshAck.result,0,JSON.stringify(refreshAck));assert.equal(ru.player.currencies.diamond,diamonds-10);assert.notEqual(refreshAck.challengeVersion,refreshReq.challengeVersion);});
 const refreshReplay=ack(await rs.refresh(refreshReq,ru,73),5001);
 check('refresh receipt prevents duplicate charge',()=>{assert.equal(refreshReplay.recovered,true);assert.equal(ru.player.currencies.diamond,diamonds-10);});
 refreshReq={requestId:'refresh_cooldown_v3_001',challengeVersion:ru.player.crossArenaInfo.challenge.version,cycleKey:ru.player.crossArenaInfo.cycleKey};
 const cooldown=ack(await rs.refresh(refreshReq,ru,74),5001);check('refresh cooldown server-enforced',()=>assert.equal(cooldown.code,'CROSS_ARENA_REFRESH_COOLDOWN'));
 rn+=4000;ru.player.currencies.diamond=0;
 const poor=ack(await rs.refresh({...refreshReq,requestId:'refresh_poor_v3_001'},ru,75),5001);
 check('refresh insufficient currency makes no charge',()=>{assert.equal(poor.code,'CROSS_ARENA_REFRESH_COST_NOT_ENOUGH');assert.equal(ru.player.currencies.diamond,0);});
 const noIntent=ack(await rs.refresh({challengeVersion:refreshReq.challengeVersion},ru,76),5001);
 check('unidentified mutation refused',()=>assert.equal(noIntent.code,'CROSS_ARENA_REQUEST_REQUIRED'));
 RE.setFailQuery(true);const unavailable=ack(await rs.refresh({...refreshReq,requestId:'refresh_db_down_001'},ru,77),5001);RE.setFailQuery(false);
 check('shared DB failure is retryable and no charge',()=>{assert.equal(unavailable.result,-1);assert.equal(unavailable.retryable,true);assert.equal(ru.player.currencies.diamond,0);});
 for(const sid of [1002,1003]){const s=session(sid);rusers.push(s);await rs.info({},s,78);}
 rn+=91000;ru.player.currencies.diamond=1000;await rs.info({},ru,79);
 refreshReq={requestId:'refresh_no_change_001',challengeVersion:ru.player.crossArenaInfo.challenge.version,cycleKey:ru.player.crossArenaInfo.cycleKey};
 const noChange=ack(await rs.refresh(refreshReq,ru,80),5001);
 check('unchanged five real opponents are not charged',()=>{assert.equal(noChange.code,'CROSS_ARENA_REFRESH_NO_CHANGE');assert.equal(ru.player.currencies.diamond,1000);});
 const challenger=rusers[1],victim=rusers[2];await rs.info({},challenger,81);
 const attackA=req(ru,16,victim.player._id),attackB=req(challenger,16,victim.player._id);
 const paid=ack(await rs.fight(attackA,ru,82),2300);assert.equal(paid.result,0,JSON.stringify(paid));
 const tickets=challenger.player.items[110],protectedAck=ack(await rs.fight(attackB,challenger,83),2300);
 check('shared protection blocks second server without debit',()=>{assert.equal(protectedAck.code,'CROSS_ARENA_TARGET_PROTECTED');assert.equal(challenger.player.items[110],tickets);});
 rn+=31000;const unprotected=ack(await rs.fight(attackB,challenger,84),2300);
 check('protection expires consistently across servers',()=>{assert.equal(unprotected.result,0,JSON.stringify(unprotected));assert.equal(challenger.player.items[110],tickets-1);});
 assert.equal(networkAttempts,0);
 console.log(JSON.stringify({result:'PASS',checks:results.length,tests:results,saves,sharedReceipts:Action.rows.size,networkAttempts,productionWrites:0,warnings},null,2));
}
function SNAPSHOT(){return 91000;}
module.exports={memoryModel,clone,match};
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});

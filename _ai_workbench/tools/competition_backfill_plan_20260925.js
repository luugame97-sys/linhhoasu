'use strict';
// Uses raw read-only queries. Plans live outside runtime; this never sends mail.
const fs=require('fs'),crypto=require('crypto');
const app='/linhhoasu/lhs/newServer';
const {MongoClient}=require(app+'/node_modules/mongodb');
const logPath=require.resolve(app+'/src/logger');require.cache[logPath]={id:logPath,filename:logPath,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const config=require(app+'/src/services/ConfigService');config.loadAllTables();
const service=require(app+'/src/services/ArenaSettlementService');
const dir='/linhhoasu/_ai_workbench/backups/competition_auto_pool_20260925';
const sha=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
(async()=>{const client=new MongoClient('mongodb://127.0.0.1:27017',{maxPoolSize:2,serverSelectionTimeoutMS:5000});await client.connect();try{
const now=Date.now(),plans=[],skipped=[];
for(const sid of [1004,1005]){
 const db=client.db('lhs_s'+sid),server=await client.db('lhs_s1001').collection('gameservers').findOne({serverId:sid});
 const players=await db.collection('players').find({arenaScore:{$exists:true},isBot:{$ne:true},managedBot:{$ne:true}},{projection:{userId:1,playerId:1,name:1,arenaScore:1,createdAt:1,createTime:1,arenaReceiptLedger:1,arenaLogOutbox:1}}).maxTimeMS(10000).toArray();
 const logs=await db.collection('arenafightlogs').find({serverId:sid},{projection:{fightId:1,attackerId:1,preScore:1,postScore:1,scoreChange:1,createdAt:1}}).maxTimeMS(10000).toArray();
 const settlements=await db.collection('arenasettlements').find({serverId:sid}).toArray();
 for(const due of service.dueCutoffs(server.openTime,now)){
  const key=due.period==='day'?service.dayKey(due.cutoffAt):service.weekKey(due.cutoffAt),id=`arena_${sid}_${due.period}_${key}`;
  const existing=settlements.find(x=>x._id===id);if(existing){skipped.push({id,state:existing.state,n:existing.recipients?.length,sent:existing.delivered?.length});continue;}
  const eligible=players.filter(p=>Number(p.createdAt?new Date(p.createdAt):p.createTime)<=due.cutoffAt);
  const future=new Map(logs.filter(l=>Number(new Date(l.createdAt))>due.cutoffAt).map(l=>[String(l.fightId),l]));
  for(const p of eligible){for(const r of p.arenaReceiptLedger||[])if(r.fightId&&r.createdAt>due.cutoffAt&&!future.has(String(r.fightId)))future.set(String(r.fightId),{fightId:r.fightId,attackerId:p.playerId,scoreChange:r.scorechange,createdAt:new Date(r.createdAt),source:'ledger'});for(const r of p.arenaLogOutbox||[])if(r.fightId&&new Date(r.createdAt).getTime()>due.cutoffAt&&!future.has(String(r.fightId)))future.set(String(r.fightId),r);}
  const issues=[],checks=[];
  const rows=eligible.map(p=>{
   const after=[...future.values()].filter(l=>l.attackerId===p.playerId).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
   const historical=Number(p.arenaScore)-after.reduce((n,l)=>n+Number(l.scoreChange||0),0);
   if(!Number.isSafeInteger(historical)||historical<0)issues.push({playerId:p.playerId,error:'HISTORICAL_SCORE_INVALID'});
   const all=logs.filter(l=>l.attackerId===p.playerId).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
   if(after.length&&Number.isFinite(after[0].preScore)&&historical!==after[0].preScore)issues.push({playerId:p.playerId,error:'REVERSE_VS_FIRST_PRESCORE',historical,pre:after[0].preScore});
   for(let j=1;j<after.length;j++)if(Number.isFinite(after[j-1].postScore)&&Number.isFinite(after[j].preScore)&&after[j-1].postScore!==after[j].preScore)issues.push({playerId:p.playerId,error:'LOG_CHAIN_GAP'});
   if(after.length&&Number.isFinite(after.at(-1).postScore)&&after.at(-1).postScore!==p.arenaScore)issues.push({playerId:p.playerId,error:'CURRENT_SCORE_MISMATCH'});
   const prior=all.filter(l=>new Date(l.createdAt)<=due.cutoffAt).at(-1);
   if(prior&&Number.isFinite(prior.postScore)&&prior.postScore!==historical)issues.push({playerId:p.playerId,error:'PRIOR_SCORE_MISMATCH'});
   checks.push({playerId:p.playerId,futureLogs:after.length,priorConfirmed:!!prior,noFights:!all.length,current:p.arenaScore,historical});
   return{playerId:p.playerId,userId:p.userId,score:Math.max(0,historical),serverId:sid};
  }).sort((a,b)=>b.score-a.score||b.playerId.localeCompare(a.playerId)).map((r,i)=>({...r,rank:i+1}));
  const recipients=rows.map(r=>{const eventKey=`${id}_${r.playerId}`;return{...r,eventKey,mailId:crypto.createHash('sha256').update(eventKey).digest('hex').slice(0,24),attachments:service.rewardsForRank(due.period,r.rank)}});
  const plan={version:1,id,sid,period:due.period,cutoffAt:due.cutoffAt,activationAt:server.openTime,at:now,rows,recipients,checks,issues,hash:sha(recipients)};
  fs.mkdirSync(dir,{recursive:true,mode:0o700});const file=dir+'/'+id+'.plan.json';
  if(fs.existsSync(file)){const old=JSON.parse(fs.readFileSync(file,'utf8'));if(old.hash!==plan.hash)throw Error('EXISTING_PLAN_CHANGED:'+id);}else fs.writeFileSync(file,JSON.stringify(plan,null,2),{flag:'wx',mode:0o600});
  plans.push({id,sid,period:due.period,cutoffAt:due.cutoffAt,n:rows.length,issues,hash:plan.hash,top:rows.slice(0,3),file});
 }
}
console.log('RECOVERY_JSON='+JSON.stringify({at:new Date().toISOString(),plans,skipped,directPlayerWrites:0,mailWrites:0}));
}finally{await client.close()}})().catch(e=>{console.error(e.stack);process.exit(1)});

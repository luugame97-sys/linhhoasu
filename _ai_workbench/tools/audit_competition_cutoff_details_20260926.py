"""Read-only cutoff evidence for Arena backfill reconciliation."""
import json
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench' / 'temp' / 'competition_auto_pool_20260925'
SCRIPT = r'''
const app='/linhhoasu/lhs/newServer';
const {MongoClient}=require(app+'/node_modules/mongodb'),fs=require('fs'),crypto=require('crypto');
const loggerPath=require.resolve(app+'/src/logger');require.cache[loggerPath]={id:loggerPath,filename:loggerPath,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const config=require(app+'/src/services/ConfigService');config.loadAllTables();
const service=require(app+'/src/services/ArenaSettlementService');
const cutoffs={1004:[1789574400000],1005:[1789920000000,1790006400000,1790092800000,1790179200000,1790265600000,1790352000000]};
const sha=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const rewards=(period,rank)=>service.rewardsForRank(period,rank);
// Redis ZREVRANGE (the live Arena rank source) orders equal-score members by
// descending byte order. Keep the historical audit and the runtime policy
// aligned so tie ranks are reproducible across retries.
const canonical=a=>a.slice().sort((x,y)=>y.score-x.score||Buffer.compare(Buffer.from(String(y.playerId)),Buffer.from(String(x.playerId)))).map((r,i)=>({...r,rank:i+1}));
const initial=Number(config.get('ArenaBaseConfig').arenaScoreDefault);
(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:7000});await c.connect();try{
 const out={at:new Date().toISOString(),readOnly:true,cutoffs:{}};
 out.plans=[];out.reconciliation=[];out.initialScore=initial;
 for(const [sidText,cutoffList] of Object.entries(cutoffs)){
  const sid=Number(sidText),db=c.db('lhs_s'+sid),players=await db.collection('players').find({arenaScore:{$exists:true},isBot:{$ne:true},managedBot:{$ne:true}},{projection:{_id:0,userId:1,playerId:1,arenaScore:1,createdAt:1,createTime:1,arenaReceiptLedger:1,arenaLogOutbox:1}}).maxTimeMS(10000).toArray();
  const logs=await db.collection('arenafightlogs').find({serverId:sid},{projection:{_id:0,fightId:1,attackerId:1,preScore:1,postScore:1,scoreChange:1,createdAt:1,win:1}}).sort({createdAt:1}).maxTimeMS(10000).toArray();
  const settlements=await db.collection('arenasettlements').find({serverId:sid},{projection:{_id:1,period:1,cutoffAt:1,state:1,recipients:1,delivered:1}}).sort({cutoffAt:1}).maxTimeMS(10000).toArray();
  for(const cutoffAt of cutoffList){const rows=[];
  for(const p of players){
   const all=logs.filter(l=>String(l.attackerId)===String(p.playerId));
   const future=all.filter(l=>new Date(l.createdAt).getTime()>cutoffAt);
   const prior=all.filter(l=>new Date(l.createdAt).getTime()<=cutoffAt);
   const reverse=future.reduce((n,l)=>n+Number(l.scoreChange||0),0);
   const first=future.find(l=>Number.isFinite(Number(l.preScore)));
   const ledger=(p.arenaReceiptLedger||[]).filter(e=>e.fightId&&new Date(e.createdAt).getTime()>cutoffAt).map(e=>({fightId:e.fightId,createdAt:e.createdAt,scorechange:e.scorechange,scoreChange:e.scoreChange}));
   const outbox=(p.arenaLogOutbox||[]).filter(e=>e.fightId&&new Date(e.createdAt).getTime()>cutoffAt);
   const reversed=Math.max(0,Number(p.arenaScore||0)-reverse);
   const cutoffScore=first?Number(first.preScore):(prior.length?Number(prior[prior.length-1].postScore):reversed);
   const createdAt=p.createdAt?new Date(p.createdAt).getTime():Number(p.createTime||0);
   const last=prior.at(-1),boundaryIssue=first?(last?Number(last.postScore)!==Number(first.preScore):Number(first.preScore)!==initial):(last?Number(last.postScore)!==Number(p.arenaScore):Number(p.arenaScore)!==initial);
   // Adjacent pre/post evidence owns the cutoff; current-minus-future is only
   // a cross-check because later score rollbacks make it historically wrong.
   const anchored=first?Number(first.preScore):Number(p.arenaScore);
   rows.push({playerId:String(p.playerId),userId:String(p.userId),createdAt,eligible:Number.isFinite(createdAt)&&createdAt>0&&createdAt<=cutoffAt,current:Number(p.arenaScore||0),futureCount:future.length,priorCount:prior.length,reversed,firstPre:first?Number(first.preScore):null,lastPriorPost:last?Number(last.postScore):null,cutoffScore:anchored,boundaryIssue,ledger,outbox,future:future.map(l=>({fightId:l.fightId,createdAt:l.createdAt,pre:l.preScore,post:l.postScore,change:l.scoreChange,win:l.win}))});
  }
  rows.sort((a,b)=>b.cutoffScore-a.cutoffScore||String(b.playerId).localeCompare(String(a.playerId)));
  const affected=rows.filter(r=>r.firstPre!==null&&r.reversed!==r.firstPre||r.lastPriorPost!==null&&r.lastPriorPost!==r.cutoffScore);
  const eligible=rows.filter(r=>r.eligible),projected=canonical(eligible.map(r=>({playerId:r.playerId,userId:r.userId,serverId:sid,score:r.cutoffScore}))),boundaryIssues=eligible.filter(r=>r.boundaryIssue);
  out.cutoffs[sid+'_'+cutoffAt]={cutoffAt,players:rows.length,eligible:eligible.length,affectedCount:affected.length,boundaryIssues:boundaryIssues.map(r=>({playerId:r.playerId,firstPre:r.firstPre,lastPriorPost:r.lastPriorPost,current:r.current})),affected};
  const periods=sid===1005&&cutoffAt===1789920000000?['day','week']:['day'];
  for(const period of periods){
   const id=`arena_${sid}_${period}_${period==='day'?service.dayKey(cutoffAt):service.weekKey(cutoffAt)}`;
   const old=settlements.find(s=>s._id===id),recipients=projected.map(r=>({...r,attachments:rewards(period,r.rank)}));
   const diffs=[];
   if(old)for(const r of recipients){const prev=old.recipients.find(p=>p.playerId===r.playerId);if(!prev)throw Error('EXISTING_RECIPIENT_MISSING:'+id+':'+r.playerId);
    if(sha(r.attachments)!==sha(prev.attachments))diffs.push({playerId:r.playerId,userId:r.userId,oldRank:prev.rank,newRank:r.rank,oldScore:prev.score,newScore:r.score,oldAttachments:prev.attachments,newAttachments:r.attachments,topup:r.attachments.map(a=>({id:a.id,count:a.count-Number(prev.attachments.find(x=>x.id===a.id)?.count||0)})).filter(a=>a.count>0)});
   }
   const uncertainty=[];
   for(const b of boundaryIssues){const values=[b.firstPre,b.lastPriorPost,b.current].filter(v=>v!==null&&Number.isFinite(v));for(const score of new Set(values)){
    const alt=canonical(projected.map(r=>r.playerId===b.playerId?{...r,score}:r));
    for(const r of alt)if(sha(rewards(period,r.rank))!==sha(recipients.find(x=>x.playerId===r.playerId).attachments))uncertainty.push({ambiguousPlayer:b.playerId,possibleScore:score,impacted:r.playerId,rank:r.rank});
   }}
   const record={id,sid,period,cutoffAt,rows:projected,hash:sha(recipients),boundaryIssues:boundaryIssues.length,uncertainty,existing:old?{state:old.state,n:old.recipients.length,sent:old.delivered.length}:null,diffs};
   if(!old)out.plans.push(record);else out.reconciliation.push(record);
  }
 }}
 console.log('CUTOFF_DETAILS='+JSON.stringify(out));
}finally{await c.close()}})().catch(e=>{console.error(e.stack);process.exit(1)});
'''

def main():
    ssh = connect()
    try:
        data = json.loads(run(ssh, 'cd /linhhoasu/lhs/newServer && node -', SCRIPT).split('CUTOFF_DETAILS=')[-1])
    finally:
        ssh.close()
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'cutoff_details_20260926.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'at': data['at'], 'initialScore':data['initialScore'], 'plans':[{k:v for k,v in r.items() if k not in ['rows','diffs']} for r in data['plans']], 'reconciliation':[{k:v for k,v in r.items() if k not in ['rows']} for r in data['reconciliation']]}, ensure_ascii=True, indent=2))

if __name__ == '__main__':
    main()

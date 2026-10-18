"""Idempotent single-cutoff S5 Arena backfill; called once per day cutoff."""
import json, shlex, sys
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run
ROOT=Path(__file__).resolve().parents[2]; BACK='/linhhoasu/_ai_workbench/backups/competition_auto_pool_20260925'; OUT=ROOT/'_ai_workbench/temp/competition_auto_pool_20260925'; OPEN=1789873200000
REMOTE=r"""
require('/linhhoasu/lhs/newServer/node_modules/dotenv').config({path:'/linhhoasu/lhs/newServer/.env',quiet:true});process.env.MONGO_URI='mongodb://localhost:27017/lhs_s1005';process.env.IDENTITY_MONGO_DB='lhs_s1001';
const mongo=require('/linhhoasu/lhs/newServer/src/db/mongo'),Config=require('/linhhoasu/lhs/newServer/src/services/ConfigService'),Player=require('/linhhoasu/lhs/newServer/src/db/models/Player'),ArenaFightLog=require('/linhhoasu/lhs/newServer/src/db/models/ArenaFightLog'),Service=require('/linhhoasu/lhs/newServer/src/services/ArenaSettlementService'),Settlement=require('/linhhoasu/lhs/newServer/src/db/models/ArenaSettlement');
(async()=>{await mongo.connect();Config.loadAllTables();const cutoffAt=Number(process.argv[1]),now=Date.now();
const provider=async({serverId,cutoffAt})=>{const [rows,logs]=await Promise.all([Player.find({arenaScore:{$exists:true},isBot:{$ne:true},managedBot:{$ne:true},$or:[{createdAt:{$lte:new Date(cutoffAt)}},{createdAt:{$exists:false},createTime:{$lte:cutoffAt}}]}).select({userId:1,playerId:1,arenaScore:1,arenaReceiptLedger:1,arenaLogOutbox:1,_id:0}).maxTimeMS(5000).lean(),ArenaFightLog.find({serverId,createdAt:{$gt:new Date(cutoffAt)}}).select({fightId:1,attackerId:1,scoreChange:1,createdAt:1,preScore:1,postScore:1,_id:0}).sort({createdAt:-1}).maxTimeMS(5000).lean()]);const rev=new Map(),comm=new Map(logs.map(x=>[String(x.fightId),x]));for(const p of rows){for(const e of p.arenaReceiptLedger||[])if(e.fightId&&e.createdAt>cutoffAt)comm.set(String(e.fightId),{attackerId:p.playerId,scoreChange:e.scorechange,createdAt:new Date(e.createdAt)});for(const e of p.arenaLogOutbox||[])if(e.fightId&&new Date(e.createdAt).getTime()>cutoffAt)comm.set(String(e.fightId),e);}comm.forEach(l=>{const id=String(l.attackerId||'');if(id)rev.set(id,(rev.get(id)||0)+(Number(l.scoreChange)||0));});const rows2=rows.map(r=>{const all=logs.filter(l=>l.attackerId===r.playerId).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));const future=all.find(l=>new Date(l.createdAt)>cutoffAt&&Number.isFinite(Number(l.preScore)));const prior=[...all].reverse().find(l=>new Date(l.createdAt)<=cutoffAt&&Number.isFinite(Number(l.postScore)));const score=future?Number(future.preScore):prior?Number(prior.postScore):Math.max(0,(Number(r.arenaScore)||0)-(rev.get(String(r.playerId))||0));return{playerId:String(r.playerId),userId:String(r.userId),score:Math.max(0,score)};}).sort((a,b)=>b.score-a.score||a.playerId.localeCompare(b.playerId));return{cutoffAt,complete:true,rows:rows2.map((r,i)=>({...r,rank:i+1,serverId}))};};
const svc=Service.createService({serverId:1005,enabled:true,approved:true,activationAt:1789873200000,snapshotProvider:provider});const r=await svc.settleArenaPeriod('day',cutoffAt);const d=await Settlement.findById(`arena_1005_day_${new Date(cutoffAt+7*3600000).toISOString().slice(0,10).replaceAll('-','')}`).select({_id:1,state:1,cutoffAt:1,recipients:1,delivered:1,completedAt:1}).lean();console.log('ONE_BACKFILL='+JSON.stringify({cutoffAt,result:r,settlement:d?{_id:d._id,state:d.state,recipients:d.recipients.length,delivered:d.delivered.length,completedAt:d.completedAt}:null}));await mongo.disconnect()})().catch(e=>{console.error(e.stack);process.exitCode=1});
"""
def main():
  cutoffs=sys.argv[1:] or ['1789920000000','1790006400000','1790092800000','1790179200000','1790265600000']
  s=connect()
  try:
    OUT.mkdir(parents=True,exist_ok=True); results=[]
    for c in cutoffs:
      raw=run(s,'node -e '+shlex.quote(REMOTE)+' '+shlex.quote(str(c)))
      data=json.loads(raw.split('ONE_BACKFILL=')[-1]);results.append(data)
      (OUT/f's5_arena_backfill_{c}.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
      print(json.dumps(data,ensure_ascii=False),flush=True)
    (OUT/'s5_arena_backfill_results.json').write_text(json.dumps({'directPlayerWrites':0,'results':results},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
  finally:s.close()
if __name__=='__main__':main()

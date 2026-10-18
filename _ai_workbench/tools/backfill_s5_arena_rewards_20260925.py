"""Backfill only S5 Arena cutoffs from its opening through yesterday.

Uses the production ArenaSettlementService snapshot provider and durable
eventKey/mail receipts. No player documents are mutated; this writes only the
authorized settlement/mail reward outbox after a pre-snapshot is saved.
"""
import json, shlex
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'_ai_workbench/temp/competition_auto_pool_20260925'
BACK='/linhhoasu/_ai_workbench/backups/competition_auto_pool_20260925'
OPEN=1789873200000
REMOTE=r"""
require('/linhhoasu/lhs/newServer/node_modules/dotenv').config({path:'/linhhoasu/lhs/newServer/.env',quiet:true});
process.env.MONGO_URI='mongodb://localhost:27017/lhs_s1005';
process.env.IDENTITY_MONGO_DB='lhs_s1001';
const mongo=require('/linhhoasu/lhs/newServer/src/db/mongo');
const Config=require('/linhhoasu/lhs/newServer/src/services/ConfigService');
const Player=require('/linhhoasu/lhs/newServer/src/db/models/Player');
const ArenaFightLog=require('/linhhoasu/lhs/newServer/src/db/models/ArenaFightLog');
const Service=require('/linhhoasu/lhs/newServer/src/services/ArenaSettlementService');
const Settlement=require('/linhhoasu/lhs/newServer/src/db/models/ArenaSettlement');
const gameDay=require('/linhhoasu/lhs/newServer/src/services/GameDayService');
(async()=>{await mongo.connect();Config.loadAllTables();
const now=Date.now(),today=gameDay.end(now)-3600000;
const snapshotProvider=async({serverId,cutoffAt})=>{const [rows,futureLogs]=await Promise.all([
 Player.find({arenaScore:{$exists:true},isBot:{$ne:true},managedBot:{$ne:true},$or:[{createdAt:{$lte:new Date(cutoffAt)}},{createdAt:{$exists:false},createTime:{$lte:cutoffAt}}]}).select({userId:1,playerId:1,arenaScore:1,arenaReceiptLedger:1,arenaLogOutbox:1,_id:0}).maxTimeMS(5000).lean(),
 ArenaFightLog.find({serverId,createdAt:{$gt:new Date(cutoffAt)}}).select({fightId:1,attackerId:1,scoreChange:1,createdAt:1,_id:0}).sort({createdAt:-1}).maxTimeMS(5000).lean()]);
 const reverse=new Map(),committed=new Map(futureLogs.map(x=>[String(x.fightId),x]));
 for(const p of rows){for(const e of p.arenaReceiptLedger||[])if(e.fightId&&e.createdAt>cutoffAt)committed.set(String(e.fightId),{attackerId:p.playerId,scoreChange:e.scorechange,createdAt:new Date(e.createdAt)});for(const e of p.arenaLogOutbox||[])if(e.fightId&&new Date(e.createdAt).getTime()>cutoffAt)committed.set(String(e.fightId),e);}
 committed.forEach(l=>{const id=String(l.attackerId||'');if(id)reverse.set(id,(reverse.get(id)||0)+(Number(l.scoreChange)||0));});
 const projected=rows.map(r=>({playerId:String(r.playerId),userId:String(r.userId),score:Math.max(0,(Number(r.arenaScore)||0)-(reverse.get(String(r.playerId))||0))})).sort((a,b)=>b.score-a.score||b.playerId.localeCompare(a.playerId));
 return {cutoffAt,complete:true,rows:projected.map((r,i)=>({...r,rank:i+1,serverId}))};};
const svc=Service.createService({serverId:1005,enabled:true,approved:true,activationAt:OPEN,snapshotProvider});
const dues=Service.dueCutoffs(OPEN,now).filter(x=>x.period==='day'&&x.cutoffAt<today);
const before=await Settlement.find({serverId:1005},{_id:1,state:1,cutoffAt:1,recipients:1,delivered:1,expired:1,activationAt:1}).sort({cutoffAt:1}).lean();
const backup={at:new Date().toISOString(),directPlayerWrites:0,serverId:1005,openAt:OPEN,todayCutoff:today,dues,before};
const fs=require('fs');const backupPath='/linhhoasu/_ai_workbench/backups/competition_auto_pool_20260925/s5_arena_backfill_before.json';
fs.mkdirSync('/linhhoasu/_ai_workbench/backups/competition_auto_pool_20260925',{recursive:true});
if(fs.existsSync(backupPath)){const prior=JSON.parse(fs.readFileSync(backupPath,'utf8'));if(JSON.stringify(prior.before)!==JSON.stringify(before))throw Error('BACKFILL_BACKUP_DRIFT');}
else fs.writeFileSync(backupPath,JSON.stringify(backup,null,2),{mode:0o600});
const results=[];for(const d of dues){try{results.push(await svc.settleArenaPeriod('day',d.cutoffAt));}catch(e){results.push({period:'day',cutoffAt:d.cutoffAt,error:e.message});break;}}
const after=await Settlement.find({serverId:1005},{_id:1,state:1,cutoffAt:1,recipients:1,delivered:1,expired:1,activationAt:1,completedAt:1,lastError:1}).sort({cutoffAt:1}).lean();
console.log('BACKFILL_JSON='+JSON.stringify({at:new Date().toISOString(),directPlayerWrites:0,serverId:1005,openAt:OPEN,todayCutoff:today,dues,results,after}));await mongo.disconnect();})().catch(e=>{console.error(e.stack);process.exitCode=1});
"""

def main():
    s=connect()
    try:
        # First save an immutable local/remote preimage of settlement state.
        raw=run(s,'node -',REMOTE)
        data=json.loads(raw.split('BACKFILL_JSON=')[-1])
        OUT.mkdir(parents=True,exist_ok=True)
        (OUT/'s5_arena_backfill.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        # Backup is written only after the script has captured the before list;
        # settlement writes are already represented in the after list.
        print(json.dumps({k:data[k] for k in ['at','directPlayerWrites','serverId','openAt','todayCutoff','dues','results']},ensure_ascii=True,indent=2))
    finally:s.close()
if __name__=='__main__':main()

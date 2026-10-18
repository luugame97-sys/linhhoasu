"""Backfill only the two verified missing Arena periods, idempotently."""
import json
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/competition_backfill_missing_20260926.json'
REMOTE = r'''
const app='/linhhoasu/lhs/newServer';
require(app+'/node_modules/dotenv').config({path:app+'/.env',quiet:true});
const sid=Number(process.env.TARGET_SID), cutoffAt=Number(process.env.CUTOFF_AT), period=String(process.env.PERIOD), openAt=Number(process.env.OPEN_AT), expected=String(process.env.EXPECTED_SOURCE_HASH);
process.env.MONGO_URI=`mongodb://localhost:27017/lhs_s${sid}`;
process.env.IDENTITY_MONGO_DB='lhs_s1001';
const crypto=require('crypto'),fs=require('fs');
const mongo=require(app+'/src/db/mongo'),Config=require(app+'/src/services/ConfigService');
const Player=require(app+'/src/db/models/Player'),ArenaFightLog=require(app+'/src/db/models/ArenaFightLog');
const Settlement=require(app+'/src/db/models/ArenaSettlement'),Mail=require(app+'/src/db/models/Mail'),Service=require(app+'/src/services/ArenaSettlementService');
const sha=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function timeOf(v){const t=new Date(v).getTime();return Number.isFinite(t)?t:0;}
function canonical(rows){return rows.slice().sort((a,b)=>b.score-a.score||Buffer.compare(Buffer.from(String(b.playerId)),Buffer.from(String(a.playerId)))).map((r,i)=>({...r,rank:i+1}));}
(async()=>{await mongo.connect();Config.loadAllTables();
 const key=period==='week'?Service.weekKey(cutoffAt):Service.dayKey(cutoffAt),id=`arena_${sid}_${period}_${key}`;
 const [players,logs,existing]=await Promise.all([
  Player.find({arenaScore:{$exists:true},isBot:{$ne:true},managedBot:{$ne:true},$or:[{createdAt:{$lte:new Date(cutoffAt)}},{createdAt:{$exists:false},createTime:{$lte:cutoffAt}}]}).select({userId:1,playerId:1,arenaScore:1,createdAt:1,createTime:1,arenaReceiptLedger:1,arenaLogOutbox:1,_id:0}).maxTimeMS(10000).lean(),
  ArenaFightLog.find({serverId:sid,createdAt:{$gt:new Date(cutoffAt)}}).select({fightId:1,attackerId:1,preScore:1,postScore:1,scoreChange:1,createdAt:1,_id:0}).sort({createdAt:1}).maxTimeMS(10000).lean(),
  Settlement.findById(id).lean(),
 ]);
 const allLogs=await ArenaFightLog.find({serverId:sid}).select({fightId:1,attackerId:1,preScore:1,postScore:1,scoreChange:1,createdAt:1,_id:0}).sort({createdAt:1}).maxTimeMS(10000).lean();
 const futureByPlayer=new Map();
 for(const p of players){const map=new Map(logs.filter(l=>String(l.attackerId)===String(p.playerId)).map(l=>[String(l.fightId),l]));for(const e of p.arenaReceiptLedger||[])if(e.fightId&&timeOf(e.createdAt)>cutoffAt&&!map.has(String(e.fightId)))map.set(String(e.fightId),{attackerId:p.playerId,scoreChange:e.scorechange,createdAt:e.createdAt});for(const e of p.arenaLogOutbox||[])if(e.fightId&&timeOf(e.createdAt)>cutoffAt&&!map.has(String(e.fightId)))map.set(String(e.fightId),e);futureByPlayer.set(String(p.playerId),[...map.values()].sort((a,b)=>timeOf(a.createdAt)-timeOf(b.createdAt)));}
 const rows=[];
 for(const p of players){const pid=String(p.playerId),all=allLogs.filter(l=>String(l.attackerId)===pid),future=futureByPlayer.get(pid)||[],first=future.find(l=>Number.isFinite(Number(l.preScore))),prior=all.filter(l=>timeOf(l.createdAt)<=cutoffAt),last=prior.at(-1);const reverse=future.reduce((n,l)=>n+Number(l.scoreChange||0),0);const score=first?Number(first.preScore):last?Number(last.postScore):Math.max(0,Number(p.arenaScore||0)-reverse);rows.push({playerId:pid,userId:String(p.userId),serverId:sid,score:Math.max(0,score)});}
 const snapshot=canonical(rows),sourceHash=sha(snapshot),top=snapshot.slice(0,3);
 if(sourceHash!==expected)throw Error(`SOURCE_HASH_MISMATCH:${sourceHash}:${expected}`);
 const mailFilter={eventKey:{$regex:`^arena_${sid}_${period}_${key}(_|$)`}};
 const beforeMails=await Mail.find(mailFilter).select({_id:1,userId:1,eventKey:1,attachments:1,targetServerId:1,createdAt:1}).lean();
 if(existing&&existing.state!=='done')throw Error(`TARGET_SETTLEMENT_EXISTS_NOT_DONE:${id}`);
 if(beforeMails.length&&(!existing||existing.state!=='done'))throw Error(`TARGET_MAIL_COLLISION:${id}:${beforeMails.length}`);
 const backupDir='/linhhoasu/_ai_workbench/backups/competition_backfill_missing_20260926';fs.mkdirSync(backupDir,{recursive:true,mode:0o700});const backupPath=`${backupDir}/${id}.before.json`;
 if(!fs.existsSync(backupPath))fs.writeFileSync(backupPath,JSON.stringify({at:new Date().toISOString(),directPlayerWrites:0,sid,period,cutoffAt,openAt,id,settlement:existing,mails:beforeMails},null,2),{mode:0o600});
 let result={skipped:true,reason:'ALREADY_DONE',id};
 if(!existing||existing.state!=='done'){
  const provider=async()=>({cutoffAt,complete:true,rows:snapshot});
  const svc=Service.createService({serverId:sid,enabled:true,approved:true,activationAt:openAt,snapshotProvider:provider});
  result=await svc.settleArenaPeriod(period,cutoffAt);
 }
 const after=await Settlement.findById(id).select({_id:1,state:1,period:1,cutoffAt:1,activationAt:1,recipients:1,delivered:1,expired:1,completedAt:1,snapshotHash:1}).lean();
 const mails=await Mail.countDocuments(mailFilter);
 console.log('MISSING_BACKFILL='+JSON.stringify({at:new Date().toISOString(),directPlayerWrites:0,sid,period,cutoffAt,openAt,id,sourceHash,players:snapshot.length,top,result,settlement:after?{id:after._id,state:after.state,recipients:(after.recipients||[]).length,delivered:(after.delivered||[]).length,expired:(after.expired||[]).length,completedAt:after.completedAt,snapshotHash:after.snapshotHash}:null,mails,backupPath}));
 await mongo.disconnect();
})().catch(e=>{console.error(e.stack);process.exit(1)});
'''

JOBS = [
    {'sid': 1004, 'period': 'day', 'cutoff': 1789574400000, 'open': 1789552800000, 'hash': 'e7e5d6d520ba8bf92828557f4f85fcc33b4d39b5fa0f0efbe0d196377fc2622f'},
    {'sid': 1005, 'period': 'week', 'cutoff': 1789920000000, 'open': 1789873200000, 'hash': '7fd7aeeedf5aa1190dc3a031d9f81f30cea5154906d1f09a37443298880ac750'},
]


def main():
    ssh = connect()
    results = []
    try:
        for job in JOBS:
            env = ' '.join([
                f"TARGET_SID={job['sid']}", f"PERIOD={job['period']}", f"CUTOFF_AT={job['cutoff']}",
                f"OPEN_AT={job['open']}", f"EXPECTED_SOURCE_HASH={job['hash']}",
            ])
            raw = run(ssh, env + ' node -', REMOTE)
            marker = [line for line in raw.splitlines() if 'MISSING_BACKFILL=' in line]
            if not marker:
                raise RuntimeError(f'BACKFILL_NO_RESULT:{job["sid"]}:{raw[-1200:]}')
            results.append(json.loads(marker[-1].split('MISSING_BACKFILL=', 1)[1]))
            print(json.dumps(results[-1], ensure_ascii=False), flush=True)
    finally:
        ssh.close()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({'at': datetime.now(timezone.utc).isoformat(), 'directPlayerWrites': 0, 'results': results}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()

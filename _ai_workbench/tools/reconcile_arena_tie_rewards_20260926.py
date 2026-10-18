"""Reconcile S5 Arena tie-order underpayments without touching Player documents.

The old S5 backfill froze equal-score rows in ascending playerId order.  Redis
ZREVRANK, which is the live Arena rank source, uses descending member bytes.
This tool computes the exact cutoff roster, verifies its hash, then (only with
APPLY=1) sends deterministic delta mails for players who received less than
the live policy.  Overpayments are never clawed back.
"""
import base64
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "_ai_workbench" / "temp" / "competition_auto_pool_20260925"
BACKUP = "/linhhoasu/_ai_workbench/backups/arena_tie_reconcile_20260926_v1"
MARKER = "arena_tie_reconcile_20260926_v1"

TARGETS = [
    {"id": "arena_1005_day_20260920", "period": "day", "cutoffAt": 1789920000000,
     "expectedHash": "6b359c8fd4adc56053b2886d22572ea3ce7752a6a07ef337ebdb8d2f0e75dc79"},
    {"id": "arena_1005_day_20260921", "period": "day", "cutoffAt": 1790006400000,
     "expectedHash": "78e72e1b53994ef3e56c8dad3f029e348c0453cbb61c6466ec9f8dc88c87141e"},
    {"id": "arena_1005_day_20260922", "period": "day", "cutoffAt": 1790092800000,
     "expectedHash": "be9a115a9e15235b61f29bc70845376aeb3d9bbea78528afdf469f807cd57424"},
    {"id": "arena_1005_day_20260923", "period": "day", "cutoffAt": 1790179200000,
     "expectedHash": "e3de157f78a693091e78000b5fcca79ae80d19fea908f62f91c0c9b9bc779ee8"},
    {"id": "arena_1005_day_20260924", "period": "day", "cutoffAt": 1790265600000,
     "expectedHash": "6e37550d636681e49d31a4ad2864c381a8b920764174bcb8b93c47747851cd0f"},
]

REMOTE = r'''
const app='/linhhoasu/lhs/newServer';
require(app+'/node_modules/dotenv').config({path:app+'/.env',quiet:true});
process.env.MONGO_URI='mongodb://localhost:27017/lhs_s1005';
process.env.IDENTITY_MONGO_DB='lhs_s1001';
const fs=require('fs'),crypto=require('crypto');
const mongo=require(app+'/src/db/mongo'),Config=require(app+'/src/services/ConfigService');
const Player=require(app+'/src/db/models/Player'),ArenaFightLog=require(app+'/src/db/models/ArenaFightLog');
const Settlement=require(app+'/src/db/models/ArenaSettlement'),Mail=require(app+'/src/db/models/Mail');
const EventSettlement=require(app+'/src/db/models/EventRewardSettlement');
const Service=require(app+'/src/services/ArenaSettlementService');
const targets=JSON.parse(Buffer.from(process.env.TARGETS_B64,'base64').toString('utf8')), apply=process.env.APPLY==='1', debug=process.env.DEBUG==='1';
const marker=process.env.MARKER, backupPath=process.env.BACKUP_PATH;
const sha=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const t=v=>{const n=new Date(v).getTime();return Number.isFinite(n)?n:0;};
const n=v=>Number.isFinite(Number(v))?Number(v):0;
const canonical=a=>a.slice().sort((x,y)=>y.score-x.score||Buffer.compare(Buffer.from(String(y.playerId)),Buffer.from(String(x.playerId)))).map((r,i)=>({...r,rank:i+1}));
const amounts=a=>{const m=new Map();for(const r of Array.isArray(a)?a:[]){const id=n(r&&r.id),count=n(r&&r.count);if(Number.isSafeInteger(id)&&id>0&&Number.isSafeInteger(count)&&count>0)m.set(id,(m.get(id)||0)+count);}return m;};
const delta=(oldA,newA)=>{const om=amounts(oldA),nm=amounts(newA),out=[];for(const [id,count] of nm){const d=count-(om.get(id)||0);if(d>0)out.push({id,count:d});}return out.sort((a,b)=>a.id-b.id);};
const digest=x=>sha(x);

async function snapshotFor(cutoffAt,period){
  const [players,logs]=await Promise.all([
    Player.find({arenaScore:{$exists:true},isBot:{$ne:true},managedBot:{$ne:true},$or:[{createdAt:{$lte:new Date(cutoffAt)}},{createdAt:{$exists:false},createTime:{$lte:cutoffAt}}]}).select({_id:0,userId:1,playerId:1,arenaScore:1,createdAt:1,createTime:1,arenaReceiptLedger:1,arenaLogOutbox:1}).lean().maxTimeMS(10000),
    ArenaFightLog.find({serverId:1005}).select({_id:0,fightId:1,attackerId:1,preScore:1,postScore:1,scoreChange:1,createdAt:1,win:1}).sort({createdAt:1}).lean().maxTimeMS(10000),
  ]);
  const rows=[];
  for(const p of players){
    const all=logs.filter(l=>String(l.attackerId)===String(p.playerId));
    const future=all.filter(l=>t(l.createdAt)>cutoffAt);
    const prior=all.filter(l=>t(l.createdAt)<=cutoffAt);
    const first=future.find(l=>Number.isFinite(Number(l.preScore)));
    const last=prior.at(-1);
    const reversed=future.reduce((z,l)=>z+n(l.scoreChange),0);
    // With no post-cutoff preScore anchor, the audit policy keeps the
    // persisted cutoff/current score rather than trusting a possibly broken
    // prior-log chain (the day-24 boundary case is exactly this scenario).
    const score=first?n(first.preScore):n(p.arenaScore);
    const created=t(p.createdAt||p.createTime);
    if(!created||created>cutoffAt)continue;
    rows.push({playerId:String(p.playerId),userId:String(p.userId),serverId:1005,score:Math.max(0,score)});
  }
  const sorted=canonical(rows);
  return {cutoffAt,complete:true,rows:sorted,recipients:sorted.map(r=>({...r,attachments:Service.rewardsForRank(period,r.rank)}))};
}

(async()=>{await mongo.connect();Config.loadAllTables();
  const all=[];const source=[];const mismatches=[];
  for(const target of targets){
    const existing=await Settlement.findById(target.id).lean();
    if(!existing||existing.state!=='done')throw Error('SOURCE_SETTLEMENT_NOT_DONE:'+target.id);
    const snap=await snapshotFor(target.cutoffAt,target.period);
    const hash=digest(snap.recipients);
    if(hash!==target.expectedHash){if(!debug)throw Error('SOURCE_HASH_MISMATCH:'+target.id+':'+hash+':'+target.expectedHash);console.error('DEBUG_HASH='+JSON.stringify({id:target.id,hash,expected:target.expectedHash,rows:snap.recipients}));}
    const byId=new Map((existing.recipients||[]).map(r=>[String(r.playerId),r]));
    for(const row of snap.recipients){
      const old=byId.get(row.playerId);
      if(!old)throw Error('SOURCE_RECIPIENT_MISSING:'+target.id+':'+row.playerId);
      if(n(old.score)!==n(row.score))mismatches.push({id:target.id,playerId:row.playerId,oldScore:old.score,newScore:row.score});
      const topup=delta(old.attachments,row.attachments);
      if(topup.length)all.push({sourceSettlement:target.id,period:target.period,cutoffAt:target.cutoffAt,playerId:row.playerId,userId:row.userId,serverId:1005,score:row.score,oldRank:old.rank,newRank:row.rank,oldAttachments:old.attachments||[],newAttachments:row.attachments,attachments:topup});
    }
    source.push({id:target.id,cutoffAt:target.cutoffAt,expectedHash:target.expectedHash,actualHash:hash,recipients:(existing.recipients||[]).length,delivered:(existing.delivered||[]).length});
  }
  if(mismatches.length)throw Error('SOURCE_SCORE_MISMATCH:'+JSON.stringify(mismatches.slice(0,10)));
  all.sort((a,b)=>a.sourceSettlement.localeCompare(b.sourceSettlement)||String(a.playerId).localeCompare(String(b.playerId)));
  const receiptId=marker+'_s1005';
  const recipients=all.map((r,i)=>{const eventKey=marker+':'+r.sourceSettlement+':'+r.playerId;return {...r,eventKey,mailId:sha(eventKey).slice(0,24)};});
  const snapshotHash=digest(recipients);
  const currentReceipt=await EventSettlement.findById(receiptId).lean();
  const existingMails=await Mail.find({batchId:receiptId}).select({_id:1,userId:1,eventKey:1,attachments:1,targetServerId:1,claimed:1,createdAt:1}).lean();
  const plan={marker,receiptId,serverId:1005,source,recipients:recipients.length,recipientRows:recipients,sourceSettlements:source,existingReceipt:currentReceipt?{_id:currentReceipt._id,state:currentReceipt.state,snapshotHash:currentReceipt.snapshotHash,recipients:(currentReceipt.recipients||[]).length,delivered:(currentReceipt.delivered||[]).length}:null,existingMails:existingMails.length,sourceHash:sha(source)};
  if(currentReceipt&&currentReceipt.snapshotHash!==snapshotHash)throw Error('RECEIPT_SNAPSHOT_DRIFT:'+currentReceipt.snapshotHash+':'+snapshotHash);
  if(!apply){console.log('ARENA_RECONCILE='+JSON.stringify({at:new Date().toISOString(),mode:'dry-run',directPlayerWrites:0,mailWrites:0,snapshotHash,source,recipientCount:recipients.length,bySource:Object.fromEntries(source.map(x=>[x.id,recipients.filter(r=>r.sourceSettlement===x.id).length])),sample:recipients.slice(0,20)}));await mongo.disconnect();return;}
  fs.mkdirSync(backupPath,{recursive:true,mode:0o700});const backupFile=backupPath+'/before.json';
  if(!fs.existsSync(backupFile))fs.writeFileSync(backupFile,JSON.stringify({at:new Date().toISOString(),directPlayerWrites:0,receiptId,source,existingReceipt:currentReceipt,existingMails},null,2),{mode:0o600});
  else {const old=JSON.parse(fs.readFileSync(backupFile,'utf8'));if(sha(old.source)!==sha(source))throw Error('BACKUP_SOURCE_DRIFT');}
  let receipt=currentReceipt;
  if(!receipt){await EventSettlement.create({_id:receiptId,serverId:1005,event:{kind:'arena-tie-reconcile',key:marker,policy:'redis-zrevrange-desc-byte-v1',sourceSettlements:source.map(x=>x.id)},snapshotHash,recipients,delivered:[],expired:[],state:'pending',completedAt:0,lastError:''});receipt=await EventSettlement.findById(receiptId).lean();}
  if(!receipt||receipt.snapshotHash!==snapshotHash)throw Error('RECEIPT_READBACK_MISMATCH');
  let mailWrites=0,claimedSkipped=0,existingVerified=0;
  for(const r of receipt.recipients||[]){
    if((receipt.delivered||[]).includes(r.playerId)||(receipt.expired||[]).includes(r.playerId))continue;
    const claimed=await Player.findOne({userId:r.userId,mailClaimLedger:r.mailId}).select({_id:1}).lean();
    let mail=await Mail.findById(r.mailId).lean();
    if(!mail&&!claimed){
      const content='Bù chênh lệch phần thưởng Võ Đạo Hội: hạng cũ '+r.oldRank+', hạng chuẩn '+r.newRank+'.';
      try{mail=await Mail.create({_id:r.mailId,userId:r.userId,eventKey:r.eventKey,batchId:receiptId,title:'Bù chênh lệch Võ Đạo Hội',content,text:content,sender:'Hệ thống',attachments:r.attachments,targetType:'user',targetServerId:1005,createdBy:marker,expireAt:new Date(r.cutoffAt+30*86400000)});mailWrites++;}
      catch(e){if(e.code!==11000)throw e;mail=await Mail.findById(r.mailId).lean();}
    }
    if(mail){if(String(mail.userId)!==r.userId||mail.eventKey!==r.eventKey||Number(mail.targetServerId)!==1005||digest(mail.attachments)!==digest(r.attachments))throw Error('COMPENSATION_MAIL_COLLISION:'+r.mailId);existingVerified++;}
    else if(claimed)claimedSkipped++;
    await EventSettlement.updateOne({_id:receiptId},{$addToSet:{delivered:r.playerId}}).exec();
  }
  const after=await EventSettlement.findById(receiptId).lean();const complete=new Set([...(after?.delivered||[]),...(after?.expired||[])]);
  if((after?.recipients||[]).every(r=>complete.has(r.playerId)))await EventSettlement.updateOne({_id:receiptId},{$set:{state:'done',completedAt:Date.now(),lastError:''}}).exec();
  const final=await EventSettlement.findById(receiptId).lean();const finalMails=await Mail.countDocuments({batchId:receiptId});
  console.log('ARENA_RECONCILE='+JSON.stringify({at:new Date().toISOString(),mode:'applied',directPlayerWrites:0,receiptId,snapshotHash,source,recipientCount:(final?.recipients||[]).length,delivered:(final?.delivered||[]).length,state:final?.state,mailWrites,existingVerified,claimedSkipped,mailCount:finalMails,backupPath}));await mongo.disconnect();
})().catch(async e=>{console.error(e.stack||String(e));try{await mongo.disconnect();}catch(_){}process.exit(1)});
'''


def main():
    apply = "1" if os.environ.get("APPLY") == "1" else "0"
    env = " ".join([
        f"APPLY={apply}",
        "DEBUG=" + ("1" if os.environ.get("DEBUG") == "1" else "0"),
        f"MARKER={MARKER}",
        f"BACKUP_PATH={BACKUP}",
        "TARGETS_B64=" + base64.b64encode(json.dumps(TARGETS, separators=(",", ":")).encode()).decode(),
    ])
    ssh = connect()
    try:
        raw = run(ssh, env + " node -", REMOTE)
    finally:
        ssh.close()
    marker = [line for line in raw.splitlines() if "ARENA_RECONCILE=" in line]
    if not marker:
        raise RuntimeError("RECONCILE_NO_RESULT:" + raw[-2000:])
    data = json.loads(marker[-1].split("ARENA_RECONCILE=", 1)[1])
    OUT.mkdir(parents=True, exist_ok=True)
    suffix = "apply" if apply == "1" else "dryrun"
    (OUT / f"arena_tie_reconcile_20260926_{suffix}.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({k: data[k] for k in data if k not in {"sample"}}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

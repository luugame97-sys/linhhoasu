"""Read-only OldTrek audit for one S1 account; no RPC or DB writes."""
from __future__ import annotations

import json
from pathlib import Path

from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "_ai_workbench" / "temp" / "oldtrek_full_audit_20261016" / "vanduc97_s1_20261017.json"

NODE = r'''const {MongoClient}=require('mongodb');
const cfg=require('./src/services/ConfigService');
const common=cfg.get('OldTrekCommonEventConfig')||{};
const mini=cfg.get('OldTrekMiniGameConfig')||{};
const miniTables=Object.fromEntries([1,2,3,4].map((n)=>[n,cfg.get('OldTrekMiniGame'+n+'Config')||{}]));
const account='vanduc97';
const num=(v,d=null)=>{const n=Number(v);return Number.isFinite(n)?n:d};
const arr=v=>Array.isArray(v)?v:[];
const compact=(x)=>({
  uid:num(x&&x.uid), id:num(x&&x.id), pre:num(x&&x.pre), result:x&&x.result!=null?x.result:null,
  operate:x&&x.operate!=null?x.operate:null, param:x&&x.param!=null?x.param:null,
  code:x&&x.code!=null?x.code:null, revision:num(x&&x.revision), createdAt:num(x&&x.createdAt),
  time:x&&x.time!=null?x.time:null, rewardCount:arr(x&&x.rewards).length||arr(x&&x.rewardInfo).length||null,
  keys:x?Object.keys(x):[]
});
const eventShape=e=>e?({id:num(e.id),uid:num(e.uid),pre:num(e.pre),createdAt:num(e.createdAt),deadline:num(e.deadline),
  eventType:num(e.eventType),miniGameType:num(e.miniGameType),miniGameLevel:num(e.miniGameLevel),policyVersion:e.policyVersion??null,
  trekUid:num(e.trekUid),season:num(e.season),rootUid:num(e.rootUid),chainStep:num(e.chainStep),failedCheck:e.failedCheck??null,
  result:e.result??null,keys:Object.keys(e)}):null;
function checkEvent(e){
  if(!e)return {exists:false,issues:[]};
  const row=common[e.id]||common[String(e.id)]||null, issues=[];
  if(!row)issues.push('EVENT_ROW_MISSING');
  else if(e.eventType!=null&&num(row.eventType)!==num(e.eventType))issues.push('EVENT_TYPE_MISMATCH');
  if(row&&num(row.eventType)===4){
    const m=mini[e.id]||mini[String(e.id)]||null, t=m&&miniTables[num(m.type)]||null, levels=arr(m&&m.levelRange).map(Number);
    if(!m||!t)issues.push('MINIGAME_CONFIG_MISSING');
    else if(!levels.includes(num(e.miniGameLevel)))issues.push('MINIGAME_LEVEL_OUT_OF_RANGE');
    else if(!t[e.miniGameLevel]&&!t[String(e.miniGameLevel)])issues.push('MINIGAME_LEVEL_CONFIG_MISSING');
    if(e.puzzleBoard!==undefined&&(!Array.isArray(e.puzzleBoard)||e.puzzleBoard.length!==9))issues.push('PUZZLE_BOARD_INVALID');
  }
  const next=arr(row&&row.nextId).flatMap(x=>Array.isArray(x)?x:[x]).filter(x=>x!=null).map(Number);
  if(row&&next.length&&!next.some(n=>common[n]||common[String(n)]))issues.push('NEXT_EVENT_MISSING');
  return {exists:true,issues,row:row?{id:num(row.id),eventType:num(row.eventType),checkValue:row.checkValue||[],choices:row.choices||[],nextId:row.nextId||[],eventDesc:row.eventDesc??null,effectRewardsSuccessCount:arr(row.effectRewardsSuccess).length,effectRewardsFailureCount:arr(row.effectRewardsFailure).length}:null,mini:miscMini(e)};
}
function miscMini(e){
  if(!e||num(e.eventType)!==4)return null;
  const m=mini[e.id]||mini[String(e.id)]||null;
  return m?{id:num(m.id),type:num(m.type),levelRange:arr(m.levelRange),level:num(e.miniGameLevel),levelConfigExists:!!(miniTables[num(m.type)]&&((miniTables[num(m.type)])[e.miniGameLevel]||(miniTables[num(m.type)])[String(e.miniGameLevel)]))}:null;
}
(async()=>{
  const client=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:5000,connectTimeoutMS:5000,socketTimeoutMS:20000,maxPoolSize:1});
  await client.connect();
  try{
    const db=client.db('lhs_s1001'), col=db.collection('players');
    const players=await col.find({accountId:{$regex:'^'+account+'$',$options:'i'},serverId:1001},{projection:{_id:0,accountId:1,uid:1,userId:1,playerId:1,roleId:1,name:1,serverId:1,level:1,isBot:1,managedBot:1,updatedAt:1,'other_attr_info.oldTrekInfo':1},maxTimeMS:20000}).limit(10).toArray();
    const out={at:new Date().toISOString(),readOnly:true,directPlayerWrites:0,serverId:1,query:{field:'accountId',value:account,caseInsensitive:true},matches:[]};
    for(const p of players){
      const info=p.other_attr_info?.oldTrekInfo||{}, sail=info.sailInfo||{}, e=sail.currentEvent||null, logs=arr(sail.eventLogs), ledger=arr(info.eventLedger), trek=sail.trekData||null;
      out.matches.push({identity:{accountId:p.accountId??null,uid:p.uid??null,userId:p.userId??null,playerId:p.playerId??null,roleId:p.roleId??null,name:p.name??null,serverId:p.serverId??null,level:p.level??null,isBot:!!p.isBot,managedBot:!!p.managedBot,updatedAt:p.updatedAt??null},
        oldTrek:{keys:Object.keys(info),sailKeys:Object.keys(sail),currentEvent:eventShape(e),eventCheck:checkEvent(e),
          eventLogs:logs.slice(-20).map(compact),ledger:ledger.slice(-20).map(compact),
          state:{stateRevision:num(info.stateRevision),stage:num(sail.stage),arrive:sail.arrive??null,sailing:sail.sailing??null,endCache:sail.endCache??null,trekData:trek?{uid:num(trek.uid),id:num(trek.id),diff:num(trek.diff),dist:num(trek.dist),lastUpdateTime:num(trek.lastUpdateTime),keys:Object.keys(trek)}:null,
          effectsCount:arr(info.effects).length,cabin:arr(sail.cabin).map(x=>({uid:num(x.uid),id:num(x.id),count:num(x.count),state:num(x.state),targetUid:num(x.targetUid),keys:Object.keys(x)})),infoScalarKeys:Object.keys(info).filter(k=>!['sailInfo','eventLedger','effects'].includes(k))}},
        counts:{eventLogs:logs.length,ledger:ledger.length}});
    }
    console.log(JSON.stringify(out));
  }finally{await client.close();}
})().catch(e=>{console.error(e.stack||String(e));process.exitCode=1});'''

with connect() as client:
    raw = run(client, "cd /linhhoasu/lhs/newServer && node -", data=NODE)
result = json.loads(next(line for line in reversed(raw.splitlines()) if line.startswith("{")))
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"at": result["at"], "matches": len(result["matches"]), "path": str(OUT), "readOnly": True}, ensure_ascii=False))

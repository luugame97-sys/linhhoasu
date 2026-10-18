"""Read-only live audit for Võ hồn (216) and Thần binh (209) task unlock state."""
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
WB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WB / "temp/pydeps"))
from snapshot_web_multiserver_20260906 import connect, run

NODE = r'''
'use strict';
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const fs=require('fs'), cp=require('child_process');
const pm2=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'}));
const game=p=>Math.max(1,Math.ceil((Date.now()-Number(p.openTime||0))/86400000));
const ids=v=>new Set((Array.isArray(v)?v:[]).map(Number));
const stateMap=t=>{
  const out=new Map();
  if(t&&typeof t==='object'&&!Array.isArray(t)) Object.entries(t).forEach(([k,v])=>{if(v&&typeof v==='object')out.set(Number(v.id||k),v)});
  return out;
};
const taskStates=p=>{
  const ti=p.taskInfo||{}, out=stateMap(ti.tasks);
  for(const list of [ti.tasksMap&&ti.tasksMap['9'],ti.sideTasks,ti.type9Map]) for(const v of (Array.isArray(list)?list:[])) if(v&&typeof v==='object') out.set(Number(v.id),v);
  return out;
};
const samples=[]; const summary=[];
(async()=>{
  const mongo=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:7000}); await mongo.connect();
  try{
    for(const sid of [1001,1002,1003,1004]){
      const db=mongo.db('lhs_s'+sid); const server=await db.collection('servers').findOne({serverId:sid})||await db.collection('serverconfigs').findOne({serverId:sid})||{};
      const proc=pm2.find(x=>x.name==='lhs-s'+sid); const pe=proc&&proc.pm2_env&&proc.pm2_env.env||{};
      let openTime=Number(server.openTime||0); if(!openTime){
        try{const c=require('/linhhoasu/lhs/newServer/src/db/models/ServerConfig'); openTime=0;}catch(_){ }
      }
      const rows=await db.collection('players').find({}, {projection:{userId:1,playerId:1,name:1,level:1,createTime:1,createdAt:1,updatedAt:1,taskInfo:1,systemUnlockInfo:1,artifactInfo:1,valhallaInfo:1}}).maxTimeMS(20000).toArray();
      let unlocked209=0,unlocked216=0,eligible311=0,eligible313=0,stuck209=0,stuck216=0,root20=0,root2=0;
      let realPlayers=0,realUnlocked209=0,realUnlocked216=0,realEligible311=0,realEligible313=0,realStuck209=0,realStuck216=0,realRoot20=0,realRoot2=0;
      for(const p of rows){
        const u=ids(p.systemUnlockInfo&&p.systemUnlockInfo.unlockedSystem), ts=taskStates(p);
        const r20=ts.get(90020), r21=ts.get(90021), r2=ts.get(90002), r3=ts.get(90003);
        const isReal=!String(p.userId||'').startsWith('lhs_real_bot_'); if(isReal)realPlayers++;
        if(u.has(209))unlocked209++; if(u.has(216))unlocked216++; if(r20)root20++; if(r2)root2++;
        if(isReal){if(u.has(209))realUnlocked209++;if(u.has(216))realUnlocked216++;if(r20)realRoot20++;if(r2)realRoot2++;}
        // 311/313 are the native prerequisites; use actual persisted unlocks to avoid guessing day/level.
        const e209=u.has(311)&&!u.has(209), e216=u.has(313)&&!u.has(216);
        if(e209)eligible311++; if(e216)eligible313++;
        if(isReal){if(e209)realEligible311++;if(e216)realEligible313++;}
        const bad209=e209&&(!r20||Number(r20.status||0)!==30)&&(!r21||Number(r21.status||0)!==30);
        const bad216=e216&&(!r2||Number(r2.status||0)!==30)&&(!r3||Number(r3.status||0)!==30);
        if(bad209){stuck209++; if(isReal)realStuck209++; if(isReal&&samples.length<80)samples.push({serverId:sid,kind:'than_binh',userId:p.userId,name:p.name,level:p.level,systems:[...u].filter(x=>[209,311,216,313].includes(x)),tasks:[r20,r21].filter(Boolean)});}
        if(bad216){stuck216++; if(isReal)realStuck216++; if(isReal&&samples.length<80)samples.push({serverId:sid,kind:'vo_hon',userId:p.userId,name:p.name,level:p.level,systems:[...u].filter(x=>[209,311,216,313].includes(x)),tasks:[r2,r3].filter(Boolean)});}
      }
      summary.push({serverId:sid,db:db.databaseName,players:rows.length,realPlayers,serverOpenTime:openTime,unlocked209,unlocked216,eligibleWith311ButMissing209:eligible311,eligibleWith313ButMissing216:eligible313,task90020:root20,task90002:root2,stuck209,stuck216,real:{unlocked209:realUnlocked209,unlocked216:realUnlocked216,eligibleWith311ButMissing209:realEligible311,eligibleWith313ButMissing216:realEligible313,task90020:realRoot20,task90002:realRoot2,stuck209:realStuck209,stuck216:realStuck216},process:{pid:proc&&proc.pid,restarts:proc&&proc.pm2_env&&proc.pm2_env.restart_time,envSideTask:pe.FEATURE_SIDE_TASKS_ENABLED||null}});
    }
    console.log(JSON.stringify({at:new Date().toISOString(),readOnly:true,productionWrites:0,summary,samples}));
  } finally { await mongo.close(); }
})().catch(e=>{console.error(e.stack||String(e));process.exitCode=1});
'''

ssh = connect()
try:
    data = json.loads(run(ssh, 'node -', NODE))
finally:
    ssh.close()
out = WB / 'temp' / 'vo_hon_than_binh_audit_20260919.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'at': data['at'], 'summary': data['summary'], 'sampleCount': len(data['samples']), 'output': str(out), 'productionWrites': 0}, ensure_ascii=False))

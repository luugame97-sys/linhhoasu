"""Only read the known reported role and bounded event metadata."""
import json
from pathlib import Path
import paramiko
from rollback_role_lian_manifest_20260930 import ssh_config
ROOT=Path(__file__).resolve().parents[2]
JS=r'''
const fs=require('fs'),cp=require('child_process'),{MongoClient}=require('mongodb');
const procs=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:8e6}));
const p=procs.find(p=>p.name==='lhs-s1001');
const env={...require('dotenv').parse(fs.readFileSync('.env')),...p.pm2_env,...p.pm2_env.env};
const db=new MongoClient(env.MONGO_URI,{serverSelectionTimeoutMS:5000,socketTimeoutMS:8000,maxPoolSize:1});
(async()=>{try{
await db.connect();const role=await db.db().collection('players').findOne({userId:'u_Wk_1001_d7b1ec_1787996263464'}, {projection:{_id:0,name:1,level:1,'items.100802':1,'other_attr_info.oldTrekInfo':1},maxTimeMS:5000});
if(!role){console.log(JSON.stringify({found:false}));return;}
const i=role.other_attr_info?.oldTrekInfo||{},s=i.sailInfo||{},t=s.trekData||{},e=s.currentEvent||null;
console.log(JSON.stringify({at:new Date().toISOString(),readOnly:true,directPlayerWrites:0,node:p.name,role:role.name,level:role.level,boxCount:role.items?.['100802']||0,oldTrek:{stateRevision:i.stateRevision,sailing:i.sailing,stage:i.stage,season:i.season,endCache:i.endCache,trek:{uid:t.uid,id:t.id,diff:t.diff,dist:t.dist,encounterCount:t.encounterCount,lastUpdateTime:t.lastUpdateTime},event:e&&{id:e.id,uid:e.uid,createdAt:e.createdAt,deadline:e.deadline,miniGameType:e.miniGameType,chainStep:e.chainStep,trekUid:e.trekUid},eventLedger:(i.eventLedger||[]).slice(-5).map(x=>({uid:x.uid,operate:x.operate,param:x.param,time:x.time})),actions:(i.actionLedger||[]).slice(-8).map(x=>({tag:x.tag,at:x.at,time:x.time,requestId:x.requestId,result:x.response?.data?.result,code:x.response?.data?.code}))}}));
}finally{await db.close();}})().catch(e=>{console.error(e.message);process.exitCode=1});
'''
args,kw=ssh_config();c=paramiko.SSHClient();c.set_missing_host_key_policy(paramiko.AutoAddPolicy());c.connect(*args,**kw)
try:
    i,o,e=c.exec_command('cd /linhhoasu/lhs/newServer && node -',timeout=30);i.write(JS);i.channel.shutdown_write()
    out=o.read().decode('utf8');err=e.read().decode('utf8');rc=o.channel.recv_exit_status()
    if rc:raise RuntimeError(err[-600:])
    data=json.loads(out);(ROOT/'_ai_workbench/temp/petsoul_release_20261002/focus.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(data,ensure_ascii=False,indent=2))
finally:c.close()

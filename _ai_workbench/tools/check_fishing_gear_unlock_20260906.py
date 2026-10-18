"""Read-only unlock evidence for the gear release; no gameplay or DB writes."""
import json,sys
from pathlib import Path
import paramiko
from release_fishing_balance_20260906 import WB,run,node
sys.stdout.reconfigure(encoding='utf-8');c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
 out=node(s,"""const{MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();const o={};for(const name of ['lhs_s1001','lhs_s1002']){const d=c.db(name),rows=await d.collection('players').find({isBot:{$ne:true},'fishInfo.raftId':{$exists:true}},{projection:{_id:0,name:1,'fishInfo.raftRank':1,'fishInfo.raftLevel':1,'fishInfo.level':1,'systemUnlockInfo.unlockedSystem':1}}).toArray();o[name]={activeFish:rows.length,raftUnlocked:rows.filter(p=>p.systemUnlockInfo?.unlockedSystem?.includes(223)).length,screenshot:rows.filter(p=>p.name.toLowerCase()==='nicky').map(p=>({level:p.fishInfo.level,rodUnlocked:p.systemUnlockInfo?.unlockedSystem?.includes(215),raftUnlocked:p.systemUnlockInfo?.unlockedSystem?.includes(223)}))};}await c.close();console.log(JSON.stringify(o));})().catch(e=>{console.error(e.name);process.exitCode=1});""")
 (WB/'temp/fishing_gear_fix_20260906/unlocks.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
finally:s.close()

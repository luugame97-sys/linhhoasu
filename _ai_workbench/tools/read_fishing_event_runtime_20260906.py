"""Aggregate event presence/window by ID, no account identities or writes."""
import json,sys
from pathlib import Path
from datetime import datetime,timezone
import paramiko
from release_huyenvu_daily_20260906 import run,hashes,pm2,ready
WB=Path(__file__).resolve().parents[1]
SCRIPT=r"""
const{MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017',{maxPoolSize:1,serverSelectionTimeoutMS:8000});await c.connect();const result={},now=Date.now();
for(const n of ['lhs_s1001','lhs_s1002']){const db=c.db(n),players=db.collection('players');const agg=await players.aggregate([
 {$match:{isBot:{$ne:true}}},{$project:{datas:'$activityInfo.datas',disabled:'$activityInfo.disabledEntryIds'}},{$unwind:'$datas'},
 {$group:{_id:'$datas.id',players:{$sum:1},active:{$sum:{$cond:[{$and:[{$lte:['$datas.startTime',now]},{$gt:['$datas.endTime',now]}]},1,0]}},disabled:{$sum:{$cond:[{$in:['$datas.id',{$ifNull:['$disabled',[]]}]},1,0]}},minStart:{$min:'$datas.startTime'},maxEnd:{$max:'$datas.endTime'}}},{$sort:{_id:1}}
],{maxTimeMS:15000}).toArray();result[n]={humanPlayers:await players.countDocuments({isBot:{$ne:true}}),eventRows:agg};}
await c.close();console.log(JSON.stringify({time:new Date(now).toISOString(),servers:result}));})().catch(e=>{console.error(e.name+': '+e.message);process.exitCode=1;});
"""
def main():
 sys.stdout.reconfigure(encoding='utf-8');root=Path(sys.argv[1]).resolve();manifest=json.loads((root/'manifest.json').read_text(encoding='utf-8'))
 c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
 try:
  result=json.loads(run(s,'node -',SCRIPT,timeout=30));assert hashes(s,list(manifest['expected']))==manifest['expected']
  result.update(sourceHashesUnchanged=True,pm2=pm2(s),ready=ready(s),remoteWrites=0)
  (root/'runtime-events.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps(result))
 finally:s.close()
if __name__=='__main__':main()

"""Read-only QA residue and narrow current log audit."""
import json
from datetime import datetime,timezone
from snapshot_web_multiserver_20260906 import connect,run
from stage_fishing_economy_20260907 import ROOT
from verify_fishing_full_residue_20260906 import SCRIPT
state=json.loads((ROOT/'deploy.json').read_text())
script=SCRIPT.replace("const since='2026-09-06T12:12:37.634778+00:00';",'const since='+json.dumps(state['finishedAt'])+';').replace('session:qafull_*','session:qafeco_*').replace('/qa_fishing_full_live_20260906.js','/qa_live.js')
s=connect()
try:
 result=json.loads(run(s,'node -',script))
 mongo=json.loads(run(s,'node -',r'''const{MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();const out={};for(const id of[1001,1002]){const d=c.db('lhs_s'+id);out[id]={players:await d.collection('players').countDocuments({userId:/^qafeco_/}),mails:await d.collection('mails').countDocuments({userId:/^qafeco_/}),bottles:await d.collection('fishingbottles').countDocuments({owner:/^qafeco_/})};}await c.close();console.log(JSON.stringify(out));})().catch(e=>{console.error(e.message);process.exitCode=1;});'''))
 result.update(mongo=mongo,at=datetime.now(timezone.utc).isoformat())
 assert not result['ownedHarnessProcesses'];assert all(v['qaRedisSessions']==0 for v in result['servers'].values());assert all(not any(v.values())for v in mongo.values())
 (ROOT/'residue.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
finally:s.close()

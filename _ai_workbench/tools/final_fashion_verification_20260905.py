"""Postrelease protocol QA on disposable QA roles; read-only repair verification."""
import json,sys,shlex,hashlib
from datetime import datetime,timezone
import paramiko
from stage_fashion_fix_20260905 import run,pm2,WB,REL,APP
sys.stdout.reconfigure(encoding='utf-8');creds=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
out={'startedAt':datetime.now(timezone.utc).isoformat(),'qa':{}}
def execute(command,source):
 i,o,e=s.exec_command(command,timeout=60);i.write(source);i.channel.shutdown_write();text=o.read().decode('utf-8','replace');err=e.read().decode('utf-8','replace');code=o.channel.recv_exit_status();return code,text,err
try:
 stage=json.loads((REL/'stage.json').read_text());out['hashes']={r:run(s,f'sha256sum {APP}/{r}').split()[0]for r in stage['files']};assert out['hashes']==stage['candidateHashes']
 out['ready']={p:run(s,f'curl -s --max-time 3 -o /dev/null -w "%{{http_code}}" http://127.0.0.1:{p}/ready')for p in[8080,8083]};assert all(x=='200'for x in out['ready'].values())
 for server in[1001,1002]:
  source=(WB/'tools/qa_appearance_live_20260905.js').read_text(encoding='utf-8')
  code,text,error=execute(f'NODE_ENV=test LOG_DIR= QA_SERVER_ID={server} node -',source)
  (WB/'logs'/f'fashion_fix_live_s{server}_20260905.log').write_text(text+'\n'+error,encoding='utf-8')
  results={line.split('=',1)[0]:json.loads(line.split('=',1)[1])for line in text.splitlines()if line.startswith(('APPEARANCE_LIVE=','APPEARANCE_CLEANUP='))}
  out['qa'][str(server)]={'exit':code,'results':results};assert code==0,('QA failure '+str(server)+' '+error[-1800:])
  print(json.dumps({'server':server,'protocol':results}),flush=True)
 code,text,error=execute('node -',r"""
const{MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();const out={};for(const n of ['lhs_s1001','lhs_s1002']){const rows=await c.db(n).collection('players').find({'fashionOwnershipRepairLedger.fashion-body-ownership-v1-20260905':{$exists:true}},{projection:{fashionInfo:1,items:1,fashionOwnershipRepairLedger:1}}).toArray();let grants=0;const counts={};for(const p of rows){for(const x of p.fashionOwnershipRepairLedger['fashion-body-ownership-v1-20260905'].items){grants++;counts[x.id]=(counts[x.id]||0)+1;if(!(p.fashionInfo.activateFashion||[]).includes(x.id)&&!(p.fashionInfo.fashions?.[x.id]>0))throw new Error('REPAIRED_OWNERSHIP_MISSING');}}out[n]={repairedPlayers:rows.length,restoredOwnerships:grants,byId:counts};}await c.close();console.log(JSON.stringify(out));})().catch(e=>{console.error(e.message);process.exitCode=1;});
""")
 assert code==0;out['repairAfterRelog']=json.loads(text);assert out['repairAfterRelog']['lhs_s1001']['repairedPlayers']==48;assert out['repairAfterRelog']['lhs_s1001']['restoredOwnerships']==56
 out['pm2']=pm2(s);out['finishedAt']=datetime.now(timezone.utc).isoformat();out['passed']=True
finally:
 (REL/'final_verification.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');s.close()
print(json.dumps({'passed':out['passed'],'repair':out['repairAfterRelog'],'ready':out['ready']},ensure_ascii=False))

"""CAS rollout of explicit Pet compose missing-material messages."""
import hashlib,json,shlex,time
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
ROOT=Path(__file__).resolve().parents[2];LOCAL=ROOT/'linhhoasu/lhs/newServer/src/handlers/pet.js';REMOTE='/linhhoasu/lhs/newServer/src/handlers/pet.js';OLD='abe59d8a2531c633fe2b9c0e37beaf59df543a69f35b30c1ba26cf8a44f6f4b3';NEW='5518f1601b640def06c1fb89e5dd36672411d90747e20475735c69ed7ec5c32f';BACK='/linhhoasu/_ai_workbench/backups/pet_missing_cost_message_20260924';ST='/linhhoasu/_ai_workbench/temp/pet_missing_cost_message_20260924';NODES=[('lhs-s1005',8086),('lhs-s1001',8080),('lhs-s1002',8083),('lhs-s1003',8084),('lhs-s1004',8085)]
sha=lambda b:hashlib.sha256(b).hexdigest()
def main():
 payload=LOCAL.read_bytes()
 if sha(payload)!=NEW:raise RuntimeError('LOCAL_CANDIDATE_HASH_MISMATCH')
 s=connect();stage=None;swapped=False;restarted=[]
 try:
  with s.open_sftp() as f:
   before=f.open(REMOTE,'rb').read();attrs=f.stat(REMOTE)
   if sha(before)!=OLD:raise RuntimeError('REMOTE_CAS_DRIFT:'+sha(before))
   try:f.stat(BACK);exists=True
   except FileNotFoundError:exists=False
   if not exists:run(s,'install -d -m 700 '+shlex.quote(BACK))
   bp=BACK+'/pet.js.before'
   try:prior=f.open(bp,'rb').read()
   except FileNotFoundError:
    if exists:raise RuntimeError('REMOTE_BACKUP_MISSING')
    with f.open(bp,'wb') as h:h.write(before)
    f.chmod(bp,0o600)
   else:
    if prior!=before:raise RuntimeError('REMOTE_BACKUP_DRIFT')
   stage=ST+'_'+str(int(time.time()));run(s,'install -d -m 700 '+shlex.quote(stage));sp=stage+'/pet.js'
   with f.open(sp,'wb') as h:h.write(payload)
   f.chmod(sp,attrs.st_mode&0o777);run(s,'node --check '+shlex.quote(sp))
   check=run(s,'node -e '+shlex.quote("const s=require('fs').readFileSync(process.argv[1],'utf8');if(!s.includes('PET_COMPOSE_INSUFFICIENT_COST')||!s.includes('Quả Linh'))process.exit(2);console.log('PET_COST_MESSAGE_STAGE_PASS')")+' '+shlex.quote(sp)).strip()
   if check!='PET_COST_MESSAGE_STAGE_PASS':raise RuntimeError('STAGE_CHECK_FAILED')
   if f.open(REMOTE,'rb').read()!=before:raise RuntimeError('PRE_SWAP_CAS_DRIFT')
   f.posix_rename(sp,REMOTE);swapped=True
  for name,port in NODES:
   run(s,'pm2 restart '+shlex.quote(name)+' --update-env');restarted.append(name);code=''
   for _ in range(20):
    code=run(s,f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 3 http://127.0.0.1:{port}/ready || true").strip()
    if code=='200':break
    time.sleep(2)
   if code!='200':raise RuntimeError('READY_FAILED:'+name)
  status=json.loads(run(s,"pm2 jlist | node -e "+shlex.quote("let x='';process.stdin.on('data',d=>x+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(x).filter(p=>/^lhs-s100[1-5]$/.test(p.name)).map(p=>({name:p.name,status:p.pm2_env.status})))));")))
  if any(x.get('status')!='online' for x in status):raise RuntimeError('NODE_NOT_ONLINE')
  run(s,'pm2 save')
  out={'result':'DEPLOYED_PET_COST_MESSAGE','productionWrites':0,'before':OLD,'after':NEW,'backup':BACK,'restarted':restarted,'readiness':'PASS','processes':status,'stageCheck':check}
  (ROOT/'_ai_workbench/temp/pet_missing_cost_message_20260924_release.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(out,ensure_ascii=False,indent=2))
 except Exception:
  if swapped:
   try:
    run(s,'cp -p '+shlex.quote(BACK+'/pet.js.before')+' '+shlex.quote(REMOTE))
    for name,_ in NODES:
     try:run(s,'pm2 restart '+shlex.quote(name)+' --update-env')
     except Exception:pass
   except Exception:pass
  raise
 finally:
  if stage:
   try:run(s,'rm -f -- '+shlex.quote(stage+'/pet.js'));run(s,'rmdir -- '+shlex.quote(stage))
   except Exception:pass
  s.close()
if __name__=='__main__':main()

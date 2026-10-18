"""Deploy only the native mount level/star calculator parity patch."""
import hashlib,json,shlex,time
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
ROOT=Path(__file__).resolve().parents[2]
LOCAL=ROOT/'linhhoasu/lhs/newServer/src/services/BattleService.js'
BASE=ROOT/'_ai_workbench/backups/combat_parity_20260921_171507/local/lhs/newServer/src/services/BattleService.js'
REMOTE='/linhhoasu/lhs/newServer/src/services/BattleService.js'
BACKUP='/linhhoasu/_ai_workbench/backups/combat_mount_fix_20260922'
STAGE='/linhhoasu/_ai_workbench/temp/combat_mount_fix_20260922'
OUT=ROOT/'_ai_workbench/temp/combat_parity_20260922/mount_release.json'
NODES=[('lhs-s1002',8083),('lhs-s1001',8080),('lhs-s1003',8084),('lhs-s1004',8085),('lhs-s1005',8086)]
def sha(b):return hashlib.sha256(b).hexdigest()
def ready(s,p):
 cmd=f"for i in $(seq 1 90);do c=$(curl -fsS -o /dev/null -w '%{{http_code}}' --max-time 5 http://127.0.0.1:{p}/ready||true);[ \"$c\" = 200 ]&&echo 200&&exit 0;sleep 1;done;exit 1"
 return run(s,cmd).strip()
def main():
 local=LOCAL.read_bytes();base=BASE.read_bytes()
 if sha(base)!='4e0a562b8f97e8f7f86a3a9b020143bcc38d62780beca217eacd1819b2bd3e54':raise RuntimeError('BASELINE_HASH_UNEXPECTED')
 if local==base:raise RuntimeError('MOUNT_PATCH_MISSING')
 if b'Native MountModel.CreateMountAttrMap reads' not in local:raise RuntimeError('MOUNT_MARKER_MISSING')
 s=connect();touched=[];published=False;before=None
 try:
  with s.open_sftp() as sf:
   before=sf.open(REMOTE,'rb').read();attrs=sf.stat(REMOTE)
   if before!=base:raise RuntimeError('REMOTE_CAS_BASELINE_DRIFT:'+sha(before))
   try:sf.stat(BACKUP);exists=True
   except FileNotFoundError:exists=False
   if not exists:run(s,'install -d -m 700 '+shlex.quote(BACKUP))
   bp=BACKUP+'/BattleService.js.before'
   try:old=sf.open(bp,'rb').read()
   except FileNotFoundError:
    if exists:raise RuntimeError('BACKUP_MISSING')
    with sf.open(bp,'wb') as f:f.write(before)
    sf.chmod(bp,0o600)
   else:
    if old!=before:raise RuntimeError('BACKUP_DRIFT')
   if sf.open(REMOTE,'rb').read()!=before:raise RuntimeError('CAS_DRIFT')
   stage=STAGE+'_'+str(int(time.time()));run(s,'install -d -m 700 '+shlex.quote(stage))
   staged=stage+'/BattleService.js'
   with sf.open(staged,'wb') as f:f.write(local)
   sf.chmod(staged,attrs.st_mode&0o777)
   try:sf.chown(staged,attrs.st_uid,attrs.st_gid)
   except OSError:pass
   run(s,'node --check '+shlex.quote(staged))
   sf.posix_rename(staged,REMOTE);published=True
  for name,port in NODES:
   run(s,'pm2 restart '+shlex.quote(name)+' --update-env');touched.append(name)
   if ready(s,port)!='200':raise RuntimeError('READY_FAILED:'+name)
  readiness={str(p):run(s,f'curl -fsS http://127.0.0.1:{p}/ready').strip() for _,p in NODES}
  pm=json.loads(run(s,"pm2 jlist | node -e "+shlex.quote("let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).filter(p=>/^lhs-s100[1-5]$/.test(p.name)).map(p=>({name:p.name,status:p.pm2_env.status,pid:p.pid,restarts:p.pm2_env.restart_time})))));")))
  out={'result':'DEPLOYED_AND_READY','at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'productionWrites':0,'remote':REMOTE,'beforeSha':sha(before),'afterSha':sha(local),'backup':BACKUP,'restartOrder':touched,'readiness':readiness,'pm2':pm,'test':'test-mount-parity-20260922 PASS'}
  OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(out,ensure_ascii=False,indent=2))
 except Exception:
  if published and before is not None:
   try:
    with s.open_sftp() as sf:
     restore=STAGE+'_rollback_'+str(int(time.time()));run(s,'install -d -m 700 '+shlex.quote(restore));a=sf.stat(REMOTE);p=restore+'/BattleService.js'
     with sf.open(p,'wb') as f:f.write(before)
     sf.chmod(p,a.st_mode&0o777);sf.posix_rename(p,REMOTE)
    for name,port in NODES:
     if name in touched:run(s,'pm2 restart '+shlex.quote(name)+' --update-env');ready(s,port)
   except Exception:pass
  raise
 finally:s.close()
if __name__=='__main__':main()

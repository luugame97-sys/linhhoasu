"""Deploy online tier-up migration hook and completed-boss task frontier recovery."""
import hashlib,json,shlex,time
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
ROOT=Path(__file__).resolve().parents[2];APP=ROOT/'linhhoasu';REMOTE_ROOT='/linhhoasu'
BACKUP=REMOTE_ROOT+'/_ai_workbench/backups/demon_boss_drop_task_fix_20260922_v4';STAGE_ROOT=REMOTE_ROOT+'/_ai_workbench/temp/demon_boss_drop_task_fix_20260922_v4'
FILES=['lhs/newServer/src/handlers/dungeon.js','lhs/newServer/src/handlers/compat.js'];NODES=[('lhs-s1002',8083),('lhs-s1001',8080),('lhs-s1003',8084),('lhs-s1004',8085),('lhs-s1005',8086)]
def sha(b):return hashlib.sha256(b).hexdigest()
def ready(ssh,p):return run(ssh,f"for i in $(seq 1 90);do c=$(curl -fsS -o /dev/null -w '%{{http_code}}' --max-time 5 http://127.0.0.1:{p}/ready||true);if [ \"$c\" = 200 ];then echo 200;exit 0;fi;sleep 1;done;exit 1").strip()
def main():
 local={r:(APP/r).read_bytes() for r in FILES};ssh=connect();old={};published=[];touched=[]
 try:
  with ssh.open_sftp() as sf:
   stage=f'{STAGE_ROOT}/{int(time.time())}'
   for rel in FILES:
    remote=REMOTE_ROOT+'/'+rel;baseline=sf.open(BACKUP+'/'+rel.replace('/','__')+'.before','rb').read();current=sf.open(remote,'rb').read()
    if current!=baseline:raise RuntimeError('REMOTE_CAS_DRIFT:'+rel+':'+sha(current))
    old[rel]=current;staged=stage+'/'+rel;run(ssh,'install -d -m 700 '+shlex.quote(staged.rsplit('/',1)[0]))
    with sf.open(staged,'wb') as f:f.write(local[rel])
    sf.chmod(staged,0o755);run(ssh,'node --check '+shlex.quote(staged));sf.posix_rename(staged,remote);published.append(rel)
  for name,p in NODES:
   run(ssh,'pm2 restart '+shlex.quote(name)+' --update-env');touched.append(name)
   if ready(ssh,p)!='200':raise RuntimeError('READY_FAILED:'+name)
  with ssh.open_sftp() as sf:
   if any(sf.open(REMOTE_ROOT+'/'+r,'rb').read()!=local[r] for r in FILES):raise RuntimeError('HASH_MISMATCH')
  result={'result':'DEPLOYED_AND_READY','at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'productionWrites':0,'backup':BACKUP,'restartOrder':touched,'files':{r:{'before':sha(old[r]),'after':sha(local[r])} for r in FILES},'readiness':{n:json.loads(run(ssh,f'curl -fsS http://127.0.0.1:{p}/ready')) for n,p in NODES}}
  out=ROOT/'_ai_workbench/temp/demon_boss_drop_task_fix_20260922/release_v4.json';out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(result,ensure_ascii=False,indent=2))
 except Exception:
  with ssh.open_sftp() as sf:
   for rel in published:
    staged=f'{STAGE_ROOT}/rollback-{int(time.time())}/{rel}';run(ssh,'install -d -m 700 '+shlex.quote(staged.rsplit('/',1)[0]))
    with sf.open(staged,'wb') as f:f.write(old[rel])
    sf.chmod(staged,0o755);sf.posix_rename(staged,REMOTE_ROOT+'/'+rel)
  for n,p in NODES:
   if n in touched:run(ssh,'pm2 restart '+shlex.quote(n)+' --update-env');ready(ssh,p)
  raise
 finally:ssh.close()
if __name__=='__main__':main()

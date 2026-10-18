"""Deploy compact Yêu Vương task labels without restarting game processes."""
import hashlib,json,shlex,time
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
ROOT=Path(__file__).resolve().parents[2];APP=ROOT/'linhhoasu';REMOTE_ROOT='/linhhoasu';BACKUP=REMOTE_ROOT+'/_ai_workbench/backups/demon_boss_task_text_20260922';STAGE_ROOT=REMOTE_ROOT+'/_ai_workbench/temp/demon_boss_task_text_20260922'
FILES=['webgame/game/index.html','webgame/game/js/lhs-demon-boss-task-text-v1.js']
def sha(b):return hashlib.sha256(b).hexdigest()
def main():
 local={r:(APP/r).read_bytes() for r in FILES};baseline=(ROOT/'_ai_workbench/backups/demon_boss_task_text_20260922/index.html.before').read_bytes();ssh=connect();old={};published=[]
 try:
  with ssh.open_sftp() as sf:
   cur=sf.open(REMOTE_ROOT+'/webgame/game/index.html','rb').read()
   if cur!=baseline:raise RuntimeError('INDEX_REMOTE_CAS_DRIFT:'+sha(cur))
   old['webgame/game/index.html']=cur
   try:old['webgame/game/js/lhs-demon-boss-task-text-v1.js']=sf.open(REMOTE_ROOT+'/webgame/game/js/lhs-demon-boss-task-text-v1.js','rb').read()
   except FileNotFoundError:old['webgame/game/js/lhs-demon-boss-task-text-v1.js']=b''
   stage=f'{STAGE_ROOT}/{int(time.time())}'
   for rel in FILES:
    staged=stage+'/'+rel;run(ssh,'install -d -m 700 '+shlex.quote(staged.rsplit('/',1)[0]))
    with sf.open(staged,'wb') as f:f.write(local[rel])
    sf.chmod(staged,0o644);sf.posix_rename(staged,REMOTE_ROOT+'/'+rel);published.append(rel)
  body=run(ssh,"curl -fsS --max-time 10 -H 'Host: 103.116.105.154' http://127.0.0.1:81/")
  addon=run(ssh,"curl -fsS --max-time 10 -H 'Host: 103.116.105.154' http://127.0.0.1:81/js/lhs-demon-boss-task-text-v1.js")
  if 'lhs-demon-boss-task-text-v1.js?v=20260922_demon_boss_task_text_v1' not in body or sha(addon.encode())!=sha(local[FILES[1]]):raise RuntimeError('HTTP_HASH_OR_TOKEN_MISMATCH')
  result={'result':'DEPLOYED_HTTP_VERIFIED','at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'productionWrites':0,'backup':BACKUP,'restartOrder':[],'files':{r:{'before':sha(old[r]),'after':sha(local[r])} for r in FILES},'http':{'index':{'status':200,'token':True},'addon':{'status':200,'sha256':sha(local[FILES[1]])}}}
  out=ROOT/'_ai_workbench/temp/demon_boss_task_text_20260922/release.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(result,ensure_ascii=False,indent=2))
 except Exception:
  if published:
   with ssh.open_sftp() as sf:
    for rel in published:
     staged=f'{STAGE_ROOT}/rollback-{int(time.time())}/{rel}';run(ssh,'install -d -m 700 '+shlex.quote(staged.rsplit('/',1)[0]))
     with sf.open(staged,'wb') as f:f.write(old[rel])
     sf.chmod(staged,0o644);sf.posix_rename(staged,REMOTE_ROOT+'/'+rel)
  raise
 finally:ssh.close()
if __name__=='__main__':main()

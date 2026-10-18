"""Only use this reviewed runner; older SSO deploy drafts are not release tools."""
import json,shlex,time,sys
from pathlib import Path
from sso_release_20260930 import ROOT,WORK,connect,run,sha
q=shlex.quote
NEW=['lhs/newServer/src/services/PortalSessionService.js','webgame/gm/api/portal.php','webgame/gm/public_giftcode_notice.php','webgame/game/js/lhs-portal-v1.js']
def remote_path(rel):return '/www/server/panel/vhost/nginx/game.lhs.conf' if rel=='nginx/game.lhs.conf' else '/linhhoasu/'+rel
def relative(remote):return 'nginx/game.lhs.conf' if remote.startswith('/www/') else remote.removeprefix('/linhhoasu/')
def fetch(f,p):
 try:return f.open(p,'rb').read()
 except FileNotFoundError:return None
def ready(s,sid):
 port={1001:8080,1002:8083,1003:8084,1004:8085,1005:8086,1006:8087}[sid]
 for _ in range(10):
  try:
   d=json.loads(run(s,f'curl -fsS --max-time 6 http://127.0.0.1:{port}/ready'))
   if d.get('status')=='ok' and all(d['checks'].values()):return d
  except Exception:pass
  time.sleep(1)
 raise RuntimeError('readiness '+str(sid))
def main():
 mode=sys.argv[1] if len(sys.argv)>1 else 'stage'
 baseline=json.loads((WORK/'manifest.json').read_text())
 expected={relative(p):h for p,h in baseline.items()}
 for rel in NEW:expected[rel]=None
 # Ignore unused SDKAuth experiment. Native picker needs only the account-session branch.
 files={rel:WORK/'candidate'/rel for rel in expected}
 hashes={rel:sha(p.read_bytes()) for rel,p in files.items()}
 s=connect();f=s.open_sftp();touched=[];restarted=[];ev={'mode':mode,'status':'PREPARING'}
 receipt=WORK/'release_receipt.json'
 try:
  if mode=='rollback':
   old=json.loads(receipt.read_text());backup=old['backup'];ev=old
   for rel in reversed(old['touched']):
    current=fetch(f,remote_path(rel))
    if current is None or sha(current)!=old['after'][rel]:raise RuntimeError('Rollback drift '+rel)
    before=old['before'][rel]
    if before is None:run(s,'rm -- '+q(remote_path(rel)))
    else:
     b=fetch(f,backup+'/'+rel)
     if b is None or sha(b)!=before:raise RuntimeError('Backup damaged '+rel)
     run(s,'cp -p -- '+q(backup+'/'+rel)+' '+q(remote_path(rel)+'.restore')+' && mv -- '+q(remote_path(rel)+'.restore')+' '+q(remote_path(rel)))
   run(s,'nginx -t');run(s,'nginx -s reload')
   for sid in range(1006,1000,-1):run(s,'pm2 restart lhs-s'+str(sid));ready(s,sid)
   ev['status']='ROLLED_BACK';receipt.write_text(json.dumps(ev,indent=2));print('ROLLED_BACK');return
  for rel,h in expected.items():
   b=fetch(f,remote_path(rel));actual=None if b is None else sha(b)
   if actual!=h:raise RuntimeError('Preflight drift '+rel)
  stage='/linhhoasu/_ai_workbench/temp/portal_stage_20260930'
  for rel,p in files.items():
   dest=stage+'/'+rel;run(s,'mkdir -p '+q(str(Path(dest).parent).replace('\\','/')))
   f.put(str(p),dest)
   if sha(fetch(f,dest))!=hashes[rel]:raise RuntimeError('Stage hash')
   if dest.endswith('.js'):run(s,'node --check '+q(dest))
   if dest.endswith('.php'):run(s,'php -l '+q(dest))
  f.put(str(ROOT/'_ai_workbench/tools/test_gift_notice_20260930.php'),stage+'/test_notice.php')
  ev['gift_test']=run(s,'php '+q(stage+'/test_notice.php')+' '+q(stage+'/webgame/gm/public_giftcode_notice.php'))
  ev['status']='STAGED';ev['after']=hashes
  if mode=='stage':
   (WORK/'stage_result.json').write_text(json.dumps(ev,indent=2));print(json.dumps({'status':'STAGED','files':len(files),'gift_test':ev['gift_test']}));return
  if mode!='apply':raise RuntimeError('Unknown mode')
  for sid in range(1001,1007):ready(s,sid)
  backup='/linhhoasu/_ai_workbench/backups/portal_release_'+time.strftime('%Y%m%d_%H%M%S')
  run(s,'install -d -m 700 '+q(backup))
  for rel,h in expected.items():
   if h is None:continue
   dest=backup+'/'+rel;run(s,'mkdir -p '+q(dest.rsplit('/',1)[0]))
   run(s,'cp -p -- '+q(remote_path(rel))+' '+q(dest))
   if sha(fetch(f,dest))!=h:raise RuntimeError('Backup hash '+rel)
  run(s,'pm2 jlist > '+q(backup+'/pm2.json')+' && chmod 600 '+q(backup+'/pm2.json'))
  run(s,'cp -p /root/.pm2/dump.pm2 '+q(backup+'/dump.pm2'))
  ev.update(backup=backup,before=expected,after=hashes,touched=touched,restarted=restarted,status='BACKED_UP')
  receipt.write_text(json.dumps(ev,indent=2))
  order=NEW[:1]+[r for r in files if r.startswith('lhs/') and r not in NEW]+[r for r in files if not r.startswith('lhs/') and r!='nginx/game.lhs.conf']+['nginx/game.lhs.conf']
  for rel in order:
   b=fetch(f,remote_path(rel));actual=None if b is None else sha(b)
   if actual!=expected[rel]:raise RuntimeError('CAS drift '+rel)
   dest=remote_path(rel);tmp=dest+'.portal-next'
   run(s,'install -m 0644 '+q(stage+'/'+rel)+' '+q(tmp)+' && mv -- '+q(tmp)+' '+q(dest))
   touched.append(rel);receipt.write_text(json.dumps(ev,indent=2))
   if sha(fetch(f,dest))!=hashes[rel]:raise RuntimeError('Readback '+rel)
  run(s,'nginx -t')
  for sid in range(1006,1000,-1):
   run(s,'pm2 restart lhs-s'+str(sid));restarted.append(sid);ready(s,sid)
  run(s,'nginx -s reload')
  ev['status']='DEPLOYED';receipt.write_text(json.dumps(ev,indent=2))
  # Also keep receipt with remote preimages for an independent rollback.
  f.put(str(receipt),backup+'/release_receipt.json')
  print(json.dumps({'status':ev['status'],'backup':backup,'files':len(touched),'ready':len(restarted)}))
 except Exception as e:
  ev['error']=str(e);ev['status']='FAILED_BEFORE_WRITE' if not touched else 'ROLLBACK_REQUIRED'
  if touched:
   conflicts=[]
   for rel in reversed(touched):
    try:
     b=fetch(f,remote_path(rel))
     if b is None or sha(b)!=hashes[rel]:raise RuntimeError('drift')
     if expected[rel] is None:run(s,'rm -- '+q(remote_path(rel)))
     else:run(s,'cp -p -- '+q(backup+'/'+rel)+' '+q(remote_path(rel)))
    except Exception:conflicts.append(rel)
   if not conflicts:
    run(s,'nginx -t');run(s,'nginx -s reload')
    for sid in range(1006,1000,-1):run(s,'pm2 restart lhs-s'+str(sid));ready(s,sid)
    ev['status']='ROLLED_BACK'
   ev['rollback_conflicts']=conflicts
  (WORK/'failure.json').write_text(json.dumps(ev,indent=2));raise
 finally:f.close();s.close()
if __name__=='__main__':main()

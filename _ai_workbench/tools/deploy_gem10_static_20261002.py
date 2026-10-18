from pathlib import Path
import datetime as dt,hashlib,json,shlex,paramiko
from rollback_role_lian_manifest_20260930 import ssh_config
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'_ai_workbench/temp/gem10_release_20261002';OUT.mkdir(parents=True,exist_ok=True)
INDEX='/linhhoasu/webgame/game/index.html';FILES={
 '/linhhoasu/webgame/game/js/lhs-gem10-box-v1.js':ROOT/'_ai_workbench/temp/gem10_candidate_20261002/client/lhs-gem10-box-v1.js',
 '/linhhoasu/webgame/game/js/lhs-gem-quick100-v1.js':ROOT/'_ai_workbench/temp/gem10_candidate_20261002/client/lhs-gem-quick100-v1.js',
 INDEX:ROOT/'_ai_workbench/temp/gem10_candidate_20261002/client/index.html'}
EXPECTED_INDEX='dba1ad839bcef277918de2385d91f61e1d4b07f5aeca51e345da1f480dc7b1ff';TOKEN='20261002_gem10_quick100_v1'
def sha(b):return hashlib.sha256(b).hexdigest()
def main():
 data={r:p.read_bytes() for r,p in FILES.items()};after={r:sha(b) for r,b in data.items()}
 assert b'20261002_gem10_selectable_box_v1' in data[INDEX] and b'20261002_gem_quick100_v2' in data[INDEX]
 args,kw=ssh_config();assert args[0]=='103.116.104.165';c=paramiko.SSHClient();c.set_missing_host_key_policy(paramiko.AutoAddPolicy());c.connect(*args,**kw);s=c.open_sftp();stamp=dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).strftime('%Y%m%d_%H%M%S');backup=f'/linhhoasu/_ai_workbench/backups/gem10_static_{stamp}';stages={r:r+'.gem10_'+stamp for r in FILES};report={'at':dt.datetime.now(dt.timezone.utc).isoformat(),'backupDir':backup,'directPlayerWrites':0,'pm2Restart':False,'files':{r:{'before':EXPECTED_INDEX if r==INDEX else None,'after':after[r]} for r in FILES},'result':'STARTED'};swapped=[]
 def run(cmd,timeout=40):
  _,o,e=c.exec_command(cmd,timeout=timeout);raw=o.read();err=e.read();rc=o.channel.recv_exit_status()
  if rc:raise RuntimeError('COMMAND_FAILED:'+str(rc)+':'+err.decode('utf8','replace')[-700:])
  return raw
 def rh(p):
  try:
   with s.open(p,'rb') as f:return sha(f.read())
  except FileNotFoundError:return None
 def served(rel):
  return {k:sha(run('curl --compressed --max-time 20 -fsS '+shlex.quote(h+rel+'?v='+TOKEN),25)) for k,h in [('loopback','http://127.0.0.1:81/'),('public','https://linhhoasu.lol/')]}
 try:
  assert rh(INDEX)==EXPECTED_INDEX,'INDEX_CAS'
  assert rh('/linhhoasu/webgame/game/js/lhs-gem10-box-v1.js') is None and rh('/linhhoasu/webgame/game/js/lhs-gem-quick100-v1.js') is None,'ADDON_EXISTS'
  run('mkdir -m 700 -- '+shlex.quote(backup));run('cp -p -- '+shlex.quote(INDEX)+' '+shlex.quote(backup+'/index.html'));assert rh(backup+'/index.html')==EXPECTED_INDEX
  for r,b in data.items():
   with s.open(stages[r],'wb') as f:f.write(b)
   s.chmod(stages[r],0o644)
   if r.endswith('.js'):run('node --check '+shlex.quote(stages[r]))
   assert rh(stages[r])==after[r]
  for r in FILES:
   if r==INDEX:continue
   s.posix_rename(stages[r],r);swapped.append(r);assert rh(r)==after[r]
   report.setdefault('served',{})[r]=served('/js/'+Path(r).name)
   assert all(v==after[r] for v in report['served'][r].values()),'ADDON_SERVED:'+r
  assert rh(INDEX)==EXPECTED_INDEX;s.posix_rename(stages[INDEX],INDEX);swapped.append(INDEX);assert rh(INDEX)==after[INDEX]
  report['servedIndex']=served('index.html');assert all(v==after[INDEX] for v in report['servedIndex'].values()),'INDEX_SERVED'
  report.update(result='DEPLOYED',completedAt=dt.datetime.now(dt.timezone.utc).isoformat())
 except Exception as e:
  report.update(result='FAILED',error=str(e))
  for r in reversed(swapped):
   try:
    if r==INDEX:stage=INDEX+'.rollback_'+stamp;run('cp -p -- '+shlex.quote(backup+'/index.html')+' '+shlex.quote(stage));s.posix_rename(stage,INDEX)
    else:run('rm -f -- '+shlex.quote(r))
   except Exception:report.setdefault('rollbackErrors',[]).append(r)
  report['rollback']='references_restored' if not report.get('rollbackErrors') else 'needs_attention';raise
 finally:
  (OUT/'release_static').mkdir(exist_ok=True);(OUT/'release_static/deployment.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
  for st in stages.values():
   try:s.remove(st)
   except FileNotFoundError:pass
  s.close();c.close();print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
if __name__=='__main__':main()


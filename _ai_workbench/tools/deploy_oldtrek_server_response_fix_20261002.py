from __future__ import annotations
import ast, datetime as dt, hashlib, json, shlex, time
from pathlib import Path
import paramiko
from rollback_role_lian_manifest_20260930 import ssh_config

ROOT=Path(__file__).resolve().parents[2]
REMOTE='/linhhoasu/lhs/newServer/src/handlers/old-trek.js'
LOCAL=ROOT/'linhhoasu/lhs/newServer/src/handlers/old-trek.js'
EXPECTED='439a08bca63d1567bdd90e782392ba1b0a2bc1a040f3d9759bc83d9ca24f26b5'
OUT=ROOT/'_ai_workbench/temp/oldtrek_server_fix_20261002'
NODES={'lhs-s1001':8080,'lhs-s1002':8083,'lhs-s1003':8084,'lhs-s1004':8085,'lhs-s1005':8086,'lhs-s1006':8087,'lhs-s1007':8088,'lhs-s1008':8089}
def sha(b):return hashlib.sha256(b).hexdigest()
def main():
 data=LOCAL.read_bytes();assert b'reconcileOldTrekPendingEvent' in data;after=sha(data)
 args,kw=ssh_config();assert args[0]=='103.116.104.165';c=paramiko.SSHClient();c.set_missing_host_key_policy(paramiko.AutoAddPolicy());c.connect(*args,**kw);s=c.open_sftp()
 stamp=dt.datetime.now().strftime('%Y%m%d_%H%M%S');backup=f'/linhhoasu/_ai_workbench/backups/oldtrek_server_fix_{stamp}';stage=REMOTE+'.oldtrek_fix_'+stamp+'.js';report={'at':dt.datetime.now(dt.timezone.utc).isoformat(),'backupDir':backup,'productionPlayerWrites':0,'restarts':[],'before':EXPECTED,'after':after}
 def run(cmd,timeout=55):
  _,o,e=c.exec_command(cmd,timeout=timeout);out=o.read().decode('utf8','replace');err=e.read().decode('utf8','replace');rc=o.channel.recv_exit_status()
  if rc:raise RuntimeError(f'REMOTE({rc}):{err[-800:]}')
  return out.strip()
 def rh(p):return sha(s.open(p,'rb').read())
 def ready(n):
  deadline=time.monotonic()+45
  while True:
   try:
    x=json.loads(run(f'curl --max-time 5 -fsS http://127.0.0.1:{NODES[n]}/ready',8))
    if x.get('status')=='ok' and x.get('checks',{}).get('mongo') is True and x.get('checks',{}).get('redis') is True:return x
   except Exception:pass
   if time.monotonic()>deadline:raise RuntimeError('READY:'+n)
   time.sleep(1)
 try:
  if rh(REMOTE)!=EXPECTED:raise RuntimeError('CAS:'+rh(REMOTE))
  run('mkdir -m 700 -- '+shlex.quote(backup));run('cp -p -- '+shlex.quote(REMOTE)+' '+shlex.quote(backup+'/old-trek.js'))
  assert rh(backup+'/old-trek.js')==EXPECTED
  run('node --check '+shlex.quote(REMOTE))
  s.put(str(LOCAL),stage);run('chmod 644 -- '+shlex.quote(stage));run('node --check '+shlex.quote(stage));assert rh(stage)==after
  if rh(REMOTE)!=EXPECTED:raise RuntimeError('CAS_BEFORE_SWAP')
  run('mv -f -- '+shlex.quote(stage)+' '+shlex.quote(REMOTE));assert rh(REMOTE)==after
  before=json.loads(run('pm2 jlist'))
  old={p['name']:{'pid':p['pid'],'restarts':p['pm2_env']['restart_time']} for p in before}
  for n in NODES:
   run('pm2 restart '+shlex.quote(n)+' --update-env');r=ready(n);p=next(x for x in json.loads(run('pm2 jlist')) if x['name']==n);assert p['pm2_env']['status']=='online';report['restarts'].append({'name':n,'pid':p['pid'],'ready':r});
  post={p['name']:{'pid':p['pid'],'restarts':p['pm2_env']['restart_time'],'status':p['pm2_env']['status']} for p in json.loads(run('pm2 jlist'))}
  report['postProcesses']=post;report['postReady']={n:ready(n) for n in NODES};report['result']='DEPLOYED';report['completedAt']=dt.datetime.now(dt.timezone.utc).isoformat()
  OUT.mkdir(parents=True,exist_ok=True);(OUT/'deployment.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(report,ensure_ascii=False,indent=2))
 except Exception as exc:
  report['result']='FAILED';report['error']=str(exc)
  try:
   if rh(REMOTE)==after:
    st=REMOTE+'.rollback_'+stamp+'.js';run('cp -p -- '+shlex.quote(backup+'/old-trek.js')+' '+shlex.quote(st));run('mv -f -- '+shlex.quote(st)+' '+shlex.quote(REMOTE))
    for row in report['restarts']:run('pm2 restart '+shlex.quote(row['name'])+' --update-env',55);ready(row['name'])
    report['rollback']='restored'
  except Exception as rb:report['rollbackError']=str(rb)
  OUT.mkdir(parents=True,exist_ok=True);(OUT/'deployment.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8');raise
 finally:
  try:s.remove(stage)
  except FileNotFoundError:pass
  s.close();c.close()
if __name__=='__main__':main()

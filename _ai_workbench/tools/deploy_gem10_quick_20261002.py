"""Deploy selectable level-10 bag, bounded Gem quick-compose, and 1200 slots.

CAS + backup + syntax/readiness/read-back. No player/DB writes and no gameplay RPC.
"""
from pathlib import Path
import datetime as dt, hashlib, json, shlex, time
import paramiko
from rollback_role_lian_manifest_20260930 import ssh_config

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'_ai_workbench/temp/gem10_release_20261002';OUT.mkdir(parents=True,exist_ok=True)
SOURCES={
 '/linhhoasu/lhs/newServer/src/services/ConfigService.js':('_ai_workbench/temp/gem10_candidate_20261002/server/services/ConfigService.js','56f1e447f0ce889fc3cc7cc82055ea2731b9712c4323156b2665c49f46786da6'),
}
# Preimages are refreshed below from this task's immutable snapshot; strings are
# deliberately checked against the known live hashes before any swap.
SERVER_FILES={
 '/linhhoasu/lhs/newServer/src/services/ConfigService.js': (ROOT/'_ai_workbench/temp/gem10_candidate_20261002/server/services/ConfigService.js','56f1e447f0ce889fc3cc7cc82055ea2731b9712c4323156b2665c49f46786da6'),
 '/linhhoasu/lhs/newServer/src/handlers/gem.js': (ROOT/'_ai_workbench/temp/gem10_candidate_20261002/server/handlers/gem.js','8af822c924bbc6ee5e4f1b244bb3a37951caa66018ef9aa096b141f4657a3709'),
 '/linhhoasu/lhs/newServer/src/config/gemLevel10Choice.js': (ROOT/'_ai_workbench/temp/gem10_candidate_20261002/server/config/gemLevel10Choice.js',None),
}
DEPENDENCIES={
 '/linhhoasu/lhs/newServer/src/handlers/item.js':'a642e187d9f1f6df2abda77ee101cba4056bec6d182b99d4276e254ea6d48538',
 '/linhhoasu/lhs/newServer/src/services/RandomUsableItemRewardService.js':'d59beb95a05936899f679b32cd3ed34825eea9788140e3423b7540d588b8cd0e',
 '/linhhoasu/lhs/newServer/src/services/RewardGrantService.js':'a32d111f90c4206b9f414295e934c7b292e911766e388bd63e9c9fc811e32898',
 '/linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin':'eaa97e8fc3e38a75f75e9ba12dbbc8221e2083c8d8463e8d81219166cfb23a54',
}
STATIC_FILES={
 '/linhhoasu/webgame/game/js/lhs-gem10-box-v1.js':(ROOT/'_ai_workbench/temp/gem10_candidate_20261002/client/lhs-gem10-box-v1.js',None),
 '/linhhoasu/webgame/game/js/lhs-gem-quick100-v1.js':(ROOT/'_ai_workbench/temp/gem10_candidate_20261002/client/lhs-gem-quick100-v1.js',None),
 '/linhhoasu/webgame/game/index.html':(ROOT/'_ai_workbench/temp/gem10_candidate_20261002/client/index.html','dba1ad839d593ca120eeaf86856d0bc85b0b9ed71d5847e65be7139c966e0e9a'),
}
# Correct current static preimage from the verified item-box release.
STATIC_FILES['/linhhoasu/webgame/game/index.html']=(STATIC_FILES['/linhhoasu/webgame/game/index.html'][0],'dba1ad839bcef277918de2385d91f61e1d4b07f5aeca51e345da1f480dc7b1ff')
NODES={'lhs-s1001':8080,'lhs-s1002':8083,'lhs-s1003':8084,'lhs-s1004':8085,'lhs-s1005':8086,'lhs-s1006':8087}
def sha(b):return hashlib.sha256(b).hexdigest()
def main():
 args,kw=ssh_config();assert args[0]=='103.116.104.165'
 c=paramiko.SSHClient();c.set_missing_host_key_policy(paramiko.AutoAddPolicy());c.connect(*args,**kw);s=c.open_sftp();stamp=dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).strftime('%Y%m%d_%H%M%S');backup=f'/linhhoasu/_ai_workbench/backups/gem10_quick_{stamp}';report={'at':dt.datetime.now(dt.timezone.utc).isoformat(),'backupDir':backup,'directPlayerWrites':0,'files':{},'restarts':[],'result':'STARTED'};stages={}
 def run(cmd,timeout=50):
  _,o,e=c.exec_command(cmd,timeout=timeout);raw=o.read();err=e.read();rc=o.channel.recv_exit_status()
  if rc:raise RuntimeError('COMMAND_FAILED:'+str(rc)+':'+err.decode('utf8','replace')[-900:])
  return raw
 def rh(p):
  try:
   with s.open(p,'rb') as f:return sha(f.read())
  except FileNotFoundError:return None
 def ready(n,wait=True):
  end=time.monotonic()+(55 if wait else 0)
  while True:
   try:
    v=json.loads(run(f'curl --max-time 5 -fsS http://127.0.0.1:{NODES[n]}/ready',8));
    if v.get('status')=='ok' and v.get('checks',{}).get('mongo') is True and v.get('checks',{}).get('redis') is True:return v
   except Exception:pass
   if time.monotonic()>=end:raise RuntimeError('READY:'+n)
   time.sleep(1)
 def proc():return {p['name']:{'pid':p['pid'],'restarts':p['pm2_env']['restart_time'],'status':p['pm2_env']['status'],'watch':p['pm2_env'].get('watch',False)} for p in json.loads(run('pm2 jlist'))}
 def checkpoint():OUT.mkdir(parents=True,exist_ok=True);(OUT/'deployment.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 try:
  # Fail closed if the known hash literal drifts; use direct live reads for the
  # candidate ConfigService preimage because its exact SHA is recorded here.
  known_config='56f1e447f0ce889fc3cc7cc82055ea2731b9712c4323156b2665c49f46786da6'
  pre={remote:rh(remote) for remote in {**{k:v[1] for k,v in SERVER_FILES.items() if v[1]},**DEPENDENCIES,**{k:v[1] for k,v in STATIC_FILES.items() if v[1]}}}
  if pre['/linhhoasu/lhs/newServer/src/services/ConfigService.js']!=known_config:raise RuntimeError('CONFIG_CAS:'+str(pre['/linhhoasu/lhs/newServer/src/services/ConfigService.js']))
  report['preProcesses']=proc();assert all(report['preProcesses'][n]['status']=='online' and not report['preProcesses'][n]['watch'] for n in NODES)
  report['preReady']={n:ready(n,False) for n in NODES}
  for remote,expected in DEPENDENCIES.items():
   if rh(remote)!=expected:raise RuntimeError('DEPENDENCY_DRIFT:'+remote)
  run('mkdir -m 700 -- '+shlex.quote(backup))
  allfiles={**SERVER_FILES,**STATIC_FILES}
  for remote,(local,expected) in allfiles.items():
   current=rh(remote)
   if expected is not None and current!=expected:raise RuntimeError('CAS:'+remote+':'+str(current))
   name=Path(remote).name;run('cp -p -- '+shlex.quote(remote)+' '+shlex.quote(backup+'/'+name)) if current else None
   if current and rh(backup+'/'+name)!=current:raise RuntimeError('BACKUP:'+remote)
   data=local.read_bytes();after=sha(data);stage=remote+'.gem10_'+stamp+('.js' if remote.endswith('.js') else '.html');stages[remote]=stage
   with s.open(stage,'wb') as f:f.write(data)
   st=s.stat(remote) if current else None
   s.chmod(stage,0o644)
   if st:s.chown(stage,st.st_uid,st.st_gid)
   if remote.endswith('.js'):run('node --check '+shlex.quote(stage))
   if rh(stage)!=after:raise RuntimeError('STAGE:'+remote)
   report['files'][remote]={'before':current,'after':after}
  checkpoint()
  for remote in SERVER_FILES:
   if rh(remote)!=report['files'][remote]['before']:raise RuntimeError('CAS_BEFORE:'+remote)
  for remote in SERVER_FILES:s.posix_rename(stages[remote],remote);assert rh(remote)==report['files'][remote]['after']
  report['serverSwapped']=list(SERVER_FILES);checkpoint()
  for n in NODES:
   run('pm2 restart '+shlex.quote(n)+' --update-env');report['restarts'].append({'name':n,'ready':ready(n)});checkpoint();print(n+' ready',flush=True)
  report['postReady']={n:ready(n,False) for n in NODES};report['postProcesses']=proc()
  for n,b in report['preProcesses'].items():
   a=report['postProcesses'][n]
   if n in NODES:assert a['status']=='online' and a['pid']!=b['pid'] and a['restarts']==b['restarts']+1
   else:assert a==b
  # Addon files before index; then index CAS swap.
  for remote in STATIC_FILES:
   if remote.endswith('index.html'):continue
   if rh(remote) is not None:raise RuntimeError('STATIC_EXISTS:'+remote)
   s.posix_rename(stages[remote],remote);assert rh(remote)==report['files'][remote]['after']
  index='/linhhoasu/webgame/game/index.html';assert rh(index)==report['files'][index]['before'];s.posix_rename(stages[index],index);assert rh(index)==report['files'][index]['after']
  report['staticSwapped']=list(STATIC_FILES);report['postFiles']={r:rh(r) for r in allfiles};report['result']='DEPLOYED';report['completedAt']=dt.datetime.now(dt.timezone.utc).isoformat();checkpoint()
  print(json.dumps({'result':report['result'],'backupDir':backup,'ready':list(NODES),'receipt':str(OUT/'deployment.json')},indent=2),flush=True)
 except Exception as exc:
  report.update(result='FAILED',error=str(exc));checkpoint();raise
 finally:
  for st in stages.values():
   try:s.remove(st)
   except FileNotFoundError:pass
  s.close();c.close()
if __name__=='__main__':main()


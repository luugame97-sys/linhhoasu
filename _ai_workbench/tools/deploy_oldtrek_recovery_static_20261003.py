from __future__ import annotations
import datetime as dt, hashlib, json, re, shlex
from pathlib import Path
import paramiko
from rollback_role_lian_manifest_20260930 import ssh_config

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'_ai_workbench/temp/oldtrek_recovery_20261002'
FILES={
 '/linhhoasu/webgame/game/js/lhs-oldtrek-errors-v1.js':(ROOT/'_ai_workbench/temp/oldtrek_recovery_20261002/candidate/client/lhs-oldtrek-errors-v1.js','f76f6fd1a039f75eb11a2237f8f977fad6552ff35ba70d7d4e99db1f6e652d71'),
 '/linhhoasu/webgame/game/index.html':(ROOT/'_ai_workbench/temp/oldtrek_recovery_20261002/candidate/client/index.html','9aad7c56856a95b8d096bce229f2cdc3eaabbc3fadab4532ff09504421c36d82'),
}
TOKEN='20261002_oldtrek_guard_v5'
def sha(b):return hashlib.sha256(b).hexdigest()
def q(x):return shlex.quote(x)
def main():
 data={r:p.read_bytes() for r,(p,_) in FILES.items()};after={r:sha(b) for r,b in data.items()}
 assert b'20261002_v5' in data[next(r for r in FILES if r.endswith('.js'))]
 assert b'20261002_oldtrek_guard_v5' in data[next(r for r in FILES if r.endswith('index.html'))]
 a,k=ssh_config();assert a[0]=='103.116.104.165';c=paramiko.SSHClient();c.set_missing_host_key_policy(paramiko.AutoAddPolicy());c.connect(*a,**k);s=c.open_sftp();stamp=dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).strftime('%Y%m%d_%H%M%S');backup=f'/linhhoasu/_ai_workbench/backups/oldtrek_recovery_static_{stamp}';stages={r:r+f'.recovery_{stamp}{".js" if r.endswith(".js") else ".html"}' for r in FILES};receipt={'at':dt.datetime.now(dt.timezone.utc).isoformat(),'backupDir':backup,'directPlayerWrites':0,'pm2Restart':False,'files':{},'result':'STARTED'};swapped=[]
 def run(cmd,t=40):
  _,o,e=c.exec_command(cmd,timeout=t);b=o.read();err=e.read();rc=o.channel.recv_exit_status()
  if rc:raise RuntimeError(f'COMMAND_FAILED:{rc}:{err.decode("utf8","replace")[-700:]}')
  return b
 def rh(p):
  with s.open(p,'rb') as f:return sha(f.read())
 def served(base,rel):return sha(run('curl --compressed --connect-timeout 5 --max-time 25 -fsS '+q(base+rel+'?v='+TOKEN),30))
 try:
  for r,(_,pre) in FILES.items():
   cur=rh(r)
   if cur!=pre:raise RuntimeError(f'CAS:{r}:{cur}:{pre}')
  run('mkdir -m 700 -- '+q(backup))
  for r in FILES:
   bpath=backup+'/'+Path(r).name;run('cp -p -- '+q(r)+' '+q(bpath));
   if rh(bpath)!=FILES[r][1]:raise RuntimeError('BACKUP:'+r)
  for r,b in data.items():
   with s.open(stages[r],'wb') as f:f.write(b)
   s.chmod(stages[r],0o644)
   if r.endswith('.js'):run('node --check '+q(stages[r]))
   if rh(stages[r])!=after[r]:raise RuntimeError('STAGE:'+r)
   receipt['files'][r]={'before':FILES[r][1],'after':after[r]}
  for r in FILES:
   if rh(r)!=receipt['files'][r]['before']:raise RuntimeError('CAS_BEFORE:'+r)
  guard=next(r for r in FILES if r.endswith('.js'));s.posix_rename(stages[guard],guard);swapped.append(guard);assert rh(guard)==after[guard]
  index=next(r for r in FILES if r.endswith('index.html'));s.posix_rename(stages[index],index);swapped.append(index);assert rh(index)==after[index]
  receipt['served']={'loopback':{},'public':{}}
  for name,base in [('loopback','http://127.0.0.1:81'),('public','https://linhhoasu.lol')]:
   receipt['served'][name]['guard']=served(base,'/js/lhs-oldtrek-errors-v1.js');idx=run('curl --compressed --connect-timeout 5 --max-time 25 -fsS '+q(base+'/index.html?v='+TOKEN),30);idx=re.sub(rb'<script type="module" src="https://static\.cloudflareinsights\.com/beacon\.min\.js/.*?</script>\r?\n',b'',idx,count=1,flags=re.S);receipt['served'][name]['index']=sha(idx)
  for n in ('loopback','public'):
   if receipt['served'][n]['guard']!=after[guard] or receipt['served'][n]['index']!=after[index]:raise RuntimeError('SERVED:'+n)
  receipt['postFiles']={r:rh(r) for r in FILES};receipt['result']='DEPLOYED_VERIFIED';receipt['completedAt']=dt.datetime.now(dt.timezone.utc).isoformat()
 except Exception as ex:
  receipt['result']='FAILED';receipt['error']=str(ex);raise
 finally:
  OUT.mkdir(parents=True,exist_ok=True);(OUT/'static_deployment.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
  for st in stages.values():
   try:s.remove(st)
   except FileNotFoundError:pass
  s.close();c.close();print(json.dumps(receipt,ensure_ascii=False,indent=2))
if __name__=='__main__':main()

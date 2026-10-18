"""Deploy H5 idle-guide and PowerSaving gates on top of served guard7."""
from __future__ import annotations
import getpass,hashlib,os,posixpath,time
from datetime import datetime
import paramiko
HOST='103.116.105.154';LOCAL_ROOT=r'I:\Linhhoasu\server\server';REMOTE_ROOT='/linhhoasu';STAMP=datetime.now().strftime('%Y%m%d_%H%M%S');BACKUP=f'{REMOTE_ROOT}/_ai_workbench/backups/web_no_idle_guide_guard8_pre_{STAMP}';TOKEN='20260831_web_no_idle_guide_guard8'
FILES={'webgame/game/js/main.min_a6195824.js':'81984ba55fb292e7ca9031704f824b09f0c2aa879b9bd48ee2007f91bb6083dc','webgame/game/index.html':'83c670240dc1612712f92f386dc921fdd72f8eadcf294c6f4293441af6904257'}
def local_path(r):return os.path.join(LOCAL_ROOT,'linhhoasu',*r.split('/'))
def digest(d):return hashlib.sha256(d).hexdigest()
def run(s,c,timeout=120):
 _i,o,e=s.exec_command(c,timeout=timeout);out=o.read().decode('utf-8','replace');err=e.read().decode('utf-8','replace');code=o.channel.recv_exit_status()
 if code:raise RuntimeError(err[-5000:] or out[-5000:])
 return out
def connect(p):
 s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());last=None
 for i in range(3):
  try:s.connect(HOST,username='root',password=p,look_for_keys=False,allow_agent=False,timeout=30,banner_timeout=30,auth_timeout=30);return s
  except Exception as e:
   last=e
   if i<2:time.sleep(3)
 raise last
def main():
 s=connect(getpass.getpass('VPS password (not logged): '));stages=[];installed=False
 try:
  f=s.open_sftp()
  try:
   originals={}
   for r,exp in FILES.items():
    remote=f'{REMOTE_ROOT}/{r}'
    with f.open(remote,'rb') as stream:data=stream.read()
    actual=digest(data)
    if actual!=exp:raise RuntimeError(f'precondition failed {r}: remote={actual} expected={exp}')
    originals[r]=data
   run(s,f'mkdir -p -- {BACKUP}')
   for r,data in originals.items():
    with f.open(posixpath.join(BACKUP,r.replace('/','__')),'wb') as stream:stream.write(data)
   for r in FILES:
    remote=f'{REMOTE_ROOT}/{r}';suffix='.js' if r.endswith('.js') else '.html';stage=f'{remote}.deploy-{STAMP}{suffix}';f.put(local_path(r),stage);stages.append((r,remote,stage))
  finally:f.close()
  main_stage=next(x for r,_m,x in stages if r.endswith('.js'));index_stage=next(x for r,_m,x in stages if r.endswith('.html'))
  run(s,f'node --check {main_stage}');run(s,f"grep -q 'RuntimeUtil.isRuntime&&P.ins().open(Zz)' {main_stage}");run(s,f"grep -q 'AppInfo.ckState&&RuntimeUtil.isRuntime&&!this.isDuringGuide()' {main_stage}");run(s,f"grep -q '{TOKEN}' {index_stage}")
  for _r,remote,stage in stages:run(s,f'mv -- {stage} {remote};chmod 644 {remote}')
  installed=True
  served=run(s,f"curl -fsS 'http://127.0.0.1:81/index.html?v={TOKEN}'")
  if TOKEN not in served:raise RuntimeError('served index token mismatch')
  expected=digest(open(local_path('webgame/game/js/main.min_a6195824.js'),'rb').read());served_hash=run(s,f"curl -fsS 'http://127.0.0.1:81/js/main.min_a6195824.js?v={TOKEN}' | sha256sum | awk '{{print $1}}'").strip()
  if served_hash!=expected:raise RuntimeError(f'served main mismatch {served_hash} != {expected}')
  print('BACKUP='+BACKUP);print('SERVED_TOKEN='+TOKEN);print('SERVED_MAIN_SHA256='+served_hash);print('PM2_RESTART=none');print('REMOTE_HASHES_BEGIN');print(run(s,'sha256sum '+' '.join(f'{REMOTE_ROOT}/{r}' for r in FILES)).strip());print('REMOTE_HASHES_END')
 except Exception:
  if installed:
   for r in FILES:run(s,f"cp -p -- {BACKUP}/{r.replace('/', '__')} {REMOTE_ROOT}/{r}")
   print('ROLLBACK=restored static files')
  raise
 finally:
  for _r,_m,stage in stages:
   try:run(s,f'rm -f -- {stage}')
   except Exception:pass
  s.close()
if __name__=='__main__':main()

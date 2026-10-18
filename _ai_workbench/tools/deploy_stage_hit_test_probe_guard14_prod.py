from __future__ import annotations
import getpass, hashlib, os, posixpath, time
from datetime import datetime
import paramiko
HOST='103.116.105.154'; LOCAL_ROOT=r'I:\Linhhoasu\server\server'; REMOTE_ROOT='/linhhoasu'; STAMP=datetime.now().strftime('%Y%m%d_%H%M%S'); BACKUP=f'{REMOTE_ROOT}/_ai_workbench/backups/stage_hit_test_probe_guard14_pre_{STAMP}'; TOKEN='20260831_stage_hit_test_probe_guard14'
FILES={'webgame/game/js/main.min_a6195824.js':'b50886f4afa8d3e9250b4d191f0b35bec84a3798d862dc7892b753dd437eebe1','webgame/game/index.html':'e5dab738ea7afe5272adbfad728b78197d45fec2cd32a556fefa2c7aa1bbb25b'}
PREV={'webgame/game/js/main.min_a6195824.js':'9621422034ebc176f5f2f90316be4f0e18e8ccebc6f238ef9b6d204a3d8d78cd','webgame/game/index.html':'83104f2bd17681af86a4866fab84478dcdffddaccc731e803972ed795fe4c33d'}
def lp(r): return os.path.join(LOCAL_ROOT,'linhhoasu',*r.split('/'))
def dg(d): return hashlib.sha256(d).hexdigest()
def run(s,c,timeout=120):
 _,o,e=s.exec_command(c,timeout=timeout); out=o.read().decode('utf-8','replace'); err=e.read().decode('utf-8','replace'); code=o.channel.recv_exit_status()
 if code: raise RuntimeError(err[-5000:] or out[-5000:])
 return out
def conn(p):
 s=paramiko.SSHClient(); s.set_missing_host_key_policy(paramiko.AutoAddPolicy()); last=None
 for i in range(3):
  try: s.connect(HOST,username='root',password=p,look_for_keys=False,allow_agent=False,timeout=30,banner_timeout=30,auth_timeout=30); return s
  except Exception as e: last=e; time.sleep(3) if i<2 else None
 raise last
def main():
 s=conn(getpass.getpass('VPS password (not logged): ')); staged=[]; installed=False
 try:
  f=s.open_sftp(); old={}
  try:
   for r,exp in PREV.items():
    remote=f'{REMOTE_ROOT}/{r}'
    with f.open(remote,'rb') as q: data=q.read()
    actual=dg(data)
    if actual!=exp: raise RuntimeError(f'precondition failed {r}: remote={actual} expected={exp}')
    old[r]=data
   run(s,f'mkdir -p -- {BACKUP}')
   for r,data in old.items():
    with f.open(posixpath.join(BACKUP,r.replace('/','__')),'wb') as q:q.write(data)
   for r in FILES:
    remote=f'{REMOTE_ROOT}/{r}'; suf='.js' if r.endswith('.js') else '.html'; stage=f'{remote}.deploy-{STAMP}{suf}'; f.put(lp(r),stage); staged.append((r,remote,stage))
  finally:f.close()
  main=next(x for r,_m,x in staged if r.endswith('.js')); idx=next(x for r,_m,x in staged if r.endswith('.html'))
  run(s,f'node --check {main}'); run(s,f"grep -q '\\[LHS\\]\\[HitProbe\\]' {main}"); run(s,f"grep -q 'TOUCH_BEGIN,this.onTouchBegin,this,!0' {main}"); run(s,f"grep -q '{TOKEN}' {idx}")
  for _r,remote,x in staged:run(s,f'mv -- {x} {remote}; chmod 644 {remote}')
  installed=True
  served=run(s,f"curl -fsS 'http://127.0.0.1:81/index.html?v={TOKEN}'")
  if TOKEN not in served:raise RuntimeError('served token mismatch')
  sh=run(s,f"curl -fsS 'http://127.0.0.1:81/js/main.min_a6195824.js?v={TOKEN}' | sha256sum | awk '{{print $1}}'").strip()
  if sh!=FILES['webgame/game/js/main.min_a6195824.js']:raise RuntimeError(f'served hash mismatch {sh}')
  print('BACKUP='+BACKUP); print('SERVED_TOKEN='+TOKEN); print('SERVED_MAIN_SHA256='+sh); print('PM2_RESTART=none'); print('REMOTE_HASHES_BEGIN'); print(run(s,'sha256sum '+' '.join(f'{REMOTE_ROOT}/{r}' for r in FILES)).strip()); print('REMOTE_HASHES_END')
 except Exception:
  if installed:
   for r in FILES:run(s,f"cp -p -- {BACKUP}/{r.replace('/', '__')} {REMOTE_ROOT}/{r}")
   print('ROLLBACK=restored')
  raise
 finally:
  for _r,_m,x in staged:
   try:run(s,f'rm -f -- {x}')
   except Exception:pass
  s.close()
if __name__=='__main__':main()

from __future__ import annotations
import getpass, hashlib, os, posixpath, time
from datetime import datetime
import paramiko
HOST='103.116.105.154'; LOCAL_ROOT=r'I:\Linhhoasu\server\server'; REMOTE_ROOT='/linhhoasu'; STAMP=datetime.now().strftime('%Y%m%d_%H%M%S'); BACKUP=f'{REMOTE_ROOT}/_ai_workbench/backups/touch_recovery_clean_guard18_pre_{STAMP}'; TOKEN='20260831_touch_recovery_clean_guard18'
FILES={'webgame/game/js/main.min_a6195824.js':'cd81e8dba1e11672052c3990efa2f18b71d7afed0a546c3bbe2c288321993998','webgame/game/index.html':'fcf45bfc543cd7802935905445ff2a54dd538be679ca66542681253647dd06f2'}
PREV={'webgame/game/js/main.min_a6195824.js':'9932e380d96a9ae1d24f26b83d28dab34b812349ed41e426c50a02834eeedf2f','webgame/game/index.html':'b8be1a8f720458d223310ac9627e5548500f3bb1b969c07fdee44c61c11cff2b'}
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
  run(s,f'node --check {main}'); run(s,f"grep -q '\\[LHS\\]\\[TouchRecovery\\]' {main}"); run(s,f"grep -q 'TOUCH_BEGIN,this.onTouchBegin,this,!0' {main}"); run(s,f"grep -q '{TOKEN}' {idx}")
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

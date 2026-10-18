from __future__ import annotations
import getpass,hashlib,os,posixpath,time
from datetime import datetime
import paramiko
HOST='103.116.105.154';LR=r'I:\Linhhoasu\server\server';RR='/linhhoasu';STAMP=datetime.now().strftime('%Y%m%d_%H%M%S');BACKUP=f'{RR}/_ai_workbench/backups/web_no_guide_mask_guard9_pre_{STAMP}';TOKEN='20260831_web_no_guide_mask_guard9'
FILES={'webgame/game/js/main.min_a6195824.js':'2b139e811269a7d6353227f57f46fec39ddb988809345791f617cd966d27f38e','webgame/game/index.html':'54e45449dced1b3bdc58d2e15e2187514476b97b25a52f59c6b76d8bd8720dda'}
def lp(r):return os.path.join(LR,'linhhoasu',*r.split('/'))
def dg(d):return hashlib.sha256(d).hexdigest()
def run(s,c,timeout=120):
 _i,o,e=s.exec_command(c,timeout=timeout);out=o.read().decode('utf-8','replace');err=e.read().decode('utf-8','replace');code=o.channel.recv_exit_status()
 if code:raise RuntimeError(err[-5000:] or out[-5000:])
 return out
def conn(p):
 s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());last=None
 for i in range(3):
  try:s.connect(HOST,username='root',password=p,look_for_keys=False,allow_agent=False,timeout=30,banner_timeout=30,auth_timeout=30);return s
  except Exception as e:
   last=e
   if i<2:time.sleep(3)
 raise last
def main():
 s=conn(getpass.getpass('VPS password (not logged): '));st=[];installed=False
 try:
  f=s.open_sftp()
  try:
   old={}
   for r,exp in FILES.items():
    remote=f'{RR}/{r}'
    with f.open(remote,'rb') as q:data=q.read()
    actual=dg(data)
    if actual!=exp:raise RuntimeError(f'precondition failed {r}: remote={actual} expected={exp}')
    old[r]=data
   run(s,f'mkdir -p -- {BACKUP}')
   for r,data in old.items():
    with f.open(posixpath.join(BACKUP,r.replace('/','__')),'wb') as q:q.write(data)
   for r in FILES:
    remote=f'{RR}/{r}';suffix='.js' if r.endswith('.js') else '.html';stage=f'{remote}.deploy-{STAMP}{suffix}';f.put(lp(r),stage);st.append((r,remote,stage))
  finally:f.close()
  main=next(x for r,_m,x in st if r.endswith('.js'));idx=next(x for r,_m,x in st if r.endswith('.html'))
  run(s,f'node --check {main}');run(s,f"grep -q 'sOt.Start=function(t){{if(!RuntimeUtil.isRuntime)return' {main}");run(s,f"grep -q '{TOKEN}' {idx}")
  for _r,remote,stage in st:run(s,f'mv -- {stage} {remote};chmod 644 {remote}')
  installed=True
  served=run(s,f"curl -fsS 'http://127.0.0.1:81/index.html?v={TOKEN}'")
  if TOKEN not in served:raise RuntimeError('served token mismatch')
  expected=dg(open(lp('webgame/game/js/main.min_a6195824.js'),'rb').read());sh=run(s,f"curl -fsS 'http://127.0.0.1:81/js/main.min_a6195824.js?v={TOKEN}' | sha256sum | awk '{{print $1}}'").strip()
  if sh!=expected:raise RuntimeError(f'served hash mismatch {sh} != {expected}')
  print('BACKUP='+BACKUP);print('SERVED_TOKEN='+TOKEN);print('SERVED_MAIN_SHA256='+sh);print('PM2_RESTART=none');print('REMOTE_HASHES_BEGIN');print(run(s,'sha256sum '+' '.join(f'{RR}/{r}' for r in FILES)).strip());print('REMOTE_HASHES_END')
 except Exception:
  if installed:
   for r in FILES:run(s,f"cp -p -- {BACKUP}/{r.replace('/', '__')} {RR}/{r}")
   print('ROLLBACK=restored')
  raise
 finally:
  for _r,_m,x in st:
   try:run(s,f'rm -f -- {x}')
   except Exception:pass
  s.close()
if __name__=='__main__':main()

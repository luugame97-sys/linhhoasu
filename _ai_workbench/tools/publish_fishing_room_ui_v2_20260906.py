"""Client-only placement correction; main room semantics unchanged, no restart."""
import json,re,sys
import paramiko
from release_fishing_rooms_20260906 import WB,ROOT,GAME,run,hashes,pm2,ready,digest,write
def main():
 sys.stdout.reconfigure(encoding='utf-8');d=json.loads((ROOT/'deploy.json').read_text(encoding='utf-8'));expected=d['expected']
 c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
 try:
  assert hashes(s,list(expected))==expected;before=pm2(s);assert before==d['afterPm2']
  backup=d['backup']+'/ui-v2';run(s,f'install -d -m 700 {backup}')
  targets=[(ROOT/'main.fixed.js',GAME+'/js/main.min_a6195824.js'),(ROOT/'index.fixed.html',GAME+'/index.html')]
  f=s.open_sftp()
  try:
   for i,(p,remote)in enumerate(targets):run(s,f'cp -a {remote} {backup}/{i}.before');f.put(str(p),backup+f'/{i}.next')
  finally:f.close()
  installed=[]
  try:
   for i,(p,remote)in enumerate(targets):
    assert hashes(s,[backup+f'/{i}.before'])[backup+f'/{i}.before']==expected[remote];assert hashes(s,[backup+f'/{i}.next'])[backup+f'/{i}.next']==digest(p)
    installed.append((i,remote));run(s,f'install -m 644 {backup}/{i}.next {remote}.rooms-next; mv -f {remote}.rooms-next {remote}')
   for p,remote in targets:expected[remote]=digest(p)
   assert hashes(s,list(expected))==expected;assert pm2(s)==before
   write('ui-update.json',{'result':'DEPLOYED','backup':backup,'expected':expected,'mainHash':digest(ROOT/'main.fixed.js'),'indexHash':digest(ROOT/'index.fixed.html'),'noRestarts':True,'ready':ready(s)})
   print(json.dumps({'result':'DEPLOYED','clientOnly':True,'noRestarts':True}))
  except Exception:
   for i,remote in reversed(installed):run(s,f'install -m 644 {backup}/{i}.before {remote}')
   raise
 finally:s.close()
if __name__=='__main__':main()

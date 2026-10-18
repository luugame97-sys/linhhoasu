import sys,json,hashlib,shlex
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8');sys.dont_write_bytecode=True
from snapshot_web_multiserver_20260906 import connect,run
ROOT=Path(__file__).resolve().parents[1]/'temp/domain_linhhoasu_lol_20260929'
BACK='/linhhoasu/_ai_workbench/backups/domain_unify_20260929_0127'
FILES={'panel':'/www/server/panel/vhost/nginx/127.0.0.2.conf','game':'/www/server/panel/vhost/nginx/game.lhs.conf'}
sha=lambda b:hashlib.sha256(b).hexdigest()
s=connect()
try:
 if sys.argv[1]=='prepare':
  raw={}
  with s.open_sftp() as f:
   for k,p in FILES.items():raw[k]=f.open(p,'rb').read();(ROOT/(k+'.unify.before')).write_bytes(raw[k])
  run(s,f'mkdir -m 700 {BACK}; cp -p {FILES["panel"]} {BACK}/panel.before; cp -p {FILES["game"]} {BACK}/game.before; cp -p /www/server/panel/vhost/cert/127.0.0.2/fullchain.pem {BACK}/fullchain.pem; cp -p /www/server/panel/vhost/cert/127.0.0.2/privkey.pem {BACK}/privkey.pem; chmod 600 {BACK}/privkey.pem')
  g=raw['game'].decode();p=raw['panel'].decode()
  assert g.count('    location /ws {')==1 and '    location /ws {' not in p
  routes=g[g.index('    location /ws {'):g.index('    access_log /www/wwwlogs/game-lhs-access.log;')]
  marker='    #PHP-INFO-START';assert p.count(marker)==1
  p=p.replace(marker,'    # LHS_DOMAIN_GAME_ROUTES_20260929: same game/API/WS/WebGM as IP:81.\n    location / { try_files $uri $uri/ /index.html; }\n\n'+routes+'\n'+marker)
  assert g.count('server_name _ linhhoasu.lol www.linhhoasu.lol;')==1
  g=g.replace('server_name _ linhhoasu.lol www.linhhoasu.lol;','server_name _ www.linhhoasu.lol;')
  assert g.count('server_name linhhoasu.lol www.linhhoasu.lol;')==1
  g=g.replace('server_name linhhoasu.lol www.linhhoasu.lol;','server_name www.linhhoasu.lol;')
  for k,v in [('panel',p),('game',g)]: (ROOT/(k+'.unify.candidate')).write_bytes(v.encode())
  m={k:{'before':sha(raw[k]),'candidate':sha((ROOT/(k+'.unify.candidate')).read_bytes())} for k in FILES}
  (ROOT/'unify-manifest.json').write_text(json.dumps(m,indent=2));print(json.dumps(m))
 elif sys.argv[1]=='apply':
  m=json.loads((ROOT/'unify-manifest.json').read_text());installed=[]
  with s.open_sftp() as f:
   for k,p in FILES.items():assert sha(f.open(p,'rb').read())==m[k]['before'],'CAS_DRIFT_'+k
   for k,p in FILES.items():
    data=(ROOT/(k+'.unify.candidate')).read_bytes();assert sha(data)==m[k]['candidate']
    with f.open(p+'.lhs-unify','wb') as o:o.write(data)
    f.chmod(p+'.lhs-unify',0o600)
    assert sha(f.open(p+'.lhs-unify','rb').read())==m[k]['candidate']
   try:
    for k,p in FILES.items():f.posix_rename(p+'.lhs-unify',p);installed.append(k)
    print(run(s,'nginx -t 2>&1 && nginx -s reload'))
   except Exception:
    for k in reversed(installed):
     p=FILES[k];assert sha(f.open(p,'rb').read())==m[k]['candidate'],'ROLLBACK_DRIFT'
     with f.open(p+'.lhs-rollback','wb') as o:o.write(f.open(BACK+'/'+k+'.before','rb').read())
     f.posix_rename(p+'.lhs-rollback',p)
    print(run(s,'nginx -t 2>&1 && nginx -s reload'));raise
   print(json.dumps({k:sha(f.open(p,'rb').read()) for k,p in FILES.items()}))
finally:s.close()

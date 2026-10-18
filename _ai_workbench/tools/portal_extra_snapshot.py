from sso_release_20260930 import connect, WORK, sha
import json
s=connect()
try:
 with s.open_sftp() as f:
  m=json.loads((WORK/'manifest.json').read_text())
  for remote,rel in [('/linhhoasu/lhs/newServer/src/handlers/account.js','lhs/newServer/src/handlers/account.js'),('/www/server/panel/vhost/nginx/game.lhs.conf','nginx/game.lhs.conf')]:
   b=f.open(remote,'rb').read()
   for area in ['before','candidate']:
    p=WORK/area/rel;p.parent.mkdir(parents=True,exist_ok=True)
    if p.exists():raise RuntimeError('exists')
    p.write_bytes(b)
   m[remote]=sha(b)
  (WORK/'manifest.json').write_text(json.dumps(m,indent=2))
 print('snapshot OK')
finally:s.close()

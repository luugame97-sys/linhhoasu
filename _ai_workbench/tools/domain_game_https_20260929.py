"""Scoped nginx deployment helpers using the pinned production SSH connector."""
import sys,json,hashlib,shlex
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8');sys.dont_write_bytecode=True
from snapshot_web_multiserver_20260906 import connect,run
LOCAL=Path(__file__).resolve().parents[1]/'temp/domain_linhhoasu_lol_20260929'
REMOTE='/www/server/panel/vhost/nginx/game.lhs.conf'
BACK='/linhhoasu/_ai_workbench/backups/domain_linhhoasu_lol_https_20260929'
def sha(b):return hashlib.sha256(b).hexdigest()
s=connect()
try:
 mode=sys.argv[1]
 if mode=='snapshot':
  with s.open_sftp() as f:
   data=f.open(REMOTE,'rb').read();(LOCAL/'https-baseline.conf').write_bytes(data)
  print(run(s,f'mkdir -m 700 {BACK}; cp -p {REMOTE} {BACK}/game.lhs.conf.before; cp -p /www/server/panel/config/letsencrypt_v2.json {BACK}/letsencrypt_v2.json.before; sha256sum {REMOTE}'))
 elif mode=='apply':
  data=(LOCAL/sys.argv[2]).read_bytes();expected=sys.argv[3]
  with s.open_sftp() as f:
   previous=f.open(REMOTE,'rb').read();assert sha(previous)==expected,'CAS_DRIFT'
   tmp=REMOTE+'.lhs-domain-candidate';f.open(tmp,'wb').write(data);f.chmod(tmp,0o600)
   assert sha(f.open(tmp,'rb').read())==sha(data)
   f.posix_rename(tmp,REMOTE)
  try:print(run(s,'nginx -t && nginx -s reload'))
  except Exception:
   with s.open_sftp() as f:
    assert sha(f.open(REMOTE,'rb').read())==sha(data),'ROLLBACK_CAS_DRIFT'
    f.open(tmp,'wb').write(previous);f.chmod(tmp,0o600);f.posix_rename(tmp,REMOTE)
   print(run(s,'nginx -t && nginx -s reload'));raise
  print(json.dumps({'installedSha256':sha(data)}))
 elif mode=='python':
  source=Path(sys.argv[2]).read_text(encoding='utf-8')
  print(run(s,'cd /www/server/panel && /www/server/panel/pyenv/bin/python -',source))
finally:s.close()

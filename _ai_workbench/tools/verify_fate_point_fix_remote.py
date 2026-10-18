import getpass, json
from datetime import datetime, timezone
import paramiko

HOST='103.116.105.154';LOCAL=r'I:\Linhhoasu\server\server\_ai_workbench\tools\verify_fate_point_fix.js'
pw=getpass.getpass('VPS password (not logged): ');s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect(HOST,username='root',password=pw,look_for_keys=False,allow_agent=False,timeout=15)
def run(cmd):
 _,o,e=s.exec_command(cmd);t=o.read().decode('utf8','replace');c=o.channel.recv_exit_status()
 if c:raise RuntimeError(e.read().decode('utf8','replace')[-4000:])
 return t
r=None
try:
 stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');r=f'/linhhoasu/_ai_workbench/temp/verify_fate_point_{stamp}.js';sf=s.open_sftp();sf.put(LOCAL,r);sf.close();raw=run(f'cd /linhhoasu/lhs/newServer && node {r}');print(raw)
 served=run("curl -fsS http://127.0.0.1:81/ | grep -o '20260830_fate_point_fix7' | head -1 || true").strip();markers=run("curl -fsS http://127.0.0.1:81/js/main.min_a6195824.js | grep -o 'GetItemCount(99)' | wc -l").strip();ready=run("curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready").strip();print(json.dumps({'served_cache_token':served,'served_item99_marker_count':int(markers or 0),'ready':ready},ensure_ascii=False,indent=2))
finally:
 try:
  if r:run(f'rm -f {r}')
 except Exception:pass
 s.close()

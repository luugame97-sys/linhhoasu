import getpass, json, os
from datetime import datetime, timezone
import paramiko

HOST='103.116.105.154'; LOCAL=r'I:\Linhhoasu\server\server\_ai_workbench\tools\audit_item50_remote.js'; OUT=r'I:\Linhhoasu\server\server\_ai_workbench\temp\item50_remote_audit.json'
pw=getpass.getpass('VPS password (not logged): '); s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect(HOST,username='root',password=pw,look_for_keys=False,allow_agent=False,timeout=15)
def run(cmd):
 _,o,e=s.exec_command(cmd);t=o.read().decode('utf8','replace');c=o.channel.recv_exit_status()
 if c:raise RuntimeError(e.read().decode('utf8','replace')[-4000:])
 return t
r=None
try:
 stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');r=f'/linhhoasu/_ai_workbench/temp/audit_item50_{stamp}.js';sf=s.open_sftp();sf.put(LOCAL,r);sf.close();raw=run(f'cd /linhhoasu/lhs/newServer && AUDIT_ITEM_ID=99 node {r}');data=json.loads(raw[raw.find('{'):]);os.makedirs(os.path.dirname(OUT),exist_ok=True);json.dump(data,open(OUT,'w',encoding='utf8'),ensure_ascii=False,indent=2);print(json.dumps({'result':'ok','itemId':data['itemId'],'mailCount':data['mailCount'],'claimed':data['claimed'],'unclaimed':data['unclaimed'],'players':data['players'],'output':OUT},ensure_ascii=False,indent=2))
finally:
 try:
  if r:run(f'rm -f {r}')
 except Exception:pass
 s.close()

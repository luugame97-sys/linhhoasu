import getpass, json
from datetime import datetime, timezone
import paramiko

HOST='103.116.105.154'; LOCAL=r'I:\Linhhoasu\server\server\_ai_workbench\tools\audit_donate_target_mails.js'; OUT=r'I:\Linhhoasu\server\server\_ai_workbench\temp\donate_target_mails.json'
pw=getpass.getpass('VPS password (not logged): '); s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect(HOST,username='root',password=pw,look_for_keys=False,allow_agent=False,timeout=15)
def run(cmd):
 _,o,e=s.exec_command(cmd);t=o.read().decode('utf8','replace');c=o.channel.recv_exit_status()
 if c:raise RuntimeError(e.read().decode('utf8','replace')[-4000:])
 return t
r=None
try:
 stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');r=f'/linhhoasu/_ai_workbench/temp/audit_donate_target_mails_{stamp}.js';sf=s.open_sftp();sf.put(LOCAL,r);sf.close();raw=run(f'cd /linhhoasu/lhs/newServer && node {r}');data=json.loads(raw[raw.find('['):]);json.dump(data,open(OUT,'w',encoding='utf8'),ensure_ascii=False,indent=2);print(json.dumps({'count':len(data),'by_user':{u:sum(1 for x in data if x['userId']==u) for u in sorted(set(x['userId'] for x in data))},'output':OUT},ensure_ascii=False,indent=2))
finally:
 try:
  if r:run(f'rm -f {r}')
 except Exception:pass
 s.close()

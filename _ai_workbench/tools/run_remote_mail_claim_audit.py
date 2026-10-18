import getpass
import json
import os
from datetime import datetime, timezone

import paramiko

HOST='103.116.105.154'
LOCAL=r'I:\Linhhoasu\server\server\_ai_workbench\tools\audit_webshop_mail_claims.js'
OUT=r'I:\Linhhoasu\server\server\_ai_workbench\temp\webshop_remote_audit\mail_claim_audit.json'
stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S'); remote=f'/linhhoasu/_ai_workbench/temp/audit_webshop_mail_claims_{stamp}.js'
s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect(HOST,username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
try:
 sf=s.open_sftp();sf.put(LOCAL,remote);sf.close()
 cmd=f"cd /linhhoasu/lhs/newServer && MONGO_URI='mongodb://127.0.0.1:27017/lhs_s1001' node {remote}"
 _,o,e=s.exec_command(cmd);raw=o.read().decode('utf8','replace');code=o.channel.recv_exit_status()
 if code: raise RuntimeError(e.read().decode('utf8','replace')[-4000:])
 start=raw.find('{'); data=json.loads(raw[start:]);os.makedirs(os.path.dirname(OUT),exist_ok=True);json.dump(data,open(OUT,'w',encoding='utf8'),ensure_ascii=False,indent=2)
 print('MAIL_COUNT',data['mail_count'],'ROWS',len(data['rows']))
 for row in data['rows']: print(row)
finally:
 try:s.exec_command(f'rm -f {remote}')
 except Exception:pass
 s.close()

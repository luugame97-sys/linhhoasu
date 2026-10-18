import getpass, json
from datetime import datetime, timezone
import paramiko

HOST='103.116.105.154'
LOCAL = [
    r'I:\Linhhoasu\server\server\_ai_workbench\tools\contract_active_donate_rewards.js',
    r'I:\Linhhoasu\server\server\_ai_workbench\tools\contract_active_giftcode_rewards.js',
    r'I:\Linhhoasu\server\server\_ai_workbench\temp\giftcode_donate_audit.json',
]
pw=getpass.getpass('VPS password (not logged): ')
s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect(HOST,username='root',password=pw,look_for_keys=False,allow_agent=False,timeout=15)
def run(cmd):
 _,o,e=s.exec_command(cmd);t=o.read().decode('utf8','replace');c=o.channel.recv_exit_status()
 if c:raise RuntimeError(e.read().decode('utf8','replace')[-4000:])
 return t
remote=[]
try:
 stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S'); base=f'/linhhoasu/_ai_workbench/temp/reward_contract_{stamp}';run(f'mkdir -p {base}');
 sf=s.open_sftp()
 try:
  for i,local in enumerate(LOCAL):
   rp=f'{base}/{i}_{local.rsplit("\\",1)[-1]}';sf.put(local,rp);remote.append(rp)
  audit=f'/linhhoasu/_ai_workbench/temp/giftcode_donate_audit.json';sf.put(LOCAL[2],audit);remote.append(audit)
 finally:sf.close()
 out=[]
 audit=f'/linhhoasu/_ai_workbench/temp/giftcode_donate_audit.json'
 for rp in remote[:2]:
  raw=run(f'cd /linhhoasu/lhs/newServer && REWARD_AUDIT_PATH={audit} node {rp}'); out.append(json.loads(raw[raw.find('{'):]))
 print(json.dumps({'result':'ok','contracts':out},ensure_ascii=False,indent=2))
finally:
 try:
  if remote:run('rm -f '+' '.join(remote[:2]))
 except Exception:pass
 s.close()

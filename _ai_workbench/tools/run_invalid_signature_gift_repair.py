import getpass, json
from datetime import datetime, timezone
import paramiko

HOST='103.116.105.154';LOCAL=r'I:\Linhhoasu\server\server\_ai_workbench\tools\repair_invalid_signature_gift_batches.php'
pw=getpass.getpass('VPS password (not logged): ');s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect(HOST,username='root',password=pw,look_for_keys=False,allow_agent=False,timeout=15)
def run(cmd):
 _,o,e=s.exec_command(cmd);t=o.read().decode('utf8','replace');c=o.channel.recv_exit_status()
 if c:raise RuntimeError(e.read().decode('utf8','replace')[-5000:])
 return t
r=None
try:
 stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');backup=f'/linhhoasu/_ai_workbench/backups/gift_invalid_signature_repair_{stamp}';r=f'/linhhoasu/_ai_workbench/temp/repair_invalid_signature_gifts_{stamp}.php';sf=s.open_sftp();sf.put(LOCAL,r);sf.close();run(f'php -l {r}');dry_raw=run(f'php {r} --backup={backup}');dry=json.loads(dry_raw[dry_raw.find("{"):]);
 if dry.get('target_count')!=9 or any(x.get('status')!='dry-run' for x in dry.get('results',[])):raise RuntimeError('dry-run mismatch '+dry_raw[-3000:])
 commit_raw=run(f'php {r} --commit --backup={backup}');commit=json.loads(commit_raw[commit_raw.find("{"):]);
 if commit.get('target_count')!=9 or any(x.get('status')!='sent' for x in commit.get('results',[])):raise RuntimeError('commit mismatch '+commit_raw[-5000:])
 print(json.dumps({'result':'ok','backup':backup,'target_count':commit['target_count'],'repaired':[{'id':x['id'],'account_name':x['account_name'],'giftcode':x['giftcode'],'status':x['status']} for x in commit['results']],'status_counts':commit['status_counts']},ensure_ascii=False,indent=2))
finally:
 try:
  if r:run(f'rm -f {r}')
 except Exception:pass
 s.close()

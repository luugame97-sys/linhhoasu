import getpass, json, os
from datetime import datetime, timezone
import paramiko

HOST='103.116.105.154'; LOCAL=r'I:\Linhhoasu\server\server\_ai_workbench\tools\audit_giftcode_donate_consistency.php'; OUT=r'I:\Linhhoasu\server\server\_ai_workbench\temp\giftcode_donate_consistency.json'
pw=getpass.getpass('VPS password (not logged): '); s=paramiko.SSHClient(); s.set_missing_host_key_policy(paramiko.AutoAddPolicy()); s.connect(HOST,username='root',password=pw,look_for_keys=False,allow_agent=False,timeout=15)
def run(cmd):
 _,o,e=s.exec_command(cmd); t=o.read().decode('utf8','replace'); c=o.channel.recv_exit_status()
 if c: raise RuntimeError(e.read().decode('utf8','replace')[-4000:])
 return t
r=None
try:
 stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');r=f'/linhhoasu/_ai_workbench/temp/giftcode_donate_consistency_{stamp}.php';sf=s.open_sftp();sf.put(LOCAL,r);sf.close();raw=run(f'php {r}'); data=json.loads(raw[raw.find('{'):]);os.makedirs(os.path.dirname(OUT),exist_ok=True);json.dump(data,open(OUT,'w',encoding='utf8'),ensure_ascii=False,indent=2)
 invalid_gift=[{'code':x['code'],'item':i} for x in data['giftcodes'] for i in x['items'] if not i['allowed'] or not i['giftAmountValid']]
 invalid_donate=[{'id':x['id'],'title':x['title'],'item':i} for x in data['activeDonate'] for i in x['items'] if not i['allowed'] or not i['donateAmountValid']]
 print(json.dumps({'result':'ok','giftcodeCount':len(data['giftcodes']),'invalidGiftcodes':invalid_gift,'activeDonateCount':len(data['activeDonate']),'invalidDonate':invalid_donate,'donateClaimCount':len(data['donateClaims']),'donateLogCount':len(data['donateLogs']),'systemEventCount':len(data['systemEvents']) if isinstance(data['systemEvents'],list) else data['systemEvents'],'output':OUT},ensure_ascii=False,indent=2))
finally:
 try:
  if r:run(f'rm -f {r}')
 except Exception:pass
 s.close()

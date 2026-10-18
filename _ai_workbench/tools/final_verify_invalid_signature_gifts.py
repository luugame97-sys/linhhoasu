import getpass, json
from datetime import datetime, timezone
import paramiko

HOST='103.116.105.154';LOCAL=r'I:\Linhhoasu\server\server\_ai_workbench\tools\verify_invalid_signature_gift_repair.js'
pw=getpass.getpass('VPS password (not logged): ');s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect(HOST,username='root',password=pw,look_for_keys=False,allow_agent=False,timeout=15)
def run(cmd):
 _,o,e=s.exec_command(cmd);t=o.read().decode('utf8','replace');c=o.channel.recv_exit_status()
 if c:raise RuntimeError(e.read().decode('utf8','replace')[-5000:])
 return t
r=None
try:
 stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');r=f'/linhhoasu/_ai_workbench/temp/verify_invalid_signature_gifts_{stamp}.js';sf=s.open_sftp();sf.put(LOCAL,r);sf.close();raw=run(f'cd /linhhoasu/lhs/newServer && node {r}');mails=json.loads(raw[raw.find("{"):]);
 php=r'''require "config.php";$s=$conn_web->query("SELECT status,COUNT(*) c FROM giftcode_delivery_batches GROUP BY status ORDER BY status");echo json_encode($s->fetchAll(PDO::FETCH_ASSOC));''';raw2=run(f"cd /linhhoasu/webgame/gm && php -r '{php}'");status=json.loads(raw2[raw2.find("["):]);
 if mails.get('count')!=9 or status!=[{'status':'sent','c':254}]:raise RuntimeError(json.dumps({'mails':mails,'status':status}))
 lint=[run('php -l /linhhoasu/webgame/gm/config.php').strip(),run('php -l /linhhoasu/webgame/gm/api/user_api.php').strip()];ready=run("curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready").strip();fresh=run("tail -5000 /root/.pm2/logs/lhs-s1001-out.log | grep 'signature reject.*INVALID_SIGNATURE' | tail -10 || true").strip().splitlines();print(json.dumps({'result':'ok','mail_count':mails['count'],'mails':mails['rows'],'status_counts':status,'php_lint':lint,'ready':ready,'fresh_invalid_signature_lines':fresh},ensure_ascii=False,indent=2))
finally:
 try:
  if r:run(f'rm -f {r}')
 except Exception:pass
 s.close()

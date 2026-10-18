import getpass, json
import paramiko

HOST='103.116.105.154'; pw=getpass.getpass('VPS password (not logged): '); s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect(HOST,username='root',password=pw,look_for_keys=False,allow_agent=False,timeout=15)
def run(cmd):
 _,o,e=s.exec_command(cmd);t=o.read().decode('utf8','replace');c=o.channel.recv_exit_status()
 if c:raise RuntimeError(e.read().decode('utf8','replace')[-4000:])
 return t
try:
 php=r'''require "config.php";$q=function($s){global $conn_web;$x=$conn_web->query($s);return $x->fetchAll(PDO::FETCH_ASSOC);};$codes=$q("SELECT id,code,is_active,used_count,max_uses FROM giftcodes ORDER BY id");$b=$q("SELECT status,COUNT(*) c FROM giftcode_delivery_batches GROUP BY status");$cl=(int)$conn_web->query("SELECT COUNT(*) FROM recharge_milestone_claims")->fetchColumn();echo json_encode(array('codes'=>$codes,'batch_status'=>$b,'donate_claims'=>$cl));'''
 raw=run(f"cd /linhhoasu/webgame/gm && php -r '{php}'");data=json.loads(raw[raw.find('{'):]);
 if any(int(x['is_active'])!=1 for x in data['codes']) or data['batch_status']!=[{'status':'sent','c':245}] or data['donate_claims']!=24:raise RuntimeError(json.dumps(data))
 core=run('cd /linhhoasu/lhs/newServer && npm run test:core-contract').strip().splitlines()[-1];ready=run("curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready").strip();health=json.loads(run('curl -fsS http://127.0.0.1:9200/health'));print(json.dumps({'result':'ok','giftcodes':len(data['codes']),'batch_status':data['batch_status'],'donate_claims':data['donate_claims'],'core':core,'ready':ready,'pid':health['runtime']['pid'],'bots':health['runtime'].get('bots')},ensure_ascii=False,indent=2))
finally:s.close()

import getpass
import json
import paramiko

HOST='103.116.105.154'; pw=getpass.getpass('VPS password (not logged): ')
s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect(HOST,username='root',password=pw,look_for_keys=False,allow_agent=False,timeout=15)
def run(cmd):
 _,o,e=s.exec_command(cmd);t=o.read().decode('utf8','replace');c=o.channel.recv_exit_status()
 if c:raise RuntimeError(e.read().decode('utf8','replace')[-4000:])
 return t
try:
 run('BOT_ENABLED=1 BOT_CHAT_ENABLED=1 pm2 restart lhs-s1001 --update-env; pm2 save')
 ready=run("for i in $(seq 1 30); do c=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready || true); [ \"$c\" = 200 ] && echo 200 && exit 0; sleep 1; done; exit 1").strip()
 health=json.loads(run('curl -fsS http://127.0.0.1:9200/health'))
 bots=health.get('runtime',{}).get('bots',{})
 if ready!='200' or bots.get('enabled') is not True or bots.get('chatEnabled') is not True or bots.get('botCount')!=5:raise RuntimeError(json.dumps({'ready':ready,'bots':bots}))
 print(json.dumps({'result':'ok','ready':ready,'pid':health.get('runtime',{}).get('pid'),'bots':bots},ensure_ascii=False,indent=2))
finally:s.close()

import getpass, os, paramiko, tempfile
from datetime import datetime, timezone
HOST='103.116.105.154'; ROOT='/linhhoasu/lhs/newServer'; REMOTE=ROOT+'/src/services/PlayerService.js'; LOCAL=r'I:\Linhhoasu\server\server\linhhoasu\lhs\newServer\src\services\PlayerService.js'
def run(s,c):
 _,o,e=s.exec_command(c); x=o.read().decode('utf-8','replace'); code=o.channel.recv_exit_status()
 if code: raise RuntimeError(e.read().decode('utf-8','replace')[-1000:])
 return x
pw=getpass.getpass('VPS password (not logged): '); s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect(HOST,username='root',password=pw,look_for_keys=False,allow_agent=False,timeout=15)
try:
 stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S'); backup=f'/linhhoasu/_ai_workbench/backups/lag_fix_player_service_{stamp}'; run(s,f'mkdir -p {backup}; cp -p {REMOTE} {backup}/PlayerService.js.before')
 sf=s.open_sftp()
 try: sf.put(LOCAL,REMOTE+'.deploy-'+stamp+'.js')
 finally: sf.close()
 run(s,f'node --check {REMOTE}.deploy-{stamp}.js; mv {REMOTE}.deploy-{stamp}.js {REMOTE}; chmod 644 {REMOTE}; pm2 restart lhs-s1001 --update-env; pm2 save')
 ready=run(s,"for i in $(seq 1 30); do c=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready || true); [ \"$c\" = 200 ] && echo 200 && exit 0; sleep 1; done; exit 1").strip()
 print('BACKUP='+backup);print('READY_HTTP='+ready);print('HASH='+run(s,f"sha256sum {REMOTE} | cut -d' ' -f1").strip())
finally:s.close()

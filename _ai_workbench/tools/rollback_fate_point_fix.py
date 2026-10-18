import getpass
import paramiko
from datetime import datetime, timezone

HOST='103.116.105.154'
REMOTE_BACKUP='/linhhoasu/_ai_workbench/backups/fate_point_fix_20260830_100955'
FILES={
    'lhs/newServer/src/handlers/fate.js':'lhs__newServer__src__handlers__fate.js',
    'webgame/game/js/main.min_a6195824.js':'webgame__game__js__main.min_a6195824.js',
    'webgame/game/index.html':'webgame__game__index.html',
}
pw=getpass.getpass('VPS password (not logged): ')
s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect(HOST,username='root',password=pw,look_for_keys=False,allow_agent=False,timeout=15)
def run(cmd):
 _,o,e=s.exec_command(cmd);t=o.read().decode('utf8','replace');c=o.channel.recv_exit_status()
 if c:raise RuntimeError(e.read().decode('utf8','replace')[-4000:])
 return t
try:
 stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');cur=f'/linhhoasu/_ai_workbench/backups/fate_point_fix_rollback_{stamp}';run(f'mkdir -p {cur}')
 for rel,base in FILES.items():run(f'cp -p /linhhoasu/{rel} {cur}/{rel.replace("/", "__")}')
 for rel,base in FILES.items():
  run(f'cp -p {REMOTE_BACKUP}/{base} /linhhoasu/{rel}')
 run('node --check /linhhoasu/lhs/newServer/src/handlers/fate.js')
 run('pm2 restart lhs-s1001 --update-env; pm2 save')
 ready=run("for i in $(seq 1 30); do c=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready || true); [ \"$c\" = 200 ] && echo 200 && exit 0; sleep 1; done; exit 1").strip()
 health=run('curl -fsS http://127.0.0.1:9200/health | head -c 900').strip()
 print('BACKUP_CURRENT='+cur);print('READY='+ready);print('HEALTH='+health)
finally:s.close()

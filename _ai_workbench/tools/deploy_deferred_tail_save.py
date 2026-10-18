import getpass, os, tempfile
from datetime import datetime, timezone
import paramiko
HOST='103.116.105.154'; REMOTE='/linhhoasu/lhs/newServer/src/net/WSServer.js'
def run(s,c):
 _,o,e=s.exec_command(c); x=o.read().decode('utf-8','replace'); code=o.channel.recv_exit_status()
 if code: raise RuntimeError(e.read().decode('utf-8','replace')[-800:])
 return x
pw=getpass.getpass('VPS password (not logged): '); s=paramiko.SSHClient(); s.set_missing_host_key_policy(paramiko.AutoAddPolicy()); s.connect(HOST,username='root',password=pw,look_for_keys=False,allow_agent=False,timeout=15)
try:
 stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S'); backup=f'/linhhoasu/_ai_workbench/backups/lag_fix_deferred_tail_{stamp}'; run(s,f'mkdir -p {backup}; cp -p {REMOTE} {backup}/WSServer.js.before')
 sf=s.open_sftp()
 try:
  with sf.open(REMOTE,'rb') as f: t=f.read().decode('utf-8','replace')
 finally: sf.close()
 old='playerService.savePlayer(session.userId, session.player).catch((err) => {'; new='playerService.savePlayerDeferred(session.userId, session.player).catch((err) => {'
 if old not in t: raise RuntimeError('expected synchronous tail save not found')
 t=t.replace(old,new,1)
 fd,p=tempfile.mkstemp(suffix='.js'); os.close(fd); open(p,'w',encoding='utf-8').write(t); sf=s.open_sftp()
 try: sf.put(p,REMOTE+'.deploy-'+stamp+'.js')
 finally: sf.close(); os.unlink(p)
 run(s,f'node --check {REMOTE}.deploy-{stamp}.js; mv {REMOTE}.deploy-{stamp}.js {REMOTE}; chmod 644 {REMOTE}; pm2 restart lhs-s1001 --update-env; pm2 save')
 ready=run(s,"for i in $(seq 1 30); do c=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready || true); [ \"$c\" = 200 ] && echo 200 && exit 0; sleep 1; done; exit 1").strip()
 print('BACKUP='+backup); print('READY_HTTP='+ready); print('HASH='+run(s,f"sha256sum {REMOTE} | cut -d' ' -f1").strip())
finally:s.close()

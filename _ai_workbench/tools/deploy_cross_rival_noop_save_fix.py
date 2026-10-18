import getpass,os,paramiko,tempfile
from datetime import datetime,timezone
HOST='103.116.105.154';REMOTE='/linhhoasu/lhs/newServer/src/handlers/cross-rival.js';LOCAL=r'I:\Linhhoasu\server\server\linhhoasu\lhs\newServer\src\handlers\cross-rival.js'
def run(s,c):
 _,o,e=s.exec_command(c);x=o.read().decode('utf-8','replace');code=o.channel.recv_exit_status()
 if code:raise RuntimeError(e.read().decode('utf-8','replace')[-1000:])
 return x
pw=getpass.getpass('VPS password (not logged): ');s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect(HOST,username='root',password=pw,look_for_keys=False,allow_agent=False,timeout=15)
try:
 stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');backup=f'/linhhoasu/_ai_workbench/backups/lag_fix_cross_rival_noop_{stamp}';run(s,f'mkdir -p {backup};cp -p {REMOTE} {backup}/cross-rival.js')
 sf=s.open_sftp()
 try:
  with sf.open(REMOTE,'rb') as f:t=f.read().decode('utf-8','replace').replace('\r\n','\n')
 finally:sf.close()
 old="  const dest = ensurePlainObject(params && params.dest);\n  await playerService.savePlayer(session.userId, player);\n  return {\n    tag: 6552,"
 new="  const dest = ensurePlainObject(params && params.dest);\n  // Movement only echoes client position; it does not mutate player state.\n  // Avoid a full MongoDB write on every movement frame.\n  return {\n    tag: 6552,"
 if old not in t:raise RuntimeError('cross-rival move noop-save anchor missing')
 t=t.replace(old,new,1)
 old="  info.mapLinePlayerCount[camp] = { count, coreScore };\n\n  await playerService.savePlayer(session.userId, player);"
 new='''  info.mapLinePlayerCount[camp] = { count, coreScore };
  // This count is derived from current map state and can be persisted after
  // the response without delaying the polling RPC.
  playerService.savePlayerDeferred(session.userId, player).catch((err) => {
    logger.warn(`[CrossRival] async save failed map player count user=${session.userId}: ${err.message}`);
  });'''
 if old not in t:raise RuntimeError('cross-rival count-save anchor missing')
 t=t.replace(old,new,1)
 fd,p=tempfile.mkstemp(suffix='.js');os.close(fd);open(p,'w',encoding='utf-8').write(t);sf=s.open_sftp()
 try:sf.put(p,REMOTE+'.deploy-'+stamp+'.js')
 finally:sf.close();os.unlink(p)
 run(s,f'node --check {REMOTE}.deploy-{stamp}.js;mv {REMOTE}.deploy-{stamp}.js {REMOTE};chmod 644 {REMOTE};pm2 restart lhs-s1001 --update-env;pm2 save')
 ready=run(s,"for i in $(seq 1 30);do c=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready||true);[ \"$c\" = 200 ]&&echo 200&&exit 0;sleep 1;done;exit 1").strip();print('BACKUP='+backup);print('READY_HTTP='+ready);print('HASH='+run(s,f"sha256sum {REMOTE}|cut -d' ' -f1").strip())
finally:s.close()

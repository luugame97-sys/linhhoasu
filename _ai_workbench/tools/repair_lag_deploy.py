import getpass, os, paramiko, tempfile
from datetime import datetime, timezone
HOST='103.116.105.154'; ROOT='/linhhoasu/lhs/newServer'; ORIG=r'I:\Linhhoasu\server\server\_ai_workbench\temp\remote_lag_snapshot'; LOCAL=r'I:\Linhhoasu\server\server\linhhoasu\lhs\newServer'
FILES={'WSServer.js':'src/net/WSServer.js','PlayerService.js':'src/services/PlayerService.js','compat.js':'src/handlers/compat.js'}
def run(s,c):
 _,o,e=s.exec_command(c); x=o.read().decode('utf-8','replace'); code=o.channel.recv_exit_status()
 if code: raise RuntimeError(e.read().decode('utf-8','replace')[-1000:])
 return x
def ws(t):
 a='      return;\n    }\n    const queuedAt = Date.now();'; b='      return;\n    }\n    if (Number(msg && msg.tag) === 11) {\n      this._handleHeartbeatFastPath(ws, msg, session);\n      return;\n    }\n    const queuedAt = Date.now();'; t=t.replace(a,b,1)
 m='''\n  _handleHeartbeatFastPath(ws, msg, session) {\n    Promise.resolve().then(() => router.route(11, msg.msgUid, msg.data, session)).then((result) => { this.sendResponse(ws, result); }).catch(() => { this.sendResponse(ws, { tag: 11, msgUid: msg.msgUid, data: { kick: false } }); });\n  }\n'''; t=t.replace('  /**\n   * 处理单条消息，支持同步和异步 handler。\n   */',m+'\n  /**\n   * 处理单条消息，支持同步和异步 handler。\n   */',1); return t.replace('playerService.savePlayer(session.userId, session.player).catch((err) => {','playerService.savePlayerDeferred(session.userId, session.player).catch((err) => {',1)
def player(t,l):
 a=l.index('const deferredSaveStates = new Map();'); b=l.index('\n\nfunction markSaveScheduled',a); t=t.replace('const saveQueueDepths = new Map();',l[a:b],1); t=t.replace('  const snapshot = cloneSaveData(sourceData);','  const snapshot = options && options.snapshotProvided === true ? sourceData : cloneSaveData(sourceData);',1); a=l.index('    if (options && options.returnSaved === false) {'); b=l.index('    try {\n      const saved = await withRetry',a); t=t.replace('    try {\n      const saved = await withRetry',l[a:b]+'    try {\n      const saved = await withRetry',1); a=l.index('function savePlayerDeferred('); b=l.index('\nasync function resetPlayerForServerSwitch',a); st=t.index('function savePlayerDeferred('); en=t.index('\nasync function resetPlayerForServerSwitch',st); return t[:st]+l[a:b]+t[en:]
def compat(t):
 t=t.replace('  const saved = await playerService.savePlayer(session.userId, player);\n  if (saved) session.player = saved;','  await playerService.savePlayer(session.userId, player, { returnSaved: false });\n  session.player = player;',1); t=t.replace('  await saveSessionPlayer(session, player);\n  const response = {','  scheduleSessionPlayerSave(session, player, \'2100\');\n  const response = {',1); return t.replace('  await saveSessionPlayer(session, player);\n  const update = {','  scheduleSessionPlayerSave(session, player, \'2101\');\n  const update = {',1)
pw=getpass.getpass('VPS password (not logged): '); s=paramiko.SSHClient(); s.set_missing_host_key_policy(paramiko.AutoAddPolicy()); s.connect(HOST,username='root',password=pw,look_for_keys=False,allow_agent=False,timeout=15)
try:
 if os.environ.get('ROLLBACK_LAG')=='1':
  run(s,'set -eu; cp -p /linhhoasu/_ai_workbench/backups/lag_fix_files_20260829_124554/WSServer.js.before /linhhoasu/lhs/newServer/src/net/WSServer.js; cp -p /linhhoasu/_ai_workbench/backups/lag_fix_files_20260829_124554/PlayerService.js.before /linhhoasu/lhs/newServer/src/services/PlayerService.js; cp -p /linhhoasu/_ai_workbench/backups/lag_fix_files_20260829_124554/compat.js.before /linhhoasu/lhs/newServer/src/handlers/compat.js')
  run(s,'pm2 restart lhs-s1001 --update-env'); run(s,'pm2 save'); print('ROLLBACK_DONE'); print(run(s,"for i in $(seq 1 20); do c=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready || true); [ \"$c\" = 200 ] && echo 200 && exit; sleep 1; done; exit 1").strip()); raise SystemExit
 stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S'); backup=f'/linhhoasu/_ai_workbench/backups/lag_fix_repair_{stamp}'; run(s,f'mkdir -p {backup}')
 for name,rel in FILES.items(): run(s,f'cp -p {ROOT}/{rel} {backup}/{name}.before')
 lp=open(os.path.join(LOCAL,'src/services/PlayerService.js'),encoding='utf-8').read(); src={'WSServer.js':ws(open(os.path.join(ORIG,'src_net_WSServer.js'),encoding='utf-8').read()),'PlayerService.js':player(open(os.path.join(ORIG,'src_services_PlayerService.js'),encoding='utf-8').read(),lp),'compat.js':compat(open(os.path.join(ORIG,'src_handlers_compat.js'),encoding='utf-8').read())}
 sf=s.open_sftp()
 try:
  for name,rel in FILES.items(): fd,p=tempfile.mkstemp(suffix='.js'); os.close(fd); open(p,'w',encoding='utf-8').write(src[name]); sf.put(p,ROOT+'/'+rel+'.deploy-'+stamp+'.js'); os.unlink(p); run(s,f'node --check {ROOT}/{rel}.deploy-{stamp}.js; mv {ROOT}/{rel}.deploy-{stamp}.js {ROOT}/{rel}')
 finally: sf.close()
 run(s,'pm2 restart lhs-s1001 --update-env'); run(s,'pm2 save'); print('BACKUP='+backup); print('READY='+run(s,"for i in $(seq 1 20); do c=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready || true); [ \"$c\" = 200 ] && echo 200 && exit; sleep 1; done; exit 1").strip())
finally:s.close()

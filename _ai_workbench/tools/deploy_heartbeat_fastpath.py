import getpass, hashlib, os, tempfile
from datetime import datetime, timezone
import paramiko

HOST='103.116.105.154'; ROOT='/linhhoasu/lhs/newServer'; REMOTE=ROOT+'/src/net/WSServer.js'; LOCAL=r'I:\Linhhoasu\server\server\linhhoasu\lhs\newServer\src\net\WSServer.js'
def run(s,c):
 _,o,e=s.exec_command(c); x=o.read().decode('utf-8','replace'); code=o.channel.recv_exit_status()
 if code: raise RuntimeError(e.read().decode('utf-8','replace')[-1000:])
 return x
def patch(t):
 if '_handleHeartbeatFastPath' in t:return t
 a='      return;\n    }\n    const queuedAt = Date.now();'; b='      return;\n    }\n    // Heartbeat is stateless; keep it outside the gameplay queue.\n    if (Number(msg && msg.tag) === 11) {\n      this._handleHeartbeatFastPath(ws, msg, session);\n      return;\n    }\n    const queuedAt = Date.now();';
 if a not in t: raise RuntimeError('enqueue anchor missing')
 t=t.replace(a,b,1)
 m='''\n  _handleHeartbeatFastPath(ws, msg, session) {\n    const startedAt = Date.now();\n    Promise.resolve().then(() => router.route(11, msg.msgUid, msg.data, session)).then((result) => {\n      tagMetrics.recordSuccess(11);\n      this.sendResponse(ws, result);\n      const elapsed = Date.now() - startedAt;\n      if (elapsed >= 500) logger.warn(`[WSServer] heartbeat slow ws#${session.wsId} msgUid=${Number(msg.msgUid) || 0} user=${session.userId || 'unknown'} elapsed=${elapsed}ms`);\n    }).catch((err) => {\n      tagMetrics.recordFail(11);\n      logger.error(`[WSServer] heartbeat failed ws#${session.wsId}: ${err.message}`);\n      this.sendResponse(ws, { tag: 11, msgUid: msg.msgUid, data: { kick: false } });\n    });\n  }\n'''
 anchor='''  /**\n   * 处理单条消息，支持同步和异步 handler。\n   */''';
 if anchor not in t: raise RuntimeError('method anchor missing')
 return t.replace(anchor,m+'\n'+anchor,1)
pw=getpass.getpass('VPS password (not logged): '); s=paramiko.SSHClient(); s.set_missing_host_key_policy(paramiko.AutoAddPolicy()); s.connect(HOST,username='root',password=pw,look_for_keys=False,allow_agent=False,timeout=15)
try:
 stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S'); backup=f'/linhhoasu/_ai_workbench/backups/lag_fix_heartbeat_{stamp}'; run(s,f'mkdir -p {backup}; cp -p {REMOTE} {backup}/WSServer.js.before')
 sf=s.open_sftp()
 try:
  with sf.open(REMOTE,'rb') as f: old=f.read().decode('utf-8','replace')
 finally: sf.close()
 new=patch(old)
 fd,tmp=tempfile.mkstemp(suffix='.js'); os.close(fd); open(tmp,'w',encoding='utf-8').write(new); sf=s.open_sftp()
 try: sf.put(tmp,REMOTE+'.deploy-'+stamp+'.js')
 finally: sf.close(); os.unlink(tmp)
 run(s,f'node --check {REMOTE}.deploy-{stamp}.js; mv {REMOTE}.deploy-{stamp}.js {REMOTE}; chmod 644 {REMOTE}; pm2 restart lhs-s1001 --update-env; pm2 save')
 ready=run(s,"for i in $(seq 1 30); do c=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready || true); [ \"$c\" = 200 ] && echo 200 && exit 0; sleep 1; done; exit 1").strip()
 print('BACKUP='+backup); print('READY_HTTP='+ready); print('REMOTE_HASH='+run(s,f"sha256sum {REMOTE} | cut -d' ' -f1").strip())
finally:s.close()

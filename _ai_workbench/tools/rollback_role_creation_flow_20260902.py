#!/usr/bin/env python3
from __future__ import annotations
import getpass, json, paramiko

HOST='103.116.105.154'
CURRENT_BACKUP='/linhhoasu/_ai_workbench/backups/role_creation_flow_bad_deploy_20260902'
STABLE='/linhhoasu/_ai_workbench/backups/role_creation_flow_pre_20260902_20260902_004804'
FILES=['HTTPServer.js','HTTPServer1.js','serverList.js','serverList1.js']
REMOTE={
 'HTTPServer.js':'/linhhoasu/lhs/newServer/src/net/HTTPServer.js',
 'HTTPServer1.js':'/linhhoasu/lhs/newServer/src/net/HTTPServer1.js',
 'serverList.js':'/linhhoasu/lhs/newServer/src/handlers/serverList.js',
 'serverList1.js':'/linhhoasu/lhs/newServer/src/handlers/serverList1.js',
}
ssh=paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST,username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
try:
 def run(cmd):
  _,o,e=ssh.exec_command(cmd); text=o.read().decode('utf-8','replace'); code=o.channel.recv_exit_status(); err=e.read().decode('utf-8','replace');
  if code: raise RuntimeError(err[-4000:] or text[-4000:])
  return text
 run('mkdir -p '+CURRENT_BACKUP)
 for name,remote in REMOTE.items():
  run('cp -a '+remote+' '+CURRENT_BACKUP+'/'+name)
  run('cp -a '+STABLE+'/'+name+' '+remote)
 syntax=run("for f in /linhhoasu/lhs/newServer/src/net/HTTPServer.js /linhhoasu/lhs/newServer/src/net/HTTPServer1.js /linhhoasu/lhs/newServer/src/handlers/serverList.js /linhhoasu/lhs/newServer/src/handlers/serverList1.js; do node --check \"$f\" || exit 1; done; echo PASS")
 hashes=run('sha256sum '+' '.join(REMOTE.values()))
 print(json.dumps({'currentBackup':CURRENT_BACKUP,'restoredFrom':STABLE,'syntax':syntax,'hashes':hashes},ensure_ascii=False,indent=2))
finally: ssh.close()

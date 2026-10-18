#!/usr/bin/env python3
import getpass, paramiko, shlex
HOST='103.116.105.154'; LOCAL=r'I:\Linhhoasu\server\server\_ai_workbench\tools\inspect_register_name_candidates_20260901.js'; REMOTE='/linhhoasu/_ai_workbench/temp/inspect_register_name_candidates_20260901.js'
ssh=paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy()); ssh.connect(HOST,username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
try:
 sftp=ssh.open_sftp(); sftp.put(LOCAL,REMOTE); sftp.close()
 cmd="pid=$(pm2 pid lhs-s1001|tail -1); export MONGO_URI=$(tr '\\0' '\\n' </proc/$pid/environ|sed -n 's/^MONGO_URI=//p'); cd /linhhoasu/lhs/newServer; node "+shlex.quote(REMOTE)
 _,out,err=ssh.exec_command(cmd); raw=out.read().decode('utf-8','replace'); code=out.channel.recv_exit_status(); e=err.read().decode('utf-8','replace')
 if code: raise RuntimeError(e[-4000:] or raw[-4000:])
 print(raw)
finally: ssh.close()

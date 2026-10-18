#!/usr/bin/env python3
from __future__ import annotations
import getpass, json, paramiko, shlex

HOST='103.116.105.154'
LOCAL=r'I:\Linhhoasu\server\server\_ai_workbench\tools\inspect_register_account_state.js'
REMOTE='/linhhoasu/_ai_workbench/temp/inspect_register_account_state.js'
TARGET='nhutlex1'
ssh=paramiko.SSHClient();ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy());ssh.connect(HOST,username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
try:
    sftp=ssh.open_sftp()
    try:sftp.put(LOCAL,REMOTE)
    finally:sftp.close()
    cmd="pid=$(pm2 pid lhs-s1001|tail -1); export MONGO_URI=$(tr '\\0' '\\n' </proc/$pid/environ|sed -n 's/^MONGO_URI=//p'); export TARGET_ACCOUNT="+shlex.quote(TARGET)+"; cd /linhhoasu/lhs/newServer; node "+shlex.quote(REMOTE)
    _,out,err=ssh.exec_command(cmd);raw=out.read().decode('utf-8','replace');code=out.channel.recv_exit_status();error=err.read().decode('utf-8','replace')
    if code: raise RuntimeError(error[-4000:] or raw[-4000:])
    start=raw.find('{'); end=raw.rfind('}')
    data=json.loads(raw[start:end+1])
    print(json.dumps(data,ensure_ascii=False,indent=2))
finally:ssh.close()

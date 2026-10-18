#!/usr/bin/env python3
import getpass, paramiko
HOST='103.116.105.154'
ssh=paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy()); ssh.connect(HOST,username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=20)
try:
 _,o,e=ssh.exec_command("find /linhhoasu/_ai_workbench/backups -maxdepth 1 -type d -name 'role_flow_*' -printf '%f\\n' | sort"); print(o.read().decode('utf-8','replace')); o.channel.recv_exit_status()
finally: ssh.close()

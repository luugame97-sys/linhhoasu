#!/usr/bin/env python3
import getpass, paramiko
HOST='103.116.105.154'
ssh=paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy()); ssh.connect(HOST,username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
try:
 c="for f in /linhhoasu/lhs/newServer/src/net/HTTPServer.js /linhhoasu/lhs/newServer/src/net/HTTPServer1.js /linhhoasu/lhs/newServer/src/handlers/serverList.js /linhhoasu/lhs/newServer/src/handlers/serverList1.js /linhhoasu/lhs/newServer/src/services/AccountService.js; do echo ===$f===; grep -n -E 'const role = await accountService.createRole|const created = await accountService.createRole|if \(!selectedRole\)|deferRoleSelection: true|needCreateRole: true|buildCollisionSafeRoleName' \"$f\" | tail -n 20; done"
 _,o,e=ssh.exec_command(c); print(o.read().decode('utf-8','replace')); o.channel.recv_exit_status()
finally: ssh.close()

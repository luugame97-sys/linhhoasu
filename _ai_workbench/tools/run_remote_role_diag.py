import getpass, paramiko

local = r'I:\Linhhoasu\server\server\_ai_workbench\tools\diagnose_new_account_role.js'
remote = '/linhhoasu/_ai_workbench/temp/diagnose_new_account_role.js'
ssh = paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.105.154', username='root', password=getpass.getpass('VPS password (not logged): '), look_for_keys=False, allow_agent=False, timeout=15)
try:
    sftp=ssh.open_sftp(); sftp.put(local, remote); sftp.close()
    cmd = "set -eu; export MONGO_URI=\"$(pm2 env 0 | awk -F': ' '$1==\"MONGO_URI\"{print substr($0,index($0,\": \")+2); exit}')\"; node " + remote
    _,out,err=ssh.exec_command(cmd); print(out.read().decode('utf-8','replace')); print(err.read().decode('utf-8','replace'))
finally: ssh.close()

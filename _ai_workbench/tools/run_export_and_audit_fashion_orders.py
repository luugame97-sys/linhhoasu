import getpass, os, paramiko

LOCAL_EXPORT = r'I:\Linhhoasu\server\server\_ai_workbench\tools\export_buggy_fashion_orders.php'
LOCAL_AUDIT = r'I:\Linhhoasu\server\server\_ai_workbench\tools\audit_buggy_fashion_orders.js'
REMOTE_DIR='/linhhoasu/_ai_workbench/temp'
REMOTE_EXPORT=REMOTE_DIR+'/export_buggy_fashion_orders.php'
REMOTE_AUDIT=REMOTE_DIR+'/audit_buggy_fashion_orders.js'
ssh=paramiko.SSHClient();ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy());ssh.connect('103.116.105.154',username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
try:
 ssh.exec_command('mkdir -p /linhhoasu/_ai_workbench/temp')[1].read(); s=ssh.open_sftp(); s.put(LOCAL_EXPORT,REMOTE_EXPORT); s.put(LOCAL_AUDIT,REMOTE_AUDIT); s.close()
 cmd="php -l "+REMOTE_EXPORT+"; php "+REMOTE_EXPORT+"; export MONGO_URI=\"$(pm2 env 0 | awk -F': ' '$1==\"MONGO_URI\"{print substr($0,index($0,\": \")+2);exit}')\"; node "+REMOTE_AUDIT
 _,o,e=ssh.exec_command(cmd); print(o.read().decode('utf-8','replace')); print(e.read().decode('utf-8','replace'))
finally:ssh.close()

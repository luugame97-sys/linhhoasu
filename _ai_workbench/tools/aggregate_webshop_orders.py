import getpass,paramiko
ssh=paramiko.SSHClient();ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy());ssh.connect('103.116.105.154',username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
try:
 cmd="set -eu; echo CONFIG_FILES; grep -RIl --include='*.php' 'webshop_orders' /linhhoasu/webgame/gm | head -20; echo AGGREGATE; find /linhhoasu/webgame/gm -maxdepth 3 -type f -name '*.php' -print0 | xargs -0 grep -l 'webshop_orders' | head -1 | xargs -r grep -n -C 3 'conn_web'; echo TABLES; grep -RIn --include='*.sql' --include='*.php' 'CREATE TABLE.*webshop_orders\|webshop_orders' /linhhoasu/webgame/gm /linhhoasu 2>/dev/null | head -60"
 _,o,e=ssh.exec_command(cmd);print(o.read().decode('utf-8','replace'));print(e.read().decode('utf-8','replace'))
finally:ssh.close()

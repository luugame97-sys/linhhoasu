import getpass
import paramiko

HOST='103.116.105.154'
pw=getpass.getpass('VPS password (not logged): ')
s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect(HOST,username='root',password=pw,look_for_keys=False,allow_agent=False,timeout=15)
try:
    cmd="grep -RInE 'Internal.*mail|mail sent batch|MAIL_TARGET|webgm_recharge|recharge' /linhhoasu/_ai_workbench/logs /root/.pm2/logs 2>/dev/null | tail -250 || true"
    _,o,e=s.exec_command(cmd);print(o.read().decode('utf8','replace'));print(e.read().decode('utf8','replace'))
finally:s.close()

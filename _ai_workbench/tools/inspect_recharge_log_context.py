import getpass
import paramiko

HOST='103.116.105.154'; pw=getpass.getpass('VPS password (not logged): ')
s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect(HOST,username='root',password=pw,look_for_keys=False,allow_agent=False,timeout=15)
try:
    cmd="sed -n '1560050,1560800p' /root/.pm2/logs/lhs-s1001-out.log | grep -E '2026-08-30 15:14|Internal|mail|recharge|lookup|HTTP' | head -240"
    _,o,e=s.exec_command(cmd);print(o.read().decode('utf8','replace'));print(e.read().decode('utf8','replace'))
finally:s.close()

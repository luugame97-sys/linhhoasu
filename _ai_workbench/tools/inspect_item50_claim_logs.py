import getpass
import paramiko

HOST='103.116.105.154'; pw=getpass.getpass('VPS password (not logged): ')
s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect(HOST,username='root',password=pw,look_for_keys=False,allow_agent=False,timeout=15)
try:
    cmd="grep -nE '15:42:|15:43:|15:44:|u_Wk_1001_7a948e_1788008560635|mail_1788079384874|item.*50|webshop.*50|WebShop.*50' /root/.pm2/logs/lhs-s1001-out.log | grep -E 'Mail|mail|1103|1202|50|webshop' | head -250"
    _,o,e=s.exec_command(cmd);print(o.read().decode('utf8','replace'));print(e.read().decode('utf8','replace'))
finally:s.close()


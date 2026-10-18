import getpass,paramiko
LOCAL=r'I:\Linhhoasu\server\server\_ai_workbench\tools\verify_webshop_fashion_repair.js';REMOTE='/linhhoasu/_ai_workbench/temp/verify_webshop_fashion_repair.js'
s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect('103.116.105.154',username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
try:
 sf=s.open_sftp();sf.put(LOCAL,REMOTE);sf.close();_,o,e=s.exec_command("export MONGO_URI=mongodb://localhost:27017/lhs_s1001; node "+REMOTE);print(o.read().decode('utf-8','replace'));print(e.read().decode('utf-8','replace'))
finally:s.close()

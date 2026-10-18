import getpass,paramiko
L=r'I:\Linhhoasu\server\server\_ai_workbench\tools\inspect_player_bson.js';R='/linhhoasu/_ai_workbench/temp/inspect_player_bson.js';s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect('103.116.105.154',username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
try:sf=s.open_sftp();sf.put(L,R);sf.close();_,o,e=s.exec_command('export MONGO_URI=mongodb://localhost:27017/lhs_s1001; node '+R);print(o.read().decode());print(e.read().decode())
finally:s.close()

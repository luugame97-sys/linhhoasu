import getpass
import os
import paramiko

HOST='103.116.105.154';ROOT='/linhhoasu/webgame/gm';OUT=r'I:\Linhhoasu\server\server\_ai_workbench\temp\sdk_session_remote'
pw=getpass.getpass('VPS password (not logged): ');s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect(HOST,username='root',password=pw,look_for_keys=False,allow_agent=False,timeout=15)
def run(cmd):
 _,o,e=s.exec_command(cmd);t=o.read().decode('utf8','replace');c=o.channel.recv_exit_status()
 if c not in (0,1):raise RuntimeError(e.read().decode('utf8','replace')[-4000:])
 return t
try:
 print(run(f"grep -RInE --exclude='.env' --exclude='*.log' --exclude-dir=vendor 'SDK session expired|session expired|sdk.*expired|sdk_expires|sdk_access|sdk_user|vht6ur_sdk_web_send_items|lhs_find_role' {ROOT} | head -500"))
 os.makedirs(OUT,exist_ok=True);sf=s.open_sftp()
 try:
  for rel in ['config.php','api/user_api.php','login.php','logout.php','index.php','assets/js/login.js','assets/js/user.js']:
   try:sf.get(f'{ROOT}/{rel}',os.path.join(OUT,rel.replace('/','__')))
   except IOError:pass
 finally:sf.close()
finally:s.close()

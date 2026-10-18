import sys
import os
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.104.165', username='root', password='anhduc11')

sftp = ssh.open_sftp()
os.makedirs(r'i:\Linhhoasu\server\server\_ai_workbench\temp\gm_login', exist_ok=True)

files = [
    ('/linhhoasu/webgame/gm/login.php', r'i:\Linhhoasu\server\server\_ai_workbench\temp\gm_login\login.php'),
    ('/linhhoasu/webgame/gm/assets/js/login.js', r'i:\Linhhoasu\server\server\_ai_workbench\temp\gm_login\login.js'),
    ('/linhhoasu/webgame/gm/assets/css/login.css', r'i:\Linhhoasu\server\server\_ai_workbench\temp\gm_login\login.css'),
]

for remote, local in files:
    sftp.get(remote, local)
    print(f"Downloaded {remote} -> {local}")

sftp.close()
ssh.close()

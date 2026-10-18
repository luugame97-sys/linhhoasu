import os
import sys
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.104.165', username='root', password='anhduc11')

# 1. Backup remote files
print("Creating remote backups...")
ssh.exec_command('cp -p /linhhoasu/webgame/gm/login.php /linhhoasu/webgame/gm/login.php.bak_serverpicker')
ssh.exec_command('cp -p /linhhoasu/webgame/gm/assets/js/login.js /linhhoasu/webgame/gm/assets/js/login.js.bak_serverpicker')
ssh.exec_command('cp -p /linhhoasu/webgame/gm/assets/css/login.css /linhhoasu/webgame/gm/assets/css/login.css.bak_serverpicker')

# 2. Upload updated files
print("Uploading updated files...")
sftp = ssh.open_sftp()
local_dir = r'i:\Linhhoasu\server\server\_ai_workbench\temp\gm_login'
sftp.put(os.path.join(local_dir, 'login.php'), '/linhhoasu/webgame/gm/login.php')
sftp.put(os.path.join(local_dir, 'login.js'), '/linhhoasu/webgame/gm/assets/js/login.js')
sftp.put(os.path.join(local_dir, 'login.css'), '/linhhoasu/webgame/gm/assets/css/login.css')
sftp.close()

# 3. Lint PHP
print("Checking PHP syntax...")
_, o, _ = ssh.exec_command('php -l /linhhoasu/webgame/gm/login.php')
lint_result = o.read().decode('utf-8')
print(lint_result)

# 4. Check permissions
ssh.exec_command('chmod 755 /linhhoasu/webgame/gm/login.php /linhhoasu/webgame/gm/assets/js/login.js /linhhoasu/webgame/gm/assets/css/login.css')

# 5. Check curl
print("Testing HTTP response from login.php...")
_, o, _ = ssh.exec_command('curl -s -k -I http://127.0.0.1:81/login.php')
print(o.read().decode('utf-8'))

print("Testing https://linhhoasu.lol/web-panel/login.php...")
_, o, _ = ssh.exec_command('curl -s -k -I https://linhhoasu.lol/web-panel/login.php')
print(o.read().decode('utf-8'))

ssh.close()
print("Deploy finished successfully!")

import os
import sys
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.104.165', username='root', password='anhduc11')

# 1. Backup remote files
print("Creating remote backups...")
ssh.exec_command('cp -p /linhhoasu/webgame/gm/assets/js/lucky-wheel.js /linhhoasu/webgame/gm/assets/js/lucky-wheel.js.bak_wheel_fix')
ssh.exec_command('cp -p /linhhoasu/webgame/gm/assets/css/lucky-wheel.css /linhhoasu/webgame/gm/assets/css/lucky-wheel.css.bak_wheel_fix')
ssh.exec_command('cp -p /linhhoasu/webgame/gm/assets/css/ui-refactor.css /linhhoasu/webgame/gm/assets/css/ui-refactor.css.bak_wheel_fix')

# 2. Upload updated files
print("Uploading updated files...")
sftp = ssh.open_sftp()
local_dir = r'i:\Linhhoasu\server\server\_ai_workbench\temp'
sftp.put(os.path.join(local_dir, 'lucky-wheel.js'), '/linhhoasu/webgame/gm/assets/js/lucky-wheel.js')
sftp.put(os.path.join(local_dir, 'lucky-wheel.css'), '/linhhoasu/webgame/gm/assets/css/lucky-wheel.css')
sftp.put(os.path.join(local_dir, 'ui-refactor.css'), '/linhhoasu/webgame/gm/assets/css/ui-refactor.css')
sftp.close()

# 3. Check permissions
ssh.exec_command('chmod 755 /linhhoasu/webgame/gm/assets/js/lucky-wheel.js /linhhoasu/webgame/gm/assets/css/lucky-wheel.css /linhhoasu/webgame/gm/assets/css/ui-refactor.css')

# 4. Ensure symlink on game assets
ssh.exec_command('mkdir -p /linhhoasu/webgame/game/assets/images && ln -sfn /linhhoasu/webgame/gm/assets/images/lucky-wheel /linhhoasu/webgame/game/assets/images/lucky-wheel')

# 5. Check curl response
print("Testing asset URLs...")
for asset in ['assets/js/lucky-wheel.js', 'assets/css/lucky-wheel.css', 'assets/css/ui-refactor.css']:
    cmd = f'curl -s -k -I https://linhhoasu.lol/web-panel/{asset}'
    _, o, _ = ssh.exec_command(cmd)
    first_line = o.read().decode('utf-8').splitlines()[0] if o else 'No response'
    print(f"{asset} -> {first_line}")

ssh.close()
print("Deploy finished successfully!")
